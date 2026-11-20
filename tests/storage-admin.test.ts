import test from "node:test";
import * as assert from "node:assert/strict";
import { S3StorageService } from "../src/modules/storage/s3-storage.service";
import { MockStorageService } from "../src/modules/storage/mock-storage.service";
import { validateSafeUrl } from "../src/utils/url-fetcher";
import { BadRequestError, ForbiddenError } from "../src/utils/errors";
import { StorageAdminController } from "../src/modules/storage/storage-admin.controller";
import { validatePdfBuffer } from "../src/utils/pdf-validator";
import { signAccessToken } from "../src/utils/jwt";
import { Role, FileType } from "@prisma/client";

// Вспомогательная функция генерации валидного тестового PDF со структурой ISO 32000-1
function createValidTestPdf(title = "Test Pattern"): Buffer {
  return Buffer.from(
`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] >>
endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer
<< /Size 4 /Root 1 0 R >>
startxref
192
%%EOF`
  );
}

test("Storage: MockStorageService implements uploadFile and deleteFile", async () => {
  const mockStorage = new MockStorageService();
  const sampleBuffer = Buffer.from("test image content");

  const uploadRes = await mockStorage.uploadFile({
    bucket: "product-images",
    key: "products/test/photo.jpg",
    body: sampleBuffer,
    contentType: "image/jpeg",
    isPublic: true,
  });

  assert.equal(uploadRes.bucket, "product-images");
  assert.equal(uploadRes.key, "products/test/photo.jpg");
  assert.equal(uploadRes.fileSizeBytes, sampleBuffer.length);
  assert.ok(uploadRes.sha256Hash);
  assert.ok(uploadRes.publicUrl?.includes("product-images/products/test/photo.jpg"));

  await mockStorage.deleteFile({
    bucket: "product-images",
    key: "products/test/photo.jpg",
  });
});

test("Storage: S3StorageService verifies valid and expired Presigned URLs", () => {
  const s3Storage = new S3StorageService();

  // Невалидный URL
  const malformedRes = s3Storage.verifyPresignedUrl("https://example.com/file.pdf");
  assert.equal(malformedRes.valid, false);
  assert.equal(malformedRes.reason, "MALFORMED_URL");

  // Истекший URL (X-Amz-Date в прошлом)
  const expiredUrl = "https://example.com/file.pdf?X-Amz-Date=20200101T000000Z&X-Amz-Expires=600";
  const expiredRes = s3Storage.verifyPresignedUrl(expiredUrl);
  assert.equal(expiredRes.valid, false);
  assert.equal(expiredRes.reason, "EXPIRED");

  // Валидный URL (X-Amz-Date текущий)
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const h = String(now.getUTCHours()).padStart(2, "0");
  const min = String(now.getUTCMinutes()).padStart(2, "0");
  const s = String(now.getUTCSeconds()).padStart(2, "0");
  const validUrl = `https://example.com/file.pdf?X-Amz-Date=${y}${m}${d}T${h}${min}${s}Z&X-Amz-Expires=600`;
  const validRes = s3Storage.verifyPresignedUrl(validUrl);
  assert.equal(validRes.valid, true);
});

test("URL Fetcher: validateSafeUrl blocks SSRF (localhost, private IP, AWS metadata, non-http protocols)", async () => {
  // Протоколы
  await assert.rejects(
    async () => validateSafeUrl("file:///etc/passwd"),
    (err: any) => err instanceof BadRequestError && err.code === "UNSUPPORTED_PROTOCOL"
  );
  await assert.rejects(
    async () => validateSafeUrl("ftp://example.com/file.pdf"),
    (err: any) => err instanceof BadRequestError && err.code === "UNSUPPORTED_PROTOCOL"
  );

  // Localhost
  await assert.rejects(
    async () => validateSafeUrl("http://localhost:3000/image.jpg"),
    (err: any) => err instanceof BadRequestError && err.code === "FORBIDDEN_HOST"
  );
  await assert.rejects(
    async () => validateSafeUrl("http://sub.localhost/image.jpg"),
    (err: any) => err instanceof BadRequestError && err.code === "FORBIDDEN_HOST"
  );

  // Приватные IPv4 адреса (127.0.0.1, 10.x, 192.168.x, 169.254.169.254)
  await assert.rejects(
    async () => validateSafeUrl("http://127.0.0.1:8080/image.jpg"),
    (err: any) => err instanceof BadRequestError && err.code === "FORBIDDEN_IP"
  );
  await assert.rejects(
    async () => validateSafeUrl("http://169.254.169.254/latest/meta-data/"),
    (err: any) => err instanceof BadRequestError && err.code === "FORBIDDEN_IP"
  );
  await assert.rejects(
    async () => validateSafeUrl("http://10.0.0.1/internal.pdf"),
    (err: any) => err instanceof BadRequestError && err.code === "FORBIDDEN_IP"
  );
  await assert.rejects(
    async () => validateSafeUrl("http://192.168.1.1/secret.pdf"),
    (err: any) => err instanceof BadRequestError && err.code === "FORBIDDEN_IP"
  );
});

