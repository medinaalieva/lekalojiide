import { Role } from "@prisma/client";
import { verifyAccessToken, AccessTokenPayload } from "../../utils/jwt";
import { ForbiddenError, UnauthorizedError } from "../../utils/errors";

/**
 * Проверка заголовка Authorization и извлечение данных пользователя
 */
export function extractAuthUser(authHeader?: string): AccessTokenPayload {
  if (!authHeader) {
    throw new UnauthorizedError("AUTH_TOKEN_REQUIRED", "Отсутствует заголовок авторизации");
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    throw new UnauthorizedError("INVALID_AUTH_FORMAT", "Неверный формат заголовка (ожидается Bearer <token>)");
  }

  return verifyAccessToken(parts[1]);
}

/**
 * Серверная проверка прав доступа по ролям (RBAC Guard)
 */
export function checkRolePermissions(currentRole: Role, allowedRoles: Role[]): void {
  if (!allowedRoles.includes(currentRole)) {
    throw new ForbiddenError(
      "INSUFFICIENT_PERMISSIONS",
      `Доступ запрещен. Требуется роль: ${allowedRoles.join(" или ")}`
    );
  }
}
