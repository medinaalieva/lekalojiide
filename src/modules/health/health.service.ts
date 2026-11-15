import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../lib/prisma.service";

export interface HealthResponse {
  status: "ok" | "degraded";
  timestamp: string;
  uptime: number;
  environment: string;
  service: string;
}

export interface ReadinessResponse {
  status: "ready" | "not_ready";
  timestamp: string;
  database: {
    status: "connected" | "disconnected";
    provider: string;
    error?: string;
  };
}

@Injectable()
export class HealthService {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Проверка жизнеспособности HTTP-сервера (Liveness probe)
   */
  checkLiveness(): HealthResponse {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
      service: "lekalo-zhiide-backend",
    };
  }

  /**
   * Проверка готовности к обработке запросов, включая реальное подключение к PostgreSQL (Readiness probe)
   */
  async checkReadiness(): Promise<ReadinessResponse> {
    const timestamp = new Date().toISOString();
    try {
      // Реальная сетевая проверка доступности СУБД с таймаутом в 3 секунды
      await Promise.race([
        this.prismaService.client.$queryRaw`SELECT 1`,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Database connection timeout (3000ms)")), 3000)
        ),
      ]);

      return {
        status: "ready",
        timestamp,
        database: {
          status: "connected",
          provider: "postgresql",
        },
      };
    } catch (err) {
      return {
        status: "not_ready",
        timestamp,
        database: {
          status: "disconnected",
          provider: "postgresql",
          error: err instanceof Error ? err.message : "Database connection failed",
        },
      };
    }
  }
}
