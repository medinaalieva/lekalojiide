import { Module } from "@nestjs/common";
import { PrismaModule } from "../../lib/prisma.module";
import { CatalogController } from "./catalog.controller";
import { CatalogAdminController } from "./catalog-admin.controller";
import { CatalogService } from "./catalog.service";

@Module({
  imports: [PrismaModule],
  controllers: [CatalogController, CatalogAdminController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
