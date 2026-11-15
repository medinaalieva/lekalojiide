export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  maxAge: number;
  path: string;
}

export const REFRESH_TOKEN_COOKIE_NAME = "refreshToken";

/**
 * Настройки HttpOnly Cookie для долгоживущего Refresh-токена (30 дней).
 * Используется SameSite=Lax для обеспечения бесшовного возврата после оплаты через банк.
 */
export function getRefreshTokenCookieOptions(isProduction = process.env.NODE_ENV === "production"): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 дней в миллисекундах
    path: "/",
  };
}

/**
 * Настройки для безопасного удаления (очистки) Cookie при выходе
 */
export function getClearCookieOptions(isProduction = process.env.NODE_ENV === "production"): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  };
}
