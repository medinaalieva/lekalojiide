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
  "https://lekalo-zhiide.kg",
  "https://www.lekalo-zhiide.kg",
  "https://admin.lekalo-zhiide.kg",
  ...DEV_ORIGINS,
];

export function getAllowedOrigins(): string[] {
  const envOrigins = process.env.ALLOWED_ORIGINS;
  let origins: string[];

  if (envOrigins) {
    origins = envOrigins
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
  } else {
    origins = [...DEFAULT_ALLOWED_ORIGINS];
  }

  // В dev-окружении гарантируем сохранение локальных адресов разработки
  if (process.env.NODE_ENV !== "production") {
    for (const devOrigin of DEV_ORIGINS) {
      if (!origins.includes(devOrigin)) {
        origins.push(devOrigin);
      }
    }
  }

  return origins;
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
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked for origin: ${origin}`));
      }
    },
    credentials: true, // Критично для передачи HttpOnly cookie
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-CSRF-Token"],
    exposedHeaders: ["Set-Cookie"],
    maxAge: 86400, // Кэширование preflight-запроса на 24 часа
  };
}
