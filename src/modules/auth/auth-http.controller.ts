import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Req,
  Res,
  Param,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { FastifyRequest, FastifyReply } from "fastify";
import { AuthService } from "./auth.service";
import { PasswordResetService } from "./password-reset.service";
import { extractAuthUser } from "./auth.guard";
import {
  getRefreshTokenCookieOptions,
  getClearCookieOptions,
  REFRESH_TOKEN_COOKIE_NAME,
} from "../../utils/cookies";
import { isAllowedOrigin } from "../../config/http.config";
import { ForbiddenError } from "../../utils/errors";

/**
 * NestJS HTTP-контроллер аутентификации и сессий (Fastify Engine).
 * Делегирует выполнение существующему AuthService, обеспечивая строгое соответствие API_SPECIFICATION.md.
 */
@Controller("auth")
export class AuthHttpController {
  private resetService: PasswordResetService;

  constructor(
    private readonly authService: AuthService,
    passwordResetService?: PasswordResetService
  ) {
    this.resetService =
      passwordResetService || new PasswordResetService(undefined, this.authService);
  }

  /**
   * POST /api/v1/auth/forgot-password
   * Запрос на восстановление пароля по email
   */
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body() body: unknown,
    @Req() req: FastifyRequest
  ) {
    this.checkOrigin(req);
    const result = await this.resetService.requestReset(body, this.getIp(req));
    return {
      success: true,
      data: result,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * POST /api/v1/auth/reset-password
   * Установка нового пароля по одноразовому криптографическому токену
   */
  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() body: unknown,
    @Req() req: FastifyRequest
  ) {
    this.checkOrigin(req);
    const result = await this.resetService.resetPassword(body, this.getIp(req));
    return {
      success: true,
      data: result,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * POST /api/v1/auth/register
   * Регистрация нового покупателя
   */
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() body: unknown,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    this.checkOrigin(req);

    const result = await this.authService.register(body, {
      ipAddress: this.getIp(req),
      userAgent: req.headers["user-agent"],
    });

    this.setRefreshCookie(reply, result.refreshToken);

    return {
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * POST /api/v1/auth/login
   * Вход по email и паролю
   */
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: unknown,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    this.checkOrigin(req);

    const result = await this.authService.login(body, {
      ipAddress: this.getIp(req),
      userAgent: req.headers["user-agent"],
    });

    this.setRefreshCookie(reply, result.refreshToken);

    return {
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * POST /api/v1/auth/refresh
   * Обновление пары токенов по HttpOnly Refresh-cookie
   */
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    this.checkOrigin(req);

    // Извлечение refresh-токена из cookies Fastify или заголовка
    const cookies = (req as any).cookies || {};
    const refreshToken = cookies[REFRESH_TOKEN_COOKIE_NAME];

    const result = await this.authService.refresh(refreshToken || "", {
      ipAddress: this.getIp(req),
      userAgent: req.headers["user-agent"],
    });

    this.setRefreshCookie(reply, result.refreshToken);

    return {
      success: true,
      data: {
        accessToken: result.accessToken,
        user: result.user,
      },
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * POST /api/v1/auth/logout
   * Завершение текущей сессии
   */
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    this.checkOrigin(req);

    const authUser = extractAuthUser(req.headers["authorization"]);
    await this.authService.logout(authUser.sessionId);

    this.clearRefreshCookie(reply);

    return {
      success: true,
      data: { message: "Успешный выход из системы" },
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * POST /api/v1/auth/logout-all
   * Завершение всех сессий пользователя
   */
  @Post("logout-all")
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    this.checkOrigin(req);

    const authUser = extractAuthUser(req.headers["authorization"]);
    await this.authService.logoutAll(authUser.sub);

    this.clearRefreshCookie(reply);

    return {
      success: true,
      data: { message: "Все активные сессии успешно завершены" },
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * GET /api/v1/auth/me
   * Получение данных текущего авторизованного пользователя
   */
  @Get("me")
  @HttpCode(HttpStatus.OK)
  async getMe(@Req() req: FastifyRequest) {
    const authUser = extractAuthUser(req.headers["authorization"]);
    const user = await this.authService.getMe(authUser.sub);

    return {
      success: true,
      data: user,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * GET /api/v1/auth/sessions
   * Получение списка активных сессий пользователя
   */
  @Get("sessions")
  @HttpCode(HttpStatus.OK)
  async getSessions(@Req() req: FastifyRequest) {
    const authUser = extractAuthUser(req.headers["authorization"]);
    const sessions = await this.authService.getUserSessions(authUser.sub, authUser.sessionId);

    return {
      success: true,
      data: sessions,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * DELETE /api/v1/auth/sessions/:id
   * Отзыв конкретной сессии по ID
   */
  @Delete("sessions/:id")
  @HttpCode(HttpStatus.OK)
  async revokeSession(
    @Param("id") sessionId: string,
    @Req() req: FastifyRequest
  ) {
    const authUser = extractAuthUser(req.headers["authorization"]);
    await this.authService.revokeSession(authUser.sub, sessionId);

    return {
      success: true,
      data: { message: "Сессия успешно отозвана" },
      meta: { timestamp: new Date().toISOString() },
    };
  }

  private checkOrigin(req: FastifyRequest): void {
    const origin = (req.headers["origin"] || req.headers["referer"]) as string | undefined;
    if (origin && !isAllowedOrigin(origin)) {
      throw new ForbiddenError("CSRF_VIOLATION", "Запрос отклонен политикой CORS/CSRF");
    }
  }

  private getIp(req: FastifyRequest): string {
    return (req.ip || req.headers["x-forwarded-for"] || "127.0.0.1") as string;
  }

  private setRefreshCookie(reply: FastifyReply, refreshToken: string): void {
    const opts = getRefreshTokenCookieOptions();
    if (typeof (reply as any).setCookie === "function") {
      (reply as any).setCookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
        httpOnly: opts.httpOnly,
        secure: opts.secure,
        sameSite: opts.sameSite,
        path: opts.path,
        maxAge: Math.floor(opts.maxAge / 1000),
        expires: new Date(Date.now() + opts.maxAge),
      });
    } else {
      reply.header(
        "Set-Cookie",
        `${REFRESH_TOKEN_COOKIE_NAME}=${refreshToken}; HttpOnly; Path=${opts.path}; SameSite=Lax${opts.secure ? "; Secure" : ""}; Max-Age=${Math.floor(opts.maxAge / 1000)}`
      );
    }
  }

  private clearRefreshCookie(reply: FastifyReply): void {
    const opts = getClearCookieOptions();
    if (typeof (reply as any).setCookie === "function") {
      (reply as any).setCookie(REFRESH_TOKEN_COOKIE_NAME, "", {
        httpOnly: opts.httpOnly,
        secure: opts.secure,
        sameSite: opts.sameSite,
        path: opts.path,
        maxAge: 0,
        expires: new Date(0),
      });
    } else {
      reply.header(
        "Set-Cookie",
        `${REFRESH_TOKEN_COOKIE_NAME}=; HttpOnly; Path=${opts.path}; SameSite=Lax${opts.secure ? "; Secure" : ""}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
      );
    }
  }
}
