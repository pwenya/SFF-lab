# SFF Lab — Project Context for Claude

## What this project is
Static HTML storefront for a small SFF (Small Form Factor) PC builder based in Estonia.
Sells custom-built gaming PCs with SteamOS or Windows. Prices are in EUR. No backend — pure frontend.

## My Permissions & Directives
- I have full permission to modify, create, and delete backend and frontend files for the sfflab.ee project.
- I will not ask for text confirmation in the chat before modifying files. I will generate the code and apply the changes in the editor directly (auto-apply/diff).
- If I need to create a new route or model for LHV accounting, I will do so autonomously.

## Stack
- Vanilla HTML + CSS + JS (no build tools, no npm)
- Tailwind CSS via CDN (`https://cdn.tailwindcss.com`) — Play CDN, scans DOM dynamically
- Google Fonts: Plus Jakarta Sans (400, 600, 800)
- No frameworks, no bundler

## File structure
```
index.html           — landing page (hero + pricing cards)
boxes.html           — product showcase (Mood/Terra/Ridge/Tetra R cases with color switcher)
configurator.html    — build configurator (pricing logic via URL params)
shop.html            — shop page (GPU/CPU tabs, brand sub-tabs, product cards)
exclusive.html       — exclusive/contact page (hero text + contact form popup)
admin.html           — order management panel (Google OAuth protected)
legal.html           — legal pages (terms, privacy, returns)
nav.js               — shared nav + modal + i18n engine (injected into every page)
payment/success.html — post-payment success page
payment/cancel.html  — post-payment cancel page
api/payment/         — Vercel serverless payment handlers (create.js, notify.js)
api/order.js         — order creation endpoint
api/contact.js       — exclusive page contact form: sends email to info@sfflab.ee + confirmation to customer
api/update-status.js — order status update + customer email notification
IMG/                 — product images (MoodBlack.1.png, TerraJade.2.png, TetraPine.1.png, etc.)
favicon.svg          — SVG icon (modern browsers)
favicon.ico          — ICO icon 32x32 (Google Search, legacy browsers)
favicon-192.png      — PNG icon 192x192 (Apple Touch, Google Search)
sitemap.xml          — sitemap for Google (index, boxes, shop, configurator, exclusive, legal)
start.bat            — launches local dev server
```

## nav.js — how the shared nav works
Every HTML page includes `<script src="nav.js"></script>` just before `</body>`.
nav.js injects the nav bar + order-status modal (`afterbegin`) and the shared footer (`beforeend`) into `document.body` on DOMContentLoaded.
It also defines these globals used by all pages:
- `setLanguage(lang)` — applies ET/RU translations, reads `window.pageTranslations` per page
- `openModal()` / `closeModal()` / `submitOrder()` — modal controls
- Ripple effect on `.btn-ripple` elements
- Nav scroll opacity

**Rule: any site-wide UI (footer, banners, etc.) belongs in nav.js — never duplicate it in individual HTML files.**

### Nav links
- Desktop order: Shop (DEMO badge) · Eksklusiiv · Paketid — inside `class="hidden min-[900px]:flex"`
- Mobile: Shop and Eksklusiiv links added separately with `class="min-[900px]:hidden flex ..."` before the desktop nav div
- Pricing links to `https://sfflab.ee/#pricing` (absolute URL)
- Logo links to `/` (not `index.html`) — Vercel serves index.html at `/` but `index.html` as a path returns 404

### Nav action button (`#nav-action-btn`)
The status/cart button has `id="nav-action-btn"` and dispatches through `window._navActionClick` if defined, otherwise calls `openModal()`. This lets individual pages override the button behaviour:
- Default (all pages): opens order-status modal
- shop.html: sets `window._navActionClick = function() { openCart(); }` and keeps the button blue, showing cart label + item count
- To restore default on another page: leave `window._navActionClick` undefined
- **`setLanguage` patching:** shop.html patches `window.setLanguage` inside a `load` event listener so `updateNavCartBtn()` always runs after any language switch, preventing the nav-status translation from overwriting the cart label.

### `body>div` width pitfall
nav.js injects `body>div:not(#main-footer){width:100%}`. Any `position:fixed` div appended directly to `<body>` (e.g. a toast) inherits this and becomes 100vw wide. Always add `width:auto` to inline styles of such elements.

