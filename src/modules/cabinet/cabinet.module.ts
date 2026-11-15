import { Module } from "@nestjs/common";
import { CabinetController } from "./cabinet.controller";
import { CabinetService } from "./cabinet.service";
import { StorageModule } from "../storage/storage.module";
import { PrismaModule } from "../../lib/prisma.module";

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [CabinetController],
  providers: [CabinetService],
  exports: [CabinetService],
})
export class CabinetModule {}