test("Admin Storage Controller: blocks non-admin users from upload endpoints", async () => {
  const mockStorage = new MockStorageService();
  const mockPrisma = {} as any;
  const controller = new StorageAdminController(mockStorage, { client: mockPrisma } as any);

  const customerToken = signAccessToken({
    sub: "00000000-0000-0000-0000-000000000001",
    email: "customer@example.com",
    role: Role.CUSTOMER,
    sessionId: "00000000-0000-0000-0000-000000000002",
  });

  const fakeCustomerReq = {
    headers: { authorization: `Bearer ${customerToken}` },
  } as any;

  await assert.rejects(
    async () => controller.uploadImage({}, fakeCustomerReq),
    (err: any) => err instanceof ForbiddenError && err.code === "INSUFFICIENT_PERMISSIONS"
  );

  await assert.rejects(
    async () => controller.uploadPattern({}, fakeCustomerReq),
    (err: any) => err instanceof ForbiddenError && err.code === "INSUFFICIENT_PERMISSIONS"
  );
});

// =============================================================================
// STAGE 5.5: ТЕСТЫ P0-1, P0-2 И БЕЗОПАСНОСТИ ЗАГРУЗКИ PDF-ВЫКРОЕК
// =============================================================================

test("Stage 5.5 (P0-1): validatePdfBuffer successfully validates genuine ISO 32000-1 PDF", () => {
  const validBuffer = createValidTestPdf();
  const res = validatePdfBuffer(validBuffer);
  assert.equal(res.isValid, true);
  assert.equal(res.version, "1.4");
  assert.equal(res.pageCount, 1);
  assert.ok(res.sizeBytes > 120);
});

test("Stage 5.5 (P0-1): validatePdfBuffer rejects HTML document with .pdf extension", () => {
  const htmlBuffer = Buffer.from("<!DOCTYPE html><html><body><h1>Injected HTML</h1></body></html>");
  assert.throws(
    () => validatePdfBuffer(htmlBuffer),
    (err: any) => err instanceof BadRequestError && err.code === "INVALID_FILE_TYPE"
  );
});

test("Stage 5.5 (P0-1): validatePdfBuffer rejects ZIP archive with .pdf extension", () => {
  const zipBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00]);
  assert.throws(
    () => validatePdfBuffer(zipBuffer),
    (err: any) => err instanceof BadRequestError && err.code === "INVALID_FILE_TYPE"
  );
});

test("Stage 5.5 (P0-1): validatePdfBuffer rejects empty file (0 bytes)", () => {
  const emptyBuffer = Buffer.alloc(0);
  assert.throws(
    () => validatePdfBuffer(emptyBuffer),
    (err: any) => err instanceof BadRequestError && err.code === "EMPTY_FILE"
  );
});

test("Stage 5.5 (P0-1): validatePdfBuffer rejects corrupted/truncated PDF (missing %%EOF)", () => {
  const corruptBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  assert.throws(
    () => validatePdfBuffer(corruptBuffer),
    (err: any) => err instanceof BadRequestError && (err.code === "CORRUPTED_PDF_STRUCTURE" || err.code === "CORRUPTED_OR_INVALID_PDF")
  );
});

test("Stage 5.5 (P0-1): validatePdfBuffer rejects 79-byte demo stub without pages or catalog", () => {
  const demoStubBuffer = Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Title (Demo pattern stub) >>\nendobj\nxref\n0 2\ntrailer\n<< >>\nstartxref\n50\n%%EOF"
  );
  assert.throws(
    () => validatePdfBuffer(demoStubBuffer),
    (err: any) => err instanceof BadRequestError && (err.code === "CORRUPTED_OR_INVALID_PDF" || err.code === "INVALID_PDF_CATALOG" || err.code === "INVALID_PDF_PAGE_TREE")
  );
});

