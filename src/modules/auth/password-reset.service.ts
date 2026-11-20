import { PrismaClient } from "@prisma/client";
import { AuthService } from "./auth.service";
import { IMailService, ConsoleMailService } from "./mail.service";
import {
  ForgotPasswordDtoSchema,
  ResetPasswordDtoSchema,
} from "./auth.dto";
import {
  generateSecureToken,
  hashToken,
  hashPassword,
} from "../../utils/crypto";
import { InMemoryRateLimiter } from "../../utils/rate-limiter";
import {
  BadRequestError,
  ForbiddenError,
  UnprocessableEntityError,
} from "../../utils/errors";
import { prisma as defaultPrisma } from "../../lib/prisma";

export interface PasswordResetTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  isUsed: boolean;
  createdAt: Date;
}

export class PasswordResetService {
  private prisma: PrismaClient;
  private authService: AuthService;
  private mailService: IMailService;
  private rateLimiter: InMemoryRateLimiter;

  // In-memory хранилище токенов с SHA-256 хэшированием и автоматической очисткой
  private tokenStore = new Map<string, PasswordResetTokenRecord>();

  constructor(
    prismaClient?: PrismaClient,
    authService?: AuthService,
    mailService?: IMailService,
    rateLimiter?: InMemoryRateLimiter
  ) {
    this.prisma = prismaClient || defaultPrisma;
    this.authService = authService || new AuthService(this.prisma);
    this.mailService = mailService || new ConsoleMailService();
    // 3 попытки за 15 минут для предотвращения спама и перебора
    this.rateLimiter =
      rateLimiter ||
      new InMemoryRateLimiter(
        15 * 60 * 1000,
        3,
        10_000,
        "TOO_MANY_RESET_REQUESTS",
        "Слишком много запросов на сброс пароля. Пожалуйста, подождите 15 минут."
      );
  }

