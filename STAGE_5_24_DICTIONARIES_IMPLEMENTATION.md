# STAGE 5.24: HEIGHTS & FORMATS ADMIN DICTIONARIES IMPLEMENTATION

## 1. Архитектура решения

Реализация этапа 5.24 охватывает полный цикл данных от реляционной схемы до пользовательского интерфейса панели администратора:
`Prisma Schema -> Migration -> Zod DTOs -> NestJS Service & Controller -> Next.js Admin UI`.

```
                    ┌───────────────────────────┐
                    │  Next.js Admin UI         │
                    │  /admin/dictionaries      │
                    └─────────────┬─────────────┘
                                  │ JSON / Cookie Auth + CSRF
                                  ▼
                    ┌───────────────────────────┐
                    │ NestJS Admin Controller   │
                    │ @Roles(Role.ADMIN)        │
                    │ @UseGuards(JwtAuthGuard,  │
                    │            RolesGuard)    │
                    └─────────────┬─────────────┘
                                  │ Zod Validation Pipe
                                  ▼
                    ┌───────────────────────────┐
                    │ CatalogService            │
                    │ Business Logic & Integrity│
                    └─────────────┬─────────────┘
                                  │ Prisma ORM
                                  ▼
                    ┌───────────────────────────┐
                    │ PostgreSQL Database       │
                    │ lekalo_test               │
                    │ (heights, formats tables) │
                    └───────────────────────────┘
```

---

## 2. Спецификация Backend API

Все эндпоинты защищены `JwtAuthGuard`, `RolesGuard` (`Role.ADMIN`), а также проверкой CSRF-заголовка `checkOrigin`.

### 2.1. Ростовки (`/api/v1/admin/heights`)

| Метод | URL | Описание | Код ответа |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/heights` | Список всех ростовок с `variantsCount` и `productsCount` | `200 OK` |
| `GET` | `/api/v1/admin/heights/:id` | Детальная информация по ростовке | `200 OK` / `404 Not Found` |
| `POST` | `/api/v1/admin/heights` | Создание новой ростовки | `201 Created` / `409 Conflict` / `422 Unprocessable` |
| `PUT` | `/api/v1/admin/heights/:id` | Редактирование параметров ростовки | `200 OK` / `409 Conflict` / `422 Unprocessable` |
| `PATCH`| `/api/v1/admin/heights/:id/toggle-active` | Переключение активности (`isActive`) | `200 OK` / `404 Not Found` |
| `DELETE`| `/api/v1/admin/heights/:id` | Физическое удаление (если `variantsCount == 0`) | `200 OK` / `409 Conflict` |

### 2.2. Форматы выкроек (`/api/v1/admin/formats`)

| Метод | URL | Описание | Код ответа |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/formats` | Список всех форматов с `variantsCount` и `productsCount` | `200 OK` |
| `GET` | `/api/v1/admin/formats/:id` | Детальная информация по формату | `200 OK` / `404 Not Found` |
| `POST` | `/api/v1/admin/formats` | Создание нового формата | `201 Created` / `409 Conflict` / `422 Unprocessable` |
| `PUT` | `/api/v1/admin/formats/:id` | Редактирование параметров формата | `200 OK` / `409 Conflict` / `422 Unprocessable` |
| `PATCH`| `/api/v1/admin/formats/:id/toggle-active` | Переключение активности (`isActive`) | `200 OK` / `404 Not Found` |
| `DELETE`| `/api/v1/admin/formats/:id` | Физическое удаление (если `variantsCount == 0`) | `200 OK` / `409 Conflict` |

---

## 3. Zod-схемы валидации данных (`catalog.dto.ts`)