// ХЕЛПЕР ДЛЯ СКВОЗНЫХ ТЕСТОВ КОНТРОЛЛЕРА
function createTestHarness() {
  let storageUploadCalls = 0;
  let storageUploadedFiles: Array<{ key: string; fileName?: string; body: Buffer }> = [];
  let fileVersionCreateCalls = 0;
  let createdFileVersions: any[] = [];
  let digitalFileUpdateCalls = 0;

  let storageFailCondition: ((params: any) => boolean) | null = null;

  const mockStorage: any = {
    uploadFile: async (params: any) => {
      if (storageFailCondition && storageFailCondition(params)) {
        throw new Error("Simulated S3 Storage failure");
      }
      storageUploadCalls++;
      storageUploadedFiles.push(params);
      return {
        bucket: params.bucket,
        key: params.key,
        fileSizeBytes: params.body.length,
        sha256Hash: "fake_sha256_hash_" + storageUploadCalls,
      };
    },
    deleteFile: async () => {},
    generatePresignedGetUrl: async () => ({ downloadUrl: "https://example.com/test.pdf", expiresInSeconds: 600 }),
  };

  const cholponProduct = {
    id: "b0000000-0000-4000-8000-000000000001",
    title: "Пальто оверсайз «Чолпон» (Лимитированная серия)",
    slug: "palto-oversayz-cholpon",
    variants: [] as any[],
  };

  const aidaProduct = {
    id: "b0000000-0000-4000-8000-000000000002",
    title: "Платье миди «Аида» с запахом",
    slug: "plate-midi-aida-s-zapakhom",
    variants: [] as any[],
  };

  // Вариант 1: Пальто Чолпон, размер 42, рост 164-170, формат A4
  const cholponVariant42A4 = {
    id: "a0000000-0000-4000-8000-000000000001",
    productId: cholponProduct.id,
    sku: "LZ-PALTOOVE-42-164-170-A4",
    product: cholponProduct,
    size: { code: "42" },
    height: { code: "164-170" },
    format: { code: "A4" },
    digitalFiles: [] as any[],
  };

  // Вариант 2: Пальто Чолпон, размер 44, рост 164-170, формат A4
  const cholponVariant44A4 = {
    id: "a0000000-0000-4000-8000-000000000003",
    productId: cholponProduct.id,
    sku: "LZ-PALTOOVE-44-164-170-A4",
    product: cholponProduct,
    size: { code: "44" },
    height: { code: "164-170" },
    format: { code: "A4" },
    digitalFiles: [] as any[],
  };

  // Вариант 3: Пальто Чолпон, размер 42, рост 164-170, формат PLOTTER_900
  const cholponVariant42Plotter = {
    id: "a0000000-0000-4000-8000-000000000004",
    productId: cholponProduct.id,
    sku: "LZ-PALTOOVE-42-164-170-PLOTTER_900",
    product: cholponProduct,
    size: { code: "42" },
    height: { code: "164-170" },
    format: { code: "PLOTTER_900" },
    digitalFiles: [] as any[],
  };

  // Вариант 4: Пальто Чолпон, размер ALL, рост 164-170, формат A4
  const cholponVariantAllA4 = {
    id: "a0000000-0000-4000-8000-000000000005",
    productId: cholponProduct.id,
    sku: "LZ-PALTOOVE-ALL-164-170-A4",
    product: cholponProduct,
    size: { code: "ALL" },
    height: { code: "164-170" },
    format: { code: "A4" },
    digitalFiles: [] as any[],
  };

  cholponProduct.variants = [
    cholponVariant42A4,
    cholponVariant44A4,
    cholponVariant42Plotter,
    cholponVariantAllA4,
  ];

  // Вариант 5: Платье Аида, комплект ALL, рост 164-170, формат A4
  const aidaVariantAllA4 = {
    id: "a0000000-0000-4000-8000-000000000002",
    productId: aidaProduct.id,
    sku: "LZ-AIDA-ALL-164-170-A4",
    product: aidaProduct,
    size: { code: "ALL" },
    height: { code: "164-170" },
    format: { code: "A4" },
    digitalFiles: [] as any[],
  };

  aidaProduct.variants = [aidaVariantAllA4];

  const variantsMap = new Map<string, any>([
    [cholponVariant42A4.id, cholponVariant42A4],
    [cholponVariant44A4.id, cholponVariant44A4],
    [cholponVariant42Plotter.id, cholponVariant42Plotter],
    [cholponVariantAllA4.id, cholponVariantAllA4],
    [aidaVariantAllA4.id, aidaVariantAllA4],
  ]);

  const productsMap = new Map<string, any>([
    [cholponProduct.id, cholponProduct],
    [aidaProduct.id, aidaProduct],
  ]);

  const mockPrisma: any = {
    product: {
      findUnique: async ({ where }: any) => {
        return productsMap.get(where.id) || null;
      },
    },
    productVariant: {
      findUnique: async ({ where }: any) => {
        return variantsMap.get(where.id) || null;
      },
    },
    digitalFile: {
      create: async ({ data }: any) => {
        const newDf = {
          id: "df-" + Date.now(),
          variantId: data.variantId,
          fileType: data.fileType,
          title: data.title,
          isActive: true,
          currentVersionId: null,
          versions: [],
        };
        const variant = variantsMap.get(data.variantId);
        if (variant) {
          variant.digitalFiles.push(newDf);
        }
        return newDf;
      },
      update: async ({ where, data }: any) => {
        digitalFileUpdateCalls++;
        for (const v of variantsMap.values()) {
          const df = v.digitalFiles.find((d: any) => d.id === where.id);
          if (df) {
            df.currentVersionId = data.currentVersionId;
            return df;
          }
        }
        return null;
      },
    },
    fileVersion: {
      create: async ({ data }: any) => {
        fileVersionCreateCalls++;
        const newVersion = {
          id: "fv-" + Date.now() + "-" + fileVersionCreateCalls,
          digitalFileId: data.digitalFileId,
          versionNumber: data.versionNumber,
          s3Bucket: data.s3Bucket,
          s3Key: data.s3Key,
          originalFileName: data.originalFileName,
          fileSizeBytes: data.fileSizeBytes,
          checksumSha256: data.checksumSha256,
          mimeType: data.mimeType,
          changelog: data.changelog,
          createdAt: new Date(),
        };
        createdFileVersions.push(newVersion);
        for (const v of variantsMap.values()) {
          const df = v.digitalFiles.find((d: any) => d.id === data.digitalFileId);
          if (df) {
            df.versions.push(newVersion);
          }
        }
        return newVersion;
      },
    },
  };

  const controller = new StorageAdminController(mockStorage, { client: mockPrisma } as any);

  const adminToken = signAccessToken({
    sub: "00000000-0000-0000-0000-000000000099",
    email: "admin@lekalozhiide.local",
    role: Role.ADMIN,
    sessionId: "00000000-0000-0000-0000-000000000098",
  });

  const adminReq = {
    headers: { authorization: `Bearer ${adminToken}` },
  } as any;

  return {
    controller,
    adminReq,
    cholponProduct,
    cholponVariant42A4,
    cholponVariant44A4,
    cholponVariant42Plotter,
    cholponVariantAllA4,
    aidaProduct,
    aidaVariantAllA4,
    setStorageFailCondition: (fn: ((params: any) => boolean) | null) => {
      storageFailCondition = fn;
    },
    getStats: () => ({
      storageUploadCalls,
      storageUploadedFiles,
      fileVersionCreateCalls,
      createdFileVersions,
      digitalFileUpdateCalls,
    }),
  };
}

