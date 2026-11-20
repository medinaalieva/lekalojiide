# LEKALO ZHIIDE — ПЛАН РАЗВЁРТЫВАНИЯ В PRODUCTION
## STAGE 6.0: PRODUCTION PRE-DEPLOY AUDIT & DEPLOYMENT PROTOCOL

> [!CAUTION]
> **СТАТУС ЭТАПА: ИСКЛЮЧИТЕЛЬНО АУДИТ (READ-ONLY).**  
> Настоящий документ фиксирует результаты всестороннего аудита инфраструктуры, кодовой базы и конфигурации проекта LEKALO ZHIIDE перед коммерческим запуском. Никаких изменений в Production, миграций и боевых вызовов на данном этапе не производится. Существующая рабочая среда `lekalo_test` сохранена в исходном виде.

---

## 1. Сводная матрица готовности компонентов к Production

| Компонент / Направление | Статус готовности | Критические блокеры / Требуемые действия |
| :--- | :---: | :--- |
| **1. Архитектура Backend (NestJS + Fastify)** | `READY` | Typecheck 0 ошибок, сборка `tsc` успешна, Fastify 35MB limit, Graceful shutdown. |
| **2. Архитектура Frontend (Next.js 14)** | `READY` | Typecheck 0 ошибок, SSR/SSG, Standalone output, Mobile Touch Targets $\ge 44$ px (WCAG). |
| **3. Контейнеризация и Vercel Services** | `READY` | Multi-stage `Dockerfile`, non-root user `nestjs:1001`, `/health` probe, `vercel.json` rewrites. |
| **4. База данных Neon (Production)** | `NEEDS CONFIGURATION` | Требуется создание отдельного production-кластера `lekalo_prod`, изолированного от `lekalo_test`. |
| **5. Миграции БД (Prisma Schema)** | `NEEDS CONFIGURATION` | 3 разрозненных SQL-файла; в `stage_5_24` присутствует блокирующий guard `IF db != 'lekalo_test'`. Требуется консолидация. |
| **6. Безопасность (CORS, CSRF, Cookies)** | `READY` | HttpOnly + Secure cookies, dynamic Origin check через `ALLOWED_ORIGINS`, SameSite=Lax. |
| **7. Приватное хранилище PDF (Supabase S3)** | `NEEDS CONFIGURATION` | Архитектура готова (`S3StorageService`), требуется создание боевого приватного бакета `patterns` с RLS. |
| **8. Авторизация SUPER_ADMIN** | `READY` | Скрипт `scripts/promote-admin.ts` готов, защита маршрутов `/admin` на клиенте и сервере работает. |
| **9. Защита покупок (Purchase Guard)** | `READY` | Блокировка дублирующих заказов и повторной покупки активных выкроек протестирована. |
| **10. Транзакционный SMTP-шлюз** | `BLOCKED` | В коде используется `ConsoleMailService`. Требуется интеграция с реальным SMTP/Resend шлюзом. |
| **11. Банковский эквайринг (Электронные платежи)** | `BLOCKED` | В системе активен только `MockPaymentGateway`. Требуется выбор банка и реализация шлюза. |
| **12. Боевой домен и SSL (`lekalojiide.com`)** | `NEEDS CONFIGURATION` | Требуется настройка DNS-записей (CNAME/A) и выпуск сертификата в Vercel. |
| **13. Контентное наполнение (22 модели)** | `NEEDS CONFIGURATION` | Пилот «Чолпон» готов; для остальных 22 моделей требуется загрузка боевых PDF конструктора. |

---

## 2. Детальный аудит инфраструктуры

