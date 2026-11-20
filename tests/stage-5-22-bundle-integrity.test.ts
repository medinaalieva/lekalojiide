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
import { CatalogService } from "../src/modules/catalog/catalog.service";
import { calculateEffectivePrice } from "../src/utils/pricing";
import { Role, OrderStatus, EntitlementStatus, FileType, DifficultyLevel } from "@prisma/client";

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

function createSyntheticPdf(content: string, sizeBytes = 1500): Buffer {
  const header = "%PDF-1.4\n";
  const body = `1 0 obj\n<< /Title (${content}) >>\nendobj\n`;
  const padding = " ".repeat(Math.max(0, sizeBytes - header.length - body.length - 20));
  const trailer = `\nxref\n0 2\ntrailer\n<< >>\nstartxref\n0\n%%EOF`;
  return Buffer.from(header + body + padding + trailer, "utf-8");
}

test("Stage 5.22: Bundle Integrity & ALL Variant Verification", async (t) => {
  // Pre-flight database safety guard
  const dbName = await ensureDbConnected();
  assert.equal(dbName, "lekalo_test", "Safety Guard: Must run strictly against lekalo_test");

  const app = await createTestApp();
  const catalogService = app.get(CatalogService);
  const gateway = new MockPaymentGateway();

  const customerId = "00000000-0000-4000-8000-000000005b22";
  await prisma.user.upsert({
    where: { id: customerId },
    update: { role: Role.CUSTOMER },
    create: {
      id: customerId,
      email: "stage522-customer@test-lekalo-zhiide.local",
      role: Role.CUSTOMER,
      firstName: "Бермет",
      lastName: "Тестова",
      phone: "+996700889900",
    },
  });

  const customerToken = signAccessToken({
    sub: customerId,
    email: "stage522-customer@test-lekalo-zhiide.local",
    role: Role.CUSTOMER,
    sessionId: "stage-522-session-1",
  });

  // Track created synthetic entities for guaranteed cleanup
  let testCategoryId: string | null = null;
  let bundleProductId: string | null = null;
  let noBundleProductId: string | null = null;
  let testOrderId: string | null = null;

  try {
    // -------------------------------------------------------------------------
    // 0. Подготовка справочников (Размеры 42, 44; Рост 164-170; Форматы A4, PLOTTER_900)
    // -------------------------------------------------------------------------
    const size42 = await prisma.size.findUnique({ where: { code: "42" } });
    const size44 = await prisma.size.findUnique({ where: { code: "44" } });
    const sizeAll = await prisma.size.findUnique({ where: { code: "ALL" } });
    const height164 = await prisma.height.findFirst({ where: { code: "164-170" } });
    const formatA4 = await prisma.format.findFirst({ where: { code: "A4" } });
    const formatPlotter = await prisma.format.findFirst({ where: { code: "PLOTTER_900" } });

    assert.ok(size42 && size44 && sizeAll, "Базовые размеры (42, 44, ALL) должны существовать");
    assert.ok(height164, "Ростовка 164-170 должна существовать");
    assert.ok(formatA4 && formatPlotter, "Форматы A4 и PLOTTER_900 должны существовать");

    // Создаем тестовую категорию
    const testCat = await prisma.category.create({
      data: {
        title: "Тестовая категория 5.22",
        slug: `test-cat-stage-522-${Date.now()}`,
      },
    });
    testCategoryId = testCat.id;

    // =========================================================================
    // СЦЕНАРИЙ 1: Генерация ALL-вариантов для товара с hasBundleOption = true
    // =========================================================================
    let bundleVariantA4Id: string = "";
    let bundleVariantPlotterId: string = "";
    let childVar42A4Id: string = "";
    let childVar44A4Id: string = "";
    let childVar42PlotterId: string = "";
    let childVar44PlotterId: string = "";

    await t.test("1. Generation of ALL for a product with bundle enabled (hasBundleOption = true)", async () => {
      const prod = await prisma.product.create({
        data: {
          title: "Тестовое пальто Бандл 5.22",
          slug: `test-palto-bundle-522-${Date.now()}`,
          categoryId: testCategoryId!,
          basePrice: 500,
          bundlePrice: 1200,
          hasBundleOption: true,
          difficultyLevel: DifficultyLevel.INTERMEDIATE,
          description: "Тестовое описание для проверки бандла",
          isActive: true,
        },
      });
      bundleProductId = prod.id;

      // Пакетная генерация: 2 размера (42, 44) x 1 рост (164-170) x 2 формата (A4, PLOTTER_900)
      const res = await catalogService.batchGenerateVariants(bundleProductId, {
        sizes: ["42", "44"],
        heights: ["164-170"],
        formats: ["A4", "PLOTTER_900"],
      });

      // 4 индивидуальных + 2 ALL варианта = 6 вариантов
      assert.equal(res.createdOrUpdatedCount, 6, "Должно быть создано 6 вариантов (4 обычных + 2 ALL)");

      const variants = await prisma.productVariant.findMany({
        where: { productId: bundleProductId },
        include: { size: true, height: true, format: true },
      });
      assert.equal(variants.length, 6);

      const allVariants = variants.filter((v) => v.size.code === "ALL");
      assert.equal(allVariants.length, 2, "Должно быть ровно 2 ALL-варианта (по одному на каждый формат)");

      const varA4 = allVariants.find((v) => v.format.code === "A4");
      const varPlotter = allVariants.find((v) => v.format.code === "PLOTTER_900");
      assert.ok(varA4 && varPlotter, "Должны существовать ALL-A4 и ALL-PLOTTER_900");
      assert.equal(varA4.isActive, true);
      assert.equal(varPlotter.isActive, true);

      bundleVariantA4Id = varA4.id;
      bundleVariantPlotterId = varPlotter.id;

      const c42A4 = variants.find((v) => v.size.code === "42" && v.format.code === "A4");
      const c44A4 = variants.find((v) => v.size.code === "44" && v.format.code === "A4");
      const c42Plotter = variants.find((v) => v.size.code === "42" && v.format.code === "PLOTTER_900");
      const c44Plotter = variants.find((v) => v.size.code === "44" && v.format.code === "PLOTTER_900");
      assert.ok(c42A4 && c44A4 && c42Plotter && c44Plotter);

      childVar42A4Id = c42A4.id;
      childVar44A4Id = c44A4.id;
      childVar42PlotterId = c42Plotter.id;
      childVar44PlotterId = c44Plotter.id;
    });

    // =========================================================================
    // СЦЕНАРИЙ 2: Повторная генерация без дубликатов (idempotency)
    // =========================================================================
    await t.test("2. Repeated generation without duplicates (idempotency)", async () => {
      assert.ok(bundleProductId);
      const res = await catalogService.batchGenerateVariants(bundleProductId, {
        sizes: ["42", "44"],
        heights: ["164-170"],
        formats: ["A4", "PLOTTER_900"],
      });

      assert.equal(res.createdOrUpdatedCount, 6);

      const totalVariants = await prisma.productVariant.count({
        where: { productId: bundleProductId },
      });
      assert.equal(totalVariants, 6, "Повторный вызов не должен плодить дубликаты");
    });

    // =========================================================================
    // СЦЕНАРИЙ 3: Отсутствие ALL для товара с hasBundleOption = false и деактивация при отключении
    // =========================================================================
    await t.test("3. Absence of ALL for product without bundle option (hasBundleOption = false)", async () => {
      const noBundleProd = await prisma.product.create({
        data: {
          title: "Товар без бандла 5.22",
          slug: `test-prod-nobundle-522-${Date.now()}`,
          categoryId: testCategoryId!,
          basePrice: 400,
          hasBundleOption: false,
          difficultyLevel: DifficultyLevel.BEGINNER,
          description: "Товар без комплекта",
          isActive: true,
        },
      });
      noBundleProductId = noBundleProd.id;

      await catalogService.batchGenerateVariants(noBundleProductId, {
        sizes: ["42", "44"],
        heights: ["164-170"],
        formats: ["A4"],
      });

      const variants = await prisma.productVariant.findMany({
        where: { productId: noBundleProductId },
        include: { size: true },
      });
      assert.equal(variants.length, 2, "Только 2 обычных размера должны быть созданы");
      const hasAll = variants.some((v) => v.size.code === "ALL");
      assert.equal(hasAll, false, "ALL-вариант не должен быть создан");

      // Проверка отключения опции бандла у первого товара
      await catalogService.updateProduct(bundleProductId!, { hasBundleOption: false });
      const deactivatedAll = await prisma.productVariant.findMany({
        where: { productId: bundleProductId!, size: { code: "ALL" } },
      });
      assert.ok(deactivatedAll.length > 0);
      assert.ok(deactivatedAll.every((v) => v.isActive === false), "Все ALL-варианты должны быть деактивированы при hasBundleOption=false");

      // Восстанавливаем обратно
      await catalogService.updateProduct(bundleProductId!, { hasBundleOption: true });
      const reactivatedAll = await prisma.productVariant.findMany({
        where: { productId: bundleProductId!, size: { code: "ALL" } },
      });
      assert.ok(reactivatedAll.every((v) => v.isActive === true), "ALL-варианты должны снова стать активными");
    });

    // =========================================================================
    // СЦЕНАРИЙ 4: Правильный расчет цены комплекта
    // =========================================================================
    await t.test("4. Correct bundle pricing (calculateEffectivePrice)", async () => {
      // 1. Обычный расчет с bundlePrice
      const pricingWithBundle = calculateEffectivePrice(
        { basePrice: 500, bundlePrice: 1200 },
        { isBundleVariant: true }
      );
      assert.equal(pricingWithBundle.currentPrice, 1200);
      assert.equal(pricingWithBundle.isBundle, true);

      // 2. Расчет при bundlePrice = null (fallback к basePrice)
      const pricingFallback = calculateEffectivePrice(
        { basePrice: 500, bundlePrice: null },
        { isBundleVariant: true }
      );
      assert.equal(pricingFallback.currentPrice, 500);
      assert.equal(pricingFallback.isBundle, true);

      // 3. Расчет при явном priceOverride
      const pricingOverride = calculateEffectivePrice(
        { basePrice: 500, bundlePrice: 1200 },
        { isBundleVariant: true, priceOverride: 990 }
      );
      assert.equal(pricingOverride.currentPrice, 990);
      assert.equal(pricingOverride.isBundle, true);
    });

    // =========================================================================
    // СЦЕНАРИЙ 5: Отказ в покупке комплекта без реальных PDF (Purchase Guard)
    // =========================================================================
    await t.test("5. Rejection of bundle purchase without real PDFs (Purchase Guard)", async () => {
      // Очищаем корзину пользователя
      const userCart = await prisma.cart.findFirst({ where: { userId: customerId } });
      if (userCart) {
        await prisma.cartItem.deleteMany({ where: { cartId: userCart.id } });
      }

      // Попытка добавить ALL-вариант в корзину, когда у дочерних размеров нет файлов
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/cart/items",
        headers: { authorization: `Bearer ${customerToken}` },
        payload: { variantId: bundleVariantA4Id },
      });

      assert.equal(res.statusCode, 400);
      const json = JSON.parse(res.payload);
      assert.equal(json.error?.code, "PATTERN_FILE_NOT_READY");
      assert.ok(json.error?.message.includes("готовится"), "Сообщение должно указывать, что выкройка готовится");
    });

    // =========================================================================
    // СЦЕНАРИЙ 6: Добавление комплекта в корзину при наличии настоящих PDF у всех размеров
    // =========================================================================
    let genuineDf42Id: string = "";
    let genuineDf44Id: string = "";

    await t.test("6. Adding bundle to cart succeeds when genuine production PDFs are ready", async () => {
      // Загружаем настоящие PDF (>= 1 КБ) для дочерних размеров формата A4 (42 и 44)
      const pdf42Buf = createSyntheticPdf("Genuine PDF Size 42 A4", 2048);
      const pdf44Buf = createSyntheticPdf("Genuine PDF Size 44 A4", 2048);

      const df42 = await prisma.digitalFile.create({
        data: {
          variantId: childVar42A4Id,
          title: "Выкройка размер 42 А4",
          fileType: FileType.PATTERN,
          isActive: true,
        },
      });
      genuineDf42Id = df42.id;
      const fv42 = await prisma.fileVersion.create({
        data: {
          digitalFileId: df42.id,
          versionNumber: 1,
          fileSizeBytes: BigInt(pdf42Buf.length),
          originalFileName: "palto-bundle-42-164-170-A4.pdf",
          mimeType: "application/pdf",
          s3Bucket: "pattern-files",
          s3Key: "patterns/test/palto-42.pdf",
          checksumSha256: "4242424242424242424242424242424242424242424242424242424242424242",
        },
      });
      await prisma.digitalFile.update({
        where: { id: df42.id },
        data: { currentVersionId: fv42.id },
      });

      const df44 = await prisma.digitalFile.create({
        data: {
          variantId: childVar44A4Id,
          title: "Выкройка размер 44 А4",
          fileType: FileType.PATTERN,
          isActive: true,
        },
      });
      genuineDf44Id = df44.id;
      const fv44 = await prisma.fileVersion.create({
        data: {
          digitalFileId: df44.id,
          versionNumber: 1,
          fileSizeBytes: BigInt(pdf44Buf.length),
          originalFileName: "palto-bundle-44-164-170-A4.pdf",
          mimeType: "application/pdf",
          s3Bucket: "pattern-files",
          s3Key: "patterns/test/palto-44.pdf",
          checksumSha256: "4444444444444444444444444444444444444444444444444444444444444444",
        },
      });
      await prisma.digitalFile.update({
        where: { id: df44.id },
        data: { currentVersionId: fv44.id },
      });

      // Теперь оба дочерних размера формата A4 имеют действующие файлы! Добавляем ALL-A4 в корзину:
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/cart/items",
        headers: { authorization: `Bearer ${customerToken}` },
        payload: { variantId: bundleVariantA4Id },
      });

      assert.equal(res.statusCode, 201);
      const json = JSON.parse(res.payload);
      assert.equal(json.success, true);
      assert.equal(json.data.items.length, 1);
      const item = json.data.items[0];
      assert.equal(item.variantId, bundleVariantA4Id);
      assert.equal(item.isBundle, true);
      assert.equal(item.price, 1200);
      assert.equal(item.isAvailable, true);
    });

    // =========================================================================
    // СЦЕНАРИЙ 7: Отказ в оформлении заказа при недоступном бандле
    // =========================================================================
    await t.test("7. Checkout is blocked if any item in cart lacks real PDFs", async () => {
      // Добавим в корзину напрямую через базу ALL-PLOTTER (у которого нет файлов)
      const userCart = await prisma.cart.findFirst({ where: { userId: customerId } });
      assert.ok(userCart);

      const badItem = await prisma.cartItem.create({
        data: {
          cartId: userCart.id,
          productVariantId: bundleVariantPlotterId,
        },
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/orders/checkout",
        headers: {
          authorization: `Bearer ${customerToken}`,
          "content-type": "application/json",
        },
        payload: JSON.stringify({
          customerName: "Бермет Тестова",
          customerPhone: "+996700889900",
        }),
      });

      assert.equal(res.statusCode, 400);
      const json = JSON.parse(res.payload);
      assert.equal(json.error?.code, "PATTERN_FILE_NOT_READY");

      // Удаляем невалидную позицию перед следующим шагом
      await prisma.cartItem.delete({ where: { id: badItem.id } });
    });

    // =========================================================================
    // СЦЕНАРИЙ 8: Сохранение корзины и отсутствие заказа при отказе
    // =========================================================================
    await t.test("8. Absence of order on Purchase Guard rejection; cart preserved atomically", async () => {
      // Проверяем, что в базе нет заказов для этого покупателя
      const ordersCount = await prisma.order.count({ where: { userId: customerId } });
      assert.equal(ordersCount, 0, "Заказ не должен был создаться");

      // Корзина должна сохранить валидный бандл A4
      const cartRes = await app.inject({
        method: "GET",
        url: "/api/v1/cart",
        headers: { authorization: `Bearer ${customerToken}` },
      });
      assert.equal(cartRes.statusCode, 200);
      const cartJson = JSON.parse(cartRes.payload);
      assert.equal(cartJson.data.items.length, 1);
      assert.equal(cartJson.data.items[0].variantId, bundleVariantA4Id);
    });

    // =========================================================================
    // СЦЕНАРИЙ 9: Корректная выдача прав доступа при покупке бандла (entitlements)
    // =========================================================================
    await t.test("9. Correct entitlement issuance for all child sizes in paid bundle", async () => {
      // Оформляем заказ на валидный бандл ALL-A4
      const checkoutRes = await app.inject({
        method: "POST",
        url: "/api/v1/orders/checkout",
        headers: {
          authorization: `Bearer ${customerToken}`,
          "content-type": "application/json",
        },
        payload: JSON.stringify({
          customerName: "Бермет Тестова",
          customerPhone: "+996700889900",
        }),
      });

      assert.equal(checkoutRes.statusCode, 201);
      const checkoutJson = JSON.parse(checkoutRes.payload);
      testOrderId = checkoutJson.data.orderId;
      assert.equal(checkoutJson.data.totalAmount, 1200);

      // Инициируем оплату
      const payRes = await app.inject({
        method: "POST",
        url: `/api/v1/orders/${testOrderId}/payment`,
        headers: { authorization: `Bearer ${customerToken}` },
      });
      assert.equal(payRes.statusCode, 200);
      const payJson = JSON.parse(payRes.payload);
      const paymentId = payJson.data.paymentId;

      // Эмулируем вебхук подтверждения оплаты
      const webhookPayload = {
        orderId: testOrderId,
        paymentId: paymentId,
        amount: 1200,
        currency: "KGS",
        status: "SUCCEEDED",
        externalId: `mock_bundle_tx_${Date.now()}`,
      };
      const signature = gateway.generateSignature(webhookPayload);

      const webhookRes = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/payments/mock",
        headers: {
          "content-type": "application/json",
          "x-signature": signature,
        },
        payload: JSON.stringify(webhookPayload),
      });

      assert.equal(webhookRes.statusCode, 200);
      const webhookJson = JSON.parse(webhookRes.payload);
      assert.equal(webhookJson.data.received, true);
      assert.equal(webhookJson.data.status, OrderStatus.PAID);

      // Проверяем выданные права доступа (PurchaseEntitlement) в базе данных
      const entitlements = await prisma.purchaseEntitlement.findMany({
        where: { userId: customerId, status: EntitlementStatus.ACTIVE },
        include: { variant: { include: { size: true, height: true, format: true } } },
      });

      // Покупатель должен получить права на оба размера (42 и 44) формата A4
      assert.equal(entitlements.length, 2, "Должно быть выдано ровно 2 права доступа (по одному на каждый размер)");

      const entSizes = entitlements.map((e) => e.variant.size.code).sort();
      assert.deepEqual(entSizes, ["42", "44"], "Права доступа должны соответствовать входящим размерам 42 и 44");
      assert.ok(entitlements.every((e) => e.variant.format.code === "A4"), "Все права должны относиться к формату A4");
    });

    // =========================================================================
    // СЦЕНАРИЙ 10: Невозможность получить файлы, не входящие в комплект
    // =========================================================================
    await t.test("10. Impossibility of getting files not included in the bundle", async () => {
      // 1. Проверяем в личном кабинете: отдаются ли только оплаченные размеры
      const libRes = await app.inject({
        method: "GET",
        url: "/api/v1/cabinet/library",
        headers: { authorization: `Bearer ${customerToken}` },
      });

      assert.equal(libRes.statusCode, 200);
      const libJson = JSON.parse(libRes.payload);
      assert.equal(libJson.data.length, 2);

      const receivedFormats = libJson.data.map((item: any) => item.format);
      assert.ok(receivedFormats.every((f: string) => f === "A4"), "В кабинете не должно быть формата PLOTTER_900");

      // 2. Проверяем, что в базе нет прав доступа на PLOTTER_900
      const plotterEntitlement = await prisma.purchaseEntitlement.findFirst({
        where: {
          userId: customerId,
          variantId: childVar42PlotterId,
        },
      });
      assert.equal(plotterEntitlement, null, "Право доступа на неоплаченный формат PLOTTER_900 не должно существовать");

      // 3. Пробуем запросить ссылку на скачивание с несуществующим / чужим entitlementId
      const fakeEntitlementId = "00000000-0000-4000-8000-000000009999";
      const downloadRes = await app.inject({
        method: "POST",
        url: `/api/v1/cabinet/files/${fakeEntitlementId}/download-url`,
        headers: { authorization: `Bearer ${customerToken}` },
      });
      assert.equal(downloadRes.statusCode, 404);
    });
  } finally {
    // -------------------------------------------------------------------------
    // ПОЛНАЯ ИЗОЛИРОВАННАЯ ОЧИСТКА ТЕСТОВЫХ СУЩНОСТЕЙ
    // -------------------------------------------------------------------------
    try {
      await prisma.purchaseEntitlement.deleteMany({ where: { userId: customerId } }).catch(() => {});
      if (testOrderId) {
        await prisma.paymentWebhookEvent.deleteMany({ where: { payment: { orderId: testOrderId } } }).catch(() => {});
        await prisma.payment.deleteMany({ where: { orderId: testOrderId } }).catch(() => {});
        await prisma.orderItem.deleteMany({ where: { orderId: testOrderId } }).catch(() => {});
        await prisma.order.delete({ where: { id: testOrderId } }).catch(() => {});
      }
      const userCart = await prisma.cart.findFirst({ where: { userId: customerId } });
      if (userCart) {
        await prisma.cartItem.deleteMany({ where: { cartId: userCart.id } }).catch(() => {});
      }

      const prodIds: string[] = [];
      if (bundleProductId) prodIds.push(bundleProductId);
      if (noBundleProductId) prodIds.push(noBundleProductId);
      for (const pId of prodIds) {
        const variants = await prisma.productVariant.findMany({ where: { productId: pId }, select: { id: true } });
        const vIds = variants.map((v) => v.id);
        if (vIds.length > 0) {
          const dfs = await prisma.digitalFile.findMany({ where: { variantId: { in: vIds } }, select: { id: true } });
          const dfIds = dfs.map((d) => d.id);
          if (dfIds.length > 0) {
            await prisma.digitalFile.updateMany({ where: { id: { in: dfIds } }, data: { currentVersionId: null } });
            await prisma.fileVersion.deleteMany({ where: { digitalFileId: { in: dfIds } } });
            await prisma.digitalFile.deleteMany({ where: { id: { in: dfIds } } });
          }
          await prisma.productVariant.deleteMany({ where: { productId: pId } });
        }
        await prisma.product.delete({ where: { id: pId } }).catch(() => {});
      }

      if (testCategoryId) {
        await prisma.category.delete({ where: { id: testCategoryId } }).catch(() => {});
      }
      await prisma.user.delete({ where: { id: customerId } }).catch(() => {});
    } catch (cleanupErr) {
      console.error("Cleanup error in Stage 5.22 test suite:", cleanupErr);
    }
    await app.close();
  }
});
