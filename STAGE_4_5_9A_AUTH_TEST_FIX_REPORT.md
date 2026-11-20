# LEKALO ZHIIDE — STAGE 4.5.9A: FIX AUTH HTTP TEST DEPENDENCY REPORT

**Дата выполнения:** 18 ноября 2026 г.  
**Цель этапа:** Устранить единственный выявленный FAIL из Stage 4.5.8 (ошибку разрешения зависимости `PasswordResetService` в `tests/auth-http.test.ts`).  
**Статус:** **ВЫПОЛНЕНО (ALL TESTS PASS)**  

---

## 1. Причина ошибки

На этапе **Stage 4.5.7A** в конструктор контроллера [`AuthHttpController`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/src/modules/auth/auth-http.controller.ts) была добавлена зависимость сервиса восстановления паролей:
```ts
constructor(
  private readonly authService: AuthService,
  passwordResetService?: PasswordResetService
) {
  this.resetService =
    passwordResetService || new PasswordResetService(undefined, this.authService);
}
```

В тестовом файле [`tests/auth-http.test.ts`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/tests/auth-http.test.ts) для изолированного HTTP-тестирования создавался отдельный модуль `TestAuthModule`, регистрировавший моки для `PrismaService` и `AuthService`:
```ts
@Module({
  controllers: [AuthHttpController],
  providers: [
    { provide: PrismaService, useValue: mockPrismaService },
    { provide: AuthService, useFactory: () => new AuthService(mockPrisma as any) },
  ],
})
class TestAuthModule {}
```

Поскольку в TypeScript включена генерация метаданных типов (`emitDecoratorMetadata: true`), DI-контейнер NestJS при создании контроллера инспектирует типы аргументов конструктора `[AuthService, PasswordResetService]`. Так как `PasswordResetService` отсутствовал в массиве `providers` модуля `TestAuthModule`, NestJS выбрасывал фатальную ошибку инициализации DI:
`Nest can't resolve dependencies of the AuthHttpController (?, ?). Please make sure that the argument PasswordResetService at index [1] is available in the TestAuthModule context.`

Это приводило к аварийному завершению `tests/auth-http.test.ts` еще на этапе `NestFactory.create()` до запуска тест-кейсов.

---

## 2. Какие файлы были изменены

В строгом соответствии с инструкцией:
- **Production-код НЕ изменялся**: в `AuthHttpController` декоратор `@Optional()` **не добавлялся**, бизнес-логика контроллера и сервисов сохранена в неизменном виде.
- **Изменен единственный тестовый файл**: [`tests/auth-http.test.ts`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/tests/auth-http.test.ts).

### Дифф изменений в `tests/auth-http.test.ts`:
```diff
--- a/tests/auth-http.test.ts
+++ b/tests/auth-http.test.ts
@@ -7,6 +7,7 @@ import fastifyCookie from "@fastify/cookie";
 import { Module } from "@nestjs/common";
 import { AuthHttpController } from "../src/modules/auth/auth-http.controller";
 import { AuthService } from "../src/modules/auth/auth.service";
+import { PasswordResetService } from "../src/modules/auth/password-reset.service";
 import { PrismaService } from "../src/lib/prisma.service";
 import { AppExceptionFilter } from "../src/common/filters/app-exception.filter";
 import { REFRESH_TOKEN_COOKIE_NAME } from "../src/utils/cookies";
@@ -133,6 +134,10 @@ async function createTestApp() {
         provide: AuthService,
         useFactory: () => new AuthService(mockPrisma as any),
       },
+      {
+        provide: PasswordResetService,
+        useFactory: () => new PasswordResetService(mockPrisma as any, new AuthService(mockPrisma as any)),
+      },
     ],
   })
   class TestAuthModule {}
```

---

## 3. Результаты тестов