```typescript
export const CreateHeightSchema = z.object({
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(100),
  displayOrder: z.number().int().min(0).optional().default(0),
  minHeight: z.number().int().min(50).max(250).nullable().optional(),
  maxHeight: z.number().int().min(50).max(250).nullable().optional(),
  isActive: z.boolean().optional().default(true),
}).refine(data => {
  if (data.minHeight != null && data.maxHeight != null) {
    return data.minHeight <= data.maxHeight;
  }
  return true;
}, {
  message: "Минимальный рост не может превышать максимальный рост",
  path: ["minHeight"],
});

export const CreateFormatSchema = z.object({
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(100),
  displayOrder: z.number().int().min(0).optional().default(0),
  maxPrintWidth: z.number().int().min(100).max(2000).nullable().optional(),
  isActive: z.boolean().optional().default(true),
});

export const ToggleActiveSchema = z.object({
  isActive: z.boolean().optional(),
});
```

---

## 4. Бизнес-логика сервиса (`CatalogService`)

### 4.1. Автоматический расчет метрик использования
При вызове `getAllHeights()` и `getAllFormats()` сервис вычисляет агрегации по связанным вариантам и товарам:
```typescript
const variantsCount = await this.prisma.productVariant.count({
  where: { heightId: height.id },
});
const products = await this.prisma.productVariant.findMany({
  where: { heightId: height.id },
  distinct: ['productId'],
  select: { productId: true },
});
const productsCount = products.length;
```
Это позволяет администратору наглядно видеть, в скольких товарах и SKU участвует справочное значение.

### 4.2. Защита от конфликтов уникальности
Перед созданием или переименованием кода ростовки/формата сервис проверяет наличие совпадений:
```typescript
const existing = await this.prisma.height.findFirst({
  where: { code: dto.code },
});
if (existing && existing.id !== currentId) {
  throw new ConflictException(`Ростовка с кодом "${dto.code}" уже существует`);
}
```

### 4.3. Блокировка удаления при наличии связей
```typescript
if (variantsCount > 0) {
  throw new ConflictException(
    `Нельзя удалить ростовку "${height.name}", так как она используется в ${variantsCount} вариантах товаров. Вы можете деактивировать её.`,
  );
}
```

---

## 5. Пользовательский интерфейс панели администратора

### 5.1. Страница `/admin/dictionaries` (`frontend/src/app/admin/dictionaries/page.tsx`)
- **Вкладки (Tabs)**:
  - «Ростовки» (иконка линейки `Ruler`, счетчик количества).
  - «Форматы выкроек» (иконка файла `FileSpreadsheet`, счетчик количества).
- **Табличное представление**:
  - Код (`code`), название (`name`), порядок отображения (`displayOrder`).
  - Физические границы: диапазон роста в см (`minHeight`–`maxHeight`) / ширина печати в мм (`maxPrintWidth`).
  - Метки использования: `X товаров / Y вариантов`.
  - Быстрый переключатель активности (`Switch` / toggle) с мгновенным сохранением.
  - Действия: кнопка «Редактировать» (открывает модальное окно), кнопка «Удалить» (с проверкой использования).
- **Модальные окна**:
  - Добавление / редактирование ростовки с валидацией диапазона на клиенте.
  - Добавление / редактирование формата с вводом физической ширины листа.
  - Модальное окно подтверждения удаления с предупреждением о блокировке при наличии связанных вариантов.

### 5.2. Форма создания товара (`frontend/src/app/admin/products/new/page.tsx`)
- Заменены жесткие массивы `HEIGHTS` и `FORMATS` на хук `useEffect`, запрашивающий активные элементы через `catalogApi`.
- Если ростовка деактивирована администратором, она мгновенно перестает появляться в чекбоксах генерации вариантов для новых товаров.

---

## 6. Идемпотентность и совместимость с ALL

1. **Идемпотентная генерация**:
   - При повторном запуске генерации вариантов с тем же набором ростовок и форматов система не создает дубликатов SKU (`createdOrUpdatedCount: 0`).
2. **Пакетный размер ALL (Bundle)**:
   - Логика генерации бандла `ALL` корректно связывает создаваемый SKU со всеми активными ростовками и форматами (например, `T524-ALL-H1-F1`).
3. **Хранилище цифровых файлов S3**:
   - Контроллер `StorageAdminController` проверяет канонический формат имени `${slug}-${size}-${height}-${format}.pdf`. Новые ростовки и форматы бесшовно участвуют в проверке соответствия SKU имени файла.
