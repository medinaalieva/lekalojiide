import { BadRequestError } from "./errors";

export interface PdfValidationResult {
  isValid: boolean;
  version: string;
  pageCount: number;
  sizeBytes: number;
}

/**
 * Серверный валидатор структуры и сигнатуры PDF-файлов (ISO 32000-1)
 * Проверяет подлинность документа без доверия MIME-типу и расширению от браузера.
 */
export function validatePdfBuffer(buffer: Buffer): PdfValidationResult {
  // 1. Проверка на пустой файл
  if (!buffer || buffer.length === 0) {
    throw new BadRequestError("EMPTY_FILE", "Файл пуст (0 байт). Загрузка отклонена.");
  }

  // 2. Защита от полиглотов и маскировки вредоносных форматов под .pdf
  // Проверяем первые 16 байт на сигнатуры распространенных исполняемых и веб-форматов:
  const first16 = buffer.subarray(0, 16);

  // HTML / XML / SVG (<html, <!DOCTYPE, <?xml, <script, <body)
  const first16Str = first16.toString("ascii").toLowerCase();
  if (
    first16Str.startsWith("<!doctype") ||
    first16Str.startsWith("<html") ||
    first16Str.startsWith("<?xml") ||
    first16Str.startsWith("<script") ||
    first16Str.startsWith("<body") ||
    first16Str.startsWith("<!--")
  ) {
    throw new BadRequestError(
      "INVALID_FILE_TYPE",
      "Обнаружен веб-документ (HTML/XML) под расширением .pdf. Загрузка отклонена по соображениям безопасности."
    );
  }

  // ZIP-архивы (PK\x03\x04, PK\x05\x06, PK\x07\x08)
  if (first16.length >= 2 && first16[0] === 0x50 && first16[1] === 0x4b) {
    throw new BadRequestError(
      "INVALID_FILE_TYPE",
      "Обнаружен ZIP-архив под расширением .pdf. Загрузка архивов под видом лекал запрещена."
    );
  }

  // Исполняемые файлы DOS/PE (MZ) и Linux (ELF)
  if (first16.length >= 2 && first16[0] === 0x4d && first16[1] === 0x5a) {
    throw new BadRequestError(
      "INVALID_FILE_TYPE",
      "Обнаружен исполняемый бинарный файл (MZ/PE). Загрузка исполняемого кода строго запрещена."
    );
  }
  if (
    first16.length >= 4 &&
    first16[0] === 0x7f &&
    first16[1] === 0x45 &&
    first16[2] === 0x4c &&
    first16[3] === 0x46
  ) {
    throw new BadRequestError(
      "INVALID_FILE_TYPE",
      "Обнаружен исполняемый файл Linux (ELF). Загрузка отклонена."
    );
  }

  // Скрипты оболочки (#!)
  if (first16.length >= 2 && first16[0] === 0x23 && first16[1] === 0x21) {
    throw new BadRequestError(
      "INVALID_FILE_TYPE",
      "Обнаружен скрипт командной оболочки под расширением .pdf. Загрузка отклонена."
    );
  }

  // 3. Проверка минимальной структурной длины
  // Полноценный PDF со структурой каталога, страницы, таблицы xref и трейлера не может быть короче 120 байт.
  if (buffer.length < 120) {
    throw new BadRequestError(
      "CORRUPTED_OR_INVALID_PDF",
      "Размер файла недостаточен для структуры PDF-документа. Демо-заглушки и поврежденные файлы отклоняются."
    );
  }

  // 4. Проверка сигнатуры заголовка %PDF- (ISO 32000-1 §7.5.2)
  // Заголовок %PDF-n.m должен присутствовать в первых 1024 байтах файла.
  const headerSearchLimit = Math.min(1024, buffer.length);
  const headerSlice = buffer.subarray(0, headerSearchLimit).toString("latin1");
  const headerMatch = headerSlice.match(/%PDF-([0-9]+\.[0-9]+)/);

  if (!headerMatch) {
    throw new BadRequestError(
      "INVALID_PDF_SIGNATURE",
      "Файл не содержит сигнатуры заголовка PDF (%PDF-). Файл поврежден или не является документом PDF."
    );
  }

  const pdfVersion = headerMatch[1];
  const versionNum = parseFloat(pdfVersion);
  if (isNaN(versionNum) || versionNum < 1.0 || versionNum > 2.5) {
    throw new BadRequestError(
      "UNSUPPORTED_PDF_VERSION",
      `Неподдерживаемая версия PDF: ${pdfVersion}. Ожидается версия от 1.0 до 2.0.`
    );
  }

  // 5. Проверка маркера завершения файла %%EOF (ISO 32000-1 §7.5.5)
  // Маркер %%EOF должен располагаться в пределах последних 1024 байт файла.
  const tailSearchStart = Math.max(0, buffer.length - 1024);
  const tailSlice = buffer.subarray(tailSearchStart).toString("latin1");

  if (!tailSlice.includes("%%EOF")) {
    throw new BadRequestError(
      "CORRUPTED_PDF_STRUCTURE",
      "Файл поврежден или обрезан: отсутствует обязательный маркер завершения документа (%%EOF)."
    );
  }

  // 6. Структурный аудит объектов документа
  // Для проверки на пустые суррогаты и неполноценные файлы сканируем контент как строку latin1 (сохраняет 1-байтовую раскладку)
  const fullContent = buffer.toString("latin1");

  // Наличие косвенных объектов (n m obj ... endobj)
  const hasIndirectObjects = /\d+\s+\d+\s+obj\b/.test(fullContent) && /endobj\b/.test(fullContent);
  if (!hasIndirectObjects) {
    throw new BadRequestError(
      "INVALID_PDF_STRUCTURE",
      "Структурная проверка отклонила файл: в документе отсутствуют косвенные объекты PDF (obj/endobj). Демо-заглушки отклоняются."
    );
  }

  // Наличие каталога документа (/Type /Catalog или ссылка /Root)
  const hasCatalog = /\/Type\s*\/Catalog\b/.test(fullContent) || /\/Root\s+\d+\s+\d+\s+R\b/.test(fullContent);
  if (!hasCatalog) {
    throw new BadRequestError(
      "INVALID_PDF_CATALOG",
      "Структурная проверка отклонила файл: в документе отсутствует каталог (/Catalog или ссылка /Root). Файл не является валидной выкройкой."
    );
  }

  // Наличие дерева страниц (/Type /Pages)
  const hasPageTree = /\/Type\s*\/Pages\b/.test(fullContent);
  if (!hasPageTree) {
    throw new BadRequestError(
      "INVALID_PDF_PAGE_TREE",
      "Структурная проверка отклонила файл: отсутствует дерево страниц (/Type /Pages). Демонстрационные заглушки отклоняются."
    );
  }

  // Проверка наличия хотя бы одной страницы (/Type /Page)
  // Примечание: исключаем совпадения с /Pages, проверяя границу слова после Page
  const pageMatches = fullContent.match(/\/Type\s*\/Page(?!\w)/g);
  let pageCount = pageMatches ? pageMatches.length : 0;

  // Если pageMatches не найдены напрямую, проверяем числовой /Count N в Pages-словаре
  if (pageCount === 0) {
    const countMatch = fullContent.match(/\/Count\s+(\d+)/);
    if (countMatch && parseInt(countMatch[1], 10) > 0) {
      pageCount = parseInt(countMatch[1], 10);
    }
  }

  if (pageCount === 0) {
    throw new BadRequestError(
      "MISSING_PDF_PAGES",
      "Документ не содержит печатных страниц (/Type /Page). Пустые файлы и черновики без разметки страниц отклоняются."
    );
  }

  return {
    isValid: true,
    version: pdfVersion,
    pageCount,
    sizeBytes: buffer.length,
  };
}
