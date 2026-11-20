# PRE-DEPLOY-006 — Аудит бесплатного деплоя LEKALO ZHIIDE (Анализ кодовой базы)

## 1. Обзор аудита

Настоящий отчёт содержит углублённый аудит совместимости **фактического программного кода** репозитория **LEKALO ZHIIDE** с платформами бесплатного тестового деплоя:
- **Neon Free** — PostgreSQL 16+ (Serverless СУБД);
- **Render Free Web Services** — хостинг backend (NestJS + Fastify) и frontend (Next.js Standalone).

Анализ проведён непосредственно по файлам проекта, скомпилированным артефактам сборки (`routes-manifest.json`, `dist/`), конфигурациям маршрутизации, cookies, CORS, healthcheck и механизмов сидирования.

---

## 2. Анализ выявленных ограничений в коде проекта

### Ограничение 1: Запекание целевого URL бэкенда в Next.js Rewrites на этапе сборки
- **Конкретный файл / компонент**:
  [frontend/next.config.js](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/frontend/next.config.js#L2-L5) (строки 2–5, 21–28) и [frontend/Dockerfile](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/frontend/Dockerfile#L27-L31) (строки 27–31).
- **В чём проблема**:
  Next.js вычисляет `async rewrites()` во время сборки (`next build`) и жестко запекает результат в артефакт `frontend/.next/routes-manifest.json`.
  В текущей сборке зафиксировано:
  ```json
  "rewrites":[{"source":"/api/v1/:path*","destination":"http://127.0.0.1:4000/api/v1/:path*"}]
  ```
  Если на Render собрать фронтенд без предварительно выставленной переменной `INTERNAL_API_URL`, Next.js в production будет проксировать запросы браузера на `127.0.0.1:4000`, где бэкенда нет. Это приведет к ошибкам `ECONNREFUSED` (HTTP 500) на всех вызовах API из браузера.
- **Обязательно ли менять код**:
  **НЕТ**.
- **Минимальный способ исправления**:
  В панели Render при создании Web Service фронтенда задать переменную окружения:
  `INTERNAL_API_URL=https://<backend-service-name>.onrender.com`
  **до запуска первой сборки**. В Render Native Web Service переменные окружения автоматически прокидываются в фазу `npm run build`.
- **Повлияет ли изменение на локальную работу проекта**:
  Не повлияет. Локально при разработке переменная отсутствует и Next.js автоматически использует фолбэк `http://127.0.0.1:4000`.

---

### Ограничение 2: Принудительно зафиксированный порт в скрипте запуска Next.js
- **Конкретный файл / компонент**:
  [frontend/package.json](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/frontend/package.json#L8) (строка 8: `"start": "next start -p 3000"`).
- **В чём проблема**:
  Платформа Render Native Web Service динамически назначает порт через переменную окружения `$PORT` (например, 10000). Если оставить стандартную команду запуска `npm start`, Next.js запустится на порту 3000. Встроенный сканер портов Render будет опрашивать порт 10000, не обнаружит слушающий процесс и аварийно остановит деплой по таймауту: `Port scan timeout: No open ports found on 10000`.
- **Обязательно ли менять код**:
  **НЕТ**.
- **Минимальный способ исправления**:
  В настройках Web Service на Render в поле **Start Command** указать:
  `node .next/standalone/server.js` (автоматически слушает `process.env.PORT`) либо `npm start -- -p $PORT`.
- **Повлияет ли изменение на локальную работу проекта**:
  Не повлияет. Локально для разработки используется `npm run dev` (`next dev -p 3000`).

---

### Ограничение 3: Недоступность `ts-node` для сидирования в Docker production-образе
- **Конкретный файл / компонент**:
  [package.json](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/package.json#L21) (строка 21: `"seed": "ts-node prisma/seed.ts"`), [tsconfig.build.json](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/tsconfig.build.json#L11) (строка 11) и [docker-entrypoint.sh](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/docker-entrypoint.sh#L17-L20) (строки 17–20).
- **В чём проблема**:
  Команда `npx prisma db seed` запускает `ts-node prisma/seed.ts`. Пакет `ts-node` объявлен в `devDependencies`. В [Dockerfile](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/Dockerfile#L35) на этапе сборщика выполняется `npm prune --production`, удаляющий все dev-зависимости. При включении `RUN_SEED=true` скрипт запуска контейнера не сможет запустить `ts-node`.
- **Обязательно ли менять код**:
  **НЕТ**.
- **Минимальный способ исправления**:
  Выполнить наполнение справочников один раз локально с рабочей станции, указав строку подключения Neon:
  ```bash
  DATABASE_URL="postgresql://<user>:<password>@<neon-host>/neondb?sslmode=require" npm run prisma:seed
  ```
  Базовые справочники (`Size`, `Height`, `Format`) зальются в облачную базу за 1–2 секунды. На сервере Render переменная `RUN_SEED` оставляется выключенной (`RUN_SEED=false`), активна только `RUN_MIGRATIONS=true`.
- **Повлияет ли изменение на локальную работу проекта**:
  Не повлияет. Локально `ts-node` присутствует.

---

### Ограничение 4: Риск сбоя проверки готовности (`/health/ready`) при засыпании Neon
- **Конкретный файл / компонент**:
  [src/modules/health/health.service.ts](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/src/modules/health/health.service.ts#L45-L51) (строки 45–51: таймаут `Promise.race` 3000 мс).
- **В чём проблема**:
  База Neon Free автоматически засыпает после 5 минут неактивности. Холодный старт вычислительного узла Neon занимает 1.5–3.5 секунды. Если в настройках Render Health Check Path указать эндпоинт готовности `/health/ready`, и при регулярном опросе Render получит ответ позже 3 секунд, эндпоинт вернет `503 Service Unavailable`. Платформа Render может решить, что сервис сломан, и перезагрузить контейнер.
- **Обязательно ли менять код**:
  **НЕТ**.
- **Минимальный способ исправления**:
  В настройках Render в поле **Health Check Path** указать эндпоинт проверки жизнеспособности процесса:
  `/health` (вместо `/health/ready`).
  Эндпоинт `/health` проверяет только доступность HTTP-сервера Node.js, не обращается к базе данных и мгновенно возвращает `200 OK` (1 мс).
- **Повлияет ли изменение на локальную работу проекта**:
  Не повлияет. Оба эндпоинта остаются доступными в коде.

---

### Ограничение 5: Несовместимость Prisma-миграций с PgBouncer пулером Neon
- **Конкретный файл / компонент**:
  [prisma/schema.prisma](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/prisma/schema.prisma#L1-L4) (строки 1–4) и [docker-entrypoint.sh](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/docker-entrypoint.sh#L9) (строка 9).
- **В чём проблема**:
  `npx prisma migrate deploy` использует advisory locks PostgreSQL (`pg_advisory_lock`), которые запрещены в PgBouncer в режиме transaction pooling (адрес со строкой `-pooler`). Попытка применить миграции через пулер приведет к аварийной остановке: `ERROR: advisory locks are not supported in transaction pooling mode`.
- **Обязательно ли менять код**:
  **НЕТ**.
- **Минимальный способ исправления**:
  В переменную `DATABASE_URL` на Render передавать **Direct Connection String** из консоли Neon (порт 5432, без подстроки `-pooler`). Прямой адрес Neon поддерживает advisory locks и до 100 одновременных подключений на бесплатном тарифе.
- **Повлияет ли изменение на локальную работу проекта**:
  Не повлияет.

---

### Ограничение 6: Блокировка запросов по политике CORS/CSRF в контроллере авторизации
- **Конкретный файл / компонент**:
  [src/modules/auth/auth-http.controller.ts](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/src/modules/auth/auth-http.controller.ts#L227-L232) (метод `checkOrigin`) и [src/config/http.config.ts](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/src/config/http.config.ts#L23-L46).
- **В чём проблема**:
  Метод `checkOrigin` сопоставляет заголовок `Origin`/`Referer` со списком доверенных хостов:
  ```typescript
  if (origin && !isAllowedOrigin(origin)) {
    throw new ForbiddenError("CSRF_VIOLATION", "Запрос отклонен политикой CORS/CSRF");
  }
  ```
  Если на Backend в переменной `ALLOWED_ORIGINS` не прописан публичный URL фронтенда на Render, любые попытки регистрации, входа или ротации токена будут блокироваться с кодом 403 `CSRF_VIOLATION`.
- **Обязательно ли менять код**:
  **НЕТ**.
- **Минимальный способ исправления**:
  После создания фронтенда на Render прописать его URL в переменную `ALLOWED_ORIGINS` на сервисе Backend:
  `ALLOWED_ORIGINS=https://<frontend-app-name>.onrender.com`
- **Повлияет ли изменение на локальную работу проекта**:
  Не повлияет.

---

### Ограничение 7: Фиктивный адрес раздачи файлов в Mock Storage
- **Конкретный файл / компонент**:
  [src/modules/storage/mock-storage.service.ts](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/src/modules/storage/mock-storage.service.ts#L14) (строка 14: `baseUrl = "https://storage.lekalozhiide.local/mock-s3/download"`).
- **В чём проблема**:
  Временные ссылки на скачивание генерируются с адресом локальной заглушки `storage.lekalozhiide.local`. При клике по ссылке в браузере скачивание физического PDF-файла не произойдет (`ERR_NAME_NOT_RESOLVED`).
- **Обязательно ли менять код**:
  **НЕТ (для функционального тестирования личного кабинета и прав)** / **ДА (если требуется физическое скачивание файла)**.
- **Минимальный способ исправления**:
  - Для бесплатного тестового деплоя: оставить как есть. Проверяется полная цепочка: выдача прав `PurchaseEntitlement`, генерация криптографической подписи HMAC-SHA256, обратный отсчет таймера (600 сек) в интерфейсе и аудит запросов.
  - Если требуется реальная раздача файлов без оплаты: подключить бесплатный тариф **Cloudflare R2** ($0/мес за первые 10 GB хранилища и 10 млн запросов на чтение, без платы за исходящий трафик).
- **Повлияет ли изменение на локальную работу проекта**:
  Не повлияет.

---

### Ограничение 8: Фиктивный адрес платёжного шлюза в Mock Payments
- **Конкретный файл / компонент**:
  [src/modules/payments/gateways/mock-payment.gateway.ts](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/src/modules/payments/gateways/mock-payment.gateway.ts#L39) (строка 39) и [frontend/src/app/checkout/page.tsx](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/frontend/src/app/checkout/page.tsx#L169) (строка 169).
- **В чём проблема**:
  Кнопка «Оплатить заказ» перенаправляет на адрес `https://mock-gateway.example.kg/pay/...`, который отсутствует в DNS.
- **Обязательно ли менять код**:
  **НЕТ**.
- **Минимальный способ исправления**:
  В коде уже реализован контроллер приёма вебхуков [src/modules/payments/payment-webhooks.controller.ts](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/src/modules/payments/payment-webhooks.controller.ts).
  Для эмуляции успешной оплаты заказа достаточно отправить HTTP POST запрос на адрес бэкенда:
  `/api/v1/webhooks/payments/mock`
  с телом `{"orderId":"...","amount":...,"currency":"KGS","status":"SUCCEEDED"}` и заголовком `x-signature` (HMAC от тела с ключом `PAYMENT_WEBHOOK_SECRET`). Заказ автоматически переходит в статус `PAID`, и выкройка появляется в личном кабинете.
- **Повлияет ли изменение на локальную работу проекта**:
  Не повлияет.

---

## 3. Таблица выявленных ограничений кодовой базы

| № | Компонент / Файл | Проблема | Обязательно менять код? | Решение через конфигурацию ($0) |
|---|---|---|:---:|---|
| 1 | `frontend/next.config.js` | Запекание `127.0.0.1:4000` в rewrites | **НЕТ** | Задать `INTERNAL_API_URL` в Render до сборки |
| 2 | `frontend/package.json` | Хардкод `-p 3000` в `npm start` | **НЕТ** | Задать Start Command `node .next/standalone/server.js` |
| 3 | `package.json`, `docker-entrypoint.sh` | Отсутствие `ts-node` в prod для сидирования | **НЕТ** | Выполнить `npm run prisma:seed` один раз локально с URL Neon |
| 4 | `src/modules/health/health.service.ts` | Таймаут 3000 мс в `/health/ready` при сне Neon | **НЕТ** | Указать Health Check Path `/health` в Render |
| 5 | `prisma/schema.prisma` | Advisory locks падают через пулер PgBouncer | **НЕТ** | Использовать Neon Direct Connection (порт 5432) |
| 6 | `src/modules/auth/auth-http.controller.ts` | CSRF блокировка при отсутствии Origin | **НЕТ** | Добавить URL фронтенда в `ALLOWED_ORIGINS` бэкенда |
| 7 | `src/modules/storage/mock-storage.service.ts` | Локальный домен `storage.lekalozhiide.local` | **НЕТ** (для MVP) | Для теста оставить как есть; для файлов — Cloudflare R2 ($0) |
| 8 | `src/modules/payments/gateways/mock-payment.gateway.ts`| Несуществующий адрес `mock-gateway.example.kg` | **НЕТ** | Подтверждать заказы через штатный тестовый вебхук |

---

## 4. Пошаговый план тестового деплоя ($0)

### Шаг 1: Создание базы данных Neon PostgreSQL ($0)
1. Перейти на [neon.tech](https://neon.tech) и войти через GitHub.
2. Создать проект: имя `lekalo-zhiide-db`, регион `Frankfurt (eu-central-1)` или ближайший.
3. В панели *Dashboard* выбрать вкладку **Direct Connection** (НЕ Pooled).
4. Скопировать строку вида:
   `postgresql://neondb_owner:***@ep-xyz.eu-central-1.aws.neon.tech/neondb?sslmode=require`
5. Со своего локального терминала выполнить первичное сидирование справочников:
   ```bash
   cd "C:\Users\ASUS\.gemini\antigravity\scratch\lekalo-zhiide"
   $env:DATABASE_URL="<ВАША_СТРОКА_NEON_DIRECT>"
   npx prisma migrate deploy
   npm run prisma:seed
   ```
   *Стоимость: $0.00 / месяц (включено 1 GB и 100 CU-часов).*

---

### Шаг 2: Развёртывание Backend на Render ($0)
1. Перейти на [render.com](https://render.com) и войти через GitHub.
2. Нажать **New +** -> **Web Service**.
3. Подключить репозиторий `medinaalieva/lekalojiide`.
4. Параметры сервиса:
   - **Name**: `lekalo-zhiide-backend`
   - **Region**: `Frankfurt` (тот же, что и база данных)
   - **Branch**: `main`
   - **Root Directory**: оставьте пустым (корень)
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npx prisma generate && npm run build`
   - **Start Command**: `npx prisma migrate deploy && node dist/main.js`
   - **Instance Type**: `Free` ($0/month)
5. В секции **Advanced** -> **Health Check Path** указать: `/health`.
6. В секции **Environment Variables** добавить:
   - `NODE_ENV`: `production`
   - `DATABASE_URL`: строка Neon Direct Connection
   - `JWT_SECRET`: сгенерировать 32+ случайных символа
   - `JWT_EXPIRES_IN`: `15m`
   - `DEFAULT_CURRENCY`: `KGS`
   - `PAYMENT_GATEWAY`: `mock`
   - `PAYMENT_WEBHOOK_SECRET`: сгенерировать 32+ символа
   - `STORAGE_SIGNING_SECRET`: сгенерировать 32+ символа
   - `ALLOWED_ORIGINS`: временно `https://lekalo-zhiide-frontend.onrender.com`
7. Нажать **Create Web Service**. Дождаться завершения сборки и статуса `Live`.
8. Проверить в браузере: `https://lekalo-zhiide-backend.onrender.com/health` (должен вернуть `{"status":"ok"}`).
   *Стоимость: $0.00 / месяц (включено 512 MB RAM, 750 бесплатных часов).*

---

### Шаг 3: Развёртывание Frontend на Render ($0)
1. Нажать **New +** -> **Web Service**.
2. Подключить тот же репозиторий `medinaalieva/lekalojiide`.
3. Параметры сервиса:
   - **Name**: `lekalo-zhiide-frontend`
   - **Region**: `Frankfurt`
   - **Branch**: `main`
   - **Root Directory**: `frontend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `node .next/standalone/server.js` (либо `npm start -- -p $PORT`)
   - **Instance Type**: `Free` ($0/month)
4. В секции **Environment Variables** обязательно добавить **до нажатия Create**:
   - `NODE_ENV`: `production`
   - `INTERNAL_API_URL`: `https://lekalo-zhiide-backend.onrender.com`
   - `NEXT_PUBLIC_API_URL`: `https://lekalo-zhiide-backend.onrender.com`
5. Нажать **Create Web Service**.
6. Дождаться завершения сборки (Next.js запечет правильный URL бэкенда в routes-manifest) и перехода в статус `Live`.
   *Стоимость: $0.00 / месяц.*

---

### Шаг 4: Финальная синхронизация CORS и сквозная проверка
1. На сервисе Backend на Render проверить, что значение `ALLOWED_ORIGINS` точно совпадает с фактическим URL фронтенда (например, `https://lekalo-zhiide-frontend.onrender.com`).
2. Открыть сайт в браузере по адресу фронтенда.
3. Проверить базовые сценарии:
   - Просмотр главной страницы и каталога;
   - Регистрация нового покупателя;
   - Добавление выкройки в корзину;
   - Оформление заказа через чекаут;
   - Проверка личного кабинета.

---

## 5. Итоговая смета расходов

| Сервис | Тарифный план | Назначение | Стоимость |
| :--- | :--- | :--- | :---: |
| **Neon PostgreSQL** | Free Tier (1 GB storage, 100 CU-hrs/mo) | Серверная база данных PostgreSQL | **$0.00** |
| **Render Web Service (Backend)** | Free Tier (512 MB RAM, 0.1 vCPU, 750 hrs) | API NestJS + Fastify | **$0.00** |
| **Render Web Service (Frontend)**| Free Tier (512 MB RAM, 0.1 vCPU, 750 hrs) | Пользовательский интерфейс Next.js | **$0.00** |
| **SSL / HTTPS Сертификаты** | Render Managed Let's Encrypt | Автоматический шифрованный трафик | **$0.00** |
| **ИТОГО** | — | **Полный тестовый контур интернет-магазина** | **$0.00 / месяц** |

---

## 6. Итоговый вердикт

# READY FOR FREE TEST DEPLOY

Текущая кодовая база проекта **LEKALO ZHIIDE** **полностью совместима** с бесплатным деплоем на **Render Free + Neon Free** без изменения исходного кода. Все 8 выявленных специфических ограничений разрешаются на уровне параметров окружения и настроек панели управления.
