import test from "node:test";
import assert from "node:assert/strict";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import fastifyCookie from "@fastify/cookie";
import { Module } from "@nestjs/common";
import { AuthHttpController } from "../src/modules/auth/auth-http.controller";
import { AuthService } from "../src/modules/auth/auth.service";
import { PasswordResetService } from "../src/modules/auth/password-reset.service";
import { PrismaService } from "../src/lib/prisma.service";
import { AppExceptionFilter } from "../src/common/filters/app-exception.filter";
import { REFRESH_TOKEN_COOKIE_NAME } from "../src/utils/cookies";
import { isAllowedOrigin } from "../src/config/http.config";

// Mock-хранилище базы данных для изолированного HTTP-тестирования контроллеров NestJS
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

async function createTestApp() {
  const mockPrisma = createMockPrisma();
  const mockPrismaService = { client: mockPrisma };

  @Module({
    controllers: [AuthHttpController],
    providers: [
      {
        provide: PrismaService,
        useValue: mockPrismaService,
      },
      {
        provide: AuthService,
        useFactory: () => new AuthService(mockPrisma as any),
      },
      {
        provide: PasswordResetService,
        useFactory: () => new PasswordResetService(mockPrisma as any, new AuthService(mockPrisma as any)),
      },
    ],
  })
  class TestAuthModule {}

  const adapter = new FastifyAdapter();
  const app = await NestFactory.create<NestFastifyApplication>(TestAuthModule, adapter, {
    logger: false,
  });

  await app.register(fastifyCookie as any);
  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new AppExceptionFilter());
  app.enableCors({
    origin: (origin, callback) => {
      callback(null, isAllowedOrigin(origin));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-CSRF-Token"],
    exposedHeaders: ["Set-Cookie"],
  });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return { app, mockPrisma };
}

test("HTTP Auth: POST /api/v1/auth/register creates user and returns 201 with Set-Cookie", async () => {
  const { app } = await createTestApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      email: "new_buyer@lekalo.kg",
      password: "StrongPassword123!",
      firstName: "Айсулуу",
      lastName: "Иманалиева",
    },
  });

  assert.strictEqual(response.statusCode, 201);
  const json = JSON.parse(response.body);
  assert.strictEqual(json.success, true);
  assert.strictEqual(json.data.user.email, "new_buyer@lekalo.kg");
  assert.ok(json.data.accessToken);

  // Проверка Set-Cookie заголовка
  const setCookie = response.headers["set-cookie"];
  assert.ok(setCookie);
  assert.ok(String(setCookie).includes(REFRESH_TOKEN_COOKIE_NAME));

  await app.close();
});

test("HTTP Auth: POST /api/v1/auth/register fails with 422 on invalid DTO", async () => {
  const { app } = await createTestApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      email: "not-an-email",
      password: "short",
    },
  });

  assert.strictEqual(response.statusCode, 422);
  const json = JSON.parse(response.body);
  assert.strictEqual(json.success, false);
  assert.strictEqual(json.error.code, "VALIDATION_ERROR");

  await app.close();
});

test("HTTP Auth: POST /api/v1/auth/login succeeds with 200 and fails with 401 on wrong password", async () => {
  const { app } = await createTestApp();

  // Регистрация
  await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email: "user@lekalo.kg", password: "Password123!" },
  });

  // Успешный вход
  const loginRes = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: "user@lekalo.kg", password: "Password123!" },
  });

  assert.strictEqual(loginRes.statusCode, 200);
  const loginJson = JSON.parse(loginRes.body);
  assert.strictEqual(loginJson.success, true);
  assert.ok(loginJson.data.accessToken);

  // Вход с неверным паролем -> 401
  const failRes = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: "user@lekalo.kg", password: "WrongPassword1!" },
  });

  assert.strictEqual(failRes.statusCode, 401);
  const failJson = JSON.parse(failRes.body);
  assert.strictEqual(failJson.error.code, "INVALID_CREDENTIALS");

  await app.close();
});

