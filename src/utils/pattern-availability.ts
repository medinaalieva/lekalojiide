import { BadRequestError } from "./errors";

/**
 * Минимальный размер реального производственного лекала (1 КБ).
 * Файлы меньшего размера (например, 79 байт или 335 байт) являются
 * синтетическими заглушками, тестовыми дамми или демо-файлами и непригодны для пошива.
 */
export const MIN_PRODUCTION_PATTERN_SIZE_BYTES = 1024;

/**
 * Маркеры известных демонстрационных заглушек и фиктивных файлов
 */
const DEMO_KEYWORDS = ["demo", "stub", "dummy", "fake", "заглушка", "демо", "фиктивн", "образец"];

export type PatternUnavailableReason =
  | "NO_DIGITAL_FILE"
  | "FILE_INACTIVE"
  | "NO_CURRENT_VERSION"
  | "INVALID_MIME_TYPE"
  | "INVALID_STORAGE_KEY"
  | "DEMO_OR_TEST_STUB";

export interface PatternAvailabilityResult {
  isAvailable: boolean;
  reason?: PatternUnavailableReason;
  message?: string;
  versionNumber?: number;
  fileSizeBytes?: number;
}

/**
 * Проверяет, является ли файл демонстрационной заглушкой или тестовым стабом
 */
export function isDemoOrStubFile(fileVersion: {
  fileSizeBytes?: bigint | number | null;
  originalFileName?: string | null;
  s3Key?: string | null;
  changelog?: string | null;
}): boolean {
  const size = Number(fileVersion.fileSizeBytes ?? 0);

  // 1. Проверка по минимальному размеру реальной выкройки
  if (size < MIN_PRODUCTION_PATTERN_SIZE_BYTES) {
    return true;
  }

  // 2. Проверка по ключевым словам в имени файла
  const fileName = (fileVersion.originalFileName || "").toLowerCase();
  if (DEMO_KEYWORDS.some((kw) => fileName.includes(kw))) {
    return true;
  }

  // 3. Проверка по S3-ключу
  const s3Key = (fileVersion.s3Key || "").toLowerCase();
  if (DEMO_KEYWORDS.some((kw) => s3Key.includes(kw))) {
    return true;
  }

  // 4. Проверка по журналу изменений (changelog)
  const changelog = (fileVersion.changelog || "").toLowerCase();
  if (DEMO_KEYWORDS.some((kw) => changelog.includes(kw))) {
    return true;
  }

  return false;
}

/**
 * Внутренняя проверка наличия файла у конкретного варианта (DigitalFile + FileVersion)
 */
export function checkSingleVariantFile(variant: {
  sku?: string;
  isActive?: boolean;
  digitalFiles?: Array<{
    id?: string;
    isActive?: boolean;
    fileType?: string;
    currentVersionId?: string | null;
    currentVersion?: {
      id?: string;
      versionNumber?: number;
      fileSizeBytes?: bigint | number;
      originalFileName?: string | null;
      mimeType?: string | null;
      s3Key?: string | null;
      changelog?: string | null;
    } | null;
    versions?: Array<{
      id?: string;
      versionNumber?: number;
      fileSizeBytes?: bigint | number;
      originalFileName?: string | null;
      mimeType?: string | null;
      s3Key?: string | null;
      changelog?: string | null;
    }>;
  }>;
}): PatternAvailabilityResult {
  // 3. Проверка наличия цифровых файлов (DigitalFile)
  const digitalFiles = variant.digitalFiles || [];
  const activePatternFile = digitalFiles.find(
    (df) => df.isActive !== false && (!df.fileType || df.fileType === "PATTERN")
  );

  if (!activePatternFile) {
    return {
      isAvailable: false,
      reason: "NO_DIGITAL_FILE",
      message: "Выкройка пока готовится конструктором",
    };
  }

  // 4. Определение актуальной версии лекала
  let currentVersion = activePatternFile.currentVersion;
  if (!currentVersion && activePatternFile.currentVersionId && activePatternFile.versions) {
    currentVersion = activePatternFile.versions.find(
      (v) => v.id === activePatternFile.currentVersionId
    ) || null;
  }

  // Если currentVersion явно не привязана, берем версию с максимальным versionNumber
  if (!currentVersion && activePatternFile.versions && activePatternFile.versions.length > 0) {
    const sorted = [...activePatternFile.versions].sort(
      (a, b) => (b.versionNumber || 0) - (a.versionNumber || 0)
    );
    currentVersion = sorted[0];
  }

  if (!currentVersion) {
    return {
      isAvailable: false,
      reason: "NO_CURRENT_VERSION",
      message: "Файл выкройки готовится к публикации (актуальная версия не назначена)",
    };
  }

  // 5. Проверка MIME-типа и хранилища
  if (currentVersion.mimeType && currentVersion.mimeType !== "application/pdf") {
    return {
      isAvailable: false,
      reason: "INVALID_MIME_TYPE",
      message: "Формат файла не соответствует стандарту PDF-лекал",
    };
  }

  if (!currentVersion.s3Key || currentVersion.s3Key.trim().length === 0) {
    return {
      isAvailable: false,
      reason: "INVALID_STORAGE_KEY",
      message: "Файл лекала не найден в защищенном хранилище",
    };
  }

  // 6. Проверка на демо-заглушки и синтетические стабы
  if (isDemoOrStubFile(currentVersion)) {
    return {
      isAvailable: false,
      reason: "DEMO_OR_TEST_STUB",
      message: "Выкройка пока готовится конструктором (доступна только тестовая заглушка)",
      versionNumber: currentVersion.versionNumber,
      fileSizeBytes: Number(currentVersion.fileSizeBytes),
    };
  }

  // Файл прошел все проверки и является действующим производственным лекалом
  return {
    isAvailable: true,
    versionNumber: currentVersion.versionNumber,
    fileSizeBytes: Number(currentVersion.fileSizeBytes),
  };
}

