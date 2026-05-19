# SFF Lab — Project Context for Claude

## What this project is
Static HTML storefront for a small SFF (Small Form Factor) PC builder based in Estonia.
Sells custom-built gaming PCs with SteamOS or Windows. Prices are in EUR. No backend — pure frontend.

## Stack
- Vanilla HTML + CSS + JS (no build tools, no npm)
- Tailwind CSS via CDN (`https://cdn.tailwindcss.com`) — Play CDN, scans DOM dynamically
- Google Fonts: Plus Jakarta Sans (400, 600, 800)
- No frameworks, no bundler

## File structure
```
index.html        — landing page (hero + pricing cards)
boxes.html        — product showcase (Mood/Terra/Ridge cases with color switcher)
configurator.html — build configurator (pricing logic via URL params)
shop.html         — shop page (GPU/CPU tabs, brand sub-tabs, product cards)
nav.js            — shared nav + modal + i18n engine (injected into every page)
api/payment/      — Vercel serverless payment handlers (create.js, notify.js)
IMG/              — product images (MoodBlack.1.png, TerraJade.2.png, etc.)
start.bat         — launches local dev server
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
- Desktop: Pricing, Shop (DEMO badge), Status button — inside `class="hidden min-[900px]:flex"`
- Mobile: Shop link added separately with `class="min-[900px]:hidden flex ..."` before the desktop nav div, so it appears only on narrow screens

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
- nav.js handles nav-level and footer-level keys via `_NAV_TR`: `nav-pricing`, `nav-status`, `legal-terms`, `legal-privacy`, `legal-returns`, `footer-built`
- Each page sets `window.pageTranslations = { et: {...}, ru: {...} }` before `nav.js` loads
- Elements get translated via `data-key="some-key"` attribute
- `window.load` in nav.js calls `setLanguage(localStorage.getItem('selectedLanguage') || 'et')` — applies saved language on every page load
- **`pageTranslations` must be defined BEFORE the `<script src="nav.js">` tag** — nav.js reads it at `window.load` time

## Paths — IMPORTANT
All internal links must be **relative** (e.g. `boxes.html`, `configurator.html`, `index.html`).
Never use absolute paths like `/boxes` or `/` — the site is opened via file:// without a server.

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
- Do NOT add padding back to `pb` on desktop — it breaks the sticky footer.

### boxes.html
- `.product-section` has `border-bottom`. Add `border-bottom: none` to `.product-section:last-child` so there's no double line where the last section meets the footer's `border-t`.

### index.html
- Text column has `min-w-0` to prevent long EN words (e.g. "STRONGER.") from compressing the adjacent showcase column via flex min-width.
- `.glass-card` has `min-height: 520px` — prevents cards from changing height when language changes (Cyrillic/Latin font metrics differ).
- `db-desc` paragraph has `min-h-[4.5em]` for the same reason.
- Pricing section: `<section id="pricing" class="scroll-mt-24 ...">` — `scroll-mt-24` ensures the SteamOS/Windows toggle buttons are visible when scrolling from the nav "Prices" link.
- Compatibility section sits at `margin-top: -6px` relative to the pricing section above it.
- All `✓ Verified` labels in game rows use `data-key="verified-label"` (translated: `✓ Ühilduv` / `✓ Совместимо` / `✓ Compatible`).
- Compat-works/native/no: restructured as single `<span data-key="...">` — translations include the `✓`/`✗` symbol so there's no double-symbol.

### shop.html
- GPU / CPU category tabs; NVIDIA / AMD / Intel brand sub-tabs.
- Brand sub-tab active colors: NVIDIA `#76b900`, AMD `#ed1c24`, Intel `#0071c5` — applied via inline `style`, not `.os-switch-btn.active` class, to avoid class override.
- Grid visibility toggle uses CSS classes `shop-grid-visible` / `shop-grid-hidden` (same pattern as `os-grid-*` in index.html). `shop-grid-hidden` uses `position:absolute;width:100%` to keep layout stable.
- `brands-cpu` div and hidden grids use `style="display:none"` — **not** Tailwind `hidden` — because Tailwind CDN may generate `.flex` after `.hidden`, making elements always visible.
- On init, an IIFE applies brand button colors only — it does NOT call `showGrid()`, so the default `grid-gpu-nvidia` (which starts with class `shop-grid-visible` in HTML) stays visible.
- Products currently listed: PNY RTX 5080 16GB OC (1219 €), PNY RTX 5080 16GB ARGB OC (1288 €). AMD GPU / Intel CPU / AMD CPU show "Coming Soon" placeholders.

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

### api/payment/notify.js
- LHV/EveryPay webhook handler. Verifies payment server-side via `GET /v4/payments/{ref}` — never trusts callback body alone.
- **Idempotency:** before sending emails, checks `order.status === 'in_progress' || order.emailSent`. If true, returns 200 without re-sending. Redis update sets `emailSent: true`.
- Sends two emails on `settled`: internal notification to `info@sfflab.ee` + customer confirmation in ET/RU/EN based on `order.language`.
- `buildConfirmationHtml`: order number in subtitle, no separate order-number block, no ✓ emoji, single "Track Order / Tellimuse staatus / Статус заказа" button linking to `https://sfflab.ee/?order=<orderNumber>`.
- TODO comment in file: revert `LHV_BASE_URL` from sandbox to `https://payment.lhv.ee/api/v4` for production.

## Legal
- Company: SFF Lab OÜ
- Reg: 17506407
- VAT: EE102985942
- Address: Sinimäe tn 16-30, Tallinn