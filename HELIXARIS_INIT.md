# Helixaris Bioscience — Initialisation Instructions

You are the coding agent for the **Helixaris Bioscience** deployment. This app
was forked from `ghp-ecommerce-pay`. It shares the codebase but has its own
MongoDB, its own product catalog, and its own brand assets.

Everything in this file is what you should do on your FIRST turn (or whenever
the user asks you to "reset Helixaris to a clean state").

---

## ⚡ TL;DR — After every GitHub sync run these two commands

```bash
# 1. Make sure the frontend builds with Helixaris branding (see § 0 below)
grep REACT_APP_BRAND /app/frontend/.env || echo "REACT_APP_BRAND=helixaris" >> /app/frontend/.env
sudo supervisorctl restart frontend

# 2. Ensure DB has all latest categories (esp. oral-peptides) + products
cd /app/backend && python init_helixaris.py
# If /category/oral-peptides shows "Category not found", run the targeted fix:
cd /app/backend && python fix_helixaris_orals.py
```

Also — if production shows GHP branding after a redeploy, the deployment env
var `REACT_APP_BRAND=helixaris` is missing on the Emergent deploy. Add it in
the deploy panel and redeploy — it's baked into the JS bundle at build time
so a browser refresh alone won't fix it.

---

## 0. Frontend brand env var (CRITICAL)

The frontend reads `REACT_APP_BRAND` **at build time** to pick between GHP
and Helixaris theming (logos, colours, meta tags, admin header). CRA inlines
`process.env.REACT_APP_*` into the JS bundle when it builds, so:

- **Preview pod**: put `REACT_APP_BRAND=helixaris` in `/app/frontend/.env`
  and `sudo supervisorctl restart frontend`.
- **Production deploy**: set `REACT_APP_BRAND=helixaris` on the Emergent
  deployment env (not just the pod .env). Trigger a redeploy to rebuild.

If this is missing the app silently falls back to `ghp-health` — that's why
the admin dashboard shows "GHP Health Admin" instead of "Helixaris Admin".

## 1. Confirm you're on the right pod

Your `MONGO_URL` and `DB_NAME` env vars should be different from the GHP pod's.
Assume they're set correctly. Do NOT touch them.

## 2. Run the bootstrap script

```bash
cd /app/backend && python init_helixaris.py
```

This will:
- Create the Helixaris admin: `admin@helixaris.com` / `admin123`
- Fetch every category + product from `https://www.ghp-health.com/api/...`
- Insert them into this pod's Mongo with each `image` swapped to
  `/brands/helixaris/products/{slug}.png` (falls back to GHP image if the
  Helixaris version doesn't exist yet — e.g. bundles).

Safe to run multiple times — it upserts.

## 3. Verify

```bash
curl -s http://localhost:8001/api/products | python3 -c "
import sys, json
prods = json.load(sys.stdin)
print(f'{len(prods)} products loaded')
hx = sum(1 for p in prods if '/brands/helixaris/' in (p.get('image','')))
print(f'{hx} using Helixaris imagery')
"
```

## 4. Set the correct portal env var

In this pod's env, set:

```
GHP_ADMIN_URL=https://www.ghp-health.com/admin
```

so that the `/hub` page on this deploy links the GHP card at the correct
external URL instead of `/admin` on itself.

Restart the backend after adding the env var:

```bash
sudo supervisorctl restart backend
```

## 5. Domain

The user has registered `helixaris.com` (via Namecheap). Once they wire the
DNS to this pod's Emergent-provided endpoint, everything works at
`https://helixaris.com/admin`.

## 6. Credentials summary (write to `/app/memory/test_credentials.md`)

```
# Test Credentials — Helixaris Bioscience

## Admin
- admin@helixaris.com / admin123

## Operator Portal (shared with GHP)
- /hub · jongent@hotmail.co.uk / admin123
```

## 7. What NOT to touch

- The image assets under `/app/frontend/public/brands/helixaris/products/*` —
  they were generated in the GHP pod and are the correct Helixaris label style.
- The `portal_routes.py` (already correct for both pods).
- The pen/vial/nasal/oral generator scripts (`generate_helixaris_*.py`) — you
  can regenerate individual products if the user asks, but the standard set
  is done.

## 8. Ambassador / Coaching / Wallid / Emails

These features exist in the codebase but should NOT be enabled on Helixaris
until the user explicitly asks. In particular:
- No coach seeding (Helixaris doesn't have a coach yet)
- Wallid keys should stay unset until they get a Helixaris Wallid merchant
- Order confirmation email templates need Helixaris-specific copy — but not
  urgent, users can't check out until Wallid is wired anyway

## 9. If you're re-running to sync fresh GHP changes

Just run step 2 again. `init_helixaris.py` is idempotent — it upserts by
slug so any new products / price changes on GHP prod propagate.

## 10. Targeted fix — Oral Peptides missing / "Category not found"

If `/category/oral-peptides` shows **"Category not found"** on the Helixaris
storefront, the initial seed missed the category document (this happened on
early deploys where oral-peptides was added upstream after the first seed).

Run the focused fix — it only touches oral-peptides, leaves everything else
alone:

```bash
cd /app/backend && python fix_helixaris_orals.py
```

It will:
1. Upsert the `oral-peptides` category (with the correct name, description,
   sort_order, and Helixaris-branded image if one exists on disk).
2. Set `category='oral-peptides'` and `category_slug='oral-peptides'` on the
   8 known oral product slugs.
3. Print a verification block listing the products it fixed.

Then refresh `/category/oral-peptides` on the storefront.