### Auto-open order modal
`_init()` in nav.js checks for `?order=` URL param and auto-opens + submits the order status modal. Guards:
- If `document.referrer` includes `'payment'` → skip (payment gateway redirect)
- If `window.location.pathname` includes `'success'` → skip

## Shared footer
Injected by nav.js via `insertAdjacentHTML('beforeend', FOOTER_HTML)`. Structure:
- Left: `SFF Lab OÜ · 17506407 · EE102985942` / `info@sfflab.ee`
- Right: `Ehitatud Eestis` (data-key="footer-built") / `Secured by Cloudflare` / legal links
- Legal links use `data-key="legal-terms"`, `data-key="legal-privacy"`, `data-key="legal-returns"`
- Translations for footer keys (`footer-built`, `legal-*`) live in `_NAV_TR` inside nav.js, not in per-page `pageTranslations`

**Sticky footer:** nav.js injects CSS `html{height:100%} body{min-height:100%;display:flex;flex-direction:column} body>div:not(#main-footer){width:100%} #main-footer{margin-top:auto}`. The `width:100%` rule is critical — without it, flex items with `mx-auto` shrink to content width instead of filling the page.

## i18n pattern
- Language stored in `localStorage.selectedLanguage` (default: `'et'`)
- nav.js handles nav-level and footer-level keys via `_NAV_TR`: `nav-pricing`, `nav-exclusive`, `nav-status`, `legal-terms`, `legal-privacy`, `legal-returns`, `footer-built`
- Each page sets `window.pageTranslations = { et: {...}, ru: {...} }` before `nav.js` loads
- Elements get translated via `data-key="some-key"` attribute
- `window.load` in nav.js calls `setLanguage(localStorage.getItem('selectedLanguage') || 'et')` — applies saved language on every page load
- **`pageTranslations` must be defined BEFORE the `<script src="nav.js">` tag** — nav.js reads it at `window.load` time
- **Dynamic page title:** `setLanguage` in nav.js updates `document.title` if `pageTranslations[lang]['page-title']` exists. The static `<title>` tag always holds the ET version (for Google). Add `'page-title'` to all three language blocks in `pageTranslations` on every page.

## Paths — IMPORTANT
The site is deployed on Vercel at `https://sfflab.ee`. Use **root-relative paths** (`/`, `/#pricing`, `/boxes.html`) for nav links — NOT `index.html` or `../index.html`. Relative file paths (`boxes.html`, `configurator.html`) are fine for same-directory links, but the homepage must always be `/`.

**Do NOT use `index.html` as the homepage link anywhere** — on Vercel this causes a 404. Always use `/`.

## Design system
- Background: `#050505`
- Accent: `#2563eb` (blue-600)
- Font: Plus Jakarta Sans, uppercase heavy (`font-extrabold` / `font-black`)
- Cards: `.glass-card` (subtle border, blur, hover lift) or `.featured-card` (animated gradient border)
- Border radius: `rounded-[40px]` for cards, `rounded-full` for buttons
- Buttons: white on dark bg, or blue-600 CTA

## Languages
- ET (Estonian) is the primary language
- RU (Russian) is secondary
- Content is mixed — some labels are ET/RU bilingual by design (e.g. placeholder text)

## Per-page quirks — IMPORTANT

### configurator.html
- `<body class="p-6 md:p-20 pb-6 md:pb-0 ...">` — has horizontal padding (24px mobile / 80px desktop). Bottom padding is 0 on desktop so the footer reaches the page bottom.
- The shared footer needs negative horizontal margins to escape body padding and reach screen edges. This is handled via `#main-footer { margin-left: -24px; margin-right: -24px; }` / `@media (min-width:768px) { ... -80px }` in the page's `<style>` block.
- Do NOT add padding back to `pb` on the **body** on desktop — it breaks the sticky footer. Adding `pb` to the main content div is fine.
- Main content div: `class="max-w-4xl mx-auto pt-[100px] md:pt-[80px] pb-16 md:pb-20"` — top padding clears nav with breathing room (mobile 24+100=124px total, desktop 80+80=160px total); bottom padding separates last card from footer.
- Sticky right column wrapper: `class="md:-mt-[96px] md:sticky md:top-[120px]"` — the `-mt-[96px]` aligns the summary card visually with the first selector; `top-[120px]` keeps it 32px below the 88px desktop nav.
- `BASE_PRICE` comes from `?base=` URL param, defaults to 2250.
- **Pricing logic — IMPORTANT:** Component add-ons (CPU/GPU/RAM/SSD/PSU) are applied **only when `MODE === 'enthusiast'` (Custom)**. For `core` (Baas) and `plus` (Baas+), `BASE_PRICE` is the full fixed price — no add-ons are added. Controller and OS price add-ons apply to all modes.
- **Current Custom add-on prices:**
  - CPU: 7500f +0, 7500x3d +65
  - GPU: 9060xt +0, 9070xt16 +250, 9070xt20 +340
  - RAM: 16GB +0, 32GB +150, 64GB +640 (diff 64↔32 = 490)
  - SSD: 1TB +0, 2TB +90, 4TB +330 (diff 4TB↔2TB = 240)
  - PSU: 650W +0, 850W +45
