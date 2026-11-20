# LEKALO ZHIIDE — STAGE 5.25
## ОТЧЕТ О ТЕСТИРОВАНИИ ДИФФЕРЕНЦИАЛЬНОГО ЦЕНООБРАЗОВАНИЯ ПО ФОРМАТАМ

**Проект:** LEKALO ZHIIDE  
**Этап:** Stage 5.25 — Per-Format Differential Pricing  
**База данных:** `lekalo_test` (Neon PostgreSQL)  
**Дата тестирования:** 20 ноября 2026 г.  
**Результат:** 79/79 ТЕСТОВ ПРОЙДЕНО УСПЕШНО (100% PASS RATE)  

---

## 1. Сводные результаты

| Тестовый набор | Файл теста | Пройдено | Провалено | Статус |
|:---|:---|:---:|:---:|:---:|
| **Stage 5.25 Core Pricing** | [`tests/stage-5-25-pricing.test.ts`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/tests/stage-5-25-pricing.test.ts) | 32 | 0 | **PASSED** |
| **Stage 5.24 Dictionaries Regression** | [`tests/stage-5-24-dictionaries.test.ts`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/tests/stage-5-24-dictionaries.test.ts) | 16 | 0 | **PASSED** |
| **Stage 5.23 Sewing Instructions Regression** | [`tests/stage-5-23-instructions.test.ts`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/tests/stage-5-23-instructions.test.ts) | 12 | 0 | **PASSED** |
| **Stage 5.22 Bundle Integrity Regression** | [`tests/stage-5-22-bundle-integrity.test.ts`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/tests/stage-5-22-bundle-integrity.test.ts) | 10 | 0 | **PASSED** |
| **Stage 5.9 Purchase Guard Availability** | [`tests/purchase-availability.test.ts`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/tests/purchase-availability.test.ts) | 9 | 0 | **PASSED** |
| **ИТОГО** | **5 тестовых наборов** | **79** | **0** | **100% УСПЕХ** |

---

## 2. Детализация 14 сценариев Stage 5.25

### Сценарий 1: Разные цены для А4 и Плоттер 900 на одном товаре
- **Входные данные:** Размер 42 (S), Рост 164-170 см. А4 `priceOverride = 350`, Plotter `priceOverride = 450`.
- **Результат:** `calculateEffectivePrice` вернул ровно 350 сом для А4 и 450 сом для Плоттера. Цены четко дифференцированы.
- **Статус:** **PASS**

### Сценарий 2: Приоритет `priceOverride` варианта над базовой ценой
- **Входные данные:** `basePrice = 300`, `priceOverride = 350`.
- **Результат:** Эффективная цена составила 350 сом, базовая цена товара переопределена.
- **Статус:** **PASS**

### Сценарий 3: Наследование цены при отсутствии оверрайда (`priceOverride = null`)
- **Входные данные:** `priceOverride = null`, `basePrice = 300`. При активной скидке: `discountPrice = 240`.
- **Результат:** Вариант без оверрайда унаследовал 300 сом, а при скидке — акционные 240 сом.
- **Статус:** **PASS**

### Сценарий 4: Расчет цены для комплекта «Все размеры» (`ALL`)
- **Входные данные:** Вариант `ALL` с `priceOverride = null`, `bundlePrice = 1200`.
- **Результат:** `ALL` унаследовал 1200 сом с флагом `isBundle: true`. При явном оверрайде (1100 сом) оверрайд берет верх.
- **Статус:** **PASS**

### Сценарии 5, 6, 7: Строгая валидация некорректных цен (отрицательные, ноль, строки, пустые)
- **Входные данные:** Цены `-100`, `-50`, `0`, `"free"`, `{}`.
- **Результат:** Zod-схемы `UpdateVariantPriceSchema` и `UpdateFormatPricesSchema`, а также сервисный метод `CatalogService.updateVariantPrice` выбросили ошибки валидации и `INVALID_PRICE`.
- **Статус:** **PASS**

### Сценарий 8: Динамическое переключение цен в Catalog API
- **Входные данные:** Вызовы `getProductVariants` и `getProductBySlug`.
- **Результат:** Оба API возвращают актуальные цены по форматам (А4 = 350, Плоттер = 450, ALL = 1200) без кэширования или залипания данных.
- **Статус:** **PASS**

### Сценарий 9: Корзина отражает цену выбранного формата
- **Входные данные:** Добавление в корзину варианта Плоттер (450 сом).
- **Результат:** В `CartItem.price` зафиксировано 450 сом, `Cart.totalAmount` равен 450 сом.
- **Статус:** **PASS**

### Сценарий 10: Чекаут принудительно рассчитывает цену на сервере
- **Входные данные:** Попытка передать фальсифицированную цену `clientReportedPrice: 1`.
- **Результат:** Сервер проигнорировал клиентский ввод, сумма заказа составила 450 сом, `OrderItem.priceAtPurchase = 450`.
- **Статус:** **PASS**

### Сценарии 11 и 12: Неизменность прошлых заказов при изменении цен в каталоге
- **Входные данные:** После чекаута администратор повысил цену варианта до 600 сом и базовую цену товара до 500 сом.
- **Результат:** В историческом заказе `OrderItem.priceAtPurchase` остался ровно 450 сом. Сумма заказа не изменилась.
- **Статус:** **PASS**

### Сценарий 13: Purchase Guard блокирует покупку без PDF независимо от цены
- **Входные данные:** Попытка добавить в корзину вариант А4 без загруженного файла PDF.
- **Результат:** Запрос отклонен с кодом `400 PATTERN_FILE_NOT_READY` («Выкройка пока готовится конструктором»).
- **Статус:** **PASS**

### Сценарий 14: Существующие варианты без переопределений и пакетное назначение цен
- **Входные данные:** Вызов `updateVariantPrice(null)` и `updateFormatPrices(formatId, 550)`.
- **Результат:** Сброс в `null` возвращает вариант к наследованию цены. Пакетная смена цены обновила все варианты формата в один клик.
- **Статус:** **PASS**

---

## 3. Резюме безопасности и чистоты

1. **Безопасность БД:** Все операции выполнялись исключительно в базе данных `lekalo_test`. Доступ к Production Neon, Production Supabase и Vercel полностью заблокирован.
2. **Товар «Пальто оверсайз Чолпон»:** Реальные товары каталога и продажи не изменялись (`isActive: false` / `isAvailable: false`).
3. **Очистка данных:** Все синтетические сущности с префиксом `T525_` были полностью и без остатка удалены в блоке `finally`.
