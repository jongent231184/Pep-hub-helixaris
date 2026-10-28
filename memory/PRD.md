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
- ✅ **Xoala card payments (sandbox-verified)**: `backend/routes/xoala_routes.py` — hosted "Standard Checkout". `POST /api/xoala/create-payment` returns signed form (MD5 `memberId|totype|amount|txn|redirectUrl|secret`), frontend auto-POSTs to `{XOALA_BASE_URL}/transaction/Checkout`. Xoala POSTs result to `/api/xoala/return` (verify `paymentId|txn|amount|status|secret`, amount match → `mark_order_paid` → 303 to `/order-confirmation/{n}?xoala=1` or `/checkout?xoala=failed`), JSON to `/api/xoala/notify` (idempotent). txn id = `{order_number}-{attempt}`. Callback host derived from request Origin (works per-domain). Env: `XOALA_BASE_URL`, `XOALA_MEMBER_ID` (14850), `XOALA_TOTYPE` (Xoala), `XOALA_PARTNER_ID` (478), `XOALA_TERMINAL_ID` (sandbox 9962 = EUR/VISA), `XOALA_CURRENCY` (sandbox EUR — **sandbox has no GBP terminal**), `XOALA_SECRET_KEY` (secret card). Button hidden when not configured. Checkout shows "Pay by Card" (TEST MODE note in sandbox). Tests: `tests/test_xoala.py` (7). Full sandbox flow verified: card 4761340000000035 → Tribe 3DS simulator → paid + emails. **Go-live**: live host + GBP terminal id + live secret (live slot) + `XOALA_CURRENCY=GBP`; then add Xoala to footer payment badges and admin provider badge copy.
- ✅ **Calculator**: Eloralintide 10mg pen added to Pen Protocol tab (`PenProtocol.jsx` COMPOUNDS: 10 mg / 2 ml → 0.05 mg per click, 20 clicks/mg, weekly). The vial preset card was removed again at user request.
- ✅ **Eloralintide pen image**: `frontend/public/pens/eloralintide-10mg-pen.png` (user to set path on the live product).
- ✅ **Pack images regenerated from the real vial photo** (image-edit of `eloralintide-10mg.png` → true likeness; 848×1264). **Research profiles for all 12 bundled** in `backend/data/product_pack_oct2026_profiles.json` (generated via `backend/generate_pack_profiles.py`, canonical 2–8 °C storage); the seed attaches them on create, and `need_profile` lets the button attach profiles to already-imported pack products. **"Just landed" strip** (`components/JustLanded.jsx`) on Home: horizontally scrollable row of visible products created in the last 14 days, auto-hides after.
- ✅ **October 2026 vial pack (12 products)**: images in `frontend/public/vials/*.png` (GHP-branded, generated via `backend/generate_product_pack_oct2026.py`), data in `PACK_OCT_2026` in `routes/admin_seed_routes.py`. `GET/POST /api/admin/seed/product-pack-oct-2026` (idempotent; skips existing slugs). Admin → Products shows "Add new vials (N)" while any are missing. Prices are researched suggestions (see chat/table) — user to adjust. ACE-031 10mg priced at £165 (market only lists 1mg at £25–47).
- ✅ **Resend invoice emails (Orders)**: `email_service.send_invoice_email` — unpaid + bank details configured → subject/heading "New payment option: pay by bank transfer" with a bank-details block (account, sort code, number, reference = order number, amount) + PDF (with bank details); paid → plain "Your invoice" copy. Endpoints: `POST /api/orders/admin/{id}/resend-invoice`, `POST /api/orders/admin/resend-invoices {order_ids}` (bulk, per-order sent/failed). Stamps `invoice_resent_at` / `invoice_resend_count` on the order (exposed in OrderOut). UI: per-row Send icon, "Email invoices to unpaid (N)" header button (uses the currently filtered list, confirm first), "Email invoice" button on order detail.
- ✅ **Bank-transfer feature merged into the GHP job** (from fork commit `0834d96` via the Pep-hub-helixaris mirror; merge `28f9ac5`). Fork lesson: NEVER publish a forked GHP chat as a Replace — it switched the live site to the fork's DB (restored by support). Update Helixaris only from inside the Helixaris chat; bring fork code over via GitHub + `git merge`, then Republish from the GHP chat.
- ✅ **Organisation visibility in Traffic**: `backend/ip_org.py` resolves visitor IP → ASN/network owner via Team Cymru DNS (keyless) + reverse DNS, cached 30 days in `ip_orgs` (TTL index). Classifies `public` (gov/NHS/edu/BBC…), `org` (companies), `consumer` (O2/EE/BT/Sky…), `hosting` (AWS/Cloudflare…), `unknown`. Page views enriched async (`org`, `asn`, `org_kind`). Traffic page shows "Organisations viewing the site" panel (public + org only, consumer/hosting hidden) with visitors, views, pages, last seen; public-sector flagged.
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

