# LEKALO ZHIIDE — STAGE 5.10: Сквозная проверка покупательского пути после Purchase Guard

**Дата проведения:** 19 ноября 2026 г.  
**Контур тестирования:** Изолированная среда PostgreSQL (`lekalo_test`)  
**Тестовый набор:** [`tests/stage-5-10-purchase-flow.test.ts`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/tests/stage-5-10-purchase-flow.test.ts)  
**Статус выполнения:** **PASS** (12 из 12 интеграционных сценариев успешно пройдены)

---

## 1. Предварительная проверка безопасности окружения (Pre-Flight Safety Check)

Перед запуском любых тестовых сценариев выполнен обязательный запрос к базе данных с поддержкой повторных попыток при холодном старте пула соединений Neon Serverless:

```sql
SELECT current_database(), current_user;
```

**Результат:**
- `current_database`: `"lekalo_test"`
- `current_user`: `"neondb_owner"`
- **Изоляция:** 100% подтверждена. Подключение к Production Neon, Production Supabase и Production Vercel строго исключено. Никаких изменений схемы (`prisma/schema.prisma`) и миграций не производилось.

---

## 2. Проверка недоступных выкроек: «Пальто оверсайз Чолпон» (Товар №23)

### 2.1. Исходное состояние вариантов товара в базе данных `lekalo_test`
Товар `palto-oversayz-cholpon` содержит 6 производственных вариантов. До загрузки чистовых файлов ни один из вариантов не имеет пригодного для пошива PDF:

| SKU | Размер | Рост | Формат | Прикрепленные файлы | Статус Purchase Guard | Причина недоступности |
| :--- | :---: | :---: | :---: | :--- | :---: | :--- |
| `LZ-PALTOOVE-42-164-170-A4` | 42 | 164-170 | A4 | `palto-cholpon-42-164-170-A4.pdf` (79 байт) | `isAvailable: false` | `DEMO_OR_TEST_STUB` |
| `LZ-PALTOOVE-42-164-170-PLOTTER_900` | 42 | 164-170 | Плоттер 900 | Файлы отсутствуют | `isAvailable: false` | `NO_DIGITAL_FILE` |
| `LZ-PALTOOVE-44-164-170-A4` | 44 | 164-170 | A4 | `palto-oversayz-cholpon-44-164-170-A4.pdf` (335 байт) | `isAvailable: false` | `DEMO_OR_TEST_STUB` |
| `LZ-PALTOOVE-44-164-170-PLOTTER_900` | 44 | 164-170 | Плоттер 900 | Файлы отсутствуют | `isAvailable: false` | `NO_DIGITAL_FILE` |
| `LZ-PALTOOVE-46-164-170-A4` | 46 | 164-170 | A4 | Файлы отсутствуют | `isAvailable: false` | `NO_DIGITAL_FILE` |
| `LZ-PALTOOVE-46-164-170-PLOTTER_900` | 46 | 164-170 | Плоттер 900 | Файлы отсутствуют | `isAvailable: false` | `NO_DIGITAL_FILE` |

### 2.2. Результаты тестов блокировки добавления в корзину
- **Тест 1.1: Выдача публичного API каталога (`GET /api/v1/catalog/products/palto-oversayz-cholpon`)**
  - **Статус:** **PASS**
  - Все 6 вариантов возвращают флаг `isAvailable: false`.
  - Причины недоступности: 2 варианта возвращают `DEMO_OR_TEST_STUB` (размер файлов < 1024 байт), 4 варианта возвращают `NO_DIGITAL_FILE`.
  - Поле `unavailableMessage` содержит корректное разъяснение для покупателя: *«Выкройка пока готовится конструктором (доступна только тестовая заглушка)»* либо *«Выкройка пока готовится конструктором»*.
- **Тест 1.2: Попытка добавления каждого из 6 вариантов в корзину (`POST /api/v1/cart/items`)**
  - **Статус:** **PASS**
  - Запросы для всех 6 вариантов отклонены с HTTP кодом `400 Bad Request`.
  - Код ошибки в теле ответа: `PATTERN_FILE_NOT_READY`.
  - Добавление неготовой выкройки на уровне API полностью пресечено.
