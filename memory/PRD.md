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
  - Admin invoice now dynamically labels "Pay by Bank (Wallid)" vs "PayPal" vs "Manual" based on `payment_provider`
  - PayPal backend routes (`/api/paypal/*`) intentionally kept for referencing historical PayPal-paid orders
  - **⚠️ £1 real test payment pending** — webhook URL + secret already sent to Wallid by user

## Backlog / Next Tasks
### P0 — Ready to Deploy
- User to click **Deploy** to push to production: Invoice generator, Delete Order feature, Apple Pay verification file, stock decrement/guard logic

### P1
- Test "Delete Order" feature end-to-end (backend + admin UI)
- Generate branded AI images for Syringes & Wipes, category cover tiles, home page hero

### P2
- Automated order confirmation emails (Resend/SendGrid — needs user API key)
- Google Analytics / Meta Pixel tracking (needs user tracking IDs)

### P3
- Promo / discount codes
- Restock notifications / low-stock admin alert
- Automated re-hide product when stock reaches 0 (currently just badge + disabled button)

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
