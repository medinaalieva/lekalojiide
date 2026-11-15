import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * NestJS-сервис для работы с базой данных.
 * Использует единственный singleton-экземпляр PrismaClient из ./prisma.ts.
 * Обеспечивает корректное закрытие соединений при остановке приложения (Graceful Shutdown).
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: PrismaClient = prisma;

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
