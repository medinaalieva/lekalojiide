import {
  PrismaClient,
  User,
  UserSession,
  Product,
  ProductVariant,
  Order,
  OrderItem,
  Payment,
  PurchaseEntitlement,
  Refund,
  RefundItem,
  Role,
  OrderStatus,
  PaymentStatus,
  EntitlementStatus,
} from "@prisma/client";
import { validateJwtEnvironment } from "./utils/jwt";

// Валидация криптографической конфигурации JWT при инициализации приложения
validateJwtEnvironment();

// Реэкспорт единого экземпляра PrismaClient (Singleton)
export { prisma } from "./lib/prisma";

// Реэкспорт сгенерированных типов без дублирования
export type {
  User,
  UserSession,
  Product,
  ProductVariant,
  Order,
  OrderItem,
  Payment,
  PurchaseEntitlement,
  Refund,
  RefundItem,
};

export {
  Role,
  OrderStatus,
  PaymentStatus,
  EntitlementStatus,
};

// Экспорт модулей аутентификации, сессий и конфигурации
export * from "./modules/auth/auth.dto";
export * from "./modules/auth/auth.service";
export * from "./modules/auth/auth.controller";
export * from "./modules/auth/auth-http.controller";
export * from "./modules/auth/auth.module";
export * from "./common/filters/app-exception.filter";
export * from "./config/http.config";
export * from "./utils/crypto";
export * from "./utils/jwt";
export * from "./utils/cookies";
export * from "./utils/rate-limiter";
export * from "./utils/errors";
