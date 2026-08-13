# GHP-Health E-commerce — PRD

## Original Problem Statement
Build an e-commerce website cloning www.ghpresearch.co.uk. Scrape product data, implement a full backend, create an admin dashboard (Squarespace-style), and integrate payments (Worldpay → switched to PayPal).

## Core Requirements
- Multi-page storefront (Home, Categories, Product Detail, Cart, Checkout, Account, About, Contact, Wholesale)
- Custom GHP-Health branding across pages and product imagery
- Admin dashboard (products, categories, orders, settings)
- PayPal payment integration (live)
- Password-gated launch option (Squarespace-style)

## Tech Stack
- Frontend: React (CRA), Tailwind, shadcn/ui, React Router
- Backend: FastAPI, Motor (async MongoDB), PyJWT
- Payments: PayPal Smart Buttons SDK (LIVE)
- Image gen: Gemini 2.5 Flash via Emergent LLM Key

## Implemented (Historical)
- React storefront clone with real product catalog (34 SKUs)
- FastAPI + MongoDB backend, JWT auth, admin role
- AI-generated branded imagery for Vials, Pens, Nasals, Bundles
- Deployment to `www.ghp-health.com` (Emergent)
- Site password gate / publish toggle
- PayPal sandbox → LIVE integration verified
- Customer + admin password reset
- Invoice generation UI (PDF/Print) — in preview, not yet deployed
- Delete Order feature (admin) — in preview, not yet deployed
- Apple Pay `apple-developer-merchantid-domain-association` hosted at `/.well-known/`

## Recently Added (Feb 2026 fork session)
- **Stock reset**: All 34 products set to `stock: 5` on both preview AND production DBs (bulk via admin API).
- **Auto stock decrement on paid orders**:
  - PayPal `create-order` refuses orders that exceed available stock (409 + friendly toast)
  - PayPal `capture-order` performs atomic idempotent stock `$inc: {stock: -qty}` on the first paid transition; double-fire captures are safely a no-op
  - Storefront shows "Sold Out" badge on ProductCard and disables Add-to-Basket on ProductDetail; qty dropdown capped to available stock; "Only N left" nudge when stock ≤ 5
- **Separate billing & shipping address at checkout (Feb 2026)**:
  - Checkout now has a "Billing Address" section with a "Same as shipping address" checkbox (checked by default)
  - When unchecked, a full billing form appears (name, address, city, postcode, country, optional phone)
  - Backend `OrderCreate`/`OrderOut` now accept optional `billing_address`; when omitted it defaults to `shipping_address`
  - Admin order detail displays a separate "Billing address" block only when it differs from shipping
  - Admin invoice + PDF email invoice both render a "Ship to" column alongside "Bill to" only when addresses differ
- **Saved address book (Feb 2026)**:
  - New collection `addresses` with per-user CRUD via `/api/addresses` (GET mine, POST, PUT, DELETE)
  - `My Account` page has a "Saved Addresses" section with add/edit/delete + set-default
  - Checkout auto-loads the default saved address for logged-in customers (email + all shipping fields pre-populated)
  - Dropdown lets customer pick any other saved address for shipping or billing
  - "Save this address to my account for next time" checkbox on new addresses; auto-saved after order creation
