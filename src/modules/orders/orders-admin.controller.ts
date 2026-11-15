import {
  Controller,
  Get,
  Param,
  Req,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { Role } from "@prisma/client";
import { OrdersService } from "./orders.service";
import { OrderQuerySchema } from "./orders.dto";
import { extractAuthUser, checkRolePermissions } from "../auth/auth.guard";
import { UnprocessableEntityError, ForbiddenError } from "../../utils/errors";
import { isAllowedOrigin } from "../../config/http.config";

@Controller("admin/orders")
export class OrdersAdminController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * Проверка прав администратора / контент-менеджера
   */
  private authenticateAdmin(req: FastifyRequest) {
    const origin = req.headers["origin"] as string | undefined;
    if (origin && !isAllowedOrigin(origin)) {
      throw new ForbiddenError(
        "CSRF_FORBIDDEN",
        `Запрос с источника '${origin}' заблокирован политикой CORS/CSRF`
      );
    }
    const user = extractAuthUser(req.headers.authorization);
    checkRolePermissions(user.role, [Role.ADMIN, Role.CONTENT_MANAGER]);
    return user;
  }

  /**
   * GET /api/v1/admin/orders
   * Просмотр списка всех заказов с фильтрацией по статусу, email и пагинацией
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async getAdminOrders(@Req() req: FastifyRequest) {
    this.authenticateAdmin(req);

    const parseRes = OrderQuerySchema.safeParse(req.query);
    if (!parseRes.success) {
      throw new UnprocessableEntityError(
        "VALIDATION_ERROR",
        "Некорректные параметры фильтрации заказов",
        parseRes.error.format()
      );
    }

    const data = await this.ordersService.getAdminOrders(parseRes.data);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * GET /api/v1/admin/orders/:id
   * Детальный просмотр любого заказа с позициями, снимками и данными покупателя
   */
  @Get(":id")
  @HttpCode(HttpStatus.OK)
  async getAdminOrderById(@Param("id") orderId: string, @Req() req: FastifyRequest) {
    this.authenticateAdmin(req);

    const data = await this.ordersService.getAdminOrderById(orderId);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }
}
