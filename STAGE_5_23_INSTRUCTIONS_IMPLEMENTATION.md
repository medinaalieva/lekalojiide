# LEKALO ZHIIDE — STAGE 5.23: TECHNICAL IMPLEMENTATION REPORT

## 1. Введение

В рамках этапа **Stage 5.23** разработан и внедрён программный комплекс для сквозного управления инструкциями по пошиву (**ProductInstruction**) в административной панели и клиентском кабинете.

Реализация выполнена без проведения деструктивных миграций базы данных (использована существующая модель Prisma), с соблюдением требований безопасности (CSRF-защита, RBAC, валидация сигнатуры PDF, SHA-256 хеширование) и изоляции приватного S3-хранилища.

---

## 2. Модификации Backend

### 2.1. Контроллер управления хранилищем ([`StorageAdminController`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/src/modules/storage/storage-admin.controller.ts))

В контроллер добавлены 5 новых административных маршрутов и расширен существующий метод получения карточки товара:

```typescript
// Схема валидации входящего DTO для загрузки инструкции
const UploadInstructionSchema = z.object({
  productId: z.string().uuid(),
  title: z.string().min(1).default("Инструкция по пошиву"),
  fileBase64: z.string().min(1, "PDF file content in base64 is required"),
  fileName: z.string().min(1),
  contentType: z.literal("application/pdf"),
  url: z.string().optional(),
});
```

#### Реализованные эндпоинты:

