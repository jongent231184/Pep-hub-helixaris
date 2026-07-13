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
