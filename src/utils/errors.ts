/**
 * Типизированные ошибки приложения в соответствии с API_SPECIFICATION.md
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details: unknown = null
  ) {
    super(message);
    this.name = "AppError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BadRequestError extends AppError {
  constructor(code: string, message: string, details: unknown = null) {
    super(400, code, message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(code = "UNAUTHORIZED", message = "Требуется авторизация") {
    super(401, code, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(code = "FORBIDDEN", message = "Недостаточно прав доступа") {
    super(403, code, message);
  }
}

export class NotFoundError extends AppError {
  constructor(code = "NOT_FOUND", message = "Ресурс не найден") {
    super(404, code, message);
  }
}

export class ConflictError extends AppError {
  constructor(code = "CONFLICT", message = "Конфликт данных") {
    super(409, code, message);
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(code = "VALIDATION_ERROR", message = "Ошибка валидации входных данных", details: unknown = null) {
    super(422, code, message, details);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(code = "RATE_LIMIT_EXCEEDED", message = "Слишком много запросов. Попробуйте позже.") {
    super(429, code, message);
  }
}

export class InternalServerError extends AppError {
  constructor(code = "INTERNAL_SERVER_ERROR", message = "Внутренняя ошибка сервера", details: unknown = null) {
    super(500, code, message, details);
  }
}