1. **`POST /api/v1/admin/storage/upload-instruction`**:
   - Авторизация: `Roles(Role.ADMIN)`, `JwtAuthGuard`, `RolesGuard`.
   - Защита CSRF: проверка совпадения заголовка `Origin` с доверенными хостами (`validateOrigin`).
   - Валидация буфера: вызов [`validatePdfBuffer(buffer)`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/src/modules/storage/storage-admin.controller.ts#L43-L75). Проверяются magic-bytes `%PDF-`, минимальный размер 120 байт, отсутствие тегов HTML/JS и бинарных заголовков исполняемых файлов (MZ, ELF, ZIP).
   - Расчёт контрольной суммы: `crypto.createHash("sha256").update(buffer).digest("hex")`.
   - Автоинкремент версии: поиск последней версии для данного `productId` (`orderBy: { version: "desc" }`). Новая версия: `version = latest ? latest.version + 1 : 1`.
   - Атомарное сохранение в транзакции: все предшествующие инструкции товара переводятся в статус `isActive = false`, после чего создаётся новая запись с `isActive = true`.
   - Сохранение в S3: приватный бакет `pattern-files`, канонический ключ:
     ```
     instructions/${productId}/${timestamp}-v${version}-${safeName}.pdf
     ```
   - Сериализация: поле `fileSizeBytes` конвертируется из `BigInt` в `Number(instruction.fileSizeBytes)` во избежание сбоя сериализации JSON.

2. **`GET /api/v1/admin/storage/products/:productId/instructions`**:
   - Возвращает полный список версий инструкций для указанного товара (активных и архивных), отсортированных по `version: "desc"`.
   - Корректно преобразует `BigInt` поля `fileSizeBytes` в число.

3. **`PATCH /api/v1/admin/storage/instructions/:instructionId/toggle-active`**:
   - Переключает булевый флаг `isActive` для указанной инструкции.
   - Позволяет администратору временно отключить отображение инструкции покупателям без удаления файла.

4. **`GET /api/v1/admin/storage/instructions/:instructionId/download-test`**:
   - Генерирует для администратора проверочный presigned URL со сроком жизни 300 секунд для тестирования скачивания загруженного PDF непосредственно из Admin UI.

5. **`DELETE /api/v1/admin/storage/instructions/:instructionId`**:
   - Безопасная мягкая деактивация: выставляет `isActive = false`. Физический файл в S3 и запись в БД сохраняются для аудита и обеспечения прав ранее купивших пользователей.

6. **Расширение `GET /api/v1/admin/storage/products/:productId`**:
   - В запрос Prisma включена связь `instructions: { orderBy: { version: "desc" } }`.
   - Добавлен маппинг `fileSizeBytes: Number(inst.fileSizeBytes)` для всех привязанных инструкций.

---

## 3. Модификации Frontend

### 3.1. Типизация данных ([`frontend/src/types/index.ts`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/frontend/src/types/index.ts#L38-L51))

Обновлён интерфейс `ProductInstruction` в соответствии с серверной моделью:

```typescript
export interface ProductInstruction {
  id: string;
  productId: string;
  title: string;
  s3Bucket: string;
  s3Key: string;
  fileName: string;
  fileSizeBytes: number;
  checksumSha256: string;
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### 3.2. Административная страница управления файлами ([`frontend/src/app/admin/products/[id]/files/page.tsx`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/frontend/src/app/admin/products/[id]/files/page.tsx))

1. **Добавление 3-й вкладки «Инструкции»**:
   - Кнопка таба оснащена иконкой `BookOpen` и бейджем с количеством загруженных версий инструкций (`instructions.length`).
2. **Карточка текущей активной инструкции**:
   - Отображает номер версии (`v1`, `v2`), название, дату загрузки, размер в килобайтах, полный хеш SHA-256.
   - Содержит быструю кнопку **«Проверить скачивание (PDF)»**, открывающую presigned URL в новой вкладке браузера.
3. **Форма безопасной загрузки**:
   - Поле ввода названия инструкции (по умолчанию «Инструкция по пошиву»).
   - Инпут выбора файла с валидацией расширения (`.pdf`) и размера ($\le 50\text{ MB}$).
   - Асинхронное чтение файла в Base64 через `FileReader`.
   - Защита от повторных нажатий и индикатор загрузки (`Загрузка инструкции...`).
4. **История версий (таблица версий)**:
   - Отображает все когда-либо загруженные версии: номер версии, название, имя файла, размер, контрольную сумму, дату загрузки.
   - Статусные бейджи: зеленый `✓ Активна` или нейтральный `Архив`.
   - Кнопки управления для каждой строки: «Тест ссылки», «Включить / Отключить», «Деактивировать».

### 3.3. Личный кабинет покупателя ([`frontend/src/app/cabinet/library/page.tsx`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/frontend/src/app/cabinet/library/page.tsx))

1. **Информативное отображение отсутствия инструкции**:
   - Если товар куплен, но активная инструкция ещё не загружена (`!instructionId`), карточка больше не остаётся пустой.
   - Отображается информативный серый блок с иконкой `Clock` и текстом:
     > **Инструкция по пошиву готовится**  
     > Файл будет доступен для скачивания сразу после публикации конструктором.
2. **Кнопка скачивания**:
   - При наличии активной инструкции (`instructionId`) отображается заметная кнопка «Скачать инструкцию (PDF)», запрашивающая безопасный presigned URL у `/api/v1/cabinet/instructions/:id/download-url`.

---

## 4. Схема потоков данных при загрузке и скачивании

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Администратор (Адилет)
    participant AdminUI as Admin Frontend
    participant Nest as NestJS Backend
    participant S3 as MinIO / AWS S3
    participant DB as PostgreSQL (lekalo_test)
    actor Customer as Покупатель
    participant CabUI as Customer Frontend

    Note over Admin,DB: Сценарий: Загрузка новой версии инструкции
    Admin->>AdminUI: Выбирает PDF "instruktsiya-cholpon.pdf"
    AdminUI->>Nest: POST /api/v1/admin/storage/upload-instruction (Base64)
    Nest->>Nest: Проверка JWT (ADMIN) & CSRF Origin
    Nest->>Nest: validatePdfBuffer: %PDF- сигнатура, size >= 120, anti-HTML
    Nest->>Nest: crypto.createHash('sha256')
    Nest->>DB: Поиск последней версии для productId
    DB-->>Nest: latest.version = 1
    Nest->>S3: PutObject(bucket='pattern-files', key='instructions/.../v2-instruktsiya.pdf')
    S3-->>Nest: 200 OK (ETag)
    Nest->>DB: Transaction: UPDATE v1 SET isActive=false; INSERT v2 (isActive=true)
    DB-->>Nest: OK
    Nest-->>AdminUI: 201 Created (v2 JSON с Number(fileSizeBytes))
    AdminUI-->>Admin: Успешное уведомление + обновление таблицы версий

    Note over Customer,DB: Сценарий: Скачивание инструкции покупателем
    Customer->>CabUI: Нажимает "Скачать инструкцию (PDF)"
    CabUI->>Nest: GET /api/v1/cabinet/instructions/:id/download-url
    Nest->>Nest: Проверка JWT (CUSTOMER)
    Nest->>DB: Проверка PurchaseEntitlement(userId, variant.productId, status=ACTIVE)
    DB-->>Nest: Entitlement подтверждён
    Nest->>S3: GeneratePresignedGetUrl(key, TTL=600s, filename)
    S3-->>Nest: Signed URL (X-Amz-Signature / signature)
    Nest-->>CabUI: 200 OK { downloadUrl: "https://..." }
    CabUI->>Customer: Браузер скачивает PDF файл
```

---

## 5. Итог реализации
Все компоненты успешно интегрированы в рабочую среду. Серверная компиляция TypeScript не выявила ошибок (`0 errors`), маршрутизация в Fastify зарегистрирована штатно, фоновые демоны работают стабильно на портах 4000 (Backend) и 3000 (Frontend).
