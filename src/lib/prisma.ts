import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

/**
 * Единственный экземпляр PrismaClient (Singleton).
 * Предотвращает исчерпание пула соединений к PostgreSQL в dev-режиме
 * и полностью исключает циклические зависимости между index.ts и сервисными модулями.
 */
export const prisma =
  globalThis.__prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
