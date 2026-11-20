import { AuthService } from "./auth.service";
import { PasswordResetService } from "./password-reset.service";
import { extractAuthUser, checkRolePermissions } from "./auth.guard";
import { getRefreshTokenCookieOptions, getClearCookieOptions, REFRESH_TOKEN_COOKIE_NAME } from "../../utils/cookies";
import { AppError, ForbiddenError } from "../../utils/errors";
import { isAllowedOrigin } from "../../config/http.config";
import { Role } from "@prisma/client";

export interface HttpRequest {
  body?: unknown;
  headers: Record<string, string | undefined>;
  cookies?: Record<string, string | undefined>;
  ip?: string;
  params?: Record<string, string>;
}

export interface HttpResponse {
  status: number;
  body: unknown;
  cookies?: Array<{ name: string; value: string; options: object }>;
}

export class AuthController {
  private passwordResetService: PasswordResetService;

  constructor(
    private authService: AuthService,
    passwordResetService?: PasswordResetService
  ) {
    this.passwordResetService =
      passwordResetService || new PasswordResetService(undefined, this.authService);
  }

  /**
   * POST /api/v1/auth/forgot-password
   */
  async forgotPassword(req: HttpRequest): Promise<HttpResponse> {
    try {
      const origin = req.headers["origin"] || req.headers["referer"];
      if (origin && !isAllowedOrigin(origin)) {
        throw new ForbiddenError("CSRF_VIOLATION", "Запрос отклонен политикой CORS/CSRF");
      }

      const result = await this.passwordResetService.requestReset(
        req.body,
        req.ip || req.headers["x-forwarded-for"]
      );

      return {
        status: 200,
        body: {
          success: true,
          data: result,
          meta: { timestamp: new Date().toISOString() },
        },
      };
    } catch (err) {
      return this.handleError(err);
    }
  }

  /**
   * POST /api/v1/auth/reset-password
   */
  async resetPassword(req: HttpRequest): Promise<HttpResponse> {
    try {
      const origin = req.headers["origin"] || req.headers["referer"];
      if (origin && !isAllowedOrigin(origin)) {
        throw new ForbiddenError("CSRF_VIOLATION", "Запрос отклонен политикой CORS/CSRF");
      }

      const result = await this.passwordResetService.resetPassword(
        req.body,
        req.ip || req.headers["x-forwarded-for"]
      );

      return {
        status: 200,
        body: {
          success: true,
          data: result,
          meta: { timestamp: new Date().toISOString() },
        },
      };
    } catch (err) {
      return this.handleError(err);
    }
  }

  /**
   * POST /api/v1/auth/register
   */
  async register(req: HttpRequest): Promise<HttpResponse> {
    try {
      const result = await this.authService.register(req.body, {
        ipAddress: req.ip || req.headers["x-forwarded-for"],
        userAgent: req.headers["user-agent"],
      });

      return {
        status: 201,
        body: {
          success: true,
          data: {
            user: result.user,
            accessToken: result.accessToken,
          },
          meta: { timestamp: new Date().toISOString() },
        },
        cookies: [
          {
            name: REFRESH_TOKEN_COOKIE_NAME,
            value: result.refreshToken,
            options: getRefreshTokenCookieOptions(),
          },
        ],
      };
    } catch (err) {
      return this.handleError(err);
    }
  }

  /**
   * POST /api/v1/auth/login
   */
  async login(req: HttpRequest): Promise<HttpResponse> {
    try {
      const result = await this.authService.login(req.body, {
        ipAddress: req.ip || req.headers["x-forwarded-for"],
        userAgent: req.headers["user-agent"],
      });

      return {
        status: 200,
        body: {
          success: true,
          data: {
            user: result.user,
            accessToken: result.accessToken,
          },
          meta: { timestamp: new Date().toISOString() },
        },
        cookies: [
          {
            name: REFRESH_TOKEN_COOKIE_NAME,
            value: result.refreshToken,
            options: getRefreshTokenCookieOptions(),
          },
        ],
      };
    } catch (err) {
      return this.handleError(err);
    }
  }

