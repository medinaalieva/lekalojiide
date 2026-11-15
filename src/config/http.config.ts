/**
 * Конфигурация HTTP, CORS, Cookie и CSRF-защиты для проекта LEKALO ZHIIDE
 *
 * Примечание: домен lekalo-zhiide.kg является предварительным. В дальнейшем может
 * использоваться .kg, .com или иной утверждённый домен. Финальный перечень Origin
 * конфигурируется через переменную окружения ALLOWED_ORIGINS.
 */

const DEV_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
];

const DEFAULT_ALLOWED_ORIGINS = [
  "https://lekalojiide.vercel.app",
  "https://lekalo-zhiide.kg",
  "https://www.lekalo-zhiide.kg",
  "https://admin.lekalo-zhiide.kg",
  ...DEV_ORIGINS,
];

export function getAllowedOrigins(): string[] {
  const envOrigins = process.env.ALLOWED_ORIGINS;
  const origins = new Set<string>(DEFAULT_ALLOWED_ORIGINS);

  if (envOrigins) {
    envOrigins
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean)
      .forEach((o) => origins.add(o));
  }

  // Поддержка системных доменов Vercel Deployment
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    const prodHost = process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/^https?:\/\//, "");
    origins.add(`https://${prodHost}`);
  }
  if (process.env.VERCEL_URL) {
    const vercelHost = process.env.VERCEL_URL.replace(/^https?:\/\//, "");
    origins.add(`https://${vercelHost}`);
  }

  // В dev-окружении гарантируем сохранение локальных адресов разработки
  if (process.env.NODE_ENV !== "production") {
    for (const devOrigin of DEV_ORIGINS) {
      origins.add(devOrigin);
    }
  }

  return Array.from(origins);
}

/**
 * Проверка допустимости источника запроса (CORS и защита от CSRF)
 */
export function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return true; // Разрешаем серверные вызовы и локальные инструменты (Postman, curl) без Origin

  try {
    const parsedOrigin = new URL(origin).origin;
    const allowed = getAllowedOrigins();
    return allowed.some((allowedOrigin) => {
      try {
        return new URL(allowedOrigin).origin === parsedOrigin;
      } catch {
        return allowedOrigin === parsedOrigin;
      }
    });
  } catch {
    return false;
  }
}

/**
 * Опции CORS для интеграции с HTTP-сервером (Express / Fastify)
 */
export function getCorsOptions() {
  return {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      callback(null, isAllowedOrigin(origin));
    },
    credentials: true, // Критично для передачи HttpOnly cookie
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-CSRF-Token"],
    exposedHeaders: ["Set-Cookie"],
    maxAge: 86400, // Кэширование preflight-запроса на 24 часа
  };
}