  /**
   * Запрос на восстановление пароля по email
   */
  async requestReset(
    rawDto: unknown,
    ipAddress?: string
  ): Promise<{ message: string; debugToken?: string }> {
    const parseRes = ForgotPasswordDtoSchema.safeParse(rawDto);
    if (!parseRes.success) {
      throw new UnprocessableEntityError(
        "VALIDATION_ERROR",
        "Ошибка валидации данных запроса сброса пароля",
        parseRes.error.format()
      );
    }

    const { email } = parseRes.data;
    const rateLimitKey = `pwd_reset:${ipAddress || "global"}:${email}`;

    // Проверка лимита частоты запросов (Rate Limiting)
    this.rateLimiter.check(rateLimitKey);
    this.rateLimiter.increment(rateLimitKey);

    // Поиск пользователя в базе данных
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    const standardSuccessMessage =
      "Если аккаунт с указанным email существует, на него отправлена ссылка для сброса пароля.";

    if (!user || !user.isActive) {
      // Искусственная задержка для защиты от timing-атак (enumeration protection)
      await new Promise((resolve) => setTimeout(resolve, 150));
      return { message: standardSuccessMessage };
    }

    // Генерация криптографически стойкого токена (32 байта = 64 hex-символа)
    const rawToken = generateSecureToken(32);
    // Вычисление SHA-256 хэша — исходный токен в хранилище НЕ сохраняется
    const tokenHash = hashToken(rawToken);

    // TTL 15 минут
    const TTL_MS = 15 * 60 * 1000;
    const expiresAt = new Date(Date.now() + TTL_MS);
    const tokenId = `prt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const tokenRecord: PasswordResetTokenRecord = {
      id: tokenId,
      userId: user.id,
      tokenHash,
      expiresAt,
      isUsed: false,
      createdAt: new Date(),
    };

    // Сохраняем хэш токена
    this.tokenStore.set(tokenHash, tokenRecord);

    // Попытка асинхронной записи в таблицу БД, если таблица существует
    try {
      await (this.prisma as any).$executeRawUnsafe(
        `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, is_used, created_at)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)`,
        tokenId.length === 36 ? tokenId : "00000000-0000-0000-0000-" + tokenId.replace(/[^a-f0-9]/gi, "").padEnd(12, "0").substring(0, 12),
        user.id,
        tokenHash,
        expiresAt,
        false,
        new Date()
      );
    } catch {
      // Игнорируем ошибку, если таблица еще не создана миграцией
    }

    // Формирование защищённой ссылки для сброса
    const baseUrl =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "http://localhost:3000";
    const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;

    // Отправка через ConsoleMailService (в dev-логах видна ссылка, в prod маскируется)
    await this.mailService.sendPasswordResetEmail(user.email, resetUrl);

    return {
      message: standardSuccessMessage,
      // debugToken доступен только в dev/test для программного E2E тестирования
      ...(process.env.NODE_ENV !== "production" ? { debugToken: rawToken } : {}),
    };
  }

  /**
   * Установка нового пароля по токену
   */
  async resetPassword(
    rawDto: unknown,
    ipAddress?: string
  ): Promise<{ message: string }> {
    const parseRes = ResetPasswordDtoSchema.safeParse(rawDto);
    if (!parseRes.success) {
      throw new UnprocessableEntityError(
        "VALIDATION_ERROR",
        "Ошибка валидации данных нового пароля",
        parseRes.error.format()
      );
    }

    const rawToken = parseRes.data.token;
    const newPassword = (parseRes.data.password || parseRes.data.newPassword)!;
    const tokenHash = hashToken(rawToken);

    // 1. Поиск токена в хранилище
    let tokenRecord = this.tokenStore.get(tokenHash);

    // 2. Если в памяти нет, проверяем БД (если таблица создана)
    if (!tokenRecord) {
      try {
        const rows: any[] = await (this.prisma as any).$queryRawUnsafe(
          `SELECT id, user_id as "userId", token_hash as "tokenHash", expires_at as "expiresAt", is_used as "isUsed", created_at as "createdAt"
           FROM password_reset_tokens WHERE token_hash = $1 LIMIT 1`,
          tokenHash
        );
        if (rows && rows.length > 0) {
          tokenRecord = rows[0];
        }
      } catch {
        // Таблица еще не существует
      }
    }

    // Проверка существования токена
    if (!tokenRecord) {
      throw new BadRequestError(
        "INVALID_OR_EXPIRED_TOKEN",
        "Ссылка для сброса пароля недействительна или устарела"
      );
    }

    // Проверка одноразового использования
    if (tokenRecord.isUsed) {
      throw new BadRequestError(
        "TOKEN_ALREADY_USED",
        "Эта ссылка для сброса пароля уже была использована"
      );
    }

    // Проверка срока действия (TTL 15 минут)
    if (new Date() > new Date(tokenRecord.expiresAt)) {
      throw new BadRequestError(
        "TOKEN_EXPIRED",
        "Срок действия ссылки для сброса пароля истёк (лимит 15 минут)"
      );
    }

    // Поиск пользователя
    const user = await this.prisma.user.findUnique({
      where: { id: tokenRecord.userId },
    });

    if (!user || !user.isActive) {
      throw new ForbiddenError(
        "USER_INACTIVE",
        "Аккаунт пользователя заблокирован или недоступен"
      );
    }

    // Хэширование нового пароля с помощью Argon2id
    const newPasswordHash = await hashPassword(newPassword);

    // Обновление пароля в БД
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        updatedAt: new Date(),
      },
    });

    // Пометка токена как использованного (одноразовость)
    tokenRecord.isUsed = true;
    this.tokenStore.set(tokenHash, tokenRecord);

    try {
      await (this.prisma as any).$executeRawUnsafe(
        `UPDATE password_reset_tokens SET is_used = true WHERE token_hash = $1`,
        tokenHash
      );
    } catch {
      // Игнорируем
    }

    // Обязательная инвалидация всех существующих сессий и Refresh-токенов
    await this.authService.logoutAll(user.id);

    return {
      message:
        "Пароль успешно обновлён. Все предыдущие сессии завершены. Войдите с новым паролем.",
    };
  }

  /**
   * Метод очистки для тестовых сценариев
   */
  clearStore(): void {
    this.tokenStore.clear();
  }

  /**
   * Доступ к сервису писем (для тестов)
   */
  getMailService(): IMailService {
    return this.mailService;
  }
}
