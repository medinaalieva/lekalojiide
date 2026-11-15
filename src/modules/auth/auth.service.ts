import * as crypto from "node:crypto";
import { PrismaClient, Role, User, UserSession } from "@prisma/client";
import { RegisterDto, RegisterDtoSchema, LoginDto, LoginDtoSchema, sanitizeUser, SafeUser } from "./auth.dto";
import { hashPassword, verifyPassword, generateSecureToken, hashToken } from "../../utils/crypto";
import { signAccessToken } from "../../utils/jwt";
import { ConflictError, UnauthorizedError, ForbiddenError, NotFoundError, UnprocessableEntityError } from "../../utils/errors";
import { InMemoryRateLimiter } from "../../utils/rate-limiter";
import { prisma as defaultPrisma } from "../../lib/prisma";

export interface SessionMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthResult {
  user: SafeUser;
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

export class AuthService {
  private prisma: PrismaClient;
  private rateLimiter: InMemoryRateLimiter;

  constructor(prismaClient?: PrismaClient, rateLimiter?: InMemoryRateLimiter) {
    this.prisma = prismaClient || defaultPrisma;
    this.rateLimiter = rateLimiter || new InMemoryRateLimiter();
  }

  /**
   * Регистрация нового покупателя с транзакционной гарантией целостности БД
   */
  async register(rawDto: unknown, metadata: SessionMetadata = {}): Promise<AuthResult> {
    const parseResult = RegisterDtoSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new UnprocessableEntityError("VALIDATION_ERROR", "Ошибка валидации данных регистрации", parseResult.error.format());
    }

    const dto = parseResult.data;

    // Проверка уникальности email
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictError("EMAIL_ALREADY_EXISTS", "Пользователь с таким email уже зарегистрирован");
    }

    // Хэширование пароля с помощью Argon2id
    const passwordHash = await hashPassword(dto.password);

