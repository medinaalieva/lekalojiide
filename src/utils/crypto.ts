import * as argon2 from "argon2";
import * as crypto from "node:crypto";

/**
 * Криптографические параметры Argon2id в соответствии с рекомендациями OWASP
 */
const ARGON2_OPTIONS = {
  type: 2 as const,  // argon2.argon2id
  memoryCost: 65536, // 64 MB
  timeCost: 3,       // 3 итерации
  parallelism: 4,    // 4 параллельных потока
};

/**
 * Безопасное хэширование пароля с использованием алгоритма Argon2id
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

/**
 * Проверка соответствия пароля и хэша Argon2id
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Генерация криптографически стойкого Refresh-токена высокой энтропии
 */
export function generateSecureToken(byteLength = 40): string {
  return crypto.randomBytes(byteLength).toString("hex");
}

/**
 * Вычисление криптографического хэша SHA-256 для безопасного хранения токенов в БД.
 * Исходный Refresh-токен никогда не сохраняется в открытом виде.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
