import { Controller, Get, Res, HttpStatus } from "@nestjs/common";
import { FastifyReply } from "fastify";
import { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * GET /health — проверка работоспособности HTTP-сервера
   */
  @Get()
  getHealth() {
    return this.healthService.checkLiveness();
  }

  /**
   * GET /health/ready — проверка готовности приложения и подключения к PostgreSQL
   */
  @Get("ready")
  async getReadiness(@Res() reply: FastifyReply) {
    const result = await this.healthService.checkReadiness();
    const statusCode = result.status === "ready" ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    return reply.status(statusCode).send(result);
  }
}
