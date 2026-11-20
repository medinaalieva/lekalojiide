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

test("Catalog E2E: Full Catalog and Administration Flow with PostgreSQL", async (t) => {
  const app = await createTestApp();

  // Создаем тестовых пользователей: ADMIN и CUSTOMER
  const adminId = "00000000-0000-4000-8000-0000000000a1";
  const customerId = "00000000-0000-4000-8000-0000000000c1";

  const adminToken = signAccessToken({
    sub: adminId,
    email: "admin@test-lekalo-zhiide.local",
    role: Role.ADMIN,
    sessionId: "test-admin-session-1",
  });

  const customerToken = signAccessToken({
    sub: customerId,
    email: "customer@test-lekalo-zhiide.local",
    role: Role.CUSTOMER,
    sessionId: "test-customer-session-1",
  });

  // Идентификаторы созданных тестовых данных для последующей очистки
  let createdParentCategoryId: string | null = null;
  let createdChildCategoryId: string | null = null;
  let createdProductId: string | null = null;
  let createdDraftProductId: string | null = null;

  try {
    // -------------------------------------------------------------------------
    // 1. Справочник фильтров
    // -------------------------------------------------------------------------
    await t.test("1. GET /api/v1/catalog/filters returns reference data from DB", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/catalog/filters",
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);
      assert.equal(json.success, true);
      assert.ok(Array.isArray(json.data.sizes));
      assert.ok(Array.isArray(json.data.heights));
      assert.ok(Array.isArray(json.data.formats));
      assert.deepEqual(json.data.difficultyLevels, ["BEGINNER", "INTERMEDIATE", "ADVANCED"]);
      assert.ok(json.data.sizes.length >= 8); // Размеры 40-54
      assert.ok(json.data.heights.length >= 3); // Роста 158-170
      assert.ok(json.data.formats.length >= 3); // A4, PLOTTER_900, LETTER
    });

    // -------------------------------------------------------------------------
    // 2. Безопасность и RBAC для административных операций
    // -------------------------------------------------------------------------
    await t.test("2. Admin endpoints reject unauthenticated and customer requests", async () => {
      // Без токена -> 401 Unauthorized
      const noAuthRes = await app.inject({
        method: "POST",
        url: "/api/v1/admin/categories",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({ title: "Тестовая категория" }),
      });
      assert.equal(noAuthRes.statusCode, 401);
      const noAuthJson = JSON.parse(noAuthRes.payload);
      assert.equal(noAuthJson.error?.code, "AUTH_TOKEN_REQUIRED");

      // С токеном покупателя (CUSTOMER) -> 403 Forbidden
      const customerRes = await app.inject({
        method: "POST",
        url: "/api/v1/admin/categories",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${customerToken}`,
        },
        payload: JSON.stringify({ title: "Тестовая категория" }),
      });
      assert.equal(customerRes.statusCode, 403);
      const customerJson = JSON.parse(customerRes.payload);
      assert.equal(customerJson.error?.code, "INSUFFICIENT_PERMISSIONS");
    });

    // -------------------------------------------------------------------------
    // 3. Создание дерева категорий (ADMIN)
    // -------------------------------------------------------------------------
    await t.test("3. Admin creates parent and child categories with hierarchy", async () => {
      // Создаем родительскую категорию
      const parentRes = await app.inject({
        method: "POST",
        url: "/api/v1/admin/categories",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${adminToken}`,
        },
        payload: JSON.stringify({
          title: "Женская одежда E2E",
          description: "Одежда для женщин",
          displayOrder: 1,
        }),
      });
      assert.equal(parentRes.statusCode, 201);
      const parentJson = JSON.parse(parentRes.payload);
      createdParentCategoryId = parentJson.data.id;
      assert.equal(parentJson.data.title, "Женская одежда E2E");
      assert.equal(parentJson.data.slug, "zhenskaya-odezhda-e2e");

      // Создаем дочернюю категорию
      const childRes = await app.inject({
        method: "POST",
        url: "/api/v1/admin/categories",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${adminToken}`,
        },
        payload: JSON.stringify({
          title: "Платья E2E",
          parentId: createdParentCategoryId,
          displayOrder: 1,
        }),
      });
      assert.equal(childRes.statusCode, 201);
      const childJson = JSON.parse(childRes.payload);
      createdChildCategoryId = childJson.data.id;
      assert.equal(childJson.data.parentId, createdParentCategoryId);
      assert.equal(childJson.data.slug, "platya-e2e");

      // Проверяем публичное дерево категорий
      const treeRes = await app.inject({
        method: "GET",
        url: "/api/v1/catalog/categories",
      });
      assert.equal(treeRes.statusCode, 200);
      const treeJson = JSON.parse(treeRes.payload);
      const foundParent = treeJson.data.find((c: any) => c.id === createdParentCategoryId);
      assert.ok(foundParent);
      assert.equal(foundParent.children.length, 1);
      assert.equal(foundParent.children[0].id, createdChildCategoryId);
    });

    // -------------------------------------------------------------------------
    // 4. Создание товаров (Опубликованный товар и Черновик)
    // -------------------------------------------------------------------------
    await t.test("4. Admin creates published product and draft product", async () => {
      // 4.1. Создание опубликованного товара
      const prodRes = await app.inject({
        method: "POST",
        url: "/api/v1/admin/products",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${adminToken}`,
        },
        payload: JSON.stringify({
          title: "Платье «Zhiide Silk» E2E",
          categoryId: createdChildCategoryId,
          description: "Изысканное шелковое платье миди с открытыми плечами",
          shortDescription: "Шелковое платье миди",
          basePrice: 450,
          difficultyLevel: "INTERMEDIATE",
          fabricDetails: { consumptionMeters: "1.8 - 2.2 м", recommended: ["Шелк", "Вискоза"] },
          isActive: true,
        }),
      });
      assert.equal(prodRes.statusCode, 201);
      const prodJson = JSON.parse(prodRes.payload);
      createdProductId = prodJson.data.id;
      assert.equal(prodJson.data.slug, "plate-zhiide-silk-e2e");
      assert.equal(prodJson.data.basePrice, 450);

      // 4.2. Добавляем фото в галерею
      const imgRes = await app.inject({
        method: "POST",
        url: `/api/v1/admin/products/${createdProductId}/images`,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${adminToken}`,
        },
        payload: JSON.stringify({
          imageUrl: "https://cdn.example.kg/silk-cover.webp",
          altText: "Вид платья спереди",
          isCover: true,
        }),
      });
      assert.equal(imgRes.statusCode, 201);

      // 4.3. Создание неопубликованного черновика
      const draftRes = await app.inject({
        method: "POST",
        url: "/api/v1/admin/products",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${adminToken}`,
        },
        payload: JSON.stringify({
          title: "Черновик Пальто E2E",
          categoryId: createdChildCategoryId,
          description: "Неопубликованная модель пальто",
          basePrice: 1200,
          isActive: false, // НЕОПУБЛИКОВАН!
        }),
      });
      assert.equal(draftRes.statusCode, 201);
      createdDraftProductId = JSON.parse(draftRes.payload).data.id;
    });

    // -------------------------------------------------------------------------
    // 5. Пакетная генерация матрицы вариантов
    // -------------------------------------------------------------------------
    await t.test("5. Batch generate variant combinations (sizes x heights x formats)", async () => {
      // Получаем справочные ID размеров, ростовок и форматов
      const sizes = await prisma.size.findMany({ take: 2, orderBy: { displayOrder: "asc" } });
      const heights = await prisma.height.findMany({ take: 2, orderBy: { displayOrder: "asc" } });
      const formats = await prisma.format.findMany({ take: 2, orderBy: { displayOrder: "asc" } });

      assert.equal(sizes.length, 2);
      assert.equal(heights.length, 2);
      assert.equal(formats.length, 2);

      const batchRes = await app.inject({
        method: "POST",
        url: `/api/v1/admin/products/${createdProductId}/variants/batch`,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${adminToken}`,
        },
        payload: JSON.stringify({
          sizeIds: sizes.map((s) => s.id),
          heightIds: heights.map((h) => h.id),
          formatIds: formats.map((f) => f.id),
          skuPrefix: "LZ-SILK-E2E",
        }),
      });

      assert.equal(batchRes.statusCode, 201);
      const batchJson = JSON.parse(batchRes.payload);
      assert.equal(batchJson.data.createdOrUpdatedCount, 8); // 2 * 2 * 2 = 8 комбинаций

      // Проверяем эндпоинт вариантов
      const varRes = await app.inject({
        method: "GET",
        url: `/api/v1/catalog/products/${createdProductId}/variants`,
      });
      assert.equal(varRes.statusCode, 200);
      const varJson = JSON.parse(varRes.payload);
      assert.equal(varJson.data.length, 8);
      assert.ok(varJson.data[0].sku.startsWith("LZ-SILK-E2E"));
      assert.equal(varJson.data[0].price, 450);
      assert.equal(varJson.data[0].currency, "KGS");
      // После Stage 5.9 варианты без прикреплённого PDF имеют isAvailable: false
      assert.equal(varJson.data[0].isAvailable, false);
      assert.equal(varJson.data[0].unavailableReason, "NO_DIGITAL_FILE");
    });

    // -------------------------------------------------------------------------
    // 6. Публичная выдача каталога и фильтрация
    // -------------------------------------------------------------------------
    await t.test("6. Public catalog returns published items and excludes drafts", async () => {
      const listRes = await app.inject({
        method: "GET",
        url: "/api/v1/catalog/products?limit=50",
      });
      assert.equal(listRes.statusCode, 200);
      const listJson = JSON.parse(listRes.payload);

      // Опубликованный товар присутствует
      const published = listJson.data.find((p: any) => p.id === createdProductId);
      assert.ok(published, "Published product must be included in catalog");
      assert.equal(published.currency, "KGS");
      assert.equal(published.coverImage, "https://cdn.example.kg/silk-cover.webp");
      assert.ok(published.availableSizes.length > 0);

      // Черновик (isActive: false) СТРОГО исключен из выдачи
      const draft = listJson.data.find((p: any) => p.id === createdDraftProductId);
      assert.equal(draft, undefined, "Unpublished draft must be excluded from public catalog");
    });

    // -------------------------------------------------------------------------
    // 7. Поиск и фильтрация по категории
    // -------------------------------------------------------------------------
    await t.test("7. Search by title and filter by category", async () => {
      // Поиск по слову "Silk"
      const searchRes = await app.inject({
        method: "GET",
        url: "/api/v1/catalog/products?search=Silk",
      });
      assert.equal(searchRes.statusCode, 200);
      const searchJson = JSON.parse(searchRes.payload);
      assert.ok(searchJson.data.some((p: any) => p.id === createdProductId));

      // Фильтр по родительской категории (должен находить товары дочерней категории)
      const catRes = await app.inject({
        method: "GET",
        url: "/api/v1/catalog/products?categorySlug=zhenskaya-odezhda-e2e",
      });
      assert.equal(catRes.statusCode, 200);
      const catJson = JSON.parse(catRes.payload);
      assert.ok(catJson.data.some((p: any) => p.id === createdProductId));
    });

    // -------------------------------------------------------------------------
    // 8. Детальная карточка товара и защита от утечки приватных данных
    // -------------------------------------------------------------------------
    await t.test("8. Product detail returns matrix and protects private storage keys", async () => {
      const detailRes = await app.inject({
        method: "GET",
        url: "/api/v1/catalog/products/plate-zhiide-silk-e2e",
      });
      assert.equal(detailRes.statusCode, 200);
      const detailJson = JSON.parse(detailRes.payload);
      const prod = detailJson.data;

      assert.equal(prod.id, createdProductId);
      assert.equal(prod.title, "Платье «Zhiide Silk» E2E");
      assert.equal(prod.basePrice, 450);
      assert.equal(prod.currency, "KGS");
      assert.equal(prod.images.length, 1);
      assert.equal(prod.images[0].isCover, true);
      assert.equal(prod.variants.length, 8);

      // Проверка безопасности: приватные ключи S3 не должны раскрываться
      const payloadString = JSON.stringify(prod);
      assert.equal(payloadString.includes("s3Bucket"), false);
      assert.equal(payloadString.includes("s3Key"), false);
      assert.equal(payloadString.includes("checksumSha256"), false);

      // Запрос черновика публичным пользователем возвращает 404
      const draftDetailRes = await app.inject({
        method: "GET",
        url: "/api/v1/catalog/products/chernovik-palto-e2e",
      });
      assert.equal(draftDetailRes.statusCode, 404);
      assert.equal(JSON.parse(draftDetailRes.payload).error?.code, "PRODUCT_NOT_FOUND");
    });

    // -------------------------------------------------------------------------
    // 9. Снятие с публикации и публикация (Status Toggle)
    // -------------------------------------------------------------------------
    await t.test("9. Admin unpublishes and re-publishes pattern", async () => {
      // Снимаем с публикации
      const unpublishRes = await app.inject({
        method: "PATCH",
        url: `/api/v1/admin/products/${createdProductId}/status`,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${adminToken}`,
        },
        payload: JSON.stringify({ isActive: false }),
      });
      assert.equal(unpublishRes.statusCode, 200);

      // Теперь публичный запрос возвращает 404
      const getUnpublishedRes = await app.inject({
        method: "GET",
        url: "/api/v1/catalog/products/plate-zhiide-silk-e2e",
      });
      assert.equal(getUnpublishedRes.statusCode, 404);

      // Возвращаем публикацию
      const republishRes = await app.inject({
        method: "PATCH",
        url: `/api/v1/admin/products/${createdProductId}/status`,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${adminToken}`,
        },
        payload: JSON.stringify({ isActive: true }),
      });
      assert.equal(republishRes.statusCode, 200);

      // Снова доступен
      const getRepublishedRes = await app.inject({
        method: "GET",
        url: "/api/v1/catalog/products/plate-zhiide-silk-e2e",
      });
      assert.equal(getRepublishedRes.statusCode, 200);
    });

  } finally {
    // -------------------------------------------------------------------------
    // Безопасная очистка созданных тестовых данных из PostgreSQL
    // -------------------------------------------------------------------------
    if (createdProductId) {
      await prisma.productImage.deleteMany({ where: { productId: createdProductId } });
      await prisma.productVariant.deleteMany({ where: { productId: createdProductId } });
      await prisma.product.delete({ where: { id: createdProductId } }).catch(() => {});
    }
    if (createdDraftProductId) {
      await prisma.product.delete({ where: { id: createdDraftProductId } }).catch(() => {});
    }
    if (createdChildCategoryId) {
      await prisma.category.delete({ where: { id: createdChildCategoryId } }).catch(() => {});
    }
    if (createdParentCategoryId) {
      await prisma.category.delete({ where: { id: createdParentCategoryId } }).catch(() => {});
    }

    await app.close();
    await prisma.$disconnect();
  }
});
