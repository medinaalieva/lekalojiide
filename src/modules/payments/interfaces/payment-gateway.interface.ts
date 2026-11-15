import { PaymentStatus } from "@prisma/client";

export interface InitiatePaymentParams {
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  customerEmail: string;
  customerName: string;
  customerPhone?: string | null;
  idempotencyKey: string;
}

export interface InitiatePaymentResult {
  paymentUrl: string;
  externalId?: string;
  gatewayPayload?: Record<string, any>;
}

export interface ParsedWebhookResult {
  externalEventId?: string;
  externalId?: string;
  orderId: string;
  paymentId?: string;
  idempotencyKey?: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  rawPayload: any;
}

export interface PaymentStatusResult {
  status: PaymentStatus;
  externalId?: string;
  amount: number;
  currency: string;
}

export interface IPaymentGateway {
  readonly gatewayName: string;

  /**
   * Инициализация платежа в шлюзе и получение платёжной ссылки
   */
  initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult>;

  /**
   * Проверка криптографической подписи входящего банковского вебхука
   */
  verifyWebhookSignature(
    headers: Record<string, string | string[] | undefined>,
    rawBody: unknown
  ): boolean;

  /**
   * Парсинг полезной нагрузки вебхука в стандартизированную структуру
   */
  parseWebhookPayload(rawBody: unknown): ParsedWebhookResult;

  /**
   * Активный опрос статуса платежа в шлюзе эквайринга (Reconciliation)
   */
  fetchPaymentStatus(externalId: string): Promise<PaymentStatusResult>;
}

export const PAYMENT_GATEWAY = "PAYMENT_GATEWAY";
