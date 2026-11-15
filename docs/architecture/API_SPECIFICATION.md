# LEKALO ZHIIDE — СПЕЦИФИКАЦИЯ REST API (API SPECIFICATION)

**Версия документа:** 1.2 (Финализирована по итогам аудита TASK-001.3)  
**Статус:** Черновик для согласования с владельцем проекта (Адилет)  
**Дата обновления:** 13 ноября 2026 г.  
**Базовый URL:** `https://api.lekalozhiide.kg/api/v1`  
**Формат данных:** `application/json; charset=utf-8`  
**Базовая валюта расчетов:** KGS (кыргызский сом)  

---

## 1. Общие принципы и коды ответов

### 1.1. Стандартный формат успешного ответа
```json
{
  "success": true,
  "data": { ... },
  "meta": { "timestamp": "2026-11-13T12:00:00Z" }
}
```

### 1.2. Стандартный формат ошибки
```json
{
  "success": false,
  "error": {
    "code": "VARIANT_ALREADY_IN_CART",
    "message": "Выбранный вариант выкройки уже добавлен в корзину",
    "details": null
  },
  "meta": { "timestamp": "2026-11-13T12:00:00Z" }
}
```

### 1.3. Используемые HTTP-статусы
- `200 OK`: Успешный запрос с телом ответа.
- `201 Created`: Ресурс успешно создан.
- `400 Bad Request`: Некорректные параметры запроса.
- `401 Unauthorized`: Требуется авторизация (отсутствует или просрочен токен).
- `403 Forbidden`: Недостаточно прав (роль не соответствует Guard) или доступ к файлу отозван (`ENTITLEMENT_REVOKED`).
- `404 Not Found`: Ресурс не найден.
- `409 Conflict`: Конфликт бизнес-логики (дубликат email, SKU или товара в корзине).
- `422 Unprocessable Entity`: Ошибка валидации DTO.
- `502 Bad Gateway`: Ошибка на стороне внешнего платежного шлюза.
- `500 Internal Server Error`: Непредвиденная ошибка сервера.

---

## 2. Аутентификация, сессии и профиль

### 2.1. `POST /auth/register`
Регистрация нового покупателя.
- **Доступ:** Public
- **Тело запроса:**
  ```json
  {
    "email": "customer@example.kg",
    "password": "SecurePassword123!",
    "firstName": "Айгерим",
    "lastName": "Алиева",
    "phone": "+996555123456"
  }
  ```
