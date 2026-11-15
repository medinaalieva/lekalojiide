import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from "@nestjs/common";
import { FastifyReply } from "fastify";
import { AppError } from "../../utils/errors";

/**
 * Глобальный фильтр исключений NestJS.
 * Преобразует ошибки доменного слоя AppError в стандартизированный формат API_SPECIFICATION.md:
 * {
 *   success: false,
 *   error: { code, message, details },
 *   meta: { timestamp }
 * }
 */
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();

    if (exception instanceof AppError) {
      return reply.status(exception.statusCode).send({
        success: false,
        error: {
          code: exception.code,
          message: exception.message,
          details: exception.details ?? null,
        },
        meta: { timestamp: new Date().toISOString() },
      });
    }

    const errorStatus =
      typeof (exception as any)?.statusCode === "number"
        ? (exception as any).statusCode
        : typeof (exception as any)?.status === "number"
        ? (exception as any).status
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const errorCode =
      (exception as any)?.code && typeof (exception as any)?.code === "string"
        ? (exception as any).code
        : errorStatus === 400
        ? "BAD_REQUEST"
        : "INTERNAL_SERVER_ERROR";

    // Обработка непредвиденных серверных ошибок и системных исключений фреймворка
    return reply.status(errorStatus).send({
      success: false,
      error: {
        code: errorCode,
        message: exception instanceof Error ? exception.message : "Внутренняя ошибка сервера",
        details: null,
      },
      meta: { timestamp: new Date().toISOString() },
    });
  }
}
