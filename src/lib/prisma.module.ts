import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

/**
 * Глобальный модуль базы данных.
 * Предоставляет единственный экземпляр PrismaService для всех модулей NestJS.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