/**
 * Проверяет наличие действующего производственного PDF-лекала для варианта товара
 * или всех входящих размеров, если это комплект ALL (bundle).
 */
export function checkPatternAvailability(
  variant: {
    sku?: string;
    isActive?: boolean;
    size?: { code?: string } | null;
    product?: { title?: string; isActive?: boolean };
    digitalFiles?: Array<{
      id?: string;
      isActive?: boolean;
      fileType?: string;
      currentVersionId?: string | null;
      currentVersion?: {
        id?: string;
        versionNumber?: number;
        fileSizeBytes?: bigint | number;
        originalFileName?: string | null;
        mimeType?: string | null;
        s3Key?: string | null;
        changelog?: string | null;
      } | null;
      versions?: Array<{
        id?: string;
        versionNumber?: number;
        fileSizeBytes?: bigint | number;
        originalFileName?: string | null;
        mimeType?: string | null;
        s3Key?: string | null;
        changelog?: string | null;
      }>;
    }>;
  },
  childVariants?: Array<{
    sku?: string;
    isActive?: boolean;
    size?: { code?: string } | null;
    digitalFiles?: Array<{
      id?: string;
      isActive?: boolean;
      fileType?: string;
      currentVersionId?: string | null;
      currentVersion?: {
        id?: string;
        versionNumber?: number;
        fileSizeBytes?: bigint | number;
        originalFileName?: string | null;
        mimeType?: string | null;
        s3Key?: string | null;
        changelog?: string | null;
      } | null;
      versions?: Array<{
        id?: string;
        versionNumber?: number;
        fileSizeBytes?: bigint | number;
        originalFileName?: string | null;
        mimeType?: string | null;
        s3Key?: string | null;
        changelog?: string | null;
      }>;
    }>;
  }>
): PatternAvailabilityResult {
  // 1. Проверка активности самого варианта
  if (variant.isActive === false) {
    return {
      isAvailable: false,
      reason: "FILE_INACTIVE",
      message: "Данный вариант выкройки временно недоступен",
    };
  }

  // 2. Проверка активности товара
  if (variant.product && variant.product.isActive === false) {
    return {
      isAvailable: false,
      reason: "FILE_INACTIVE",
      message: "Выкройка снята с публикации",
    };
  }

  const isBundle = variant.size?.code === "ALL" || variant.sku?.includes("-ALL-");

  // Сначала проверяем: возможно, для самого варианта загружен отдельный производственный PDF
  const directResult = checkSingleVariantFile(variant);
  if (directResult.isAvailable) {
    return directResult;
  }

  // Если это не комплект ALL — возвращаем результат прямой проверки
  if (!isBundle) {
    return directResult;
  }

  // Если это комплект ALL и childVariants не переданы — опираемся на directResult
  if (!childVariants) {
    return directResult;
  }

  // Для комплекта ALL: если дочерних вариантов нет вообще — комплект недоступен
  if (childVariants.length === 0) {
    return {
      isAvailable: false,
      reason: "NO_DIGITAL_FILE",
      message: "Комплект выкроек пока готовится конструктором",
    };
  }

  // Проверяем каждый активный отдельный размер, входящий в комплект
  for (const child of childVariants) {
    if (child.isActive === false) {
      continue;
    }
    const childRes = checkSingleVariantFile(child);
    if (!childRes.isAvailable) {
      return {
        isAvailable: false,
        reason: childRes.reason,
        message: childRes.message || `Размер ${child.sku || ""} пока готовится конструктором`,
        versionNumber: childRes.versionNumber,
        fileSizeBytes: childRes.fileSizeBytes,
      };
    }
  }

  return {
    isAvailable: true,
  };
}

/**
 * Выбрасывает BadRequestError("PATTERN_FILE_NOT_READY"), если вариант не имеет действующего PDF
 */
export function assertPatternAvailable(
  variant: any,
  contextMessage?: string,
  childVariants?: any[]
): void {
  const result = checkPatternAvailability(variant, childVariants);
  if (!result.isAvailable) {
    const sku = variant?.sku || "";
    const title = variant?.product?.title ? ` «${variant.product.title}»` : "";
    const detail = contextMessage ? ` (${contextMessage})` : "";
    throw new BadRequestError(
      "PATTERN_FILE_NOT_READY",
      result.message ||
        `Выкройка${title} [${sku}] пока готовится конструктором и недоступна для заказа${detail}`
    );
  }
}
