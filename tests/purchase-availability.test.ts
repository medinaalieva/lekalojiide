import test from "node:test";
import assert from "node:assert/strict";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import fastifyCookie from "@fastify/cookie";
import { AppModule } from "../src/app.module";
import { AppExceptionFilter } from "../src/common/filters/app-exception.filter";
import { prisma } from "../src/lib/prisma";
import { signAccessToken } from "../src/utils/jwt";
import { Role } from "@prisma/client";
import { MIN_PRODUCTION_PATTERN_SIZE_BYTES } from "../src/utils/pattern-availability";

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

test("Stage 5.9: Purchase Guard & PDF Availability Enforcement", async (t) => {
  // Pre-flight check: verify current database is strictly lekalo_test with cold-start tolerance
  const dbName = await ensureDbConnected();
  assert.equal(dbName, "lekalo_test", "Safety Guard: Must run strictly against lekalo_test");

  const app = await createTestApp();

  const customerId = "00000000-0000-4000-8000-0000000059c1";
  await prisma.user.upsert({
    where: { id: customerId },
    update: { role: Role.CUSTOMER },
    create: {
      id: customerId,
      email: "stage59-customer@test-lekalo-zhiide.local",
      role: Role.CUSTOMER,
      firstName: "Зарина",
      lastName: "Тестовая",
    },
  });

  const customerToken = signAccessToken({
    sub: customerId,
    email: "stage59-customer@test-lekalo-zhiide.local",
    role: Role.CUSTOMER,
    sessionId: "stage-59-session-1",
  });

  let testCatId: string | null = null;
  let testProdId: string | null = null;
  let varNoPdfId: string | null = null;
  let varDemoPdfId: string | null = null;
  let varGenuinePdfId: string | null = null;
  let varSecondNoPdfId: string | null = null;
  let varDeactivatablePdfId: string | null = null;
  let deactivatableDfId: string | null = null;

  try {
    // -------------------------------------------------------------------------
    // ПОДГОТОВКА ТЕСТОВЫХ СУЩНОСТЕЙ В LEKALO_TEST
    // -------------------------------------------------------------------------
    // Очищаем возможные артефакты от прерванных тестов
    const prevProds = await prisma.product.findMany({
      where: { slug: { startsWith: "zhaket-ala-too-stage-59" } },
      select: { id: true },
    });
    for (const p of prevProds) {
      const vars = await prisma.productVariant.findMany({ where: { productId: p.id }, select: { id: true } });
      const vIds = vars.map((v) => v.id);
      if (vIds.length > 0) {
        const dfs = await prisma.digitalFile.findMany({ where: { variantId: { in: vIds } }, select: { id: true } });
        const dfIds = dfs.map((d) => d.id);
        if (dfIds.length > 0) {
          await prisma.digitalFile.updateMany({ where: { id: { in: dfIds } }, data: { currentVersionId: null } });
          await prisma.fileVersion.deleteMany({ where: { digitalFileId: { in: dfIds } } });
          await prisma.digitalFile.deleteMany({ where: { id: { in: dfIds } } });
        }
        await prisma.productVariant.deleteMany({ where: { productId: p.id } });
      }
      await prisma.product.delete({ where: { id: p.id } }).catch(() => {});
    }
    await prisma.category.deleteMany({ where: { slug: { startsWith: "stage-59-category" } } }).catch(() => {});

    const runId = Math.random().toString(36).substring(2, 8);
    const catSlug = `stage-59-category-${runId}`;
    const prodSlug = `zhaket-ala-too-stage-59-${runId}`;

    const cat = await prisma.category.create({
      data: {
        title: `Категория Stage 5.9 (${runId})`,
        slug: catSlug,
      },
    });
    testCatId = cat.id;

    const prod = await prisma.product.create({
      data: {
        title: `Жакет Ала-Тоо (${runId})`,
        slug: prodSlug,
        description: "Тестовый товар для проверки защиты покупки без готовых PDF",
        basePrice: 500,
        categoryId: testCatId,
        isActive: true,
      },
    });
    testProdId = prod.id;

    const sizes = await prisma.size.findMany({ take: 3, orderBy: { displayOrder: "asc" } });
    const heights = await prisma.height.findMany({ take: 2, orderBy: { displayOrder: "asc" } });
    const formats = await prisma.format.findMany({ take: 2, orderBy: { displayOrder: "asc" } });

    // 1. Вариант БЕЗ файла (отсутствует DigitalFile)
    const var1 = await prisma.productVariant.create({
      data: {
        productId: testProdId,
        sizeId: sizes[0].id,
        heightId: heights[0].id,
        formatId: formats[0].id,
        sku: "LZ-STG59-NO-PDF",
        isActive: true,
      },
    });
    varNoPdfId = var1.id;

    // 2. Вариант с DEMO PDF (79 байт, заглушка)
    const var2 = await prisma.productVariant.create({
      data: {
        productId: testProdId,
        sizeId: sizes[1].id,
        heightId: heights[0].id,
        formatId: formats[0].id,
        sku: "LZ-STG59-DEMO-PDF",
        isActive: true,
      },
    });
    varDemoPdfId = var2.id;

    const dfDemo = await prisma.digitalFile.create({
      data: {
        variantId: var2.id,
        title: "Демо-заглушка 79 байт",
        isActive: true,
      },
    });
    const fvDemo = await prisma.fileVersion.create({
      data: {
        digitalFileId: dfDemo.id,
        versionNumber: 1,
        s3Bucket: "lekalo-patterns",
        s3Key: `patterns/${var2.id}/demo-stub.pdf`,
        originalFileName: "zhaket-demo-stub.pdf",
        fileSizeBytes: BigInt(79), // < 1024 байт!
        mimeType: "application/pdf",
        checksumSha256: "0000000000000000000000000000000000000000000000000000000000000000",
        changelog: "Тестовая заглушка",
      },
    });
    await prisma.digitalFile.update({
      where: { id: dfDemo.id },
      data: { currentVersionId: fvDemo.id },
    });

    // 3. Вариант с НАСТОЯЩИМ производственным PDF (2560 байт, ISO 32000-1)
    const var3 = await prisma.productVariant.create({
      data: {
        productId: testProdId,
        sizeId: sizes[2].id,
        heightId: heights[0].id,
        formatId: formats[0].id,
        sku: "LZ-STG59-GENUINE-PDF",
        isActive: true,
      },
    });
    varGenuinePdfId = var3.id;

    const dfGenuine = await prisma.digitalFile.create({
      data: {
        variantId: var3.id,
        title: "Производственное лекало A4",
        isActive: true,
      },
    });
    const fvGenuine = await prisma.fileVersion.create({
      data: {
        digitalFileId: dfGenuine.id,
        versionNumber: 1,
        s3Bucket: "lekalo-patterns",
        s3Key: `patterns/${var3.id}/zhaket-ala-too-genuine-a4.pdf`,
        originalFileName: "zhaket-ala-too-44-164-170-a4.pdf",
        fileSizeBytes: BigInt(2560), // >= 1024 байт!
        mimeType: "application/pdf",
        checksumSha256: "1111111111111111111111111111111111111111111111111111111111111111",
        changelog: "Производственный релиз лекала",
      },
    });
    await prisma.digitalFile.update({
      where: { id: dfGenuine.id },
      data: { currentVersionId: fvGenuine.id },
    });

    // 4. Второй вариант БЕЗ файла (для проверки того, что наличие PDF у var3 не открывает покупку var4)
    const var4 = await prisma.productVariant.create({
      data: {
        productId: testProdId,
        sizeId: sizes[0].id,
        heightId: heights[1].id,
        formatId: formats[0].id,
        sku: "LZ-STG59-SECOND-NO-PDF",
        isActive: true,
      },
    });
    varSecondNoPdfId = var4.id;

    // 5. Вариант с PDF, который будет деактивирован во время теста
    const var5 = await prisma.productVariant.create({
      data: {
        productId: testProdId,
        sizeId: sizes[1].id,
        heightId: heights[1].id,
        formatId: formats[0].id,
        sku: "LZ-STG59-DEACTIVATABLE",
        isActive: true,
      },
    });
    varDeactivatablePdfId = var5.id;

    const dfDeactivatable = await prisma.digitalFile.create({
      data: {
        variantId: var5.id,
        title: "Временное лекало",
        isActive: true,
      },
    });
    deactivatableDfId = dfDeactivatable.id;
    const fvDeactivatable = await prisma.fileVersion.create({
      data: {
        digitalFileId: dfDeactivatable.id,
        versionNumber: 1,
        s3Bucket: "lekalo-patterns",
        s3Key: `patterns/${var5.id}/temp-pattern.pdf`,
        originalFileName: "zhaket-ala-too-temp.pdf",
        fileSizeBytes: BigInt(2048),
        mimeType: "application/pdf",
        checksumSha256: "2222222222222222222222222222222222222222222222222222222222222222",
      },
    });
    await prisma.digitalFile.update({
      where: { id: dfDeactivatable.id },
      data: { currentVersionId: fvDeactivatable.id },
    });

    // Очищаем корзину пользователя перед началом тестов
    const userCart = await prisma.cart.findFirst({ where: { userId: customerId } });
    if (userCart) {
      await prisma.cartItem.deleteMany({ where: { cartId: userCart.id } });
    }

    // =========================================================================
    // СЦЕНАРИЙ 1: Вариант без PDF нельзя добавить в корзину (400 PATTERN_FILE_NOT_READY)
    // =========================================================================
    await t.test("1. Variant without PDF cannot be added to cart (400 PATTERN_FILE_NOT_READY)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/cart/items",
        headers: { authorization: `Bearer ${customerToken}` },
        payload: { variantId: varNoPdfId },
      });

      assert.equal(res.statusCode, 400);
      const json = JSON.parse(res.payload);
      assert.equal(json.error?.code, "PATTERN_FILE_NOT_READY");
      assert.ok(json.error?.message.includes("готовится"), `Message should indicate pattern is being prepared: ${json.error?.message}`);
    });

    // =========================================================================
    // СЦЕНАРИЙ 2: Вариант с DEMO PDF (< 1 КБ или demo) нельзя добавить в корзину (400)
    // =========================================================================
    await t.test("2. Variant with DEMO stub PDF (< 1KB) cannot be added to cart (400 PATTERN_FILE_NOT_READY)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/cart/items",
        headers: { authorization: `Bearer ${customerToken}` },
        payload: { variantId: varDemoPdfId },
      });

      assert.equal(res.statusCode, 400);
      const json = JSON.parse(res.payload);
      assert.equal(json.error?.code, "PATTERN_FILE_NOT_READY");
      assert.ok(json.error?.message.includes("заглушка") || json.error?.message.includes("готовится"));
    });

    // =========================================================================
    // СЦЕНАРИЙ 3: Вариант с настоящим PDF (>= 1 КБ) успешно добавляется в корзину
    // =========================================================================
    let cartItemIdGenuine: string = "";
    await t.test("3. Variant with genuine production PDF is successfully added to cart", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/cart/items",
        headers: { authorization: `Bearer ${customerToken}` },
        payload: { variantId: varGenuinePdfId },
      });

      assert.equal(res.statusCode, 201);
      const json = JSON.parse(res.payload);
      assert.equal(json.data.items.length, 1);
      assert.equal(json.data.items[0].variantId, varGenuinePdfId);
      assert.equal(json.data.items[0].isAvailable, true);
      cartItemIdGenuine = json.data.items[0].id;
    });

    // =========================================================================
    // СЦЕНАРИЙ 4: Нельзя обновить позицию корзины на недоступный вариант
    // =========================================================================
    await t.test("4. Cannot update cart item to variant without ready PDF", async () => {
      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/cart/items/${cartItemIdGenuine}`,
        headers: { authorization: `Bearer ${customerToken}` },
        payload: { newVariantId: varNoPdfId },
      });

      assert.equal(res.statusCode, 400);
      const json = JSON.parse(res.payload);
      assert.equal(json.error?.code, "PATTERN_FILE_NOT_READY");

      // Проверяем, что исходный вариант в корзине не изменился
      const cartRes = await app.inject({
        method: "GET",
        url: "/api/v1/cart",
        headers: { authorization: `Bearer ${customerToken}` },
      });
      const cartJson = JSON.parse(cartRes.payload);
      assert.equal(cartJson.data.items[0].variantId, varGenuinePdfId);
    });

    // =========================================================================
    // СЦЕНАРИЙ 5: Checkout блокируется, если в корзине присутствует товар без PDF
    // =========================================================================
    await t.test("5. Checkout is blocked if PDF is missing from an item", async () => {
      // Имитируем ситуацию, когда товар каким-то образом попал в корзину напрямую в БД без файла
      const cart = await prisma.cart.findFirst({ where: { userId: customerId } });
      assert.ok(cart);

      const injectedItem = await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productVariantId: varNoPdfId!,
        },
      });

      try {
        const checkoutRes = await app.inject({
          method: "POST",
          url: "/api/v1/orders/checkout",
          headers: { authorization: `Bearer ${customerToken}` },
          payload: {
            customerEmail: "stage59-customer@test-lekalo-zhiide.local",
            customerName: "Зарина",
          },
        });

        assert.equal(checkoutRes.statusCode, 400);
        const json = JSON.parse(checkoutRes.payload);
        assert.equal(json.error?.code, "PATTERN_FILE_NOT_READY");
      } finally {
        // Удаляем искусственно внедренный элемент
        await prisma.cartItem.delete({ where: { id: injectedItem.id } });
      }
    });

    // =========================================================================
    // СЦЕНАРИЙ 6: Checkout блокируется, если файл стал недоступен после добавления
    // =========================================================================
    await t.test("6. Checkout is blocked if file was deactivated after adding to cart", async () => {
      // Добавляем деактивируемый вариант в корзину (пока он активен)
      const addRes = await app.inject({
        method: "POST",
        url: "/api/v1/cart/items",
        headers: { authorization: `Bearer ${customerToken}` },
        payload: { variantId: varDeactivatablePdfId },
      });
      assert.equal(addRes.statusCode, 201);

      // Деактивируем DigitalFile в БД
      await prisma.digitalFile.update({
        where: { id: deactivatableDfId! },
        data: { isActive: false },
      });

      // Проверяем, что в GET /api/v1/cart этот элемент помечен как isAvailable: false
      const cartRes = await app.inject({
        method: "GET",
        url: "/api/v1/cart",
        headers: { authorization: `Bearer ${customerToken}` },
      });
      const cartJson = JSON.parse(cartRes.payload);
      const deactivatedItem = cartJson.data.items.find((i: any) => i.variantId === varDeactivatablePdfId);
      assert.ok(deactivatedItem, "Deactivated item must be present in cart");
      assert.equal(deactivatedItem.isAvailable, false);
      assert.equal(deactivatedItem.unavailableReason, "NO_DIGITAL_FILE");

      // Пытаемся оформить заказ
      const checkoutRes = await app.inject({
        method: "POST",
        url: "/api/v1/orders/checkout",
        headers: { authorization: `Bearer ${customerToken}` },
        payload: {
          customerEmail: "stage59-customer@test-lekalo-zhiide.local",
          customerName: "Зарина",
        },
      });

      assert.equal(checkoutRes.statusCode, 400);
      const json = JSON.parse(checkoutRes.payload);
      assert.equal(json.error?.code, "PATTERN_FILE_NOT_READY");
    });

    // =========================================================================
    // СЦЕНАРИИ 7 & 8: Заказ не создается в БД, корзина полностью сохраняется
    // =========================================================================
    await t.test("7 & 8. Order is not created when blocked; cart is preserved atomically", async () => {
      const ordersCount = await prisma.order.count({ where: { userId: customerId } });
      assert.equal(ordersCount, 0, "No orders must exist in DB for customer");

      const cartRes = await app.inject({
        method: "GET",
        url: "/api/v1/cart",
        headers: { authorization: `Bearer ${customerToken}` },
      });
      const cartJson = JSON.parse(cartRes.payload);
      assert.equal(cartJson.data.items.length, 2, "Cart must still hold both items");
      assert.ok(cartJson.data.items.some((i: any) => i.variantId === varGenuinePdfId));
      assert.ok(cartJson.data.items.some((i: any) => i.variantId === varDeactivatablePdfId));
    });

    // =========================================================================
    // СЦЕНАРИЙ 9: Наличие PDF у одного варианта не открывает покупку для другого
    // =========================================================================
    await t.test("9. Having PDF on one variant does not open purchase for other variants", async () => {
      // varGenuinePdfId имеет PDF и готов к покупке.
      // varSecondNoPdfId принадлежит тому же товару, но НЕ имеет PDF.
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/cart/items",
        headers: { authorization: `Bearer ${customerToken}` },
        payload: { variantId: varSecondNoPdfId },
      });

      assert.equal(res.statusCode, 400);
      const json = JSON.parse(res.payload);
      assert.equal(json.error?.code, "PATTERN_FILE_NOT_READY");

      // Проверяем детальную выдачу каталога: varGenuinePdfId isAvailable: true, varSecondNoPdfId isAvailable: false
      const catRes = await app.inject({
        method: "GET",
        url: `/api/v1/catalog/products/${prod.slug}`,
      });
      assert.equal(catRes.statusCode, 200);
      const catJson = JSON.parse(catRes.payload);
      const varGenCatalog = catJson.data.variants.find((v: any) => v.variantId === varGenuinePdfId);
      const varSecondCatalog = catJson.data.variants.find((v: any) => v.variantId === varSecondNoPdfId);

      assert.equal(varGenCatalog.isAvailable, true);
      assert.equal(varSecondCatalog.isAvailable, false);
      assert.equal(varSecondCatalog.unavailableReason, "NO_DIGITAL_FILE");
    });

    // =========================================================================
    // СЦЕНАРИЙ 10: Прямой API-запрос не может обойти проверку
    // =========================================================================
    await t.test("10. Direct API call cannot bypass check by passing client flags", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/cart/items",
        headers: { authorization: `Bearer ${customerToken}` },
        payload: {
          variantId: varNoPdfId,
          isAvailable: true,
          available: true,
          bypass: true,
          force: true,
        },
      });

      assert.equal(res.statusCode, 400);
      const json = JSON.parse(res.payload);
      assert.equal(json.error?.code, "PATTERN_FILE_NOT_READY");
    });

  } finally {
    // -------------------------------------------------------------------------
    // БЕЗОПАСНАЯ ОЧИСТКА ТЕСТОВЫХ ДАННЫХ ИЗ LEKALO_TEST
    // -------------------------------------------------------------------------
    // 1. Очистка корзин
    const userCart = await prisma.cart.findFirst({ where: { userId: customerId } });
    if (userCart) {
      await prisma.cartItem.deleteMany({ where: { cartId: userCart.id } });
      await prisma.cart.delete({ where: { id: userCart.id } }).catch(() => {});
    }

    // 2. Очистка файлов, версий и вариантов
    if (testProdId) {
      const variants = await prisma.productVariant.findMany({
        where: { productId: testProdId },
        select: { id: true },
      });
      const varIds = variants.map((v) => v.id);

      if (varIds.length > 0) {
        const dfs = await prisma.digitalFile.findMany({
          where: { variantId: { in: varIds } },
          select: { id: true },
        });
        const dfIds = dfs.map((d) => d.id);

        if (dfIds.length > 0) {
          await prisma.digitalFile.updateMany({
            where: { id: { in: dfIds } },
            data: { currentVersionId: null },
          });
          await prisma.fileVersion.deleteMany({
            where: { digitalFileId: { in: dfIds } },
          });
          await prisma.digitalFile.deleteMany({
            where: { id: { in: dfIds } },
          });
        }

        await prisma.productVariant.deleteMany({ where: { productId: testProdId } });
      }

      await prisma.product.delete({ where: { id: testProdId } }).catch(() => {});
    }

    // 3. Очистка категории и пользователя
    if (testCatId) {
      await prisma.category.delete({ where: { id: testCatId } }).catch(() => {});
    }
    await prisma.user.delete({ where: { id: customerId } }).catch(() => {});

    await app.close();
    await prisma.$disconnect();
  }
});