```mermaid
flowchart TD
    subgraph Client["Клиентский слой"]
        Browser["Браузер пользователя / Мобильный"]
        AdminUI["Панель администратора (Адилет)"]
    end

    subgraph Edge["Граничный слой (Vercel)"]
        DNS["DNS: lekalojiide.com (SSL)"]
        VercelRouter["Vercel Services Router"]
        NextFrontend["Next.js 14 Frontend (SSR/Standalone)"]
    end

    subgraph BackendApp["Сервер приложений (Container)"]
        NestFastify["NestJS 10 + Fastify Engine (:4000)"]
        AuthModule["Модуль Auth & RBAC (Argon2 / JWT)"]
        CabinetModule["Кабинет & Entitlements"]
        PurchaseGuard["Purchase Guard (Дедупликация)"]
    end

    subgraph DataStorage["Слой данных и хранилища"]
        NeonProd["Neon PostgreSQL (lekalo_prod)"]
        SupaPrivate["Supabase S3 Private (patterns)"]
        SupaPublic["Supabase S3 Public (product-images)"]
    end

    Browser --> DNS --> VercelRouter
    AdminUI --> DNS --> VercelRouter
    VercelRouter --> NextFrontend
    VercelRouter --> NestFastify
    NextFrontend -.->|INTERNAL_API_URL| NestFastify
    NestFastify --> AuthModule
    NestFastify --> CabinetModule
    NestFastify --> PurchaseGuard
    NestFastify -->|Prisma Pooler| NeonProd
    CabinetModule -->|Signed URL (10 min)| SupaPrivate
    NextFrontend -->|Public CDN| SupaPublic
```

### 2.1. Git-репозиторий и ветка
- **Репозиторий**: `https://github.com/medinaalieva/lekalojiide.git`
- **Текущая ветка**: `main`
- **Последний коммит**: `fa07c1c feat(admin): implement complete admin panel, user management API, and promote-admin script`
- **Чистота кода**: все TypeScript-типы проверены (`npm run typecheck` в root и frontend завершены с кодом 0). Сборка бэкенда (`npm run build`) успешно генерирует `dist/`.

### 2.2. Серверный слой (NestJS + Fastify)
- **Фреймворк**: NestJS 10 на высокопроизводительном движке `@nestjs/platform-fastify`.
- **Лимит тела запроса**: `35 * 1024 * 1024` (35 МБ), что обеспечивает загрузку полноразмерных PDF-выкроек и CAD-схем.
- **Поддержка BigInt**: встроен глобальный полифил сериализации BigInt в JSON.
- **Префиксы**: глобальный префикс `/api/v1` с исключением для health-проб (`/health`, `/health/ready`).
- **Сетевая изоляция**: Graceful Shutdown через `enableShutdownHooks()`.

### 2.3. Клиентский слой (Next.js 14)
- **Режим сборки**: `output: "standalone"` (оптимально для контейнеров и serverless Vercel).
- **Оптимизация изображений**: форматы `AVIF` и `WebP`, белый список remotePatterns (`storage.supabase.co`, `images.unsplash.com`).
- **Маршрутизация**: настроены редиректы для исправления опечаток в slug (`/catalog/pizharnyj...` $\to$ `/catalog/pizhamnyj...`) и проксирование API-запросов (`/api/v1/:path*` $\to$ Backend).

### 2.4. Vercel Configuration (`vercel.json`)
- Конфигурация Vercel Services разделяет проект на два независимых сервиса:
  - `frontend`: корень `frontend`, framework `nextjs`, привязан к бэкенду через переменную `INTERNAL_API_URL`.
  - `backend`: корень `.`, runtime `container`, точка входа `Dockerfile`.
- Маршрутизация запросов:
  - `/api/v1/(.*)` $\to$ service `backend`
  - `/health` и `/health/ready` $\to$ service `backend`
  - `/(.*)` $\to$ service `frontend`

---

## 3. Аудит готовности к Production (Security & Logic Audit)

### 3.1. Отсутствие привязки Production к `lekalo_test`
- [x] В исходном коде приложения (`src/`, `frontend/`, `docker-entrypoint.sh`) **нет захардкоженных упоминаний** базы данных `lekalo_test`.
- [x] Подключение к БД строго параметризовано через переменные окружения `DATABASE_URL` и `DIRECT_URL`.
- [!] **Выявленная особенность в миграциях**: в файле `prisma/migrations/stage_5_24_heights_and_formats.sql` присутствует проверка:
  ```sql
  IF current_database() != 'lekalo_test' THEN
      RAISE EXCEPTION 'SAFETY HALT: Execution attempted on database % instead of lekalo_test', current_database();
  END IF;
  ```
  При накате на боевую базу `lekalo_prod` этот скрипт завершится с ошибкой. Для Production требуется консолидированная чистая миграция без привязки к имени тестовой базы.

### 3.2. Аудит платёжного шлюза (Mock vs Live)
- [!] **Критический факт**: в файле `src/modules/payments/payments.module.ts` сервис `PAYMENT_GATEWAY` жёстко привязан к `MockPaymentGateway`:
  ```typescript
  providers: [
    PaymentsService,
    MockPaymentGateway,
    {
      provide: PAYMENT_GATEWAY,
      useExisting: MockPaymentGateway,
    },
  ]
  ```
