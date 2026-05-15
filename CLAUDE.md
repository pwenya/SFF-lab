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
nav.js            — shared nav + modal + i18n engine (injected into every page)
IMG/              — product images (MoodBlack.1.png, TerraJade.2.png, etc.)
start.bat         — launches local dev server
```

## nav.js — how the shared nav works
Every HTML page includes `<script src="nav.js"></script>` just before `</body>`.
nav.js injects the nav bar + order-status modal into `document.body` on DOMContentLoaded.
It also defines these globals used by all pages:
- `setLanguage(lang)` — applies ET/RU translations, reads `window.pageTranslations` per page
- `openModal()` / `closeModal()` / `submitOrder()` — modal controls
- Ripple effect on `.btn-ripple` elements
- Nav scroll opacity

## i18n pattern
- Language stored in `localStorage.selectedLanguage` (default: `'et'`)
- nav.js handles nav-level keys: `nav-pricing`, `nav-status`
- Each page sets `window.pageTranslations = { et: {...}, ru: {...} }` before `nav.js` loads
- Elements get translated via `data-key="some-key"` attribute

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

## Legal
- Company: SFF Lab OÜ
- Reg: 17506407
- VAT: EE102985942
- Address: Sinimäe tn 16-30, Tallinn