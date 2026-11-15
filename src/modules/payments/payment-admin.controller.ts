import {
  Controller,
  Get,
  Req,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { Role } from "@prisma/client";
import { PaymentsService } from "./payments.service";
import { AdminWebhookEventsQuerySchema } from "./payments.dto";
import { extractAuthUser, checkRolePermissions } from "../auth/auth.guard";
import { UnprocessableEntityError } from "../../utils/errors";

@Controller("admin/webhook-events")
export class PaymentAdminController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Проверка прав администратора / контент-менеджера
   */
  private authenticateAdmin(req: FastifyRequest) {
    const user = extractAuthUser(req.headers.authorization);
    checkRolePermissions(user.role, [Role.ADMIN, Role.CONTENT_MANAGER]);
    return user;
  }

  /**
   * GET /api/v1/admin/webhook-events
   * Просмотр журнала входящих событий вебхуков с пагинацией и фильтрацией
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async getWebhookEvents(@Req() req: FastifyRequest) {
    this.authenticateAdmin(req);

    const parseRes = AdminWebhookEventsQuerySchema.safeParse(req.query);
    if (!parseRes.success) {
      throw new UnprocessableEntityError(
        "VALIDATION_ERROR",
        "Некорректные параметры запроса журнала вебхуков",
        parseRes.error.format()
      );
    }

    const data = await this.paymentsService.getAdminWebhookEvents(parseRes.data);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }
}