- **Ответ (201 Created):**
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "u1a2b3c4-0000-1111-2222-333344445555",
        "email": "customer@example.kg",
        "firstName": "Айгерим",
        "role": "CUSTOMER"
      },
      "accessToken": "eyJhbGciOi..."
    }
  }
  ```
  *(В заголовок `Set-Cookie` выставляется HttpOnly, Secure, `SameSite=Lax` refreshToken)*.
- **Ошибки:** `409 Conflict` (`EMAIL_ALREADY_EXISTS`), `422 Unprocessable Entity` (`WEAK_PASSWORD`, `INVALID_EMAIL`).

### 2.2. `POST /auth/login`
Авторизация по логину и паролю.
- **Доступ:** Public
- **Тело запроса:**
  ```json
  {
    "email": "customer@example.kg",
    "password": "SecurePassword123!"
  }
  ```
- **Ответ (200 OK):** аналогичен ответу регистрации с выдачей `accessToken` и созданием записи в `UserSessions`.
- **Ошибки:** `401 Unauthorized` (`INVALID_CREDENTIALS`), `403 Forbidden` (`ACCOUNT_SUSPENDED`).

### 2.3. `POST /auth/refresh`
Обновление access токена по refresh токену из HttpOnly Cookie (`SameSite=Lax`).
- **Доступ:** Public (по HttpOnly Cookie `refreshToken`)
- **Ответ (200 OK):**
  ```json
  {
    "success": true,
    "data": { "accessToken": "eyJhbGciOi..." }
  }
  ```
- **Ошибки:** `401 Unauthorized` (`SESSION_EXPIRED`, `TOKEN_REVOKED`).

### 2.4. `POST /auth/logout`
Завершение текущей сессии (отзыв токена в `UserSessions`).
- **Доступ:** Authenticated

### 2.5. `GET /auth/sessions`
Просмотр списка активных сессий пользователя.
- **Доступ:** Authenticated
- **Ответ (200 OK):**
  ```json
  {
    "success": true,
    "data": [
      {
        "sessionId": "s1a2-3b4c...",
        "ipAddress": "212.112.96.10",
        "userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)...",
        "isCurrent": true,
        "lastActiveAt": "2026-11-13T12:00:00Z"
      }
    ]
  }
  ```

### 2.6. `DELETE /auth/sessions/:id`
Принудительное завершение конкретной сессии (выход с чужого устройства).
- **Доступ:** Authenticated

### 2.7. `GET /profile` и `PUT /profile`
Получение и обновление данных собственного профиля.
- **Доступ:** Authenticated

### 2.8. `PUT /profile/change-password`
Смена пароля с аннулированием всех сторонних сессий в `UserSessions`.
- **Доступ:** Authenticated

---

## 3. Каталог товаров и фильтрация (Публичный контур)

### 3.1. `GET /catalog/categories`
Дерево категорий каталога.
- **Доступ:** Public

### 3.2. `GET /catalog/filters`
Справочник доступных параметров для фильтрации в каталоге.
- **Доступ:** Public
- **Ответ (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "sizes": [{ "id": "uuid-1", "code": "42", "label": "42 (ОГ 84)" }],
      "heights": [{ "id": "uuid-2", "code": "164-170", "label": "164-170 см" }],
      "formats": [
        { "id": "uuid-3", "code": "A4", "label": "А4 (принтер)" },
        { "id": "uuid-4", "code": "PLOTTER_900", "label": "Плоттер 900 мм" }
      ],
      "difficultyLevels": ["BEGINNER", "INTERMEDIATE", "ADVANCED"]
    }
  }
  ```

### 3.3. `GET /catalog/products`
Список моделей с пагинацией и множественной фильтрацией.
- **Доступ:** Public
- **Query параметры:** `page`, `limit`, `categorySlug`, `sizes` (comma-separated), `heights`, `formats`, `sort` (`newest`, `price_asc`, `price_desc`).
- **Ответ (200 OK):** список товаров с базовой ценой в сомах (KGS) и массивом доступных размеров.