- Internal test product: mode=`test`, title `INTERNAL TEST - NOT FOR SALE` (no square brackets).

### boxes.html
- `.product-section` has `border-bottom`. Add `border-bottom: none` to `.product-section:last-child` so there's no double line where the last section meets the footer's `border-t`.
- Cases in order: Terra, Ridge, Mood, **Tetra R** (Pine). Tetra R is last.
- **Tetra R Pine** — single color (pine `#4a5e3c`), 3 photos (`TetraPine.1–3.png`), volume ~12.9 L. Order buttons are disabled (`opacity:0.4;pointer-events:none`).
- **Per-image sizing** via `sizes` array in `config`: `tetra: { ..., sizes: [127, 85, 68] }`. `nav()` reads `m.sizes[m.idx]` and applies `img.style.maxWidth/maxHeight` on each swipe. First image also has inline `style="max-width:127%;max-height:127%"` for the initial render.

### index.html
- Text column has `min-w-0` to prevent long EN words (e.g. "STRONGER.") from compressing the adjacent showcase column via flex min-width.
- `.glass-card` has `min-height: 520px` — prevents cards from changing height when language changes (Cyrillic/Latin font metrics differ).
- `db-desc` paragraph has `min-h-[4.5em]` for the same reason.
- Pricing section: `<section id="pricing" class="scroll-mt-24 ...">` — `scroll-mt-24` ensures the SteamOS/Windows toggle buttons are visible when scrolling from the nav "Prices" link.
- Compatibility section sits at `margin-top: -6px` relative to the pricing section above it.
- All `✓ Verified` labels in game rows use `data-key="verified-label"` (translated: `✓ Ühilduv` / `✓ Совместимо` / `✓ Compatible`).
- Compat-works/native/no: restructured as single `<span data-key="...">` — translations include the `✓`/`✗` symbol so there's no double-symbol.
- **Current prices (SteamOS):** Baas 2199 €, Baas+ 2799 €, Custom from 2199 €
- **Windows section buttons are disabled** (`<button disabled>`) for all three cards — Windows ordering not yet available.
- **Dual Boot Edition button is disabled** — test configuration, shows disclaimer text via `data-key="db-desc"` (red, bold) instead of description.
- Configurator links use `?base=` param: Baas `base=2250`, Baas+ `base=2850`, Custom/Dual Boot `base=2250`.

