# LEKALO ZHIIDE — STAGE 5.20: LIGHTBOX & STOREFRONT TEST MATRIX
**Test Object**: Product Card «Пальто оверсайз Чолпон» (`/catalog/palto-oversayz-cholpon`)  
**Engine**: Headless Google Chrome v157.0.8103.51 (CDP)  
**Database**: `lekalo_test` (Neon Serverless PostgreSQL)  
**Result**: **25/25 Tests Passed (100%)**

---

## Complete Test Matrix

| ID | Category | Viewport | Target Element / Action | Expected Behavior | Observed Result | Status |
|:---|:---|:---|:---|:---|:---|:---:|
| **CHK-01** | Storefront | Desktop (1280×800) | Primary Product Image | Image loads `palto-oversayz-cholpon-main.jpg` without 404 | `naturalWidth: 700, naturalHeight: 933, complete: true` | **PASS** |
| **CHK-02** | Storefront | Desktop (1280×800) | Photo Gallery Thumbnails | 3 secondary thumbnails rendered | 3 images rendered with valid `/images/products/` URLs | **PASS** |
| **CHK-03** | Storefront | Desktop (1280×800) | Technical Drawing Tab | Tab switch activates CAD container | Tab switches, CAD container mounts | **PASS** |
| **CHK-04** | Storefront | Desktop (1280×800) | CAD Technical Drawing | CAD image loads `palto-oversayz-cholpon-tech.jpg` | `naturalWidth: 1000, naturalHeight: 707, complete: true` | **PASS** |
| **CHK-05** | Lightbox | Desktop (1280×800) | CAD Preview Image Click | Opens CAD Lightbox modal | Modal mounts, `role="dialog"` visible, backdrop rendered | **PASS** |
| **CHK-06** | Lightbox | Desktop (1280×800) | "Увеличить чертеж" Button Click | Opens CAD Lightbox modal | Modal mounts identically with CAD drawing | **PASS** |
| **CHK-07** | Lightbox | Desktop (1280×800) | Initial Modal Zoom Level | Image renders at 100% scale, zoom button displays "150%" | Image has `scale-100`, button text is "150%" | **PASS** |
| **CHK-08** | Lightbox | Desktop (1280×800) | Zoom Button Click | Toggles zoom level to 150% | Image receives `scale-150`, button text is "100%" | **PASS** |
| **CHK-09** | Lightbox | Desktop (1280×800) | Image Click Inside Modal | Toggles zoom level between 100% and 150% | Zoom toggles smoothly; modal does NOT close | **PASS** |
| **CHK-10** | Lightbox | Desktop (1280×800) | Modal Close Button ('X') | Closes modal and unmounts from DOM | Modal unmounted; `role="dialog"` not found | **PASS** |
| **CHK-11** | Lightbox | Desktop (1280×800) | Keyboard Escape Key | Dispatches Escape event, closes modal | Modal unmounted cleanly upon Escape | **PASS** |
| **CHK-12** | Lightbox | Desktop (1280×800) | Backdrop Click Outside Modal | Clicking backdrop outside image closes modal | Modal closes immediately | **PASS** |
| **CHK-13** | Lightbox | Desktop (1280×800) | Click Inside Image Propagation | Clicking image does not propagate to backdrop | Modal remains open; zoom toggled | **PASS** |
| **CHK-14** | Lightbox | Desktop (1280×800) | Body Scroll Lock | Body overflow set to "hidden" when open | `document.body.style.overflow === "hidden"` | **PASS** |
| **CHK-15** | Lightbox | Desktop (1280×800) | Body Scroll Restore | Body overflow restored to "" upon closing | `document.body.style.overflow === ""` | **PASS** |
| **CHK-16** | Storefront | Desktop (1280×800) | Size Selectors | Sizes 42, 44, 46 selectable | All 3 sizes clickable and update selected size state | **PASS** |
| **CHK-17** | Storefront | Desktop (1280×800) | Format Selectors | A4 & Plotter 900 selectable | Both formats clickable and update format state | **PASS** |
| **CHK-18** | Storefront | Desktop (1280×800) | Pricing Display | 520 KGS current / 700 KGS base / 26% discount | Correct values rendered with currency symbol | **PASS** |
| **CHK-19** | Storefront | Desktop (1280×800) | Bundle Pricing | Bundle option displays 1 750 KGS (all sizes) | Correct value rendered with savings badge | **PASS** |
| **CHK-20** | Guard | Desktop (1280×800) | Purchase Guard Banner | Warning banner rendered: "Выкройка пока готовится" | Amber notice rendered with clear status message | **PASS** |
| **CHK-21** | Guard | Desktop (1280×800) | Add to Cart Button Disabled | Button disabled, lock icon, "Выкройка пока готовится" | `<button disabled>` verified; cannot trigger cart add | **PASS** |
| **CHK-22** | Mobile | Mobile (390×844) | Single Column Responsive Layout | Layout stacks cleanly without horizontal scroll | No horizontal scroll (`scrollWidth === clientWidth`) | **PASS** |
| **CHK-23** | Mobile | Mobile (390×844) | Mobile Sticky Buy Bar | Appears upon scroll past main buy button | Fixed bar visible at screen bottom with disabled button | **PASS** |
| **CHK-24** | Mobile | Mobile (390×844) | Mobile Lightbox Touch Targets | Close and Zoom buttons $\ge 40\text{ px}$ in height | Close: 40×40 px, Zoom: 46×40 px (compliant) | **PASS** |
| **CHK-25** | Mobile | Mobile (390×844) | Mobile CAD Lightbox Full Screen | Modal occupies full viewport with dark backdrop | Modal fills 390×844 px cleanly | **PASS** |

---

## Validation Summary
- **Total Test Cases**: 25
- **Passed**: 25 (100%)
- **Failed**: 0 (0%)
- **Blocked**: 0 (0%)
- **Execution Engine**: Real Google Chrome (v157.0.8103.51 via Chrome DevTools Protocol)