- **Статус**: `BLOCKED` для коммерческих продаж.
- **Требуемое решение**: создание фабрики провайдеров (`PaymentGatewayFactory`), подключающей боевой шлюз (DemirBank / MBank / Optima / PayBox) при `PAYMENT_GATEWAY_MODE=live` и блокирующей тестовые транзакции.

### 3.3. Аудит сетевой безопасности (CORS, CSRF, Cookies, HTTPS)
- [x] **CORS**: функция `isAllowedOrigin()` динамически проверяет источник по `DEFAULT_ALLOWED_ORIGINS`, `ALLOWED_ORIGINS` (из env), а также по системным переменным Vercel (`VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_URL`).
- [x] **CSRF**: валидация заголовка `X-CSRF-Token`, строгая проверка origin на мутирующих HTTP-методах (POST, PUT, PATCH, DELETE).
- [x] **Cookies**: в `src/utils/cookies.ts` флаг `secure` автоматически выставляется в `true` при `NODE_ENV === "production"`, `httpOnly: true`, `sameSite: "lax"`.
- [x] **HTTPS**: обеспечивается на уровне Vercel Edge Network с принудительным HTTP 301 Redirect на HTTPS.

### 3.4. Авторизация SUPER_ADMIN
- [x] Права доступа проверяются в `src/modules/auth/users-admin.controller.ts` и `src/modules/cabinet/cabinet.service.ts` по роли `Role.ADMIN`.
- [x] В клиентской части (`frontend/src/app/admin/layout.tsx`) неавторизованные пользователи и пользователи с ролью `CUSTOMER` блокируются экраном с сообщением об ограничении доступа.
- [x] Для инициализации первого администратора на боевом сервере подготовлен безопасный CLI-скрипт `scripts/promote-admin.ts`, не содержащий захардкоженных паролей.

### 3.5. Защита цифровых PDF-выкроек и Signed URLs
- [x] Файлы выкроек **не имеют прямого публичного URL**.
- [x] Скачивание происходит исключительно через эндпоинт `POST /api/v1/cabinet/files/:entitlementId/download-url`.
- [x] Эндпоинт выполняет строгую 5-уровневую верификацию:
  1. Авторизация пользователя (JWT сессия);
  2. Наличие записи `PurchaseEntitlement` со статусом `ACTIVE`;
  3. Проверка лимита скачиваний (`downloadCount < maxDownloads`);
  4. Защита от перегрузки (Rate Limiter);
  5. Генерация временной ссылки через `S3StorageService.generatePresignedGetUrl` со сроком жизни 10 минут (600 секунд) и заголовком `Content-Disposition: attachment`.
- [x] Фиксация факта скачивания в таблице `download_logs` (IP, User-Agent, дата).

### 3.6. Предотвращение переноса тестовых данных
- [x] В базе данных `lekalo_test` накоплены 26 тестовых заказов, 19 тестовых пользователей и 2 тестовые модели-фикстуры (`T524_...`, `silk-elegance...`).
- [x] **План переноса исключает прямое клонирование БД (dump/restore) из lekalo_test в Production.**
- [x] Production база разворачивается **«с чистого листа» (Clean Slate)** через запуск миграций и наполнение официальными товарами через панель Адилета.

### 3.7. Безопасность сидирования (Seed Scripts)
- [x] Скрипт `prisma/seed.ts` проверен: он содержит исключительно операции `upsert` для системных справочников `Size` (размеры 40–54), `Height` (ростовки) и `Format` (A4, Плоттер 900, Letter).
- [x] Скрипт **не содержит** деструктивных вызовов (`deleteMany`, `drop`, `truncate`) и не затрагивает таблицы пользователей, товаров или заказов.

---

## 4. План развёртывания (10 Шагов)

### Шаг 1: Текущее состояние Production-инфраструктуры
- **Статус**: `NEEDS CONFIGURATION`
- Репозиторий готов на GitHub. Контейнерный билд протестирован. База данных Neon Production и бакеты Supabase Production ещё не созданы.

### Шаг 2: Что уже настроено
- **Статус**: `READY`
- Конфигурация сервисов в `vercel.json`;
- Production Dockerfile с оптимизированной многоэтапной сборкой;
- Скрипты проверки здоровья контейнера (`HEALTHCHECK`);
- Все компоненты витрины, корзины, оформления заказа, админки и личного кабинета;
- Защита Purchase Guard и генерация Presigned S3 URLs.

