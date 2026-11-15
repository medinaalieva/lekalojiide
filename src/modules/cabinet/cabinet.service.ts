import { Injectable, Inject, Optional } from "@nestjs/common";
import { PrismaClient, EntitlementStatus, FileType, Role } from "@prisma/client";
import { PrismaService } from "../../lib/prisma.service";
import { prisma as defaultPrisma } from "../../lib/prisma";
import { AccessTokenPayload } from "../../utils/jwt";
import { IStorageService, STORAGE_SERVICE } from "../storage/storage.interface";
import { InMemoryRateLimiter } from "../../utils/rate-limiter";
import { DownloadUrlDto, LibraryItemResponse } from "./cabinet.dto";
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} from "../../utils/errors";

@Injectable()
export class CabinetService {
  private readonly prisma: PrismaClient;
  private readonly downloadRateLimiter: InMemoryRateLimiter;

  constructor(
    @Inject(STORAGE_SERVICE)
    private readonly storageService: IStorageService,
    @Optional() prismaService?: PrismaService,
    @Optional() customPrisma?: PrismaClient
  ) {
    if (customPrisma) {
      this.prisma = customPrisma;
    } else if (prismaService?.client) {
      this.prisma = prismaService.client;
    } else {
      this.prisma = defaultPrisma;
    }

    // Лимит: не более 10 запросов ссылок в минуту на пользователя
    this.downloadRateLimiter = new InMemoryRateLimiter(
      60 * 1000,
      10,
      10_000,
      "RATE_LIMIT_EXCEEDED",
      "Превышен лимит запросов на скачивание (максимум 10 в минуту)"
    );
  }

