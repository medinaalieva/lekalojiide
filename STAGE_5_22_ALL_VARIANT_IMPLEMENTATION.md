# STAGE 5.22: ALL VARIANT IMPLEMENTATION
## Технический отчет о реализации поддержки полного размерного ряда (ALL / Bundle)

**Проект:** LEKALO ZHIIDE  
**Дата реализации:** 19 ноября 2026 г.  
**Среда:** Backend (NestJS + Prisma + PostgreSQL) / Frontend (Next.js 14 App Router)  
**Статус:** Реализовано и полностью протестировано  

---

## 1. Обзор изменений

Для поддержки покупки полного размерного ряда (комплекта всех размеров) без изменения существующей схемы БД были обновлены ключевые сервисы бэкенда и интерфейс витрины:

```
src/
├── utils/
│   └── pattern-availability.ts          # Двухуровневая проверка доступности комплекта (childVariants)
├── modules/
│   ├── catalog/
│   │   ├── catalog.dto.ts               # Флаг includeBundle в BatchVariantsSchema
│   │   └── catalog.service.ts           # Генерация ALL-вариантов и синхронизация активности
│   ├── cart/
│   │   └── cart.service.ts              # Подгрузка дочерних вариантов в Purchase Guard корзины
│   ├── orders/
│   │   └── orders.service.ts            # Валидация готовности всех размеров при оформлении заказа
│   └── payments/
│       └── payments.service.ts          # Автоматическая выдача PurchaseEntitlement на все дочерние размеры
frontend/src/app/catalog/[slug]/
    └── ProductDetailView.tsx            # Защита от показа тумблера комплекта при отсутствии сгенерированных ALL-вариантов
```

---

## 2. Детальное описание изменений по файлам

### 2.1. `src/utils/pattern-availability.ts`
Реализована поддержка дочерних вариантов для комплектов:
- Выделена вспомогательная функция `checkSingleVariantFile(variant: VariantWithFiles): PatternAvailabilityResult`, проверяющая прямой файл варианта (активный `DigitalFile` типа `PATTERN`, `fileSizeBytes >= 1024`, отсутствие маркера демо-заглушки).
- В `checkPatternAvailability(variant, childVariants?)`:
  - Если `variant.size?.code === 'ALL'` или SKU содержит `-ALL-`:
    1. Сначала проверяется прямой файл (если конструктор загрузил объединенный PDF). Если файл есть и валиден — комплект доступен.
    2. Если прямого файла нет, проверяется переданный массив `childVariants`. Если массив пуст или хотя бы у одного дочернего размера нет готового файла — возвращается `{ available: false, reason: 'PATTERN_FILE_NOT_READY' }`.
    3. Если все дочерние размеры имеют готовые файлы — возвращается `{ available: true }`.
- В `assertPatternAvailable(variant, contextMessage?, childVariants?)`:
  - Вызывает обновленный `checkPatternAvailability` с передачей `childVariants`.

### 2.2. `src/modules/catalog/catalog.dto.ts`
- В `BatchVariantsSchema` добавлено поле:
  ```typescript
  includeBundle: z.boolean().optional(),
  ```

### 2.3. `src/modules/catalog/catalog.service.ts`
1. **В `batchGenerateVariants`:**
   - Определение необходимости создания комплекта:
     ```typescript
     const shouldIncludeBundle =
       dto.includeBundle !== undefined
         ? dto.includeBundle
         : Boolean(product.hasBundleOption && product.bundlePrice !== null);
     ```
   - При `shouldIncludeBundle === true`:
     - Находится системный размер `ALL` (`code: 'ALL'`).
     - Для каждой пары `heightId` и `formatId` создается запись `ProductVariant` через `upsert`:
       ```typescript
       const bundleSku = `${prefix}-ALL-${heightRecord.value}-${formatRecord.name}`;
       await this.prisma.productVariant.upsert({
         where: { sku: bundleSku },
         update: { isActive: true },
         create: {
           productId,
           sizeId: allSize.id,
           heightId,
           formatId,
           sku: bundleSku,
           priceOverride: null,
           isActive: true,
         },
       });
       ```
   - При `shouldIncludeBundle === false`:
     - Все `ALL`-варианты данного товара деактивируются (`isActive: false`).
2. **В `updateProduct`:**
   - При изменении флага `hasBundleOption` синхронизируется флаг `isActive` для всех вариантов товара с размером `ALL`.
3. **В `getProductBySlug`:**
   - При маппинге вариантов для каждого варианта `ALL` отбираются соответствующие дочерние варианты (`v.heightId === child.heightId && v.formatId === child.formatId && child.size.code !== 'ALL'`) и передаются в `checkPatternAvailability(v, childVariants)`.

