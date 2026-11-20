import { Module, Provider } from "@nestjs/common";
import { MockStorageService } from "./mock-storage.service";
import { S3StorageService } from "./s3-storage.service";
import { STORAGE_SERVICE, IStorageService } from "./storage.interface";
import { StorageAdminController } from "./storage-admin.controller";
import { PrismaService } from "../../lib/prisma.service";

const storageServiceProvider: Provider = {
  provide: STORAGE_SERVICE,
  useFactory: (mockStorage: MockStorageService, s3Storage: S3StorageService): IStorageService => {
    const driver = (process.env.STORAGE_DRIVER || "mock").toLowerCase().trim();
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
