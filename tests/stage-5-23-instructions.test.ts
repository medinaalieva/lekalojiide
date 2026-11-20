/**
 * LEKALO ZHIIDE — STAGE 5.23: SEWING INSTRUCTIONS SUITE
 *
 * Полное тестирование загрузки, версионирования, защиты и раздачи инструкций по пошиву:
 *  1. ADMIN может загрузить корректный PDF (201 Created).
 *  2. Неавторизованный пользователь не может загрузить файл (401 Unauthorized).
 *  3. Пользователь без роли ADMIN получает отказ (403 Forbidden).
 *  4. HTML-файл с расширением PDF отклоняется (400 INVALID_FILE_TYPE).
 *  5. Пустой и поврежденный PDF отклоняется (400 EMPTY_FILE / CORRUPTED_OR_INVALID_PDF).
 *  6. Повторная загрузка создает новую версию (v2), сохраняя историю.
 *  7. Инструкция привязана к правильному товару.
 *  8. Неактивная инструкция недоступна покупателю (404 INSTRUCTION_NOT_FOUND).
 *  9. Покупатель без entitlement не может скачать инструкцию (403 FORBIDDEN).
 * 10. Покупатель с entitlement может скачать инструкцию (200 OK + presigned URL).
 * 11. Нельзя скачать инструкцию другого товара (403 FORBIDDEN).
 * 12. Деактивация не нарушает историю версий (isActive: false, запись сохраняется).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import fastifyCookie from "@fastify/cookie";
import { AppModule } from "../src/app.module";
import { AppExceptionFilter } from "../src/common/filters/app-exception.filter";
import { prisma } from "../src/lib/prisma";
import { signAccessToken } from "../src/utils/jwt";
import { Role, OrderStatus, EntitlementStatus } from "@prisma/client";

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

function createValidInstructionPdf(title = "Инструкция по пошиву", sizeBytes = 2048): Buffer {
  const header = "%PDF-1.4\n";
  const body =
`1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] >>
endobj
`;
  const paddingComment = `% ${title} ` + "X".repeat(Math.max(0, sizeBytes - 300));
  const trailer =
`\nxref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer
<< /Size 4 /Root 1 0 R >>
startxref
192
%%EOF`;
  return Buffer.from(header + body + paddingComment + trailer, "utf-8");
}

test("Stage 5.23: Sewing Instructions Upload & Management Verification", async (t) => {
  // Pre-flight database safety guard
  const dbName = await ensureDbConnected();
  assert.equal(dbName, "lekalo_test", "Safety Guard: Must run strictly against lekalo_test");

  const app = await createTestApp();

  // 1. Создаем тестовых пользователей (ADMIN и CUSTOMER)
  const adminId = "00000000-0000-4000-8000-000000005a23";
  await prisma.user.upsert({
    where: { id: adminId },
    update: { role: Role.ADMIN },
    create: {
      id: adminId,
      email: "stage523-admin@test-lekalo-zhiide.local",
      role: Role.ADMIN,
      firstName: "Адилет",
      lastName: "Админов",
      phone: "+996700112233",
    },
  });

  const adminToken = signAccessToken({
    sub: adminId,
    email: "stage523-admin@test-lekalo-zhiide.local",
    role: Role.ADMIN,
    sessionId: "stage-523-admin-session",
  });

  const customerId = "00000000-0000-4000-8000-000000005c23";
  await prisma.user.upsert({
    where: { id: customerId },
    update: { role: Role.CUSTOMER },
    create: {
      id: customerId,
      email: "stage523-customer@test-lekalo-zhiide.local",
      role: Role.CUSTOMER,
      firstName: "Айгуль",
      lastName: "Покупательница",
      phone: "+996700445566",
    },
  });

  const customerToken = signAccessToken({
    sub: customerId,
    email: "stage523-customer@test-lekalo-zhiide.local",
    role: Role.CUSTOMER,
    sessionId: "stage-523-customer-session",
  });

  // Track synthetic IDs for guaranteed cleanup
  let testCategoryId: string = "";
  let productAId: string = "";
  let productBId: string = "";
  let variantAId: string = "";
  let variantBId: string = "";
  let testOrderId: string = "";
  let entitlementAId: string = "";

  let instructionV1Id: string = "";
  let instructionV2Id: string = "";

  try {
    // 2. Создаем тестовую категорию и два товара (A и B)
    const category = await prisma.category.create({
      data: {
        title: "TEST-INST Категория инструкций",
        slug: `test-inst-cat-${Date.now()}`,
        displayOrder: 99,
        isActive: true,
      },
    });
    testCategoryId = category.id;

    const prodA = await prisma.product.create({
      data: {
        categoryId: category.id,
        title: "TEST-INST Пальто Модель А",
        slug: `test-inst-palto-a-${Date.now()}`,
        description: "Тестовая модель А для проверки инструкций",
        basePrice: 400,
        bundlePrice: 1500,
        hasBundleOption: true,
        isActive: true,
      },
    });
    productAId = prodA.id;

    const prodB = await prisma.product.create({
      data: {
        categoryId: category.id,
        title: "TEST-INST Платье Модель Б",
        slug: `test-inst-plate-b-${Date.now()}`,
        description: "Тестовая модель Б для проверки изоляции инструкций",
        basePrice: 300,
        bundlePrice: null,
        hasBundleOption: false,
        isActive: true,
      },
    });
    productBId = prodB.id;

    // Получаем стандартные размеры, рост и формат для вариантов
    const size42 = await prisma.size.findFirst({ where: { code: "42" } });
    const height164 = await prisma.height.findFirst({ where: { code: "164-170" } });
    const formatA4 = await prisma.format.findFirst({ where: { code: "A4" } });

    assert.ok(size42 && height164 && formatA4, "Базовые справочники должны присутствовать в БД");

    const varA = await prisma.productVariant.create({
      data: {
        productId: productAId,
        sizeId: size42.id,
        heightId: height164.id,
        formatId: formatA4.id,
        sku: `TEST-INST-A-42-164-A4-${Date.now()}`,
        isActive: true,
      },
    });
    variantAId = varA.id;

    const varB = await prisma.productVariant.create({
      data: {
        productId: productBId,
        sizeId: size42.id,
        heightId: height164.id,
        formatId: formatA4.id,
        sku: `TEST-INST-B-42-164-A4-${Date.now()}`,
        isActive: true,
      },
    });
    variantBId = varB.id;

    // =========================================================================
    // СЦЕНАРИЙ 1: ADMIN может успешно загрузить корректный PDF
    // =========================================================================
    await t.test("1. ADMIN can upload valid PDF", async () => {
      const validPdf = createValidInstructionPdf("Инструкция по пошиву модели А", 2048);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/storage/upload-instruction",
        headers: {
          authorization: `Bearer ${adminToken}`,
          origin: "http://localhost:3000",
        },
        payload: {
          productId: productAId,
          title: "Инструкция по пошиву модели А",
          fileBase64: validPdf.toString("base64"),
          fileName: "instruction-palto-a.pdf",
          contentType: "application/pdf",
        },
      });

      assert.equal(res.statusCode, 201);
      const json = JSON.parse(res.payload);
      assert.equal(json.success, true);
      assert.ok(json.data.id, "Должен вернуться ID инструкции");
      assert.equal(json.data.version, 1, "Первая версия должна иметь version = 1");
      assert.equal(json.data.isActive, true, "Инструкция должна быть активной");
      assert.ok(json.data.checksumSha256, "Должен быть рассчитан SHA-256");

      instructionV1Id = json.data.id;
    });

    // =========================================================================
    // СЦЕНАРИЙ 2: Неавторизованный пользователь не может загрузить файл
    // =========================================================================
    await t.test("2. Unauthorized user cannot upload file", async () => {
      const validPdf = createValidInstructionPdf("Попытка без авторизации", 1500);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/storage/upload-instruction",
        headers: { origin: "http://localhost:3000" },
        payload: {
          productId: productAId,
          fileBase64: validPdf.toString("base64"),
          fileName: "unauth-instruction.pdf",
        },
      });

      assert.equal(res.statusCode, 401);
    });

    // =========================================================================
    // СЦЕНАРИЙ 3: Пользователь без роли ADMIN получает отказ
    // =========================================================================
    await t.test("3. User without ADMIN role is rejected", async () => {
      const validPdf = createValidInstructionPdf("Попытка клиента", 1500);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/storage/upload-instruction",
        headers: {
          authorization: `Bearer ${customerToken}`,
          origin: "http://localhost:3000",
        },
        payload: {
          productId: productAId,
          fileBase64: validPdf.toString("base64"),
          fileName: "customer-instruction.pdf",
        },
      });

      assert.equal(res.statusCode, 403);
    });

    // =========================================================================
    // СЦЕНАРИЙ 4: HTML-файл с расширением PDF отклоняется
    // =========================================================================
    await t.test("4. HTML file with PDF extension is rejected", async () => {
      const htmlContent = Buffer.from("<!DOCTYPE html><html><body><h1>Fake PDF</h1></body></html>", "utf-8");
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/storage/upload-instruction",
        headers: {
          authorization: `Bearer ${adminToken}`,
          origin: "http://localhost:3000",
        },
        payload: {
          productId: productAId,
          fileBase64: htmlContent.toString("base64"),
          fileName: "fake-instruction.pdf",
        },
      });

      assert.equal(res.statusCode, 400);
      const json = JSON.parse(res.payload);
      assert.equal(json.error?.code, "INVALID_FILE_TYPE");
    });

    // =========================================================================
    // СЦЕНАРИЙ 5: Пустой и поврежденный PDF отклоняется
    // =========================================================================
    await t.test("5. Empty and corrupted PDF is rejected", async () => {
      // 5.1 Пустой файл (0 байт)
      const emptyRes = await app.inject({
        method: "POST",
        url: "/api/v1/admin/storage/upload-instruction",
        headers: {
          authorization: `Bearer ${adminToken}`,
          origin: "http://localhost:3000",
        },
        payload: {
          productId: productAId,
          fileBase64: Buffer.from("").toString("base64"),
          fileName: "empty.pdf",
        },
      });
      assert.equal(emptyRes.statusCode, 400);

      // 5.2 Поврежденный файл (нет сигнатуры %PDF)
      const corruptedRes = await app.inject({
        method: "POST",
        url: "/api/v1/admin/storage/upload-instruction",
        headers: {
          authorization: `Bearer ${adminToken}`,
          origin: "http://localhost:3000",
        },
        payload: {
          productId: productAId,
          fileBase64: Buffer.from("Some random corrupted text without pdf header").toString("base64"),
          fileName: "corrupted.pdf",
        },
      });
      assert.equal(corruptedRes.statusCode, 400);
      const corruptJson = JSON.parse(corruptedRes.payload);
      assert.ok(
        corruptJson.error?.code === "CORRUPTED_OR_INVALID_PDF" ||
        corruptJson.error?.code === "INVALID_PDF_SIGNATURE"
      );
    });

    // =========================================================================
    // СЦЕНАРИЙ 6: Повторная загрузка создает новую версию, сохраняя историю
    // =========================================================================
    await t.test("6. Repeated upload creates a new version, preserving history", async () => {
      const v2Pdf = createValidInstructionPdf("Инструкция Модель А - Версия 2 с правками", 3000);
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/storage/upload-instruction",
        headers: {
          authorization: `Bearer ${adminToken}`,
          origin: "http://localhost:3000",
        },
        payload: {
          productId: productAId,
          title: "Инструкция по пошиву модели А (исправленная)",
          fileBase64: v2Pdf.toString("base64"),
          fileName: "instruction-palto-a-v2.pdf",
        },
      });

      assert.equal(res.statusCode, 201);
      const json = JSON.parse(res.payload);
      assert.equal(json.data.version, 2, "Версия должна стать 2");
      assert.equal(json.data.isActive, true, "Новая версия активна");

      instructionV2Id = json.data.id;

      // Проверяем, что в БД существуют обе версии и v1 деактивирована
      const allForProduct = await prisma.productInstruction.findMany({
        where: { productId: productAId },
        orderBy: { version: "asc" },
      });

      assert.equal(allForProduct.length, 2, "В БД должны сохраниться обе версии");
      assert.equal(allForProduct[0].version, 1);
      assert.equal(allForProduct[0].isActive, false, "Предыдущая версия v1 должна быть деактивирована");
      assert.equal(allForProduct[1].version, 2);
      assert.equal(allForProduct[1].isActive, true, "Текущая версия v2 должна быть активна");
    });

    // =========================================================================
    // СЦЕНАРИЙ 7: Инструкция привязана к правильному товару
    // =========================================================================
    await t.test("7. Instruction is linked to correct product", async () => {
      const listRes = await app.inject({
        method: "GET",
        url: `/api/v1/admin/storage/products/${productAId}/instructions`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      assert.equal(listRes.statusCode, 200);
      const listJson = JSON.parse(listRes.payload);
      assert.equal(listJson.data.length, 2);
      assert.ok(listJson.data.every((i: any) => i.productId === productAId));

      // Для товара B пока инструкций нет
      const listBRes = await app.inject({
        method: "GET",
        url: `/api/v1/admin/storage/products/${productBId}/instructions`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      assert.equal(listBRes.statusCode, 200);
      const listBJson = JSON.parse(listBRes.payload);
      assert.equal(listBJson.data.length, 0, "У товара Б инструкций быть не должно");
    });

    // =========================================================================
    // СЦЕНАРИЙ 8: Неактивная инструкция недоступна покупателю (404 INSTRUCTION_NOT_FOUND)
    // =========================================================================
    await t.test("8. Inactive instruction is unavailable to customer", async () => {
      // Пытаемся запросить v1 (которая сейчас isActive: false)
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/cabinet/instructions/${instructionV1Id}/download-url`,
        headers: { authorization: `Bearer ${customerToken}` },
      });

      assert.equal(res.statusCode, 404);
      const json = JSON.parse(res.payload);
      assert.equal(json.error?.code, "INSTRUCTION_NOT_FOUND");
    });

    // =========================================================================
    // СЦЕНАРИЙ 9: Покупатель без entitlement не может скачать инструкцию (403 FORBIDDEN)
    // =========================================================================
    await t.test("9. Customer without entitlement cannot download instruction", async () => {
      // Запрашиваем активную v2, но у покупателя еще нет покупки товара А
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/cabinet/instructions/${instructionV2Id}/download-url`,
        headers: { authorization: `Bearer ${customerToken}` },
      });

      assert.equal(res.statusCode, 403);
      const json = JSON.parse(res.payload);
      assert.equal(json.error?.code, "FORBIDDEN");
      assert.ok(json.error?.message.includes("покупки выкройки"));
    });

    // =========================================================================
    // СЦЕНАРИЙ 10: Покупатель с entitlement может скачать инструкцию (200 OK)
    // =========================================================================
    await t.test("10. Customer with entitlement can download instruction", async () => {
      // Создаем синтетический заказ и OrderItem
      const testOrder = await prisma.order.create({
        data: {
          userId: customerId,
          orderNumber: `TEST-INST-ORD-${Date.now()}`,
          customerEmail: "stage523-customer@test-lekalo-zhiide.local",
          customerName: "Айгуль Покупательница",
          status: OrderStatus.PAID,
          totalAmount: 400,
          currency: "KGS",
          items: {
            create: {
              productVariantId: variantAId,
              priceAtPurchase: 400,
              productSnapshot: { title: "TEST-INST Пальто Модель А" },
            },
          },
        },
        include: { items: true },
      });
      testOrderId = testOrder.id;

      // Выдаем покупателю активный entitlement на вариант товара А
      const ent = await prisma.purchaseEntitlement.create({
        data: {
          userId: customerId,
          orderItemId: testOrder.items[0].id,
          variantId: variantAId,
          status: EntitlementStatus.ACTIVE,
        },
      });
      entitlementAId = ent.id;

      // Повторяем запрос
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/cabinet/instructions/${instructionV2Id}/download-url`,
        headers: { authorization: `Bearer ${customerToken}` },
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);
      assert.ok(json.data?.downloadUrl, "Должен вернуться presigned downloadUrl");
      assert.ok(
        json.data?.downloadUrl.toLowerCase().includes("signature") ||
        json.data?.downloadUrl.toLowerCase().includes("expires"),
        "URL должен содержать подпись и срок действия"
      );
      assert.ok(json.data?.fileName?.endsWith(".pdf"), "Должно быть корректное имя файла");
    });

    // =========================================================================
    // СЦЕНАРИЙ 11: Нельзя скачать инструкцию другого товара (403 FORBIDDEN)
    // =========================================================================
    await t.test("11. Cannot download instruction of another product", async () => {
      // Загружаем инструкцию для товара Б
      const pdfB = createValidInstructionPdf("Инструкция для платья Б", 2048);
      const uploadBRes = await app.inject({
        method: "POST",
        url: "/api/v1/admin/storage/upload-instruction",
        headers: {
          authorization: `Bearer ${adminToken}`,
          origin: "http://localhost:3000",
        },
        payload: {
          productId: productBId,
          title: "Инструкция к платью Б",
          fileBase64: pdfB.toString("base64"),
          fileName: "instruction-plate-b.pdf",
        },
      });

      assert.equal(uploadBRes.statusCode, 201);
      const jsonB = JSON.parse(uploadBRes.payload);
      const instructionBId = jsonB.data.id;

      // Покупатель имеет покупку товара А, но НЕ товара Б
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/cabinet/instructions/${instructionBId}/download-url`,
        headers: { authorization: `Bearer ${customerToken}` },
      });

      assert.equal(res.statusCode, 403);
      const json = JSON.parse(res.payload);
      assert.equal(json.error?.code, "FORBIDDEN");
    });

    // =========================================================================
    // СЦЕНАРИЙ 12: Деактивация не нарушает историю версий (isActive: false)
    // =========================================================================
    await t.test("12. Deactivation does not break version history", async () => {
      // Деактивируем текущую v2 через DELETE
      const deleteRes = await app.inject({
        method: "DELETE",
        url: `/api/v1/admin/storage/instructions/${instructionV2Id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      assert.equal(deleteRes.statusCode, 200);

      // Проверяем статус в БД
      const v2InDb = await prisma.productInstruction.findUnique({
        where: { id: instructionV2Id },
      });
      assert.ok(v2InDb, "Запись инструкции v2 должна по-прежнему существовать в БД");
      assert.equal(v2InDb.isActive, false, "Запись должна стать неактивной");

      // Проверяем, что v1 также на месте
      const v1InDb = await prisma.productInstruction.findUnique({
        where: { id: instructionV1Id },
      });
      assert.ok(v1InDb, "Запись инструкции v1 также должна существовать в БД");

      // Проверяем переключение обратно через toggle-active
      const toggleRes = await app.inject({
        method: "PATCH",
        url: `/api/v1/admin/storage/instructions/${instructionV2Id}/toggle-active`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      assert.equal(toggleRes.statusCode, 200);
      const toggleJson = JSON.parse(toggleRes.payload);
      assert.equal(toggleJson.data.isActive, true, "Инструкция должна снова стать активной");

      // Проверяем админский тестовый скачиватель (download-test)
      const adminTestRes = await app.inject({
        method: "GET",
        url: `/api/v1/admin/storage/instructions/${instructionV2Id}/download-test`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      assert.equal(adminTestRes.statusCode, 200);
      const adminTestJson = JSON.parse(adminTestRes.payload);
      assert.ok(adminTestJson.data?.downloadUrl, "Администратор должен получить тестовую ссылку");
    });
  } finally {
    // =========================================================================
    // ГАРАНТИРОВАННАЯ ОЧИСТКА СИНТЕТИЧЕСКИХ ДАННЫХ
    // =========================================================================
    try {
      if (customerId) {
        await prisma.purchaseEntitlement.deleteMany({ where: { userId: customerId } });
      }

      if (testOrderId) {
        await prisma.orderItem.deleteMany({ where: { orderId: testOrderId } });
        await prisma.order.deleteMany({ where: { id: testOrderId } });
      }

      const prodIds = [productAId, productBId].filter(Boolean);
      if (prodIds.length > 0) {
        await prisma.productInstruction.deleteMany({ where: { productId: { in: prodIds } } });
        await prisma.productVariant.deleteMany({ where: { productId: { in: prodIds } } });
        await prisma.product.deleteMany({ where: { id: { in: prodIds } } });
      }

      if (testCategoryId) {
        await prisma.category.deleteMany({ where: { id: testCategoryId } });
      }

      await prisma.user.deleteMany({
        where: { id: { in: [adminId, customerId] } },
      });
    } catch (cleanupErr) {
      console.error("Cleanup error in Stage 5.23 test:", cleanupErr);
    } finally {
      await app.close();
      await prisma.$disconnect();
    }
  }
});