### 3.1. Запуск исправленного теста `tests/auth-http.test.ts`
Команда: `npx ts-node tests/auth-http.test.ts`  
Результат: **6 из 6 тестов успешно пройдены (PASS)** за 888 мс.
```
TAP version 13
# Subtest: HTTP Auth: POST /api/v1/auth/register creates user and returns 201 with Set-Cookie
ok 1 - HTTP Auth: POST /api/v1/auth/register creates user and returns 201 with Set-Cookie
# Subtest: HTTP Auth: POST /api/v1/auth/register fails with 422 on invalid DTO
ok 2 - HTTP Auth: POST /api/v1/auth/register fails with 422 on invalid DTO
# Subtest: HTTP Auth: POST /api/v1/auth/login succeeds with 200 and fails with 401 on wrong password
ok 3 - HTTP Auth: POST /api/v1/auth/login succeeds with 200 and fails with 401 on wrong password
# Subtest: HTTP Auth: Refresh token rotation via cookies and logout flow
ok 4 - HTTP Auth: Refresh token rotation via cookies and logout flow
# Subtest: HTTP Auth: CSRF / Origin violation returns 403 Forbidden
ok 5 - HTTP Auth: CSRF / Origin violation returns 403 Forbidden
# Subtest: HTTP Auth: Allowed Production Origin (https://lekalojiide.vercel.app) passes CORS and CSRF
ok 6 - HTTP Auth: Allowed Production Origin (https://lekalojiide.vercel.app) passes CORS and CSRF
1..6
# tests 6
# pass 6
# fail 0
```

### 3.2. Проверка статической типизации TypeScript
Команда: `npm run typecheck` (`tsc --noEmit`)  
Результат: **0 ошибок (exit code 0)**.

### 3.3. Запуск полного Backend Test Suite
Команда: `npm test`  
Все **12 тестовых файлов** выполнены последовательно, каждый завершился с кодом 0:

| № | Тестовый файл | Тип теста | Пройдено | Статус |
|---|---|---|---|---|
| 1 | `tests/auth.test.ts` | Unit (Argon2id, JWT, сессии, CSRF, rate limit) | 31 / 31 | **PASS** |
| 2 | `tests/health.test.ts` | Unit (Liveness, readiness PostgreSQL) | 3 / 3 | **PASS** |
| 3 | `tests/auth-http.test.ts` | Unit HTTP (Fastify контроллер, cookie, CORS) | 6 / 6 | **PASS** |
| 4 | `tests/catalog.test.ts` | Unit (Slugify, валидация DTO каталога) | 6 / 6 | **PASS** |
| 5 | `tests/catalog-e2e.test.ts` | PostgreSQL E2E (Категории, фильтры, товары) | 9 / 9 | **PASS** |
| 6 | `tests/cart-orders.test.ts` | Unit (DTO корзины, расчет цен в KGS) | 5 / 5 | **PASS** |
| 7 | `tests/cart-orders-e2e.test.ts` | PostgreSQL E2E (Корзина, чекаут, снапшоты) | 14 / 14 | **PASS** |
| 8 | `tests/payment.test.ts` | Unit (HMAC-SHA256 подпись, парсинг вебхуков) | 5 / 5 | **PASS** |
| 9 | `tests/payment-e2e.test.ts` | PostgreSQL E2E (Оплата, retry, идемпотентность) | 12 / 12 | **PASS** |
| 10 | `tests/cabinet.test.ts` | Unit (Presigned URLs, rate limit 10/мин) | 8 / 8 | **PASS** |
| 11 | `tests/cabinet-e2e.test.ts` | PostgreSQL E2E (Права, версионирование, скачивание) | 15 / 15 | **PASS** |
| 12 | `tests/admin-users-stats.test.ts` | Unit / RBAC (Управление ролями, статистика) | 4 / 4 | **PASS** |

**Итог полного test suite:** **118 тестов пройдено, 0 ошибок (100% PASS)**.

---

## 4. Оценка оставшихся ошибок

1. **В кодовой базе и тестовом контуре ошибок не осталось**:
   - `npm test` завершается с кодом `0`.
   - TypeScript компилируется чисто (Backend: 0 ошибок, Frontend: 0 ошибок).
   - Производственная сборка Frontend компилирует все 24 страницы без сбоев.
2. **Внешние интеграционные зависимости** (не являются ошибками кода):
   - Отправка email: в тестовой среде работает `ConsoleMailService` (для продакшна потребуется SMTP).
   - Эквайринг: в тестовой среде работает `MockPaymentGateway` (для боевых продаж потребуется договор с банком Кыргызстана).
   - Создание физической таблицы `password_reset_tokens` в PostgreSQL: будет выполнено штатной миграцией при деплое.

---

## 5. Заключение

Единственный сбой Stage 4.5.8 полностью устранён минимальным, изолированным изменением в тестовом файле `tests/auth-http.test.ts`. Все требования и ограничения этапа Stage 4.5.9A строго соблюдены.
