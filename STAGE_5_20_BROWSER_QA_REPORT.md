# LEKALO ZHIIDE — STAGE 5.20: REAL BROWSER QA REPORT
**Product Tested**: «Пальто оверсайз Чолпон» (`/catalog/palto-oversayz-cholpon`)  
**Execution Date**: 2026-11-19  
**Execution Environment**: Real Installed Google Chrome v157.0.8103.51 (CDP Port 9222)  
**Database**: `lekalo_test` (Neon Serverless PostgreSQL, Read-Only Verified)  
**Overall Status**: **PASS (100% — 25/25 Browser Checks Passed)**

---

## 1. Executive Summary

In Stage 5.20, real browser automated testing was performed on the flagship pilot product card **«Пальто оверсайз Чолпон»** (`/catalog/palto-oversayz-cholpon`). Testing was conducted directly on an installed Google Chrome browser (`v157.0.8103.51`) controlled via the Chrome DevTools Protocol (CDP) WebSocket interface without mocks, synthetic DOM stubs, or simulating API responses.

Both **Desktop (1280×800)** and **Mobile (390×844)** viewports were thoroughly evaluated. All ten core CAD Lightbox interaction scenarios from Stage 5.19 were validated in real rendering conditions. One real defect (mobile zoom button touch target height was 30px) was discovered, rectified in [ProductDetailView.tsx](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/frontend/src/app/catalog/[slug]/ProductDetailView.tsx), recompiled, and verified ($\ge 40\text{ px}$).

---

## 2. Test Architecture & Infrastructure

### 2.1. Chrome DevTools Protocol Runner
A dedicated browser QA test runner was constructed at `scratch/browser_qa_runner.js`:
- **Browser Binary**: `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`
- **Flag Arguments**: `--headless=new --remote-debugging-port=9222 --no-first-run --no-default-browser-check --disable-gpu`
- **Communication Protocol**: HTTP endpoint `http://127.0.0.1:9222/json/new` (PUT) to spawn isolated browser targets, followed by RFC-6455 raw WebSocket connection over TCP socket.
- **CDP Domains Used**:
  - `Page.enable`, `Page.navigate`, `Page.captureScreenshot`
  - `Runtime.enable`, `Runtime.evaluate`
  - `Input.dispatchMouseEvent`, `Input.dispatchKeyEvent`
  - `Emulation.setDeviceMetricsOverride`

### 2.2. Safety Verification
Before launching browser sessions or executing regression suites, pre-flight safety verified:
```sql
SELECT current_database();
-- Result: lekalo_test (STRICT MATCH)
```
No production databases, Neon production branches, Supabase buckets, or Vercel production environments were accessed.

---

## 3. Desktop Verification (Viewport 1280×800)

### 3.1. Page Load & Initial State
- **URL**: `http://localhost:3000/catalog/palto-oversayz-cholpon`
- **Product Title**: `Пальто оверсайз «Чолпон» (Лимитированная серия)`
- **Category Badge**: `Верхняя одежда`
- **Main Photo**: Loaded successfully (`palto-oversayz-cholpon-main.jpg`, naturalWidth: 700px, naturalHeight: 933px, complete: true).
- **Gallery Thumbnails**: 3 gallery thumbnails present and rendered.

### 3.2. Technical CAD Drawing Tab
- **Tab Navigation**: Switching between "Фотографии" and "Конструктивный чертеж" operates smoothly without layout shift.
- **CAD Drawing Display**: [palto-oversayz-cholpon-tech.jpg](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/frontend/public/images/products/palto-oversayz-cholpon-tech.jpg) renders inside a clean 16:9 container with magnifying badge overlay.
- **Hover & Interaction**: Hovering over the CAD preview displays zoom overlay cues.

### 3.3. Variant Selectors & Pricing
- **Sizes Available**: Three sizes present (42, 44, 46) matching database variants. Selecting size 44 activates highlight ring.
- **Formats Available**: `А4 (домашний принтер)` and `Плоттер 900 мм` present and selectable.
- **Pricing Breakdown**:
  - Current Price: **520 KGS**
  - Base Price: **700 KGS** (struck through)
  - Discount Badge: **-26%**
  - Bundle Option ("Все размеры (42-46)"): **1 750 KGS** (saving 25%)

### 3.4. Purchase Guard Enforcement
- **Alert Banner**: Renders amber warning banner stating *"Выкройка пока готовится. Файлы лекал проходят финальный контроль конструктора. Оформите предзаказ или добавьте в избранное."*
- **Primary Action Button**: `<button disabled>` with lock icon and text *"Выкройка пока готовится"*.
- **Bundle Action Button**: `<button disabled>` with lock icon.