  /**
   * POST /api/v1/auth/refresh
   */
  async refresh(req: HttpRequest): Promise<HttpResponse> {
    try {
      const origin = req.headers["origin"] || req.headers["referer"];
      if (origin && !isAllowedOrigin(origin)) {
        throw new ForbiddenError("CSRF_VIOLATION", "Запрос отклонен политикой CORS/CSRF");
      }

      const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE_NAME];
      const result = await this.authService.refresh(refreshToken || "", {
        ipAddress: req.ip || req.headers["x-forwarded-for"],
        userAgent: req.headers["user-agent"],
      });

      return {
        status: 200,
        body: {
          success: true,
          data: {
            accessToken: result.accessToken,
            user: result.user,
          },
          meta: { timestamp: new Date().toISOString() },
        },
        cookies: [
          {
            name: REFRESH_TOKEN_COOKIE_NAME,
            value: result.refreshToken,
            options: getRefreshTokenCookieOptions(),
          },
        ],
      };
    } catch (err) {
      return this.handleError(err);
    }
  }

  /**
   * POST /api/v1/auth/logout
   */
  async logout(req: HttpRequest): Promise<HttpResponse> {
    try {
      const origin = req.headers["origin"] || req.headers["referer"];
      if (origin && !isAllowedOrigin(origin)) {
        throw new ForbiddenError("CSRF_VIOLATION", "Запрос отклонен политикой CORS/CSRF");
      }

      try {
        if (req.headers["authorization"]) {
          const user = extractAuthUser(req.headers["authorization"]);
          if (user?.sessionId) {
            await this.authService.logout(user.sessionId);
          }
        }
      } catch {
        // Even if token expired or missing, proceed to clear cookies
      }

      return {
        status: 200,
        body: {
          success: true,
          data: { message: "Успешный выход из системы" },
          meta: { timestamp: new Date().toISOString() },
        },
        cookies: [
          {
            name: REFRESH_TOKEN_COOKIE_NAME,
            value: "",
            options: getClearCookieOptions(),
          },
        ],
      };
    } catch (err) {
      return this.handleError(err);
    }
  }

  /**
   * POST /api/v1/auth/logout-all
   */
  async logoutAll(req: HttpRequest): Promise<HttpResponse> {
    try {
      const origin = req.headers["origin"] || req.headers["referer"];
      if (origin && !isAllowedOrigin(origin)) {
        throw new ForbiddenError("CSRF_VIOLATION", "Запрос отклонен политикой CORS/CSRF");
      }

      const user = extractAuthUser(req.headers["authorization"]);
      await this.authService.logoutAll(user.sub);

      return {
        status: 200,
        body: {
          success: true,
          data: { message: "Все активные сессии успешно завершены" },
          meta: { timestamp: new Date().toISOString() },
        },
        cookies: [
          {
            name: REFRESH_TOKEN_COOKIE_NAME,
            value: "",
            options: getClearCookieOptions(),
          },
        ],
      };
    } catch (err) {
      return this.handleError(err);
    }
  }

  /**
   * GET /api/v1/auth/me
   */
  async getMe(req: HttpRequest): Promise<HttpResponse> {
    try {
      const authUser = extractAuthUser(req.headers["authorization"]);
      const user = await this.authService.getMe(authUser.sub);

      return {
        status: 200,
        body: {
          success: true,
          data: user,
          meta: { timestamp: new Date().toISOString() },
        },
      };
    } catch (err) {
      return this.handleError(err);
    }
  }

  /**
   * GET /api/v1/auth/sessions
   */
  async getSessions(req: HttpRequest): Promise<HttpResponse> {
    try {
      const authUser = extractAuthUser(req.headers["authorization"]);
      const sessions = await this.authService.getUserSessions(authUser.sub, authUser.sessionId);

      return {
        status: 200,
        body: {
          success: true,
          data: sessions,
          meta: { timestamp: new Date().toISOString() },
        },
      };
    } catch (err) {
      return this.handleError(err);
    }
  }

  /**
   * DELETE /api/v1/auth/sessions/:id
   */
  async revokeSession(req: HttpRequest): Promise<HttpResponse> {
    try {
      const authUser = extractAuthUser(req.headers["authorization"]);
      const targetSessionId = req.params?.id;
      if (!targetSessionId) {
        return {
          status: 400,
          body: {
            success: false,
            error: { code: "PARAM_REQUIRED", message: "Идентификатор сессии обязателен" },
          },
        };
      }

      await this.authService.revokeSession(authUser.sub, targetSessionId);

      return {
        status: 200,
        body: {
          success: true,
          data: { message: "Сессия успешно отозвана" },
          meta: { timestamp: new Date().toISOString() },
        },
      };
    } catch (err) {
      return this.handleError(err);
    }
  }

  /**
   * Проверка доступа администратора (RBAC)
   */
  checkAdminAccess(req: HttpRequest): void {
    const authUser = extractAuthUser(req.headers["authorization"]);
    checkRolePermissions(authUser.role, [Role.ADMIN]);
  }

  private handleError(err: unknown): HttpResponse {
    if (err instanceof AppError) {
      return {
        status: err.statusCode,
        body: {
          success: false,
          error: {
            code: err.code,
            message: err.message,
            details: err.details,
          },
          meta: { timestamp: new Date().toISOString() },
        },
      };
    }

    return {
      status: 500,
      body: {
        success: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Внутренняя ошибка сервера",
          details: null,
        },
        meta: { timestamp: new Date().toISOString() },
      },
    };
  }
}