### shop.html
- Three category tabs: GPU / CPU / Accessories (`shop-gpu` / `shop-cpu` / `shop-acc`).
- GPU and CPU have brand sub-tabs; Accessories has no sub-tabs — `switchCategory('acc')` calls `showGrid('acc', 'aula')` directly.
- Brand sub-tab active colors: NVIDIA `#76b900`, AMD `#ed1c24`, Intel `#0071c5` — applied via inline `style`, not `.os-switch-btn.active` class, to avoid class override.
- Grid visibility toggle uses CSS classes `shop-grid-visible` / `shop-grid-hidden` (same pattern as `os-grid-*` in index.html). `shop-grid-hidden` uses `position:absolute;width:100%` to keep layout stable.
- `brands-cpu` div and hidden grids use `style="display:none"` — **not** Tailwind `hidden` — because Tailwind CDN may generate `.flex` after `.hidden`, making elements always visible.
- On init, an IIFE applies brand button colors only — it does NOT call `showGrid()`, so the default `grid-gpu-nvidia` (which starts with class `shop-grid-visible` in HTML) stays visible.
- `showGrid` list includes: `grid-gpu-nvidia`, `grid-gpu-amd`, `grid-cpu-intel`, `grid-cpu-amd`, `grid-acc-aula`.
- Products currently listed: PNY RTX 5080 16GB OC, PNY RTX 5080 16GB ARGB OC. AMD GPU / Intel CPU / AMD CPU show "Coming Soon" placeholders.
- **Pricing and order buttons are currently disabled** on all NVIDIA cards: price replaced with `tulevikus` (same text for all languages, zinc-600 color), both "add to cart" and "Tellida" buttons have `opacity:0.4;pointer-events:none` and no `onclick`.
- **Accessories tab (`grid-acc-aula`):** two keyboard cards — AULA F75 PRO (active) and AULA F75 MAX (coming soon / `tulevikus`).
  - **AULA F75 PRO Mechanical Keyboard 75%** — active for sale. Color picker: Graphite `#4b5259` (119 €) / Pastel Pink `#f9a8d4` (129 €). JS state: `_f75proColor`, `_f75proPrices`, `_f75proColorNames`. Functions: `selectF75ProColor(color)`, `addF75ProToCart()`, `orderF75Pro()`.
  - Specs shown: Switch `Hot-swap LEOBOG Reaper`, Connection `USB-C · BT5.0 · 2.4GHz`.
  - **AULA F75 MAX Mechanical Keyboard 75%** — disabled (same specs shown, buttons `opacity:0.4;pointer-events:none`).
- **Order modal:** two-step — step 1 shows product overview; step 2 is customer form (name/email/phone). Submit calls `/api/order` then `/api/payment/create` and redirects to LHV payment page. `shopSubmitOrder` uses `p.name` and `p.price` (number).
- **Cart (`#cart-overlay`, `.cart-overlay`):** centered overlay (same animation as order modal — `translateY(20px) scale(0.97)` → `(0) scale(1)`). No floating FAB — the nav `#nav-action-btn` is the cart entry point on this page.
  - Cart items: `{title, brand, price (string "X €"), priceNum (number), specs, qty}`.
  - `checkoutFromCart()` maps `title→name`, `priceNum→price`, `price→priceDisplay` before calling `openShopModal`.
  - Cart persists in `localStorage` key `sff_cart` (JSON). Restored and re-rendered on every page load via `updateCartUI()` in the `load` event.
  - Nav button is always blue on shop page; shows `Ostukorv · N` / `Корзина · N` / `Cart · N` when items present, plain label when empty.
  - Toast on add: pops below the nav button (reads its `getBoundingClientRect()`), spring animation, language-aware text: ET `Lisatud`, RU `Добавлено`, EN `Added`. Falls back to bottom-right on mobile (button hidden, rect is zero).
  - All cart overlay static texts use `data-key`: `cart-title`, `cart-total-label`, `cart-checkout`, `cart-empty-text` — translated via `pageTranslations`.
  - Product card "add to cart" buttons use `data-key="cart-add"`: ET `+ Ostukorvi`, RU `+ В корзину`, EN `+ Add to cart`.

## Token efficiency rules
- Work on ONE file at a time unless explicitly told otherwise
- Read only the file being modified, not the whole project
- Keep explanations short — just do the task
- Never refactor code that wasn't mentioned in the task
- If unsure which file to edit — ask before reading everything

