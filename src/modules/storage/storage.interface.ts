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

export interface UploadFileParams {
  bucket: string;
  key: string;
  body: Buffer;
  contentType: string;
  fileName?: string;
  isPublic?: boolean;
}

export interface UploadFileResult {
  bucket: string;
  key: string;
  publicUrl?: string;
  fileSizeBytes: number;
  contentType: string;
  sha256Hash: string;
}

export interface DeleteFileParams {
  bucket: string;
  key: string;
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

  /**
   * Загрузка файла в облачное хранилище (буфер)
   */
  uploadFile(params: UploadFileParams): Promise<UploadFileResult>;

  /**
   * Удаление файла из хранилища
   */
  deleteFile(params: DeleteFileParams): Promise<void>;

  /**
   * Получение прямого публичного CDN URL файла (для картинок)
   */
  getPublicUrl(bucket: string, key: string): string;
}

export const STORAGE_SERVICE = "STORAGE_SERVICE";
