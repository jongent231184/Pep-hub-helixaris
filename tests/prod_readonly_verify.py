# READ-ONLY production verification of DB restore (only GETs + admin login POST)
import requests, collections, json

BASE = "https://www.ghp-health.com"
s = requests.Session()
s.headers["User-Agent"] = "GHP-restore-verify/1.0"

def p(*a):
    print(*a, flush=True)

# Products
r = s.get(f"{BASE}/api/products", timeout=30)
p("products status", r.status_code, r.headers.get("content-type"))
prods = r.json()
p("product count", len(prods))
prices = [pr.get("price") for pr in prods]
p("count at 37.5:", sum(1 for x in prices if x == 37.5))
p("price distribution top:", collections.Counter(prices).most_common(8))
total_var = sum(len(pr.get("variants") or []) for pr in prods)
p("total variants", total_var)
p("products with stock==0 / in_stock False:",
  sum(1 for pr in prods if (pr.get("stock") == 0) or pr.get("in_stock") is False))
p("sample keys", list(prods[0].keys()))

r = s.get(f"{BASE}/api/products/r3t4trut1d3", timeout=30)
p("r3t4 status", r.status_code)
if r.ok:
    d = r.json()
    p("r3t4 name/price/stock", d.get("name"), d.get("price"), d.get("stock"))
    for v in d.get("variants") or []:
        p("  variant", json.dumps(v))

# Categories
r = s.get(f"{BASE}/api/categories", timeout=30)
p("categories status", r.status_code)
try:
    cats = r.json()
    p("categories count", len(cats), [c.get("name") for c in cats][:20])
except Exception as e:
    p("categories parse err", e, r.text[:200])

# Admin login + orders
r = s.post(f"{BASE}/api/auth/login", json={"email": "admin@ghp-health.com", "password": "GHP-Health26"}, timeout=30)
p("login status", r.status_code)
tok = r.json().get("access_token")
p("token present", bool(tok), "role", (r.json().get("user") or {}).get("role"))
h = {"Authorization": f"Bearer {tok}"}
r = s.get(f"{BASE}/api/orders/all", headers=h, timeout=60)
p("orders status", r.status_code)
orders = r.json()
p("orders count", len(orders))
for o in orders[:5]:
    p("  latest:", o.get("order_number"), o.get("created_at"), o.get("status"), o.get("total"))
for o in orders:
    if o.get("order_number") in ("GHP-054", "GHP-055"):
        p("  FOUND", o.get("order_number"), o.get("created_at"), o.get("status"))
stray = [o for o in orders if o.get("order_number") in ("GHP-054", "GHP-055") and str(o.get("created_at", "")).startswith("2026-10-20")]
p("stray 2026-10-20 GHP-054/055:", len(stray))
oct20 = [o.get("order_number") for o in orders if str(o.get("created_at", "")).startswith("2026-10-20")]
p("orders dated 2026-10-20:", oct20)
