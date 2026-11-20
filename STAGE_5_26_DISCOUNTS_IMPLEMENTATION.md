# LEKALO ZHIIDE — STAGE 5.26: DISCOUNT SCHEDULING & MARKETING PRICING IMPLEMENTATION

**Дата реализации:** 20 ноября 2026 г.  
**Среда выполнения:** `lekalo_test` (Neon PostgreSQL)  
**Компоненты:** База данных, Prisma ORM, Backend NestJS, DTO Zod, Admin Next.js UI, Storefront.

---

## 1. Обзор изменений

В рамках этапа Stage 5.26 разработана и внедрена комплексная система планирования скидок и маркетинговых цен.

### Ключевые возможности:
1. **Календарное планирование акций:** Задание даты и времени старта (`discountFrom`) и окончания (`discountUntil`).
2. **Динамический 4-фазный статус:** `PLANNED` (Запланирована), `ACTIVE` (Действует), `EXPIRED` (Завершена), `NONE` (Не задана).
3. **Строгая иерархия ценообразования:**
   - **Приоритет 1 (высший):** Индивидуальный `priceOverride` варианта выкройки.
   - **Приоритет 2:** Цена комплекта `ALL` (`bundlePrice`).
   - **Приоритет 3:** Действующая акционная цена товара (`discountPrice`).
   - **Приоритет 4 (базовый):** Базовая цена товара (`basePrice`).
4. **Неизменность истории заказов:** Фиксация цены в `OrderItem.priceAtPurchase` гарантирует, что изменение или отмена скидок в будущем не влияет на прошлые заказы.
5. **Административный интерфейс:** Интеграция бейджей статуса, расчёта процента скидки, полей даты/времени и быстрой отмены скидки в `/admin/products/[id]/edit` и `/admin/products/new`.

---

## 2. Изменения в схеме данных и Prisma

### 2.1. Добавление колонки в БД
```sql
-- prisma/migrations/stage_5_26_discount_from.sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS discount_from TIMESTAMPTZ;
```

### 2.2. Обновление Prisma Schema ([schema.prisma](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/prisma/schema.prisma))
```prisma
model Product {
  id                  String           @id @default(uuid()) @db.Uuid
  title               String           @db.VarChar(255)
  slug                String           @unique @db.VarChar(255)
  description         String           @db.Text
  shortDescription    String?          @map("short_description") @db.VarChar(500)
  basePrice           Decimal          @map("base_price") @db.Decimal(10, 2)
  bundlePrice         Decimal?         @map("bundle_price") @db.Decimal(10, 2)
  hasBundleOption     Boolean          @default(true) @map("has_bundle_option")
  discountPrice       Decimal?         @map("discount_price") @db.Decimal(10, 2)
  discountFrom        DateTime?        @map("discount_from") @db.Timestamptz
  discountUntil       DateTime?        @map("discount_until") @db.Timestamptz
  ...
}
```

---

## 3. Ядро ценообразования ([src/utils/pricing.ts](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/src/utils/pricing.ts))

Функция `calculateEffectivePrice` осуществляет централизованный и чистый расчёт эффективной стоимости:

```typescript
export type DiscountStatus = "PLANNED" | "ACTIVE" | "EXPIRED" | "NONE";

export interface PricingInput {
  basePrice: Prisma.Decimal | number | string;
  discountPrice?: Prisma.Decimal | number | string | null;
  discountFrom?: Date | string | null;
  discountUntil?: Date | string | null;
  bundlePrice?: Prisma.Decimal | number | string | null;
}

export interface PricingResult {
  currentPrice: number;
  originalPrice: number;
  isDiscountActive: boolean;
  discountPercent: number | null;
  discountFrom: string | null;
  discountUntil: string | null;
  discountStatus: DiscountStatus;
  isBundle: boolean;
}
```

### Алгоритм расчёта:
- Если задан `options.priceOverride > 0` $\rightarrow$ `currentPrice = priceOverride`, `isDiscountActive = false`, `discountStatus = "NONE"`.
- Если вариант является комплектом `ALL` $\rightarrow$ `currentPrice = bundlePrice || basePrice`, `isDiscountActive = false`, `discountStatus = "NONE"`.
- Если задана скидка `0 < discountPrice < basePrice`:
  - Если `discountFrom` задан и `now < discountFrom` $\rightarrow$ `discountStatus = "PLANNED"`, `currentPrice = basePrice`, `isDiscountActive = false`.
  - Если `discountUntil` задан и `now >= discountUntil` $\rightarrow$ `discountStatus = "EXPIRED"`, `currentPrice = basePrice`, `isDiscountActive = false`.
  - Иначе $\rightarrow$ `discountStatus = "ACTIVE"`, `currentPrice = discountPrice`, `isDiscountActive = true`.

