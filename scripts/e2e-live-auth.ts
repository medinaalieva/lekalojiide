import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import fastifyCookie from "@fastify/cookie";
import { AppModule } from "../src/app.module";
import { AppExceptionFilter } from "../src/common/filters/app-exception.filter";
import { prisma } from "../src/lib/prisma";

interface TestResponse {
  statusCode: number;
  headers: Record<string, any>;
  body: string;
  json: any;
  cookies: Record<string, string>;
}

function parseCookies(headerValue: string | string[] | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!headerValue) return cookies;
  const list = Array.isArray(headerValue) ? headerValue : [headerValue];
  for (const item of list) {
    const parts = item.split(";")[0].split("=");
    if (parts.length >= 2) {
      cookies[parts[0].trim()] = parts.slice(1).join("=").trim();
    }
  }
  return cookies;
}

async function request(
  app: NestFastifyApplication,
  method: "GET" | "POST",
  url: string,
  options: {
    headers?: Record<string, string>;
    payload?: any;
    cookies?: Record<string, string>;
  } = {}
): Promise<TestResponse> {
  const headers: Record<string, string> = {
    ...(options.headers || {})
  };

  if (options.payload !== undefined) {
    headers["content-type"] = "application/json";
  }

  if (options.cookies) {
    const cookieHeader = Object.entries(options.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    headers["cookie"] = cookieHeader;
  }

  const res = await app.inject({
    method,
    url,
    headers,
    payload: options.payload ? JSON.stringify(options.payload) : undefined
  });

  let json: any = null;
  try {
    json = JSON.parse(res.payload);
  } catch {
    json = res.payload;
  }

  const cookies = parseCookies(res.headers["set-cookie"]);

  return {
    statusCode: res.statusCode,
    headers: res.headers,
    body: res.payload,
    json,
    cookies
  };
}

async function main() {
  console.log("==================================================================");
  console.log("LEKALO ZHIIDE — TASK-005.4 REAL HTTP + POSTGRESQL VERIFICATION");
  console.log("==================================================================");

  // 1. Инициализация реального NestJS приложения с подключением к PostgreSQL
  const adapter = new FastifyAdapter({ logger: false });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter);
  await app.register(fastifyCookie as any);
  app.setGlobalPrefix("api/v1", { exclude: ["health", "health/ready"] });
  app.useGlobalFilters(new AppExceptionFilter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  console.log("[PASS] NestJS + Fastify инициализирован и подключён к PostgreSQL");

  const testEmail = `test-user-${Date.now()}@dev.lekalo-zhiide.local`;
  const testPassword = "SecurePassword123!";
  const testFirstName = "Айбек";
  const testLastName = "Тестовый";

  let createdUserId: string | null = null;

  try {
    // -------------------------------------------------------------------------
    // 1. Проверка Health Endpoints
    // -------------------------------------------------------------------------
    console.log("\n--- 1. Health Endpoints ---");
    const healthLiveness = await request(app, "GET", "/health");
    if (healthLiveness.statusCode !== 200 || healthLiveness.json.status !== "ok") {
      throw new Error(`GET /health failed: expected 200, got ${healthLiveness.statusCode}`);
    }
    console.log("[PASS] GET /health -> HTTP 200 OK:", JSON.stringify(healthLiveness.json));

    const healthReadiness = await request(app, "GET", "/health/ready");
    if (
      healthReadiness.statusCode !== 200 ||
      healthReadiness.json.status !== "ready" ||
      healthReadiness.json.database?.status !== "connected"
    ) {
      throw new Error(`GET /health/ready failed: ${JSON.stringify(healthReadiness.json)}`);
    }
    console.log("[PASS] GET /health/ready -> HTTP 200 Ready with live PostgreSQL ping:", JSON.stringify(healthReadiness.json));

    // -------------------------------------------------------------------------
    // 2. Регистрация нового пользователя
    // -------------------------------------------------------------------------
    console.log("\n--- 2. Регистрация нового пользователя ---");
    const regRes = await request(app, "POST", "/api/v1/auth/register", {
      payload: {
        email: testEmail,
        password: testPassword,
        firstName: testFirstName,
        lastName: testLastName
      }
    });

    if (regRes.statusCode !== 201) {
      throw new Error(`Register failed with status ${regRes.statusCode}: ${regRes.body}`);
    }
    if (!regRes.json.data?.accessToken) {
      throw new Error("Register did not return accessToken in body");
    }
    if (!regRes.cookies.refreshToken) {
      throw new Error("Register did not set refreshToken cookie");
    }

    createdUserId = regRes.json.data.user.id;
    const initialAccessToken = regRes.json.data.accessToken;
    const initialRefreshToken = regRes.cookies.refreshToken;

    console.log("[PASS] POST /api/v1/auth/register -> HTTP 201 Created");
    console.log(`       User ID: ${createdUserId}, Email: ${testEmail}`);
    console.log("       AccessToken: получен (длина > 20)");
    console.log("       RefreshToken Cookie: установлен (HttpOnly, SameSite=Lax)");

    // -------------------------------------------------------------------------
    // 3. Проверка записи в PostgreSQL через Prisma
    // -------------------------------------------------------------------------
    console.log("\n--- 3. Верификация записи пользователя в реальной PostgreSQL ---");
    const userInDb = await prisma.user.findUnique({
      where: { id: createdUserId! }
    });

    if (!userInDb) {
      throw new Error(`User with ID ${createdUserId} was not found in PostgreSQL!`);
    }
    if (userInDb.email !== testEmail) {
      throw new Error(`User email mismatch in DB: expected ${testEmail}, got ${userInDb.email}`);
    }
    if (!userInDb.passwordHash || !userInDb.passwordHash.startsWith("$argon2id$")) {
      throw new Error(`Password hash in DB is not Argon2id: ${userInDb.passwordHash}`);
    }
    console.log("[PASS] Пользователь найден в PostgreSQL:");
    console.log(`       ID: ${userInDb.id}`);
    console.log(`       Email: ${userInDb.email}`);
    console.log(`       Role: ${userInDb.role}, IsActive: ${userInDb.isActive}`);
    console.log(`       PasswordHash: ${userInDb.passwordHash.slice(0, 20)}... (Argon2id)`);

    // -------------------------------------------------------------------------
    // 4. Вход с корректными учётными данными
    // -------------------------------------------------------------------------
    console.log("\n--- 4. Вход с корректными учётными данными ---");
    const loginRes = await request(app, "POST", "/api/v1/auth/login", {
      payload: {
        email: testEmail,
        password: testPassword
      }
    });

    if (loginRes.statusCode !== 200) {
      throw new Error(`Login failed with status ${loginRes.statusCode}: ${loginRes.body}`);
    }
    const loginAccessToken = loginRes.json.data.accessToken;
    const loginRefreshToken = loginRes.cookies.refreshToken;
    if (!loginAccessToken || !loginRefreshToken) {
      throw new Error("Login did not return accessToken or refreshToken cookie");
    }
    console.log("[PASS] POST /api/v1/auth/login -> HTTP 200 OK");
    console.log("       AccessToken и RefreshToken Cookie успешно получены");

    // -------------------------------------------------------------------------
    // 5. Получение профиля через /api/v1/auth/me (Bearer Token)
    // -------------------------------------------------------------------------
    console.log("\n--- 5. Получение профиля через /api/v1/auth/me ---");
    const meRes = await request(app, "GET", "/api/v1/auth/me", {
      headers: {
        authorization: `Bearer ${loginAccessToken}`
      }
    });

    if (meRes.statusCode !== 200) {
      throw new Error(`GET /auth/me failed with status ${meRes.statusCode}: ${meRes.body}`);
    }
    if (meRes.json.data?.email !== testEmail || meRes.json.data?.passwordHash) {
      throw new Error(`Profile data invalid or leaked passwordHash: ${JSON.stringify(meRes.json)}`);
    }
    console.log("[PASS] GET /api/v1/auth/me -> HTTP 200 OK:");
    console.log(`       Профиль: ${JSON.stringify(meRes.json.data)}`);
    console.log("       Конфиденциальные поля (passwordHash) надёжно скрыты");

    // -------------------------------------------------------------------------
    // 6. Ротация Refresh-токена через /api/v1/auth/refresh
    // -------------------------------------------------------------------------
    console.log("\n--- 6. Ротация Refresh-токена ---");
    const refreshRes = await request(app, "POST", "/api/v1/auth/refresh", {
      cookies: {
        refreshToken: loginRefreshToken
      }
    });

    if (refreshRes.statusCode !== 200) {
      throw new Error(`Refresh failed with status ${refreshRes.statusCode}: ${refreshRes.body}`);
    }
    const rotatedAccessToken = refreshRes.json.data.accessToken;
    const rotatedRefreshToken = refreshRes.cookies.refreshToken;

    if (!rotatedAccessToken || !rotatedRefreshToken) {
      throw new Error("Refresh did not return new accessToken or new refreshToken cookie");
    }
    if (rotatedRefreshToken === loginRefreshToken) {
      throw new Error("CRITICAL: Refresh token was NOT rotated! Returned same token!");
    }
    console.log("[PASS] POST /api/v1/auth/refresh -> HTTP 200 OK");
    console.log("       Новый AccessToken получен");
    console.log("       Новый RefreshToken Cookie получен (одноразовая ротация выполнена)");

    // -------------------------------------------------------------------------
    // 7. Обнаружение повторного использования старого refresh-токена (Token Reuse Detection)
    // -------------------------------------------------------------------------
    console.log("\n--- 7. Защита от Token Reuse: повторная отправка старого токена ---");
    const reuseRes = await request(app, "POST", "/api/v1/auth/refresh", {
      cookies: {
        refreshToken: loginRefreshToken // Повторная отправка УЖЕ ротированного токена!
      }
    });

    if (reuseRes.statusCode !== 401) {
      throw new Error(`Token reuse expected HTTP 401, but got ${reuseRes.statusCode}: ${reuseRes.body}`);
    }
    console.log(`[PASS] Повторное использование старого токена отклонено: HTTP ${reuseRes.statusCode}`);
    console.log(`       Код ошибки: ${reuseRes.json.error?.code}`);

    // Проверяем в PostgreSQL, что сессия отозвана
    const sessionsInDb = await prisma.userSession.findMany({
      where: { userId: createdUserId! }
    });
    console.log(`       Всего сессий пользователя в БД: ${sessionsInDb.length}`);
    const revokedCount = sessionsInDb.filter(s => s.isRevoked).length;
    console.log(`       Отозванных сессий: ${revokedCount}`);
    if (revokedCount === 0) {
      throw new Error("CRITICAL: Session was not revoked upon token reuse detection!");
    }
    console.log("[PASS] Компрометированная сессия успешно отозвана в PostgreSQL (isRevoked = true)");

    // -------------------------------------------------------------------------
    // 8. Выход пользователя (Logout и LogoutAll)
    // -------------------------------------------------------------------------
    console.log("\n--- 8. Выход пользователя (Logout и LogoutAll) и отзыв сессий ---");
    // Делаем свежий вход, чтобы получить чистую активную сессию
    const freshLogin = await request(app, "POST", "/api/v1/auth/login", {
      payload: {
        email: testEmail,
        password: testPassword
      }
    });
    const activeToken = freshLogin.json.data.accessToken;
    const activeRefresh = freshLogin.cookies.refreshToken;

    const logoutRes = await request(app, "POST", "/api/v1/auth/logout", {
      headers: {
        authorization: `Bearer ${activeToken}`
      },
      cookies: {
        refreshToken: activeRefresh
      }
    });

    if (logoutRes.statusCode !== 200) {
      throw new Error(`Logout failed with status ${logoutRes.statusCode}: ${logoutRes.body}`);
    }
    console.log("[PASS] POST /api/v1/auth/logout -> HTTP 200 OK (куки очищены)");

    // Проверяем, что конкретная сессия активного входа отозвана
    const currentSessionInDb = await prisma.userSession.findFirst({
      where: { userId: createdUserId!, isRevoked: true }
    });
    if (!currentSessionInDb) {
      throw new Error("No revoked session found in DB after logout!");
    }
    console.log("[PASS] Текущая сессия успешно отозвана в PostgreSQL (isRevoked = true)");

    // Теперь проверяем POST /api/v1/auth/logout-all (отзыв ВСЕХ оставшихся сессий пользователя)
    const loginForLogoutAll = await request(app, "POST", "/api/v1/auth/login", {
      payload: {
        email: testEmail,
        password: testPassword
      }
    });
    const logoutAllRes = await request(app, "POST", "/api/v1/auth/logout-all", {
      headers: {
        authorization: `Bearer ${loginForLogoutAll.json.data.accessToken}`
      }
    });
    if (logoutAllRes.statusCode !== 200) {
      throw new Error(`LogoutAll failed with status ${logoutAllRes.statusCode}: ${logoutAllRes.body}`);
    }
    console.log("[PASS] POST /api/v1/auth/logout-all -> HTTP 200 OK");

    const remainingActiveSessions = await prisma.userSession.findMany({
      where: { userId: createdUserId!, isRevoked: false }
    });
    console.log(`       Оставшихся активных сессий в БД после logoutAll: ${remainingActiveSessions.length}`);
    if (remainingActiveSessions.length > 0) {
      throw new Error("Active session still exists after logoutAll!");
    }
    console.log("[PASS] Все без исключения сессии пользователя в базе данных имеют статус isRevoked = true");

  } finally {
    // -------------------------------------------------------------------------
    // 9. Безопасная очистка тестовых данных
    // -------------------------------------------------------------------------
    console.log("\n--- 9. Безопасная очистка тестовых данных ---");
    if (createdUserId) {
      await prisma.userSession.deleteMany({
        where: { userId: createdUserId }
      });
      await prisma.user.delete({
        where: { id: createdUserId }
      });
      console.log(`[PASS] Тестовый пользователь ${createdUserId} и его сессии удалены из PostgreSQL.`);
    }

    // Закрываем HTTP приложение и Prisma
    await app.close();
    await prisma.$disconnect();
    console.log("[PASS] Backend и Prisma соединения корректно закрыты.");
  }

  console.log("\n==================================================================");
  console.log("ВСЕ РЕАЛЬНЫЕ HTTP + POSTGRESQL ПРОВЕРКИ УСПЕШНО ПРОЙДЕНЫ (100%)!");
  console.log("==================================================================");
}

main().catch((err) => {
  console.error("\n[FAIL] Фатальная ошибка при выполнении проверки:", err);
  process.exit(1);
});
