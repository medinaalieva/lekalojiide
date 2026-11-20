# LEKALO ZHIIDE — STAGE 5.23: TEST EXECUTION & REGRESSION REPORT

## 1. Сводка результатов тестирования

В ходе приёмки этапа **Stage 5.23** был разработан специализированный автоматизированный набор тестов [`tests/stage-5-23-instructions.test.ts`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/tests/stage-5-23-instructions.test.ts), а также проведены полные регрессионные прогоны смежных подсистем (хранилище, корзина, оформление заказов, Purchase Guard и целостность бандлов).

| Набор тестов | Всего сценариев | Пройдено | Провалено | Статус |
| :--- | :---: | :---: | :---: | :---: |
| **Stage 5.23 Instructions Suite** (`stage-5-23-instructions.test.ts`) | **12** | **12** | **0** | ✅ **100% PASSED** |
| **Storage Admin API Suite** (`storage-admin.test.ts`) | **28** | **28** | **0** | ✅ **100% PASSED** |
| **Purchase Guard Suite** (`purchase-availability.test.ts`) | **10** | **10** | **0** | ✅ **100% PASSED** |
| **Cart & Orders E2E Suite** (`cart-orders-e2e.test.ts`) | **14** | **14** | **0** | ✅ **100% PASSED** |
| **Purchase Flow Suite** (`stage-5-10-purchase-flow.test.ts`) | **12** | **12** | **0** | ✅ **100% PASSED** |
| **Bundle Integrity Suite** (`stage-5-22-bundle-integrity.test.ts`) | **10** | **10** | **0** | ✅ **100% PASSED** |
| **Backend TypeScript Compilation** (`tsc --noEmit`) | 1 | 1 | 0 | ✅ **0 ошибок** |
| **Frontend TypeScript Compilation** (`tsc --noEmit`) | 1 | 1 | 0 | ✅ **0 ошибок** |
| **ИТОГО** | **88** | **88** | **0** | ✅ **100% PASSED** |

---

## 2. Подробные результаты набора тестов Stage 5.23

Файл тестов: [`tests/stage-5-23-instructions.test.ts`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/tests/stage-5-23-instructions.test.ts)  
Время выполнения: **30,060 ms**  
База данных: `lekalo_test` (Neon Serverless PostgreSQL)

```
TAP version 13
# Subtest: Stage 5.23: Sewing Instructions Upload & Management Verification
    # Subtest: 1. ADMIN can upload a valid PDF instruction (201 Created)
    ok 1 - 1. ADMIN can upload a valid PDF instruction (201 Created)
      ---
      duration_ms: 1812.8368
      ...
    # Subtest: 2. Unauthorized user cannot upload instruction (401 Unauthorized)
    ok 2 - 2. Unauthorized user cannot upload instruction (401 Unauthorized)
      ---
      duration_ms: 12.3789
      ...
    # Subtest: 3. Non-admin user (CUSTOMER) is rejected with 403 Forbidden
    ok 3 - 3. Non-admin user (CUSTOMER) is rejected with 403 Forbidden
      ---
      duration_ms: 22.8465
      ...
    # Subtest: 4. Uploading HTML file disguised as PDF is strictly rejected (400)
    ok 4 - 4. Uploading HTML file disguised as PDF is strictly rejected (400)
      ---
      duration_ms: 18.2394
      ...
    # Subtest: 5. Corrupted or zero-byte PDF is rejected (400)
    ok 5 - 5. Corrupted or zero-byte PDF is rejected (400)
      ---
      duration_ms: 17.5143
      ...
    # Subtest: 6. Subsequent upload creates version 2 and automatically deactivates version 1
    ok 6 - 6. Subsequent upload creates version 2 and automatically deactivates version 1
      ---
      duration_ms: 618.9247
      ...
    # Subtest: 7. Instruction is correctly linked to target product
    ok 7 - 7. Instruction is correctly linked to target product
      ---
      duration_ms: 215.1189
      ...
    # Subtest: 8. Inactive instruction is unavailable for download by customer (404)
    ok 8 - 8. Inactive instruction is unavailable for download by customer (404)
      ---
      duration_ms: 418.3371
      ...
    # Subtest: 9. Customer without active entitlement cannot download active instruction (403)
    ok 9 - 9. Customer without active entitlement cannot download active instruction (403)
      ---
      duration_ms: 446.8831
      ...
    # Subtest: 10. Customer WITH active entitlement successfully gets signed S3 download URL
    ok 10 - 10. Customer WITH active entitlement successfully gets signed S3 download URL
      ---
      duration_ms: 712.4491
      ...
    # Subtest: 11. Customer with entitlement to Product A CANNOT download instruction for Product B (403)
    ok 11 - 11. Customer with entitlement to Product A CANNOT download instruction for Product B (403)
      ---
      duration_ms: 684.1954
      ...
    # Subtest: 12. Deactivation preserves file records and version history without data loss
    ok 12 - 12. Deactivation preserves file records and version history without data loss
      ---
      duration_ms: 384.6295
      ...
    1..12
ok 1 - Stage 5.23: Sewing Instructions Upload & Management Verification
  ---
  duration_ms: 30060.4182
  ...
1..1
# tests 1
# pass 1
# fail 0
```

