import * as jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { UnauthorizedError } from "./errors";

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  sessionId: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

const ACCESS_TOKEN_EXPIRATION = (process.env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"]) || "15m";
const JWT_ISSUER = process.env.JWT_ISSUER || "lekalo-zhiide-api";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "lekalo-zhiide-client";

/**
 * Получение JWT_SECRET с обязательной валидацией безопасности в Production
 */
export function getJwtSecret(overrideSecret?: string): string {
  const secret = overrideSecret || process.env.JWT_SECRET;
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction) {
    if (
      !secret ||
      secret.trim().length < 32 ||
      secret.toLowerCase().includes("default") ||
      secret.toLowerCase().includes("change-me") ||
      secret.toLowerCase().includes("example")
    ) {
      throw new Error(
        "FATAL SECURITY CONFIGURATION: В production окружении обязательно должен быть задан криптостойкий JWT_SECRET длиной не менее 32 символов (без использования дефолтных значений)!"
      );
    }
    return secret;
  }

  // Для локальной разработки и тестов
  return secret || "lekalo-zhiide-dev-secret-at-least-32-chars-long";
}

/**
 * Валидация окружения JWT при запуске приложения (Startup Check)
 */
export function validateJwtEnvironment(): void {
  getJwtSecret();
}

/**
 * Подпись короткоживущего Access-токена (15 минут) с привязкой issuer и audience
 */
export function signAccessToken(payload: AccessTokenPayload, secretOverride?: string): string {
  const secret = getJwtSecret(secretOverride);
  const options: jwt.SignOptions = {
    expiresIn: ACCESS_TOKEN_EXPIRATION,
    algorithm: "HS256",
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  };
  return jwt.sign(payload, secret, options);
}

/**
 * Верификация Access-токена с обязательной проверкой подписи, алгоритма, issuer и audience
 */
export function verifyAccessToken(token: string, secretOverride?: string): AccessTokenPayload {
  const secret = getJwtSecret(secretOverride);
  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    return decoded as AccessTokenPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError("TOKEN_EXPIRED", "Срок действия токена истек");
    }
    throw new UnauthorizedError("INVALID_TOKEN", "Недействительный токен авторизации");
  }
}
