export interface GeneratePresignedUrlParams {
  s3Bucket: string;
  s3Key: string;
  fileName: string;
  expiresInSeconds?: number;
}

export interface PresignedUrlResult {
  downloadUrl: string;
  expiresInSeconds: number;
  fileName: string;
}

export interface VerifyPresignedUrlResult {
  valid: boolean;
  reason?: "EXPIRED" | "INVALID_SIGNATURE" | "MALFORMED_URL";
  fileName?: string;
}

/**
 * Абстрактный контракт для сервиса хранения и защищенной раздачи файлов
 */
export interface IStorageService {
  /**
   * Генерация временной ссылки на скачивание с ограничением по времени (TTL)
   */
  generatePresignedGetUrl(params: GeneratePresignedUrlParams): Promise<PresignedUrlResult>;

  /**
   * Верификация срока действия и подлинности временной ссылки (используется для тестов)
   */
  verifyPresignedUrl(url: string): VerifyPresignedUrlResult;
}

export const STORAGE_SERVICE = "STORAGE_SERVICE";
