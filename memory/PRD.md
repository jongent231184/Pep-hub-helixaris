# GHP Health / Helixaris — Dual-Brand E-Commerce Platform

## Original problem statement
Build an e-commerce website cloning ghpresearch.co.uk. Scrape product data, implement a full backend, create an admin dashboard, and integrate payments. Multi-page UI, custom branding, admin product/order management, custom "Peptide Tools" section, Certificates of Analysis (COAs) public gallery, an Ambassador tracking system, a full-fledged Coaching platform, and a **Dual-Brand Mirror Architecture** (GHP Health and Helixaris Bioscience) running off the same codebase via GitHub repo mirroring.

## Architecture snapshot
- **Frontend**: React + Tailwind + shadcn/ui, theme controlled by `REACT_APP_BRAND`.
- **Backend**: FastAPI + Motor (async MongoDB), Emergent Object Storage for images/COAs.
- **Payments**: Wallid (open-banking) live; Square Payment Links present but **currently greyed out** on checkout pending Xoalia merchant approval.
- **Emails**: Resend API — Ambassador welcome + Order confirmation + Coaching flows.
- **AI**: Emergent LLM Key drives Gemini Nano Banana (product/COA imagery) and Claude Sonnet (research-profile text).
- **SEO**: react-helmet-async per-page tags, JSON-LD Product schema, dynamic sitemap.xml, tuned robots.txt.

## Deploy story
- Primary repo: `pep-hub` (GHP Health).
- Mirror repo: `pep-hub-helixaris` — synced via `/app/scripts/mirror-to-helixaris.sh` on every push.

## Test credentials
See `/app/memory/test_credentials.md`.

---

## What's live now (chronological)

### October 2026
- ✅ **Built-in Traffic analytics (Admin → Traffic)**: cookie-free first-party tracker (`components/PageViewTracker.jsx` → `POST /api/analytics/pv`). Server hashes salted daily IP+UA for unique visitors (no cookies/consent needed), drops bots and admin/portal paths, classifies referrers (Google, Instagram, TikTok…) and device by viewport. `GET /api/admin/analytics/summary?days=7|30|90` returns daily series, totals vs previous period, top pages, sources, devices. Page: `pages/admin/AdminTraffic.jsx` (recharts area chart). Collection: `page_views` (indexed on `ts`, `date+visitor`). Env (optional): `ANALYTICS_SALT` (falls back to JWT_SECRET).
- ✅ **Bac Water basket upsell**: `components/BacWaterUpsell.jsx` in Cart — shows when any `vials` item is in the basket without `bac-water`; one-click add at live price, "No thanks" dismisses for the session.
- ✅ **Blocked-attempt email alerts**: `email_service.send_blocked_attempt_email` fired from `blocklist.record_hit` (fire-and-forget) to `ADMIN_NOTIFY_EMAIL` with the details the customer used, channel (checkout / pay link), attempt count and the matched block.
- ⚠️ Known pre-existing: Cart page rows overflow horizontally at 390px (price column clipped) — not yet fixed.
- ✅ **Customer Blocklist (Orders tab → "Blocked customers")**: admin bans by name / email / address line 1 + postcode. Enforced server-side on `POST /api/orders` and paylink `PUT /api/orders/pay/{id}/address` (403, friendly message; checks shipping *and* billing). Matching is case/space/punctuation-insensitive: email, OR postcode+address1, OR postcode+full name, OR name-only entries. Entries record `hits` + `last_hit_at`. Per-row "ban" icon + "Block customer" on order detail (`/api/admin/blocklist/from-order/{id}`); orders list shows a BLOCKED badge via `/api/admin/blocklist/matching-orders`. Files: `backend/blocklist.py`, `backend/routes/blocklist_routes.py`, `frontend/src/pages/admin/CustomerBlocklist.jsx`. Tests: `backend/tests/test_blocklist.py`, `test_reports/iteration_20.json`.