test("Stage 5.5 (P0-2): uploadPattern rejects filename with wrong size (e.g. 48 instead of 42)", async () => {
  const harness = createTestHarness();
  const validBuffer = createValidTestPdf();

  await assert.rejects(
    async () =>
      harness.controller.uploadPattern(
        {
          variantId: harness.cholponVariant42A4.id,
          fileBase64: validBuffer.toString("base64"),
          fileName: "palto-oversayz-cholpon-48-164-170-A4.pdf", // Ошибка: 48 вместо 42!
          contentType: "application/pdf",
        },
        harness.adminReq
      ),
    (err: any) =>
      err instanceof BadRequestError &&
      err.code === "FILENAME_VARIANT_MISMATCH" &&
      err.message.includes("palto-oversayz-cholpon-42-164-170-A4.pdf")
  );

  assert.equal(harness.getStats().storageUploadCalls, 0, "Файл не должен попадать в Storage");
  assert.equal(harness.getStats().fileVersionCreateCalls, 0, "FileVersion не должна создаваться");
});

test("Stage 5.5 (P0-2): uploadPattern rejects filename with wrong slug (e.g. palto-cholpon instead of palto-oversayz-cholpon)", async () => {
  const harness = createTestHarness();
  const validBuffer = createValidTestPdf();

  await assert.rejects(
    async () =>
      harness.controller.uploadPattern(
        {
          variantId: harness.cholponVariant42A4.id,
          fileBase64: validBuffer.toString("base64"),
          fileName: "palto-cholpon-42-164-170-A4.pdf", // Ошибка: сокращенный слаг
          contentType: "application/pdf",
        },
        harness.adminReq
      ),
    (err: any) =>
      err instanceof BadRequestError &&
      err.code === "FILENAME_VARIANT_MISMATCH" &&
      err.message.includes("palto-oversayz-cholpon-42-164-170-A4.pdf")
  );

  assert.equal(harness.getStats().storageUploadCalls, 0);
  assert.equal(harness.getStats().fileVersionCreateCalls, 0);
});

