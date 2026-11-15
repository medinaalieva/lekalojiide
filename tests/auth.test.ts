import test from "node:test";
import assert from "node:assert/strict";
import { Role } from "@prisma/client";
import { hashPassword, verifyPassword, generateSecureToken, hashToken } from "../src/utils/crypto";
import { signAccessToken, verifyAccessToken, getJwtSecret } from "../src/utils/jwt";
import { InMemoryRateLimiter } from "../src/utils/rate-limiter";
import { RegisterDtoSchema, LoginDtoSchema, sanitizeUser } from "../src/modules/auth/auth.dto";
import { AuthService } from "../src/modules/auth/auth.service";
import { AuthController } from "../src/modules/auth/auth.controller";
import { extractAuthUser, checkRolePermissions } from "../src/modules/auth/auth.guard";
import { getRefreshTokenCookieOptions, getClearCookieOptions, REFRESH_TOKEN_COOKIE_NAME } from "../src/utils/cookies";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
  UnauthorizedError,
  UnprocessableEntityError,
} from "../src/utils/errors";

// Mock-хранилище базы данных для изолированного тестирования AuthService
function createMockPrisma() {
  const users: any[] = [];
  const sessions: any[] = [];
  let userSeq = 1;
  let sessionSeq = 1;

  return {
    users,
    sessions,
    user: {
      async findUnique(args: { where: { email?: string; id?: string } }) {
        if (args.where.email) {
          return users.find((u) => u.email.toLowerCase() === args.where.email?.toLowerCase()) || null;
        }
        if (args.where.id) {
          return users.find((u) => u.id === args.where.id) || null;
        }
        return null;
      },
      async create(args: { data: any }) {
        const newUser = {
          id: args.data.id || `usr_${userSeq++}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...args.data,
        };
        users.push(newUser);
        return newUser;
      },
    },
    userSession: {
      async create(args: { data: any }) {
        const newSession = {
          id: args.data.id || `sess_${sessionSeq++}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastActiveAt: new Date(),
          isRevoked: false,
          ...args.data,
        };
        sessions.push(newSession);
        return newSession;
      },
      async findUnique(args: { where: { refreshTokenHash?: string; id?: string }; include?: { user?: boolean } }) {
        let match = null;
        if (args.where.id) {
          match = sessions.find((s) => s.id === args.where.id);
        } else if (args.where.refreshTokenHash) {
          match = sessions.find((s) => s.refreshTokenHash === args.where.refreshTokenHash);
        }
        if (!match) return null;
        if (args.include?.user) {
          const user = users.find((u) => u.id === match.userId);
          return { ...match, user };
        }
        return match;
      },
      async findFirst(args: { where: { id?: string; userId?: string } }) {
        return (
          sessions.find((s) => {
            if (args.where.id && s.id !== args.where.id) return false;
            if (args.where.userId && s.userId !== args.where.userId) return false;
            return true;
          }) || null
        );
      },
      async findMany(args: { where: { userId?: string; isRevoked?: boolean; expiresAt?: { gt?: Date } }; orderBy?: any }) {
        return sessions.filter((s) => {
          if (args.where.userId && s.userId !== args.where.userId) return false;
          if (args.where.isRevoked !== undefined && s.isRevoked !== args.where.isRevoked) return false;
          if (args.where.expiresAt?.gt && !(s.expiresAt > args.where.expiresAt.gt)) return false;
          return true;
        });
      },
      async update(args: { where: { id: string }; data: any }) {
        const session = sessions.find((s) => s.id === args.where.id);
        if (!session) throw new Error("Session not found in mock DB");
        Object.assign(session, args.data, { updatedAt: new Date() });
        return session;
      },
      async updateMany(args: { where: { id?: any; userId?: string; isRevoked?: boolean; refreshTokenHash?: string }; data: any }) {
        let count = 0;
        for (const s of sessions) {
          let match = true;
          if (args.where.id !== undefined) {
            if (typeof args.where.id === "string" && s.id !== args.where.id) match = false;
            if (typeof args.where.id === "object" && args.where.id.not && s.id === args.where.id.not) match = false;
          }
          if (args.where.refreshTokenHash !== undefined && s.refreshTokenHash !== args.where.refreshTokenHash) match = false;
          if (args.where.userId !== undefined && s.userId !== args.where.userId) match = false;
          if (args.where.isRevoked !== undefined && s.isRevoked !== args.where.isRevoked) match = false;
          if (match) {
            Object.assign(s, args.data, { updatedAt: new Date() });
            count++;
          }
        }
        return { count };
      },
    },
    async $transaction(cb: (tx: any) => Promise<any>) {
      return cb(this);
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Тестирование криптографических утилит (Argon2id, SHA-256, Random Tokens)
// ---------------------------------------------------------------------------
test("Crypto: Argon2id password hashing and verification", async () => {
  const plainPassword = "SuperSecurePassword123!";
  const hash = await hashPassword(plainPassword);

  assert.ok(hash.startsWith("$argon2id$"), "Хэш должен использовать формат Argon2id");
  assert.notStrictEqual(hash, plainPassword, "Хэш не должен совпадать с исходным паролем");

  const isValid = await verifyPassword(hash, plainPassword);
  assert.strictEqual(isValid, true, "Верификация корректного пароля должна быть успешной");

  const isInvalid = await verifyPassword(hash, "WrongPassword123!");
  assert.strictEqual(isInvalid, false, "Верификация неверного пароля должна возвращать false");
});

test("Crypto: High-entropy tokens and SHA-256 token hashing", () => {
  const token1 = generateSecureToken(40);
  const token2 = generateSecureToken(40);

  assert.strictEqual(token1.length, 80, "40 байт в hex должны составлять 80 символов");
  assert.notStrictEqual(token1, token2, "Два сгенерированных токена не должны совпадать");

  const hash1 = hashToken(token1);
  const hash2 = hashToken(token1);
  const hash3 = hashToken(token2);

  assert.strictEqual(hash1.length, 64, "SHA-256 хэш в hex должен составлять 64 символа");
  assert.strictEqual(hash1, hash2, "Хэш одного и того же токена должен быть детерминированным");
  assert.notStrictEqual(hash1, hash3, "Хэши разных токенов должны различаться");
});

// ---------------------------------------------------------------------------
// 2. Тестирование JWT генерации, валидации и безопасности конфигурации
// ---------------------------------------------------------------------------
test("JWT: Access token creation and verification", () => {
  const payload = {
    sub: "usr_1001",
    email: "customer@lekalo.kg",
    role: Role.CUSTOMER,
    sessionId: "sess_5001",
  };

  const token = signAccessToken(payload);
  assert.ok(typeof token === "string" && token.length > 20, "JWT токен должен быть непустой строкой");

  const decoded = verifyAccessToken(token);
  assert.strictEqual(decoded.sub, payload.sub);
  assert.strictEqual(decoded.email, payload.email);
  assert.strictEqual(decoded.role, payload.role);
  assert.strictEqual(decoded.sessionId, payload.sessionId);
  assert.ok(decoded.exp && decoded.iat, "JWT должен содержать exp и iat");
});

test("JWT: Reject invalid or malformed token", () => {
  assert.throws(
    () => verifyAccessToken("invalid.malformed.jwt"),
    (err: any) => err instanceof UnauthorizedError && err.code === "INVALID_TOKEN"
  );
});

test("JWT: Production environment requires strong JWT_SECRET", () => {
  const prevEnv = process.env.NODE_ENV;
  const prevSecret = process.env.JWT_SECRET;

  try {
    process.env.NODE_ENV = "production";

    // 1. Отсутствующий секрет в production
    delete process.env.JWT_SECRET;
    assert.throws(
      () => getJwtSecret(),
      /FATAL SECURITY CONFIGURATION/,
      "В production отсутствие JWT_SECRET должно выбрасывать фатальную ошибку"
    );

    // 2. Слишком короткий секрет (< 32 символов)
    process.env.JWT_SECRET = "too-short-secret";
    assert.throws(
      () => getJwtSecret(),
      /FATAL SECURITY CONFIGURATION/,
      "В production секрет короче 32 символов должен отклоняться"
    );

    // 3. Дефолтный placeholder-секрет
    process.env.JWT_SECRET = "lekalo-default-secret-that-is-long-enough-32-chars";
    assert.throws(
      () => getJwtSecret(),
      /FATAL SECURITY CONFIGURATION/,
      "Дефолтные placeholder-секреты должны отклоняться в production"
    );

    // 4. Валидный надежный секрет
    process.env.JWT_SECRET = "a-very-strong-production-cryptographic-secret-key-64-characters-long";
    assert.doesNotThrow(() => getJwtSecret());
  } finally {
    process.env.NODE_ENV = prevEnv;
    process.env.JWT_SECRET = prevSecret;
  }
});

// ---------------------------------------------------------------------------
// 3. Тестирование валидации DTO и сложности пароля
// ---------------------------------------------------------------------------
test("DTO: RegisterDto validation with password complexity", () => {
  const validData = {
    email: "User@example.com",
    password: "StrongPassword123!",
    firstName: "Айсулуу",
    lastName: "Бакирова",
    phone: "+996700123456",
  };
  const parsed = RegisterDtoSchema.safeParse(validData);
  assert.strictEqual(parsed.success, true);
  if (parsed.success) {
    assert.strictEqual(parsed.data.email, "user@example.com", "Email должен нормализоваться в lowercase");
  }

  // Слишком короткий пароль (< 8 символов)
  const shortPass = { ...validData, password: "Short1!" };
  assert.strictEqual(RegisterDtoSchema.safeParse(shortPass).success, false);

  // Пароль без цифр
  const noDigits = { ...validData, password: "OnlyLettersPassword!" };
  assert.strictEqual(RegisterDtoSchema.safeParse(noDigits).success, false);

  // Пароль без заглавных букв
  const noUpper = { ...validData, password: "onlylowercase123!" };
  assert.strictEqual(RegisterDtoSchema.safeParse(noUpper).success, false);

  // Некорректный email
  const badEmail = { ...validData, email: "invalid-email" };
  assert.strictEqual(RegisterDtoSchema.safeParse(badEmail).success, false);
});

test("DTO: Sanitize user never returns passwordHash", () => {
  const rawUser = {
    id: "usr_1",
    email: "test@lekalo.kg",
    passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$secret",
    firstName: "Бек",
    lastName: "Асанов",
    phone: "+996555112233",
    role: Role.CUSTOMER,
    isEmailVerified: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const safe = sanitizeUser(rawUser);
  assert.strictEqual("passwordHash" in safe, false, "В safeUser ни в коем случае не должно быть passwordHash");
  assert.strictEqual(safe.id, rawUser.id);
  assert.strictEqual(safe.email, rawUser.email);
});

// ---------------------------------------------------------------------------
// 4. Тестирование Rate Limiter (защита от brute-force и ограничение памяти)
// ---------------------------------------------------------------------------
test("Rate Limiter: Limits brute-force login attempts", () => {
  const limiter = new InMemoryRateLimiter(10_000, 3); // 3 попытки на 10 сек
  const key = "192.168.1.1:user@example.com";

  assert.doesNotThrow(() => limiter.check(key));
  limiter.increment(key);

  assert.doesNotThrow(() => limiter.check(key));
  limiter.increment(key);

  assert.doesNotThrow(() => limiter.check(key));
  limiter.increment(key);

  // 4-я попытка блокируется
  assert.throws(
    () => limiter.check(key),
    (err: any) => err instanceof TooManyRequestsError && err.code === "BRUTE_FORCE_PROTECTION"
  );

  limiter.reset(key);
  assert.doesNotThrow(() => limiter.check(key), "После сброса лимитер не должен блокировать");
});

test("Rate Limiter: Memory is strictly bounded to prevent DoS memory leak", () => {
  // Лимитер с жестким лимитом емкости в 5 записей
  const limiter = new InMemoryRateLimiter(60_000, 5, 5);

  // Симулируем попытку DoS-атаки: создание 20 разных ключей
  for (let i = 0; i < 20; i++) {
    limiter.increment(`ip-${i}:user-${i}@lekalo.kg`);
  }

  // Размер карты никогда не должен превышать maxEntries (5)
  assert.ok(limiter.size <= 5, `Размер карты памяти (${limiter.size}) не должен превышать 5 записей`);
});

// ---------------------------------------------------------------------------
// 5. Тестирование AuthService: Регистрация и Вход
// ---------------------------------------------------------------------------
test("AuthService: Register new user successfully", async () => {
  const mockPrisma = createMockPrisma();
  const service = new AuthService(mockPrisma as any);

  const result = await service.register({
    email: "customer@lekalo.kg",
    password: "StrongPassword123!",
    firstName: "Нурбек",
    lastName: "Ибраимов",
  }, { ipAddress: "127.0.0.1", userAgent: "TestAgent/1.0" });

  assert.ok(result.user);
  assert.strictEqual(result.user.email, "customer@lekalo.kg");
  assert.strictEqual(result.user.role, Role.CUSTOMER);
  assert.strictEqual("passwordHash" in (result.user as any), false);
  assert.ok(result.accessToken);
  assert.ok(result.refreshToken);
  assert.ok(result.sessionId);

  const dbUser = mockPrisma.users[0];
  assert.ok(dbUser.passwordHash.startsWith("$argon2id$"));
  const dbSession = mockPrisma.sessions[0];
  assert.strictEqual(dbSession.refreshTokenHash, hashToken(result.refreshToken));
  assert.strictEqual(dbSession.userId, dbUser.id);
});

test("AuthService: Register fails on duplicate email", async () => {
  const mockPrisma = createMockPrisma();
  const service = new AuthService(mockPrisma as any);

  await service.register({
    email: "duplicate@lekalo.kg",
    password: "StrongPassword123!",
  });

  await assert.rejects(
    async () => {
      await service.register({
        email: "DUPLICATE@lekalo.kg",
        password: "AnotherPassword123!",
      });
    },
    (err: any) => err instanceof ConflictError && err.code === "EMAIL_ALREADY_EXISTS"
  );
});

test("AuthService: Login successfully with correct credentials", async () => {
  const mockPrisma = createMockPrisma();
  const service = new AuthService(mockPrisma as any);

  await service.register({
    email: "buyer@lekalo.kg",
    password: "SecretPassword123!",
  });

  const loginResult = await service.login({
    email: "buyer@lekalo.kg",
    password: "SecretPassword123!",
  });

  assert.strictEqual(loginResult.user.email, "buyer@lekalo.kg");
  assert.ok(loginResult.accessToken);
  assert.ok(loginResult.refreshToken);
});

test("AuthService: Login fails on invalid password or non-existent user", async () => {
  const mockPrisma = createMockPrisma();
  const service = new AuthService(mockPrisma as any);

  await service.register({
    email: "buyer@lekalo.kg",
    password: "CorrectPassword123!",
  });

  await assert.rejects(
    async () => {
      await service.login({
        email: "buyer@lekalo.kg",
        password: "WrongPassword1!",
      });
    },
    (err: any) => err instanceof UnauthorizedError && err.code === "INVALID_CREDENTIALS"
  );

  await assert.rejects(
    async () => {
      await service.login({
        email: "nobody@lekalo.kg",
        password: "SomePassword123!",
      });
    },
    (err: any) => err instanceof UnauthorizedError && err.code === "INVALID_CREDENTIALS"
  );
});

test("AuthService: Login fails when user account is inactive/suspended", async () => {
  const mockPrisma = createMockPrisma();
  const service = new AuthService(mockPrisma as any);

  await service.register({
    email: "blocked@lekalo.kg",
    password: "Password123!",
  });

  mockPrisma.users[0].isActive = false;

  await assert.rejects(
    async () => {
      await service.login({
        email: "blocked@lekalo.kg",
        password: "Password123!",
      });
    },
    (err: any) => err instanceof ForbiddenError && err.code === "ACCOUNT_SUSPENDED"
  );
});

// ---------------------------------------------------------------------------
// 6. Тестирование Token Rotation, Race Condition и Token Reuse Detection
// ---------------------------------------------------------------------------
test("AuthService: Single-use Refresh Token rotation", async () => {
  const mockPrisma = createMockPrisma();
  const service = new AuthService(mockPrisma as any);

  const reg = await service.register({
    email: "refresh_test@lekalo.kg",
    password: "Password123!",
  });

  const firstRefreshToken = reg.refreshToken;

  const refreshResult1 = await service.refresh(firstRefreshToken);
  assert.ok(refreshResult1.accessToken);
  assert.ok(refreshResult1.refreshToken);
  assert.notStrictEqual(refreshResult1.refreshToken, firstRefreshToken, "Новый токен должен отличаться");
});

test("AuthService: Refresh Token Reuse Detection immediately revokes session", async () => {
  const mockPrisma = createMockPrisma();
  const service = new AuthService(mockPrisma as any);

  const reg = await service.register({
    email: "reuse_victim@lekalo.kg",
    password: "Password123!",
  });

  const oldToken = reg.refreshToken;

  // 1. Законная ротация: сессия получает новый токен
  const legitimateRefresh = await service.refresh(oldToken);
  const currentValidToken = legitimateRefresh.refreshToken;
  assert.strictEqual(mockPrisma.sessions[0].isRevoked, false);

  // 2. Злоумышленник пытается использовать старый токен (Token Reuse Attack)
  await assert.rejects(
    async () => {
      await service.refresh(oldToken);
    },
    (err: any) => err instanceof UnauthorizedError && err.code === "REFRESH_TOKEN_REUSE_DETECTED"
  );

  // 3. Проверка безопасности: сессия должна быть немедленно аннулирована в БД!
  assert.strictEqual(mockPrisma.sessions[0].isRevoked, true, "Сессия должна быть отозвана при обнаружении компрометации");

  // 4. Теперь даже актуальный токен более не действует, так как сессия аннулирована
  await assert.rejects(
    async () => {
      await service.refresh(currentValidToken);
    },
    (err: any) => err instanceof UnauthorizedError && err.code === "SESSION_EXPIRED"
  );
});

test("AuthService: Concurrent Refresh Token rotation prevents race condition", async () => {
  const mockPrisma = createMockPrisma();
  const service = new AuthService(mockPrisma as any);

  const reg = await service.register({
    email: "concurrent_test@lekalo.kg",
    password: "Password123!",
  });

  const tokenToRotate = reg.refreshToken;

  // Первый запрос успевает обновить токен
  const res1 = await service.refresh(tokenToRotate);
  assert.ok(res1.accessToken);

  // Параллельный запрос с тем же исходным токеном блокируется атомарно
  await assert.rejects(
    async () => {
      await service.refresh(tokenToRotate);
    },
    (err: any) =>
      err instanceof UnauthorizedError &&
      (err.code === "CONCURRENT_TOKEN_ROTATION" || err.code === "REFRESH_TOKEN_REUSE_DETECTED")
  );
});

test("AuthService: Refresh fails if session is expired", async () => {
  const mockPrisma = createMockPrisma();
  const service = new AuthService(mockPrisma as any);

  const reg = await service.register({
    email: "expired_session@lekalo.kg",
    password: "Password123!",
  });

  // Просрочиваем сессию
  mockPrisma.sessions[0].expiresAt = new Date(Date.now() - 1000);

  await assert.rejects(
    async () => {
      await service.refresh(reg.refreshToken);
    },
    (err: any) => err instanceof UnauthorizedError && err.code === "SESSION_EXPIRED"
  );
});

// ---------------------------------------------------------------------------
// 7. Тестирование Session Management, Logout и LogoutAll
// ---------------------------------------------------------------------------
test("AuthService: Logout revokes specific session", async () => {
  const mockPrisma = createMockPrisma();
  const service = new AuthService(mockPrisma as any);

  const reg = await service.register({
    email: "session_user@lekalo.kg",
    password: "Password123!",
  });

  const sessionsBefore = await service.getUserSessions(reg.user.id, reg.sessionId);
  assert.strictEqual(sessionsBefore.length, 1);
  assert.strictEqual(sessionsBefore[0].isCurrent, true);

  await service.logout(reg.sessionId);
  assert.strictEqual(mockPrisma.sessions[0].isRevoked, true);

  const sessionsAfter = await service.getUserSessions(reg.user.id);
  assert.strictEqual(sessionsAfter.length, 0);
});

test("AuthService: LogoutAll revokes all user sessions", async () => {
  const mockPrisma = createMockPrisma();
  const service = new AuthService(mockPrisma as any);

  const reg = await service.register({
    email: "multi_session@lekalo.kg",
    password: "Password123!",
  });

  // Вход со второго устройства
  const login2 = await service.login({
    email: "multi_session@lekalo.kg",
    password: "Password123!",
  });

  const activeSessions = await service.getUserSessions(reg.user.id);
  assert.strictEqual(activeSessions.length, 2);

  // Выход со всех устройств
  await service.logoutAll(reg.user.id);

  const remainingSessions = await service.getUserSessions(reg.user.id);
  assert.strictEqual(remainingSessions.length, 0);
});

test("AuthService: User cannot revoke someone else's session", async () => {
  const mockPrisma = createMockPrisma();
  const service = new AuthService(mockPrisma as any);

  const user1 = await service.register({ email: "user1@lekalo.kg", password: "Password123!" });
  const user2 = await service.register({ email: "user2@lekalo.kg", password: "Password123!" });

  await assert.rejects(
    async () => {
      await service.revokeSession(user1.user.id, user2.sessionId);
    },
    (err: any) => err instanceof NotFoundError && err.code === "SESSION_NOT_FOUND"
  );

  // Сессия пользователя 2 остается активной
  assert.strictEqual(mockPrisma.sessions[1].isRevoked, false);
});

// ---------------------------------------------------------------------------
// 8. Тестирование RBAC Guard
// ---------------------------------------------------------------------------
test("RBAC Guard: extractAuthUser validates Bearer header", () => {
  const token = signAccessToken({
    sub: "usr_admin",
    email: "admin@lekalo.kg",
    role: Role.ADMIN,
    sessionId: "sess_adm",
  });

  const user = extractAuthUser(`Bearer ${token}`);
  assert.strictEqual(user.sub, "usr_admin");
  assert.strictEqual(user.role, Role.ADMIN);

  assert.throws(
    () => extractAuthUser(undefined),
    (err: any) => err instanceof UnauthorizedError && err.code === "AUTH_TOKEN_REQUIRED"
  );

  assert.throws(
    () => extractAuthUser(`Basic ${token}`),
    (err: any) => err instanceof UnauthorizedError && err.code === "INVALID_AUTH_FORMAT"
  );
});

test("RBAC Guard: checkRolePermissions enforces access control", () => {
  assert.doesNotThrow(() => checkRolePermissions(Role.ADMIN, [Role.ADMIN, Role.CONTENT_MANAGER]));
  assert.doesNotThrow(() => checkRolePermissions(Role.CUSTOMER, [Role.CUSTOMER]));

  assert.throws(
    () => checkRolePermissions(Role.CUSTOMER, [Role.ADMIN]),
    (err: any) => err instanceof ForbiddenError && err.code === "INSUFFICIENT_PERMISSIONS"
  );
});

// ---------------------------------------------------------------------------
// 9. Тестирование Cookies Options (CSRF и безопасность)
// ---------------------------------------------------------------------------
test("Cookies: HttpOnly, SameSite=Lax and Secure attributes", () => {
  const refreshCookieOpts = getRefreshTokenCookieOptions();
  assert.strictEqual(refreshCookieOpts.httpOnly, true, "Кука должна быть HttpOnly против XSS");
  assert.strictEqual(refreshCookieOpts.sameSite, "lax", "Кука должна быть SameSite=Lax для защиты от CSRF и поддержки редиректов эквайринга");
  assert.strictEqual(refreshCookieOpts.path, "/", "Кука должна действовать для путей приложения");
  assert.strictEqual(refreshCookieOpts.maxAge, 30 * 24 * 60 * 60 * 1000);

  const clearCookieOpts = getClearCookieOptions();
  assert.strictEqual(clearCookieOpts.maxAge, 0, "Очищающая кука должна иметь maxAge: 0");
  assert.strictEqual(clearCookieOpts.httpOnly, true);
});

// ---------------------------------------------------------------------------
// 10. Тестирование AuthController (REST API Endpoints и HTTP ответы)
// ---------------------------------------------------------------------------
test("AuthController: register endpoint returns 201 and Set-Cookie", async () => {
  const mockPrisma = createMockPrisma();
  const service = new AuthService(mockPrisma as any);
  const controller = new AuthController(service);

  const res = await controller.register({
    body: {
      email: "api_customer@lekalo.kg",
      password: "StrongPassword123!",
      firstName: "Жылдыз",
    },
    headers: { "user-agent": "Mozilla/5.0" },
    ip: "10.0.0.1",
  });

  assert.strictEqual(res.status, 201);
  const body = res.body as any;
  assert.strictEqual(body.success, true);
  assert.strictEqual(body.data.user.email, "api_customer@lekalo.kg");
  assert.ok(body.data.accessToken);
  assert.ok(res.cookies && res.cookies.length > 0);
  assert.strictEqual(res.cookies[0].name, REFRESH_TOKEN_COOKIE_NAME);
  assert.ok(res.cookies[0].value.length > 20);
});

test("AuthController: login and logout flow with cookie clearing", async () => {
  const mockPrisma = createMockPrisma();
  const service = new AuthService(mockPrisma as any);
  const controller = new AuthController(service);

  await controller.register({
    body: { email: "test_flow@lekalo.kg", password: "StrongPassword123!" },
    headers: {},
  });

  const loginRes = await controller.login({
    body: { email: "test_flow@lekalo.kg", password: "StrongPassword123!" },
    headers: {},
  });

  assert.strictEqual(loginRes.status, 200);
  const loginBody = loginRes.body as any;
  const accessToken = loginBody.data.accessToken;
  const refreshToken = loginRes.cookies![0].value;

  const meRes = await controller.getMe({
    headers: { authorization: `Bearer ${accessToken}` },
  });
  assert.strictEqual(meRes.status, 200);
  assert.strictEqual((meRes.body as any).data.email, "test_flow@lekalo.kg");

  const refreshRes = await controller.refresh({
    headers: {},
    cookies: { [REFRESH_TOKEN_COOKIE_NAME]: refreshToken },
  });
  assert.strictEqual(refreshRes.status, 200);
  assert.ok((refreshRes.body as any).data.accessToken);

  const logoutRes = await controller.logout({
    headers: { authorization: `Bearer ${accessToken}` },
  });
  assert.strictEqual(logoutRes.status, 200);
  assert.strictEqual((logoutRes.body as any).success, true);
  assert.strictEqual(logoutRes.cookies![0].name, REFRESH_TOKEN_COOKIE_NAME);
  assert.strictEqual((logoutRes.cookies![0].options as any).maxAge, 0);
});

test("AuthController: logoutAll flow clears cookies and revokes all sessions", async () => {
  const mockPrisma = createMockPrisma();
  const service = new AuthService(mockPrisma as any);
  const controller = new AuthController(service);

  await controller.register({
    body: { email: "logout_all_flow@lekalo.kg", password: "StrongPassword123!" },
    headers: {},
  });

  const loginRes = await controller.login({
    body: { email: "logout_all_flow@lekalo.kg", password: "StrongPassword123!" },
    headers: {},
  });

  const accessToken = (loginRes.body as any).data.accessToken;

  const logoutAllRes = await controller.logoutAll({
    headers: { authorization: `Bearer ${accessToken}` },
  });

  assert.strictEqual(logoutAllRes.status, 200);
  assert.strictEqual((logoutAllRes.body as any).success, true);
  assert.strictEqual(logoutAllRes.cookies![0].name, REFRESH_TOKEN_COOKIE_NAME);
  assert.strictEqual((logoutAllRes.cookies![0].options as any).maxAge, 0);
  assert.strictEqual(mockPrisma.sessions.every((s) => s.isRevoked), true);
});

// ---------------------------------------------------------------------------
// 11. Дополнительные стресс-тесты, CSRF и тесты отказоустойчивости (TASK-004.2)
// ---------------------------------------------------------------------------
test("Rate Limiter: Cannot bypass active brute-force ban by flooding storage with dummy keys", () => {
  // Лимитер с емкостью всего 5 записей и порогом 3 попытки
  const limiter = new InMemoryRateLimiter(60_000, 3, 5);
  const targetKey = "192.168.1.50:victim@lekalo.kg";

  // 1. Атакующий совершает 3 неудачные попытки и получает блокировку
  limiter.increment(targetKey);
  limiter.increment(targetKey);
  limiter.increment(targetKey);

  // Проверяем, что блокировка активна
  assert.throws(
    () => limiter.check(targetKey),
    (err: any) => err instanceof TooManyRequestsError && err.code === "BRUTE_FORCE_PROTECTION"
  );

  // 2. Атакующий пытается сбросить блокировку, генерируя 20 фиктивных ключей для вытеснения
  for (let i = 0; i < 20; i++) {
    limiter.increment(`ip-${i}:fake-${i}@example.com`);
  }

  // 3. Блокировка жертвы НЕ ДОЛЖНА быть вытеснена!
  assert.throws(
    () => limiter.check(targetKey),
    (err: any) => err instanceof TooManyRequestsError && err.code === "BRUTE_FORCE_PROTECTION",
    "Активная блокировка не должна вытесняться спамом фиктивных ключей"
  );
});

test("AuthController: CSRF / Origin enforcement blocks unauthorized cross-site requests", async () => {
  const mockPrisma = createMockPrisma();
  const service = new AuthService(mockPrisma as any);
  const controller = new AuthController(service);

  const regRes = await controller.register({
    body: { email: "csrf_victim@lekalo.kg", password: "StrongPassword123!" },
    headers: {},
  });
  const refreshToken = regRes.cookies![0].value;

  // 1. Запрос с недоверенного стороннего сайта (Cross-Site Request Forgery)
  const maliciousRes = await controller.refresh({
    headers: { origin: "https://evil-hacker.com" },
    cookies: { [REFRESH_TOKEN_COOKIE_NAME]: refreshToken },
  });

  assert.strictEqual(maliciousRes.status, 403, "Запрос с недоверенного Origin должен отклоняться 403 Forbidden");
  assert.strictEqual((maliciousRes.body as any).error.code, "CSRF_VIOLATION");

  // 2. Запрос с легитимного домена магазина
  const legitimateRes = await controller.refresh({
    headers: { origin: "https://lekalo-zhiide.kg" },
    cookies: { [REFRESH_TOKEN_COOKIE_NAME]: refreshToken },
  });

  assert.strictEqual(legitimateRes.status, 200, "Запрос с доверенного Origin должен выполняться успешно");
});

test("AuthService: Multi-client concurrent Refresh Token race condition (5 parallel requests)", async () => {
  const mockPrisma = createMockPrisma();
  const service = new AuthService(mockPrisma as any);

  const reg = await service.register({
    email: "multi_concurrent@lekalo.kg",
    password: "StrongPassword123!",
  });

  const sharedToken = reg.refreshToken;

  // 5 параллельных асинхронных запросов на обновление одного и того же токена
  const results = await Promise.allSettled([
    service.refresh(sharedToken),
    service.refresh(sharedToken),
    service.refresh(sharedToken),
    service.refresh(sharedToken),
    service.refresh(sharedToken),
  ]);

  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");

  // Ровно 1 запрос должен завершиться успешно, а остальные 4 должны быть атомарно отклонены!
  assert.strictEqual(fulfilled.length, 1, "Ровно 1 параллельный запрос должен пройти ротацию токена");
  assert.strictEqual(rejected.length, 4, "Остальные 4 параллельных запроса должны быть отклонены");
});

test("AuthService: Pre-generation of Access Token ensures database consistency", async () => {
  const mockPrisma = createMockPrisma();
  const service = new AuthService(mockPrisma as any);

  const reg = await service.register({
    email: "resilience_test@lekalo.kg",
    password: "StrongPassword123!",
  });

  const token = reg.refreshToken;
  const sessionBefore = mockPrisma.sessions[0];
  const originalHash = sessionBefore.refreshTokenHash;

  // Выполняем ротацию
  const refreshRes = await service.refresh(token);
  assert.ok(refreshRes.accessToken);
  assert.ok(refreshRes.refreshToken);

  const sessionAfter = mockPrisma.sessions[0];
  assert.notStrictEqual(sessionAfter.refreshTokenHash, originalHash, "Хэш токена в БД должен обновиться");
});