  /**
   * Получение личной библиотеки купленных выкроек текущего покупателя
   */
  async getLibrary(user: AccessTokenPayload): Promise<LibraryItemResponse[]> {
    const entitlements = await this.prisma.purchaseEntitlement.findMany({
      where: { userId: user.sub },
      include: {
        variant: {
          include: {
            product: {
              include: {
                images: {
                  orderBy: { displayOrder: "asc" },
                },
                instructions: {
                  where: { isActive: true },
                  orderBy: { version: "desc" },
                },
              },
            },
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
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return entitlements.map((ent) => {
      const product = ent.variant.product;
      const coverImage = product.images.find((img) => img.isCover) || product.images[0];
      const activeInstruction = product.instructions[0];

      // Основной файл выкройки
      const patternFile =
        ent.variant.digitalFiles.find((f) => f.fileType === FileType.PATTERN) ||
        ent.variant.digitalFiles[0];

      const currentVersion = patternFile?.currentVersion || patternFile?.versions[0];

      return {
        entitlementId: ent.id,
        variantId: ent.variantId,
        status: ent.status,
        productTitle: product.title,
        size: ent.variant.size.code,
        height: ent.variant.height.code,
        format: ent.variant.format.code,
        coverUrl: coverImage?.imageUrl || null,
        instructionId: activeInstruction?.id || null,
        currentVersion: currentVersion?.versionNumber || null,
        changelog: currentVersion?.changelog || null,
        downloadCount: ent.downloadCount,
      };
    });
  }

  /**
   * Получение временной подписанной ссылки на скачивание выкройки с фиксацией в DownloadLog
   */
  async getDownloadUrl(
    user: AccessTokenPayload,
    entitlementId: string,
    dto?: DownloadUrlDto,
    clientMeta?: { ip?: string; userAgent?: string }
  ) {
    // 1. Проверка Rate Limit (10 запросов / мин на пользователя)
    this.downloadRateLimiter.check(user.sub);

    // 2. Поиск цифрового права
    const entitlement = await this.prisma.purchaseEntitlement.findUnique({
      where: { id: entitlementId },
      include: {
        variant: {
          include: {
            product: true,
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
        },
      },
    });

    if (!entitlement) {
      throw new NotFoundError("ENTITLEMENT_NOT_FOUND", "Право на скачивание не найдено");
    }

    // 3. Проверка владения правом (RBAC / Ownership)
    const isStaff = user.role === Role.ADMIN || user.role === Role.CONTENT_MANAGER;
    if (entitlement.userId !== user.sub && !isStaff) {
      throw new ForbiddenError("FORBIDDEN", "Доступ к чужой выкройке запрещен");
    }

    // 4. Проверка статуса права
    if (entitlement.status === EntitlementStatus.REVOKED) {
      throw new ForbiddenError(
        "ENTITLEMENT_REVOKED",
        "Право на скачивание отозвано (оформлен возврат средств)"
      );
    }

    if (entitlement.status === EntitlementStatus.EXPIRED) {
      throw new ForbiddenError(
        "ENTITLEMENT_EXPIRED",
        "Срок действия права на скачивание истек"
      );
    }

    // 5. Проверка временного лимита expiresAt
    if (entitlement.expiresAt && entitlement.expiresAt.getTime() < Date.now()) {
      throw new ForbiddenError(
        "ENTITLEMENT_EXPIRED",
        "Срок действия права на скачивание истек"
      );
    }

    // 6. Проверка лимита количества скачиваний
    if (
      entitlement.maxDownloads !== null &&
      entitlement.maxDownloads !== undefined &&
      entitlement.downloadCount >= entitlement.maxDownloads
    ) {
      throw new ForbiddenError(
        "DOWNLOAD_LIMIT_EXCEEDED",
        "Превышен максимальный лимит скачиваний для данной выкройки"
      );
    }

    // 7. Поиск активного файла выкройки
    const targetFileType = dto?.fileType || FileType.PATTERN;
    const digitalFile =
      entitlement.variant.digitalFiles.find((f) => f.fileType === targetFileType) ||
      entitlement.variant.digitalFiles[0];

    if (!digitalFile || !digitalFile.isActive) {
      throw new NotFoundError(
        "FILE_NOT_FOUND",
        "Файл выкройки для данного варианта не найден или не активен"
      );
    }

    // 8. Определение запрашиваемой версии (актуальная или архивная)
    let targetVersion = null;
    if (dto?.versionNumber) {
      targetVersion = digitalFile.versions.find(
        (v) => v.versionNumber === dto.versionNumber
      );
      if (!targetVersion) {
        throw new NotFoundError(
          "VERSION_NOT_FOUND",
          `Запрошенная версия v${dto.versionNumber} не найдена для данной выкройки`
        );
      }
    } else {
      targetVersion =
        digitalFile.currentVersion ||
        digitalFile.versions[0] ||
        null;

      if (!targetVersion) {
        throw new NotFoundError(
          "FILE_VERSION_NOT_FOUND",
          "Файл выкройки не имеет опубликованных версий"
        );
      }
    }

    // 9. Формирование понятного и безопасного имени файла
    const safeTitle = entitlement.variant.product.title.replace(/[\s/\\?%*:|"<>]+/g, "_");
    const safeSize = entitlement.variant.size.code;
    const safeHeight = entitlement.variant.height.code;
    const safeFormat = entitlement.variant.format.code;
    const fileName = `Lekalo_Zhiide_${safeTitle}_${safeSize}_${safeHeight}_${safeFormat}_v${targetVersion.versionNumber}.pdf`;

    // 10. Генерация Presigned URL в StorageService ДО транзакции БД
    // (если StorageService выбросит ошибку, счетчики и логи не создадутся)
    const presigned = await this.storageService.generatePresignedGetUrl({
      s3Bucket: targetVersion.s3Bucket,
      s3Key: targetVersion.s3Key,
      fileName,
      expiresInSeconds: 600,
    });

    // 11. Инкремент rate limiter после успешной проверки
    this.downloadRateLimiter.increment(user.sub);

    // 12. Атомарное логирование в DownloadLog и инкремент счетчика downloadCount
    await this.prisma.$transaction([
      this.prisma.downloadLog.create({
        data: {
          entitlementId: entitlement.id,
          userId: user.sub,
          fileVersionId: targetVersion.id,
          ipAddress: clientMeta?.ip || null,
          userAgent: clientMeta?.userAgent || null,
        },
      }),
      this.prisma.purchaseEntitlement.update({
        where: { id: entitlement.id },
        data: {
          downloadCount: { increment: 1 },
        },
      }),
    ]);

    return {
      downloadUrl: presigned.downloadUrl,
      expiresInSeconds: presigned.expiresInSeconds,
      fileName,
    };
  }

  /**
   * Получение временной ссылки на скачивание общей инструкции по пошиву модели
   */
  async getInstructionDownloadUrl(
    user: AccessTokenPayload,
    instructionId: string
  ) {
    // 1. Поиск инструкции
    const instruction = await this.prisma.productInstruction.findUnique({
      where: { id: instructionId },
      include: { product: true },
    });

    if (!instruction || !instruction.isActive) {
      throw new NotFoundError("INSTRUCTION_NOT_FOUND", "Инструкция по пошиву не найдена");
    }

    // 2. Проверка: есть ли у пользователя активная покупка любого варианта данной модели
    const hasEntitlement = await this.prisma.purchaseEntitlement.findFirst({
      where: {
        userId: user.sub,
        status: EntitlementStatus.ACTIVE,
        variant: {
          productId: instruction.productId,
        },
      },
    });

    const isStaff = user.role === Role.ADMIN || user.role === Role.CONTENT_MANAGER;
    if (!hasEntitlement && !isStaff) {
      throw new ForbiddenError(
        "FORBIDDEN",
        "Доступ к инструкции разрешен только после покупки выкройки данной модели"
      );
    }

    // 3. Формирование имени файла
    const safeTitle = instruction.product.title.replace(/[\s/\\?%*:|"<>]+/g, "_");
    const fileName = `Lekalo_Zhiide_Instruction_${safeTitle}_v${instruction.version}.pdf`;

    // 4. Генерация Presigned URL
    const presigned = await this.storageService.generatePresignedGetUrl({
      s3Bucket: instruction.s3Bucket,
      s3Key: instruction.s3Key,
      fileName,
      expiresInSeconds: 600,
    });

    return {
      downloadUrl: presigned.downloadUrl,
      expiresInSeconds: presigned.expiresInSeconds,
      fileName,
    };
  }
}
