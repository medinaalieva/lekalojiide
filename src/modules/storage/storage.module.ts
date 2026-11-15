import { Module } from "@nestjs/common";
import { MockStorageService } from "./mock-storage.service";
import { STORAGE_SERVICE } from "./storage.interface";

@Module({
  providers: [
    MockStorageService,
    {
      provide: STORAGE_SERVICE,
      useClass: MockStorageService,
    },
  ],
  exports: [MockStorageService, STORAGE_SERVICE],
})
export class StorageModule {}
