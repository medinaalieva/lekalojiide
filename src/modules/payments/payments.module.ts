import { Module } from "@nestjs/common";
import { PrismaModule } from "../../lib/prisma.module";
import { PaymentsService } from "./payments.service";
import { MockPaymentGateway } from "./gateways/mock-payment.gateway";
import { PAYMENT_GATEWAY } from "./interfaces/payment-gateway.interface";
import { PaymentWebhooksController } from "./payment-webhooks.controller";
import { PaymentAdminController } from "./payment-admin.controller";

@Module({
  imports: [PrismaModule],
  controllers: [PaymentWebhooksController, PaymentAdminController],
  providers: [
    PaymentsService,
    MockPaymentGateway,
    {
      provide: PAYMENT_GATEWAY,
      useExisting: MockPaymentGateway,
    },
  ],
  exports: [PaymentsService, PAYMENT_GATEWAY],
})
export class PaymentsModule {}