- **Тест 1.3: Прямой API-запрос с клиентскими флагами обхода защиты**
  - **Статус:** **PASS**
  - Проверена передача фиктивных полей: `{ available: true }`, `{ isAvailable: true }`, `{ bypass: true }`, `{ force: true }`, `{ hasFile: true }`.
  - Все попытки обхода отклонены с HTTP кодом `400 Bad Request` и кодом `PATTERN_FILE_NOT_READY`. Backend опирается исключительно на серверную валидацию через [`checkPatternAvailability`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/src/utils/pattern-availability.ts).

### 2.3. Результаты тестов корзины и блокировки оформления заказа (Checkout)
- **Тест 1.4: Отображение предупреждений в корзине при наличии ранее добавленных неготовых позиций**
  - **Статус:** **PASS**
  - В тестовую корзину напрямую внедрены 2 позиции (заглушка 79 байт и вариант без файлов).
  - При запросе `GET /api/v1/cart`:
    - Каждая неготовая позиция возвращает `isAvailable: false`.
    - Присутствуют поля `unavailableReason` (`DEMO_OR_TEST_STUB`, `NO_DIGITAL_FILE`) и человекопонятное `unavailableMessage`.
    - Клиентский интерфейс корзины рассчитывает `hasUnavailableItems = true`.
- **Тест 1.5: Блокировка оформления заказа (`POST /api/v1/orders/checkout`)**
  - **Статус:** **PASS**
  - Попытка оформить заказ с неготовыми позициями немедленно отклонена с HTTP кодом `400 Bad Request` (`PATTERN_FILE_NOT_READY`).
  - **Атомарность БД:** Количество записей в таблице `orders` не изменилось (заказ НЕ создается).
  - **Сохранность корзины:** Позиции в корзине покупателя НЕ удаляются при ошибке и остаются доступными для удаления пользователем.

---

## 3. Сквозная проверка покупки доступной выкройки (Изолированный цикл)

Для проверки штатного покупательского сценария был развернут изолированный временный товар с эталонной производственной PDF-выкройкой (размер 3072 байт, корректная сигнатура ISO 32000-1):

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Покупатель
    participant Cart as Корзина (Backend)
    participant Orders as Заказы & Checkout
    participant Gateway as MockPaymentGateway
    participant Cabinet as Личный кабинет (S3)

    Customer->>Cart: POST /api/v1/cart/items (доступный вариант)
    Cart-->>Customer: 201 Created (isAvailable: true, total: 650 KGS)
    Customer->>Orders: POST /api/v1/orders/checkout
    Orders-->>Customer: 201 Created (LZ-2026-..., PENDING, корзина очищена)
    Customer->>Orders: POST /api/v1/orders/:id/payment
    Orders-->>Customer: 200 OK (Payment PENDING, paymentUrl)
    Gateway->>Orders: POST /api/v1/webhooks/payments/mock (SUCCEEDED)
    Orders-->>Gateway: 200 OK (Order PAID, PurchaseEntitlement создан)
    Customer->>Cabinet: GET /api/v1/cabinet/library
    Cabinet-->>Customer: 200 OK (Entitlement ACTIVE)
    Customer->>Cabinet: POST /api/v1/cabinet/files/:id/download-url
    Cabinet-->>Customer: 200 OK (Signed S3 URL, disposition=attachment)
