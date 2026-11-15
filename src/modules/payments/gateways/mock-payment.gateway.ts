import { Injectable } from "@nestjs/common";
import * as crypto from "node:crypto";
import { PaymentStatus } from "@prisma/client";
import {
  IPaymentGateway,
  InitiatePaymentParams,
  InitiatePaymentResult,
  ParsedWebhookResult,
  PaymentStatusResult,
} from "../interfaces/payment-gateway.interface";
import { BadRequestError } from "../../../utils/errors";

@Injectable()
export class MockPaymentGateway implements IPaymentGateway {
  readonly gatewayName = "mock";
  private readonly secret: string;

  constructor() {
    this.secret =
      process.env.PAYMENT_WEBHOOK_SECRET ||
      "mock-secret-key-at-least-32-chars-long-development";
  }

  /**
   * Генерация эталонной подписи HMAC-SHA256 (используется для эмуляции банка в тестах)
   */
  generateSignature(payload: unknown, secretOverride?: string): string {
    const key = secretOverride || this.secret;
    const dataString =
      typeof payload === "string" ? payload : JSON.stringify(payload);
    return crypto.createHmac("sha256", key).update(dataString).digest("hex");
  }

  /**
   * Инициализация платежа и генерация ссылки на страницу оплаты
   */
  async initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
    const externalId = `mock_ext_${params.idempotencyKey}`;
    const paymentUrl = `https://mock-gateway.example.kg/pay/${params.idempotencyKey}?order=${encodeURIComponent(
      params.orderNumber
    )}&amount=${params.amount}&currency=${params.currency}`;

    return {
      paymentUrl,
      externalId,
      gatewayPayload: {
        provider: "mock-banking-gateway",
        mode: "sandbox",
        initiatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Верификация подписи вебхука
   */
  verifyWebhookSignature(
    headers: Record<string, string | string[] | undefined>,
    rawBody: unknown
  ): boolean {
    const incomingSignature =
      headers["x-signature"] ||
      headers["x-mock-signature"] ||
      headers["x-signature".toLowerCase()];

    if (!incomingSignature || typeof incomingSignature !== "string") {
      return false;
    }

    const expectedSignature = this.generateSignature(rawBody);

    try {
      // Защищённое от timing-attacks сравнение хэшей
      return crypto.timingSafeEqual(
        Buffer.from(incomingSignature, "hex"),
        Buffer.from(expectedSignature, "hex")
      );
    } catch {
      return false;
    }
  }

  /**
   * Разбор входящего тела вебхука
   */
  parseWebhookPayload(rawBody: unknown): ParsedWebhookResult {
    if (!rawBody || typeof rawBody !== "object") {
      throw new BadRequestError("INVALID_PAYLOAD", "Тело вебхука должно быть JSON-объектом");
    }

    const data = rawBody as Record<string, any>;

    if (!data.orderId) {
      throw new BadRequestError("ORDER_ID_REQUIRED", "В вебхуке отсутствует orderId");
    }
    if (data.amount === undefined || isNaN(Number(data.amount))) {
      throw new BadRequestError("AMOUNT_REQUIRED", "В вебхуке отсутствует корректная сумма");
    }

    let status: PaymentStatus = PaymentStatus.PENDING;
    const rawStatus = String(data.status || "").toUpperCase();
    if (rawStatus === "SUCCEEDED" || rawStatus === "PAID" || rawStatus === "SUCCESS") {
      status = PaymentStatus.SUCCEEDED;
    } else if (rawStatus === "FAILED" || rawStatus === "ERROR" || rawStatus === "REJECTED") {
      status = PaymentStatus.FAILED;
    } else if (rawStatus === "CANCELED" || rawStatus === "CANCELLED") {
      status = PaymentStatus.CANCELED;
    }

    return {
      externalEventId: data.eventId || data.externalEventId,
      externalId: data.externalId || data.transactionId,
      orderId: data.orderId,
      paymentId: data.paymentId,
      idempotencyKey: data.idempotencyKey,
      status,
      amount: Number(data.amount),
      currency: data.currency || "KGS",
      rawPayload: data,
    };
  }

  /**
   * Активный опрос статуса платежа
   */
  async fetchPaymentStatus(externalId: string): Promise<PaymentStatusResult> {
    return {
      status: PaymentStatus.SUCCEEDED,
      externalId,
      amount: 450,
      currency: "KGS",
    };
  }
}
