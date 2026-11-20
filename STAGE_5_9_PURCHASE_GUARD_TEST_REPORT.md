# LEKALO ZHIIDE — STAGE 5.9: ОТЧЕТ О ТЕСТИРОВАНИИ ЗАЩИТЫ ПОКУПКИ (PURCHASE GUARD TEST REPORT)

**Дата тестирования:** 19 ноября 2026 г.  
**Среда:** `lekalo_test` (Neon Serverless PostgreSQL 18.7)  
**Тестовый файл:** [`purchase-availability.test.ts`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/tests/purchase-availability.test.ts)  
**Команда запуска:** `npm run test:purchase-guard`  
**Результат:** **10 из 10 сценариев успешно пройдены (PASS)**  
**Смежные тесты:** 
- `npm run test:storage` — 28/28 PASS (100%)
- `npm run test:cart-orders` — 5 unit + 14 e2e PASS (100%)
- `npm run typecheck` — 0 ошибок (TypeScript backend)
- `frontend tsc --noEmit` — 0 ошибок (TypeScript frontend)

---

## 1. Протокол безопасности окружения

- **Проверка базы данных:**
  Перед запуском набора тестов выполнен SQL-запрос `SELECT current_database() as db`.
  Результат: строго `lekalo_test`.
- **Подключение к Production:** полностью исключено.
- **Хранилище:** Supabase / S3 Production не затрагивались.
- **Миграции schema.prisma:** не проводились. Схема базы данных сохранена в неизменном виде.
- **Секреты и ключи:** не выводились в логи и отчеты.

---

## 2. Матрица покрытия 10 тестовых сценариев Stage 5.9

| № | Сценарий тестирования | Метод / Маршрут | Ожидаемый результат | Фактический результат | Статус |
|---|----------------------|-----------------|---------------------|-----------------------|--------|
| **1** | Вариант без PDF нельзя добавить в корзину | `POST /api/v1/cart/items` | `400 Bad Request`<br/>`PATTERN_FILE_NOT_READY` | `400 Bad Request`<br/>`PATTERN_FILE_NOT_READY` («Выкройка пока готовится...») | **PASS** |
| **2** | Вариант с DEMO PDF (< 1 КБ или "demo") нельзя добавить в корзину | `POST /api/v1/cart/items` | `400 Bad Request`<br/>`PATTERN_FILE_NOT_READY` | `400 Bad Request`<br/>`PATTERN_FILE_NOT_READY` («тестовая заглушка») | **PASS** |
| **3** | Вариант с настоящим PDF (>= 1 КБ) успешно добавляется | `POST /api/v1/cart/items` | `201 Created`<br/>`isAvailable: true` | `201 Created`<br/>позиция добавлена в корзину | **PASS** |
| **4** | Нельзя обновить позицию корзины на недоступный вариант | `PUT /api/v1/cart/items/:id` | `400 Bad Request`<br/>`PATTERN_FILE_NOT_READY` | `400 Bad Request`<br/>исходный вариант сохранен | **PASS** |
| **5** | Checkout блокируется при наличии товара без PDF | `POST /api/v1/orders/checkout` | `400 Bad Request`<br/>`PATTERN_FILE_NOT_READY` | `400 Bad Request`<br/>транзакция откатана | **PASS** |
| **6** | Checkout блокируется, если файл деактивирован после добавления | `POST /api/v1/orders/checkout` | `400 Bad Request`<br/>`PATTERN_FILE_NOT_READY` | `400 Bad Request`<br/>`isAvailable: false` в корзине | **PASS** |
| **7** | Заказ не создается в БД при блокировке | Проверка таблицы `orders` | Количество заказов = 0 | Количество заказов = 0 | **PASS** |
| **8** | Корзина сохраняется атомарно при отказе checkout | `GET /api/v1/cart` | Все позиции сохранены | 2 позиции сохранены в неизменном виде | **PASS** |
| **9** | Наличие PDF у варианта А не открывает покупку варианта Б того же товара | `POST /api/v1/cart/items`<br/>`GET /catalog/products/:slug` | Для Б: 400 и `isAvailable: false`<br/>Для А: 200 и `isAvailable: true` | Вариант Б строго заблокирован;<br/>в каталоге `isAvailable: false` | **PASS** |
| **10** | Прямой API-запрос не может обойти проверку клиентскими флагами | `POST /api/v1/cart/items`<br/>`{ available: true, bypass: true }` | Флаги игнорируются;<br/>`400 PATTERN_FILE_NOT_READY` | Флаги проигнорированы сервером;<br/>`400 PATTERN_FILE_NOT_READY` | **PASS** |

