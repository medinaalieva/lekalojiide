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
import { Role, OrderStatus, PaymentStatus, EntitlementStatus } from "@prisma/client";

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

async function ensureDbConnected(retries = 6, delayMs = 2500): Promise<string> {
  for (let i = 0; i < retries; i++) {
    try {
      const res: any[] = await prisma.$queryRawUnsafe("SELECT current_database() as db");
      if (res && res[0]?.db) {
        return res[0].db;
      }
    } catch (err: any) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error("Unable to connect to database after retries");
}

test("Stage 5.10: End-to-End Purchase Flow Verification (Cholpon Unavailable + Isolated Available Flow)", async (t) => {
  // Pre-flight database safety guard
  const dbName = await ensureDbConnected();
  assert.equal(dbName, "lekalo_test", "Safety Guard: Must run strictly against lekalo_test");

  const app = await createTestApp();
  const gateway = new MockPaymentGateway();

  const customerId = "00000000-0000-4000-8000-000000005a10";
  await prisma.user.upsert({
    where: { id: customerId },
    update: { role: Role.CUSTOMER },
    create: {
      id: customerId,
      email: "stage510-customer@test-lekalo-zhiide.local",
      role: Role.CUSTOMER,
      firstName: "Айсулуу",
      lastName: "Бектемирова",
      phone: "+996700554433",
    },
  });

  const customerToken = signAccessToken({
    sub: customerId,
    email: "stage510-customer@test-lekalo-zhiide.local",
    role: Role.CUSTOMER,
    sessionId: "stage-510-session-1",
  });

  // Transient test fixtures tracking for cleanup
  let testCatId: string | null = null;
  let testProdId: string | null = null;
  let testVarId: string | null = null;
  let testOrderId: string | null = null;
  let paymentId: string | null = null;

  try {
    // =========================================================================
    // ЧАСТЬ 1: ПРОВЕРКА НЕДОСТУПНЫХ ВЫКРОЕК («Пальто оверсайз Чолпон»)
    // =========================================================================
    const cholpon = await prisma.product.findUnique({
      where: { slug: "palto-oversayz-cholpon" },
      include: {
        variants: {
          include: {
            size: true,
            height: true,
            format: true,
            digitalFiles: {
              include: {
                currentVersion: true,
              },
            },
          },
        },
      },
    });

    assert.ok(cholpon, "Товар «Пальто оверсайз Чолпон» должен существовать в каталоге lekalo_test");
    assert.equal(cholpon.variants.length, 6, "У «Пальто оверсайз Чолпон» должно быть ровно 6 вариантов");

    await t.test("1.1. Catalog API reports all 6 Cholpon variants as isAvailable: false", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/catalog/products/palto-oversayz-cholpon",
      });
      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);
      assert.equal(json.success, true);
      const variants = json.data.variants;
      assert.equal(variants.length, 6);

      for (const v of variants) {
        assert.equal(v.isAvailable, false, `Вариант SKU ${v.sku} должен иметь isAvailable: false`);
        assert.ok(
          v.unavailableReason === "DEMO_OR_TEST_STUB" || v.unavailableReason === "NO_DIGITAL_FILE",
          `Вариант SKU ${v.sku} должен иметь причину DEMO_OR_TEST_STUB или NO_DIGITAL_FILE, получено: ${v.unavailableReason}`
        );
        assert.ok(v.unavailableMessage, `Вариант SKU ${v.sku} должен иметь сообщение для покупателя`);
      }
    });

    await t.test("1.2. Attempting to add each of the 6 Cholpon variants to cart returns 400 PATTERN_FILE_NOT_READY", async () => {
      // Очищаем корзину пользователя перед началом
      const userCarts = await prisma.cart.findMany({ where: { userId: customerId }, select: { id: true } });
      if (userCarts.length > 0) {
        await prisma.cartItem.deleteMany({ where: { cartId: { in: userCarts.map((c) => c.id) } } });
      }

      for (const variant of cholpon.variants) {
        const res = await app.inject({
          method: "POST",
          url: "/api/v1/cart/items",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${customerToken}`,
          },
          payload: JSON.stringify({ variantId: variant.id }),
        });

        assert.equal(res.statusCode, 400, `Добавление SKU ${variant.sku} должно возвращать HTTP 400`);
        const json = JSON.parse(res.payload);
        assert.equal(json.error?.code, "PATTERN_FILE_NOT_READY", `Код ошибки для ${variant.sku} должен быть PATTERN_FILE_NOT_READY`);
      }
    });

    await t.test("1.3. Direct API call with client bypass flags is strictly rejected (no client trust)", async () => {
      const variant = cholpon.variants[0];
      const bypassPayloads = [
        { variantId: variant.id, available: true },
        { variantId: variant.id, isAvailable: true },
        { variantId: variant.id, bypass: true },
        { variantId: variant.id, force: true },
        { variantId: variant.id, hasFile: true },
      ];

      for (const payload of bypassPayloads) {
        const res = await app.inject({
          method: "POST",
          url: "/api/v1/cart/items",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${customerToken}`,
          },
          payload: JSON.stringify(payload),
        });

        assert.equal(res.statusCode, 400, `Запрос с флагом ${JSON.stringify(payload)} должен быть отклонён`);
        const json = JSON.parse(res.payload);
        assert.equal(json.error?.code, "PATTERN_FILE_NOT_READY");
      }
    });

    await t.test("1.4. Injected unavailable items in cart display warning banners and details in GET /api/v1/cart", async () => {
      // Имитируем ситуацию, когда товар попал в корзину ранее:
      let cart = await prisma.cart.findFirst({ where: { userId: customerId } });
      if (!cart) {
        cart = await prisma.cart.create({
          data: {
            userId: customerId,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        });
      }

      // Добавляем напрямую в БД 2 варианта Чолпон (один со stub-файлом, второй без файла)
      const stubVariant = cholpon.variants.find((v) => v.digitalFiles.length > 0)!;
      const noFileVariant = cholpon.variants.find((v) => v.digitalFiles.length === 0)!;

      await prisma.cartItem.createMany({
        data: [
          { cartId: cart.id, productVariantId: stubVariant.id },
          { cartId: cart.id, productVariantId: noFileVariant.id },
        ],
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/cart",
        headers: { authorization: `Bearer ${customerToken}` },
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);
      assert.equal(json.success, true);
      assert.equal(json.data.items.length, 2);

      const hasUnavailable = json.data.items.some((item: any) => !item.isAvailable);
      assert.equal(hasUnavailable, true, "В корзине должны присутствовать недоступные позиции");

      for (const item of json.data.items) {
        assert.equal(item.isAvailable, false);
        assert.ok(item.unavailableReason);
        assert.ok(item.unavailableMessage);
      }
    });

    await t.test("1.5. POST /api/v1/orders/checkout rejects checkout when cart contains unavailable patterns", async () => {
      try {
        const ordersCountBefore = await prisma.order.count();

        const res = await app.inject({
          method: "POST",
          url: "/api/v1/orders/checkout",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${customerToken}`,
          },
          payload: JSON.stringify({
            customerName: "Айсулуу Бектемирова",
            customerPhone: "+996700554433",
          }),
        });

        assert.equal(res.statusCode, 400);
        const json = JSON.parse(res.payload);
        assert.equal(json.error?.code, "PATTERN_FILE_NOT_READY");
        assert.ok(json.error?.message, "Сообщение об ошибке должно быть заполнено");

        // Атомарность: проверяем, что заказ в базе данных НЕ создан
        const ordersCountAfter = await prisma.order.count();
        assert.equal(ordersCountAfter, ordersCountBefore, "Количество заказов не должно измениться при отказе");

        // Корзина сохранена: проверяем, что позиции не были удалены
        const cartRes = await app.inject({
          method: "GET",
          url: "/api/v1/cart",
          headers: { authorization: `Bearer ${customerToken}` },
        });
        assert.equal(cartRes.statusCode, 200);
        const cartJson = JSON.parse(cartRes.payload);
        assert.equal(cartJson.data.items.length, 2, "Позиции в корзине должны сохраниться после блокировки checkout");
      } finally {
        // Очищаем корзину для следующей части теста в гарантированном блоке
        const userCarts = await prisma.cart.findMany({ where: { userId: customerId }, select: { id: true } });
        if (userCarts.length > 0) {
          await prisma.cartItem.deleteMany({ where: { cartId: { in: userCarts.map((c) => c.id) } } });
        }
      }
    });

    // =========================================================================
    // ЧАСТЬ 2: СКВОЗНАЯ ПРОВЕРКА ДОСТУПНОЙ ВЫКРОЙКИ (ИЗОЛИРОВАННЫЙ ТЕСТ)
    // =========================================================================
    const runId = Math.random().toString(36).substring(2, 8);
    const catSlug = `stage-510-category-${runId}`;
    const prodSlug = `palto-kyrgyzstan-stage-510-${runId}`;

    const testCat = await prisma.category.create({
      data: {
        title: `Категория E2E Stage 5.10 (${runId})`,
        slug: catSlug,
      },
    });
    testCatId = testCat.id;

    const testProd = await prisma.product.create({
      data: {
        title: `Пальто Тестовое 5.10 (${runId})`,
        slug: prodSlug,
        description: "Изолированный товар для проверки сквозного пути покупки доступной выкройки",
        basePrice: 650,
        categoryId: testCatId,
        isActive: true,
      },
    });
    testProdId = testProd.id;

    const size = await prisma.size.findFirst();
    const height = await prisma.height.findFirst();
    const format = await prisma.format.findFirst();

    assert.ok(size && height && format, "Справочники размеров, ростовок и форматов должны быть заполнены");

    const testVar = await prisma.productVariant.create({
      data: {
        productId: testProdId,
        sizeId: size.id,
        heightId: height.id,
        formatId: format.id,
        sku: `LZ-STG510-PROD-${runId}`,
        isActive: true,
      },
    });
    testVarId = testVar.id;

    // Создаем DigitalFile и FileVersion с размером 3072 байт (>= 1024 байт), валидной сигнатурой
    const df = await prisma.digitalFile.create({
      data: {
        variantId: testVarId,
        title: "Производственное лекало A4",
        isActive: true,
      },
    });

    const fv = await prisma.fileVersion.create({
      data: {
        digitalFileId: df.id,
        versionNumber: 1,
        s3Bucket: "lekalo-patterns",
        s3Key: `patterns/${testVarId}/production-pattern-a4.pdf`,
        originalFileName: "palto-prod-a4.pdf",
        fileSizeBytes: BigInt(3072),
        mimeType: "application/pdf",
        checksumSha256: "9999999999999999999999999999999999999999999999999999999999999999",
        changelog: "Выпуск промышленной партии лекала A4",
      },
    });

    await prisma.digitalFile.update({
      where: { id: df.id },
      data: { currentVersionId: fv.id },
    });

    await t.test("2.1. Available variant reports isAvailable: true in Catalog API", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/catalog/products/${prodSlug}`,
      });
      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);
      assert.equal(json.data.variants[0].isAvailable, true);
      assert.ok(!json.data.variants[0].unavailableReason, "unavailableReason должен отсутствовать");
    });

    await t.test("2.2. Adding available variant to cart succeeds (201 Created)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/cart/items",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${customerToken}`,
        },
        payload: JSON.stringify({ variantId: testVarId }),
      });

      assert.equal(res.statusCode, 201);
      const json = JSON.parse(res.payload);
      assert.equal(json.success, true);
      assert.equal(json.data.totalItems, 1);
      assert.equal(json.data.totalAmount, 650);

      // Проверяем корзину: все позиции доступны
      const cartRes = await app.inject({
        method: "GET",
        url: "/api/v1/cart",
        headers: { authorization: `Bearer ${customerToken}` },
      });
      assert.equal(cartRes.statusCode, 200);
      const cartJson = JSON.parse(cartRes.payload);
      assert.equal(cartJson.data.items.length, 1);
      assert.equal(cartJson.data.items[0].isAvailable, true);
    });

    await t.test("2.3. Checkout creates order, freezes snapshots, and atomically clears cart", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/orders/checkout",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${customerToken}`,
        },
        payload: JSON.stringify({
          customerName: "Айсулуу Бектемирова",
          customerPhone: "+996700554433",
        }),
      });

      assert.equal(res.statusCode, 201);
      const json = JSON.parse(res.payload);
      assert.equal(json.success, true);
      const orderData = json.data;
      testOrderId = orderData.orderId;

      assert.ok(orderData.orderNumber.startsWith("LZ-2026-"));
      assert.equal(orderData.status, OrderStatus.PENDING);
      assert.equal(orderData.totalAmount, 650);
      assert.equal(orderData.itemsCount, 1);

      // Проверяем, что корзина покупателя атомарно очищена
      const cartRes = await app.inject({
        method: "GET",
        url: "/api/v1/cart",
        headers: { authorization: `Bearer ${customerToken}` },
      });
      assert.equal(cartRes.statusCode, 200);
      const cartJson = JSON.parse(cartRes.payload);
      assert.equal(cartJson.data.totalItems, 0);
    });

    await t.test("2.4. Payment initiation creates PENDING payment record with Mock Gateway", async () => {
      assert.ok(testOrderId, "testOrderId должен быть задан после checkout");
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/orders/${testOrderId}/payment`,
        headers: { authorization: `Bearer ${customerToken}` },
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);
      assert.equal(json.success, true);
      paymentId = json.data.paymentId;
      assert.ok(paymentId);
      assert.equal(json.data.amount, 650);
      assert.equal(json.data.currency, "KGS");
    });

    await t.test("2.5. Mock Payment Webhook confirms payment and generates PurchaseEntitlement", async () => {
      assert.ok(testOrderId && paymentId, "testOrderId и paymentId должны быть заданы");
      const validPayload = {
        orderId: testOrderId,
        paymentId: paymentId,
        amount: 650,
        currency: "KGS",
        status: "SUCCEEDED",
        externalId: `mock_tx_${Date.now()}`,
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

      // Проверяем статус заказа в БД
      const dbOrder = await prisma.order.findUnique({ where: { id: testOrderId! } });
      assert.equal(dbOrder?.status, OrderStatus.PAID);

      // Проверяем статус платежа в БД
      const dbPayment = await prisma.payment.findUnique({ where: { id: paymentId! } });
      assert.equal(dbPayment?.status, PaymentStatus.SUCCEEDED);
    });

    let entitlementId: string | null = null;
    await t.test("2.6. Customer library contains purchased pattern with active entitlement", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/cabinet/library",
        headers: { authorization: `Bearer ${customerToken}` },
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);
      assert.equal(json.success, true);
      assert.ok(Array.isArray(json.data), "Данные библиотеки должны быть массивом");
      assert.ok(json.data.length >= 1, "В библиотеке должен быть хотя бы один элемент");

      const purchasedItem = json.data.find((item: any) => item.variantId === testVarId);
      assert.ok(purchasedItem, "Купленный тестовый паттерн должен присутствовать в библиотеке");
      assert.equal(purchasedItem.status, EntitlementStatus.ACTIVE);
      entitlementId = purchasedItem.entitlementId;
    });

    await t.test("2.7. Requesting secure download URL returns signed S3 URL with attachment disposition", async () => {
      assert.ok(entitlementId, "entitlementId должен быть получен из библиотеки");
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/cabinet/files/${entitlementId}/download-url`,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${customerToken}`,
        },
        payload: JSON.stringify({}),
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);
      assert.equal(json.success, true);
      assert.ok(json.data.downloadUrl);
      assert.ok(json.data.downloadUrl.includes("disposition=attachment"));
      assert.equal(json.data.expiresInSeconds, 600);

      // Проверяем инкремент счетчика скачиваний
      const ent = await prisma.purchaseEntitlement.findUnique({ where: { id: entitlementId! } });
      assert.equal(ent?.downloadCount, 1);
    });
  } finally {
    // =========================================================================
    // ГАРАНТИРОВАННАЯ ОЧИСТКА ТЕСТОВЫХ СУЩНОСТЕЙ В LEKALO_TEST
    // =========================================================================
    try {
      // 1. Очистка корзины покупателя
      const userCarts = await prisma.cart.findMany({ where: { userId: customerId }, select: { id: true } });
      if (userCarts.length > 0) {
        await prisma.cartItem.deleteMany({ where: { cartId: { in: userCarts.map((c) => c.id) } } });
      }

      // 2. Очистка загрузок и прав доступа
      if (customerId) {
        await prisma.downloadLog.deleteMany({ where: { userId: customerId } });
        await prisma.purchaseEntitlement.deleteMany({ where: { userId: customerId } });
      }

      // 3. Очистка платежей и заказов
      if (paymentId) {
        await prisma.paymentWebhookEvent.deleteMany({ where: { paymentId: paymentId } });
      }
      if (testOrderId) {
        await prisma.payment.deleteMany({ where: { orderId: testOrderId } });
        await prisma.orderItem.deleteMany({ where: { orderId: testOrderId } });
        await prisma.order.deleteMany({ where: { id: testOrderId } });
      }

      // 4. Очистка файлов выкройки
      if (testVarId) {
        const dfs = await prisma.digitalFile.findMany({ where: { variantId: testVarId }, select: { id: true } });
        const dfIds = dfs.map((d) => d.id);
        if (dfIds.length > 0) {
          await prisma.digitalFile.updateMany({ where: { id: { in: dfIds } }, data: { currentVersionId: null } });
          await prisma.fileVersion.deleteMany({ where: { digitalFileId: { in: dfIds } } });
          await prisma.digitalFile.deleteMany({ where: { id: { in: dfIds } } });
        }
        await prisma.productVariant.deleteMany({ where: { id: testVarId } });
      }

      // 5. Очистка тестового товара и категории
      if (testProdId) {
        await prisma.product.deleteMany({ where: { id: testProdId } });
      }
      if (testCatId) {
        await prisma.category.deleteMany({ where: { id: testCatId } });
      }

      // 6. Очистка корзины и пользователя
      await prisma.cart.deleteMany({ where: { userId: customerId } });
      await prisma.user.deleteMany({ where: { id: customerId } });
    } catch (cleanupErr) {
      console.error("Cleanup error in Stage 5.10 test:", cleanupErr);
    }

    await app.close();
  }
});