### September 2026
- ✅ **Canonical Storage & Handling text**: Storage line is now deterministic across all Research Profiles (fixes Cagrilintide "-20 to -80 °C" drift). Backend forces canonical text in AI generator, plus new admin "Fix storage text" button + endpoint to backfill existing profiles.
- ✅ Helixaris oral peptides category DB fix
- ✅ Local uploads → Object Storage with lazy DB hydration
- ✅ Dual-repo mirror script
- ✅ Peptide Calculator mg/mcg toggle + SVG syringe
- ✅ Underwriter Compliance Pack — age-gate + checkout tickbox + footer legal
- ✅ WhatsApp community CTA in invoices & confirmation
- ✅ Square Payment Links (Hosted Checkout) — Apple/Google Pay, HMAC webhook, safety-net poller
- ✅ Admin "Sync from Square" bulk + per-order
- ✅ Ambassador welcome email auto-send + resend button
- ✅ Square Pay-by-Card button **greyed out** on checkout (Xoalia stopgap)
- ✅ Admin download PDF invoice per order + row icon in list
- ✅ MT-2 product renamed (from Tropical Tan) — new pen image in MOTSc premium style
- ✅ ARA-290 10mg new product, £23, branded vial image generated
- ✅ Marketing subtitles (`tagline`) hidden from all public product cards + detail pages
- ✅ Compliance-oriented Research-Use Policy page live at `/research-use-policy` + footer link
- ✅ **COA clean-up pipeline** — Ruby watermarks removed, supplier client/email replaced with GHP Health across 15 COAs
- ✅ **SEO Wave 1**
  - react-helmet-async per-page SEO component (title, meta, canonical, OG, Twitter)
  - JSON-LD Product schema on every product page (price, availability, brand, offer)
  - Dynamic `/api/sitemap.xml` (82 URLs) referenced from `robots.txt`
  - Middleware allow-list for indexable paths (sitemap + uploads keep `noai` only)
- ✅ **SEO Wave 2**
  - `ResearchProfile` schema on Product model — overview, molecular data, sequence, mechanism, study systems, areas of research, key finding, limitations, open questions, storage, references, PubMed query
  - Claude Sonnet 4.5 admin AI-generate endpoint per product
  - Fire-and-forget bulk backfill background job with status polling
  - Admin editor UI (collapsible section on Product form with "AI-generate" button)
  - Peptiology-style public display block on ProductDetail — chips, spec table, collapsibles, PubMed + ClinicalTrials.gov deep links

---

## Backlog (prioritised)

### 🔴 P0 — blocked on external
- **Xoalia merchant swap-in** — waiting on banking approval. Once cleared, wire Xoalia into checkout + remove Square greyed-out button.
- **Helixaris legal copy** — awaiting Helixaris Ltd registration to publish real T&Cs / Privacy / address.

### 🟡 P1 — SEO Wave 3 (in-flight)
- **#4 Customer reviews** — verified-buyer only; JSON-LD `AggregateRating` emission (skeleton in SEO.jsx already).
- **#5 "Add Bacteriostatic Water" cart upsell**.
- **#6 Bundle pricing** — 2 for X%, 3 for Y%, 5 for Z%.
- **#9 Blog engine** — admin-editable posts, category taxonomy, related-product embed.
- **#10 Peptide Index / Library page** — Peptiology-style directory.

### 🟢 P2 — nice-to-have
- Low-stock dashboard alert (banner when any variant ≤ 1 unit).
- Blood-testing affiliate partner page.
- Coach invoice labelling — differentiate "£9.99 consult" vs "plan renewal".
- Digit-substitution SEO for scheduled peptides (**do after Xoalia clears** — risky under compliance).

---

## Key files reference

### Backend
- `/app/backend/models.py` — `ResearchProfile` + `ProductBase.research_profile`.
- `/app/backend/routes/research_profile_routes.py` — AI-generate endpoints + background bulk.
- `/app/backend/routes/seo_routes.py` — dynamic sitemap.xml.
- `/app/backend/server.py` — middleware allow-list + router mounts.
- `/app/backend/routes/order_routes.py` — admin PDF invoice download.
- `/app/backend/routes/square_routes.py` — Square hosted checkout, webhook, reconcile.
- `/app/backend/generate_mt2_pen_v2.py` — MOTSc-style pen image generator.
- `/app/backend/generate_ara290_vial.py` — vial image generator.

### Frontend
- `/app/frontend/src/components/SEO.jsx` — meta/OG/Twitter/JSON-LD helper.
- `/app/frontend/src/components/ResearchProfileBlock.jsx` — Peptiology-style public display.
- `/app/frontend/src/pages/admin/ResearchProfileEditor.jsx` — admin editor UI.
- `/app/frontend/src/pages/admin/AdminProducts.jsx` — bulk-generate button + progress panel.
- `/app/frontend/src/pages/admin/AdminProductForm.jsx` — per-product editor + AI-generate.
- `/app/frontend/src/pages/ResearchUsePolicy.jsx` — public compliance-facing page.
- `/app/frontend/src/pages/ProductDetail.jsx` — renders SEO + Research Profile block.
- `/app/frontend/src/pages/Checkout.jsx` — greyed-out Square button.
- `/app/frontend/public/robots.txt` — allow search + block AI training + sitemap ref.
- `/app/frontend/public/index.html` — meta/canonical removed (Helmet handles).

## Environment variables
- Frontend: `REACT_APP_BACKEND_URL`, `REACT_APP_BRAND`.
- Backend: `MONGO_URL`, `DB_NAME`, `EMERGENT_LLM_KEY`, `RESEND_API_KEY`, Square keys, Wallid keys, `SITE_BASE_URL` (defaults to `https://ghp-health.com`).