test("HTTP Auth: Refresh token rotation via cookies and logout flow", async () => {
  const { app } = await createTestApp();

  // 1. Регистрация
  const regRes = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email: "cookie_user@lekalo.kg", password: "Password123!" },
  });

  const regJson = JSON.parse(regRes.body);
  const accessToken = regJson.data.accessToken;

  // Извлекаем значение cookie refreshToken
  const setCookieHeader = String(regRes.headers["set-cookie"]);
  const cookieMatch = setCookieHeader.match(new RegExp(`${REFRESH_TOKEN_COOKIE_NAME}=([^;]+)`));
  assert.ok(cookieMatch, "Кука refreshToken должна присутствовать");
  const refreshTokenValue = cookieMatch[1];

  // 2. GET /me с Bearer токеном
  const meRes = await app.inject({
    method: "GET",
    url: "/api/v1/auth/me",
    headers: { authorization: `Bearer ${accessToken}` },
  });

  assert.strictEqual(meRes.statusCode, 200);
  const meJson = JSON.parse(meRes.body);
  assert.strictEqual(meJson.data.email, "cookie_user@lekalo.kg");

  // 3. POST /refresh с кукой
  const refreshRes = await app.inject({
    method: "POST",
    url: "/api/v1/auth/refresh",
    headers: { cookie: `${REFRESH_TOKEN_COOKIE_NAME}=${refreshTokenValue}` },
  });

  assert.strictEqual(refreshRes.statusCode, 200);
  const refreshJson = JSON.parse(refreshRes.body);
  assert.ok(refreshJson.data.accessToken);

  // 4. GET /sessions
  const sessionsRes = await app.inject({
    method: "GET",
    url: "/api/v1/auth/sessions",
    headers: { authorization: `Bearer ${accessToken}` },
  });

  assert.strictEqual(sessionsRes.statusCode, 200);
  const sessionsJson = JSON.parse(sessionsRes.body);
  assert.ok(sessionsJson.data.length >= 1);

  // 5. POST /logout
  const logoutRes = await app.inject({
    method: "POST",
    url: "/api/v1/auth/logout",
    headers: { authorization: `Bearer ${accessToken}` },
  });

  assert.strictEqual(logoutRes.statusCode, 200);
  const logoutSetCookie = String(logoutRes.headers["set-cookie"]);
  assert.ok(logoutSetCookie.includes("Max-Age=0") || logoutSetCookie.includes("Expires=Thu, 01 Jan 1970"));

  await app.close();
});

test("HTTP Auth: CSRF / Origin violation returns 403 Forbidden", async () => {
  const { app } = await createTestApp();

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    headers: { origin: "https://evil-unauthorized-site.com" },
    payload: {
      email: "csrf_test@lekalo.kg",
      password: "Password123!",
    },
  });

  assert.strictEqual(response.statusCode, 403);
  const json = JSON.parse(response.body);
  assert.strictEqual(json.success, false);
  assert.strictEqual(json.error.code, "CSRF_VIOLATION");

  await app.close();
});

test("HTTP Auth: Allowed Production Origin (https://lekalojiide.vercel.app) passes CORS and CSRF", async () => {
  const { app } = await createTestApp();

  // 1. Проверка preflight OPTIONS
  const optionsRes = await app.inject({
    method: "OPTIONS",
    url: "/api/v1/auth/register",
    headers: {
      origin: "https://lekalojiide.vercel.app",
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    },
  });
  assert.strictEqual(optionsRes.statusCode, 204);
  assert.strictEqual(optionsRes.headers["access-control-allow-origin"], "https://lekalojiide.vercel.app");

  // 2. Проверка POST-запроса регистрации с продакшн Origin
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    headers: { origin: "https://lekalojiide.vercel.app" },
    payload: {
      email: "production_allowed@lekalo.kg",
      password: "Password123!",
      fullName: "Production User",
    },
  });

  assert.strictEqual(response.statusCode, 201);
  const json = JSON.parse(response.body);
  assert.strictEqual(json.success, true);
  assert.strictEqual(response.headers["access-control-allow-origin"], "https://lekalojiide.vercel.app");

  await app.close();
});
