/**
 * LEKALO ZHIIDE — STAGE 5.24: HEIGHTS & FORMATS DICTIONARIES TEST SUITE
 *
 * Проверка управления справочниками ростовок и форматов выкроек через Admin API:
 *  1. ADMIN может создать ростовку.
 *  2. ADMIN может изменить ростовку.
 *  3. Нельзя создать дубликат кода ростовки (409 Conflict).
 *  4. Нельзя сохранить некорректный диапазон (minHeight > maxHeight) (422 Unprocessable).
 *  5. ADMIN может создать формат.
 *  6. ADMIN может изменить формат.
 *  7. Нельзя создать дубликат кода формата (409 Conflict).
 *  8. Неактивные значения не предлагаются для новых вариантов (batchGenerateVariants).
 *  9. Публичный API показывает только активные значения (getFilters).
 * 10. Административный API показывает все значения (активные и неактивные).
 * 11. Нельзя физически удалить используемую ростовку (409 Conflict).
 * 12. Нельзя физически удалить используемый формат (409 Conflict).
 * 13. Деактивация не ломает существующие заказы и историю покупок.
 * 14. Генерация вариантов остаётся идемпотентной.
 * 15. Генерация ALL совместима с новыми справочниками.
 * 16. Старые PDF и Storage Upload продолжают работать.
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
import { Role, OrderStatus } from "@prisma/client";

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

function createDummyPdfBuffer(title = "Тестовое лекало", sizeBytes = 1024): Buffer {
  const header = "%PDF-1.4\n";
  const body = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 55 >>\nstream\nBT /F1 18 Tf 50 750 Td (${title}) Tj ET\nendstream\nendobj\n`;
  const padding = " ".repeat(Math.max(0, sizeBytes - header.length - body.length - 60));
  const xref = `xref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000214 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n320\n%%EOF`;
  return Buffer.from(header + body + padding + xref);
}

test("Stage 5.24: Heights & Formats Admin Dictionaries Suite", async (t) => {
  const dbName = await ensureDbConnected();
  assert.equal(dbName, "lekalo_test", "Safety violation: database must be lekalo_test");

  const app = await createTestApp();

  const PREFIX = `T524_${Date.now().toString().slice(-6)}`;
  const heightCode = `${PREFIX}_H1`;
  const formatCode = `${PREFIX}_F1`;

  // Users
  const adminUser = await prisma.user.create({
    data: {
      email: `${PREFIX.toLowerCase()}-admin@example.com`,
      passwordHash: "hash-synthetic-stage524-admin",
      role: Role.ADMIN,
      firstName: "Admin",
      lastName: "Stage524",
    },
  });

  const customerUser = await prisma.user.create({
    data: {
      email: `${PREFIX.toLowerCase()}-customer@example.com`,
      passwordHash: "hash-synthetic-stage524-customer",
      role: Role.CUSTOMER,
      firstName: "Customer",
      lastName: "Stage524",
    },
  });

  const adminToken = signAccessToken({
    sub: adminUser.id,
    email: adminUser.email,
    role: adminUser.role,
    sessionId: "test-session-admin-524",
  });

  const customerToken = signAccessToken({
    sub: customerUser.id,
    email: customerUser.email,
    role: customerUser.role,
    sessionId: "test-session-customer-524",
  });

  // Category
  const category = await prisma.category.create({
    data: {
      title: `${PREFIX} Категория`,
      slug: `${PREFIX.toLowerCase()}-cat`,
    },
  });

  // Product
  const product = await prisma.product.create({
    data: {
      title: `${PREFIX} Выкройка Тест`,
      slug: `${PREFIX.toLowerCase()}-dress`,
      description: "Описание тестовой выкройки",
      categoryId: category.id,
      basePrice: 500,
      hasBundleOption: true,
      bundlePrice: 1200,
      isActive: true,
    },
  });

  // Sizes for testing
  let testSize42 = await prisma.size.findUnique({ where: { code: "42" } });
  if (!testSize42) {
    testSize42 = await prisma.size.create({
      data: { code: "42", label: "42 размер", displayOrder: 1 },
    });
  }

  let sizeAll = await prisma.size.findUnique({ where: { code: "ALL" } });
  if (!sizeAll) {
    sizeAll = await prisma.size.create({
      data: { code: "ALL", label: "Все размеры (комплект)", displayOrder: 999 },
    });
  }

  // IDs to track for cleanup
  let createdHeightId = "";
  let createdFormatId = "";
  let createdVariantId = "";
  let createdOrderId = "";

  try {
    // -------------------------------------------------------------------------
    // 1. ADMIN может создать ростовку (201 Created)
    // -------------------------------------------------------------------------
    await t.test("1. ADMIN can create a height (201 Created)", async () => {
      const heightCode = `${PREFIX}-H1`;
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/heights",
        headers: {
          authorization: `Bearer ${adminToken}`,
          origin: "http://localhost:3000",
        },
        payload: {
          code: heightCode,
          label: "150-156 см",
          minHeight: 150,
          maxHeight: 156,
          displayOrder: 10,
          isActive: true,
        },
      });

      assert.equal(res.statusCode, 201, `Expected 201 Created, got ${res.statusCode}: ${res.body}`);
      const json = JSON.parse(res.body);
      assert.equal(json.success, true);
      assert.equal(json.data?.code, heightCode);
      assert.equal(json.data?.minHeight, 150);
      assert.equal(json.data?.maxHeight, 156);
      assert.equal(json.data?.isActive, true);
      assert.equal(json.data?.displayOrder, 10);
      createdHeightId = json.data.id;
    });

    // -------------------------------------------------------------------------
    // 2. ADMIN может изменить ростовку (200 OK)
    // -------------------------------------------------------------------------
    await t.test("2. ADMIN can edit a height (200 OK)", async () => {
      assert.ok(createdHeightId, "Height ID required");
      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/admin/heights/${createdHeightId}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          origin: "http://localhost:3000",
        },
        payload: {
          label: "150-156 см (Премиум)",
          minHeight: 151,
          maxHeight: 156,
          displayOrder: 12,
        },
      });

      assert.equal(res.statusCode, 200, `Expected 200 OK, got ${res.statusCode}: ${res.body}`);
      const json = JSON.parse(res.body);
      assert.equal(json.success, true);
      assert.equal(json.data?.label, "150-156 см (Премиум)");
      assert.equal(json.data?.minHeight, 151);
      assert.equal(json.data?.displayOrder, 12);
    });

    // -------------------------------------------------------------------------
    // 3. Нельзя создать дубликат кода ростовки (409 Conflict)
    // -------------------------------------------------------------------------
    await t.test("3. Cannot create duplicate height code (409 Conflict)", async () => {
      const heightCode = `${PREFIX}-H1`;
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/heights",
        headers: {
          authorization: `Bearer ${adminToken}`,
          origin: "http://localhost:3000",
        },
        payload: {
          code: heightCode,
          label: "Дубликат 150-156",
          minHeight: 150,
          maxHeight: 156,
        },
      });

      assert.equal(res.statusCode, 409, `Expected 409 Conflict, got ${res.statusCode}: ${res.body}`);
      const json = JSON.parse(res.body);
      assert.equal(json.error?.code, "HEIGHT_CODE_EXISTS");
    });

    // -------------------------------------------------------------------------
    // 4. Нельзя сохранить некорректный диапазон (minHeight > maxHeight) (422)
    // -------------------------------------------------------------------------
    await t.test("4. Cannot save invalid range (minHeight > maxHeight) (422)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/heights",
        headers: {
          authorization: `Bearer ${adminToken}`,
          origin: "http://localhost:3000",
        },
        payload: {
          code: `${PREFIX}-H-INVALID`,
          label: "Неверный диапазон",
          minHeight: 180,
          maxHeight: 160,
        },
      });

      assert.equal(res.statusCode, 422, `Expected 422 Unprocessable, got ${res.statusCode}: ${res.body}`);
    });

    // -------------------------------------------------------------------------
    // 5. ADMIN может создать формат (201 Created)
    // -------------------------------------------------------------------------
    await t.test("5. ADMIN can create a format (201 Created)", async () => {
      const formatCode = `${PREFIX}-F1`;
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/formats",
        headers: {
          authorization: `Bearer ${adminToken}`,
          origin: "http://localhost:3000",
        },
        payload: {
          code: formatCode,
          label: "Плоттер 600 мм",
          description: "Рулонная печать шириной 600 мм",
          maxPrintWidth: 600,
          displayOrder: 15,
          isActive: true,
        },
      });

      assert.equal(res.statusCode, 201, `Expected 201 Created, got ${res.statusCode}: ${res.body}`);
      const json = JSON.parse(res.body);
      assert.equal(json.success, true);
      assert.equal(json.data?.code, formatCode);
      assert.equal(json.data?.maxPrintWidth, 600);
      assert.equal(json.data?.isActive, true);
      createdFormatId = json.data.id;
    });

    // -------------------------------------------------------------------------
    // 6. ADMIN может изменить формат (200 OK)
    // -------------------------------------------------------------------------
    await t.test("6. ADMIN can edit a format (200 OK)", async () => {
      assert.ok(createdFormatId, "Format ID required");
      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/admin/formats/${createdFormatId}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          origin: "http://localhost:3000",
        },
        payload: {
          label: "Плоттер 610 мм (A1)",
          maxPrintWidth: 610,
          description: "Обновленная рулонная печать 610 мм",
          displayOrder: 16,
        },
      });

      assert.equal(res.statusCode, 200, `Expected 200 OK, got ${res.statusCode}: ${res.body}`);
      const json = JSON.parse(res.body);
      assert.equal(json.success, true);
      assert.equal(json.data?.label, "Плоттер 610 мм (A1)");
      assert.equal(json.data?.maxPrintWidth, 610);
      assert.equal(json.data?.displayOrder, 16);
    });

    // -------------------------------------------------------------------------
    // 7. Нельзя создать дубликат кода формата (409 Conflict)
    // -------------------------------------------------------------------------
    await t.test("7. Cannot create duplicate format code (409 Conflict)", async () => {
      const formatCode = `${PREFIX}-F1`;
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/formats",
        headers: {
          authorization: `Bearer ${adminToken}`,
          origin: "http://localhost:3000",
        },
        payload: {
          code: formatCode,
          label: "Дубликат плоттера",
        },
      });

      assert.equal(res.statusCode, 409, `Expected 409 Conflict, got ${res.statusCode}: ${res.body}`);
      const json = JSON.parse(res.body);
      assert.equal(json.error?.code, "FORMAT_CODE_EXISTS");
    });

    // -------------------------------------------------------------------------
    // 8. Неактивные значения не предлагаются для новых вариантов
    // -------------------------------------------------------------------------
    await t.test("8. Inactive values are not offered for new variants", async () => {
      // Create a temporary inactive height
      const inactiveHeight = await prisma.height.create({
        data: {
          code: `${PREFIX}-H-INACTIVE`,
          label: "Неактивная ростовка",
          isActive: false,
          displayOrder: 99,
        },
      });

      // Attempt to batch generate variants with this inactive height
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/admin/products/${product.id}/variants/batch`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          origin: "http://localhost:3000",
        },
        payload: {
          sizes: ["42"],
          heights: [inactiveHeight.code],
          formats: [`${PREFIX}-F1`],
        },
      });

      assert.equal(res.statusCode, 404, `Expected 404, got ${res.statusCode}: ${res.body}`);
      const json = JSON.parse(res.body);
      assert.equal(json.error?.code, "INVALID_HEIGHTS");

      // Clean up temp height
      await prisma.height.delete({ where: { id: inactiveHeight.id } });
    });

    // -------------------------------------------------------------------------
    // 9. Публичный API показывает только активные значения (getFilters)
    // -------------------------------------------------------------------------
    await t.test("9. Public API shows only active values (getFilters)", async () => {
      // Deactivate created format
      await app.inject({
        method: "PATCH",
        url: `/api/v1/admin/formats/${createdFormatId}/toggle-active`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          origin: "http://localhost:3000",
        },
        payload: { isActive: false },
      });

      // Public call to filters
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/catalog/filters",
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.body);
      const formatCodes = (json.data?.formats || []).map((f: any) => f.code);
      assert.ok(
        !formatCodes.includes(`${PREFIX}-F1`),
        "Inactive format must not appear in public filters"
      );

      // Reactivate format
      await app.inject({
        method: "PATCH",
        url: `/api/v1/admin/formats/${createdFormatId}/toggle-active`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          origin: "http://localhost:3000",
        },
        payload: { isActive: true },
      });

      // Public call again
      const res2 = await app.inject({
        method: "GET",
        url: "/api/v1/catalog/filters",
      });
      const json2 = JSON.parse(res2.body);
      const formatCodes2 = (json2.data?.formats || []).map((f: any) => f.code);
      assert.ok(
        formatCodes2.includes(`${PREFIX}-F1`),
        "Reactivated format must appear in public filters"
      );
    });

    // -------------------------------------------------------------------------
    // 10. Административный API показывает все значения (активные и неактивные)
    // -------------------------------------------------------------------------
    await t.test("10. Admin API shows all values (active and inactive)", async () => {
      // Deactivate height
      await app.inject({
        method: "PATCH",
        url: `/api/v1/admin/heights/${createdHeightId}/toggle-active`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          origin: "http://localhost:3000",
        },
        payload: { isActive: false },
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/admin/heights",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.body);
      const found = (json.data || []).find((h: any) => h.id === createdHeightId);
      assert.ok(found, "Admin must see deactivated height");
      assert.equal(found.isActive, false);

      // Reactivate height
      await app.inject({
        method: "PATCH",
        url: `/api/v1/admin/heights/${createdHeightId}/toggle-active`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          origin: "http://localhost:3000",
        },
        payload: { isActive: true },
      });
    });

    // -------------------------------------------------------------------------
    // 11. Нельзя физически удалить используемую ростовку (409 Conflict)
    // -------------------------------------------------------------------------
    await t.test("11. Cannot physically delete a height that is in use (409 Conflict)", async () => {
      // Create a variant using createdHeightId and createdFormatId
      const variant = await prisma.productVariant.create({
        data: {
          productId: product.id,
          sizeId: testSize42!.id,
          heightId: createdHeightId,
          formatId: createdFormatId,
          sku: `${PREFIX}-42-H1-F1`,
          isActive: true,
        },
      });
      createdVariantId = variant.id;

      // Try to delete height
      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/admin/heights/${createdHeightId}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          origin: "http://localhost:3000",
        },
      });

      assert.equal(res.statusCode, 409, `Expected 409 Conflict, got ${res.statusCode}: ${res.body}`);
      const json = JSON.parse(res.body);
      assert.equal(json.error?.code, "HEIGHT_IN_USE");
    });

    // -------------------------------------------------------------------------
    // 12. Нельзя физически удалить используемый формат (409 Conflict)
    // -------------------------------------------------------------------------
    await t.test("12. Cannot physically delete a format that is in use (409 Conflict)", async () => {
      // Format is already used by createdVariantId
      const res = await app.inject({
        method: "DELETE",
        url: `/api/v1/admin/formats/${createdFormatId}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          origin: "http://localhost:3000",
        },
      });

      assert.equal(res.statusCode, 409, `Expected 409 Conflict, got ${res.statusCode}: ${res.body}`);
      const json = JSON.parse(res.body);
      assert.equal(json.error?.code, "FORMAT_IN_USE");
    });

    // -------------------------------------------------------------------------
    // 13. Деактивация не ломает существующие заказы
    // -------------------------------------------------------------------------
    await t.test("13. Deactivation does not break existing orders", async () => {
      // Create an order containing the variant
      const order = await prisma.order.create({
        data: {
          orderNumber: `ORD-${PREFIX}-01`,
          userId: customerUser.id,
          customerEmail: customerUser.email,
          customerName: "Customer Stage524",
          totalAmount: 500,
          currency: "KGS",
          status: OrderStatus.PAID,
          items: {
            create: {
              productVariantId: createdVariantId,
              priceAtPurchase: 500,
              productSnapshot: {
                title: product.title,
                size: "42",
                height: `${PREFIX}-H1`,
                format: `${PREFIX}-F1`,
              },
            },
          },
        },
        include: { items: true },
      });
      createdOrderId = order.id;

      // Deactivate both height and format
      await app.inject({
        method: "PATCH",
        url: `/api/v1/admin/heights/${createdHeightId}/toggle-active`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          origin: "http://localhost:3000",
        },
        payload: { isActive: false },
      });
      await app.inject({
        method: "PATCH",
        url: `/api/v1/admin/formats/${createdFormatId}/toggle-active`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          origin: "http://localhost:3000",
        },
        payload: { isActive: false },
      });

      // Verify customer can still view their order
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/orders/${order.id}`,
        headers: {
          authorization: `Bearer ${customerToken}`,
        },
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.body);
      assert.equal(json.data?.id, order.id);
      assert.equal(json.data?.status, OrderStatus.PAID);
      assert.equal(json.data?.items?.length, 1);
      assert.equal(json.data?.items[0]?.productSnapshot?.height, `${PREFIX}-H1`);

      // Reactivate for further tests
      await prisma.height.update({ where: { id: createdHeightId }, data: { isActive: true } });
      await prisma.format.update({ where: { id: createdFormatId }, data: { isActive: true } });
    });

    // -------------------------------------------------------------------------
    // 14. Генерация вариантов остаётся идемпотентной
    // -------------------------------------------------------------------------
    await t.test("14. Variant generation remains idempotent", async () => {
      // First call
      const res1 = await app.inject({
        method: "POST",
        url: `/api/v1/admin/products/${product.id}/variants/batch`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          origin: "http://localhost:3000",
        },
        payload: {
          sizes: ["42"],
          heights: [`${PREFIX}-H1`],
          formats: [`${PREFIX}-F1`],
        },
      });

      assert.equal(res1.statusCode, 201, `First batch call failed: ${res1.body}`);

      // Second identical call
      const res2 = await app.inject({
        method: "POST",
        url: `/api/v1/admin/products/${product.id}/variants/batch`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          origin: "http://localhost:3000",
        },
        payload: {
          sizes: ["42"],
          heights: [`${PREFIX}-H1`],
          formats: [`${PREFIX}-F1`],
        },
      });

      assert.equal(res2.statusCode, 201, `Second batch call failed: ${res2.body}`);

      // Count variants
      const count = await prisma.productVariant.count({
        where: {
          productId: product.id,
          sizeId: testSize42!.id,
          heightId: createdHeightId,
          formatId: createdFormatId,
        },
      });
      assert.equal(count, 1, "Idempotent generation must not produce duplicate variants");
    });

    // -------------------------------------------------------------------------
    // 15. Генерация ALL совместима с новыми справочниками
    // -------------------------------------------------------------------------
    await t.test("15. ALL generation is compatible with new dictionary entries", async () => {
      // Batch generate with bundle option enabled
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/admin/products/${product.id}/variants/batch`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          origin: "http://localhost:3000",
        },
        payload: {
          sizes: ["42"],
          heights: [`${PREFIX}-H1`],
          formats: [`${PREFIX}-F1`],
          includeBundle: true,
        },
      });

      assert.equal(res.statusCode, 201, `Batch with bundle failed: ${res.body}`);

      // Verify ALL variant exists for the custom height and format
      const allVariant = await prisma.productVariant.findFirst({
        where: {
          productId: product.id,
          size: { code: "ALL" },
          heightId: createdHeightId,
          formatId: createdFormatId,
        },
      });

      assert.ok(allVariant, "Bundle variant ALL must be generated for custom height & format");
      assert.ok(allVariant.sku.includes("-ALL-"), `SKU must contain -ALL-: ${allVariant.sku}`);
      assert.equal(allVariant.isActive, true);
    });

    // -------------------------------------------------------------------------
    // 16. Старые PDF и Storage Upload продолжают работать
    // -------------------------------------------------------------------------
    await t.test("16. Old PDFs and Storage Upload continue to work", async () => {
      const dummyPdf = createDummyPdfBuffer("Выкройка для плоттера 610 мм");
      const base64Pdf = dummyPdf.toString("base64");

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/storage/upload-pattern",
        headers: {
          authorization: `Bearer ${adminToken}`,
          origin: "http://localhost:3000",
        },
        payload: {
          variantId: createdVariantId,
          fileName: `${product.slug}-42-${PREFIX}-H1-${PREFIX}-F1.pdf`,
          fileBase64: base64Pdf,
          fileType: "PATTERN",
          contentType: "application/pdf",
        },
      });

      assert.equal(res.statusCode, 201, `Upload pattern failed: ${res.statusCode}: ${res.body}`);
      const json = JSON.parse(res.body);
      assert.equal(json.success, true);
      assert.equal(json.data?.versionNumber, 1);
      assert.ok(json.data?.s3Key?.includes("patterns/"), "S3 key must be under patterns/");
    });
  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------------------------
    try {
      // 1. Delete order items & orders
      if (createdOrderId) {
        await prisma.orderItem.deleteMany({ where: { orderId: createdOrderId } });
        await prisma.order.delete({ where: { id: createdOrderId } }).catch(() => {});
      }

      // 2. Delete file versions & digital files for variants of product
      const productVariants = await prisma.productVariant.findMany({
        where: { productId: product.id },
        select: { id: true },
      });
      const variantIds = productVariants.map((v) => v.id);

      if (variantIds.length > 0) {
        const digitalFiles = await prisma.digitalFile.findMany({
          where: { variantId: { in: variantIds } },
          select: { id: true },
        });
        const fileIds = digitalFiles.map((f) => f.id);

        if (fileIds.length > 0) {
          await prisma.digitalFile.updateMany({
            where: { id: { in: fileIds } },
            data: { currentVersionId: null },
          });
          await prisma.fileVersion.deleteMany({ where: { digitalFileId: { in: fileIds } } });
          await prisma.digitalFile.deleteMany({ where: { id: { in: fileIds } } });
        }

        await prisma.cartItem.deleteMany({ where: { productVariantId: { in: variantIds } } });
        await prisma.purchaseEntitlement.deleteMany({ where: { variantId: { in: variantIds } } });
        await prisma.orderItem.deleteMany({ where: { productVariantId: { in: variantIds } } });
        await prisma.productVariant.deleteMany({ where: { productId: product.id } });
      }

      // 3. Delete product & category
      await prisma.productImage.deleteMany({ where: { productId: product.id } });
      await prisma.productInstruction.deleteMany({ where: { productId: product.id } });
      await prisma.product.delete({ where: { id: product.id } }).catch(() => {});
      await prisma.category.delete({ where: { id: category.id } }).catch(() => {});

      // 4. Delete custom height and format
      if (createdHeightId) {
        await prisma.height.delete({ where: { id: createdHeightId } }).catch(() => {});
      }
      if (createdFormatId) {
        await prisma.format.delete({ where: { id: createdFormatId } }).catch(() => {});
      }

      // 5. Delete users
      await prisma.user.delete({ where: { id: adminUser.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: customerUser.id } }).catch(() => {});
    } catch (cleanupErr) {
      console.warn("Cleanup error in Stage 5.24 test suite:", cleanupErr);
    }

    await app.close();
  }
});