### Шаг 3: Что отсутствует
- **Статус**: `BLOCKED` (эквайринг, SMTP) / `NEEDS CONFIGURATION` (БД, S3, DNS)
- Боевой аккаунт и инстанс Neon PostgreSQL;
- Боевые бакеты Supabase Storage (`patterns` — private, `product-images` — public);
- Договор интернет-эквайринга с банком и модуль банковского шлюза;
- Аккаунт транзакционной почты SMTP с DKIM/SPF записями;
- DNS-делегирование домена `lekalojiide.com`.

### Шаг 4: Порядок и регламент применения миграций
- **Статус**: `NEEDS CONFIGURATION`
- **Проблема**: наличие разрозненных SQL-скриптов (`manual_password_reset_tokens.sql`, `stage_5_24_heights_and_formats.sql`, `stage_5_26_discount_from.sql`).
- **Регламент для Production**:
  1. Перед развёртыванием сформировать единую консолидированную миграцию `0_init`, полностью отражающую финальную схему `prisma/schema.prisma` (включая `discount_from`, `min_height`, `max_print_width`, `is_active` и таблицу `password_reset_tokens`).
  2. Накат миграций на боевой базе выполнять строго через:
     ```bash
     npx prisma migrate deploy
     ```
  3. Категорически запрещено использовать команды `prisma db push` или `prisma migrate reset` в production-окружении.

### Шаг 5: Перечень необходимых переменных окружения (Names Only)
- **Статус**: `READY` (спецификация утверждена)

#### Backend (Vercel Container / Server):
- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `DIRECT_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `JWT_ISSUER`
- `JWT_AUDIENCE`
- `ALLOWED_ORIGINS`
- `DEFAULT_CURRENCY`
- `PAYMENT_GATEWAY`
- `PAYMENT_WEBHOOK_SECRET`
- `STORAGE_DRIVER`
- `S3_ENDPOINT`
- `S3_REGION`
- `S3_PUBLIC_BUCKET`
- `S3_PRIVATE_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `RUN_MIGRATIONS`
- `RUN_SEED`

#### Frontend (Next.js 14):
- `INTERNAL_API_URL`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_SITE_URL`

### Шаг 6: Порядок развёртывания Backend и Frontend
- **Статус**: `READY`
- **Строгая последовательность ввода в эксплуатацию**:
  1. Создание БД Neon Production (`lekalo_prod`).
  2. Применение миграций `npx prisma migrate deploy`.
  3. Наполнение справочников `npx prisma db seed`.
  4. Создание приватного бакета `patterns` и публичного бакета `product-images` в Supabase.
  5. Развёртывание Backend-сервиса в Vercel с боевыми переменными окружения.
  6. Проверка доступности Backend по эндпоинтам `/health` и `/health/ready`.
  7. Развёртывание Frontend-сервиса в Vercel с привязкой к Backend.
  8. Создание учётной записи владельца и назначение роли администратора через `scripts/promote-admin.ts`.

### Шаг 7: Настройка домена и HTTPS
- **Статус**: `NEEDS CONFIGURATION`
- Привязка домена `lekalojiide.com` в консоли Vercel;
- Настройка DNS: `A` $\to$ `76.76.21.21`, `CNAME www` $\to$ `cname.vercel-dns.com`;
- Автоматический выпуск SSL-сертификата Let's Encrypt через Vercel Edge;
- Проверка принудительного HSTS и редиректа с `http://`.

### Шаг 8: План резервного копирования и аварийного восстановления (Disaster Recovery)
- **Статус**: `READY`
- **Neon PITR (Point-in-Time Recovery)**: автоматические инкрементальные снимки состояния БД с возможностью отката на любую секунду за последние 7 дней.
- **Ежедневный логический бэкап**: запуск cron-задачи выгрузки дампа схемы и данных через `pg_dump -Fc`.
- **Версионирование в S3**: включение Object Versioning в Supabase Storage для защиты от случайного удаления или перезаписи PDF-файлов выкроек.
- **RTO (время восстановления)**: $\le 60$ минут.
- **RPO (допустимая потеря данных)**: $\le 15$ минут.

