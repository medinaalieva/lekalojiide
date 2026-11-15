import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { OrdersService } from "./orders.service";
import { PaymentsService } from "../payments/payments.service";
import { CheckoutDtoSchema } from "./orders.dto";
import { extractAuthUser } from "../auth/auth.guard";
import { UnprocessableEntityError, ForbiddenError } from "../../utils/errors";
import { isAllowedOrigin } from "../../config/http.config";

@Controller("orders")
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly paymentsService: PaymentsService
  ) {}

  /**
   * Проверка Origin для защиты от CSRF при оформлении заказов
   */
  private checkOrigin(req: FastifyRequest): void {
    const origin = req.headers["origin"] as string | undefined;
    if (origin && !isAllowedOrigin(origin)) {
      throw new ForbiddenError(
        "CSRF_FORBIDDEN",
        `Запрос с источника '${origin}' заблокирован политикой CORS/CSRF`
      );
    }
  }

  /**
   * POST /api/v1/orders/checkout
   * Оформление заказа из текущей корзины покупателя
   */
  @Post("checkout")
  @HttpCode(HttpStatus.CREATED)
  async checkout(@Body() body: unknown, @Req() req: FastifyRequest) {
    this.checkOrigin(req);
    const user = extractAuthUser(req.headers.authorization);

    const parseRes = CheckoutDtoSchema.safeParse(body || {});
    if (!parseRes.success) {
      throw new UnprocessableEntityError(
        "VALIDATION_ERROR",
        "Ошибка валидации контактных данных заказа",
        parseRes.error.format()
      );
    }

    const data = await this.ordersService.checkout(user, parseRes.data);
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * GET /api/v1/orders
   * Получение списка заказов текущего авторизованного покупателя
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async getUserOrders(@Req() req: FastifyRequest) {
    const user = extractAuthUser(req.headers.authorization);
    const data = await this.ordersService.getUserOrders(user.sub);

    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * GET /api/v1/orders/:id
   * Получение детальной информации о конкретном заказе покупателя
   */
  @Get(":id")
  @HttpCode(HttpStatus.OK)
  async getOrderById(@Param("id") orderId: string, @Req() req: FastifyRequest) {
    const user = extractAuthUser(req.headers.authorization);
    const data = await this.ordersService.getOrderById(user, orderId);

    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * POST /api/v1/orders/:id/payment
   * Инициализация оплаты заказа покупателем
   */
  @Post(":id/payment")
  @HttpCode(HttpStatus.OK)
  async initiateOrderPayment(
    @Param("id") orderId: string,
    @Req() req: FastifyRequest
  ) {
    this.checkOrigin(req);
    const user = extractAuthUser(req.headers.authorization);
    const data = await this.paymentsService.initiatePayment(user, orderId, false);

    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * POST /api/v1/orders/:id/retry-payment
   * Повторная попытка оплаты того же заказа при неудаче предыдущей транзакции
   */
  @Post(":id/retry-payment")
  @HttpCode(HttpStatus.OK)
  async retryPayment(
    @Param("id") orderId: string,
    @Req() req: FastifyRequest
  ) {
    this.checkOrigin(req);
    const user = extractAuthUser(req.headers.authorization);
    const data = await this.paymentsService.retryPayment(user, orderId);

    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * GET /api/v1/orders/:id/payment-status
   * Получение актуального статуса оплаты заказа
   */
  @Get(":id/payment-status")
  @HttpCode(HttpStatus.OK)
  async getPaymentStatus(
    @Param("id") orderId: string,
    @Req() req: FastifyRequest
  ) {
    const user = extractAuthUser(req.headers.authorization);
    const data = await this.paymentsService.getPaymentStatus(user, orderId);

    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }
}
