# LEKALO ZHIIDE — TASK-006: Контрольный отчёт аудита

**Дата аудита:** 14 ноября 2026  
**Статус проверки:** Пройдено успешно (ALL CHECKS PASSED)  
**Проект:** LEKALO ZHIIDE (каталог цифровых выкроек)  
**Окружение:** NestJS, Fastify, Prisma ORM, PostgreSQL 15, Windows  

---

## 1. Анализ расхождения в количестве тестов (39 vs 32 vs 54)

### 1.1. Фактический состав тестовых наборов
До начала TASK-006 набор тестов состоял из **39 тестов** в трёх файлах:
1. `tests/auth.test.ts` — **31 тест** (Argon2id хэширование, JWT, валидация DTO, Rate Limiting, сессии, ротация Refresh Token, обнаружение кражи токенов, параллельные гонки запросов).
2. `tests/health.test.ts` — **3 теста** (liveness-проверка, readiness при недоступности PostgreSQL, readiness при успешном подключении).
3. `tests/auth-http.test.ts` — **5 тестов** (регистрация 201, валидация 422, логин 200/401, ротация кук, CSRF/Origin 403).

$$\text{Итого тестов до TASK-006} = 31 + 3 + 5 = 39 \text{ тестов}$$

В рамках TASK-006 были добавлены новые наборы для каталога:
4. `tests/catalog.test.ts` — **6 тестов** (транслитерация кириллицы/кыргызских букв `ө`, `ү`, `ң`, валидация схем DTO категорий, товаров, фильтров, матричной генерации, изображений).
5. `tests/catalog-e2e.test.ts` — **1 корневой тестовый сценарий**, включающий **9 вложенных интеграционных подтестов**:
   - `1. GET /api/v1/catalog/filters` (справочники из БД).
   - `2. RBAC Admin` (401 без токена, 403 для `CUSTOMER`).
   - `3. Создание дерева категорий` (родитель + потомок).
   - `4. Создание товара и черновика` (опубликованный vs `isActive: false`).
   - `5. Пакетная матричная генерация вариантов` ($2 \times 2 \times 2 = 8$ комбинаций).
   - `6. Публичный каталог` (проверка фильтрации черновиков).
   - `7. Поиск по названию и фильтрация по категории`.
   - `8. Карточка товара` (защита от утечки S3-ключей, 404 для черновика).
   - `9. Переключение статуса публикации` (PATCH status toggle).

$$\text{Фактическое общее количество тестов сейчас} = 31 + 3 + 5 + 6 + 9 = 54 \text{ проверочных сценария}$$
(или 46 тестов, если считать `catalog-e2e.test.ts` как 1 агрегирующий тест с 9 подтестами).

### 1.2. Причина появления числа «32/32»
- Ни один существующий тест Auth или Health **не был удалён, закомментирован или исключён**.
- Все тестовые файлы запускаются последовательно через `npm test`:
  `ts-node tests/auth.test.ts && ts-node tests/health.test.ts && ts-node tests/auth-http.test.ts && ts-node tests/catalog.test.ts && ts-node tests/catalog-e2e.test.ts`
- Число «32/32» в предыдущем текстовом резюме являлось **текстовой опечаткой ассистента** при суммировании (были сложены 31 тест из `auth.test.ts` + 1 верхнеуровневый тест из `catalog-e2e.test.ts` = 32), в то время как фактически все 5 файлов и все 54 тестовых утверждения выполнялись и завершились со статусом 100% OK.

---

## 2. Контрольный повтор системных команд проверки

| Команда | Фактический результат | Код выхода | Статус |
|---|---|---|---|
| `npm run typecheck` | `tsc --noEmit` завершён без ошибок | `0` | **PASSED** |
| `npx prisma validate` | `The schema at prisma\schema.prisma is valid 🚀` | `0` | **PASSED** |
| `npm test` | Выполнены все 5 тестовых файлов (31 + 3 + 5 + 6 + 9 = 54 сценария) | `0` | **PASSED** |
| `npm run build` | `tsc -p tsconfig.build.json` скомпилирован в `dist/` | `0` | **PASSED** |

Фактические логи подтверждают полную работоспособность приложения и отсутствие регрессий.

---

## 3. Проверка работы E2E-тестов с реальной PostgreSQL

В файле `tests/catalog-e2e.test.ts`:
- Инициализация происходит через `createTestApp()` с реальным `AppModule`.
- `AppModule` импортирует `PrismaModule` (`PrismaService`), подключенный к реальной базе данных `lekalo_zhiide` (`localhost:5432`).
- В тестах **отсутствуют mock-объекты Prisma**.
- Выполняются прямые запросы к данным сида (`prisma.size.findMany`, `prisma.height.findMany`, `prisma.format.findMany`), подтверждая наличие в БД реальных записей справочников (8+ размеров, 3+ ростовки, 3+ формата).
- Созданные тестовые сущности (категории, выкройки, варианты) физически записываются в таблицы PostgreSQL и в блоке `finally` удаляются через `prisma.*.deleteMany`.

---