---

## 4. DTO и валидация ([src/modules/catalog/catalog.dto.ts](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/src/modules/catalog/catalog.dto.ts))

Добавлены схемы строгой проверки:
- `CreateProductSchema`: проверка `discountFrom <= discountUntil` и `discountPrice < basePrice`.
- `UpdateProductSchema`: проверка `discountFrom <= discountUntil` и `discountPrice < basePrice`.
- `UpdateProductDiscountSchema`: выделенная схема для обновления/отмены скидки:
  ```typescript
  export const UpdateProductDiscountSchema = z
    .object({
      discountPrice: z.number().positive({ message: "Цена должна быть больше 0" }).nullable(),
      discountFrom: z.string().datetime({ offset: true }).optional().nullable(),
      discountUntil: z.string().datetime({ offset: true }).optional().nullable(),
    })
    .refine((data) => {
      if (data.discountFrom && data.discountUntil) {
        return new Date(data.discountFrom) <= new Date(data.discountUntil);
      }
      return true;
    }, {
      message: "Дата начала акции не может быть позже даты окончания",
      path: ["discountFrom"],
    });
  ```

---

## 5. Бэкенд контроллер и сервис

### 5.1. `CatalogAdminController` ([src/modules/catalog/catalog-admin.controller.ts](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/src/modules/catalog/catalog-admin.controller.ts))
Добавлен маршрут с верификацией прав `ADMIN` / `CONTENT_MANAGER` и CSRF Origin:
```typescript
@Patch("products/:id/discount")
@HttpCode(HttpStatus.OK)
async updateProductDiscount(@Param("id") id: string, @Body() body: unknown, @Req() req: FastifyRequest) {
  this.authenticateAdmin(req);
  const parseRes = UpdateProductDiscountSchema.safeParse(body);
  if (!parseRes.success) throw new UnprocessableEntityError("VALIDATION_ERROR", "...", parseRes.error.format());
  const data = await this.catalogService.updateProductDiscount(id, parseRes.data);
  return { success: true, data: { ...data, ... }, meta: { timestamp: new Date().toISOString() } };
}
```

### 5.2. `CatalogService` ([src/modules/catalog/catalog.service.ts](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/src/modules/catalog/catalog.service.ts))
- Метод `updateProductDiscount`: поддержка быстрой отмены скидки передачей `discountPrice: null` (атомарно сбрасывает `discountPrice`, `discountFrom`, `discountUntil`).
- Обновлены методы `getProducts`, `getProductBySlug`, `getProductById`, `getProductVariants`, `createProduct`, `updateProduct`, `updateVariantPrice` с прозрачной передачей `discountFrom` и `discountStatus`.

### 5.3. `CartService` и `OrdersService`
- В `CartService.formatCart` и `OrdersService.checkout` параметры скидки вычисляются централизованно через `calculateEffectivePrice` с учётом `discountFrom`.

---

## 6. Административный интерфейс Frontend

Формы редактирования ([edit/page.tsx](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/frontend/src/app/admin/products/[id]/edit/page.tsx)) и создания ([new/page.tsx](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/frontend/src/app/admin/products/new/page.tsx)):
1. **Бейдж статуса в реальном времени:**
   - `● Активна (-X%)` (изумрудный)
   - `🕒 Запланирована (-X%)` (синий)
   - `✕ Завершена` (серый)
   - `Не установлена` (нейтральный)
2. **Поля ввода:**
   - Акционная цена (KGS);
   - Дата и время начала акции (`datetime-local`);
   - Дата и время окончания акции (`datetime-local`).
3. **Кнопка быстрой отмены:** Мгновенно обнуляет поля скидки и возвращает выкройку к базовой стоимости.
4. **Валидация перед отправкой:** Предотвращает ввод цен $\ge$ базовой или диапазона дат, где старт позже финиша.
