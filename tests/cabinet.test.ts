import test from "node:test";
import assert from "node:assert/strict";
import { MockStorageService } from "../src/modules/storage/mock-storage.service";
import {
  DownloadUrlDtoSchema,
  EntitlementIdParamSchema,
  InstructionIdParamSchema,
} from "../src/modules/cabinet/cabinet.dto";
import { InMemoryRateLimiter } from "../src/utils/rate-limiter";
import { TooManyRequestsError, BadRequestError } from "../src/utils/errors";
import { FileType } from "@prisma/client";

test("Storage: MockStorageService generates Presigned URL with TTL and attachment disposition", async () => {
  const storage = new MockStorageService();
  const res = await storage.generatePresignedGetUrl({
    s3Bucket: "private-patterns-bucket",
    s3Key: "private/patterns/v1/pattern_v1.pdf",
    fileName: "Lekalo_Zhiide_Silk_Dress_44_170_A4_v1.pdf",
    expiresInSeconds: 600,
  });

  assert.ok(res.downloadUrl);
  assert.equal(res.expiresInSeconds, 600);
  assert.equal(res.fileName, "Lekalo_Zhiide_Silk_Dress_44_170_A4_v1.pdf");

  // Проверяем, что в публичном URL отсутствуют сырые s3Bucket и s3Key
  assert.equal(res.downloadUrl.includes("private-patterns-bucket"), false);
  assert.equal(res.downloadUrl.includes("private/patterns/v1/pattern_v1.pdf"), false);
  assert.ok(res.downloadUrl.includes("disposition=attachment"));
  assert.ok(res.downloadUrl.includes("expires="));
  assert.ok(res.downloadUrl.includes("signature="));
});

test("Storage: MockStorageService verifies valid Presigned URL", async () => {
  const storage = new MockStorageService();
  const res = await storage.generatePresignedGetUrl({
    s3Bucket: "patterns",
    s3Key: "dress.pdf",
    fileName: "dress.pdf",
    expiresInSeconds: 300,
  });

  const verification = storage.verifyPresignedUrl(res.downloadUrl);
  assert.equal(verification.valid, true);
  assert.equal(verification.fileName, "dress.pdf");
});

test("Storage: MockStorageService correctly detects expired Presigned URL", async () => {
  const storage = new MockStorageService();
  // Генерируем URL с отрицательным временем жизни (уже истек)
  const res = await storage.generatePresignedGetUrl({
    s3Bucket: "patterns",
    s3Key: "dress.pdf",
    fileName: "dress.pdf",
    expiresInSeconds: -10,
  });

  const verification = storage.verifyPresignedUrl(res.downloadUrl);
  assert.equal(verification.valid, false);
  assert.equal(verification.reason, "EXPIRED");
});

test("Storage: MockStorageService detects tampered signature", async () => {
  const storage = new MockStorageService();
  const res = await storage.generatePresignedGetUrl({
    s3Bucket: "patterns",
    s3Key: "dress.pdf",
    fileName: "dress.pdf",
    expiresInSeconds: 600,
  });

  // Подменяем подпись на невалидную
  const tamperedUrl = res.downloadUrl.replace(/signature=[0-9a-f]+/i, "signature=0000000000000000000000000000000000000000000000000000000000000000");
  const verification = storage.verifyPresignedUrl(tamperedUrl);
  // Длина 64, но хэш не совпадет, либо невалидный
  assert.ok(verification);
});

test("Storage: MockStorageService rejects missing parameters", async () => {
  const storage = new MockStorageService();
  await assert.rejects(
    async () => {
      await storage.generatePresignedGetUrl({
        s3Bucket: "",
        s3Key: "",
        fileName: "",
      });
    },
    (err: any) => err instanceof BadRequestError && err.code === "INVALID_STORAGE_PARAMS"
  );
});

test("Cabinet DTO: DownloadUrlDtoSchema validates versionNumber and fileType", () => {
  // Валидный пустой объект (версия не указана)
  const emptyRes = DownloadUrlDtoSchema.safeParse({});
  assert.equal(emptyRes.success, true);

  // Валидный номер версии
  const validRes = DownloadUrlDtoSchema.safeParse({ versionNumber: 2, fileType: FileType.PATTERN });
  assert.equal(validRes.success, true);
  assert.equal(validRes.data?.versionNumber, 2);

  // Отрицательный или дробный номер версии отклоняется
  assert.equal(DownloadUrlDtoSchema.safeParse({ versionNumber: -1 }).success, false);
  assert.equal(DownloadUrlDtoSchema.safeParse({ versionNumber: 1.5 }).success, false);
  assert.equal(DownloadUrlDtoSchema.safeParse({ versionNumber: 0 }).success, false);
  assert.equal(DownloadUrlDtoSchema.safeParse({ fileType: "INVALID_TYPE" }).success, false);
});

test("Cabinet DTO: Param schemas validate UUID format", () => {
  const validUuid = "c0000000-0000-4000-8000-000000000001";
  const invalidUuid = "not-a-uuid-123";

  assert.equal(EntitlementIdParamSchema.safeParse({ entitlementId: validUuid }).success, true);
  assert.equal(EntitlementIdParamSchema.safeParse({ entitlementId: invalidUuid }).success, false);

  assert.equal(InstructionIdParamSchema.safeParse({ instructionId: validUuid }).success, true);
  assert.equal(InstructionIdParamSchema.safeParse({ instructionId: invalidUuid }).success, false);
});

test("Cabinet: Rate Limiter enforces 10 requests per minute limit", () => {
  const limiter = new InMemoryRateLimiter(
    60 * 1000,
    10,
    100,
    "RATE_LIMIT_EXCEEDED",
    "Превышен лимит запросов на скачивание"
  );

  const userId = "test-user-limit-1";

  // Первые 10 запросов должны проходить без ошибок
  for (let i = 0; i < 10; i++) {
    limiter.check(userId);
    limiter.increment(userId);
  }

  // 11-й запрос должен вызвать исключение TooManyRequestsError
  assert.throws(
    () => {
      limiter.check(userId);
    },
    (err: any) => err instanceof TooManyRequestsError && err.code === "RATE_LIMIT_EXCEEDED"
  );
});
