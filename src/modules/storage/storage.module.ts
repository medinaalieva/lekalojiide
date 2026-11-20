import { Module, Provider } from "@nestjs/common";
import { MockStorageService } from "./mock-storage.service";
import { S3StorageService } from "./s3-storage.service";
import { STORAGE_SERVICE, IStorageService } from "./storage.interface";
import { StorageAdminController } from "./storage-admin.controller";
import { PrismaService } from "../../lib/prisma.service";

const storageServiceProvider: Provider = {
  provide: STORAGE_SERVICE,
  useFactory: (mockStorage: MockStorageService, s3Storage: S3StorageService): IStorageService => {
    const rawDriver = process.env.STORAGE_DRIVER?.toLowerCase().trim();
    // Автоопределение S3/Supabase: если настроены эндпоинт или ключи доступа, автоматически используем s3Storage
    const hasS3Config = Boolean(
      process.env.S3_ENDPOINT ||
      process.env.S3_ACCESS_KEY_ID ||
      process.env.AWS_ACCESS_KEY_ID ||
      process.env.SUPABASE_URL
    );
    const driver = rawDriver || (hasS3Config ? "s3" : "mock");
    if (driver === "s3" || driver === "supabase") {
      return s3Storage;
    }
    return mockStorage;
  },
  inject: [MockStorageService, S3StorageService],
};

@Module({
  controllers: [StorageAdminController],
  providers: [
    MockStorageService,
    S3StorageService,
    storageServiceProvider,
    PrismaService,
  ],
  exports: [MockStorageService, S3StorageService, STORAGE_SERVICE],
})
export class StorageModule {}
