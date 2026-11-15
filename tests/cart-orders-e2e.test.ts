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

test("Cart & Orders E2E: Full Shopping Cart and Checkout Flow with PostgreSQL", async (t) => {
  const app = await createTestApp();

  const adminId = "00000000-0000-4000-8000-0000000000a2";
  const customer1Id = "00000000-0000-4000-8000-0000000000c2";
  const customer2Id = "00000000-0000-4000-8000-0000000000c3";

  // Гарантируем наличие тестовых пользователей в PostgreSQL для обеспечения foreign key связей
  await prisma.user.upsert({
    where: { id: adminId },
    update: { role: Role.ADMIN },
    create: {
      id: adminId,
      email: "admin2@test-lekalo-zhiide.local",
      role: Role.ADMIN,
      firstName: "Администратор",
      lastName: "Системы",
    },
  });

  await prisma.user.upsert({
    where: { id: customer1Id },
    update: { role: Role.CUSTOMER },
    create: {
      id: customer1Id,
      email: "customer1@test-lekalo-zhiide.local",
      role: Role.CUSTOMER,
      firstName: "Айпери",
      lastName: "Бектемирова",
      phone: "+996555112233",
    },
  });

  await prisma.user.upsert({
    where: { id: customer2Id },
    update: { role: Role.CUSTOMER },
    create: {
      id: customer2Id,
      email: "customer2@test-lekalo-zhiide.local",
      role: Role.CUSTOMER,
      firstName: "Динара",
      lastName: "Осмонова",
    },
  });

  const adminToken = signAccessToken({
    sub: adminId,
    email: "admin2@test-lekalo-zhiide.local",
    role: Role.ADMIN,
    sessionId: "test-admin2-session-1",
  });

  const customer1Token = signAccessToken({
    sub: customer1Id,
    email: "customer1@test-lekalo-zhiide.local",
    role: Role.CUSTOMER,
    sessionId: "test-customer1-session-1",
  });

  const customer2Token = signAccessToken({
    sub: customer2Id,
    email: "customer2@test-lekalo-zhiide.local",
    role: Role.CUSTOMER,
    sessionId: "test-customer2-session-1",
  });

  // Переменные для созданных тестовых данных каталога
  let testCategoryId: string | null = null;
  let activeProductId: string | null = null;
  let draftProductId: string | null = null;
  let variant1Id: string | null = null;
  let variant2Id: string | null = null;
  let inactiveVariantId: string | null = null;
  let draftVariantId: string | null = null;

  let createdOrderId: string | null = null;

  try {
    // -------------------------------------------------------------------------
    // ПОДГОТОВКА ДАННЫХ В POSTGRESQL
    // -------------------------------------------------------------------------
    const category = await prisma.category.create({
      data: {
        title: "Тестовая категория Cart-E2E",
        slug: "test-cart-e2e-category",
      },
    });
    testCategoryId = category.id;

    const activeProduct = await prisma.product.create({
      data: {
        title: "Платье Silk Cart E2E",
        slug: "plate-silk-cart-e2e",
        description: "Шелковое платье для теста корзины",
        basePrice: 450,
        categoryId: testCategoryId,
        isActive: true,
      },
    });
    activeProductId = activeProduct.id;

    const draftProduct = await prisma.product.create({
      data: {
        title: "Неопубликованное Платье Cart E2E",
        slug: "draft-plate-cart-e2e",
        description: "Черновик платья",
        basePrice: 800,
        categoryId: testCategoryId,
        isActive: false, // НЕОПУБЛИКОВАН!
      },
    });
    draftProductId = draftProduct.id;

    const sizes = await prisma.size.findMany({ take: 2, orderBy: { displayOrder: "asc" } });
    const heights = await prisma.height.findMany({ take: 2, orderBy: { displayOrder: "asc" } });
    const formats = await prisma.format.findMany({ take: 2, orderBy: { displayOrder: "asc" } });

    // Вариант 1: активный, цена 450 (basePrice)
    const var1 = await prisma.productVariant.create({
      data: {
        productId: activeProductId,
        sizeId: sizes[0].id,
        heightId: heights[0].id,
        formatId: formats[0].id,
        sku: "LZ-CART-E2E-VAR1",
        priceOverride: null,
        isActive: true,
      },
    });
    variant1Id = var1.id;

    // Вариант 2: активный, переопределенная цена 500 (priceOverride)
    const var2 = await prisma.productVariant.create({
      data: {
        productId: activeProductId,
        sizeId: sizes[1].id,
        heightId: heights[0].id,
        formatId: formats[0].id,
        sku: "LZ-CART-E2E-VAR2",
        priceOverride: 500,
        isActive: true,
      },
    });
    variant2Id = var2.id;

    // Вариант 3: неактивный вариант опубликованного товара
    const var3 = await prisma.productVariant.create({
      data: {
        productId: activeProductId,
        sizeId: sizes[0].id,
        heightId: heights[1].id,
        formatId: formats[0].id,
        sku: "LZ-CART-E2E-VAR3-INACTIVE",
        priceOverride: null,
        isActive: false, // НЕАКТИВЕН!
      },
    });
    inactiveVariantId = var3.id;

    // Вариант 4: вариант неопубликованного товара
    const var4 = await prisma.productVariant.create({
      data: {
        productId: draftProductId,
        sizeId: sizes[0].id,
        heightId: heights[0].id,
        formatId: formats[0].id,
        sku: "LZ-CART-E2E-DRAFT-VAR",
        priceOverride: null,
        isActive: true,
      },
    });
    draftVariantId = var4.id;

    // =========================================================================
    // ТЕСТ 1: Инициализация и получение пустой корзины
    // =========================================================================
    await t.test("1. GET /api/v1/cart returns empty cart with 0 totals in KGS", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/cart",
        headers: { authorization: `Bearer ${customer1Token}` },
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);
      assert.equal(json.success, true);
      assert.equal(json.data.totalItems, 0);
      assert.equal(json.data.totalAmount, 0);
      assert.equal(json.data.currency, "KGS");
      assert.deepEqual(json.data.items, []);
    });

    // =========================================================================
    // ТЕСТ 2: Добавление выкройки в корзину с серверным расчётом цены
    // =========================================================================
    let cartItem1Id: string = "";
    await t.test("2. POST /api/v1/cart/items adds active variant and calculates price on server", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/cart/items",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${customer1Token}`,
        },
        payload: JSON.stringify({
          variantId: variant1Id,
          productId: activeProductId,
        }),
      });

      assert.equal(res.statusCode, 201);
      const json = JSON.parse(res.payload);
      assert.equal(json.success, true);
      assert.equal(json.data.totalItems, 1);
      assert.equal(json.data.totalAmount, 450); // базовая цена из БД
      assert.equal(json.data.currency, "KGS");

      const item = json.data.items[0];
      assert.equal(item.variantId, variant1Id);
      assert.equal(item.sku, "LZ-CART-E2E-VAR1");
      assert.equal(item.price, 450);
      cartItem1Id = item.id;
    });

    // =========================================================================
    // ТЕСТ 3: Запрет повторного добавления того же варианта (409 Conflict)
    // =========================================================================
    await t.test("3. POST /api/v1/cart/items rejects duplicate variant (409 Conflict)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/cart/items",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${customer1Token}`,
        },
        payload: JSON.stringify({ variantId: variant1Id }),
      });

      assert.equal(res.statusCode, 409);
      const json = JSON.parse(res.payload);
      assert.equal(json.error?.code, "VARIANT_ALREADY_IN_CART");
    });

    // =========================================================================
    // ТЕСТ 4: Запрет добавления неопубликованной выкройки (400 Bad Request)
    // =========================================================================
    await t.test("4. POST /api/v1/cart/items rejects unpublished pattern (400 Bad Request)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/cart/items",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${customer1Token}`,
        },
        payload: JSON.stringify({ variantId: draftVariantId }),
      });

      assert.equal(res.statusCode, 400);
      const json = JSON.parse(res.payload);
      assert.equal(json.error?.code, "PRODUCT_INACTIVE");
    });

    // =========================================================================
    // ТЕСТ 5: Запрет добавления неактивного варианта (400 Bad Request)
    // =========================================================================
    await t.test("5. POST /api/v1/cart/items rejects inactive variant (400 Bad Request)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/cart/items",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${customer1Token}`,
        },
        payload: JSON.stringify({ variantId: inactiveVariantId }),
      });

      assert.equal(res.statusCode, 400);
      const json = JSON.parse(res.payload);
      assert.equal(json.error?.code, "VARIANT_INACTIVE");
    });

    // =========================================================================
    // ТЕСТ 6: Проверка принадлежности варианта указанной выкройке
    // =========================================================================
    await t.test("6. POST /api/v1/cart/items validates variant belongs to requested product", async () => {
      const fakeProductId = "00000000-0000-4000-8000-000000000099";
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/cart/items",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${customer1Token}`,
        },
        payload: JSON.stringify({
          variantId: variant2Id,
          productId: fakeProductId, // Не совпадает с productId варианта
        }),
      });

      assert.equal(res.statusCode, 400);
      const json = JSON.parse(res.payload);
      assert.equal(json.error?.code, "VARIANT_MISMATCH");
    });

    // =========================================================================
    // ТЕСТ 7: Изменение выбранного варианта с пересчётом priceOverride
    // =========================================================================
    await t.test("7. PUT /api/v1/cart/items/:id updates variant and applies priceOverride", async () => {
      const res = await app.inject({
        method: "PUT",
        url: `/api/v1/cart/items/${cartItem1Id}`,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${customer1Token}`,
        },
        payload: JSON.stringify({ newVariantId: variant2Id }),
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);
      assert.equal(json.data.totalItems, 1);
      assert.equal(json.data.totalAmount, 500); // 500 из-за priceOverride варианта 2!
      assert.equal(json.data.items[0].variantId, variant2Id);
      assert.equal(json.data.items[0].price, 500);
    });

    // =========================================================================
    // ТЕСТ 8: Добавление второго товара и проверка суммы корзины
    // =========================================================================
    await t.test("8. Adding second item correctly calculates sum (500 + 450 = 950 KGS)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/cart/items",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${customer1Token}`,
        },
        payload: JSON.stringify({ variantId: variant1Id }),
      });

      assert.equal(res.statusCode, 201);
      const json = JSON.parse(res.payload);
      assert.equal(json.data.totalItems, 2);
      assert.equal(json.data.totalAmount, 950);
    });

    // =========================================================================
    // ТЕСТ 9: Изоляция корзины между покупателями
    // =========================================================================
    await t.test("9. User B cannot see or manipulate User A's cart items", async () => {
      // Покупатель 2 имеет пустую корзину
      const res2 = await app.inject({
        method: "GET",
        url: "/api/v1/cart",
        headers: { authorization: `Bearer ${customer2Token}` },
      });
      assert.equal(res2.statusCode, 200);
      assert.equal(JSON.parse(res2.payload).data.totalItems, 0);

      // Покупатель 2 пытается удалить позицию Покупателя 1 -> 404 CART_ITEM_NOT_FOUND
      const delRes = await app.inject({
        method: "DELETE",
        url: `/api/v1/cart/items/${cartItem1Id}`,
        headers: { authorization: `Bearer ${customer2Token}` },
      });
      assert.equal(delRes.statusCode, 404);
      assert.equal(JSON.parse(delRes.payload).error?.code, "CART_ITEM_NOT_FOUND");
    });

    // =========================================================================
    // ТЕСТ 10: Запрет оформления заказа с пустой корзиной (422 CART_EMPTY)
    // =========================================================================
    await t.test("10. POST /api/v1/orders/checkout rejects empty cart (422 CART_EMPTY)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/orders/checkout",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${customer2Token}`, // У customer2 пустая корзина
        },
        payload: JSON.stringify({}),
      });

      assert.equal(res.statusCode, 422);
      const json = JSON.parse(res.payload);
      assert.equal(json.error?.code, "CART_EMPTY");
    });

    // =========================================================================
    // ТЕСТ 11: Успешное транзакционное оформление заказа из корзины
    // =========================================================================
    await t.test("11. Checkout creates order, freezes snapshots, and atomically clears cart", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/orders/checkout",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${customer1Token}`,
        },
        payload: JSON.stringify({
          customerName: "Айпери Бектемирова",
          customerPhone: "+996555112233",
        }),
      });

      assert.equal(res.statusCode, 201);
      const json = JSON.parse(res.payload);
      assert.equal(json.success, true);

      const orderData = json.data;
      createdOrderId = orderData.orderId;
      assert.ok(orderData.orderNumber.startsWith("LZ-2026-"));
      assert.equal(orderData.totalAmount, 950);
      assert.equal(orderData.currency, "KGS");
      assert.equal(orderData.status, OrderStatus.PENDING);
      assert.equal(orderData.customerEmail, "customer1@test-lekalo-zhiide.local");
      assert.equal(orderData.customerName, "Айпери Бектемирова");
      assert.equal(orderData.itemsCount, 2);

      // Проверяем, что корзина Покупателя 1 была автоматически и атомарно очищена
      const cartRes = await app.inject({
        method: "GET",
        url: "/api/v1/cart",
        headers: { authorization: `Bearer ${customer1Token}` },
      });
      assert.equal(cartRes.statusCode, 200);
      const cartJson = JSON.parse(cartRes.payload);
      assert.equal(cartJson.data.totalItems, 0);
      assert.equal(cartJson.data.totalAmount, 0);

      // Проверяем снимок позиций заказа (productSnapshot) в БД
      assert.ok(createdOrderId);
      const dbOrder = await prisma.order.findUnique({
        where: { id: createdOrderId! },
        include: { items: true },
      });
      assert.ok(dbOrder);
      assert.equal(dbOrder.items.length, 2);

      const itemWithOverride = dbOrder.items.find((i: any) => i.productVariantId === variant2Id);
      assert.ok(itemWithOverride);
      assert.equal(Number(itemWithOverride.priceAtPurchase), 500);
      const snapshot: any = itemWithOverride.productSnapshot;
      assert.equal(snapshot.title, "Платье Silk Cart E2E");
      assert.equal(snapshot.sku, "LZ-CART-E2E-VAR2");
      assert.equal(snapshot.price, 500);
      assert.equal(snapshot.currency, "KGS");
      assert.ok(snapshot.size);
      assert.ok(snapshot.height);
      assert.ok(snapshot.format);
    });

    // =========================================================================
    // ТЕСТ 12: Атомарный откат транзакции: сохранение корзины при ошибке чекаута
    // =========================================================================
    await t.test("12. Failed checkout does not clear cart and preserves items atomically", async () => {
      // 12.1. Добавляем снова товар в корзину
      await app.inject({
        method: "POST",
        url: "/api/v1/cart/items",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${customer1Token}`,
        },
        payload: JSON.stringify({ variantId: variant1Id }),
      });

      // 12.2. Администратор деактивирует товар в БД
      await prisma.productVariant.update({
        where: { id: variant1Id! },
        data: { isActive: false },
      });

      // 12.3. Попытка чекаута должна провалиться с 400 VARIANT_INACTIVE
      const failCheckout = await app.inject({
        method: "POST",
        url: "/api/v1/orders/checkout",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${customer1Token}`,
        },
        payload: JSON.stringify({}),
      });
      assert.equal(failCheckout.statusCode, 400);
      assert.equal(JSON.parse(failCheckout.payload).error?.code, "VARIANT_INACTIVE");

      // 12.4. Проверяем, что корзина НЕ была удалена транзакцией
      const cartCheck = await app.inject({
        method: "GET",
        url: "/api/v1/cart",
        headers: { authorization: `Bearer ${customer1Token}` },
      });
      assert.equal(cartCheck.statusCode, 200);
      assert.equal(JSON.parse(cartCheck.payload).data.totalItems, 1);

      // Возвращаем активность варианта
      await prisma.productVariant.update({
        where: { id: variant1Id! },
        data: { isActive: true },
      });

      // Очищаем тестовую корзину через DELETE /api/v1/cart
      const clearRes = await app.inject({
        method: "DELETE",
        url: "/api/v1/cart",
        headers: { authorization: `Bearer ${customer1Token}` },
      });
      assert.equal(clearRes.statusCode, 200);
      assert.equal(JSON.parse(clearRes.payload).data.totalItems, 0);
    });

    // =========================================================================
    // ТЕСТ 13: Просмотр заказов покупателем и изоляция чужих заказов
    // =========================================================================
    await t.test("13. Customer views their orders list and cannot access other customer's order", async () => {
      // Список заказов Покупателя 1
      const listRes = await app.inject({
        method: "GET",
        url: "/api/v1/orders",
        headers: { authorization: `Bearer ${customer1Token}` },
      });
      assert.equal(listRes.statusCode, 200);
      const listJson = JSON.parse(listRes.payload);
      assert.ok(listJson.data.some((o: any) => o.id === createdOrderId));

      // Просмотр своего заказа Покупателем 1
      const orderRes = await app.inject({
        method: "GET",
        url: `/api/v1/orders/${createdOrderId}`,
        headers: { authorization: `Bearer ${customer1Token}` },
      });
      assert.equal(orderRes.statusCode, 200);
      const orderJson = JSON.parse(orderRes.payload);
      assert.equal(orderJson.data.id, createdOrderId);
      assert.equal(orderJson.data.totalAmount, 950);

      // Покупатель 2 пытается просмотреть заказ Покупателя 1 -> 403 Forbidden
      const forbidRes = await app.inject({
        method: "GET",
        url: `/api/v1/orders/${createdOrderId}`,
        headers: { authorization: `Bearer ${customer2Token}` },
      });
      assert.equal(forbidRes.statusCode, 403);
      assert.equal(JSON.parse(forbidRes.payload).error?.code, "FORBIDDEN");
    });

    // =========================================================================
    // ТЕСТ 14: Административный доступ к заказам (RBAC)
    // =========================================================================
    await t.test("14. Admin routes enforce RBAC (401 unauth, 403 customer, 200 admin)", async () => {
      // 14.1. Без токена -> 401 Unauthorized
      const noAuth = await app.inject({
        method: "GET",
        url: "/api/v1/admin/orders",
      });
      assert.equal(noAuth.statusCode, 401);

      // 14.2. Токен покупателя -> 403 Forbidden
      const custAuth = await app.inject({
        method: "GET",
        url: "/api/v1/admin/orders",
        headers: { authorization: `Bearer ${customer1Token}` },
      });
      assert.equal(custAuth.statusCode, 403);

      // 14.3. Токен администратора -> 200 OK
      const adminList = await app.inject({
        method: "GET",
        url: "/api/v1/admin/orders",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      assert.equal(adminList.statusCode, 200);
      const adminListJson = JSON.parse(adminList.payload);
      assert.ok(adminListJson.data.items.some((o: any) => o.id === createdOrderId));
      assert.ok(adminListJson.data.meta.totalItems >= 1);

      // 14.4. Детальный просмотр любого заказа администратором
      const adminDetail = await app.inject({
        method: "GET",
        url: `/api/v1/admin/orders/${createdOrderId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      assert.equal(adminDetail.statusCode, 200);
      const adminDetailJson = JSON.parse(adminDetail.payload);
      assert.equal(adminDetailJson.data.id, createdOrderId);
      assert.ok(adminDetailJson.data.user);
      assert.equal(adminDetailJson.data.user.email, "customer1@test-lekalo-zhiide.local");
    });

  } finally {
    // -------------------------------------------------------------------------
    // БЕЗОПАСНАЯ ОЧИСТКА ТЕСТОВЫХ ДАННЫХ ИЗ POSTGRESQL
    // -------------------------------------------------------------------------
    if (createdOrderId) {
      await prisma.orderItem.deleteMany({ where: { orderId: createdOrderId } });
      await prisma.order.delete({ where: { id: createdOrderId } }).catch(() => {});
    }

    // Удаляем все корзины тестовых пользователей
    const testUserIds = [adminId, customer1Id, customer2Id];
    const carts = await prisma.cart.findMany({ where: { userId: { in: testUserIds } } });
    const cartIds = carts.map((c) => c.id);
    if (cartIds.length > 0) {
      await prisma.cartItem.deleteMany({ where: { cartId: { in: cartIds } } });
      await prisma.cart.deleteMany({ where: { id: { in: cartIds } } });
    }

    if (activeProductId) {
      await prisma.productVariant.deleteMany({ where: { productId: activeProductId } });
      await prisma.product.delete({ where: { id: activeProductId } }).catch(() => {});
    }
    if (draftProductId) {
      await prisma.productVariant.deleteMany({ where: { productId: draftProductId } });
      await prisma.product.delete({ where: { id: draftProductId } }).catch(() => {});
    }
    if (testCategoryId) {
      await prisma.category.delete({ where: { id: testCategoryId } }).catch(() => {});
    }

    await prisma.user.deleteMany({ where: { id: { in: testUserIds } } }).catch(() => {});

    await app.close();
    await prisma.$disconnect();
  }
});