test("Stage 5.5 (P0-2): uploadPattern rejects filename with wrong format (e.g. PLOTTER_900 instead of A4)", async () => {
  const harness = createTestHarness();
  const validBuffer = createValidTestPdf();

  await assert.rejects(
    async () =>
      harness.controller.uploadPattern(
        {
          variantId: harness.cholponVariant42A4.id,
          fileBase64: validBuffer.toString("base64"),
          fileName: "palto-oversayz-cholpon-42-164-170-PLOTTER_900.pdf", // Ошибка: плоттер для А4
          contentType: "application/pdf",
        },
        harness.adminReq
      ),
    (err: any) =>
      err instanceof BadRequestError &&
      err.code === "FILENAME_VARIANT_MISMATCH" &&
      err.message.includes("palto-oversayz-cholpon-42-164-170-A4.pdf")
  );

  assert.equal(harness.getStats().storageUploadCalls, 0);
  assert.equal(harness.getStats().fileVersionCreateCalls, 0);
});

test("Stage 5.5 (P0-1 & P0-2): uploadPattern succeeds for genuine PDF matching canonical filename", async () => {
  const harness = createTestHarness();
  const validBuffer = createValidTestPdf();
  const expectedName = "palto-oversayz-cholpon-42-164-170-A4.pdf";

  const res = await harness.controller.uploadPattern(
    {
      variantId: harness.cholponVariant42A4.id,
      productId: harness.cholponVariant42A4.productId,
      fileBase64: validBuffer.toString("base64"),
      fileName: expectedName,
      contentType: "application/pdf",
      changelog: "Первоначальная загрузка v1",
    },
    harness.adminReq
  );

  assert.equal(res.success, true);
  assert.equal(res.data.originalFileName, expectedName);
  assert.equal(res.data.versionNumber, 1);
  assert.equal(harness.getStats().storageUploadCalls, 1);
  assert.equal(harness.getStats().fileVersionCreateCalls, 1);
});

test("Stage 5.5 (P0-2): uploadPattern succeeds for bundle variant ALL with correct filename", async () => {
  const harness = createTestHarness();
  const validBuffer = createValidTestPdf();
  const expectedName = "plate-midi-aida-s-zapakhom-ALL-164-170-A4.pdf";

  const res = await harness.controller.uploadPattern(
    {
      variantId: harness.aidaVariantAllA4.id,
      fileBase64: validBuffer.toString("base64"),
      fileName: expectedName,
      contentType: "application/pdf",
    },
    harness.adminReq
  );

  assert.equal(res.success, true);
  assert.equal(res.data.originalFileName, expectedName);
  assert.equal(res.data.versionNumber, 1);
  assert.equal(harness.getStats().storageUploadCalls, 1);
  assert.equal(harness.getStats().fileVersionCreateCalls, 1);
});

test("Stage 5.5: existing versioning mechanism is preserved on repeated upload (v1 -> v2)", async () => {
  const harness = createTestHarness();
  const validBuffer = createValidTestPdf();
  const expectedName = "palto-oversayz-cholpon-42-164-170-A4.pdf";

  // Первая загрузка (v1)
  const res1 = await harness.controller.uploadPattern(
    {
      variantId: harness.cholponVariant42A4.id,
      fileBase64: validBuffer.toString("base64"),
      fileName: expectedName,
      contentType: "application/pdf",
      changelog: "v1: Релиз",
    },
    harness.adminReq
  );
  assert.equal(res1.data.versionNumber, 1);

  // Вторая загрузка (v2 - замена)
  const res2 = await harness.controller.uploadPattern(
    {
      variantId: harness.cholponVariant42A4.id,
      fileBase64: validBuffer.toString("base64"),
      fileName: expectedName,
      contentType: "application/pdf",
      changelog: "v2: Исправлены припуски",
    },
    harness.adminReq
  );
  assert.equal(res2.data.versionNumber, 2);
  assert.equal(harness.getStats().storageUploadCalls, 2);
  assert.equal(harness.getStats().fileVersionCreateCalls, 2);
  assert.equal(harness.cholponVariant42A4.digitalFiles[0].versions.length, 2);
});

// =============================================================================
// STAGE 5.6: ТЕСТЫ МАССОВОЙ ЗАГРУЗКИ PDF-ВЫКРОЕК (BULK PDF UPLOAD)
// =============================================================================

