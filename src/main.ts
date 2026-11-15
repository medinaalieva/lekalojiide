import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import fastifyCookie from "@fastify/cookie";
import { AppModule } from "./app.module";
import { isAllowedOrigin, getAllowedOrigins } from "./config/http.config";
import { AppExceptionFilter } from "./common/filters/app-exception.filter";

/**
 * Инициализация и запуск HTTP Backend на базе NestJS и Fastify
 */
async function bootstrap(): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({
    logger: process.env.NODE_ENV === "development",
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter);

  // Подключение плагина безопасных cookies Fastify
  await app.register(fastifyCookie as any);

  // Установка единого префикса /api/v1 для бизнес-эндпоинтов согласно API_SPECIFICATION.md
  // Исключаем health-пробы из префикса для удобства внешних оркестраторов
  app.setGlobalPrefix("api/v1", {
    exclude: ["health", "health/ready"],
  });

  // Глобальный фильтр ошибок доменного слоя AppError
  app.useGlobalFilters(new AppExceptionFilter());

  // Настройка CORS с использованием доверенных Origin из http.config.ts
  app.enableCors({
    origin: (origin, callback) => {
      callback(null, isAllowedOrigin(origin));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-CSRF-Token"],
    exposedHeaders: ["Set-Cookie"],
    maxAge: 86400,
  });

  // Корректное завершение приложения при SIGINT / SIGTERM (Graceful Shutdown)
  app.enableShutdownHooks();

  const port = Number(process.env.PORT) || 4000;
  await app.listen(port, "0.0.0.0");
  console.log(`[NestJS] LEKALO ZHIIDE Backend Runtime успешно запущен на порту ${port}`);

  return app;
}

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error("[NestJS] Фатальная ошибка при запуске:", err);
    process.exit(1);
  });
}

export { bootstrap };
