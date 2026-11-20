import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Param,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  Inject,
} from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { Role, PrismaClient, FileType } from "@prisma/client";
import * as crypto from "node:crypto";
import * as path from "node:path";
import { z } from "zod";
import { extractAuthUser, checkRolePermissions } from "../auth/auth.guard";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  UnprocessableEntityError,
} from "../../utils/errors";
import { isAllowedOrigin } from "../../config/http.config";
import { PrismaService } from "../../lib/prisma.service";
import { STORAGE_SERVICE, IStorageService } from "./storage.interface";
import { fetchFileFromSafeUrl } from "../../utils/url-fetcher";
import { validatePdfBuffer } from "../../utils/pdf-validator";

const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_PDF_MIME_TYPES = ["application/pdf"];
const MAX_PDF_SIZE_BYTES = 30 * 1024 * 1024; // 30 MB
const MAX_BATCH_FILES = 50;
const MAX_BATCH_TOTAL_BYTES = 150 * 1024 * 1024; // 150 MB

const BulkUploadItemSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileBase64: z.string().min(1),
  contentType: z.string().optional().default("application/pdf"),
  variantId: z.string().uuid().optional(),
  allowOverwrite: z.boolean().optional().default(false),
  changelog: z.string().max(500).optional().nullable(),
});

const UploadPatternsBulkSchema = z.object({
  productId: z.string().uuid(),
  items: z
    .array(BulkUploadItemSchema)
    .min(1, "Партия должна содержать хотя бы один файл")
    .max(MAX_BATCH_FILES, `Максимум ${MAX_BATCH_FILES} файлов в одной партии`),
});

const UploadImageSchema = z.object({
  productId: z.string().uuid().optional(),
  isCover: z.boolean().optional().default(false),
  altText: z.string().max(255).optional().nullable(),
  displayOrder: z.number().int().optional().default(0),
  // Вариант 1: Загрузка с компьютера (Base64)
  fileBase64: z.string().optional(),
  fileName: z.string().optional(),
  contentType: z.string().optional(),
  // Вариант 2: Загрузка по URL
  url: z.string().url().optional(),
});

const UploadPatternSchema = z.object({
  variantId: z.string().uuid(),
  productId: z.string().uuid().optional(),
  changelog: z.string().max(500).optional().nullable(),
  // Вариант 1: Загрузка с компьютера (Base64)
  fileBase64: z.string().optional(),
  fileName: z.string().optional(),
  contentType: z.string().optional(),
  // Вариант 2: Загрузка по URL
  url: z.string().url().optional(),
});

const UploadInstructionSchema = z.object({
  productId: z.string().uuid("Идентификатор товара должен быть валидным UUID"),
  title: z.string().max(255).optional().default("Инструкция по пошиву"),
  // Вариант 1: Загрузка с компьютера (Base64)
  fileBase64: z.string().optional(),
  fileName: z.string().max(255).optional(),
  contentType: z.string().optional().default("application/pdf"),
  // Вариант 2: Загрузка по URL
  url: z.string().url().optional(),
});

@Controller("admin/storage")
export class StorageAdminController {
  private prisma: PrismaClient;

  constructor(
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
    prismaService: PrismaService
  ) {
    this.prisma = prismaService.client;
  }

  private authenticateAdmin(req: FastifyRequest) {
    const origin = req.headers["origin"] as string | undefined;
    if (origin && !isAllowedOrigin(origin)) {
      throw new ForbiddenError(
        "CSRF_FORBIDDEN",
        `Запрос с источника '${origin}' заблокирован политикой CORS/CSRF`
      );
    }
    const user = extractAuthUser(req.headers.authorization);
    checkRolePermissions(user.role, [Role.ADMIN]);
    return user;
  }