test("Stage 5.6 (Bulk 1): uploadPatternsBulk successfully uploads multiple genuine PDFs matching variants", async () => {
  const harness = createTestHarness();
  const validBuffer = createValidTestPdf();

  const file1Name = "palto-oversayz-cholpon-42-164-170-A4.pdf";
  const file2Name = "palto-oversayz-cholpon-44-164-170-A4.pdf";

  const res = await harness.controller.uploadPatternsBulk(
    {
      productId: harness.cholponProduct.id,
      items: [
        {
          fileName: file1Name,
          fileBase64: validBuffer.toString("base64"),
          contentType: "application/pdf",
        },
        {
          fileName: file2Name,
          fileBase64: validBuffer.toString("base64"),
          contentType: "application/pdf",
        },
      ],
    },
    harness.adminReq
  );

  assert.equal(res.success, true);
  assert.equal(res.data.total, 2);
  assert.equal(res.data.successful, 2);
  assert.equal(res.data.failed, 0);
  assert.equal(res.data.results[0].status, "SUCCESS");
  assert.equal(res.data.results[0].fileName, file1Name);
  assert.equal(res.data.results[1].status, "SUCCESS");
  assert.equal(res.data.results[1].fileName, file2Name);
  assert.equal(harness.getStats().storageUploadCalls, 2);
  assert.equal(harness.getStats().fileVersionCreateCalls, 2);
});

test("Stage 5.6 (Bulk 2): uploadPatternsBulk isolates invalid filename without failing valid files", async () => {
  const harness = createTestHarness();
  const validBuffer = createValidTestPdf();

  const validName = "palto-oversayz-cholpon-42-164-170-A4.pdf";
  const invalidName = "palto-cholpon-44-164-170-A4.pdf"; // Ошибка: неверный слаг!

  const res = await harness.controller.uploadPatternsBulk(
    {
      productId: harness.cholponProduct.id,
      items: [
        {
          fileName: validName,
          fileBase64: validBuffer.toString("base64"),
        },
        {
          fileName: invalidName,
          fileBase64: validBuffer.toString("base64"),
        },
      ],
    },
    harness.adminReq
  );

  assert.equal(res.success, true);
  assert.equal(res.data.total, 2);
  assert.equal(res.data.successful, 1);
  assert.equal(res.data.failed, 1);

  const resValid = res.data.results.find((r: any) => r.fileName === validName);
  const resInvalid = res.data.results.find((r: any) => r.fileName === invalidName);

  assert.equal(resValid?.status, "SUCCESS");
  assert.equal(resInvalid?.status, "REJECTED");
  assert.equal(resInvalid?.errorCode, "WRONG_FILENAME");

  // В хранилище попал только 1 валидный файл
  assert.equal(harness.getStats().storageUploadCalls, 1);
  assert.equal(harness.getStats().fileVersionCreateCalls, 1);
});

test("Stage 5.6 (Bulk 3): uploadPatternsBulk detects duplicate files in batch and rejects duplicates", async () => {
  const harness = createTestHarness();
  const validBuffer = createValidTestPdf();
  const name = "palto-oversayz-cholpon-42-164-170-A4.pdf";

  const res = await harness.controller.uploadPatternsBulk(
    {
      productId: harness.cholponProduct.id,
      items: [
        { fileName: name, fileBase64: validBuffer.toString("base64") },
        { fileName: name, fileBase64: validBuffer.toString("base64") }, // Дубликат!
      ],
    },
    harness.adminReq
  );

  assert.equal(res.data.total, 2);
  assert.equal(res.data.successful, 1);
  assert.equal(res.data.failed, 1);
  assert.equal(res.data.results[0].status, "SUCCESS");
  assert.equal(res.data.results[1].status, "REJECTED");
  assert.equal(res.data.results[1].errorCode, "DUPLICATE");
});

test("Stage 5.6 (Bulk 4): uploadPatternsBulk rejects files with unknown variant/SKU", async () => {
  const harness = createTestHarness();
  const validBuffer = createValidTestPdf();
  const unknownVariantName = "palto-oversayz-cholpon-99-164-170-A4.pdf"; // Размер 99 отсутствует

  const res = await harness.controller.uploadPatternsBulk(
    {
      productId: harness.cholponProduct.id,
      items: [
        { fileName: unknownVariantName, fileBase64: validBuffer.toString("base64") },
      ],
    },
    harness.adminReq
  );

  assert.equal(res.data.total, 1);
  assert.equal(res.data.successful, 0);
  assert.equal(res.data.failed, 1);
  assert.equal(res.data.results[0].status, "REJECTED");
  assert.equal(res.data.results[0].errorCode, "UNKNOWN_VARIANT");
  assert.equal(harness.getStats().storageUploadCalls, 0);
  assert.equal(harness.getStats().fileVersionCreateCalls, 0);
});