    // Транзакционное создание пользователя и первой сессии для атомарности
    if (typeof this.prisma.$transaction === "function") {
      return this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: dto.email,
            passwordHash,
            firstName: dto.firstName,
            lastName: dto.lastName,
            phone: dto.phone,
            role: Role.CUSTOMER,
            isEmailVerified: false,
            isActive: true,
          },
        });

        return this.createSession(user.id, user.email, user.role, metadata, sanitizeUser(user), tx as unknown as PrismaClient);
      });
    }

    // Создание пользователя без транзакции (для простых mock-окружений)
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: Role.CUSTOMER,
        isEmailVerified: false,
        isActive: true,
      },
    });

    return this.createSession(user.id, user.email, user.role, metadata, sanitizeUser(user));
  }

  /**
   * Вход по email и паролю
   */
  async login(rawDto: unknown, metadata: SessionMetadata = {}): Promise<AuthResult> {
    const parseResult = LoginDtoSchema.safeParse(rawDto);
    if (!parseResult.success) {
      throw new UnprocessableEntityError("VALIDATION_ERROR", "Ошибка валидации данных входа", parseResult.error.format());
    }

    const dto = parseResult.data;
    const rateLimitKey = `${metadata.ipAddress || "ip"}:${dto.email}`;

    // Защита от brute-force перебора паролей
    this.rateLimiter.check(rateLimitKey);

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.passwordHash) {
      this.rateLimiter.increment(rateLimitKey);
      throw new UnauthorizedError("INVALID_CREDENTIALS", "Неверный email или пароль");
    }

    if (!user.isActive) {
      throw new ForbiddenError("ACCOUNT_SUSPENDED", "Учетная запись заблокирована администратором");
    }

    // Проверка пароля Argon2id
    const isPasswordValid = await verifyPassword(user.passwordHash, dto.password);
    if (!isPasswordValid) {
      this.rateLimiter.increment(rateLimitKey);
      throw new UnauthorizedError("INVALID_CREDENTIALS", "Неверный email или пароль");
    }

    // Сброс счетчика неудачных попыток при успешной аутентификации
    this.rateLimiter.reset(rateLimitKey);

    return this.createSession(user.id, user.email, user.role, metadata, sanitizeUser(user));
  }

  /**
   * Обновление пары токенов по Refresh-токену
   * - Атомарная ротация (Token Rotation) с защитой от race condition
   * - Обнаружение повторного использования (Reuse Detection) с немедленным отзывом сессии
   * - Подготовка токенов до фиксации в БД для исключения рассинхронизации при сбоях
   */
  async refresh(rawRefreshToken: string, metadata: SessionMetadata = {}): Promise<{ accessToken: string; refreshToken: string; user: SafeUser }> {
    if (!rawRefreshToken || typeof rawRefreshToken !== "string") {
      throw new UnauthorizedError("REFRESH_TOKEN_REQUIRED", "Отсутствует Refresh-токен");
    }

    const dotIndex = rawRefreshToken.indexOf(".");
    const sessionId = dotIndex !== -1 ? rawRefreshToken.substring(0, dotIndex) : null;
    const tokenHash = hashToken(rawRefreshToken);

    let session: (UserSession & { user: User }) | null = null;

    if (sessionId) {
      session = await this.prisma.userSession.findUnique({
        where: { id: sessionId },
        include: { user: true },
      });

      if (!session) {
        throw new UnauthorizedError("INVALID_REFRESH_TOKEN", "Недействительный Refresh-токен");
      }

      // Обнаружение повторного использования старого токена (Token Reuse Detection)
      if (session.refreshTokenHash !== tokenHash) {
        // Компрометация сессии! Немедленно аннулируем всю скомпрометированную сессию (RFC 6819)
        await this.prisma.userSession.update({
          where: { id: session.id },
          data: { isRevoked: true },
        });

        throw new UnauthorizedError(
          "REFRESH_TOKEN_REUSE_DETECTED",
          "Подозрение на компрометацию сессии: обнаружено повторное использование использованного токена. Сессия аннулирована в целях безопасности."
        );
      }
    } else {
      // Обратная совместимость с форматом без префикса sessionId
      session = await this.prisma.userSession.findUnique({
        where: { refreshTokenHash: tokenHash },
        include: { user: true },
      });

      if (!session) {
        throw new UnauthorizedError("INVALID_REFRESH_TOKEN", "Недействительный Refresh-токен");
      }
    }

    if (session.isRevoked || session.expiresAt < new Date()) {
      throw new UnauthorizedError("SESSION_EXPIRED", "Срок действия сессии истек или сессия отозвана");
    }

    if (!session.user.isActive) {
      throw new ForbiddenError("ACCOUNT_SUSPENDED", "Учетная запись заблокирована");
    }

    // Генерация нового токена и подпись Access Token ДО обновления в базе данных,
    // чтобы исключить сбой генерации токена после коммита в БД
    const newSecret = generateSecureToken(40);
    const newRefreshToken = `${session.id}.${newSecret}`;
    const newRefreshTokenHash = hashToken(newRefreshToken);

    const accessToken = signAccessToken({
      sub: session.user.id,
      email: session.user.email,
      role: session.user.role,
      sessionId: session.id,
    });

    // Атомарное обновление сессии в БД с проверкой условия совпадения текущего хэша
    const updateResult = await this.prisma.userSession.updateMany({
      where: {
        id: session.id,
        refreshTokenHash: tokenHash,
        isRevoked: false,
      },
      data: {
        refreshTokenHash: newRefreshTokenHash,
        lastActiveAt: new Date(),
        ipAddress: metadata.ipAddress || session.ipAddress,
        userAgent: metadata.userAgent || session.userAgent,
      },
    });

    if (updateResult.count === 0) {
      // Параллельный запрос уже успел обновить этот токен в то же мгновение
      throw new UnauthorizedError(
        "CONCURRENT_TOKEN_ROTATION",
        "Параллельная ротация токена. Повторите запрос с новым токеном."
      );
    }

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: sanitizeUser(session.user),
    };
  }

  /**
   * Завершение текущей сессии (Logout)
   */
  async logout(sessionId: string): Promise<void> {
    if (!sessionId) return;

    await this.prisma.userSession.updateMany({
      where: { id: sessionId },
      data: { isRevoked: true },
    });
  }

  /**
   * Завершение всех сессий пользователя
   */
  async logoutAll(userId: string, exceptSessionId?: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: {
        userId,
        isRevoked: false,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { isRevoked: true },
    });
  }

  /**
   * Получение списка активных сессий пользователя
   */
  async getUserSessions(userId: string, currentSessionId?: string) {
    const sessions = await this.prisma.userSession.findMany({
      where: {
        userId,
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastActiveAt: "desc" },
    });

    return sessions.map((s) => ({
      sessionId: s.id,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      lastActiveAt: s.lastActiveAt,
      isCurrent: s.id === currentSessionId,
    }));
  }

  /**
   * Отзыв конкретной сессии пользователем
   */
  async revokeSession(userId: string, targetSessionId: string): Promise<void> {
    const session = await this.prisma.userSession.findFirst({
      where: { id: targetSessionId, userId },
    });

    if (!session) {
      throw new NotFoundError("SESSION_NOT_FOUND", "Сессия не найдена");
    }

    await this.prisma.userSession.update({
      where: { id: targetSessionId },
      data: { isRevoked: true },
    });
  }

  /**
   * Получение данных текущего пользователя
   */
  async getMe(userId: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError("USER_NOT_FOUND", "Пользователь не найден");
    }

    return sanitizeUser(user);
  }

  /**
   * Приватный метод создания сессии
   */
  private async createSession(
    userId: string,
    email: string,
    role: Role,
    metadata: SessionMetadata,
    safeUser: SafeUser,
    client: PrismaClient = this.prisma
  ): Promise<AuthResult> {
    const sessionId = crypto.randomUUID();
    const tokenSecret = generateSecureToken(40);
    const rawRefreshToken = `${sessionId}.${tokenSecret}`;
    const refreshTokenHash = hashToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 дней

    const session = await client.userSession.create({
      data: {
        id: sessionId,
        userId,
        refreshTokenHash,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        expiresAt,
        isRevoked: false,
      },
    });

    const accessToken = signAccessToken({
      sub: userId,
      email,
      role,
      sessionId: session.id,
    });

    return {
      user: safeUser,
      accessToken,
      refreshToken: rawRefreshToken,
      sessionId: session.id,
    };
  }
}