  /**
   * POST /api/v1/admin/storage/upload-image
   * Загрузка фотографии выкройки (с компьютера или по URL) в публичный бакет
   */
  @Post("upload-image")
  @HttpCode(HttpStatus.CREATED)
  async uploadImage(@Body() body: unknown, @Req() req: FastifyRequest) {
    this.authenticateAdmin(req);

    const parseRes = UploadImageSchema.safeParse(body);
    if (!parseRes.success) {
      throw new UnprocessableEntityError(
        "VALIDATION_ERROR",
        "Ошибка параметров загрузки изображения",
        parseRes.error.format()
      );
    }

    const dto = parseRes.data;
    let fileBuffer: Buffer;
    let contentType = "image/jpeg";
    let originalName = "image.jpg";

    if (dto.url) {
      // Загрузка по URL с проверкой SSRF, размера и MIME
      const fetchResult = await fetchFileFromSafeUrl(dto.url, {
        allowedMimeTypes: ALLOWED_IMAGE_MIME_TYPES,
        maxSizeBytes: MAX_IMAGE_SIZE_BYTES,
      });
      fileBuffer = fetchResult.buffer;
      contentType = fetchResult.contentType;
      originalName = fetchResult.fileName;
    } else if (dto.fileBase64) {
      // Загрузка файла с компьютера (Base64)
      const cleanBase64 = dto.fileBase64.replace(/^data:[^;]+;base64,/, "");
      fileBuffer = Buffer.from(cleanBase64, "base64");

      if (fileBuffer.length > MAX_IMAGE_SIZE_BYTES) {
        throw new BadRequestError(
          "FILE_TOO_LARGE",
          `Размер изображения (${Math.round(fileBuffer.length / 1024)} КБ) превышает лимит 10 МБ`
        );
      }

      if (dto.contentType) {
        contentType = dto.contentType.toLowerCase();
        if (!ALLOWED_IMAGE_MIME_TYPES.includes(contentType)) {
          throw new BadRequestError(
            "INVALID_MIME_TYPE",
            `Недопустимый тип файла "${contentType}". Разрешены: ${ALLOWED_IMAGE_MIME_TYPES.join(", ")}`
          );
        }
      }

      originalName = dto.fileName || "photo.jpg";
    } else {
      throw new BadRequestError(
        "PARAM_REQUIRED",
        "Необходимо передать файл (fileBase64) или ссылку (url)"
      );
    }

    // Формируем уникальный ключ S3
    const ext = path.extname(originalName) || (contentType === "image/png" ? ".png" : contentType === "image/webp" ? ".webp" : ".jpg");
    const safeBase = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
    const bucket = process.env.S3_PUBLIC_BUCKET || "product-images";
    const s3Key = `products/${dto.productId || "general"}/${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${safeBase}${ext}`;

    const uploadRes = await this.storageService.uploadFile({
      bucket,
      key: s3Key,
      body: fileBuffer,
      contentType,
      fileName: originalName,
      isPublic: true,
    });

    const publicUrl = uploadRes.publicUrl || this.storageService.getPublicUrl(bucket, s3Key);

    // Если передан productId — привязываем фото к товару в БД
    let createdImage = null;
    if (dto.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: dto.productId },
      });
      if (!product) {
        throw new NotFoundError("PRODUCT_NOT_FOUND", "Указанный товар не найден");
      }

      // Если новое фото назначено обложкой, сбрасываем признак у других фото товара
      if (dto.isCover) {
        await this.prisma.productImage.updateMany({
          where: { productId: dto.productId },
          data: { isCover: false },
        });
      }

      createdImage = await this.prisma.productImage.create({
        data: {
          productId: dto.productId,
          imageUrl: publicUrl,
          altText: dto.altText || product.title,
          isCover: dto.isCover ?? false,
          displayOrder: dto.displayOrder ?? 0,
        },
      });
    }

    return {
      success: true,
      data: {
        publicUrl,
        s3Bucket: bucket,
        s3Key,
        fileSizeBytes: uploadRes.fileSizeBytes,
        contentType,
        image: createdImage,
      },
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * POST /api/v1/admin/storage/upload-pattern
   * Загрузка или замена PDF-выкройки (с компьютера или по URL) в приватный бакет
   */
  @Post("upload-pattern")
  @HttpCode(HttpStatus.CREATED)
  async uploadPattern(@Body() body: unknown, @Req() req: FastifyRequest) {
    this.authenticateAdmin(req);

    const parseRes = UploadPatternSchema.safeParse(body);
    if (!parseRes.success) {
      throw new UnprocessableEntityError(
        "VALIDATION_ERROR",
        "Ошибка параметров загрузки PDF-выкройки",
        parseRes.error.format()
      );
    }

    const dto = parseRes.data;

    // Проверяем существование варианта выкройки
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: dto.variantId },
      include: {
        product: true,
        size: true,
        height: true,
        format: true,
        digitalFiles: {
          where: { isActive: true },
          include: {
            versions: {
              orderBy: { versionNumber: "desc" },
            },
          },
        },
      },
    });

    if (!variant) {
      throw new NotFoundError("VARIANT_NOT_FOUND", "Указанный вариант выкройки не найден");
    }

    let fileBuffer: Buffer;
    let contentType = "application/pdf";
    let originalName = "pattern.pdf";

    if (dto.url) {
      // Загрузка по URL с проверкой SSRF
      const fetchResult = await fetchFileFromSafeUrl(dto.url, {
        allowedMimeTypes: ALLOWED_PDF_MIME_TYPES,
        maxSizeBytes: MAX_PDF_SIZE_BYTES,
      });
      fileBuffer = fetchResult.buffer;
      contentType = fetchResult.contentType;
      originalName = fetchResult.fileName;
    } else if (dto.fileBase64) {
      // Загрузка файла с компьютера (Base64)
      const cleanBase64 = dto.fileBase64.replace(/^data:[^;]+;base64,/, "");
      fileBuffer = Buffer.from(cleanBase64, "base64");

      if (fileBuffer.length > MAX_PDF_SIZE_BYTES) {
        throw new BadRequestError(
          "FILE_TOO_LARGE",
          `Размер PDF (${Math.round(fileBuffer.length / 1024)} КБ) превышает лимит 30 МБ`
        );
      }

      if (dto.contentType && dto.contentType.toLowerCase() !== "application/pdf") {
        throw new BadRequestError(
          "INVALID_MIME_TYPE",
          "Для выкроек разрешены только файлы формата PDF (application/pdf)"
        );
      }

      originalName = dto.fileName || "pattern.pdf";
    } else {
      throw new BadRequestError(
        "PARAM_REQUIRED",
        "Необходимо передать файл (fileBase64) или ссылку (url)"
      );
    }

    // 1. Валидация подлинности и структуры PDF-документа (P0-1)
    validatePdfBuffer(fileBuffer);

    // 2. Проверка соответствия принадлежности варианта указанному товару
    if (dto.productId && variant.productId !== dto.productId) {
      throw new BadRequestError(
        "VARIANT_PRODUCT_MISMATCH",
        `Вариант "${variant.sku}" не принадлежит товару с ID "${dto.productId}"`
      );
    }

    // 3. Валидация соответствия имени файла выбранному SKU (P0-2)
    // Канонический стандарт: {slug}-{size}-{height}-{format}.pdf
    const expectedFileName = `${variant.product.slug}-${variant.size.code}-${variant.height.code}-${variant.format.code}.pdf`;
    const cleanOriginalName = path.basename(originalName).trim();

    if (cleanOriginalName.toLowerCase() !== expectedFileName.toLowerCase()) {
      throw new BadRequestError(
        "FILENAME_VARIANT_MISMATCH",
        `Имя загружаемого файла "${cleanOriginalName}" не соответствует выбранному варианту SKU (${variant.sku}). Ожидалось каноническое имя: "${expectedFileName}"`
      );
    }

    // Формируем приватный ключ S3
    const bucket = process.env.S3_PRIVATE_BUCKET || "pattern-files";
    const safeSku = variant.sku.replace(/[^a-zA-Z0-9_-]/g, "_");
    const s3Key = `patterns/${variant.productId}/${safeSku}/${Date.now()}-${crypto.randomBytes(4).toString("hex")}.pdf`;

    const uploadRes = await this.storageService.uploadFile({
      bucket,
      key: s3Key,
      body: fileBuffer,
      contentType: "application/pdf",
      fileName: expectedFileName,
      isPublic: false,
    });

    // Находим или создаем DigitalFile для этого варианта
    let digitalFile = variant.digitalFiles.find((f) => f.fileType === FileType.PATTERN) || variant.digitalFiles[0];
    let nextVersionNumber = 1;

    if (!digitalFile) {
      digitalFile = await this.prisma.digitalFile.create({
        data: {
          variantId: variant.id,
          fileType: FileType.PATTERN,
          title: `Выкройка ${variant.product.title} (${variant.size.code}/${variant.height.code}/${variant.format.code})`,
          isActive: true,
        },
        include: { versions: true },
      });
    } else if (digitalFile.versions && digitalFile.versions.length > 0) {
      const highestVersion = Math.max(...digitalFile.versions.map((v) => v.versionNumber));
      nextVersionNumber = highestVersion + 1;
    }

    // Создаем запись новой версии файла в FileVersion
    const fileVersion = await this.prisma.fileVersion.create({
      data: {
        digitalFileId: digitalFile.id,
        versionNumber: nextVersionNumber,
        s3Bucket: bucket,
        s3Key,
        originalFileName: originalName,
        fileSizeBytes: BigInt(uploadRes.fileSizeBytes),
        checksumSha256: uploadRes.sha256Hash,
        mimeType: "application/pdf",
        changelog: dto.changelog || (nextVersionNumber === 1 ? "Первоначальная загрузка" : `Обновление версии v${nextVersionNumber}`),
      },
    });

    // Обновляем ссылку на currentVersionId в DigitalFile
    await this.prisma.digitalFile.update({
      where: { id: digitalFile.id },
      data: { currentVersionId: fileVersion.id },
    });

    return {
      success: true,
      data: {
        variantId: variant.id,
        digitalFileId: digitalFile.id,
        versionId: fileVersion.id,
        versionNumber: fileVersion.versionNumber,
        s3Bucket: bucket,
        s3Key,
        originalFileName: originalName,
        fileSizeBytes: Number(fileVersion.fileSizeBytes),
        checksumSha256: fileVersion.checksumSha256,
      },
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * POST /api/v1/admin/storage/upload-patterns-bulk
   * Безопасная массовая загрузка PDF-выкроек (до 50 файлов в партии, макс. 150 МБ)
   */
  @Post("upload-patterns-bulk")
  @HttpCode(HttpStatus.OK)
  async uploadPatternsBulk(@Body() body: unknown, @Req() req: FastifyRequest) {
    this.authenticateAdmin(req);

    const parseRes = UploadPatternsBulkSchema.safeParse(body);
    if (!parseRes.success) {
      throw new UnprocessableEntityError(
        "VALIDATION_ERROR",
        "Ошибка параметров массовой загрузки PDF-выкроек",
        parseRes.error.format()
      );
    }

    const dto = parseRes.data;

    // 1. Проверка суммарного лимита размера партии
    let totalEstimatedBytes = 0;
    for (const item of dto.items) {
      const cleanBase64 = item.fileBase64.replace(/^data:[^;]+;base64,/, "");
      totalEstimatedBytes += Math.floor((cleanBase64.length * 3) / 4);
    }
    if (totalEstimatedBytes > MAX_BATCH_TOTAL_BYTES) {
      throw new BadRequestError(
        "BATCH_SIZE_EXCEEDED",
        `Суммарный размер партии (${Math.round(totalEstimatedBytes / (1024 * 1024))} МБ) превышает лимит ${MAX_BATCH_TOTAL_BYTES / (1024 * 1024)} МБ`
      );
    }

    // 2. Получаем товар и все его варианты со связанными файлами
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      include: {
        variants: {
          include: {
            size: true,
            height: true,
            format: true,
            digitalFiles: {
              where: { isActive: true },
              include: {
                versions: {
                  orderBy: { versionNumber: "desc" },
                },
              },
            },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundError("PRODUCT_NOT_FOUND", "Указанный товар не найден");
    }

    const results: Array<{
      fileName: string;
      variantId?: string;
      sku?: string;
      status: "SUCCESS" | "REJECTED";
      versionNumber?: number;
      s3Key?: string;
      checksumSha256?: string;
      fileSizeBytes?: number;
      errorCode?: string;
      errorMessage?: string;
    }> = [];

    const seenFileNames = new Set<string>();
    const seenVariantIds = new Set<string>();

    for (const item of dto.items) {
      const cleanName = path.basename(item.fileName || "").trim();

      // Проверка дубликата по имени внутри этой же партии
      if (seenFileNames.has(cleanName)) {
        results.push({
          fileName: cleanName,
          status: "REJECTED",
          errorCode: "DUPLICATE",
          errorMessage: `Файл с именем "${cleanName}" уже присутствует в этой партии`,
        });
        continue;
      }
      seenFileNames.add(cleanName);

      // Декодирование содержимого
      const cleanBase64 = item.fileBase64.replace(/^data:[^;]+;base64,/, "");
      const fileBuffer = Buffer.from(cleanBase64, "base64");

      // Проверка максимального размера файла
      if (fileBuffer.length > MAX_PDF_SIZE_BYTES) {
        results.push({
          fileName: cleanName,
          status: "REJECTED",
          errorCode: "FILE_TOO_LARGE",
          errorMessage: `Размер PDF (${Math.round(fileBuffer.length / 1024)} КБ) превышает лимит 30 МБ`,
        });
        continue;
      }

      // 1. Валидация подлинности и структуры PDF (P0-1)
      try {
        validatePdfBuffer(fileBuffer);
      } catch (valErr: any) {
        results.push({
          fileName: cleanName,
          status: "REJECTED",
          errorCode: valErr.code || "INVALID_PDF",
          errorMessage: valErr.message || "Файл не является валидным PDF стандарта ISO 32000-1",
        });
        continue;
      }

      // 2. Сопоставление с вариантом товара
      let matchedVariant = item.variantId
        ? product.variants.find((v) => v.id === item.variantId)
        : null;

      if (!matchedVariant) {
        // Попытка распознать вариант по имени файла
        if (!cleanName.startsWith(product.slug + "-")) {
          results.push({
            fileName: cleanName,
            status: "REJECTED",
            errorCode: "WRONG_FILENAME",
            errorMessage: `Имя файла "${cleanName}" не начинается со слага товара "${product.slug}"`,
          });
          continue;
        }

        // Ищем вариант, чье каноническое имя точно совпадает с именем файла
        matchedVariant = product.variants.find((v) => {
          const expectedName = `${product.slug}-${v.size.code}-${v.height.code}-${v.format.code}.pdf`;
          return expectedName === cleanName;
        });

        if (!matchedVariant) {
          results.push({
            fileName: cleanName,
            status: "REJECTED",
            errorCode: "UNKNOWN_VARIANT",
            errorMessage: `Вариант выкройки для файла "${cleanName}" не найден среди вариантов товара`,
          });
          continue;
        }
      }

      // Проверка: принадлежит ли вариант этому товару
      if (matchedVariant.productId !== product.id) {
        results.push({
          fileName: cleanName,
          variantId: matchedVariant.id,
          sku: matchedVariant.sku,
          status: "REJECTED",
          errorCode: "VARIANT_PRODUCT_MISMATCH",
          errorMessage: `Вариант "${matchedVariant.sku}" не принадлежит текущему товару`,
        });
        continue;
      }

      // Проверка на дубликат варианта в текущей партии
      if (seenVariantIds.has(matchedVariant.id)) {
        results.push({
          fileName: cleanName,
          variantId: matchedVariant.id,
          sku: matchedVariant.sku,
          status: "REJECTED",
          errorCode: "DUPLICATE",
          errorMessage: `В партии уже есть другой файл, привязанный к варианту "${matchedVariant.sku}"`,
        });
        continue;
      }
      seenVariantIds.add(matchedVariant.id);

      // Проверка канонического имени файла (P0-2)
      const expectedFileName = `${product.slug}-${matchedVariant.size.code}-${matchedVariant.height.code}-${matchedVariant.format.code}.pdf`;
      if (cleanName !== expectedFileName) {
        results.push({
          fileName: cleanName,
          variantId: matchedVariant.id,
          sku: matchedVariant.sku,
          status: "REJECTED",
          errorCode: "FILENAME_VARIANT_MISMATCH",
          errorMessage: `Имя файла "${cleanName}" не соответствует варианту SKU (${matchedVariant.sku}). Ожидалось: "${expectedFileName}"`,
        });
        continue;
      }

      // Проверка существующей версии и подтверждения замены (ALREADY_EXISTS)
      let digitalFile =
        matchedVariant.digitalFiles.find((f) => f.fileType === FileType.PATTERN) ||
        matchedVariant.digitalFiles[0];
      const hasExistingVersion = !!(
        digitalFile &&
        digitalFile.versions &&
        digitalFile.versions.length > 0
      );

      if (hasExistingVersion && !item.allowOverwrite) {
        const highestVer = Math.max(...digitalFile.versions.map((v) => v.versionNumber));
        results.push({
          fileName: cleanName,
          variantId: matchedVariant.id,
          sku: matchedVariant.sku,
          status: "REJECTED",
          errorCode: "ALREADY_EXISTS",
          errorMessage: `Вариант "${matchedVariant.sku}" уже содержит загруженный файл выкройки (версия v${highestVer}). Требуется подтверждение замены.`,
        });
        continue;
      }

      // Все валидации пройдены — выполняем сохранение
      try {
        const bucket = process.env.S3_PRIVATE_BUCKET || "pattern-files";
        const safeSku = matchedVariant.sku.replace(/[^a-zA-Z0-9_-]/g, "_");
        const s3Key = `patterns/${matchedVariant.productId}/${safeSku}/${Date.now()}-${crypto.randomBytes(4).toString("hex")}.pdf`;

        const uploadRes = await this.storageService.uploadFile({
          bucket,
          key: s3Key,
          body: fileBuffer,
          contentType: "application/pdf",
          fileName: expectedFileName,
          isPublic: false,
        });

        let nextVersionNumber = 1;
        if (!digitalFile) {
          digitalFile = await this.prisma.digitalFile.create({
            data: {
              variantId: matchedVariant.id,
              fileType: FileType.PATTERN,
              title: `Выкройка ${product.title} (${matchedVariant.size.code}/${matchedVariant.height.code}/${matchedVariant.format.code})`,
              isActive: true,
            },
            include: { versions: true },
          });
        } else if (digitalFile.versions && digitalFile.versions.length > 0) {
          const highestVersion = Math.max(...digitalFile.versions.map((v) => v.versionNumber));
          nextVersionNumber = highestVersion + 1;
        }

        const fileVersion = await this.prisma.fileVersion.create({
          data: {
            digitalFileId: digitalFile.id,
            versionNumber: nextVersionNumber,
            s3Bucket: bucket,
            s3Key,
            originalFileName: expectedFileName,
            fileSizeBytes: BigInt(uploadRes.fileSizeBytes),
            checksumSha256:
              uploadRes.sha256Hash ||
              crypto.createHash("sha256").update(fileBuffer).digest("hex"),
            mimeType: "application/pdf",
            changelog:
              item.changelog ||
              (nextVersionNumber === 1
                ? "Первоначальная пакетная загрузка"
                : `Пакетное обновление версии v${nextVersionNumber}`),
          },
        });

        await this.prisma.digitalFile.update({
          where: { id: digitalFile.id },
          data: { currentVersionId: fileVersion.id },
        });

        results.push({
          fileName: cleanName,
          variantId: matchedVariant.id,
          sku: matchedVariant.sku,
          status: "SUCCESS",
          versionNumber: nextVersionNumber,
          s3Key,
          checksumSha256: fileVersion.checksumSha256,
          fileSizeBytes: Number(fileVersion.fileSizeBytes),
        });
      } catch (storageErr: any) {
        results.push({
          fileName: cleanName,
          variantId: matchedVariant.id,
          sku: matchedVariant.sku,
          status: "REJECTED",
          errorCode: "STORAGE_UPLOAD_FAILED",
          errorMessage: `Сбой при сохранении файла в хранилище S3: ${storageErr.message || "Неизвестная ошибка"}`,
        });
      }
    }

    const successful = results.filter((r) => r.status === "SUCCESS").length;
    const failed = results.filter((r) => r.status === "REJECTED").length;

    return {
      success: true,
      data: {
        total: dto.items.length,
        successful,
        failed,
        results,
      },
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * GET /api/v1/admin/storage/products/:productId
   * Полная сводка по товару, его фотогалерее и цифровым файлам вариантов
   */
  @Get("products/:productId")
  @HttpCode(HttpStatus.OK)
  async getProductStorageDetails(
    @Param("productId") productId: string,
    @Req() req: FastifyRequest
  ) {
    this.authenticateAdmin(req);

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        category: { select: { id: true, title: true, slug: true } },
        images: {
          orderBy: [{ isCover: "desc" }, { displayOrder: "asc" }, { createdAt: "asc" }],
        },
        instructions: {
          orderBy: { version: "desc" },
        },
        variants: {
          include: {
            size: true,
            height: true,
            format: true,
            digitalFiles: {
              where: { isActive: true },
              include: {
                currentVersion: true,
                versions: {
                  orderBy: { versionNumber: "desc" },
                },
              },
            },
          },
          orderBy: [
            { size: { displayOrder: "asc" } },
            { height: { displayOrder: "asc" } },
            { format: { displayOrder: "asc" } },
          ],
        },
      },
    });

    if (!product) {
      throw new NotFoundError("PRODUCT_NOT_FOUND", "Выкройка не найдена");
    }

    const serializedInstructions = product.instructions.map((inst) => ({
      ...inst,
      fileSizeBytes: Number(inst.fileSizeBytes),
    }));

    const serializedVariants = product.variants.map((v) => ({
      ...v,
      priceOverride: v.priceOverride !== null ? Number(v.priceOverride) : null,
      isPriceOverridden: v.priceOverride !== null,
    }));

    return {
      success: true,
      data: {
        ...product,
        variants: serializedVariants,
        instructions: serializedInstructions,
      },
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * GET /api/v1/admin/storage/variants/:variantId/files
   * Получение списка файлов и версий для варианта
   */
  @Get("variants/:variantId/files")
  @HttpCode(HttpStatus.OK)
  async getVariantFiles(@Param("variantId") variantId: string, @Req() req: FastifyRequest) {
    this.authenticateAdmin(req);

    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: {
        product: { select: { id: true, title: true } },
        size: true,
        height: true,
        format: true,
        digitalFiles: {
          include: {
            currentVersion: true,
            versions: {
              orderBy: { versionNumber: "desc" },
            },
          },
        },
      },
    });

    if (!variant) {
      throw new NotFoundError("VARIANT_NOT_FOUND", "Вариант выкройки не найден");
    }

    return {
      success: true,
      data: {
        variantId: variant.id,
        sku: variant.sku,
        product: variant.product,
        size: variant.size.code,
        height: variant.height.code,
        format: variant.format.code,
        digitalFiles: variant.digitalFiles.map((df) => ({
          id: df.id,
          title: df.title,
          fileType: df.fileType,
          isActive: df.isActive,
          currentVersionId: df.currentVersionId,
          versions: df.versions.map((v) => ({
            id: v.id,
            versionNumber: v.versionNumber,
            originalFileName: v.originalFileName,
            fileSizeBytes: Number(v.fileSizeBytes),
            checksumSha256: v.checksumSha256,
            createdAt: v.createdAt,
            changelog: v.changelog,
          })),
        })),
      },
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * GET /api/v1/admin/storage/variants/:variantId/files/:versionId/download-test
   * Тестовая генерация ссылки на скачивание для проверки администратором
   */
  @Get("variants/:variantId/files/:versionId/download-test")
  @HttpCode(HttpStatus.OK)
  async getTestDownloadUrl(
    @Param("variantId") variantId: string,
    @Param("versionId") versionId: string,
    @Req() req: FastifyRequest
  ) {
    this.authenticateAdmin(req);

    const version = await this.prisma.fileVersion.findUnique({
      where: { id: versionId },
      include: {
        digitalFile: {
          include: {
            variant: {
              include: { product: true, size: true, height: true, format: true },
            },
          },
        },
      },
    });

    if (!version || version.digitalFile.variantId !== variantId) {
      throw new NotFoundError("VERSION_NOT_FOUND", "Версия файла не найдена");
    }

    const v = version.digitalFile.variant;
    const safeTitle = v.product.title.replace(/[\s/\\?%*:|"<>]+/g, "_");
    const fileName = `Lekalo_Zhiide_${safeTitle}_${v.size.code}_${v.height.code}_${v.format.code}_v${version.versionNumber}.pdf`;

    const presigned = await this.storageService.generatePresignedGetUrl({
      s3Bucket: version.s3Bucket,
      s3Key: version.s3Key,
      fileName,
      expiresInSeconds: 600,
    });

    return {
      success: true,
      data: presigned,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * DELETE /api/v1/admin/storage/images/:imageId
   * Удаление фотографии выкройки из базы и из S3 хранилища
   */
  @Delete("images/:imageId")
  @HttpCode(HttpStatus.OK)
  async deleteImage(@Param("imageId") imageId: string, @Req() req: FastifyRequest) {
    this.authenticateAdmin(req);

    const image = await this.prisma.productImage.findUnique({
      where: { id: imageId },
    });

    if (!image) {
      throw new NotFoundError("IMAGE_NOT_FOUND", "Изображение не найдено");
    }

    // Если фото лежит в нашем бакете, удаляем его из S3
    const bucket = process.env.S3_PUBLIC_BUCKET || "product-images";
    if (image.imageUrl.includes(bucket) || image.imageUrl.includes("storage/v1/object/public")) {
      try {
        const urlParts = new URL(image.imageUrl);
        const idx = urlParts.pathname.indexOf(bucket);
        if (idx !== -1) {
          const s3Key = urlParts.pathname.slice(idx + bucket.length + 1);
          await this.storageService.deleteFile({ bucket, key: s3Key });
        }
      } catch {
        // Игнорируем ошибки парсинга URL при удалении
      }
    }

    await this.prisma.productImage.delete({
      where: { id: imageId },
    });

    return {
      success: true,
      data: { message: "Изображение успешно удалено" },
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * PATCH /api/v1/admin/storage/images/:imageId/cover
   * Назначение фотографии главной обложкой выкройки
   */
  @Patch("images/:imageId/cover")
  @HttpCode(HttpStatus.OK)
  async setImageAsCover(@Param("imageId") imageId: string, @Req() req: FastifyRequest) {
    this.authenticateAdmin(req);

    const image = await this.prisma.productImage.findUnique({
      where: { id: imageId },
    });

    if (!image) {
      throw new NotFoundError("IMAGE_NOT_FOUND", "Изображение не найдено");
    }

    // Сбрасываем обложку у всех остальных изображений товара
    await this.prisma.productImage.updateMany({
      where: { productId: image.productId },
      data: { isCover: false },
    });

    // Назначаем текущее изображение обложкой
    const updated = await this.prisma.productImage.update({
      where: { id: imageId },
      data: { isCover: true },
    });

    return {
      success: true,
      data: updated,
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * DELETE /api/v1/admin/storage/variants/:variantId/files/:versionId
   * Удаление конкретной версии файла из хранилища и базы
   */
  @Delete("variants/:variantId/files/:versionId")
  @HttpCode(HttpStatus.OK)
  async deleteFileVersion(
    @Param("variantId") variantId: string,
    @Param("versionId") versionId: string,
    @Req() req: FastifyRequest
  ) {
    this.authenticateAdmin(req);

    const version = await this.prisma.fileVersion.findUnique({
      where: { id: versionId },
      include: {
        digitalFile: {
          include: { versions: { orderBy: { versionNumber: "desc" } } },
        },
      },
    });

    if (!version || version.digitalFile.variantId !== variantId) {
      throw new NotFoundError("VERSION_NOT_FOUND", "Версия файла не найдена");
    }

    // Удаляем из S3
    try {
      await this.storageService.deleteFile({
        bucket: version.s3Bucket,
        key: version.s3Key,
      });
    } catch (s3Err) {
      console.warn("Could not delete file from S3:", s3Err);
    }

    const digitalFile = version.digitalFile;

    // 1. Если удаляется текущая активная версия, СНАЧАЛА переназначаем currentVersionId
    // во избежание ошибки внешнего ключа ON DELETE RESTRICT
    if (digitalFile.currentVersionId === versionId) {
      const remaining = digitalFile.versions.filter((v) => v.id !== versionId);
      const newCurrent = remaining[0] || null;
      await this.prisma.digitalFile.update({
        where: { id: digitalFile.id },
        data: {
          currentVersionId: newCurrent ? newCurrent.id : null,
          isActive: remaining.length > 0,
        },
      });
    }

    // 2. Проверяем наличие логов скачиваний перед удалением
    const downloadLogsCount = await this.prisma.downloadLog.count({
      where: { fileVersionId: versionId },
    });

    if (downloadLogsCount === 0) {
      // Безопасно удаляем версию из БД
      await this.prisma.fileVersion.delete({
        where: { id: versionId },
      });
    }

    return {
      success: true,
      data: { message: "Версия файла успешно удалена" },
      meta: { timestamp: new Date().toISOString() },
    };
  }

  // =========================================================================
  // УПРАВЛЕНИЕ ИНСТРУКЦИЯМИ ПО ПОШИВУ (STAGE 5.23)
  // =========================================================================

  /**
   * POST /api/v1/admin/storage/upload-instruction
   * Загрузка или замена PDF-инструкции по пошиву
   */
  @Post("upload-instruction")
  @HttpCode(HttpStatus.CREATED)
  async uploadInstruction(@Body() body: unknown, @Req() req: FastifyRequest) {
    this.authenticateAdmin(req);

    const parseRes = UploadInstructionSchema.safeParse(body);
    if (!parseRes.success) {
      throw new UnprocessableEntityError(
        "VALIDATION_ERROR",
        "Ошибка параметров загрузки инструкции",
        parseRes.error.format()
      );
    }

    const dto = parseRes.data;
    let fileBuffer: Buffer;
    let contentType = "application/pdf";
    let originalName = "instruction.pdf";

    if (dto.url) {
      const fetchResult = await fetchFileFromSafeUrl(dto.url, {
        allowedMimeTypes: ALLOWED_PDF_MIME_TYPES,
        maxSizeBytes: MAX_PDF_SIZE_BYTES,
      });
      fileBuffer = fetchResult.buffer;
      contentType = fetchResult.contentType;
      originalName = fetchResult.fileName;
    } else if (dto.fileBase64) {
      const cleanBase64 = dto.fileBase64.replace(/^data:[^;]+;base64,/, "");
      fileBuffer = Buffer.from(cleanBase64, "base64");

      if (fileBuffer.length > MAX_PDF_SIZE_BYTES) {
        throw new BadRequestError(
          "FILE_TOO_LARGE",
          `Размер файла (${Math.round(fileBuffer.length / 1024 / 1024)} МБ) превышает лимит ${MAX_PDF_SIZE_BYTES / 1024 / 1024} МБ`
        );
      }

      if (dto.contentType) {
        contentType = dto.contentType.toLowerCase();
        if (!ALLOWED_PDF_MIME_TYPES.includes(contentType)) {
          throw new BadRequestError(
            "INVALID_MIME_TYPE",
            `Недопустимый тип файла "${contentType}". Разрешен только PDF`
          );
        }
      }

      originalName = dto.fileName || "instruction.pdf";
    } else {
      throw new BadRequestError(
        "PARAM_REQUIRED",
        "Необходимо передать файл (fileBase64) или ссылку (url)"
      );
    }

    // Проверка структуры и магических байтов PDF (ISO 32000-1)
    validatePdfBuffer(fileBuffer);

    // Проверяем существование товара
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) {
      throw new NotFoundError("PRODUCT_NOT_FOUND", "Указанный товар не найден");
    }

    // SHA-256 хеш
    const sha256 = crypto.createHash("sha256").update(fileBuffer).digest("hex");

    // Номер версии: инкремент относительно существующих инструкций для этого товара
    const existing = await this.prisma.productInstruction.findMany({
      where: { productId: dto.productId },
      orderBy: { version: "desc" },
    });
    const nextVersion = existing.length > 0 ? existing[0].version + 1 : 1;

    // Деактивируем предыдущие активные версии, сохраняя историю
    await this.prisma.productInstruction.updateMany({
      where: { productId: dto.productId, isActive: true },
      data: { isActive: false },
    });

    // Сохраняем файл в приватный S3 бакет
    const ext = path.extname(originalName) || ".pdf";
    const safeBase = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
    const bucket = process.env.S3_PRIVATE_BUCKET || "pattern-files";
    const s3Key = `instructions/${dto.productId}/${Date.now()}-v${nextVersion}-${safeBase}${ext}`;

    await this.storageService.uploadFile({
      bucket,
      key: s3Key,
      body: fileBuffer,
      contentType: "application/pdf",
      fileName: originalName,
      isPublic: false,
    });

    const instruction = await this.prisma.productInstruction.create({
      data: {
        productId: dto.productId,
        title: dto.title || "Инструкция по пошиву",
        s3Bucket: bucket,
        s3Key,
        fileName: originalName,
        fileSizeBytes: BigInt(fileBuffer.length),
        checksumSha256: sha256,
        version: nextVersion,
        isActive: true,
      },
    });

    return {
      success: true,
      data: {
        id: instruction.id,
        productId: instruction.productId,
        title: instruction.title,
        fileName: instruction.fileName,
        fileSizeBytes: Number(instruction.fileSizeBytes),
        checksumSha256: instruction.checksumSha256,
        version: instruction.version,
        isActive: instruction.isActive,
        createdAt: instruction.createdAt.toISOString(),
      },
      message: `Инструкция успешно сохранена (версия v${nextVersion})`,
    };
  }

  /**
   * GET /api/v1/admin/storage/products/:productId/instructions
   * Получение списка всех версий инструкций для товара
   */
  @Get("products/:productId/instructions")
  @HttpCode(HttpStatus.OK)
  async getProductInstructions(
    @Param("productId") productId: string,
    @Req() req: FastifyRequest
  ) {
    this.authenticateAdmin(req);

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundError("PRODUCT_NOT_FOUND", "Указанный товар не найден");
    }

    const instructions = await this.prisma.productInstruction.findMany({
      where: { productId },
      orderBy: { version: "desc" },
    });

    return {
      success: true,
      data: instructions.map((inst) => ({
        id: inst.id,
        productId: inst.productId,
        title: inst.title,
        fileName: inst.fileName,
        fileSizeBytes: Number(inst.fileSizeBytes),
        checksumSha256: inst.checksumSha256,
        version: inst.version,
        isActive: inst.isActive,
        createdAt: inst.createdAt.toISOString(),
        updatedAt: inst.updatedAt.toISOString(),
      })),
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * PATCH /api/v1/admin/storage/instructions/:instructionId/toggle-active
   * Переключение активности инструкции (включение / отключение)
   */
  @Patch("instructions/:instructionId/toggle-active")
  @HttpCode(HttpStatus.OK)
  async toggleInstructionActive(
    @Param("instructionId") instructionId: string,
    @Req() req: FastifyRequest
  ) {
    this.authenticateAdmin(req);

    const instruction = await this.prisma.productInstruction.findUnique({
      where: { id: instructionId },
    });

    if (!instruction) {
      throw new NotFoundError("INSTRUCTION_NOT_FOUND", "Инструкция не найдена");
    }

    const updated = await this.prisma.productInstruction.update({
      where: { id: instructionId },
      data: { isActive: !instruction.isActive },
    });

    return {
      success: true,
      data: {
        id: updated.id,
        productId: updated.productId,
        title: updated.title,
        fileName: updated.fileName,
        fileSizeBytes: Number(updated.fileSizeBytes),
        checksumSha256: updated.checksumSha256,
        version: updated.version,
        isActive: updated.isActive,
        updatedAt: updated.updatedAt.toISOString(),
      },
      message: updated.isActive ? "Инструкция активирована" : "Инструкция деактивирована",
    };
  }

  /**
   * GET /api/v1/admin/storage/instructions/:instructionId/download-test
   * Тестовое скачивание инструкции администратором
   */
  @Get("instructions/:instructionId/download-test")
  @HttpCode(HttpStatus.OK)
  async getInstructionTestDownloadUrl(
    @Param("instructionId") instructionId: string,
    @Req() req: FastifyRequest
  ) {
    this.authenticateAdmin(req);

    const instruction = await this.prisma.productInstruction.findUnique({
      where: { id: instructionId },
      include: { product: true },
    });

    if (!instruction) {
      throw new NotFoundError("INSTRUCTION_NOT_FOUND", "Инструкция не найдена");
    }

    const safeTitle = instruction.product.title.replace(/[\s/\\?%*:|"<>]+/g, "_");
    const fileName = `Lekalo_Zhiide_Instruction_${safeTitle}_v${instruction.version}.pdf`;

    const presigned = await this.storageService.generatePresignedGetUrl({
      s3Bucket: instruction.s3Bucket,
      s3Key: instruction.s3Key,
      fileName,
      expiresInSeconds: 600,
    });

    return {
      success: true,
      data: {
        downloadUrl: presigned.downloadUrl,
        expiresInSeconds: presigned.expiresInSeconds,
        fileName,
      },
      meta: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * DELETE /api/v1/admin/storage/instructions/:instructionId
   * Безопасная деактивация инструкции без удаления файла и истории версий
   */
  @Delete("instructions/:instructionId")
  @HttpCode(HttpStatus.OK)
  async deactivateInstruction(
    @Param("instructionId") instructionId: string,
    @Req() req: FastifyRequest
  ) {
    this.authenticateAdmin(req);

    const instruction = await this.prisma.productInstruction.findUnique({
      where: { id: instructionId },
    });

    if (!instruction) {
      throw new NotFoundError("INSTRUCTION_NOT_FOUND", "Инструкция не найдена");
    }

    const updated = await this.prisma.productInstruction.update({
      where: { id: instructionId },
      data: { isActive: false },
    });

    return {
      success: true,
      data: {
        id: updated.id,
        productId: updated.productId,
        isActive: updated.isActive,
      },
      message: "Инструкция успешно деактивирована (история версий сохранена)",
    };
  }
}
