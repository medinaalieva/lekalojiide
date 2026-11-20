# LEKALO ZHIIDE — STAGE 4.5.9B: PASSWORD RESET DATABASE PREPARATION REPORT

**Дата выполнения:** 18 ноября 2026 г.  
**Цель этапа:** Подготовить безопасное создание таблицы `password_reset_tokens` исключительно в тестовой базе данных `lekalo_test` без применения изменений.  
**Режим:** **PREPARATION ONLY (БЕЗ ВЫПОЛНЕНИЯ DDL / МИГРАЦИЙ)**  
**Статус:** **ГОТОВО К ПРИМЕНЕНИЮ ПОСЛЕ СОГЛАСОВАНИЯ**  

---

## 1. Подтверждение окружения и базы данных

Выполнена верификация подключения Backend к базе данных PostgreSQL без логирования учетных данных и секретов:

| Параметр | Значение | Результат проверки |
|---|---|---|
| **`SELECT current_database()`** | `lekalo_test` | **ПОДТВЕРЖДЕНО СТРОГО** |
| **`SELECT current_user`** | `neondb_owner` | **ПОДТВЕРЖДЕНО** |
| **Версия PostgreSQL** | `PostgreSQL 18.7 (Neon Cloud)` | **ПОДТВЕРЖДЕНО** |
| **Встроенный `gen_random_uuid()`** | Доступен нативно | **ПОДТВЕРЖДЕНО** |
| **Секреты / DATABASE_URL** | Не логировались | **СОБЛЮДЕНО** |

---

## 2. Проверка существования таблицы в базе данных

Выполнен системный запрос к `information_schema.tables` схемы `public` в БД `lekalo_test`:

```sql
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'password_reset_tokens'
) as exists;
```

**Результат:**
- `exists: false`.
- Физическая таблица `password_reset_tokens` в базе данных `lekalo_test` **отсутствует**.
- В схеме `public` присутствуют 23 таблицы каталога, пользователей, заказов, оплат и скачиваний, ни одна из которых не содержит сущностей сброса пароля.
- В каталоге `prisma/migrations` ранее существовала только исходная миграция `0_init/migration.sql`. Конфликтующих или дублирующих миграций для сброса пароля **нет**.

---

## 3. Анализ схемы и сопоставление Prisma-модели с PostgreSQL

В соответствии с сервисным слоем [`PasswordResetService`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/src/modules/auth/password-reset.service.ts) и проектным планом Stage 4.5.7, структура сущности `PasswordResetToken` полностью согласована с существующими таблицами БД (`users`, `user_sessions`):

### 3.1. Сравнительная таблица полей и типов данных

| Поле в модели | Поле в PostgreSQL | Тип PostgreSQL | Nullable | Значение по умолчанию | Назначение / Ограничения |
|---|---|---|---|---|---|
| `id` | `id` | `UUID` | `NOT NULL` | `gen_random_uuid()` | Первичный ключ (`PRIMARY KEY`) |
| `userId` | `user_id` | `UUID` | `NOT NULL` | *нет* | Внешний ключ на `users(id)` (`ON DELETE CASCADE`) |
| `tokenHash` | `token_hash` | `VARCHAR(255)` | `NOT NULL` | *нет* | SHA-256 хеш токена, `UNIQUE INDEX` |
| `expiresAt` | `expires_at` | `TIMESTAMPTZ` | `NOT NULL` | *нет* | Точный срок жизни токена (TTL 15 минут) |
| `isUsed` | `is_used` | `BOOLEAN` | `NOT NULL` | `false` | Флаг одноразового использования |
| `createdAt` | `created_at` | `TIMESTAMPTZ` | `NOT NULL` | `CURRENT_TIMESTAMP` | Дата и время создания запроса |

### 3.2. Индексы и ограничения целостности (Constraints)

1. **`password_reset_tokens_pkey`** — первичный ключ по полю `id`.
2. **`password_reset_tokens_token_hash_key`** (`UNIQUE INDEX`) — обеспечивает мгновенный поиск O(1) по хешу токена и предотвращает коллизии.
3. **`password_reset_tokens_user_id_idx`** (`INDEX`) — обеспечивает быстрый поиск всех токенов конкретного пользователя для валидации или массовой очистки.
4. **`password_reset_tokens_user_id_fkey`** (`FOREIGN KEY`) — ссылается на `users(id)` с правилом `ON DELETE CASCADE ON UPDATE CASCADE`. При удалении аккаунта пользователя все его токены сброса удаляются автоматически, не оставляя сиротских записей.

---

## 4. Подготовленный SQL-файл миграции