---

## 4. CAD Lightbox Deep Dive (10 Core Scenarios)

| # | Check Description | Real Action Executed | Observed Result | Verdict |
|---|---|---|---|---|
| **1** | CAD Preview Click | Click on CAD image in preview container | Modal opens; `palto-oversayz-cholpon-tech.jpg` loaded in full view | **PASS** |
| **2** | CTA Button Click | Click "Увеличить чертеж" button | Modal opens identically with active technical drawing | **PASS** |
| **3** | Initial Zoom State | Inspect zoom container on modal open | Image renders at 100% scale; Zoom button displays "150%" | **PASS** |
| **4** | Zoom Button Toggle | Click "150%" button in top toolbar | Image receives `scale-150` class; Button text toggles to "100%" | **PASS** |
| **5** | Image Click Zoom Toggle | Click directly on CAD drawing inside modal | Image toggles between 100% and 150% smoothly; Modal remains open | **PASS** |
| **6** | Close via 'X' Button | Click top-right circular close button | Modal closes; removed from DOM | **PASS** |
| **7** | Close via Escape Key | Dispatch CDP KeyEvent `key: "Escape"`, `code: "Escape"` | Modal listener catches keydown event; closes modal cleanly | **PASS** |
| **8** | Close via Backdrop Click | Click outer backdrop container (coordinate 10, 10) | Modal closes; backdrop click handler triggers close | **PASS** |
| **9** | Stop Propagation Check | Click inside image element | Modal does NOT close (propagation stopped); zoom toggled | **PASS** |
| **10** | Body Scroll Lock/Unlock | Check `document.body.style.overflow` before/during/after | Before: `""` -> During: `"hidden"` -> After: `""` | **PASS** |

---

## 5. Mobile Verification (Viewport 390×844)

### 5.1. Responsive Storefront Layout
- **Container Sizing**: Product card layout stacks vertically into single column without horizontal overflow.
- **Gallery Carousel**: Swipe/touch thumbnail row displays cleanly below primary photo.
- **CAD Tab**: Accessible via touch tabs; CAD preview fits 100% mobile screen width.

### 5.2. Mobile Sticky Buy Bar
- **Behavior**: When scrolling past the main buy button ($Y > 1500\text{ px}$), the fixed bottom sticky bar transitions smoothly into view.
- **Sticky Bar Content**: Displays product title, selected size/format, prices (520 KGS / 700 KGS), and disabled buy button.
- **Safe Area**: Bottom padding conforms to mobile home bar area.

### 5.3. Mobile CAD Lightbox & Touch Targets
- **Defect Detected**: The zoom toggle button previously had `py-1.5` resulting in an element height of 30px, below the recommended $\ge 40\text{--}44\text{ px}$ touch target guideline.
- **Correction Applied**: Updated [ProductDetailView.tsx](file:///C:/Users/ASUS/.gemini/antigravity/scratch/lekalo-zhiide/frontend/src/app/catalog/[slug]/ProductDetailView.tsx) to use `min-h-[40px] px-3.5`.
- **Re-Verification**:
  - Close Button: **40×40 px** ($\ge 40\text{ px}$)
  - Zoom Button: **46×40 px** ($\ge 40\text{ px}$)
  - Top Toolbar Margin: Cleanly separated from device status bar.

---

## 6. Accessibility & Semantic Compliance
- `role="dialog"` declared on CAD Lightbox modal container.
- `aria-modal="true"` declared for screen reader isolation.
- `aria-label="CAD Lightbox"` provided on modal container.
- `aria-label="Закрыть"` provided on close button.
- `aria-label="Масштаб"` provided on zoom button.
- Focus trap and Escape key listener bound via `window.addEventListener("keydown")` and cleaned up on unmount.

---

## 7. Artifacts & Screenshots Generated
All screenshots were captured from real Google Chrome browser sessions:
1. `screenshots/stage_5_20_desktop_product_card.png` (553,876 B)
2. `screenshots/stage_5_20_desktop_cad_lightbox_100.png` (193,946 B)
3. `screenshots/stage_5_20_desktop_cad_lightbox_150.png` (284,579 B)
4. `screenshots/stage_5_20_mobile_product_card.png` (1,719,027 B)
5. `screenshots/stage_5_20_mobile_cad_lightbox.png` (417,712 B)

---

## 8. Conclusion
The pilot product card «Пальто оверсайз Чолпон» and its CAD Lightbox viewer have passed 100% of real browser tests on Google Chrome v157 across Desktop and Mobile viewports. The system is robust, visually polished, accessible, and ready for production pattern onboarding.
