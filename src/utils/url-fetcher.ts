import * as dns from "node:dns/promises";
import * as path from "node:path";
import { BadRequestError } from "./errors";

export interface SafeFetchOptions {
  allowedMimeTypes: string[];
  maxSizeBytes: number;
  timeoutMs?: number;
}

export interface SafeFetchResult {
  buffer: Buffer;
  contentType: string;
  sizeBytes: number;
  fileName: string;
}

/**
 * Проверка, является ли IPv4 адрес приватным, локальным или служебным (Anti-SSRF)
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return true;

  const [a, b] = parts;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;
  // 10.0.0.0/8 (Private RFC 1918)
  if (a === 10) return true;
  // 172.16.0.0/12 (Private RFC 1918)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 (Private RFC 1918)
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 (Link-local / Cloud Metadata)
  if (a === 169 && b === 254) return true;
  // 0.0.0.0/8
  if (a === 0) return true;
  // Broadcast / Multicast
  if (a >= 224) return true;

  return false;
}

/**
 * Проверка, является ли IPv6 адрес приватным или локальным
 */
function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::" || lower.startsWith("fe80:") || lower.startsWith("fc00:") || lower.startsWith("fd00:")) {
    return true;
  }
  return false;
}

/**
 * Безопасная валидация URL перед выполнением запроса (защита от SSRF)
 */
export async function validateSafeUrl(rawUrl: string): Promise<URL> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new BadRequestError("INVALID_URL", "Указан некорректный формат URL");
  }

  // Разрешены только протоколы http и https
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new BadRequestError(
      "UNSUPPORTED_PROTOCOL",
      "Разрешены только протоколы HTTP и HTTPS"
    );
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  // Запрещенные локальные имена хостов
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname === "metadata.google.internal" ||
    hostname === "instance-data"
  ) {
    throw new BadRequestError(
      "FORBIDDEN_HOST",
      "Загрузка с локальных и приватных адресов запрещена"
    );
  }

  // Разрешение DNS и проверка IP-адресов хоста
  try {
    const lookupResult = await dns.lookup(hostname, { all: true });
    for (const record of lookupResult) {
      if (record.family === 4 && isPrivateIPv4(record.address)) {
        throw new BadRequestError(
          "FORBIDDEN_IP",
          `Хост разрешается в приватный IP-адрес (${record.address}). Загрузка отклонена.`
        );
      }
      if (record.family === 6 && isPrivateIPv6(record.address)) {
        throw new BadRequestError(
          "FORBIDDEN_IP",
          `Хост разрешается в локальный IPv6-адрес (${record.address}). Загрузка отклонена.`
        );
      }
    }
  } catch (err: any) {
    if (err instanceof BadRequestError) throw err;
    throw new BadRequestError(
      "DNS_RESOLUTION_FAILED",
      `Не удалось разрешить адрес хоста: ${hostname}`
    );
  }

  return parsedUrl;
}

/**
 * Безопасное скачивание файла по URL с контролем типа, размера и редиректов
 */
export async function fetchFileFromSafeUrl(
  rawUrl: string,
  options: SafeFetchOptions
): Promise<SafeFetchResult> {
  let currentUrl = rawUrl;
  let redirectsCount = 0;
  const maxRedirects = 3;

  while (redirectsCount <= maxRedirects) {
    const parsed = await validateSafeUrl(currentUrl);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);

    try {
      const response = await fetch(parsed.toString(), {
        method: "GET",
        signal: controller.signal,
        redirect: "manual", // Ручная обработка редиректов для валидации каждого хоста
        headers: {
          "User-Agent": "LekaloZhiide-StorageBot/1.0",
        },
      });

      clearTimeout(timeoutId);

      // Обработка редиректов
      if ([301, 302, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) {
          throw new BadRequestError("REDIRECT_FAILED", "Редирект без заголовка Location");
        }
        currentUrl = new URL(location, parsed).toString();
        redirectsCount++;
        continue;
      }

      if (!response.ok) {
        throw new BadRequestError(
          "REMOTE_FILE_FETCH_ERROR",
          `Удаленный сервер вернул статус ${response.status} ${response.statusText}`
        );
      }

      // Проверка Content-Type
      const rawContentType = response.headers.get("content-type") || "";
      const contentType = rawContentType.split(";")[0].trim().toLowerCase();

      const isAllowedMime = options.allowedMimeTypes.some(
        (allowed) => allowed.toLowerCase() === contentType
      );

      if (!isAllowedMime) {
        throw new BadRequestError(
          "INVALID_MIME_TYPE",
          `Недопустимый тип файла "${contentType}". Разрешены: ${options.allowedMimeTypes.join(", ")}`
        );
      }

      // Проверка Content-Length
      const contentLengthHeader = response.headers.get("content-length");
      if (contentLengthHeader) {
        const declaredSize = parseInt(contentLengthHeader, 10);
        if (!isNaN(declaredSize) && declaredSize > options.maxSizeBytes) {
          throw new BadRequestError(
            "FILE_TOO_LARGE",
            `Размер файла (${Math.round(declaredSize / 1024)} КБ) превышает лимит (${Math.round(options.maxSizeBytes / 1024)} КБ)`
          );
        }
      }

      // Чтение тела ответа с контролем размера
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length > options.maxSizeBytes) {
        throw new BadRequestError(
          "FILE_TOO_LARGE",
          `Фактический размер файла (${Math.round(buffer.length / 1024)} КБ) превышает лимит (${Math.round(options.maxSizeBytes / 1024)} КБ)`
        );
      }

      // Определение имени файла из URL или заголовка
      let fileName = path.basename(parsed.pathname) || "downloaded-file";
      const disposition = response.headers.get("content-disposition");
      if (disposition && disposition.includes("filename=")) {
        const match = disposition.match(/filename=["']?([^"';]+)["']?/);
        if (match && match[1]) {
          fileName = path.basename(match[1]);
        }
      }

      return {
        buffer,
        contentType,
        sizeBytes: buffer.length,
        fileName,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err instanceof BadRequestError) throw err;
      if (err.name === "AbortError") {
        throw new BadRequestError("FETCH_TIMEOUT", "Превышено время ожидания загрузки файла (таймаут)");
      }
      throw new BadRequestError(
        "FETCH_ERROR",
        `Ошибка при загрузке файла: ${err?.message || "Неизвестная сетевая ошибка"}`
      );
    }
  }

  throw new BadRequestError("TOO_MANY_REDIRECTS", "Слишком много перенаправлений (редиректов)");
}