Создан файл [prisma/migrations/manual_password_reset_tokens.sql](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/prisma/migrations/manual_password_reset_tokens.sql):

```sql
-- ============================================================================
-- LEKALO ZHIIDE — STAGE 4.5.9B: MANUAL PASSWORD RESET TOKENS MIGRATION
-- Target Database: lekalo_test (PostgreSQL 18+ / Neon)
-- Security: Stores ONLY SHA-256 hashes of reset tokens. Never stores raw tokens.
-- Lifecycle: TTL 15 minutes, single-use enforced by is_used flag.
-- ============================================================================

-- 1. Create table password_reset_tokens
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "is_used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- 2. Create unique index for token_hash lookup and collision prevention
CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_token_hash_key" 
ON "password_reset_tokens"("token_hash");

-- 3. Create index for fast user-specific token filtering and cleanup
CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_id_idx" 
ON "password_reset_tokens"("user_id");

-- 4. Add foreign key referencing users(id) with CASCADE delete/update
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'password_reset_tokens_user_id_fkey'
    ) THEN
        ALTER TABLE "password_reset_tokens"
        ADD CONSTRAINT "password_reset_tokens_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;
```

---

## 5. Проверка критериев безопасности (Security by Design)

Анализ кода [`PasswordResetService`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/src/modules/auth/password-reset.service.ts) и подготовленного DDL подтвердил полное соответствие требованиям безопасности:

1. **Сохраняется только SHA-256 хеш:**
   - Генерация: `rawToken = generateSecureToken(32)` (256 бит энтропии).
   - Хеширование: `tokenHash = hashToken(rawToken)` через `crypto.createHash('sha256')`.
   - В SQL передаётся исключительно `tokenHash` (`VARCHAR(255)`).
2. **Исходный токен не хранится в БД:**
   - Поле для сырого токена в таблице **отсутствует**.
   - `rawToken` отправляется только покупателю в теле ссылки (`/reset-password?token=...`). Даже при полной компрометации базы данных или дампов злоумышленник не сможет восстановить действующие ссылки.
3. **TTL строго 15 минут:**
   - `expiresAt = new Date(Date.now() + 15 * 60 * 1000)`.
   - При сбросе выполняется строгая проверка: `if (new Date() > new Date(tokenRecord.expiresAt)) throw new BadRequestError("TOKEN_EXPIRED")`.
4. **Одноразовое использование токена:**
   - Таблица содержит поле `is_used BOOLEAN DEFAULT false`.
   - При первом успешном сбросе пароля выполняется: `UPDATE password_reset_tokens SET is_used = true WHERE token_hash = $1`.
5. **Повторное использование блокируется:**
   - При повторном обращении с тем же токеном проверка `if (tokenRecord.isUsed)` немедленно отклоняет запрос с ошибкой `TOKEN_ALREADY_USED`.
6. **Инвалидация сессий:**
   - Смена пароля завершается вызовом `authService.logoutAll(user.id)`, моментально отзывая все refresh-токены и активные клиентские сессии.

---

## 6. Команда для применения изменений (НЕ ЗАПУСКАЛАСЬ)

В соответствии с запретом этапа, миграция **НЕ применялась**, структура БД **НЕ изменялась**.

Когда будет получено отдельное разрешение пользователя, применение миграции может быть выполнено одной из следующих команд:

### Вариант A (Прямое применение подготовленного безопасного SQL через Prisma CLI):
```bash
npx prisma db execute --file prisma/migrations/manual_password_reset_tokens.sql --schema prisma/schema.prisma
```

### Вариант B (Применение через Prisma Client script):
```bash
node -e "const fs=require('fs'); const {PrismaClient}=require('@prisma/client'); const p=new PrismaClient(); p.\$executeRawUnsafe(fs.readFileSync('prisma/migrations/manual_password_reset_tokens.sql','utf8')).then(()=>console.log('SUCCESS')).finally(()=>p.\$disconnect());"
```

---

## 7. Соблюдение ограничений этапа

- SQL-файл **НЕ выполнялся**.
- `prisma db push` **НЕ запускался**.
- `prisma migrate deploy` **НЕ запускался**.
- Структура базы данных `lekalo_test` **НЕ изменялась**.
- Данные пользователей **НЕ изменялись**.
- Продакшн Neon, Vercel, Supabase, GitHub **НЕ затрагивались**.
- `git commit` и `git push` **НЕ выполнялись**.
- Никакие секреты или токены **НЕ выводились**.

Все подготовительные работы выполнены в полном объёме. Дальнейшие действия остановлены в ожидании вашего разрешения.
