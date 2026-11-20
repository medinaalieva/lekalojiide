# LEKALO ZHIIDE — STAGE 5.25
## ТЕХНИЧЕСКАЯ ДОКУМЕНТАЦИЯ РЕАЛИЗАЦИИ ДИФФЕРЕНЦИАЛЬНОГО ЦЕНООБРАЗОВАНИЯ

**Проект:** LEKALO ZHIIDE  
**Этап:** Stage 5.25 — Per-Format Differential Pricing  
**База данных:** `lekalo_test`  
**Статус:** Внедрено, протестировано и верифицировано  

---

## 1. Обзор изменений

В рамках этапа Stage 5.25 реализована поддержка назначения различных цен на одну и ту же выкройку в зависимости от формата (например, А4 — 350 сом, Плоттер 900 мм — 450 сом, полный размерный ряд — 1200 сом) с сохранением обратной совместимости, целостности корзины и неизменности ранее оформленных заказов.

---

## 2. Модификация расчетного модуля (`src/utils/pricing.ts`)

Функция [`calculateEffectivePrice`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/src/utils/pricing.ts) доработана для строгой валидации оверрайда цены:

```typescript
// Проверка явного переопределения цены для конкретного варианта (Stage 5.25)
if (options?.priceOverride !== undefined && options?.priceOverride !== null) {
  const overridePrice = Number(options.priceOverride);
  if (!isNaN(overridePrice) && overridePrice > 0) {
    return {
      originalPrice: overridePrice,
      currentPrice: overridePrice,
      isDiscountActive: false,
      discountPercent: null,
      discountUntil: null,
      isBundle: false,
      savingsAmount: 0,
    };
  }
}
```

---

## 3. Схемы валидации DTO (`src/modules/catalog/catalog.dto.ts`)

Добавлены строгие Zod-схемы валидации:

1. [`UpdateVariantPriceSchema`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/src/modules/catalog/catalog.dto.ts#L154):
   - Принимает `price` или `priceOverride` как строго положительное число (`> 0`) либо `null` (для сброса к базовой цене).
   - Запрещает отрицательные числа, нули и пустые объекты.

2. [`UpdateFormatPricesSchema`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/src/modules/catalog/catalog.dto.ts#L168):
   - Принимает `formatId` (UUID) или `formatCode` (строка).
   - Принимает `price` как положительное число или `null`.

3. [`BatchVariantsSchema`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/src/modules/catalog/catalog.dto.ts#L140):
   - Расширен опциональным полем `formatPrices?: Record<string, number | null>`.

---

## 4. Сервисный слой каталога (`src/modules/catalog/catalog.service.ts`)

В [`CatalogService`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/src/modules/catalog/catalog.service.ts) внесены следующие изменения:

1. **`getProductVariants`**:
   - Загружает `bundlePrice`, `discountPrice`, `discountUntil`, `basePrice`.
   - Для каждого варианта вызывает `calculateEffectivePrice(product, { isBundleVariant, priceOverride })`.
   - Возвращает `price`, `originalPrice`, `priceOverride`, `isPriceOverridden`.

2. **`getProductBySlug`**:
   - Включает `priceOverride: v.priceOverride !== null ? Number(v.priceOverride) : null` и флаг `isPriceOverridden`.

3. **`batchGenerateVariants`**:
   - Добавлена поддержка `dto.formatPrices`.
   - Устранено затирание существующих `priceOverride` при повторной генерации без указания цен.

4. **Метод `updateVariantPrice`**:
   - Проверяет существование товара и варианта.
   - Валидирует `price > 0` (или `null`).
   - Обновляет `ProductVariant.priceOverride`.
   - Возвращает обновленную цену и статус переопределения.

5. **Метод `updateFormatPrices`**:
   - Находит формат по `id` или `code`.
   - Массово обновляет `priceOverride` для всех вариантов товара с указанным `formatId`.
   - Возвращает количество обновленных вариантов.

---

## 5. Административные контроллеры

1. **[`CatalogAdminController`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/src/modules/catalog/catalog-admin.controller.ts)**:
   - `PATCH /api/v1/admin/products/:productId/variants/:variantId/price` — установка/сброс цены конкретного варианта.
   - `PATCH /api/v1/admin/products/:productId/variants/prices-by-format` — массовое назначение цен для всех размеров формата.
   - Оба защищены `authenticateAdmin` (JWT + роли ADMIN/CONTENT_MANAGER) и `checkOrigin` (CSRF Guard).

2. **[`StorageAdminController`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/src/modules/storage/storage-admin.controller.ts)**:
   - В `getProductStorageDetails` добавлена нормализация `priceOverride` в числовой формат `number | null` и булев флаг `isPriceOverridden`.

---

## 6. Пользовательский интерфейс админ-панели (`files/page.tsx`)

В странице управления файлами товара ([`files/page.tsx`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/frontend/src/app/admin/products/[id]/files/page.tsx)):

1. В таблицу вариантов добавлена колонка **«Цена»**:
   - Отображает текущую цену в сомах (`350 сом`, `450 сом`).
   - Бейдж <span style="color:#047857;background:#ecfdf5;border:1px solid #a7f3d0;padding:2px 6px;border-radius:3px;font-size:10px;">Индивидуальная</span> при наличии `priceOverride`.
   - Бейдж <span style="color:#6b7280;background:#f3f4f6;border:1px solid #e5e7eb;padding:2px 6px;border-radius:3px;font-size:10px;">Базовая (наследуется)</span> при наследовании цены выкройки.

2. В тулбар над таблицей добавлена кнопка **«Цены по форматам»**:
   - Открывает модальное окно выбора формата (А4, Плоттер 900 и др.) и ввода единой цены для всех размеров этого формата.
   - Содержит кнопку «Сбросить к базовой».

3. В строку каждого варианта добавлена кнопка **«Цена»** (иконка карандаша):
   - Открывает быстрое модальное окно изменения цены конкретного размера и формата.
   - Позволяет изменить цену или нажать «Сбросить к базовой».

---

## 7. Публичная витрина (`ProductDetailView.tsx`)

В карточке товара ([`ProductDetailView.tsx`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/frontend/src/app/catalog/[slug]/ProductDetailView.tsx)):

1. Кнопки выбора формата теперь наглядно отображают стоимость формата в реальном времени:
   - Например: **А4** — `350 сом`, **Плоттер 900** — `450 сом`.
2. При переключении формата цена в блоке покупки динамически обновляется на актуальную без задержек и устаревшего состояния.
3. Purchase Guard сохраняет полную строгость: если PDF для выбранного формата не загружен, кнопка покупки надежно заблокирована независимо от цены.