### 3.4. `GET /catalog/products/:slug`
Полная карточка модели с матрицей вариантов и фотогалереей.
- **Доступ:** Public
- **Ответ (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "id": "p1a2b3c4-...",
      "title": "Платье «Zhiide Silk»",
      "slug": "zhiide-silk-dress",
      "basePrice": 450.00,
      "currency": "KGS",
      "difficultyLevel": "INTERMEDIATE",
      "fabricDetails": {
        "consumptionMeters": "1.8 - 2.2 м",
        "recommended": ["Шелк", "Вискоза"]
      },
      "images": [
        { "id": "img-1", "url": "https://cdn.lekalozhiide.kg/silk-1.webp", "isCover": true, "altText": "Вид спереди" },
        { "id": "img-2", "url": "https://cdn.lekalozhiide.kg/silk-2.webp", "isCover": false, "altText": "Вид сзади" }
      ],
      "hasInstruction": true,
      "variants": [
        {
          "variantId": "v1-uuid",
          "sku": "LZ-SILK-44-170-A4",
          "size": { "code": "44", "label": "44" },
          "height": { "code": "164-170", "label": "164-170 см" },
          "format": { "code": "A4", "label": "А4" },
          "price": 450.00,
          "isAvailable": true
        }
      ]
    }
  }
  ```
- **Ошибки:** `404 Not Found` (`PRODUCT_NOT_FOUND`).

---

## 4. Корзина (Cart)

### 4.1. `GET /cart`
Получение корзины (по `X-Guest-Token` или JWT токену).
- **Доступ:** Public / Authenticated

### 4.2. `POST /cart/items`
Добавление варианта выкройки в корзину.
- **Доступ:** Public / Authenticated
- **Тело запроса:** `{ "variantId": "v1-uuid" }`
- **Ответ (201 Created):** обновленная корзина с расчетом суммы в сомах (KGS).
- **Ошибки:** `400 Bad Request` (`VARIANT_INACTIVE`), `409 Conflict` (`VARIANT_ALREADY_IN_CART`).

### 4.3. `DELETE /cart/items/:id`
Удаление позиции из корзины.
- **Доступ:** Public / Authenticated

### 4.4. `POST /cart/merge`
Слияние гостевой корзины при авторизации пользователя.
- **Доступ:** Authenticated
- **Тело запроса:** `{ "guestToken": "gt-abc12345" }`

---

## 5. Заказы, Платежи и Возвраты

### 5.1. `POST /orders/checkout`
Оформление заказа из корзины.
- **Доступ:** Public / Authenticated
- **Тело запроса:**
  ```json
  {
    "customerEmail": "customer@example.kg",
    "customerName": "Айгерим Алиева",
    "customerPhone": "+996555123456",
    "guestToken": "gt-abc12345"
  }
  ```
- **Ответ (201 Created):**
  ```json
  {
    "success": true,
    "data": {
      "orderId": "o1-uuid",
      "orderNumber": "LZ-2026-00042",
      "totalAmount": 450.00,
      "currency": "KGS",
      "status": "PENDING",
      "paymentUrl": "https://gateway.example.kg/pay/contract_12345"
    }
  }
  ```
- **Ошибки:** `422 Unprocessable Entity` (`CART_EMPTY`, `INVALID_CONTACTS`).

### 5.2. `GET /orders/:id`
Получение статуса заказа (для экрана благодарности `/order/success`).
- **Доступ:** Authenticated или по одноразовому токену чекаута.

### 5.3. `POST /orders/:id/retry-payment`
Повторная попытка оплаты того же заказа при неудаче предыдущей транзакции.
- **Доступ:** Authenticated или по email заказа.
- **Ответ (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "paymentId": "p2-uuid",
      "paymentUrl": "https://gateway.example.kg/pay/contract_67890"
    }
  }
  ```

### 5.4. `POST /payments/webhook/:gateway`
Прием серверного уведомления от платежного провайдера Кыргызстана.
- **Доступ:** Public (с проверкой подписи/токена адаптером провайдера)
- **Параметры пути:** `gateway` (`freedompay`, `mbank`, `demir`, и т.д.).
- **Поведение:** немедленное логирование в `PaymentWebhookEvents`, идемпотентная обработка в транзакции.
- **Ответ (200 OK):** `{ "received": true }`
- **Ошибки:** `401 Unauthorized` (`SIGNATURE_VERIFICATION_FAILED`).

### 5.5. `GET /payments/:id/status`
Активный запрос статуса платежа через API банка (для сверки).
- **Доступ:** Authenticated

### 5.6. `POST /admin/payments/:id/refund`
Полный или точечный частичный возврат средств по платежу.
- **Доступ:** `ADMIN`
- **Тело запроса (Частичный возврат с точечным отзывом прав):**
  ```json
  {
    "refundType": "PARTIAL",
    "reason": "Покупатель ошибся с размером одного из изделий",
    "items": [
      {
        "orderItemId": "oi-uuid-1",
        "amount": 450.00
      }
    ]
  }
  ```
- **Тело запроса (Полный возврат заказа):**
  ```json
  {
    "refundType": "FULL",
    "reason": "Запрос клиента на полный возврат"
  }
  ```