## API & backend
- Vercel serverless functions in /api folder
- Upstash Redis for order storage (KV_REST_API_URL, KV_REST_API_TOKEN)
- Email via nodemailer + Google Workspace SMTP (GMAIL_USER, GMAIL_APP_PASSWORD)
- Google OAuth for admin panel (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
- Admin email: info@sfflab.ee

### api/payment/create.js + notify.js
- Both use production URL: `https://payment.lhv.ee/api/v4` (sandbox URL removed).
- `create.js`: validates `amountCents >= 1` (not 100).
- `notify.js`: LHV/EveryPay webhook handler. Verifies payment server-side via `GET /v4/payments/{ref}` — never trusts callback body alone.
- **Idempotency:** before sending emails, checks `order.status === 'in_progress' || order.emailSent`. If true, returns 200 without re-sending. Redis update sets `emailSent: true`.
- On `settled` and `cancelled/failed/abandoned`: stores `paymentMethod: paymentData.payment_method_name || paymentData.payment_source || 'unknown'` in Redis.
- Sends two emails on `settled`: internal notification to `info@sfflab.ee` + customer confirmation in ET/RU/EN based on `order.language`.
- `buildConfirmationHtml`: order number in subtitle, no separate order-number block, no ✓ emoji, single "Track Order / Tellimuse staatus / Статус заказа" button linking to `https://sfflab.ee/?order=<orderNumber>`.

### api/order.js
- Validates price: `priceNum >= 1` (minimum 1 €, not 1000).

### api/update-status.js
- Valid statuses: `pending`, `pending_payment`, `in_progress`, `ready`, `shipped`, `completed`, `cancelled`.
- `STATUS_ET` and `STATUS_RU` include labels for `completed` and `cancelled`.
- `COLOR_MAP`: `completed` → `#4ade80`, `cancelled` → `#f87171`.
- Sends bilingual ET/RU status notification email to customer on every status change.

### exclusive.html
- Hero page with large gradient title, subtitle, description, and "Võta ühendust" CTA button.
- Contact popup modal (`.contact-overlay` / `.contact-box`): email + phone + textarea, all required. max-width 720px, padding 54px.
- On submit: calls `POST /api/contact` with `{ email, phone, message, lang }`.
- Success message shown inline in modal (button hidden); error shown in red below fields.
- Placeholder text for inputs uses `data-ph` attribute updated via `updatePlaceholders(lang)` — patched into `setLanguage` on `window.load` (same pattern as shop.html).
- **`setLanguage` patching:** exclusive.html patches `window.setLanguage` inside a `load` event listener so `updatePlaceholders()` runs after every language switch.

### api/contact.js
- Accepts `POST { email, phone, message, lang }`. Validates all three fields + basic email regex.
- Sends to `info@sfflab.ee`: subject `Eksklusiiv päring · <email>`, HTML with email/phone rows + message body.
- Sends confirmation to customer: subject and body in ET/RU/EN based on `lang`. Text: "thank you, we'll contact you within 2 business days."
- Uses same nodemailer + Gmail SMTP pattern as notify.js (`GMAIL_USER`, `GMAIL_APP_PASSWORD`).
- Same dark HTML email template as other endpoints (`emailWrap`, `navHeader`, `emailFooter`).

### payment/success.html
- Shown after successful LHV payment redirect (`?order=` param pre-fills order number display).
- Uses `../nav.js` for shared nav. All links use root-relative paths (`/`).
- "Back to home" button: `href="/"`.

### admin.html
- Order table grid: `32px 160px 100px 1.2fr 130px 90px 130px 130px` — first column is checkbox.
- **Bulk actions:** select-all checkbox in header, per-row checkboxes, floating bulk bar (bottom center) appears when rows selected. `applyBulkStatus()` updates all selected orders in parallel.
- Filter buttons include: All, New, Pending Payment, In Progress, Ready, Shipped, **Complete, Cancelled**.
- Status badges: `.s-completed` (green), `.s-cancelled` (red) added alongside existing badges.
- `statusOptions()` includes all 7 statuses including `completed` and `cancelled`.
- Date column shows date + time (`HH:MM`) on separate line.
- Customer detail panel shows `paymentMethod` row if present on the order object.
- Mobile: hides columns 4,5,6,8 (Customer, Config, Price, Update); shows checkbox(1), Order#(2), Date(3), Status(7).

## Favicons
Three favicon formats are served from the root:
- `favicon.ico` — 32×32, for Google Search and legacy browsers
- `favicon-192.png` — 192×192, for Apple Touch and Google Search
- `favicon.svg` — for modern browsers

Every HTML page must include all three link tags:
```html
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" href="/favicon-192.png">
```

## Vercel Analytics
All HTML pages include `<script defer src="/_vercel/insights/script.js"></script>` before `</head>`.
Currently added to: index.html, boxes.html, configurator.html, shop.html, exclusive.html, legal.html, admin.html.
If adding a new page, include this script tag.

## Legal
- Company: SFF Lab OÜ
- Reg: 17506407
- VAT: EE102985942
- Address: Sinimäe tn 16-30, Tallinn