---

## 3. Матрица проверки сценариев Stage 5.23

| № | Описание тестового сценария | Проверяемый механизм | Ожидаемый результат | Фактический результат |
| :---: | :--- | :--- | :--- | :--- |
| **1** | Загрузка валидного PDF администратором | JWT RBAC, CSRF, `validatePdfBuffer`, S3 PutObject, Prisma Transaction | 201 Created, `version: 1`, `isActive: true`, корректный SHA-256 | ✅ **201 Created, SHA-256 рассчитан** |
| **2** | Загрузка без токена авторизации | `JwtAuthGuard` | 401 Unauthorized | ✅ **401 Unauthorized** |
| **3** | Загрузка пользователем с ролью CUSTOMER | `RolesGuard` | 403 Forbidden | ✅ **403 Forbidden** |
| **4** | Попытка загрузки HTML-файла с расширением `.pdf` | `validatePdfBuffer` (проверка anti-polyglot и сигнатуры `%PDF-`) | 400 Bad Request, код ошибки `INVALID_FILE_TYPE` | ✅ **400 INVALID_FILE_TYPE** |
| **5** | Попытка загрузки пустого или повреждённого PDF | `validatePdfBuffer` (проверка длины буфера $\ge 120$ байт) | 400 Bad Request, код ошибки `EMPTY_FILE` | ✅ **400 EMPTY_FILE** |
| **6** | Повторная загрузка инструкции для того же товара | Автоинкремент версии и атомарное переключение `isActive` | 201 Created, `v2` активна (`isActive: true`), `v1` деактивирована (`isActive: false`) | ✅ **v2 активна, v1 в архиве** |
| **7** | Проверка привязки к товару | Фильтрация в Prisma по `productId` | Инструкция строго принадлежит целевому товару | ✅ **Связь productId подтверждена** |
| **8** | Скачивание неактивной (архивной) инструкции | Проверка `isActive: true` в `CabinetService` | 404 Not Found, код `INSTRUCTION_NOT_FOUND` | ✅ **404 INSTRUCTION_NOT_FOUND** |
| **9** | Скачивание активной инструкции покупателем без права | Проверка `PurchaseEntitlement` со статусом `ACTIVE` | 403 Forbidden, код `FORBIDDEN` | ✅ **403 FORBIDDEN** |
| **10** | Скачивание активной инструкции покупателем с правом | `getSignedUrl` из приватного бакета S3 | 200 OK, presigned URL со сроком жизни 600 секунд | ✅ **200 OK, Signed S3 URL выдан** |
| **11** | Попытка скачать инструкцию к товару B при наличии покупки товара A | Изоляция прав по `productId` | 403 Forbidden | ✅ **403 FORBIDDEN** |
| **12** | Мягкая деактивация через `DELETE /admin/storage/instructions/:id` | Soft delete без физического удаления из базы и хранилища | 200 OK, `isActive: false`, запись в БД и файл в S3 сохранены | ✅ **200 OK, история сохранена** |

---

## 4. Регрессионная верификация смежных систем

### 4.1. Cart & Orders E2E (`cart-orders-e2e.test.ts`)
- **14 из 14 подтестов успешно пройдены** (длительность: 89,247 ms).
- Подтверждена целостность расчёта корзины в валюте KGS, предотвращение дубликатов, проверка привязки вариантов к товарам, заморозка снимков цен (`priceOverride`), атомарная очистка корзины при чекауте и RBAC защита административных маршрутов.

### 4.2. Purchase Flow (`stage-5-10-purchase-flow.test.ts`)
- **12 из 12 подтестов успешно пройдены** (длительность: 97,586 ms).
- **Критический контроль статуса «Пальто Чолпон»**:
  - Все 6 вариантов пальто Чолпон возвращают `isAvailable: false`.
  - Попытка добавления любого из вариантов Чолпон в корзину отклоняется со статусом `400 PATTERN_FILE_NOT_READY`.
  - Попытка чекаута с недоступными товарами блокируется.

### 4.3. Bundle Integrity & ALL Variant (`stage-5-22-bundle-integrity.test.ts`)
- **10 из 10 подтестов успешно пройдены** (длительность: 83,371 ms).
- Подтверждена идемпотентная генерация бандла `ALL`, корректный расчёт цен со скидкой, Purchase Guard блокировка при отсутствии PDF для любого из дочерних размеров, и выдача прав на все размеры при оплате бандла.

---

## 5. Изоляция и чистота тестового окружения
- Все тесты использовали изолированные синтетические префиксы `TEST-INST-...` и случайные UUID.
- В блоках `finally` каждого теста реализована гарантированная очистка всех созданных сущностей (`PurchaseEntitlement`, `OrderItem`, `Order`, `ProductInstruction`, `ProductVariant`, `Product`, `User`).
- Прямая проверка БД `lekalo_test` подтверждает отсутствие зависших или мусорных записей.
- Реальный каталог (23 товара, включая «Пальто оверсайз Чолпон») остался в неизменном состоянии.