### ✅ 2026-10-23 — Manual bank transfer payment option (preview only, NOT yet live)
- Admin Settings → "Bank transfer" (account name / sort code / account number). Option hidden while account number is blank.
- Checkout: "Pay by bank transfer" button under Wallid (needs compliance tick) → shows details + reference = order number + amount, clears cart, customer can download the PDF invoice (GET /api/orders/{id}/invoice.pdf). POST /api/orders/{id}/bank-transfer sets payment_provider=bank_transfer.
- Unpaid PDF + admin printable invoice show the bank block; admin list shows an "Awaiting transfer" badge. Stock is NOT held until paid.
- Admin PATCH payment_status→paid now runs mark_order_paid (stock decrement once, promo usage, confirmation email + paid invoice, source=manual, status=processing). Tests: iteration_22 + backend/tests/test_bank_transfer.py (6/6).
- ⚠️ This chat is the FORK job 411a925d (preview dual-brand-store). NEVER publish it as Replace on GHP. Ship via GitHub → pull into the original GHP chat (ca026de8) → republish there.

### ✅ INCIDENT RESOLVED 2026-10-21 — Emergent support re-bound GHP live to `ghp-ecommerce-pay-test_database`. Verified read-only (iteration_21.json, 100%): orders up to GHP-1921, 66 products / 40 variants. User chose NOT to import stray GHP-054/055. History below kept for reference.
### 🚨 INCIDENT 2026-10-20 — GHP live bound to WRONG DB (history)
- Fork job 411a925d (this chat, preview dual-brand-store) published as "replace" on deployment eed29dfe (ghp-ecommerce-pay) → live now uses `dual-brand-store-test_database` (45 orders, GHP-055, £37.50 stale products). Real DB `ghp-ecommerce-pay-test_database` INTACT (1896 orders, latest GHP-1921, counters.seq 1921). RCAs in /app/deployer-agent-docs/.
- Rollback + republish from original job ca026de8 did NOT fix (system secrets regenerated from bad prod state). Only Emergent support can re-bind MONGO_URL+DB_NAME. Support disputes account ownership (user acct jongent84@gmail.com). Site set PRIVATE.
- After re-bind: verify live orders → GHP-1921; merge Clare Ballinger's GHP-054 (failed) & GHP-055 (pending) from dual-brand DB as GHP-1922/1923, bump counters.seq.
- Fallback (only if support can't help, user decides end of day): copy prices/variants from helixaris.com API, set counter to GHP-2000; orders/ambassadors/coaching data would be lost.
- NEVER publish a forked chat as Replace on GHP again; update Helixaris only from its own chat.

### 🔵 PLANNING — White-label Hub (user said "planning only, don't build yet")
User choices: clients sell their OWN stock + ship own orders; Hub calculates monthly sales and invoices a % commission (clients use their own merchant accounts — never route through ours); goal = shared engine; 1–5 clients in year 1.
Platform constraint (support_agent, unverified): ONE custom domain per Emergent deployment → true single-deployment multi-domain needs a proxy (e.g. Cloudflare Worker) proof-of-concept first.
Phased plan:
- Phase 1: Move brand.js config into DB "Store Settings" (admin-editable logo/colours/legal/emails/payment keys); new store = fork + deploy + fill form, no code edits.
- Phase 2: Hub "Sales Reporting" API per store (signed key) → Hub pulls monthly net sales.
- Phase 3: Hub commission engine — % per client, monthly statement + PDF invoice emailed via Resend, paid/unpaid status.
- Phase 4: Client onboarding checklist in Hub + white-label SaaS agreement (client owns compliance).
- Phase 5 (optional): Cloudflare-proxy PoC to run all stores on one deployment; migrate only if PoC passes.

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