- **Ответ (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "refundId": "ref-uuid-1",
      "status": "SUCCEEDED",
      "amount": 450.00,
      "currency": "KGS",
      "revokedEntitlementIds": ["e1-uuid"]
    }
  }
  ```
- **Ошибки:** `400 Bad Request` (`REFUND_EXCEEDS_PAYMENT`), `502 Bad Gateway` (`GATEWAY_REFUND_ERROR`).

---

## 6. Личный кабинет, библиотека и скачивание

### 6.1. `GET /cabinet/library`
Получение списка купленных выкроек пользователя.
- **Доступ:** Authenticated (`CUSTOMER`)
- **Ответ (200 OK):**
  ```json
  {
    "success": true,
    "data": [
      {
        "entitlementId": "e1-uuid",
        "variantId": "v1-uuid",
        "status": "ACTIVE",
        "productTitle": "Платье «Zhiide Silk»",
        "size": "44",
        "height": "164-170",
        "format": "A4",
        "coverUrl": "https://cdn.lekalozhiide.kg/silk-1.webp",
        "instructionId": "inst-1-uuid",
        "currentVersion": 2,
        "changelog": "Исправлена метка проймы рукава",
        "downloadCount": 1
      }
    ]
  }
  ```

### 6.2. `POST /cabinet/files/:entitlementId/download-url`
Получение временной подписанной ссылки на скачивание выкройки.
- **Доступ:** Authenticated (`CUSTOMER`)
- **Тело запроса (опционально):**
  ```json
  {
    "fileType": "PATTERN",
    "versionNumber": 2
  }
  ```
- **Ответ (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "downloadUrl": "https://storage.lekalozhiide.kg/private-patterns/...signed...",
      "expiresInSeconds": 600,
      "fileName": "Lekalo_Zhiide_Silk_Dress_44_170_A4_v2.pdf"
    }
  }
  ```
- **Поведение:** фиксирует скачивание в `DownloadLogs`, инкрементирует счетчик.
- **Ошибки:** `403 Forbidden` (`ENTITLEMENT_REVOKED`, `RATE_LIMIT_EXCEEDED`), `404 Not Found`.

### 6.3. `GET /cabinet/instructions/:instructionId/download-url`
Получение ссылки на скачивание общей инструкции по пошиву модели.
- **Доступ:** Authenticated (проверяется покупка любого варианта данной модели).

---

## 7. Административная панель (Admin Endpoints)

### 7.1. Управление каталогом и медиа
- `POST /admin/categories`: Создание категории (`CONTENT_MANAGER`, `ADMIN`).
- `PUT /admin/categories/:id`: Редактирование категории.
- `POST /admin/products`: Создание карточки товара.
- `PUT /admin/products/:id`: Обновление описания, цен и свойств.
- `POST /admin/products/:id/images`: Добавление фотографий в галерею модели (`ProductImages`).
- `DELETE /admin/products/:id/images/:imageId`: Удаление фото.
- `POST /admin/products/:id/instructions/upload-url`: Получение Presigned PUT для загрузки инструкции.

### 7.2. Управление вариантами и загрузка файлов
- `POST /admin/products/:id/variants/batch`:
  **Матричный генератор вариантов**. Пакетная генерация вариантов по массивам ID размеров, ростовок и форматов.
- `POST /admin/files/upload-url`:
  Получение Presigned PUT ссылки для прямой защищенной загрузки PDF-выкройки в S3:
  ```json
  {
    "variantId": "v1-uuid",
    "fileType": "PATTERN",
    "fileName": "dress_silk_44_170_a4.pdf",
    "fileSizeBytes": 4500000,
    "mimeType": "application/pdf"
  }
  ```
- `POST /admin/files/:fileId/versions`:
  Регистрация новой версии файла (v2, v3) после загрузки в S3 с описанием внесенных изменений (`changelog`).

### 7.3. Управление заказами, пользователями и аудит
- `GET /admin/orders`: Список заказов с фильтрами по статусам (`PENDING`, `PAID`, `PARTIALLY_REFUNDED`, `REFUNDED`), email и датам.
- `GET /admin/orders/:id`: Детальный просмотр заказа с историей транзакций, строк возвратов и снимков позиций.
- `GET /admin/users`: Список зарегистрированных пользователей.
- `PUT /admin/users/:id/role`: Назначение ролей (`CUSTOMER`, `CONTENT_MANAGER`, `ADMIN`).
- `PUT /admin/users/:id/status`: Блокировка/активация аккаунта.
- `GET /admin/audit-logs`: Просмотр системного журнала действий персонала (`AuditLogs`).
- `GET /admin/webhook-events`: Просмотр входящих вебхуков платежей с возможностью ручного повтора (`retry`).
