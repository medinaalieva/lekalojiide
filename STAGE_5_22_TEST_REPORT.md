# STAGE 5.22: TEST REPORT
## Отчет о тестировании целостности комплектов (ALL / Bundle) и регрессионной проверке

**Проект:** LEKALO ZHIIDE  
**Дата проведения:** 19 ноября 2026 г.  
**Тестовый файл:** `tests/stage-5-22-bundle-integrity.test.ts`  
**База данных:** `lekalo_test` (Neon Serverless PostgreSQL)  
**Изоляция фикстур:** Синтетические префиксы `TEST-BUNDLE-...`, гарантированная очистка в `finally`  
**Итоговый статус:** Все 10 сценариев успешно пройдены (10/10 OK), регрессионный сьют пройден (100% PASS)  

---

## 1. Сводные результаты тестирования комплектов (Bundle Test Suite)

Тест запускался через `npx ts-node tests/stage-5-22-bundle-integrity.test.ts`.

```
TAP version 13
# Subtest: Stage 5.22: Bundle Integrity & ALL Variant Verification
    # Subtest: 1. Generation of ALL for a product with bundle enabled (hasBundleOption = true)
    ok 1 - 1. Generation of ALL for a product with bundle enabled (hasBundleOption = true)
      ---
      duration_ms: 8861.5133
      ...
    # Subtest: 2. Repeated generation without duplicates (idempotency)
    ok 2 - 2. Repeated generation without duplicates (idempotency)
      ---
      duration_ms: 3340.4062
      ...
    # Subtest: 3. Absence of ALL for product without bundle option (hasBundleOption = false)
    ok 3 - 3. Absence of ALL for product without bundle option (hasBundleOption = false)
      ---
      duration_ms: 8410.7486
      ...
    # Subtest: 4. Correct bundle pricing (calculateEffectivePrice)
    ok 4 - 4. Correct bundle pricing (calculateEffectivePrice)
      ---
      duration_ms: 0.6466
      ...
    # Subtest: 5. Rejection of bundle purchase without real PDFs (Purchase Guard)
    ok 5 - 5. Rejection of bundle purchase without real PDFs (Purchase Guard)
      ---
      duration_ms: 4238.7049
      ...
    # Subtest: 6. Adding bundle to cart succeeds when genuine production PDFs are ready
    ok 6 - 6. Adding bundle to cart succeeds when genuine production PDFs are ready
      ---
      duration_ms: 13498.2443
      ...
    # Subtest: 7. Checkout is blocked if any item in cart lacks real PDFs
    ok 7 - 7. Checkout is blocked if any item in cart lacks real PDFs
      ---
      duration_ms: 5240.6274
      ...
    # Subtest: 8. Absence of order on Purchase Guard rejection; cart preserved atomically
    ok 8 - 8. Absence of order on Purchase Guard rejection; cart preserved atomically
      ---
      duration_ms: 4640.1568
      ...
    # Subtest: 9. Correct entitlement issuance for all child sizes in paid bundle
    ok 9 - 9. Correct entitlement issuance for all child sizes in paid bundle
      ---
      duration_ms: 18428.5424
      ...
    # Subtest: 10. Impossibility of getting files not included in the bundle
    ok 10 - 10. Impossibility of getting files not included in the bundle
      ---
      duration_ms: 4828.1175
      ...
    1..10
ok 1 - Stage 5.22: Bundle Integrity & ALL Variant Verification
  ---
  duration_ms: 89222.4481
  ...
1..1
# tests 1
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

---

## 2. Детальный разбор 10 тестовых сценариев

### Сценарий 1: Генерация вариантов ALL для товара с включенным комплектом
- **Цель:** Убедиться, что при вызове `batchGenerateVariants` для товара с `hasBundleOption = true` и `bundlePrice = 1200` автоматически создаются варианты с размером `ALL`.
- **Действие:** Вызов `POST /api/v1/admin/products/:id/variants/batch` с 2 размерами (42, 44), 1 ростом (164-170) и 2 форматами (A4, Плоттер).
- **Результат:** Создано ровно 6 вариантов:
  - 4 одиночных размера (`42-A4`, `42-PLOTTER`, `44-A4`, `44-PLOTTER`);
  - 2 варианта комплекта (`ALL-164-170-A4`, `ALL-164-170-PLOTTER`).
  - Статус: **PASSED**.

### Сценарий 2: Повторная генерация вариантов без дубликатов (идемпотентность)
- **Цель:** Проверить, что повторный вызов пакетной генерации не создает дублирующих записей и не вызывает ошибок уникальности SKU.
- **Действие:** Повторный вызов `POST /api/v1/admin/products/:id/variants/batch` с теми же параметрами.
- **Результат:** Количество вариантов осталось строго равным 6. Все SKU и ID сохранены.
  - Статус: **PASSED**.

### Сценарий 3: Отсутствие ALL для товара без комплекта
- **Цель:** Убедиться, что для обычного товара (`hasBundleOption = false`, `bundlePrice = null`) варианты комплектов не создаются.
- **Действие:** Создание тестового товара без комплекта и генерация вариантов для 2 размеров, 1 роста, 2 форматов.
- **Результат:** Создано ровно 4 варианта. Вариантов с размером `ALL` создано ровно 0.
  - Статус: **PASSED**.

### Сценарий 4: Корректность ценообразования комплекта
- **Цель:** Проверить детерминированность функции `calculateEffectivePrice`.
- **Действие:**
  - Одиночный размер: `basePrice = 300`, `priceOverride = null` → цена `300`.
  - Комплект: `basePrice = 300`, `bundlePrice = 1200`, `size.code = 'ALL'` → цена `1200`.
  - Комплект с переопределенной ценой: `bundlePrice = 1200`, `priceOverride = 1100` → цена `1100`.
- **Результат:** Все проверки цен совпали до копейки.
  - Статус: **PASSED**.

### Сценарий 5: Защита покупки комплекта без реальных PDF (Purchase Guard)
- **Цель:** Убедиться, что добавление комплекта в корзину отклоняется, если у дочерних размеров нет загруженных производственных PDF.
- **Действие:** Вызов `POST /api/v1/cart/items` с `variantId` комплекта `ALL` формата A4.
- **Результат:** Ответ HTTP 400 Bad Request, код ошибки `PATTERN_FILE_NOT_READY`, сообщение: *"Выкройки для данного комплекта ещё готовятся конструктором."*
  - Статус: **PASSED**.

### Сценарий 6: Успешное добавление комплекта в корзину при готовых PDF
- **Цель:** Проверить, что когда конструктор загрузил реальные PDF (>= 1 КБ) для всех дочерних размеров (42 и 44 формата A4), комплект успешно добавляется в корзину.
- **Действие:** Создание `DigitalFile` и `FileVersion` (2048 байт) для размеров 42 и 44. Добавление `ALL` в корзину.
- **Результат:** Ответ HTTP 201 Created. В корзине зафиксирован элемент со стоимостью `1200 сом`.
  - Статус: **PASSED**.

### Сценарий 7: Блокировка чекаута при отсутствии PDF хотя бы у одного размера
- **Цель:** Проверить защиту при оформлении заказа, если после добавления в корзину один из файлов был удален или деактивирован.
- **Действие:** Деактивация `DigitalFile` для размера 44 (`isActive: false`). Попытка создания заказа `POST /api/v1/orders`.
- **Результат:** Ответ HTTP 400 Bad Request, код `PATTERN_FILE_NOT_READY`. Оформление заказа отклонено.
  - Статус: **PASSED**.

### Сценарий 8: Атомарность отказа и сохранение корзины
- **Цель:** Убедиться, что при отклонении чекаута заказ не создается в БД, а корзина пользователя остается нетронутой.
- **Действие:** Проверка базы данных после заблокированного чекаута.
- **Результат:**
  - `orders.findFirst` для покупателя → `null` (заказ не создан).
  - Корзина содержит позицию комплекта в сохранном состоянии.
  - Статус: **PASSED**.

### Сценарий 9: Выдача прав на все размеры комплекта после оплаты
- **Цель:** Проверить, что при успешной оплате комплекта (`payment.succeeded`) покупатель получает `PurchaseEntitlement` на каждый входящий размер.
- **Действие:** Активация файлов размеров 42 и 44, оформление заказа, отправка симуляции успешного платежа через `POST /api/v1/orders/:id/mock-simulate`.
- **Результат:**
  - Заказ переведен в статус `PAID`.
  - В таблице `purchase_entitlements` созданы активные записи для размера 42 и размера 44.
  - Вызов `GET /api/v1/cabinet/library` вернул библиотеку с обоими размерами.
  - Статус: **PASSED**.

### Сценарий 10: Невозможность скачивания файлов, не входящих в комплект
- **Цель:** Проверить защиту от несанкционированного доступа к другим размерам или форматам.
- **Действие:** Попытка получить ссылку на скачивание для формата Плоттер или чужого товара.
- **Результат:** Попытка пресечена: метод `POST /api/v1/cabinet/files/:id/download-url` отклоняет запросы без действующего `PurchaseEntitlement` с HTTP 403 / 404.
  - Статус: **PASSED**.

---

## 3. Регрессионное тестирование смежных модулей

После внесения изменений были выполнены прогоны существующих проверок:

| Тест / Проверка | Команда | Результат | Комментарий |
|---|---|---|---|
| **Purchase Guard E2E** | `npm run test:purchase-guard` | **10 / 10 PASSED** | Все 10 проверок защиты одиночных вариантов и заглушек работают штатно |
| **Catalog E2E** | `npx ts-node tests/catalog-e2e.test.ts` | **9 / 9 PASSED** | Пакетная генерация, категории, фильтры и витрина работают стабильно |
| **Backend TypeScript** | `npx tsc --noEmit` | **0 ОШИБОК** | Полная статическая типобезопасность NestJS/Prisma |
| **Frontend TypeScript** | `npx tsc --noEmit` (Next.js) | **0 ОШИБОК** | Чистая компиляция страниц витрины и компонентов UI |

---

## 4. Итоговая оценка надежности

Все требования Stage 5.22 выполнены на 100%. Комплекты лекал полностью интегрированы в защищенный цикл каталога LEKALO ZHIIDE.
