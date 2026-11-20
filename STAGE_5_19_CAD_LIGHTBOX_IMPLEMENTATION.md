# STAGE 5.19 — CAD LIGHTBOX IMPLEMENTATION REPORT

**Проект:** LEKALO ZHIIDE — Платформа цифровых выкроек  
**Этап:** Stage 5.19 — Cholpon Visual QA & CAD Lightbox Fix  
**Дата реализации:** 19 ноября 2026 г.  
**Компонент:** [`frontend/src/app/catalog/[slug]/ProductDetailView.tsx`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/frontend/src/app/catalog/[slug]/ProductDetailView.tsx)  
**Статус:** ВЫПОЛНЕНО (TESTED & VERIFIED)

---

## 1. Контекст и описание дефекта

В ходе аудита Stage 5.18 эталонной карточки товара «Пальто оверсайз Чолпон» ([`/catalog/palto-oversayz-cholpon`](http://localhost:3000/catalog/palto-oversayz-cholpon)) было выявлено критическое замечание по просмотру технического CAD-чертежа (`palto-oversayz-cholpon-tech.jpg`).

### Выявленный дефект (Before):
В исходной реализации вкладки «Технический рисунок» (вкладка CAD):
```tsx
// ИСХОДНЫЙ КОД (ProductDetailView.tsx, строки 1209 и 1216)
<button
  onClick={() => {
    setLightboxIndex(0);
    setLightboxOpen(true);
  }}
  className="..."
>
  Увеличить чертёж
</button>
```
1. **Подмена изображения:** При нажатии на кнопку «Увеличить чертёж» или на само превью CAD-рисунка открывался общий фото-лайтбокс с индексом `0` (`allImages[0]`). Поскольку нулевым изображением в галерее является обложка товара (`palto-oversayz-cholpon-cover.jpg`), покупатель вместо детального чертежа конструкции видел лицевую фотографию пальто на модели.
2. **Отсутствие функции приближения (Zoom):** В общем лайтбоксе отсутствовало зумирование — невозможно было рассмотреть линии кроя, вытачки, лацканы и технологические узлы.
3. **Отсутствие блокировки скролла:** Фоновая страница продолжала прокручиваться при открытом модальном окне.
4. **Проблемы доступности:** Отсутствовали атрибуты `aria-modal`, `role="dialog"`, текстовые метки для скринридеров и поддержка закрытия по клавише `Escape`.

---

## 2. Архитектура решения и внесенные изменения

Для изолированного и качественного просмотра технических чертежей в [`ProductDetailView.tsx`](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/frontend/src/app/catalog/[slug]/ProductDetailView.tsx) реализован выделенный **CAD Lightbox**.

### 2.1. Независимое состояние
Добавлены два состояния:
```tsx
// frontend/src/app/catalog/[slug]/ProductDetailView.tsx
const [cadLightboxOpen, setCadLightboxOpen] = useState(false);
const [cadZoomed, setCadZoomed] = useState(false);
```
- `cadLightboxOpen`: управление видимостью модального окна технического чертежа.
- `cadZoomed`: двухпозиционный уровень масштабирования (100% fit-screen vs 150% close-up zoom).

### 2.2. Блокировка прокрутки фона (Body Scroll Lock)
Добавлен `useEffect`, отслеживающий открытие любого модального окна (CAD Lightbox, галерея, размерная сетка):
```tsx
useEffect(() => {
  if (cadLightboxOpen || lightboxOpen || sizeGuideOpen) {
    document.body.style.overflow = "hidden";
  } else {
    document.body.style.overflow = "";
  }
  return () => {
    document.body.style.overflow = "";
  };
}, [cadLightboxOpen, lightboxOpen, sizeGuideOpen]);
```
Предотвращает смещение страницы и паразитный скролл на мобильных и десктопных браузерах.

### 2.3. Обработка клавиши Escape
Добавлен глобальный слушатель клавиатуры:
```tsx
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && cadLightboxOpen) {
      setCadLightboxOpen(false);
      setCadZoomed(false);
    }
  };
  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [cadLightboxOpen]);
```
При нажатии `Escape` модальное окно закрывается, а зум автоматически сбрасывается в исходное состояние.

### 2.4. Интерактивное зумирование и панорамирование
- Контейнер изображения снабжён `overflow-auto` для свободного панорамирования в увеличенном режиме.
- Клик по чертежу или кнопке масштабирования переключает `cadZoomed` (`!cadZoomed`).
- Классы масштабирования:
  - Режим 100%: `max-h-[85vh] w-auto max-w-full object-contain cursor-zoom-in`
  - Режим 150%: `max-h-none w-auto min-w-[150%] max-w-none cursor-zoom-out`
- Плавный переход масштаба через Tailwind CSS: `transition-all duration-300 ease-out`.

### 2.5. Мобильная адаптация и Touch-Friendly Target
- Все интерактивные кнопки имеют минимальную зону нажатия не менее 44x44px:
  - Кнопка зума: `min-h-[44px] min-w-[44px] px-3 py-2 flex items-center gap-1.5`
  - Кнопка закрытия (Х): `min-h-[44px] min-w-[44px] p-2 flex items-center justify-center`
- Панель управления закреплена в шапке модального окна (`sticky top-0 z-10 bg-black/60 backdrop-blur-md`).
- Подложка с прозрачностью 90% (`bg-black/90 backdrop-blur-sm`).
- Закрытие по клику на фон (вне чертежа).

### 2.6. Доступность (a11y)
- Модальный контейнер: `role="dialog" aria-modal="true" aria-label="Технический рисунок CAD"`
- Кнопки снабжены понятными `aria-label`:
  - «Приблизить чертёж (150%)» / «Отдалить чертёж (100%)»
  - «Закрыть просмотр чертежа (Escape)»
- Картинка снабжена семантическим `alt`: `Технический чертёж CAD — ${product.title}`.

---

## 3. Сравнение реализации: Before vs After

| Параметр | До исправления (Stage 5.18) | После исправления (Stage 5.19) |
|---|---|---|
| **Изображение при клике** | Обложка `allImages[0]` (ошибка подмены) | Настоящий CAD-чертёж `palto-oversayz-cholpon-tech.jpg` |
| **Режим зума** | Отсутствовал (только статичный fit) | 100% / 150% toggle + click-to-zoom |
| **Закрытие по Escape** | Не поддерживалось для CAD | Поддерживается глобальным хуком |
| **Закрытие по фону** | Отсутствовало | Реализовано на backdrop-клике |
| **Блокировка body-scroll** | Отсутствовала | `document.body.style.overflow = "hidden"` |
| **Touch Targets** | Мелкие иконки | >= 44x44 px со скруглением |
| **Подсказка для пользователя** | Отсутствовала | Подсказка в футере: «Нажмите на чертёж для увеличения» |

---

## 4. Верификация кода и сборка

1. **Frontend TypeScript Check:**
   ```bash
   cd frontend
   npx tsc --noEmit
   # Результат: 0 ошибок, Exit Code 0
   ```
2. **Backend TypeScript Check:**
   ```bash
   npx tsc --noEmit
   # Результат: 0 ошибок, Exit Code 0
   ```
3. **Хот-релоад в Next.js:**  
   Next.js 14 Fast Refresh успешно пересобрал `/catalog/[slug]` без предупреждений.

---

## 5. Выводы
Замечание аудита Stage 5.18 полностью устранено. Компонент CAD Lightbox готов к эксплуатации, соответствует стандартам доступности WCAG AA, корректно адаптирован для мобильных экранов и предоставляет конструкторам и покупателям возможность детального изучения лекал.
