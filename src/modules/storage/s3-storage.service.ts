import { Injectable, Logger } from "@nestjs/common";
import * as crypto from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  IStorageService,
  GeneratePresignedUrlParams,
  PresignedUrlResult,
  VerifyPresignedUrlResult,
  UploadFileParams,
  UploadFileResult,
  DeleteFileParams,
} from "./storage.interface";
import { BadRequestError, InternalServerError } from "../../utils/errors";

@Injectable()
export class S3StorageService implements IStorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly s3Client: S3Client;
  private readonly endpoint: string;
  private readonly region: string;
  public readonly publicBucket: string;
  public readonly privateBucket: string;

  constructor() {
    this.endpoint =
      process.env.S3_ENDPOINT ||
      "https://susoqzykfmwivajdkvtb.storage.supabase.co/storage/v1/s3";
    this.region = process.env.S3_REGION || "ap-south-1";
    this.publicBucket = process.env.S3_PUBLIC_BUCKET || "product-images";
    this.privateBucket = process.env.S3_PRIVATE_BUCKET || "pattern-files";

    const accessKeyId = process.env.S3_ACCESS_KEY_ID || "";
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || "";

    if (!accessKeyId || !secretAccessKey) {
      this.logger.warn(
        "S3 credentials (S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY) не заданы. S3StorageService инициализирован в ограниченном режиме."
      );
    }

    this.s3Client = new S3Client({
      endpoint: this.endpoint,
      region: this.region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true, // Обязательно для Supabase S3 API
    });
  }

  /**
   * Генерация временной подписанной ссылки (Presigned GET URL) для приватного файла выкройки
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

    const expiresInSeconds = params.expiresInSeconds ?? 600;

    try {
      const safeFileName = encodeURIComponent(params.fileName).replace(/'/g, "%27");
      const command = new GetObjectCommand({
        Bucket: params.s3Bucket,
        Key: params.s3Key,
        ResponseContentDisposition: `attachment; filename="${params.fileName}"; filename*=UTF-8''${safeFileName}`,
      });

      const downloadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: expiresInSeconds,
      });

      return {
        downloadUrl,
        expiresInSeconds,
        fileName: params.fileName,
      };
    } catch (err: any) {
      this.logger.error(`Ошибка генерации Presigned URL для ${params.s3Key}: ${err?.message}`);
      throw new InternalServerError(
        "STORAGE_PRESIGNED_URL_ERROR",
        "Не удалось сгенерировать временную ссылку на скачивание файла"
      );
    }
  }

  /**
   * Верификация срока действия Presigned URL
   */
  verifyPresignedUrl(url: string): VerifyPresignedUrlResult {
    try {
      const parsedUrl = new URL(url);
      const amzDate = parsedUrl.searchParams.get("X-Amz-Date");
      const amzExpires = parsedUrl.searchParams.get("X-Amz-Expires");

      if (!amzDate || !amzExpires) {
        return { valid: false, reason: "MALFORMED_URL" };
      }

      // X-Amz-Date имеет формат YYYYMMDDTHHMMSSZ (UTC)
      const year = parseInt(amzDate.slice(0, 4), 10);
      const month = parseInt(amzDate.slice(4, 6), 10) - 1;
      const day = parseInt(amzDate.slice(6, 8), 10);
      const hour = parseInt(amzDate.slice(9, 11), 10);
      const min = parseInt(amzDate.slice(11, 13), 10);
      const sec = parseInt(amzDate.slice(13, 15), 10);

      const requestTimestamp = Date.UTC(year, month, day, hour, min, sec);
      const expiresSeconds = parseInt(amzExpires, 10);

      if (isNaN(requestTimestamp) || isNaN(expiresSeconds)) {
        return { valid: false, reason: "MALFORMED_URL" };
      }

      const expiresAt = requestTimestamp + expiresSeconds * 1000;
      if (Date.now() > expiresAt) {
        return { valid: false, reason: "EXPIRED" };
      }

      return { valid: true };
    } catch {
      return { valid: false, reason: "MALFORMED_URL" };
    }
  }

  /**
   * Загрузка файла (буфера) в S3-бакет
   */
  async uploadFile(params: UploadFileParams): Promise<UploadFileResult> {
    const fileSizeBytes = params.body.length;
    const sha256Hash = crypto.createHash("sha256").update(params.body).digest("hex");

    try {
      const command = new PutObjectCommand({
        Bucket: params.bucket,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
        ContentDisposition: params.fileName
          ? `inline; filename="${params.fileName}"`
          : undefined,
      });

      await this.s3Client.send(command);

      const publicUrl = params.isPublic
        ? this.getPublicUrl(params.bucket, params.key)
        : undefined;

      return {
        bucket: params.bucket,
        key: params.key,
        publicUrl,
        fileSizeBytes,
        contentType: params.contentType,
        sha256Hash,
      };
    } catch (err: any) {
      this.logger.error(`Ошибка загрузки файла в S3 (${params.bucket}/${params.key}): ${err?.message}`);
      throw new InternalServerError(
        "STORAGE_UPLOAD_ERROR",
        `Ошибка сохранения файла в хранилище: ${err?.message || "Неизвестная ошибка"}`
      );
    }
  }

  /**
   * Удаление файла из S3-бакета
   */
  async deleteFile(params: DeleteFileParams): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: params.bucket,
        Key: params.key,
      });

      await this.s3Client.send(command);
    } catch (err: any) {
      this.logger.error(`Ошибка удаления файла из S3 (${params.bucket}/${params.key}): ${err?.message}`);
      // Не прерываем выполнение, если файл уже был удален
    }
  }

  /**
   * Получение прямого публичного CDN URL файла (для картинок)
   */
  getPublicUrl(bucket: string, key: string): string {
    const endpoint = this.endpoint.replace(/\/+$/, "");
    if (endpoint.includes(".supabase.co")) {
      const base = endpoint.replace(/\/storage\/v1\/s3$/, "").replace(/\/s3$/, "");
      return `${base}/storage/v1/object/public/${bucket}/${key}`;
    }
    return `${endpoint}/${bucket}/${key}`;
  }
}
