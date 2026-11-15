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
import {
  Role,
  OrderStatus,
  PaymentStatus,
  EntitlementStatus,
  FileType,
} from "@prisma/client";

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

test("Cabinet Module E2E: Digital Entitlements, Library & Secure Downloads with PostgreSQL", async (t) => {
  const app = await createTestApp();
  const gateway = new MockPaymentGateway();

  const customer1Id = "c1000000-0000-4000-8000-000000000001";
  const customer2Id = "c2000000-0000-4000-8000-000000000002";

  // Пользователи
  await prisma.user.upsert({
    where: { id: customer1Id },
    update: { role: Role.CUSTOMER },
    create: {
      id: customer1Id,
      email: "cust1-cab@test-lekalo-zhiide.local",
      role: Role.CUSTOMER,
      firstName: "Жылдыз",
      lastName: "Асанова",
    },
  });

  await prisma.user.upsert({
    where: { id: customer2Id },
    update: { role: Role.CUSTOMER },
    create: {
      id: customer2Id,
      email: "cust2-cab@test-lekalo-zhiide.local",
      role: Role.CUSTOMER,
      firstName: "Азамат",
      lastName: "Ибраимов",
    },
  });

  const customer1Token = signAccessToken({
    sub: customer1Id,
    email: "cust1-cab@test-lekalo-zhiide.local",
    role: Role.CUSTOMER,
    sessionId: "sess-cab-cust1",
  });

  const customer2Token = signAccessToken({
    sub: customer2Id,
    email: "cust2-cab@test-lekalo-zhiide.local",
    role: Role.CUSTOMER,
    sessionId: "sess-cab-cust2",
  });

  // Фикстуры каталога
  const category = await prisma.category.create({
    data: {
      title: "Кабинетные платья",
      slug: "cab-dresses-" + Date.now(),
    },
  });

  const product = await prisma.product.create({
    data: {
      title: "Платье Silk Elegance",
      slug: "silk-elegance-" + Date.now(),
      description: "Элегантное шелковое платье",
      basePrice: 500,
      categoryId: category.id,
      isActive: true,
      images: {
        create: {
          imageUrl: "https://cdn.example.kg/silk-cover.webp",
          altText: "Обложка",
          isCover: true,
          displayOrder: 0,
        },
      },
    },
  });

  // Общая инструкция по пошиву модели
  const instruction = await prisma.productInstruction.create({
    data: {
      productId: product.id,
      title: "Инструкция по пошиву платья Silk Elegance",
      s3Bucket: "private-instructions",
      s3Key: "private/instructions/silk_elegance_inst.pdf",
      fileName: "Instruction_Silk_Elegance.pdf",
      fileSizeBytes: 2048576,
      checksumSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      version: 1,
      isActive: true,
    },
  });

  const timestamp = Date.now();
  const sizeCode = "C44-" + timestamp.toString().slice(-6);
  const heightCode = "C170-" + timestamp.toString().slice(-6);
  const formatCode = "CA4-" + timestamp.toString().slice(-6);

  const size = await prisma.size.create({
    data: {
      code: sizeCode,
      label: "44",
    },
  });

  const height = await prisma.height.create({
    data: {
      code: heightCode,
      label: "164-170 см",
    },
  });

  const format = await prisma.format.create({
    data: {
      code: formatCode,
      label: "A4",
    },
  });

  // Вариант 1
  const variant1 = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sizeId: size.id,
      heightId: height.id,
      formatId: format.id,
      sku: "LZ-CAB-VAR1-" + Date.now(),
      priceOverride: 500,
      isActive: true,
    },
  });

  // Цифровой файл выкройки с двумя версиями (v1 и v2)
  const digitalFile = await prisma.digitalFile.create({
    data: {
      variantId: variant1.id,
      fileType: FileType.PATTERN,
      title: "Выкройка платья Silk Elegance (44, 164-170, A4)",
      isActive: true,
    },
  });

  const version1 = await prisma.fileVersion.create({
    data: {
      digitalFileId: digitalFile.id,
      versionNumber: 1,
      s3Bucket: "private-patterns",
      s3Key: "private/patterns/var1/pattern_v1.pdf",
      originalFileName: "pattern_v1.pdf",
      fileSizeBytes: 4500000,
      checksumSha256: "aaa0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852baaa",
      changelog: "Первоначальный релиз выкройки",
    },
  });

  const version2 = await prisma.fileVersion.create({
    data: {
      digitalFileId: digitalFile.id,
      versionNumber: 2,
      s3Bucket: "private-patterns",
      s3Key: "private/patterns/var1/pattern_v2.pdf",
      originalFileName: "pattern_v2.pdf",
      fileSizeBytes: 4510000,
      checksumSha256: "bbb0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852bbbb",
      changelog: "Скорректирована линия проймы рукава",
    },
  });

  // Устанавливаем v2 как актуальную версию
  await prisma.digitalFile.update({
    where: { id: digitalFile.id },
    data: { currentVersionId: version2.id },
  });

  let testOrderId: string | null = null;
  let entitlement1Id: string | null = null;

  try {
    // Создаем тестовый заказ для Покупателя 1
    const order = await prisma.order.create({
      data: {
        orderNumber: "LZ-CAB-" + Date.now(),
        userId: customer1Id,
        customerEmail: "cust1-cab@test-lekalo-zhiide.local",
        customerName: "Жылдыз Асанова",
        totalAmount: 500,
        currency: "KGS",
        status: OrderStatus.PENDING,
        items: {
          create: {
            productVariantId: variant1.id,
            priceAtPurchase: 500,
            productSnapshot: {
              productTitle: product.title,
              sku: variant1.sku,
            },
          },
        },
      },
      include: { items: true },
    });
    testOrderId = order.id;

    // Создаем платёж
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        paymentGateway: "mock",
        idempotencyKey: "cab_pay_" + Date.now(),
        amount: 500,
        currency: "KGS",
        status: PaymentStatus.PENDING,
      },
    });

    // =========================================================================
    // ТЕСТ 1: Успешный платеж автоматически создает PurchaseEntitlement
    // =========================================================================
    await t.test("1. Successful payment webhook atomically creates PurchaseEntitlement for each OrderItem", async () => {
      const webhookPayload = {
        orderId: order.id,
        paymentId: payment.id,
        amount: 500,
        currency: "KGS",
        status: "SUCCEEDED",
        externalId: "ext_bank_cab_01",
      };
      const signature = gateway.generateSignature(webhookPayload);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/payments/mock",
        headers: {
          "content-type": "application/json",
          "x-signature": signature,
        },
        payload: JSON.stringify(webhookPayload),
      });

      assert.equal(res.statusCode, 200);

      // Проверяем статус заказа и платежа
      const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
      assert.equal(updatedOrder?.status, OrderStatus.PAID);

      // Проверяем создание PurchaseEntitlement
      const entitlements = await prisma.purchaseEntitlement.findMany({
        where: { userId: customer1Id },
      });
      assert.equal(entitlements.length, 1);
      assert.equal(entitlements[0].orderItemId, order.items[0].id);
      assert.equal(entitlements[0].variantId, variant1.id);
      assert.equal(entitlements[0].status, EntitlementStatus.ACTIVE);
      assert.equal(entitlements[0].downloadCount, 0);

      entitlement1Id = entitlements[0].id;
    });

    // =========================================================================
    // ТЕСТ 2: Повторный webhook идемпотентен и не дублирует права
    // =========================================================================
    await t.test("2. Duplicate webhook is idempotent and does not create duplicate entitlements", async () => {
      const webhookPayload = {
        orderId: order.id,
        paymentId: payment.id,
        amount: 500,
        currency: "KGS",
        status: "SUCCEEDED",
        externalId: "ext_bank_cab_01",
      };
      const signature = gateway.generateSignature(webhookPayload);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/webhooks/payments/mock",
        headers: {
          "content-type": "application/json",
          "x-signature": signature,
        },
        payload: JSON.stringify(webhookPayload),
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);
      assert.equal(json.data.idempotent, true);

      // Количество прав осталось ровно 1
      const count = await prisma.purchaseEntitlement.count({
        where: { userId: customer1Id },
      });
      assert.equal(count, 1);
    });

    // =========================================================================
    // ТЕСТ 3: GET /api/v1/cabinet/library возвращает купленные выкройки
    // =========================================================================
    await t.test("3. GET /api/v1/cabinet/library returns purchased patterns with metadata and currentVersion", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/cabinet/library",
        headers: {
          authorization: `Bearer ${customer1Token}`,
        },
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);
      assert.equal(json.success, true);
      assert.equal(json.data.length, 1);

      const item = json.data[0];
      assert.equal(item.entitlementId, entitlement1Id);
      assert.equal(item.status, EntitlementStatus.ACTIVE);
      assert.equal(item.productTitle, "Платье Silk Elegance");
      assert.equal(item.size, sizeCode);
      assert.equal(item.height, heightCode);
      assert.equal(item.format, formatCode);
      assert.ok(item.coverUrl.includes("silk-cover.webp"));
      assert.equal(item.instructionId, instruction.id);
      assert.equal(item.currentVersion, 2); // Версия v2 актуальная
      assert.equal(item.changelog, "Скорректирована линия проймы рукава");
      assert.equal(item.downloadCount, 0);

      // Безопасность: в ответе нет s3Key или s3Bucket
      const itemStr = JSON.stringify(item);
      assert.equal(itemStr.includes("private-patterns"), false);
      assert.equal(itemStr.includes("pattern_v2.pdf"), false);
    });

    // =========================================================================
    // ТЕСТ 4: Изоляция пользователей — Покупатель 2 не видит выкройки Покупателя 1
    // =========================================================================
    await t.test("4. Customer 2 sees empty library (user isolation)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/cabinet/library",
        headers: {
          authorization: `Bearer ${customer2Token}`,
        },
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);
      assert.equal(json.data.length, 0);
    });

    // =========================================================================
    // ТЕСТ 5: POST /api/v1/cabinet/files/:id/download-url выдает актуальную v2
    // =========================================================================
    await t.test("5. POST /cabinet/files/:id/download-url yields current v2 by default and logs download", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/cabinet/files/${entitlement1Id}/download-url`,
        headers: {
          authorization: `Bearer ${customer1Token}`,
        },
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);
      assert.equal(json.success, true);
      assert.equal(json.data.expiresInSeconds, 600);
      assert.ok(json.data.downloadUrl.includes("disposition=attachment"));
      assert.ok(json.data.fileName.includes("_v2.pdf"));

      // Проверяем атомарный инкремент downloadCount в БД
      const updatedEnt = await prisma.purchaseEntitlement.findUnique({
        where: { id: entitlement1Id! },
      });
      assert.equal(updatedEnt?.downloadCount, 1);

      // Проверяем запись в DownloadLog
      const log = await prisma.downloadLog.findFirst({
        where: { entitlementId: entitlement1Id! },
        orderBy: { downloadedAt: "desc" },
      });
      assert.ok(log);
      assert.equal(log.userId, customer1Id);
      assert.equal(log.fileVersionId, version2.id); // Зафиксирована версия v2
    });

    // =========================================================================
    // ТЕСТ 6: Запрос архивной версии v1 возвращает ссылку на v1
    // =========================================================================
    await t.test("6. POST /cabinet/files/:id/download-url with { versionNumber: 1 } yields archival v1", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/cabinet/files/${entitlement1Id}/download-url`,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${customer1Token}`,
        },
        payload: JSON.stringify({ versionNumber: 1 }),
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);
      assert.ok(json.data.fileName.includes("_v1.pdf"));

      // downloadCount увеличился до 2
      const updatedEnt = await prisma.purchaseEntitlement.findUnique({
        where: { id: entitlement1Id! },
      });
      assert.equal(updatedEnt?.downloadCount, 2);

      // DownloadLog содержит версию v1
      const log = await prisma.downloadLog.findFirst({
        where: { entitlementId: entitlement1Id! },
        orderBy: { downloadedAt: "desc" },
      });
      assert.equal(log?.fileVersionId, version1.id);
    });

    // =========================================================================
    // ТЕСТ 7: Запрос несуществующей версии возвращает 404 Not Found
    // =========================================================================
    await t.test("7. Requesting non-existent version returns 404 Not Found", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/cabinet/files/${entitlement1Id}/download-url`,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${customer1Token}`,
        },
        payload: JSON.stringify({ versionNumber: 99 }),
      });

      assert.equal(res.statusCode, 404);
      const json = JSON.parse(res.payload);
      assert.equal(json.error?.code, "VERSION_NOT_FOUND");
    });

    // =========================================================================
    // ТЕСТ 8: Покупатель 2 не может скачать выкройку Покупателя 1 (403 Forbidden)
    // =========================================================================
    await t.test("8. Customer 2 cannot download Customer 1's entitlement (403 Forbidden)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/v1/cabinet/files/${entitlement1Id}/download-url`,
        headers: {
          authorization: `Bearer ${customer2Token}`,
        },
      });

      assert.equal(res.statusCode, 403);
      const json = JSON.parse(res.payload);
      assert.equal(json.error?.code, "FORBIDDEN");
    });

    // =========================================================================
    // ТЕСТ 9: Отозванное право (REVOKED) блокирует выдачу ссылки (403 Forbidden)
    // =========================================================================
    await t.test("9. REVOKED entitlement blocks download (403 ENTITLEMENT_REVOKED)", async () => {
      await prisma.purchaseEntitlement.update({
        where: { id: entitlement1Id! },
        data: { status: EntitlementStatus.REVOKED },
      });

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/cabinet/files/${entitlement1Id}/download-url`,
        headers: {
          authorization: `Bearer ${customer1Token}`,
        },
      });

      assert.equal(res.statusCode, 403);
      const json = JSON.parse(res.payload);
      assert.equal(json.error?.code, "ENTITLEMENT_REVOKED");

      // Восстанавливаем статус для последующих проверок
      await prisma.purchaseEntitlement.update({
        where: { id: entitlement1Id! },
        data: { status: EntitlementStatus.ACTIVE },
      });
    });

    // =========================================================================
    // ТЕСТ 10: Истёкший срок действия (expiresAt) блокирует выдачу ссылки
    // =========================================================================
    await t.test("10. Expired expiresAt blocks download (403 ENTITLEMENT_EXPIRED)", async () => {
      await prisma.purchaseEntitlement.update({
        where: { id: entitlement1Id! },
        data: { expiresAt: new Date(Date.now() - 60000) }, // 1 минуту назад
      });

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/cabinet/files/${entitlement1Id}/download-url`,
        headers: {
          authorization: `Bearer ${customer1Token}`,
        },
      });

      assert.equal(res.statusCode, 403);
      const json = JSON.parse(res.payload);
      assert.equal(json.error?.code, "ENTITLEMENT_EXPIRED");

      // Сбрасываем expiresAt
      await prisma.purchaseEntitlement.update({
        where: { id: entitlement1Id! },
        data: { expiresAt: null },
      });
    });

    // =========================================================================
    // ТЕСТ 11: Превышение maxDownloads блокирует выдачу ссылки
    // =========================================================================
    await t.test("11. Exceeding maxDownloads blocks download (403 DOWNLOAD_LIMIT_EXCEEDED)", async () => {
      await prisma.purchaseEntitlement.update({
        where: { id: entitlement1Id! },
        data: { maxDownloads: 2, downloadCount: 2 },
      });

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/cabinet/files/${entitlement1Id}/download-url`,
        headers: {
          authorization: `Bearer ${customer1Token}`,
        },
      });

      assert.equal(res.statusCode, 403);
      const json = JSON.parse(res.payload);
      assert.equal(json.error?.code, "DOWNLOAD_LIMIT_EXCEEDED");

      // Снимаем ограничение
      await prisma.purchaseEntitlement.update({
        where: { id: entitlement1Id! },
        data: { maxDownloads: null },
      });
    });

    // =========================================================================
    // ТЕСТ 12: Скачивание инструкции покупателем модели разрешено
    // =========================================================================
    await t.test("12. GET /cabinet/instructions/:id/download-url succeeds for product buyer", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/cabinet/instructions/${instruction.id}/download-url`,
        headers: {
          authorization: `Bearer ${customer1Token}`,
        },
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.payload);
      assert.equal(json.success, true);
      assert.ok(json.data.downloadUrl);
      assert.ok(json.data.fileName.includes("Silk_Elegance"));
    });

    // =========================================================================
    // ТЕСТ 13: Посторонний пользователь не может скачать инструкцию (403 Forbidden)
    // =========================================================================
    await t.test("13. GET /cabinet/instructions/:id/download-url rejected for non-buyer (403 Forbidden)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/cabinet/instructions/${instruction.id}/download-url`,
        headers: {
          authorization: `Bearer ${customer2Token}`,
        },
      });

      assert.equal(res.statusCode, 403);
      const json = JSON.parse(res.payload);
      assert.equal(json.error?.code, "FORBIDDEN");
    });

    // =========================================================================
    // ТЕСТ 14: Неавторизованный запрос отклоняется (401 Unauthorized)
    // =========================================================================
    await t.test("14. Unauthenticated requests rejected with 401 Unauthorized", async () => {
      const res1 = await app.inject({
        method: "GET",
        url: "/api/v1/cabinet/library",
      });
      assert.equal(res1.statusCode, 401);

      const res2 = await app.inject({
        method: "POST",
        url: `/api/v1/cabinet/files/${entitlement1Id}/download-url`,
      });
      assert.equal(res2.statusCode, 401);
    });

    // =========================================================================
    // ТЕСТ 15: Превышение Rate Limit (более 10 запросов в минуту) блокируется (429)
    // =========================================================================
    await t.test("15. Rate Limiter blocks more than 10 download requests per minute (429 Too Many Requests)", async () => {
      // Пользователь 1 уже сделал несколько запросов выше, сделаем цикл до 11
      let rateLimited = false;
      for (let i = 0; i < 12; i++) {
        const res = await app.inject({
          method: "POST",
          url: `/api/v1/cabinet/files/${entitlement1Id}/download-url`,
          headers: {
            authorization: `Bearer ${customer1Token}`,
          },
        });
        if (res.statusCode === 429) {
          rateLimited = true;
          const json = JSON.parse(res.payload);
          assert.equal(json.error?.code, "RATE_LIMIT_EXCEEDED");
          break;
        }
      }
      assert.equal(rateLimited, true);
    });

  } finally {
    // Безопасная очистка тестовых данных
    await prisma.downloadLog.deleteMany({
      where: { userId: { in: [customer1Id, customer2Id] } },
    }).catch(() => {});

    await prisma.purchaseEntitlement.deleteMany({
      where: { userId: { in: [customer1Id, customer2Id] } },
    }).catch(() => {});

    if (testOrderId) {
      await prisma.paymentWebhookEvent.deleteMany({
        where: { paymentGateway: "mock" },
      }).catch(() => {});
      await prisma.payment.deleteMany({
        where: { orderId: testOrderId },
      }).catch(() => {});
      await prisma.orderItem.deleteMany({
        where: { orderId: testOrderId },
      }).catch(() => {});
      await prisma.order.delete({
        where: { id: testOrderId },
      }).catch(() => {});
    }

    // Снимаем currentVersionId перед удалением версий
    await prisma.digitalFile.update({
      where: { id: digitalFile.id },
      data: { currentVersionId: null },
    }).catch(() => {});

    await prisma.fileVersion.deleteMany({
      where: { digitalFileId: digitalFile.id },
    }).catch(() => {});
    await prisma.digitalFile.delete({
      where: { id: digitalFile.id },
    }).catch(() => {});
    await prisma.productInstruction.delete({
      where: { id: instruction.id },
    }).catch(() => {});
    await prisma.productVariant.delete({
      where: { id: variant1.id },
    }).catch(() => {});
    await prisma.productImage.deleteMany({
      where: { productId: product.id },
    }).catch(() => {});
    await prisma.product.delete({
      where: { id: product.id },
    }).catch(() => {});
    await prisma.category.delete({
      where: { id: category.id },
    }).catch(() => {});
    await prisma.size.delete({
      where: { id: size.id },
    }).catch(() => {});
    await prisma.height.delete({
      where: { id: height.id },
    }).catch(() => {});
    await prisma.format.delete({
      where: { id: format.id },
    }).catch(() => {});
    await prisma.user.deleteMany({
      where: { id: { in: [customer1Id, customer2Id] } },
    }).catch(() => {});

    await app.close();
    await prisma.$disconnect();
  }
});