test("Stage 5.6 (Bulk 5): uploadPatternsBulk isolates corrupted PDF without failing valid files", async () => {
  const harness = createTestHarness();
  const validBuffer = createValidTestPdf();
  const corruptBuffer = Buffer.from("<!DOCTYPE html><html><body>fake pdf</body></html>");

  const validName = "palto-oversayz-cholpon-42-164-170-A4.pdf";
  const corruptName = "palto-oversayz-cholpon-44-164-170-A4.pdf";

  const res = await harness.controller.uploadPatternsBulk(
    {
      productId: harness.cholponProduct.id,
      items: [
        { fileName: validName, fileBase64: validBuffer.toString("base64") },
        { fileName: corruptName, fileBase64: corruptBuffer.toString("base64") },
      ],
    },
    harness.adminReq
  );

  assert.equal(res.data.successful, 1);
  assert.equal(res.data.failed, 1);
  const corruptResult = res.data.results.find((r: any) => r.fileName === corruptName);
  assert.equal(corruptResult?.status, "REJECTED");
  assert.equal(corruptResult?.errorCode, "INVALID_FILE_TYPE");
  assert.equal(harness.getStats().storageUploadCalls, 1);
});

test("Stage 5.6 (Bulk 6): uploadPatternsBulk rejects overwrite of existing variant without explicit confirmation (ALREADY_EXISTS)", async () => {
  const harness = createTestHarness();
  const validBuffer = createValidTestPdf();
  const name = "palto-oversayz-cholpon-42-164-170-A4.pdf";

  // Сначала загружаем файл v1
  await harness.controller.uploadPattern(
    {
      variantId: harness.cholponVariant42A4.id,
      fileBase64: validBuffer.toString("base64"),
      fileName: name,
    },
    harness.adminReq
  );

  // Пытаемся пакетно загрузить файл для того же варианта без allowOverwrite
  const bulkRes = await harness.controller.uploadPatternsBulk(
    {
      productId: harness.cholponProduct.id,
      items: [
        { fileName: name, fileBase64: validBuffer.toString("base64"), allowOverwrite: false },
      ],
    },
    harness.adminReq
  );

  assert.equal(bulkRes.data.successful, 0);
  assert.equal(bulkRes.data.failed, 1);
  assert.equal(bulkRes.data.results[0].status, "REJECTED");
  assert.equal(bulkRes.data.results[0].errorCode, "ALREADY_EXISTS");
  assert.ok(bulkRes.data.results[0].errorMessage?.includes("Требуется подтверждение замены"));
});

test("Stage 5.6 (Bulk 7): uploadPatternsBulk replaces existing variant when allowOverwrite is true (v1 -> v2)", async () => {
  const harness = createTestHarness();
  const validBuffer = createValidTestPdf();
  const name = "palto-oversayz-cholpon-42-164-170-A4.pdf";

  // Сначала загружаем файл v1
  await harness.controller.uploadPattern(
    {
      variantId: harness.cholponVariant42A4.id,
      fileBase64: validBuffer.toString("base64"),
      fileName: name,
      changelog: "v1: Исходная выкройка",
    },
    harness.adminReq
  );

  // Пакетная замена с allowOverwrite: true
  const bulkRes = await harness.controller.uploadPatternsBulk(
    {
      productId: harness.cholponProduct.id,
      items: [
        {
          fileName: name,
          fileBase64: validBuffer.toString("base64"),
          allowOverwrite: true,
          changelog: "v2: Обновление выкройки",
        },
      ],
    },
    harness.adminReq
  );

  assert.equal(bulkRes.data.successful, 1);
  assert.equal(bulkRes.data.failed, 0);
  assert.equal(bulkRes.data.results[0].status, "SUCCESS");
  assert.equal(bulkRes.data.results[0].versionNumber, 2);
  assert.equal(harness.cholponVariant42A4.digitalFiles[0].versions.length, 2);
});

test("Stage 5.6 (Bulk 8): uploadPatternsBulk isolates S3 storage failure on one file while succeeding on others", async () => {
  const harness = createTestHarness();
  const validBuffer = createValidTestPdf();

  const file1Name = "palto-oversayz-cholpon-42-164-170-A4.pdf";
  const file2Name = "palto-oversayz-cholpon-44-164-170-A4.pdf";

  // Настраиваем сбой Storage только для второго файла (по его ключу SKU)
  harness.setStorageFailCondition((params: any) => params.fileName === file2Name);

  const res = await harness.controller.uploadPatternsBulk(
    {
      productId: harness.cholponProduct.id,
      items: [
        { fileName: file1Name, fileBase64: validBuffer.toString("base64") },
        { fileName: file2Name, fileBase64: validBuffer.toString("base64") },
      ],
    },
    harness.adminReq
  );

  assert.equal(res.data.total, 2);
  assert.equal(res.data.successful, 1);
  assert.equal(res.data.failed, 1);

  const res1 = res.data.results.find((r: any) => r.fileName === file1Name);
  const res2 = res.data.results.find((r: any) => r.fileName === file2Name);

  assert.equal(res1?.status, "SUCCESS");
  assert.equal(res2?.status, "REJECTED");
  assert.equal(res2?.errorCode, "STORAGE_UPLOAD_FAILED");
  assert.equal(harness.getStats().fileVersionCreateCalls, 1);
});

