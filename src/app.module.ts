import { Module } from "@nestjs/common";
import { PrismaModule } from "./lib/prisma.module";
import { HealthModule } from "./modules/health/health.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { CartModule } from "./modules/cart/cart.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { StorageModule } from "./modules/storage/storage.module";
import { CabinetModule } from "./modules/cabinet/cabinet.module";

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    AuthModule,
    CatalogModule,
    CartModule,
    OrdersModule,
    PaymentsModule,
    StorageModule,
    CabinetModule,
  ],
})
export class AppModule {}
