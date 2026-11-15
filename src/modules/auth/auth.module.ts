import { Module } from "@nestjs/common";
import { AuthHttpController } from "./auth-http.controller";
import { AuthService } from "./auth.service";
import { PrismaService } from "../../lib/prisma.service";

/**
 * NestJS-модуль аутентификации и авторизации.
 * Предоставляет HTTP API для регистрации, входа, ротации токенов и управления сессиями.
 * Использует единственный экземпляр PrismaClient через PrismaService.
 */
@Module({
  controllers: [AuthHttpController],
  providers: [
    {
      provide: AuthService,
      useFactory: (prismaService: PrismaService) => {
        return new AuthService(prismaService.client);
      },
      inject: [PrismaService],
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
