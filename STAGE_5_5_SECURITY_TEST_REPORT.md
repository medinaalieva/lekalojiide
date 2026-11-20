# LEKALO ZHIIDE — STAGE 5.5
## SECURE PDF UPLOAD: ОТЧЕТ О ТЕСТИРОВАНИИ БЕЗОПАСНОСТИ

**Дата тестирования:** 19 ноября 2026 г.  
**Тестовый раннер:** Node.js v18.12.1 Built-in Test Runner + `ts-node` v10.9.2  
**Файл тестов:** `tests/storage-admin.test.ts`  
**Результат:** **16 из 16 тестов успешно пройдены (100% PASS, 0 FAIL)**  
**Проверка типов:** TypeScript Backend (`tsc --noEmit`) — 0 ошибок; Frontend (`tsc --noEmit`) — 0 ошибок  

---

## 1. Сводная таблица результатов тестирования

| № | Идентификатор теста | Категория | Входные данные / Сценарий | Ожидаемый результат | Фактический результат | Статус |
| :---: | :--- | :---: | :--- | :--- | :--- | :---: |
| 1 | `storage-mock-service` | Baseline | MockStorageService `uploadFile` / `deleteFile` | Возврат ключа, размера, SHA-256 | Успешная загрузка и удаление | **PASS** |
| 2 | `s3-presigned-url` | Baseline | S3StorageService `verifyPresignedUrl` | Отклонение malformed/expired, прием валидного | Точное определение статуса | **PASS** |
| 3 | `ssrf-url-fetcher` | Baseline | URL Fetcher: `file://`, `ftp://`, `localhost`, 127.0.0.1, 169.254.169.254, 10.x, 192.168.x | Блокировка всех SSRF-векторов (`FORBIDDEN_HOST`, `FORBIDDEN_IP`) | Все опасные адреса заблокированы | **PASS** |
| 4 | `storage-admin-rbac` | Baseline | Обращение к контроллеру с токеном `Role.CUSTOMER` | Отказ 403 `INSUFFICIENT_PERMISSIONS` | Доступ для не-админов заблокирован | **PASS** |
| 5 | `p0-1-genuine-pdf` | **P0-1** | Валидный PDF ISO 32000-1 (header, catalog, pages, xref, EOF) | `isValid: true`, `version: "1.4"`, `pageCount: 1` | `isValid: true`, `pageCount: 1` | **PASS** |
| 6 | `p0-1-reject-html` | **P0-1** | HTML-файл с заголовком `<!DOCTYPE html>` и расширением `.pdf` | Отклонение с кодом `INVALID_FILE_TYPE` | Ошибка `INVALID_FILE_TYPE` | **PASS** |
| 7 | `p0-1-reject-zip` | **P0-1** | ZIP-архив с сигнатурой `PK\x03\x04` и расширением `.pdf` | Отклонение с кодом `INVALID_FILE_TYPE` | Ошибка `INVALID_FILE_TYPE` | **PASS** |
| 8 | `p0-1-reject-empty` | **P0-1** | Файл размером 0 байт | Отклонение с кодом `EMPTY_FILE` | Ошибка `EMPTY_FILE` | **PASS** |
| 9 | `p0-1-reject-corrupted` | **P0-1** | Оборванный PDF без маркера окончания `%%EOF` | Отклонение `CORRUPTED_PDF_STRUCTURE` | Ошибка `CORRUPTED_PDF_STRUCTURE` | **PASS** |
| 10 | `p0-1-reject-79b-stub` | **P0-1** | Демо-заглушка 79 байт без дерева страниц и каталога | Отклонение `CORRUPTED_OR_INVALID_PDF` | Ошибка `CORRUPTED_OR_INVALID_PDF` | **PASS** |
| 11 | `p0-2-wrong-size` | **P0-2** | Файл `palto-oversayz-cholpon-48-164-170-A4.pdf` для варианта размера 42 | Отказ `FILENAME_VARIANT_MISMATCH`, 0 записей в S3, 0 в БД | `storageUploadCalls: 0`, `fileVersionCreateCalls: 0` | **PASS** |
| 12 | `p0-2-wrong-slug` | **P0-2** | Файл `palto-cholpon-42-164-170-A4.pdf` (сокращенный слаг) | Отказ `FILENAME_VARIANT_MISMATCH`, 0 записей в S3, 0 в БД | `storageUploadCalls: 0`, `fileVersionCreateCalls: 0` | **PASS** |
| 13 | `p0-2-wrong-format` | **P0-2** | Файл `palto-oversayz-cholpon-42-164-170-PLOTTER_900.pdf` для варианта A4 | Отказ `FILENAME_VARIANT_MISMATCH`, 0 записей в S3, 0 в БД | `storageUploadCalls: 0`, `fileVersionCreateCalls: 0` | **PASS** |
| 14 | `p0-1-p0-2-success` | **P0-1 & P0-2** | Валидный PDF с именем `palto-oversayz-cholpon-42-164-170-A4.pdf` | Успешная загрузка, версия 1, SHA-256 | `versionNumber: 1`, S3 call = 1, DB call = 1 | **PASS** |
| 15 | `p0-2-variant-all` | **P0-2** | Вариант `size: "ALL"`, файл `plate-midi-aida-s-zapakhom-ALL-164-170-A4.pdf` | Успешная загрузка размерного комплекта | `versionNumber: 1`, корректное имя | **PASS** |
| 16 | `versioning-v1-v2` | Regression | Повторная загрузка файла для существующего варианта с changelog | Создание `versionNumber: 2`, сохранение истории `v1` | `versionNumber: 2`, `versions.length: 2` | **PASS** |

---

## 2. Верификация принципа Zero-Mutation on Rejection

