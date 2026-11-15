import {
  Controller,
  Post,
  Param,
  Req,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { PaymentsService } from "./payments.service";

@Controller()
export class PaymentWebhooksController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * POST /api/v1/webhooks/payments/:gateway
   * Приём уведомлений от платёжных шлюзов (основной маршрут ТЗ)
   */
  @Post("webhooks/payments/:gateway")
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Param("gateway") gateway: string,
    @Req() req: FastifyRequest
  ) {
    const result = await this.paymentsService.handleWebhook(
      gateway,
      req.headers as Record<string, any>,
      req.body
    );

    return {
      success: true,
      data: result,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * POST /api/v1/payments/webhook/:gateway
   * Алиас маршрута в соответствии с API_SPECIFICATION.md (5.4)
   */
  @Post("payments/webhook/:gateway")
  @HttpCode(HttpStatus.OK)
  async handleWebhookAlias(
    @Param("gateway") gateway: string,
    @Req() req: FastifyRequest
  ) {
    const result = await this.paymentsService.handleWebhook(
      gateway,
      req.headers as Record<string, any>,
      req.body
    );

    return {
      success: true,
      data: result,
      meta: { timestamp: new Date().toISOString() },
    };
  }
}