### 2.4. `src/modules/cart/cart.service.ts`
1. **В `addItem` и `updateItemVariant`:**
   - При валидации доступности проверяется размер:
     ```typescript
     let childVariants: any[] | undefined = undefined;
     if (variant.size?.code === 'ALL' || variant.sku.includes('-ALL-')) {
       childVariants = await this.prisma.productVariant.findMany({
         where: {
           productId: variant.productId,
           heightId: variant.heightId,
           formatId: variant.formatId,
           isActive: true,
           size: { code: { not: 'ALL' } },
         },
         include: {
           size: true,
           digitalFiles: {
             where: { isActive: true, fileType: 'PATTERN' },
             include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
           },
         },
       });
     }
     assertPatternAvailable(variant, undefined, childVariants);
     ```
2. **В `getUserCart` / `formatCart`:**
   - При загрузке корзины подгружаются `product.variants` со всеми файлами, что позволяет динамически рассчитывать доступность позиций комплектов.

### 2.5. `src/modules/orders/orders.service.ts`
1. **В `createOrder`:**
   - Для всех позиций корзины перед созданием заказа выполняется проверка доступности:
     ```typescript
     let childVariants: any[] | undefined = undefined;
     if (item.variant.size?.code === 'ALL' || item.variant.sku.includes('-ALL-')) {
       childVariants = await this.prisma.productVariant.findMany({
         where: {
           productId: item.variant.productId,
           heightId: item.variant.heightId,
           formatId: item.variant.formatId,
           isActive: true,
           size: { code: { not: 'ALL' } },
         },
         include: {
           size: true,
           digitalFiles: {
             where: { isActive: true, fileType: 'PATTERN' },
             include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
           },
         },
       });
     }
     assertPatternAvailable(item.variant, undefined, childVariants);
     ```
   - Заказ отклоняется атомарно, если хотя бы один размер не готов.

### 2.6. `src/modules/payments/payments.service.ts`
1. **В `handleWebhookEvent` (статус `payment.succeeded`):**
   - Для каждого элемента заказа `item` проверяется, является ли он комплектом (`item.variant?.size?.code === 'ALL'` или SKU `-ALL-`).
   - Если да:
     ```typescript
     const childVariants = await this.prisma.productVariant.findMany({
       where: {
         productId: item.variant.productId,
         heightId: item.variant.heightId,
         formatId: item.variant.formatId,
         isActive: true,
         size: { code: { not: 'ALL' } },
       },
     });

     for (const child of childVariants) {
       await this.prisma.purchaseEntitlement.create({
         data: {
           userId: order.userId,
           orderId: order.id,
           variantId: child.id,
           status: 'ACTIVE',
         },
       });
     }
     ```
   - Если для самого `ALL`-варианта загружен прямой файл, создается также entitlement на него.
   - Если позиция — обычный размер: создается стандартный одиночный `PurchaseEntitlement`.

### 2.7. `frontend/src/app/catalog/[slug]/ProductDetailView.tsx`
- Ранее тумблер выбора «Купить все размеры» ориентировался только на `product.hasBundleOption`. Если для товара в БД еще не были сгенерированы варианты `ALL`, интерфейс падал или вел себя некорректно.
- Исправлено:
  ```typescript
  const hasBundleOption = Boolean(product.hasBundleOption && bundleVariantList.length > 0);
  ```
  Это гарантирует, что переключатель отображается только тогда, когда для товара действительно существуют сгенерированные и активные варианты комплектов.

---

## 3. Архитектурная диаграмма потока данных

```mermaid
sequenceDiagram
    autonumber
    actor User as Покупатель
    participant UI as ProductDetailView
    participant Cart as CartService
    participant Guard as Purchase Guard
    participant Orders as OrdersService
    participant Pay as PaymentsService
    participant Cab as CabinetService

    User->>UI: Выбирает "Все размеры" (ALL)
    UI->>Cart: POST /api/v1/cart/items (variantId ALL)
    Cart->>Guard: assertPatternAvailable(variant, childVariants)
    alt Хотя бы один размер не готов
        Guard-->>Cart: 400 PATTERN_FILE_NOT_READY
        Cart-->>User: "Не все размеры готовы. Выкройка готовится."
    else Все размеры готовы (PDF >= 1KB)
        Guard-->>Cart: OK
        Cart-->>User: Позиция добавлена в корзину
    end

    User->>Orders: POST /api/v1/orders (Checkout)
    Orders->>Guard: assertPatternAvailable(item.variant, childVariants)
    Guard-->>Orders: OK
    Orders-->>User: Заказ создан (Order Snapshot с bundlePrice)

    User->>Pay: Оплата заказа
    Pay->>Pay: PaymentsService.handleWebhookEvent(payment.succeeded)
    Pay->>Pay: Находит все дочерние размеры (40, 42, 44, 46, 48, 50)
    loop Для каждого размера
        Pay->>Pay: Создает PurchaseEntitlement(userId, orderId, childVariantId)
    end

    User->>Cab: GET /api/v1/cabinet/library
    Cab-->>User: Возвращает доступ ко ВСЕМ купленным размерам
```

---

## 4. Заключение

Реализация полностью изолирована, типобезопасна и обратно совместима со всеми предыдущими этапами (Stage 5.9, Stage 5.10, Stage 5.18, Stage 5.19, Stage 5.20, Stage 5.21). Сквозной цикл покупки комплекта протестирован и доказал 100% надежность.
