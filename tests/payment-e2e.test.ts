import test from "node:test";
import assert from "node:assert/strict";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import fastifyCookie from "@fastify/cookie";
import { AppModule } from "../src/app.module";
import { AppExceptionFilter } from "../src/common/filters/app-exception.filter";
import { prisma } from "../src/lib/prisma";
import { signAccessToken } from "../src/utils/jwt";
import { MockPaymentGateway } from "../src/modules/payments/gateways/mock-payment.gateway";
import { Role, OrderStatus, PaymentStatus, WebhookStatus } from "@prisma/client";

async function createTestApp(): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({ logger: false });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter);
  await app.register(fastifyCookie as any);
  app.setGlobalPrefix("api/v1", { exclude: ["health", "health/ready"] });
  app.useGlobalFilters(new AppExceptionFilter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

test("Payment Module E2E: Full Online Payment, Webhooks & Admin Audit with PostgreSQL", async (t) => {
  const app = await createTestApp();
  const gateway = new MockPaymentGateway();

  const adminId = "00000000-0000-4000-8000-0000000000a3";
  const customer1Id = "00000000-0000-4000-8000-0000000000c4";
  const customer2Id = "00000000-0000-4000-8000-0000000000c5";

  // Подготовка тестовых пользователей
  await prisma.user.upsert({
    where: { id: adminId },
    update: { role: Role.ADMIN },
    create: {
      id: adminId,
      email: "admin-pay@test-lekalo-zhiide.local",
      role: Role.ADMIN,
      firstName: "Админ",
      lastName: "Платежей",
    },
  });

  await prisma.user.upsert({
    where: { id: customer1Id },
    update: { role: Role.CUSTOMER },
    create: {
      id: customer1Id,
      email: "customer1-pay@test-lekalo-zhiide.local",
      role: Role.CUSTOMER,
      firstName: "Айбек",
      lastName: "Сулайманов",
      phone: "+996700112233",
    },
  });

  await prisma.user.upsert({
    where: { id: customer2Id },
    update: { role: Role.CUSTOMER },
    create: {
      id: customer2Id,
      email: "customer2-pay@test-lekalo-zhiide.local",
      role: Role.CUSTOMER,
      firstName: "Бермет",
      lastName: "Касымова",
    },
  });

  const adminToken = signAccessToken({
    sub: adminId,
    email: "admin-pay@test-lekalo-zhiide.local",
    role: Role.ADMIN,
    sessionId: "sess-admin-pay-1",
  });

  const customer1Token = signAccessToken({
    sub: customer1Id,
    email: "customer1-pay@test-lekalo-zhiide.local",
    role: Role.CUSTOMER,
    sessionId: "sess-cust1-pay-1",
  });

  const customer2Token = signAccessToken({
    sub: customer2Id,
    email: "customer2-pay@test-lekalo-zhiide.local",
    role: Role.CUSTOMER,
    sessionId: "sess-cust2-pay-1",
  });

  let testOrderId: string | null = null;
  let testPaymentId: string | null = null;
  let retryPaymentId: string | null = null;

  try {
    // -------------------------------------------------------------------------
    // ПОДГОТОВКА ТЕСТОВОГО ЗАКАЗА В POSTGRESQL
    // -------------------------------------------------------------------------
    const order = await prisma.order.create({
      data: {
        orderNumber: "LZ-2026-PAYTEST01",
        userId: customer1Id,
        customerEmail: "customer1-pay@test-lekalo-zhiide.local",
        customerName: "Айбек Сулайманов",
        customerPhone: "+996700112233",
        totalAmount: 450,
        currency: "KGS",
        status: OrderStatus.PENDING,
      },
    });
    testOrderId = order.id;

    // =========================================================================
    // ТЕСТ 1: Инициализация оплаты заказа (POST /api/v1/orders/:id/payment)
    // =========================================================================
    await t.test("1. POST /api/v1/orders/:id/payment initiates payment and creates PENDING record in KGS", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/orders/${testOrderId}/payment`,
        headers: {
          authorization: `Bearer ${customer1Token}`,
        },
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);
      assert.equal(json.success, true);
      assert.ok(json.data.paymentId);
      assert.ok(json.data.paymentUrl.includes("mock-gateway.example.kg/pay/"));
      assert.equal(json.data.amount, 450);
      assert.equal(json.data.currency, "KGS");
      assert.equal(json.data.isNewAttempt, true);

      testPaymentId = json.data.paymentId;

      // Проверяем запись в БД
      const dbPayment = await prisma.payment.findUnique({
        where: { id: testPaymentId! },
      });
      assert.ok(dbPayment);
      assert.equal(dbPayment.orderId, testOrderId);
      assert.equal(dbPayment.status, PaymentStatus.PENDING);
      assert.equal(Number(dbPayment.amount), 450);
      assert.equal(dbPayment.currency, "KGS");
    });

    // =========================================================================
    // ТЕСТ 2: Повторная инициализация без retry возвращает текущую попытку
    // =========================================================================
    await t.test("2. Re-initiating without retry returns active pending payment attempt", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/orders/${testOrderId}/payment`,
        headers: {
          authorization: `Bearer ${customer1Token}`,
        },
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);
      assert.equal(json.data.paymentId, testPaymentId);
      assert.equal(json.data.isNewAttempt, false); // Повторный вызов вернул текущую попытку
    });

    // =========================================================================
    // ТЕСТ 3: Повторная попытка оплаты (POST /api/v1/orders/:id/retry-payment)
    // =========================================================================
    await t.test("3. POST /api/v1/orders/:id/retry-payment creates new Payment attempt and cancels previous", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/orders/${testOrderId}/retry-payment`,
        headers: {
          authorization: `Bearer ${customer1Token}`,
        },
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);
      assert.equal(json.success, true);
      assert.ok(json.data.paymentId);
      assert.notEqual(json.data.paymentId, testPaymentId); // Новый paymentId!
      assert.equal(json.data.isNewAttempt, true);

      retryPaymentId = json.data.paymentId;

      // Предыдущий платёж аннулирован (CANCELED)
      const prevPayment = await prisma.payment.findUnique({
        where: { id: testPaymentId! },
      });
      assert.equal(prevPayment?.status, PaymentStatus.CANCELED);

      // Новый платёж активен (PENDING)
      const newPayment = await prisma.payment.findUnique({
        where: { id: retryPaymentId! },
      });
      assert.equal(newPayment?.status, PaymentStatus.PENDING);
    });

    // =========================================================================
    // ТЕСТ 4: Запрет оплаты чужого заказа (403 Forbidden)
    // =========================================================================
    await t.test("4. Customer 2 cannot initiate or retry payment for Customer 1's order", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/orders/${testOrderId}/retry-payment`,
        headers: {
          authorization: `Bearer ${customer2Token}`,
        },
      });

      assert.equal(res.statusCode, 403);
      const json = JSON.parse(res.payload);
      assert.equal(json.error?.code, "FORBIDDEN");
    });

    // =========================================================================
    // ТЕСТ 5: Получение статуса оплаты заказа покупателем
    // =========================================================================
    await t.test("5. GET /api/v1/orders/:id/payment-status returns safe payment details", async () => {
      // Покупатель 1 запрашивает статус своего заказа
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/orders/${testOrderId}/payment-status`,
        headers: { authorization: `Bearer ${customer1Token}` },
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);
      assert.equal(json.data.orderId, testOrderId);
      assert.equal(json.data.isPaid, false);
      assert.equal(json.data.payments.length, 2); // 1 отменённый + 1 активный

      // Покупатель 2 пытается проверить чужой заказ -> 403 Forbidden
      const forbidRes = await app.inject({
        method: "GET",
        url: `/api/v1/orders/${testOrderId}/payment-status`,
        headers: { authorization: `Bearer ${customer2Token}` },
      });
      assert.equal(forbidRes.statusCode, 403);
    });

    // =========================================================================
    // ТЕСТ 6: Вебхук с неверной цифровой подписью отклоняется (401 Unauthorized)
    // =========================================================================
    await t.test("6. Webhook with invalid signature is rejected (401 Unauthorized)", async () => {
      const webhookPayload = {
        orderId: testOrderId,
        paymentId: retryPaymentId,
        amount: 450,
        currency: "KGS",
        status: "SUCCEEDED",
        externalId: "ext_bank_tx_001",
      };

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/payments/mock",
        headers: {
          "content-type": "application/json",
          "x-signature": "bad_signature_000000000000000000000000000000000000000000000000000000",
        },
        payload: JSON.stringify(webhookPayload),
      });

      assert.equal(res.statusCode, 401);
      const json = JSON.parse(res.payload);
      assert.equal(json.error?.code, "SIGNATURE_VERIFICATION_FAILED");

      // Проверяем, что событие зафиксировано в БД со статусом FAILED
      const event = await prisma.paymentWebhookEvent.findFirst({
        where: { paymentGateway: "mock" },
        orderBy: { createdAt: "desc" },
      });
      assert.ok(event);
      assert.equal(event.status, WebhookStatus.FAILED);
      assert.ok(event.errorMessage?.includes("SIGNATURE_VERIFICATION_FAILED"));
    });

    // =========================================================================
    // ТЕСТ 7: Вебхук с несовпадающей суммой отклоняется (400 Bad Request)
    // =========================================================================
    await t.test("7. Webhook with mismatched amount is rejected (400 Bad Request)", async () => {
      const wrongAmountPayload = {
        orderId: testOrderId,
        paymentId: retryPaymentId,
        amount: 100, // В заказе 450, а банк прислал 100!
        currency: "KGS",
        status: "SUCCEEDED",
        externalId: "ext_bank_tx_002",
      };
      const signature = gateway.generateSignature(wrongAmountPayload);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/payments/mock",
        headers: {
          "content-type": "application/json",
          "x-signature": signature,
        },
        payload: JSON.stringify(wrongAmountPayload),
      });

      assert.equal(res.statusCode, 400);
      const json = JSON.parse(res.payload);
      assert.equal(json.error?.code, "AMOUNT_MISMATCH");
    });

    // =========================================================================
    // ТЕСТ 8: Вебхук с несовпадающей валютой отклоняется (400 Bad Request)
    // =========================================================================
    await t.test("8. Webhook with mismatched currency is rejected (400 Bad Request)", async () => {
      const wrongCurrencyPayload = {
        orderId: testOrderId,
        paymentId: retryPaymentId,
        amount: 450,
        currency: "USD", // В заказе KGS, а банк прислал USD!
        status: "SUCCEEDED",
        externalId: "ext_bank_tx_003",
      };
      const signature = gateway.generateSignature(wrongCurrencyPayload);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/payments/mock",
        headers: {
          "content-type": "application/json",
          "x-signature": signature,
        },
        payload: JSON.stringify(wrongCurrencyPayload),
      });

      assert.equal(res.statusCode, 400);
      const json = JSON.parse(res.payload);
      assert.equal(json.error?.code, "CURRENCY_MISMATCH");
    });

    // =========================================================================
    // ТЕСТ 9: Успешный вебхук атомарно переводит Payment в SUCCEEDED и Order в PAID
    // =========================================================================
    await t.test("9. Valid webhook atomically transitions Payment to SUCCEEDED and Order to PAID", async () => {
      const validPayload = {
        orderId: testOrderId,
        paymentId: retryPaymentId,
        amount: 450,
        currency: "KGS",
        status: "SUCCEEDED",
        externalId: "ext_bank_tx_004",
      };
      const signature = gateway.generateSignature(validPayload);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/payments/mock",
        headers: {
          "content-type": "application/json",
          "x-signature": signature,
        },
        payload: JSON.stringify(validPayload),
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);
      assert.equal(json.data.received, true);
      assert.equal(json.data.status, OrderStatus.PAID);

      // Проверяем атомарные изменения в PostgreSQL
      const dbPayment = await prisma.payment.findUnique({
        where: { id: retryPaymentId! },
      });
      assert.equal(dbPayment?.status, PaymentStatus.SUCCEEDED);
      assert.equal(dbPayment?.externalId, "ext_bank_tx_004");

      const dbOrder = await prisma.order.findUnique({
        where: { id: testOrderId! },
      });
      assert.equal(dbOrder?.status, OrderStatus.PAID);

      // Проверяем статус вебхука в журнале аудита
      const event = await prisma.paymentWebhookEvent.findFirst({
        where: { paymentId: retryPaymentId! },
        orderBy: { createdAt: "desc" },
      });
      assert.equal(event?.status, WebhookStatus.PROCESSED);
    });

    // =========================================================================
    // ТЕСТ 10: Повторный вебхук идемпотентен (возвращает 200 без повторных изменений)
    // =========================================================================
    await t.test("10. Duplicate webhook is handled idempotently without re-crediting", async () => {
      const validPayload = {
        orderId: testOrderId,
        paymentId: retryPaymentId,
        amount: 450,
        currency: "KGS",
        status: "SUCCEEDED",
        externalId: "ext_bank_tx_004",
      };
      const signature = gateway.generateSignature(validPayload);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/payments/mock",
        headers: {
          "content-type": "application/json",
          "x-signature": signature,
        },
        payload: JSON.stringify(validPayload),
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);
      assert.equal(json.data.received, true);
      assert.equal(json.data.idempotent, true);

      // Заказ по-прежнему PAID
      const dbOrder = await prisma.order.findUnique({
        where: { id: testOrderId! },
      });
      assert.equal(dbOrder?.status, OrderStatus.PAID);
    });

    // =========================================================================
    // ТЕСТ 11: Запрет повторной оплаты уже оплаченного заказа (400 Bad Request)
    // =========================================================================
    await t.test("11. Initiating payment for already PAID order is rejected (400 Bad Request)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/orders/${testOrderId}/payment`,
        headers: {
          authorization: `Bearer ${customer1Token}`,
        },
      });

      assert.equal(res.statusCode, 400);
      const json = JSON.parse(res.payload);
      assert.equal(json.error?.code, "ORDER_ALREADY_PAID");
    });

    // =========================================================================
    // ТЕСТ 12: Административный аудит входящих вебхуков (RBAC)
    // =========================================================================
    await t.test("12. GET /api/v1/admin/webhook-events enforces RBAC (401 unauth, 403 cust, 200 admin)", async () => {
      // 12.1. Без токена -> 401 Unauthorized
      const noAuth = await app.inject({
        method: "GET",
        url: "/api/v1/admin/webhook-events",
      });
      assert.equal(noAuth.statusCode, 401);

      // 12.2. С токеном покупателя -> 403 Forbidden
      const custAuth = await app.inject({
        method: "GET",
        url: "/api/v1/admin/webhook-events",
        headers: { authorization: `Bearer ${customer1Token}` },
      });
      assert.equal(custAuth.statusCode, 403);

      // 12.3. С токеном администратора -> 200 OK
      const adminList = await app.inject({
        method: "GET",
        url: "/api/v1/admin/webhook-events",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      assert.equal(adminList.statusCode, 200);
      const json = JSON.parse(adminList.payload);
      assert.ok(Array.isArray(json.data.items));
      assert.ok(json.data.meta.totalItems >= 4);

      // Проверяем, что в выдаче нет утечки чувствительных секретов или подписей
      const itemStr = JSON.stringify(json.data.items[0]);
      assert.equal(itemStr.includes("secret"), false);
      assert.equal(itemStr.includes("signature"), false);
    });

  } finally {
    // -------------------------------------------------------------------------
    // БЕЗОПАСНАЯ ОЧИСТКА ТЕСТОВЫХ ДАННЫХ ИЗ POSTGRESQL
    // -------------------------------------------------------------------------
    if (testOrderId) {
      await prisma.paymentWebhookEvent.deleteMany({
        where: { paymentGateway: "mock" },
      });
      await prisma.payment.deleteMany({
        where: { orderId: testOrderId },
      });
      await prisma.order.delete({
        where: { id: testOrderId },
      }).catch(() => {});
    }

    const testUserIds = [adminId, customer1Id, customer2Id];
    await prisma.user.deleteMany({
      where: { id: { in: testUserIds } },
    }).catch(() => {});

    await app.close();
    await prisma.$disconnect();
  }
});
