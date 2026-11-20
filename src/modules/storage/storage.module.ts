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
    if (rawDriver === "mock") {
      return mockStorage;
    }
    // По умолчанию используем облачное хранилище S3/Supabase
    return s3Storage;
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