## 4. Проверка RBAC административных маршрутов

В контроллере `CatalogAdminController` (`src/modules/catalog/catalog-admin.controller.ts`):
- Каждый административный маршрут (`categories`, `products`, `products/:id/status`, `products/:id/variants/batch`, `products/:id/images`) в первой же строке вызывает приватный метод:
  ```typescript
  private authenticateAdmin(req: FastifyRequest) {
    this.checkOrigin(req);
    const user = extractAuthUser(req.headers.authorization);
    checkRolePermissions(user.role, [Role.ADMIN, Role.CONTENT_MANAGER]);
    return user;
  }
  ```
- Запросы без заголовка `Authorization` возвращают `401 Unauthorized` с кодом `AUTH_TOKEN_REQUIRED`.
- Запросы от пользователей с ролью `CUSTOMER` возвращают `403 Forbidden` с кодом `INSUFFICIENT_PERMISSIONS`.
- Мутирующие запросы дополнительно защищены проверкой `Origin` от CSRF.

---

## 5. Проверка безопасности публичного API

1. **Защита от утечки ключей хранилища и приватных путей**:
   - Модель `ProductInstruction` содержит поля `s3Bucket`, `s3Key`, `checksumSha256`. В публичном методе `getProductBySlug` эти поля исключены из выборки (`select: { id, title, fileName, version }`), а клиенту возвращается исключительно булев флаг `hasInstruction: boolean`.
   - Таблица цифровых файлов `DigitalFile` (содержащая пути к PDF лекалам в S3) не подключается в публичных запросах каталога и не отдаётся клиенту.
   - В тесте `8. Product detail returns matrix and protects private storage keys` явно проверяется отсутствие строк `s3Bucket`, `s3Key` и `checksumSha256` в сериализованном ответе.

2. **Защита неопубликованных товаров (черновиков)**:
   - В `CatalogService.getProducts` для публичных запросов принудительно действует условие `where.isActive = true`.
   - В `CatalogService.getProductBySlug` и `getProductVariants` выполняется проверка:
     `if (!product || (isPublic && !product.isActive)) throw new NotFoundError("PRODUCT_NOT_FOUND")`.
   - Неопубликованные выкройки (`isActive = false`) недоступны в каталоге и по прямому URL возвращают `404 Not Found`.

---

## 6. Проверка генератора матрицы вариантов на отсутствие дубликатов

- **Уровень схемы БД**: В модели `ProductVariant` задан составной уникальный индекс:
  `@@unique([productId, sizeId, heightId, formatId], name: "product_size_height_format_unique")`, а также уникальный артикул `sku @unique`.
- **Уровень бизнес-логики**: В `CatalogService.batchGenerateVariants`:
  1. Выполняется валидация входных ID размеров, ростов и форматов. Если переданы дубликаты ID, проверка `sizes.length !== dto.sizeIds.length` вызывает ошибку до выполнения операций.
  2. Генерация комбинаций происходит через метод `prisma.productVariant.upsert` с таргетом на `product_size_height_format_unique`.
  3. При повторном вызове с теми же параметрами существующие записи обновляются (`update: { priceOverride, isActive: true }`), а не дублируются.

---

## 7. Причина ошибки `git status` (Exit code 1)

- При вызове `git status` в каталоге `C:\Users\ASUS\.gemini\antigravity\scratch\lekalo-zhiide` Git вернул:
  `fatal: not a git repository (or any of the parent directories): .git` (код завершения `1`).
- Проверка `Test-Path C:\Users\ASUS\.gemini\antigravity\scratch\lekalo-zhiide\.git` вернула `False`.
- **Причина**: Репозиторий Git изначально не инициализировался в папке проекта на предыдущих этапах (TASK-001 — TASK-005.4).
- В соответствии с указанием пользователя настройки не изменялись, и инициализация Git без явного распоряжения не производилась.

---

## 8. Проверка сохранности тестов Auth и Health

- Временные метки файлов подтверждают отсутствие изменений:
  - `tests/auth.test.ts` (длина 35064 байт, без изменений).
  - `tests/health.test.ts` (длина 1686 байт, без изменений).
  - `tests/auth-http.test.ts` (длина 10997 байт, без изменений).
- Все 39 тестов из этих трёх файлов продолжают выполняться в `npm test` и проходят успешно.

---

## 9. Проверка системных процессов и PostgreSQL

- Служба Windows `postgresql-15` имеет статус **`Running`** (порт 5432 слушается процессом PID 9508).
- Порт 4000 свободен (нет активных слушателей; тестовые приложения NestJS закрываются штатно через `app.close()`).
- В диспетчере фоновых задач Antigravity активных задач нет (`No background tasks are currently running`).

---

## 10. Рекомендации и итог

1. Все требования аудита подтверждены: функционал TASK-006 полностью автономен, безопасен, покрыт тестами и работает с реальной PostgreSQL 15.
2. Никаких архитектурных расхождений или уязвимостей безопасности не обнаружено.
3. Проект находится в стабильном состоянии и готов к переходу к следующей задаче (TASK-007) по вашей команде.
