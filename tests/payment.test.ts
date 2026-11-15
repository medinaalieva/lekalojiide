import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MockPaymentGateway } from "../src/modules/payments/gateways/mock-payment.gateway";
import {
  OrderIdParamSchema,
  AdminWebhookEventsQuerySchema,
} from "../src/modules/payments/payments.dto";
import { PaymentStatus, WebhookStatus } from "@prisma/client";

test("MockPaymentGateway: Signature generation and verification with HMAC-SHA256", () => {
  const gateway = new MockPaymentGateway();
  const payload = {
    orderId: randomUUID(),
    amount: 450,
    currency: "KGS",
    status: "SUCCEEDED",
  };

  const validSignature = gateway.generateSignature(payload);
  assert.ok(validSignature.length === 64, "HMAC-SHA256 signature must be 64 hex characters");

  // Валидная подпись в x-signature -> true
  const valid = gateway.verifyWebhookSignature({ "x-signature": validSignature }, payload);
  assert.equal(valid, true);

  // Валидная подпись в x-mock-signature -> true
  const validMock = gateway.verifyWebhookSignature({ "x-mock-signature": validSignature }, payload);
  assert.equal(validMock, true);

  // Поддельная/искажённая подпись -> false
  const invalidSig = gateway.verifyWebhookSignature({ "x-signature": "badf00d".repeat(9) }, payload);
  assert.equal(invalidSig, false);

  // Изменённое тело запроса при прежней подписи -> false
  const tamperedPayload = { ...payload, amount: 10 };
  const tampered = gateway.verifyWebhookSignature({ "x-signature": validSignature }, tamperedPayload);
  assert.equal(tampered, false);

  // Отсутствие заголовка подписи -> false
  const missingHeader = gateway.verifyWebhookSignature({}, payload);
  assert.equal(missingHeader, false);
});

test("MockPaymentGateway: initiatePayment generates safe paymentUrl and externalId", async () => {
  const gateway = new MockPaymentGateway();
  const res = await gateway.initiatePayment({
    orderId: randomUUID(),
    orderNumber: "LZ-2026-TEST42",
    amount: 450,
    currency: "KGS",
    customerEmail: "user@example.kg",
    customerName: "Айпери Бектемирова",
    idempotencyKey: "pay_test_key_12345",
  });

  assert.ok(res.paymentUrl.includes("mock-gateway.example.kg/pay/pay_test_key_12345"));
  assert.ok(res.paymentUrl.includes("amount=450"));
  assert.ok(res.paymentUrl.includes("currency=KGS"));
  assert.equal(res.externalId, "mock_ext_pay_test_key_12345");
  assert.equal(res.gatewayPayload?.provider, "mock-banking-gateway");
});

test("MockPaymentGateway: parseWebhookPayload correctly parses statuses and rejects invalid input", () => {
  const gateway = new MockPaymentGateway();
  const orderId = randomUUID();

  // Успешный статус
  const successParsed = gateway.parseWebhookPayload({
    orderId,
    amount: "450.00",
    currency: "KGS",
    status: "SUCCEEDED",
    externalId: "ext_bank_123",
  });
  assert.equal(successParsed.orderId, orderId);
  assert.equal(successParsed.amount, 450);
  assert.equal(successParsed.currency, "KGS");
  assert.equal(successParsed.status, PaymentStatus.SUCCEEDED);

  // Статус неудачи
  const failedParsed = gateway.parseWebhookPayload({
    orderId,
    amount: 500,
    status: "FAILED",
  });
  assert.equal(failedParsed.status, PaymentStatus.FAILED);

  // Ошибка: отсутствие orderId
  assert.throws(() => {
    gateway.parseWebhookPayload({ amount: 450, status: "SUCCEEDED" });
  }, (err: any) => err.code === "ORDER_ID_REQUIRED");

  // Ошибка: нечисловая сумма
  assert.throws(() => {
    gateway.parseWebhookPayload({ orderId, amount: "invalid-number" });
  }, (err: any) => err.code === "AMOUNT_REQUIRED");
});

test("Payments DTO: OrderIdParamSchema validates UUID format", () => {
  const valid = OrderIdParamSchema.safeParse({ id: randomUUID() });
  assert.equal(valid.success, true);

  const invalid = OrderIdParamSchema.safeParse({ id: "not-a-valid-uuid" });
  assert.equal(invalid.success, false);
});

test("Payments DTO: AdminWebhookEventsQuerySchema coerces numbers and validates enum", () => {
  const parsed = AdminWebhookEventsQuerySchema.parse({
    page: "2",
    limit: "10",
    status: WebhookStatus.PROCESSED,
    gateway: "mock",
  });
  assert.equal(parsed.page, 2);
  assert.equal(parsed.limit, 10);
  assert.equal(parsed.status, WebhookStatus.PROCESSED);
  assert.equal(parsed.gateway, "mock");

  // Превышение лимита пагинации (> 50)
  const overLimit = AdminWebhookEventsQuerySchema.safeParse({ limit: "100" });
  assert.equal(overLimit.success, false);
});