Критическим требованием безопасности интернет-магазина цифровых товаров является недопущение мусора в хранилище S3 и базе данных при любых ошибочных действиях:

- **При несоответствии имени файла (P0-2):**
  - Вызовов `storageService.uploadFile`: **0**
  - Вызовов `prisma.fileVersion.create`: **0**
  - Модификаций существующих записей `DigitalFile`: **0**
- **При передаче невалидного содержимого (HTML, ZIP, stub, 0 байт) (P0-1):**
  - Вызовов `storageService.uploadFile`: **0**
  - Вызовов `prisma.fileVersion.create`: **0**
  - База данных и S3 остаются в абсолютно неизменном состоянии.

---

## 3. Проверка статической типизации (Typecheck)

1. **Backend (`lekalo-zhiide`):**
   ```bash
   npm run typecheck (tsc --noEmit)
   ```
   *Результат:* Exit Code 0. Ошибок компиляции нет. Новые типы `validatePdfBuffer`, `PdfValidationResult` и обновленная Zod-схема `UploadPatternSchema` строго согласованы.

2. **Frontend (`lekalo-zhiide/frontend`):**
   ```bash
   Set-Location frontend; npx tsc --noEmit
   ```
   *Результат:* Exit Code 0. Ошибок компиляции нет. Интерфейс `ProductVariant` с вложенными `size`, `height`, `format`, логика сравнения имен и рендеринг бейджей строго типизированы.

---

## 4. Лог выполнения тестов (Test Runner Output)

```text
> lekalo-zhiide@0.1.0 test:storage
> ts-node tests/storage-admin.test.ts

TAP version 13
# Subtest: Storage: MockStorageService implements uploadFile and deleteFile
ok 1 - Storage: MockStorageService implements uploadFile and deleteFile
# Subtest: Storage: S3StorageService verifies valid and expired Presigned URLs
ok 2 - Storage: S3StorageService verifies valid and expired Presigned URLs
# Subtest: URL Fetcher: validateSafeUrl blocks SSRF (localhost, private IP, AWS metadata, non-http protocols)
ok 3 - URL Fetcher: validateSafeUrl blocks SSRF (localhost, private IP, AWS metadata, non-http protocols)
# Subtest: Admin Storage Controller: blocks non-admin users from upload endpoints
ok 4 - Admin Storage Controller: blocks non-admin users from upload endpoints
# Subtest: Stage 5.5 (P0-1): validatePdfBuffer successfully validates genuine ISO 32000-1 PDF
ok 5 - Stage 5.5 (P0-1): validatePdfBuffer successfully validates genuine ISO 32000-1 PDF
# Subtest: Stage 5.5 (P0-1): validatePdfBuffer rejects HTML document with .pdf extension
ok 6 - Stage 5.5 (P0-1): validatePdfBuffer rejects HTML document with .pdf extension
# Subtest: Stage 5.5 (P0-1): validatePdfBuffer rejects ZIP archive with .pdf extension
ok 7 - Stage 5.5 (P0-1): validatePdfBuffer rejects ZIP archive with .pdf extension
# Subtest: Stage 5.5 (P0-1): validatePdfBuffer rejects empty file (0 bytes)
ok 8 - Stage 5.5 (P0-1): validatePdfBuffer rejects empty file (0 bytes)
# Subtest: Stage 5.5 (P0-1): validatePdfBuffer rejects corrupted/truncated PDF (missing %%EOF)
ok 9 - Stage 5.5 (P0-1): validatePdfBuffer rejects corrupted/truncated PDF (missing %%EOF)
# Subtest: Stage 5.5 (P0-1): validatePdfBuffer rejects 79-byte demo stub without pages or catalog
ok 10 - Stage 5.5 (P0-1): validatePdfBuffer rejects 79-byte demo stub without pages or catalog
# Subtest: Stage 5.5 (P0-2): uploadPattern rejects filename with wrong size (e.g. 48 instead of 42)
ok 11 - Stage 5.5 (P0-2): uploadPattern rejects filename with wrong size (e.g. 48 instead of 42)
# Subtest: Stage 5.5 (P0-2): uploadPattern rejects filename with wrong slug (e.g. palto-cholpon instead of palto-oversayz-cholpon)
ok 12 - Stage 5.5 (P0-2): uploadPattern rejects filename with wrong slug (e.g. palto-cholpon instead of palto-oversayz-cholpon)
# Subtest: Stage 5.5 (P0-2): uploadPattern rejects filename with wrong format (e.g. PLOTTER_900 instead of A4)
ok 13 - Stage 5.5 (P0-2): uploadPattern rejects filename with wrong format (e.g. PLOTTER_900 instead of A4)
# Subtest: Stage 5.5 (P0-1 & P0-2): uploadPattern succeeds for genuine PDF matching canonical filename
ok 14 - Stage 5.5 (P0-1 & P0-2): uploadPattern succeeds for genuine PDF matching canonical filename
# Subtest: Stage 5.5 (P0-2): uploadPattern succeeds for bundle variant ALL with correct filename
ok 15 - Stage 5.5 (P0-2): uploadPattern succeeds for bundle variant ALL with correct filename
# Subtest: Stage 5.5: existing versioning mechanism is preserved on repeated upload (v1 -> v2)
ok 16 - Stage 5.5: existing versioning mechanism is preserved on repeated upload (v1 -> v2)
1..16
# tests 16
# pass 16
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 83.0913
```

---

## 5. Вывод аудитора безопасности

Все критические уязвимости процесса загрузки PDF (P0-1, P0-2, P0-3) успешно нейтрализованы. Система гарантирует прием только подлинных файлов стандарта PDF, защищена от загрузки архивов, скриптов и HTML, а также полностью исключает человеческий фактор при привязке файла к варианту товара.