### Шаг 9: План приёмочных проверок после деплоя (Post-Deploy Smoke Tests)
- **Статус**: `READY`
- Чек-лист из 10 контрольных тестов на живой системе:
  1. `[  ]` Проверка системного здоровья: `GET /health` возвращает `{"status":"ok"}`.
  2. `[  ]` Загрузка витрины: главная страница и каталог отображаются без ошибок 5xx/4xx.
  3. `[  ]` Регистрация пользователя: создание нового покупателя и получение JWT cookie.
  4. `[  ]` Вход в панель администратора: вход под аккаунтом Адилета в `/admin`.
  5. `[  ]` Просмотр карточки товара: открытие пилотной модели пальто «Чолпон» (`/catalog/palto-oversayz-cholpon`).
  6. `[  ]` Работа калькулятора цен: выбор форматов (A4, Плоттер) динамически меняет цену.
  7. `[  ]` Добавление в корзину: товар корректно сохраняется в сессии корзины.
  8. `[  ]` Оформление заказа: создание тестового заказа с суммой 1 сом.
  9. `[  ]` Скачивание из личного кабинета: генерация Presigned URL и скачивание PDF-файла.
  10. `[  ]` Срабатывание Purchase Guard: повторная попытка купить ту же выкройку блокируется сообщением «Уже приобретено».

### Шаг 10: Анализ рисков и способы отката (Rollback Procedures)
- **Статус**: `READY`

| Риск / Нештатная ситуация | Вероятность / Критичность | Превентивная мера | Процедура немедленного отката |
| :--- | :---: | :--- | :--- |
| **Сбой миграции БД** | Низкая / Высокая | Предварительное тестирование миграций на staging-ветке. | Откат через `prisma migrate resolve` либо мгновенный возврат ветки Neon на точку до деплоя. |
| **Падение контейнера Backend** | Средняя / Критическая | Наличие Healthcheck-пробы и изоляция зависимостей в Docker. | Мгновенный откат в консоли Vercel (Instant Rollback) на предыдущую стабильную версию. |
| **Задержка распространения DNS** | Средняя / Средняя | Установка TTL = 300 секунд за 24 часа до переключения. | Возврат DNS-записей на прежний IP в течение 5 минут. |
| **Утечка PDF-файлов** | Низкая / Критическая | Запрет прямого доступа к бакету Supabase (Private + RLS). | Немедленная смена `S3_SECRET_ACCESS_KEY` и отзыв активных сессий. |

---

## 5. Итоговое заключение аудита (Executive Verdict)

### 5.1. Уровень готовности к Production (Production Readiness)
- **Программная и архитектурная часть (Код, UI, API, Безопасность)**: **ГОТОВНОСТЬ 100%**.
- **Инфраструктурная и организационная часть (Эквайринг, SMTP, Боевая БД)**: **ГОТОВНОСТЬ 40%**.

### 5.2. Критические блокеры (Critical Blockers)
1. **Отсутствие боевого интернет-эквайринга**: в системе отсутствует код интеграции с реальным кыргызским банком (активен только Mock). Приём реальных денег технически невозможен до заключения договора и реализации адаптера шлюза.
2. **Отсутствие боевого SMTP-шлюза**: сброс паролей и отправка чеков покупателям работают через консольные логи (`ConsoleMailService`).

### 5.3. Что можно выполнить автоматически (Automated Actions)
- Сборка и деплой контейнера бэкенда через Vercel Services;
- Сборка и деплой Next.js фронтенда;
- Применение миграций схемы через `npx prisma migrate deploy`;
- Сидирование базовых справочников через `npx prisma db seed`;
- Выпуск бесплатного SSL-сертификата Let's Encrypt в Vercel.

### 5.4. Где требуется ручное действие владельца проекта (Adilet Manual Actions)
- Заключение договора эквайринга с банком (Демир Банк, MBank, Оптима, PayBox);
- Регистрация аккаунта в сервисе почтовых рассылок (Resend / Yandex 360) и добавление DKIM/SPF записей в DNS;
- Предоставление конструктором боевых PDF-файлов для 22 моделей каталога;
- Заполнение карточек товаров и установка флага публикации (`isPublished = true`).

### 5.5. Действия, требующие отдельного согласования
- Выбор банка-эквайера и утверждение комиссии за эквайринг;
- Утверждение окончательного доменного имени (`lekalojiide.com` vs `lekalo-zhiide.kg`);
- Переключение флага `PAYMENT_GATEWAY_MODE` с тестового на боевой.