test("Stage 5.6 (Bulk 9): uploadPatternsBulk creates valid FileVersion records with SHA-256, versionNumber, and size", async () => {
  const harness = createTestHarness();
  const validBuffer = createValidTestPdf();
  const name = "palto-oversayz-cholpon-42-164-170-A4.pdf";

  const res = await harness.controller.uploadPatternsBulk(
    {
      productId: harness.cholponProduct.id,
      items: [{ fileName: name, fileBase64: validBuffer.toString("base64") }],
    },
    harness.adminReq
  );

  assert.equal(res.data.successful, 1);
  const item = res.data.results[0];
  assert.equal(item.status, "SUCCESS");
  assert.ok(item.checksumSha256);
  assert.equal(item.versionNumber, 1);
  assert.ok((item.fileSizeBytes ?? 0) > 120);
  assert.ok(item.s3Key?.includes("patterns/"));

  const stats = harness.getStats();
  assert.equal(stats.createdFileVersions.length, 1);
  assert.equal(stats.createdFileVersions[0].originalFileName, name);
  assert.equal(stats.createdFileVersions[0].mimeType, "application/pdf");
});

test("Stage 5.6 (Bulk 10): rejected items in bulk batch create zero FileVersion records and zero Storage writes", async () => {
  const harness = createTestHarness();
  const validBuffer = createValidTestPdf();

  const wrongName = "unknown-slug-42-164-170-A4.pdf";
  const corruptBuffer = Buffer.from("not a pdf");

  const res = await harness.controller.uploadPatternsBulk(
    {
      productId: harness.cholponProduct.id,
      items: [
        { fileName: wrongName, fileBase64: validBuffer.toString("base64") },
        { fileName: "palto-oversayz-cholpon-42-164-170-A4.pdf", fileBase64: corruptBuffer.toString("base64") },
      ],
    },
    harness.adminReq
  );

  assert.equal(res.data.total, 2);
  assert.equal(res.data.successful, 0);
  assert.equal(res.data.failed, 2);
  assert.equal(harness.getStats().storageUploadCalls, 0, "Ни одного файла не должно быть загружено в S3");
  assert.equal(harness.getStats().fileVersionCreateCalls, 0, "Ни одной FileVersion не должно быть создано в БД");
});

test("Stage 5.6 (Bulk 11): uploadPatternsBulk enforces max batch items limit (exceeding 50 files rejected)", async () => {
  const harness = createTestHarness();
  const validBuffer = createValidTestPdf();

  // Создаем партию из 51 файла
  const items = Array.from({ length: 51 }, (_, i) => ({
    fileName: `palto-oversayz-cholpon-${i}-164-170-A4.pdf`,
    fileBase64: validBuffer.toString("base64"),
  }));

  await assert.rejects(
    async () =>
      harness.controller.uploadPatternsBulk(
        { productId: harness.cholponProduct.id, items },
        harness.adminReq
      ),
    (err: any) => err.code === "VALIDATION_ERROR"
  );
  assert.equal(harness.getStats().storageUploadCalls, 0);
});

test("Stage 5.6 (Bulk 12): uploadPatternsBulk enforces max total batch size limit (exceeding 150 MB rejected)", async () => {
  const harness = createTestHarness();
  // Имитируем партию с суммарным размером > 150 МБ через длинную Base64 строку (~160 МБ)
  // 160 МБ в base64 = 160 * 1024 * 1024 * (4/3) ~ 223 млн символов
  // Чтобы не аллоцировать 200 МБ памяти, создадим 10 элементов с фиктивно длинной base64 строкой или проверим калькулятор
  const largeFakeBase64 = "A".repeat(22 * 1024 * 1024); // ~16.5 МБ каждый
  const items = Array.from({ length: 10 }, (_, i) => ({
    fileName: `palto-oversayz-cholpon-${i}-164-170-A4.pdf`,
    fileBase64: largeFakeBase64, // 10 * 16.5 МБ = 165 МБ (> 150 МБ!)
  }));

  await assert.rejects(
    async () =>
      harness.controller.uploadPatternsBulk(
        { productId: harness.cholponProduct.id, items },
        harness.adminReq
      ),
    (err: any) => err instanceof BadRequestError && err.code === "BATCH_SIZE_EXCEEDED"
  );
  assert.equal(harness.getStats().storageUploadCalls, 0);
});

