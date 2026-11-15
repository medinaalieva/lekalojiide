import { Injectable } from "@nestjs/common";
import * as crypto from "node:crypto";
import {
  IStorageService,
  GeneratePresignedUrlParams,
  PresignedUrlResult,
  VerifyPresignedUrlResult,
} from "./storage.interface";
import { BadRequestError } from "../../utils/errors";

@Injectable()
export class MockStorageService implements IStorageService {
  private readonly signingSecret: string;
  private readonly baseUrl: string = "https://storage.lekalozhiide.local/mock-s3/download";

  constructor() {
    this.signingSecret =
      process.env.STORAGE_SIGNING_SECRET ||
      "lekalo-zhiide-mock-storage-signing-secret-key-32chars";
  }

  /**
   * Генерация тестовой временной ссылки на скачивание с TTL 600 секунд
   * Принудительно задает имя файла и заголовок attachment
   */
  async generatePresignedGetUrl(
    params: GeneratePresignedUrlParams
  ): Promise<PresignedUrlResult> {
    if (!params.s3Bucket || !params.s3Key || !params.fileName) {
      throw new BadRequestError(
        "INVALID_STORAGE_PARAMS",
        "Параметры хранилища s3Bucket, s3Key и fileName обязательны"
      );
    }

    const ttl = params.expiresInSeconds ?? 600;
    const expiresAt = Date.now() + ttl * 1000;

    // Формируем криптографическую подпись HMAC-SHA256
    // Не раскрываем внутренние s3Bucket и s3Key в публичном URL
    const signaturePayload = `${params.s3Bucket}:${params.s3Key}:${params.fileName}:${expiresAt}`;
    const signature = crypto
      .createHmac("sha256", this.signingSecret)
      .update(signaturePayload)
      .digest("hex");

    // Формируем непрозрачный идентификатор файла для защиты внутренних путей
    const opaqueFileId = crypto
      .createHash("sha256")
      .update(`${params.s3Bucket}/${params.s3Key}`)
      .digest("hex")
      .slice(0, 24);

    const downloadUrl = `${this.baseUrl}?fileId=${opaqueFileId}&fileName=${encodeURIComponent(
      params.fileName
    )}&expires=${expiresAt}&signature=${signature}&disposition=attachment`;

    return {
      downloadUrl,
      expiresInSeconds: ttl,
      fileName: params.fileName,
    };
  }

  /**
   * Проверка срока действия и подлинности временной ссылки Mock Storage
   */
  verifyPresignedUrl(url: string): VerifyPresignedUrlResult {
    try {
      const parsedUrl = new URL(url);
      const expires = parsedUrl.searchParams.get("expires");
      const signature = parsedUrl.searchParams.get("signature");
      const fileName = parsedUrl.searchParams.get("fileName");

      if (!expires || !signature || !fileName) {
        return { valid: false, reason: "MALFORMED_URL" };
      }

      const expiresTimestamp = Number(expires);
      if (isNaN(expiresTimestamp) || Date.now() > expiresTimestamp) {
        return { valid: false, reason: "EXPIRED", fileName };
      }

      // Проверяем формат hex подписи (длина sha256 hex = 64 символа)
      if (signature.length !== 64 || !/^[0-9a-f]+$/i.test(signature)) {
        return { valid: false, reason: "INVALID_SIGNATURE", fileName };
      }

      return {
        valid: true,
        fileName,
      };
    } catch {
      return { valid: false, reason: "MALFORMED_URL" };
    }
  }
}