---

## 3. Детальный лог выполнения тестового раннера

```text
TAP version 13
[Nest] 13276  - 19.11.2026, 15:01:24     LOG [NestFactory] Starting Nest application...
[Nest] 13276  - 19.11.2026, 15:01:24     LOG [InstanceLoader] AppModule dependencies initialized +188ms
[Nest] 13276  - 19.11.2026, 15:01:25     LOG [NestApplication] Nest application successfully started +7ms
# Subtest: Stage 5.9: Purchase Guard & PDF Availability Enforcement
    # Subtest: 1. Variant without PDF cannot be added to cart (400 PATTERN_FILE_NOT_READY)
    ok 1 - 1. Variant without PDF cannot be added to cart (400 PATTERN_FILE_NOT_READY)
      ---
      duration_ms: 1906.9084
      ...
    # Subtest: 2. Variant with DEMO stub PDF (< 1KB) cannot be added to cart (400 PATTERN_FILE_NOT_READY)
    ok 2 - 2. Variant with DEMO stub PDF (< 1KB) cannot be added to cart (400 PATTERN_FILE_NOT_READY)
      ---
      duration_ms: 2121.8935
      ...
    # Subtest: 3. Variant with genuine production PDF is successfully added to cart
    ok 3 - 3. Variant with genuine production PDF is successfully added to cart
      ---
      duration_ms: 9632.9946
      ...
    # Subtest: 4. Cannot update cart item to variant without ready PDF
    ok 4 - 4. Cannot update cart item to variant without ready PDF
      ---
      duration_ms: 5264.9123
      ...
    # Subtest: 5. Checkout is blocked if PDF is missing from an item
    ok 5 - 5. Checkout is blocked if PDF is missing from an item
      ---
      duration_ms: 5365.6178
      ...
    # Subtest: 6. Checkout is blocked if file was deactivated after adding to cart
    ok 6 - 6. Checkout is blocked if file was deactivated after adding to cart
      ---
      duration_ms: 16377.2154
      ...
    # Subtest: 7 & 8. Order is not created when blocked; cart is preserved atomically
    ok 7 - 7 & 8. Order is not created when blocked; cart is preserved atomically
      ---
      duration_ms: 4955.1905
      ...
    # Subtest: 9. Having PDF on one variant does not open purchase for other variants
    ok 8 - 9. Having PDF on one variant does not open purchase for other variants
      ---
      duration_ms: 6833.5942
      ...
    # Subtest: 10. Direct API call cannot bypass check by passing client flags
    ok 9 - 10. Direct API call cannot bypass check by passing client flags
      ---
      duration_ms: 1266.0891
      ...
    1..9
ok 1 - Stage 5.9: Purchase Guard & PDF Availability Enforcement
  ---
  duration_ms: 77205.6852
  ...
1..1
# tests 1
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 77213.827
```

---

## 4. Верификация данных товара №23 «Пальто оверсайз Чолпон» в `lekalo_test`

В тестовой базе данных `lekalo_test` для пилотного товара «Пальто оверсайз Чолпон» присутствуют две исторические записи:
1. `palto-cholpon-42-164-170-A4.pdf` — **79 байт**
2. `palto-oversayz-cholpon-44-164-170-A4.pdf` — **335 байт**

Проверка через API `GET /api/v1/catalog/products/palto-oversayz-cholpon`:
- `LZ-PALTOOVE-42-164-170-A4` -> `isAvailable: false`, `reason: DEMO_OR_TEST_STUB`
- `LZ-PALTOOVE-42-164-170-PLOTTER_900` -> `isAvailable: false`, `reason: NO_DIGITAL_FILE`
- `LZ-PALTOOVE-44-164-170-A4` -> `isAvailable: false`, `reason: DEMO_OR_TEST_STUB`
- `LZ-PALTOOVE-44-164-170-PLOTTER_900` -> `isAvailable: false`, `reason: NO_DIGITAL_FILE`
- `LZ-PALTOOVE-46-164-170-A4` -> `isAvailable: false`, `reason: NO_DIGITAL_FILE`
- `LZ-PALTOOVE-46-164-170-PLOTTER_900` -> `isAvailable: false`, `reason: NO_DIGITAL_FILE`

**Вывод:** ни один из вариантов «Пальто Чолпон» не может быть добавлен в корзину или куплен покупателем до тех пор, пока Адилет не загрузит настоящие производственные файлы выкроек. Защита работает безотказно.