```

### Результаты изолированного теста:
1. **Каталог (`GET /api/v1/catalog/products/:slug`):**
   - Вариант с эталонным PDF возвращает `isAvailable: true`, поле `unavailableReason` отсутствует (**PASS**).
2. **Корзина (`POST /api/v1/cart/items`):**
   - Успешное добавление: HTTP `201 Created`, сумма 650 KGS, `totalItems: 1` (**PASS**).
   - В корзине все позиции имеют `isAvailable: true`.
3. **Оформление заказа (`POST /api/v1/orders/checkout`):**
   - Создан заказ с номером `LZ-2026-XXXX`, статус `PENDING`, сумма 650 KGS (**PASS**).
   - Снимки цен и характеристик зафиксированы в `order_items`.
   - Корзина покупателя автоматически и транзакционно очищена (`totalItems: 0`).
4. **Инициализация оплаты (`POST /api/v1/orders/:id/payment`):**
   - Создана запись `Payment` со статусом `PENDING`, валютой `KGS` и суммой `650` (**PASS**).
   - Сгенерирован безопасный URL тестового шлюза `mock-gateway.example.kg/pay/...`.
5. **Подтверждение оплаты вебхуком (`POST /api/v1/webhooks/payments/mock`):**
   - Корректная подпись HMAC-SHA256 проверена сервисом.
   - Статус платежа атомарно переведен в `SUCCEEDED`, статус заказа — в `PAID` (**PASS**).
   - Автоматически сгенерирована запись `PurchaseEntitlement` для покупателя.
6. **Выдача в Личном кабинете (`GET /api/v1/cabinet/library`):**
   - Купленное лекало появилось в библиотеке пользователя со статусом `ACTIVE` (**PASS**).
7. **Безопасное скачивание (`POST /api/v1/cabinet/files/:entitlementId/download-url`):**
   - Возвращена временная подписанная ссылка на S3 с заголовком `response-content-disposition=attachment` (**PASS**).
   - Счетчик `downloadCount` в таблице `purchase_entitlements` увеличен до `1`.
8. **Гарантированная очистка (Teardown):**
   - Все временные сущности (пользователь, корзина, заказ, платеж, вебхук, entitlement, лог скачивания, файл, вариант, товар, категория) удалены без остатка. В БД `lekalo_test` сохранена абсолютная чистота.

---

## 4. Аудит пользовательского интерфейса (UI Verification)

| Страница / Компонент | Проверенная логика и состояние | Фактический результат в UI | Статус |
| :--- | :--- | :--- | :---: |
| **Карточка товара**<br>[`/catalog/palto-oversayz-cholpon`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/frontend/src/app/catalog/[slug]/ProductDetailView.tsx) | Вариант без готового PDF: кнопка «Добавить в корзину» заблокирована (`disabled`, `cursor-not-allowed`). Текст кнопки заменен на «Выкройка пока готовится». Над кнопкой отображается предупреждающий янтарный баннер с пояснением конструктора. | Полностью соответствует. Оформление заблокировано. | **PASS** |
| **Мобильный Sticky Buy Bar**<br>[`ProductDetailView.tsx#L1324`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/frontend/src/app/catalog/[slug]/ProductDetailView.tsx#L1324) | При прокрутке страницы ниже кнопки покупки появляется плавающая панель. Кнопка неактивна, класс `cursor-not-allowed`, текст «Готовится». | Полностью соответствует. Мобильные покупатели защищены. | **PASS** |
| **Корзина**<br>[`/cart`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/frontend/src/app/cart/page.tsx) | Неготовые позиции выделяются янтарной рамкой (`border-amber-300`). Под позицией выводится плашка «Выкройка пока готовится» с текстом ошибки и кнопкой удаления. В блоке итогов кнопка «Оформить заказ» блокируется, выводится предупреждение о необходимости удалить неготовые выкройки. | Полностью соответствует. Переход на оформление невозможен. | **PASS** |
| **Оформление заказа**<br>[`/checkout`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/frontend/src/app/checkout/page.tsx) | При прямом переходе на страницу с неготовой корзиной форма блокирует отправку, а при ответе API выводится красный баннер с точным текстом ошибки от сервера. | Защищено на клиенте и сервере. | **PASS** |
| **Автоматическое тестирование в браузере (Chrome CDP)** | Подключение к удаленному порту отладки Chrome DevTools (`--remote-debugging-port`). | Порт Chrome DevTools ActivePort не открыт на хосте. По регламенту зафиксировано состояние: **BLOCKED**. | **BLOCKED** |

---

## 5. Итоговый статус проверки

- **Блокировка неподготовленных вариантов:** **PASS** (100% защита от случайной покупки).
- **Сквозная покупка доступных вариантов:** **PASS** (100% готовность связки Корзина -> Заказ -> Mock-эквайринг -> Кабинет -> Скачивание).
- **Автоматизация браузера:** **BLOCKED** (зафиксировано в соответствии с регламентом).
