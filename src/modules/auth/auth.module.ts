import { Module } from "@nestjs/common";
import { AuthHttpController } from "./auth-http.controller";
import { UsersAdminController } from "./users-admin.controller";
import { StatsAdminController } from "./stats-admin.controller";
import { AuthService } from "./auth.service";
import { PasswordResetService } from "./password-reset.service";
import { ConsoleMailService } from "./mail.service";
import { PrismaService } from "../../lib/prisma.service";

/**
 * NestJS-модуль аутентификации, авторизации и администрирования пользователей.
 * Предоставляет HTTP API для аутентификации, ротации токенов, сессий, управления пользователями, сброса пароля и админ-статистики.
 * Использует единственный экземпляр PrismaClient через PrismaService.
 */
@Module({
  controllers: [AuthHttpController, UsersAdminController, StatsAdminController],
  providers: [
    {
      provide: AuthService,
      useFactory: (prismaService: PrismaService) => {
        return new AuthService(prismaService.client);
      },
      inject: [PrismaService],
    },
    {
      provide: PasswordResetService,
      useFactory: (prismaService: PrismaService, authService: AuthService) => {
        return new PasswordResetService(
          prismaService.client,
          authService,
          new ConsoleMailService()
        );
      },
      inject: [PrismaService, AuthService],
    },
  ],
  exports: [AuthService, PasswordResetService],
})
export class AuthModule {}