- **Wallid Pay-by-Bank integration (Feb 2026)**:
  - New router `/api/wallid` (config, create-payment, webhook, verify-status)
  - LIVE credentials in `backend/.env` (WALLID_KEY_ID, WALLID_KEY_SECRET, WALLID_WEBHOOK_SECRET, WALLID_BASE_URL, FRONTEND_PUBLIC_URL)
  - Webhook does HMAC-SHA256 signature verification on raw body with 5-min replay window and constant-time compare
  - New `wallid_events` collection with unique index on `event_id` — full idempotency across replays/retries
  - Shared `order_helpers.mark_order_paid()` handles atomic paid transition + stock decrement + promo bump + confirmation email
  - **PayPal fully removed from UI** — Checkout, PayLinkPage (admin invoice pay page), and Footer icons all switched to Wallid Pay-by-Bank only
  - **Bank trust badges** (Feb 2026): new `BankTrustBadges` component rendered under the Pay-by-Bank CTA on both Checkout and PayLinkPage. Shows Barclays, HSBC, Monzo, Starling, Revolut logos + "+ Lloyds, NatWest, Santander & 50+ more" text for breadth. Uses `cdn.simpleicons.org` in slate tint.
  - **Iframe modal overlay attempted (Feb 2026, reverted)**: We built `WallidPaymentModal` to embed `pay.wallid.co` in an iframe so customers stay on our site. It worked up to the Wallid bank picker but failed at the "Proceed to bank" step because Barclays / HSBC / Lloyds all set `X-Frame-Options: DENY` on their OAuth pages — the browser refuses to load the bank inside an iframe. Reverted to full-page redirect (industry-standard for Pay-by-Bank; TrueLayer, Volt, Yapily all do the same). Modal component file deleted.
  - **Branded redirect interstitial** (Feb 2026): new `RedirectingOverlay` component. When customer clicks "Pay by Bank" a full-screen dark overlay with the GHP-Health logo, pulsing green status dot, "Redirecting to your bank securely…" heading, and "Please don't close this window." subtitle appears immediately — fills the 1-2s of blank browser between click and Wallid loading. Rendered in both Checkout and PayLinkPage while `wallidLoading === true`.
  - **Payment success splash** (Feb 2026): new `PaymentSuccessSplash` component on `OrderConfirmation` page. Brief GHP-logo splash with green checkmark badge, "PAYMENT RECEIVED · THANK YOU FOR YOUR ORDER" and the order number. Auto-dismisses after 2.5s (fade transition at 2s). Only fires once per order via `sessionStorage['ghp_splash_{orderId}']` — refreshes don't repeat.
  - **Payment verification source tracking** (Feb 2026): Orders now record how their `paid` status was set:
    - `webhook` → **AUTO-VERIFIED** badge (emerald) — Wallid webhook fired instantly
    - `polling` → **VERIFIED VIA POLL** badge (sky) — auto-verify on confirmation page or admin sync button caught it
    - `manual` → **MANUAL** badge (slate) — admin flipped payment status via dashboard
    - Displayed as compact pills on both admin orders list and order detail page. Helps spot webhook health issues at a glance.
  - **Auto-verify on order confirmation** (Feb 2026): when a Wallid customer lands back on `/order-confirmation/{orderId}?wallid=1` we poll `/api/wallid/verify-status` every 4s (up to ~30s) to self-heal orders when the webhook is late or missing. Small "Verifying your payment with your bank…" pill shows during polling.
  - **"Sync from Wallid" admin button** (Feb 2026): green refresh button on the order detail page for any Wallid order. One-click force-refresh of status from Wallid's API.
  - **Branded email + invoice upgrade** (Feb 2026):
    - GHP-Health logo now appears at the top of the PDF invoice (fetched once, cached in memory as bytes, embedded via ReportLab `Image` flowable — graceful fallback to text if network fails)
    - Logo image also embedded in the customer HTML order-confirmation email header (dark navy bar)
    - Logo also in the admin new-order notification email
    - Both HTML emails now display a **BILL TO / SHIP TO** two-column block when the customer entered different billing and shipping addresses (single block when they match) — matches the PDF invoice
    - Customer email now includes a **"What happens next?"** three-step timeline (Order confirmed → Dispatched within 24h → Delivery in 1-3 days · Royal Mail Tracked) plus a reply-to-us prompt — meant to reduce inbound "where's my order?" queries
  - **Peptide reconstitution calculator** (Feb 2026): new `/peptide-calculator` page. 4-step chip selector (insulin syringe size → vial strength mg → BAC water ml → target dose mcg). Instantly shows units to draw + concentration + doses-per-vial. Amber overflow warning when the dose exceeds the selected syringe. Reconstitution best-practice steps + "For research use only" callout below. Nav link "CALCULATOR" added to Header (desktop + mobile drawer).
  - **Saved dose plans** (Feb 2026): logged-in customers can title and save any calculator setting under `/api/dose-plans` (per-user, up to 50). Saved plans display as pill chips at the top of the calculator; click to reload all 4 inputs, trash icon to delete. Guest users see a "Log in or create an account to save" CTA in the same spot.
  - **Pen Protocol tab** (Feb 2026): new tab on the same `/peptide-calculator` page. Pen strength selector (10/20/30/40/50/60 mg), auto click-to-mg ratio (10 clicks/mg for 10-30mg pens; 5 clicks/mg for 40-60mg pens), full dose reference table (0.25-5 mg), custom-dose calculator with amber over-capacity warning. Page heading renamed to "Peptide Tools".
  - **Mobile header account link fix** (Feb 2026): the "My Account" link was hidden below the `sm:` breakpoint (640px) so it was invisible on iPhone Safari. Now shows as a User icon on all sizes (label "Log In" when guest, "My Account" when authed). The mobile hamburger drawer also gets a prominent blue **"Log In / Register"** pill at the top — impossible to miss.
  - **Guest account onboarding** (Feb 2026):
    - Checkout: guest-only banner *"Already a customer? Log in to auto-fill your details and see all past orders."* above the contact form, with a Log-In button that returns customer to `/checkout` after auth (via `?returnTo=` param)
    - Order confirmation: guest-only "Save this order to your account" card. Pre-fills the customer's email; they set a password and click Create account — logs them in immediately
    - Backend: on register AND login, `_adopt_guest_orders(user_id, email)` runs and links any past guest orders (matching the account's email) to the new user_id. Confirmed working via DB check + `/api/orders/mine` returning adopted orders
  - Admin invoice now dynamically labels "Pay by Bank (Wallid)" vs "PayPal" vs "Manual" based on `payment_provider`
  - PayPal backend routes (`/api/paypal/*`) intentionally kept for referencing historical PayPal-paid orders
  - **⚠️ £1 real test payment pending** — webhook URL + secret already sent to Wallid by user

## Recent additions (Feb 2026)
- Peptide Tools page with tabs: Reconstitution Calculator + Pen Protocol
- Pen Protocol tab: click-to-mg reference table + custom-dose click calculator
- **Pen Duration estimator**: input weekly dose → returns weeks/days of supply and estimated run-out date
- Save/Load dose plans for logged-in users (`/api/dose-plans`)
- **Ambassador programme**: admin creates ambassador accounts with linked promo codes; ambassadors get a restricted portal at `/ambassador` showing their orders, earnings (15% of net sales by default) and payout history. CSV export available. Admin can record payouts from the Ambassadors tab.
- **Wallid resilience**:
  - Bulk "Sync from Wallid" button on Admin → Orders (polls every pending order in one shot)
  - Webhook attempt logging: every webhook delivery is stored in `wallid_webhook_attempts` with reason if rejected
  - `GET /api/wallid/debug/webhook-health` (admin) — surfaces secret loaded state + last 20 attempts for RCA
  - **Background poller**: on server startup, spawns an asyncio task that every 60s polls Wallid for any pending order created in the last 24h
- **Inline stock editing** on Admin → Products (replaces old "Featured" column). Amber highlight when ≤ 3.
- **Certificates of Analysis**: admin uploads PDF/image lab reports via `/admin/coas` (max 20MB). Public gallery at `/coa` with search, batch labels, test date, download button. Linked from footer + main header nav.
- **Checkout retry fix** (NEW — bug fix): Wallid payment failures no longer create duplicate orders. Root cause: cart was cleared before the Wallid redirect and `?wallid=failed` was ignored — so customers saw an empty basket, re-added items, and checked out again, generating a fresh order each attempt. Fix: cart is preserved through the payment flow (only cleared on the confirmation page when `payment_status='paid'`), and `?wallid=failed` now restores the pending order from `localStorage.ghp_pending_wallid_order`, jumps to the payment step, and shows a red "Payment didn't complete — retry" banner. The Retry button reuses the same order id. Verified end-to-end by testing agent (10/10 backend tests + frontend simulation pass, no duplicate orders on retry).

## New endpoints (Ambassador)
- `POST/GET/PUT/DELETE /api/ambassadors/admin[/:id]` – admin management
- `POST/DELETE /api/ambassadors/admin/:id/payouts` – record payouts
- `GET /api/ambassadors/me` – ambassador self-service profile + earnings
- `GET /api/ambassadors/orders` – orders using their code (paid only)
- `GET /api/ambassadors/orders/:id` – single order detail
- `GET /api/ambassadors/payouts` – payout history

## Backlog / Next Tasks
## Coaching Feature (Feb 2026 — Stages 1-5 complete)
- Stage 1: Public intake form (`/coaching`) with waiver checkbox → coaching_requests collection + coach notification email
- Stage 2: Coach role + coach portal at `/coach` (dashboard, requests inbox, clients list)
- Stage 3: Protocol builder — coach creates a titled protocol per client, adds items (linked to store products or custom), schedules dose calendar entries
- Stage 4: **Paid session gate** — coach clicks "Send payment link" on a protocol; backend creates a paylink order tied to the protocol (default £9.99, via coach's `default_price`). Customer sees an amber "Payment required" banner in their My Account > My Coaching section. Once the order is marked paid (webhook / poll / admin), `_sync_protocol_payment` flips `protocol.paid=true` on next fetch and the full plan (items + calendar) unlocks.
- Stage 5: **Coach ↔ client messaging** thread in `coach_messages` collection — both parties can send/read from their respective pages. Also new "At-risk clients" widget on `/coach` dashboard that surfaces clients with unmarked calendar entries in the last 3 days (with `missed_count`).
- Compliance guardrails: uses "peer education", "protocol", "client" (never "prescribe", "patient", "medical").
- **Routing fix**: added `<Route path="/paylink/:orderId">` alongside `/pay/:orderId` so both aliases resolve to `PayLinkPage`. Backend `/api/coaching/coach/protocols/{id}/paylink` emits `payment_link=/paylink/{orderId}`.
- **Coach portal tweaks (Feb 2026)**: (a) product search now uses public `Products.list()` (was calling admin-only endpoint → dropdown was empty); (b) Frequency input replaced with multi-select day chips (Mon…Sun) + AM/PM/AM+PM dropdown — stored as e.g. `"Mon+Wed+Fri · AM"`; (c) new 7-day visual week grid above the calendar table with a `Week 1..N` selector (N = protocol.duration_weeks) — calendar entries render as colored pills inside their day cell (sky = pending, emerald + strike-through = done), today's cell gets a sky ring.

### P2
- "For research use only" checkbox on age-gate modal
- "Order shipped" automated email with tracking info
- Low-stock dashboard banner (any product/variant ≤ 1 unit)
- Google Analytics / Meta Pixel (needs user tracking IDs)

### P3
- Branded AI images for remaining generic items (syringes/wipes, category tiles, hero)
- Promo / discount codes UI improvements
- Auto-hide product when stock reaches 0

## Key Endpoints
- `POST /api/paypal/create-order` (with stock guard)
- `POST /api/paypal/capture-order` (with idempotent stock decrement)
- `GET /api/paypal/config`
- `DELETE /api/orders/{id}`
- `PUT /api/products/{id}` (admin — stock edits from dashboard)

## Data Models
- users: {id, email, password_hash, role, first_name, last_name}
- products: {id, slug, name, category, price, image, description, badges, options, stock}
- categories: {id, name, slug, image}
- orders: {id, order_number, customer, items, total, payment_status, status, payment_id, paid_at}
- settings: {site_name, contact_email, published, site_password, ...}

## Credentials (Preview + Production identical)
- Admin: `admin@ghp-health.com` / `GHP-Health26`
- Site preview gate: `preview2026`
- Production URL: `https://www.ghp-health.com`
