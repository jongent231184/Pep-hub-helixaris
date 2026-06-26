"""Comprehensive backend API tests for GH Peptides e-commerce."""
import requests
import os
import io
from pathlib import Path

# Load backend URL from frontend/.env
env_path = Path('/app/frontend/.env')
BACKEND_URL = None
if env_path.exists():
    with open(env_path) as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BACKEND_URL = line.split('=', 1)[1].strip()
                break

if not BACKEND_URL:
    raise ValueError("REACT_APP_BACKEND_URL not found in /app/frontend/.env")

API_BASE = f"{BACKEND_URL}/api"
print(f"Testing backend at: {API_BASE}")

# Test credentials
ADMIN_EMAIL = "admin@ghpresearch.com"
ADMIN_PASSWORD = "admin123"

# Global tokens
admin_token = None
customer_token = None
test_customer_email = None

# Test results tracking
results = {
    'passed': [],
    'failed': [],
    'warnings': []
}

def log_pass(test_name):
    results['passed'].append(test_name)
    print(f"✅ PASS: {test_name}")

def log_fail(test_name, reason):
    results['failed'].append(f"{test_name}: {reason}")
    print(f"❌ FAIL: {test_name}")
    print(f"   Reason: {reason}")

def log_warning(test_name, reason):
    results['warnings'].append(f"{test_name}: {reason}")
    print(f"⚠️  WARNING: {test_name}")
    print(f"   Reason: {reason}")

def print_summary():
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    print(f"✅ Passed: {len(results['passed'])}")
    print(f"❌ Failed: {len(results['failed'])}")
    print(f"⚠️  Warnings: {len(results['warnings'])}")
    
    if results['failed']:
        print("\n❌ FAILED TESTS:")
        for fail in results['failed']:
            print(f"  - {fail}")
    
    if results['warnings']:
        print("\n⚠️  WARNINGS:")
        for warn in results['warnings']:
            print(f"  - {warn}")
    
    print("="*80)

# ============================================================================
# 1. AUTH TESTS
# ============================================================================
print("\n" + "="*80)
print("1. TESTING AUTH ENDPOINTS")
print("="*80)

# 1.1 Admin login
print("\n[1.1] POST /api/auth/login (admin credentials)")
try:
    resp = requests.post(f"{API_BASE}/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if resp.status_code == 200:
        data = resp.json()
        if 'access_token' in data and 'user' in data:
            admin_token = data['access_token']
            user = data['user']
            if user.get('role') == 'admin' and user.get('email') == ADMIN_EMAIL:
                log_pass("Admin login returns 200 with token and admin user")
            else:
                log_fail("Admin login", f"User role={user.get('role')}, expected 'admin'")
        else:
            log_fail("Admin login", "Missing access_token or user in response")
    else:
        log_fail("Admin login", f"Status {resp.status_code}: {resp.text}")
except Exception as e:
    log_fail("Admin login", str(e))

# 1.2 Register new customer
print("\n[1.2] POST /api/auth/register (new customer)")
import uuid
test_customer_email = f"test-{uuid.uuid4().hex[:8]}@example.com"
try:
    resp = requests.post(f"{API_BASE}/auth/register", json={
        "email": test_customer_email,
        "password": "TestPass123!",
        "first_name": "Test",
        "last_name": "Customer"
    })
    if resp.status_code == 200:
        data = resp.json()
        if 'access_token' in data and 'user' in data:
            customer_token = data['access_token']
            user = data['user']
            if user.get('role') == 'customer':
                log_pass("Customer registration returns 200 with token and customer user")
            else:
                log_fail("Customer registration", f"User role={user.get('role')}, expected 'customer'")
        else:
            log_fail("Customer registration", "Missing access_token or user")
    else:
        log_fail("Customer registration", f"Status {resp.status_code}: {resp.text}")
except Exception as e:
    log_fail("Customer registration", str(e))

# 1.3 Register duplicate email
print("\n[1.3] POST /api/auth/register (duplicate email)")
try:
    resp = requests.post(f"{API_BASE}/auth/register", json={
        "email": test_customer_email,
        "password": "AnotherPass123!"
    })
    if resp.status_code == 400:
        log_pass("Duplicate email registration returns 400")
    else:
        log_fail("Duplicate email registration", f"Expected 400, got {resp.status_code}")
except Exception as e:
    log_fail("Duplicate email registration", str(e))

# 1.4 Login with wrong password
print("\n[1.4] POST /api/auth/login (wrong password)")
try:
    resp = requests.post(f"{API_BASE}/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": "wrongpassword"
    })
    if resp.status_code == 401:
        log_pass("Login with wrong password returns 401")
    else:
        log_fail("Login with wrong password", f"Expected 401, got {resp.status_code}")
except Exception as e:
    log_fail("Login with wrong password", str(e))

# 1.5 GET /api/auth/me with token
print("\n[1.5] GET /api/auth/me (with Bearer token)")
try:
    resp = requests.get(f"{API_BASE}/auth/me", headers={
        "Authorization": f"Bearer {admin_token}"
    })
    if resp.status_code == 200:
        user = resp.json()
        if user.get('email') == ADMIN_EMAIL and user.get('role') == 'admin':
            log_pass("GET /auth/me returns current user")
        else:
            log_fail("GET /auth/me", f"User data mismatch: {user}")
    else:
        log_fail("GET /auth/me", f"Status {resp.status_code}: {resp.text}")
except Exception as e:
    log_fail("GET /auth/me", str(e))

# ============================================================================
# 2. CATEGORIES TESTS
# ============================================================================
print("\n" + "="*80)
print("2. TESTING CATEGORIES ENDPOINTS")
print("="*80)

# 2.1 GET /api/categories (public, no auth)
print("\n[2.1] GET /api/categories (no auth)")
try:
    resp = requests.get(f"{API_BASE}/categories")
    if resp.status_code == 200:
        categories = resp.json()
        if isinstance(categories, list) and len(categories) >= 4:
            log_pass(f"GET /categories returns {len(categories)} categories (≥4 seeded)")
        else:
            log_fail("GET /categories", f"Expected ≥4 categories, got {len(categories)}")
    else:
        log_fail("GET /categories", f"Status {resp.status_code}: {resp.text}")
except Exception as e:
    log_fail("GET /categories", str(e))

# 2.2 GET /api/categories/all WITHOUT admin token
print("\n[2.2] GET /api/categories/all (no admin token)")
try:
    resp = requests.get(f"{API_BASE}/categories/all")
    if resp.status_code in [401, 403]:
        log_pass("GET /categories/all without admin returns 401/403")
    else:
        log_fail("GET /categories/all without admin", f"Expected 401/403, got {resp.status_code}")
except Exception as e:
    log_fail("GET /categories/all without admin", str(e))

# 2.3 GET /api/categories/all WITH admin token
print("\n[2.3] GET /api/categories/all (with admin token)")
try:
    resp = requests.get(f"{API_BASE}/categories/all", headers={
        "Authorization": f"Bearer {admin_token}"
    })
    if resp.status_code == 200:
        categories = resp.json()
        if isinstance(categories, list):
            log_pass(f"GET /categories/all with admin returns {len(categories)} categories")
        else:
            log_fail("GET /categories/all with admin", "Response is not a list")
    else:
        log_fail("GET /categories/all with admin", f"Status {resp.status_code}: {resp.text}")
except Exception as e:
    log_fail("GET /categories/all with admin", str(e))

# 2.4 POST /api/categories WITH admin
print("\n[2.4] POST /api/categories (with admin)")
test_category_id = None
try:
    resp = requests.post(f"{API_BASE}/categories", 
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "slug": f"test-cat-{uuid.uuid4().hex[:6]}",
            "name": "Test Category",
            "sort_order": 999,
            "visible": True
        }
    )
    if resp.status_code == 200:
        cat = resp.json()
        if 'id' in cat and cat.get('name') == 'Test Category':
            test_category_id = cat['id']
            log_pass("POST /categories with admin creates category")
        else:
            log_fail("POST /categories with admin", "Missing id or name mismatch")
    else:
        log_fail("POST /categories with admin", f"Status {resp.status_code}: {resp.text}")
except Exception as e:
    log_fail("POST /categories with admin", str(e))

# 2.5 PUT /api/categories/{id} WITH admin
print("\n[2.5] PUT /api/categories/{id} (with admin)")
if test_category_id:
    try:
        resp = requests.put(f"{API_BASE}/categories/{test_category_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"name": "Updated Test Category"}
        )
        if resp.status_code == 200:
            cat = resp.json()
            if cat.get('name') == 'Updated Test Category':
                log_pass("PUT /categories/{id} with admin updates category")
            else:
                log_fail("PUT /categories/{id} with admin", f"Name not updated: {cat.get('name')}")
        else:
            log_fail("PUT /categories/{id} with admin", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        log_fail("PUT /categories/{id} with admin", str(e))
else:
    log_warning("PUT /categories/{id}", "Skipped - no test category created")

# 2.6 DELETE /api/categories/{id} WITH admin
print("\n[2.6] DELETE /api/categories/{id} (with admin)")
if test_category_id:
    try:
        resp = requests.delete(f"{API_BASE}/categories/{test_category_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if resp.status_code == 200:
            log_pass("DELETE /categories/{id} with admin deletes category")
        else:
            log_fail("DELETE /categories/{id} with admin", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        log_fail("DELETE /categories/{id} with admin", str(e))
else:
    log_warning("DELETE /categories/{id}", "Skipped - no test category created")

# 2.7 POST /api/categories WITHOUT admin token
print("\n[2.7] POST /api/categories (no admin token)")
try:
    resp = requests.post(f"{API_BASE}/categories", json={
        "slug": "unauthorized-cat",
        "name": "Unauthorized"
    })
    if resp.status_code in [401, 403]:
        log_pass("POST /categories without admin returns 401/403")
    else:
        log_fail("POST /categories without admin", f"Expected 401/403, got {resp.status_code}")
except Exception as e:
    log_fail("POST /categories without admin", str(e))

# ============================================================================
# 3. PRODUCTS TESTS
# ============================================================================
print("\n" + "="*80)
print("3. TESTING PRODUCTS ENDPOINTS")
print("="*80)

# 3.1 GET /api/products (all visible)
print("\n[3.1] GET /api/products (all visible)")
try:
    resp = requests.get(f"{API_BASE}/products")
    if resp.status_code == 200:
        products = resp.json()
        if isinstance(products, list) and len(products) >= 34:
            log_pass(f"GET /products returns {len(products)} products (≥34 seeded)")
        else:
            log_fail("GET /products", f"Expected ≥34 products, got {len(products)}")
    else:
        log_fail("GET /products", f"Status {resp.status_code}: {resp.text}")
except Exception as e:
    log_fail("GET /products", str(e))

# 3.2 GET /api/products?category=vials
print("\n[3.2] GET /api/products?category=vials")
try:
    resp = requests.get(f"{API_BASE}/products?category=vials")
    if resp.status_code == 200:
        products = resp.json()
        if isinstance(products, list):
            # Check all products have category=vials
            all_vials = all(p.get('category') == 'vials' for p in products)
            if all_vials:
                log_pass(f"GET /products?category=vials returns {len(products)} vials products")
            else:
                log_fail("GET /products?category=vials", "Some products are not vials")
        else:
            log_fail("GET /products?category=vials", "Response is not a list")
    else:
        log_fail("GET /products?category=vials", f"Status {resp.status_code}: {resp.text}")
except Exception as e:
    log_fail("GET /products?category=vials", str(e))

# 3.3 GET /api/products?q=glow
print("\n[3.3] GET /api/products?q=glow")
try:
    resp = requests.get(f"{API_BASE}/products?q=glow")
    if resp.status_code == 200:
        products = resp.json()
        if isinstance(products, list):
            # Check products contain 'glow' in name (case insensitive)
            matching = [p for p in products if 'glow' in p.get('name', '').lower()]
            if len(matching) > 0:
                log_pass(f"GET /products?q=glow returns {len(matching)} matching products")
            else:
                log_warning("GET /products?q=glow", "No products with 'glow' in name found")
        else:
            log_fail("GET /products?q=glow", "Response is not a list")
    else:
        log_fail("GET /products?q=glow", f"Status {resp.status_code}: {resp.text}")
except Exception as e:
    log_fail("GET /products?q=glow", str(e))

# 3.4 GET /api/products?featured=true
print("\n[3.4] GET /api/products?featured=true")
try:
    resp = requests.get(f"{API_BASE}/products?featured=true")
    if resp.status_code == 200:
        products = resp.json()
        if isinstance(products, list):
            all_featured = all(p.get('featured') == True for p in products)
            if all_featured and len(products) > 0:
                log_pass(f"GET /products?featured=true returns {len(products)} featured products")
            elif len(products) == 0:
                log_warning("GET /products?featured=true", "No featured products found")
            else:
                log_fail("GET /products?featured=true", "Some products are not featured")
        else:
            log_fail("GET /products?featured=true", "Response is not a list")
    else:
        log_fail("GET /products?featured=true", f"Status {resp.status_code}: {resp.text}")
except Exception as e:
    log_fail("GET /products?featured=true", str(e))

# 3.5 GET /api/products/{slug} (e.g. r3t4trut1d3)
print("\n[3.5] GET /api/products/{slug} (specific product)")
try:
    resp = requests.get(f"{API_BASE}/products/r3t4trut1d3")
    if resp.status_code == 200:
        product = resp.json()
        if product.get('slug') == 'r3t4trut1d3':
            log_pass("GET /products/{slug} returns single product")
        else:
            log_fail("GET /products/{slug}", f"Slug mismatch: {product.get('slug')}")
    else:
        log_fail("GET /products/{slug}", f"Status {resp.status_code}: {resp.text}")
except Exception as e:
    log_fail("GET /products/{slug}", str(e))

# 3.6 GET /api/products/non-existent
print("\n[3.6] GET /api/products/non-existent-slug-12345")
try:
    resp = requests.get(f"{API_BASE}/products/non-existent-slug-12345")
    if resp.status_code == 404:
        log_pass("GET /products/{non-existent} returns 404")
    else:
        log_fail("GET /products/{non-existent}", f"Expected 404, got {resp.status_code}")
except Exception as e:
    log_fail("GET /products/{non-existent}", str(e))

# 3.7 POST /api/products WITH admin
print("\n[3.7] POST /api/products (with admin)")
test_product_id = None
test_product_slug = f"test-prod-{uuid.uuid4().hex[:6]}"
try:
    resp = requests.post(f"{API_BASE}/products",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "slug": test_product_slug,
            "name": "Test Product",
            "category": "vials",
            "price": 99.99,
            "description": "Test description",
            "stock": 100,
            "visible": True,
            "featured": False
        }
    )
    if resp.status_code == 200:
        product = resp.json()
        if 'id' in product and product.get('slug') == test_product_slug:
            test_product_id = product['id']
            log_pass("POST /products with admin creates product")
        else:
            log_fail("POST /products with admin", "Missing id or slug mismatch")
    else:
        log_fail("POST /products with admin", f"Status {resp.status_code}: {resp.text}")
except Exception as e:
    log_fail("POST /products with admin", str(e))

# 3.8 PUT /api/products/{id} WITH admin
print("\n[3.8] PUT /api/products/{id} (with admin)")
if test_product_id:
    try:
        resp = requests.put(f"{API_BASE}/products/{test_product_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"name": "Updated Test Product", "price": 149.99}
        )
        if resp.status_code == 200:
            product = resp.json()
            if product.get('name') == 'Updated Test Product' and product.get('price') == 149.99:
                log_pass("PUT /products/{id} with admin updates product")
            else:
                log_fail("PUT /products/{id} with admin", "Fields not updated correctly")
        else:
            log_fail("PUT /products/{id} with admin", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        log_fail("PUT /products/{id} with admin", str(e))
else:
    log_warning("PUT /products/{id}", "Skipped - no test product created")

# 3.9 DELETE /api/products/{id} WITH admin
print("\n[3.9] DELETE /api/products/{id} (with admin)")
if test_product_id:
    try:
        resp = requests.delete(f"{API_BASE}/products/{test_product_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        if resp.status_code == 200:
            log_pass("DELETE /products/{id} with admin deletes product")
        else:
            log_fail("DELETE /products/{id} with admin", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        log_fail("DELETE /products/{id} with admin", str(e))
else:
    log_warning("DELETE /products/{id}", "Skipped - no test product created")

# 3.10 GET /api/products/all WITHOUT admin
print("\n[3.10] GET /api/products/all (no admin token)")
try:
    resp = requests.get(f"{API_BASE}/products/all")
    if resp.status_code in [401, 403]:
        log_pass("GET /products/all without admin returns 401/403")
    else:
        log_fail("GET /products/all without admin", f"Expected 401/403, got {resp.status_code}")
except Exception as e:
    log_fail("GET /products/all without admin", str(e))

# 3.11 GET /api/products/all WITH admin
print("\n[3.11] GET /api/products/all (with admin token)")
try:
    resp = requests.get(f"{API_BASE}/products/all", headers={
        "Authorization": f"Bearer {admin_token}"
    })
    if resp.status_code == 200:
        products = resp.json()
        if isinstance(products, list):
            log_pass(f"GET /products/all with admin returns {len(products)} products")
        else:
            log_fail("GET /products/all with admin", "Response is not a list")
    else:
        log_fail("GET /products/all with admin", f"Status {resp.status_code}: {resp.text}")
except Exception as e:
    log_fail("GET /products/all with admin", str(e))

# ============================================================================
# 4. ORDERS TESTS
# ============================================================================
print("\n" + "="*80)
print("4. TESTING ORDERS ENDPOINTS")
print("="*80)

# 4.1 POST /api/orders (anonymous, no auth)
print("\n[4.1] POST /api/orders (anonymous checkout)")
test_order_id = None
test_order_number = None
try:
    resp = requests.post(f"{API_BASE}/orders", json={
        "items": [
            {
                "product_id": "test-prod-123",
                "slug": "test-product",
                "name": "Test Product",
                "image": "",
                "option": "5mg",
                "qty": 2,
                "price": 49.99
            }
        ],
        "shipping_address": {
            "first_name": "John",
            "last_name": "Doe",
            "email": "john.doe@example.com",
            "phone": "+44 7700 900000",
            "address1": "123 Test Street",
            "address2": "Apt 4B",
            "city": "London",
            "postcode": "SW1A 1AA",
            "country": "United Kingdom"
        },
        "subtotal": 99.98,
        "shipping": 4.99,
        "total": 104.97,
        "notes": "Test order"
    })
    if resp.status_code in [200, 201]:
        order = resp.json()
        if 'id' in order and 'order_number' in order:
            test_order_id = order['id']
            test_order_number = order['order_number']
            if order['order_number'].startswith('GHP-') and order.get('payment_status') == 'pending':
                log_pass(f"POST /orders creates order with number {order['order_number']}")
            else:
                log_fail("POST /orders", f"Order number format or payment_status incorrect: {order}")
        else:
            log_fail("POST /orders", "Missing id or order_number")
    else:
        log_fail("POST /orders", f"Status {resp.status_code}: {resp.text}")
except Exception as e:
    log_fail("POST /orders", str(e))

# 4.2 GET /api/orders/{id} (anonymous order, no auth)
print("\n[4.2] GET /api/orders/{id} (anonymous order)")
if test_order_id:
    try:
        resp = requests.get(f"{API_BASE}/orders/{test_order_id}")
        if resp.status_code == 200:
            order = resp.json()
            if order.get('id') == test_order_id:
                log_pass("GET /orders/{id} returns anonymous order")
            else:
                log_fail("GET /orders/{id}", "Order ID mismatch")
        else:
            log_fail("GET /orders/{id}", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        log_fail("GET /orders/{id}", str(e))
else:
    log_warning("GET /orders/{id}", "Skipped - no test order created")

# 4.3 GET /api/orders/mine WITHOUT auth
print("\n[4.3] GET /api/orders/mine (no auth)")
try:
    resp = requests.get(f"{API_BASE}/orders/mine")
    if resp.status_code in [401, 403]:
        log_pass("GET /orders/mine without auth returns 401/403")
    else:
        log_fail("GET /orders/mine without auth", f"Expected 401/403, got {resp.status_code}")
except Exception as e:
    log_fail("GET /orders/mine without auth", str(e))

# 4.4 GET /api/orders/all WITHOUT admin
print("\n[4.4] GET /api/orders/all (no admin token)")
try:
    resp = requests.get(f"{API_BASE}/orders/all")
    if resp.status_code in [401, 403]:
        log_pass("GET /orders/all without admin returns 401/403")
    else:
        log_fail("GET /orders/all without admin", f"Expected 401/403, got {resp.status_code}")
except Exception as e:
    log_fail("GET /orders/all without admin", str(e))

# 4.5 GET /api/orders/all WITH admin
print("\n[4.5] GET /api/orders/all (with admin token)")
try:
    resp = requests.get(f"{API_BASE}/orders/all", headers={
        "Authorization": f"Bearer {admin_token}"
    })
    if resp.status_code == 200:
        orders = resp.json()
        if isinstance(orders, list):
            log_pass(f"GET /orders/all with admin returns {len(orders)} orders")
        else:
            log_fail("GET /orders/all with admin", "Response is not a list")
    else:
        log_fail("GET /orders/all with admin", f"Status {resp.status_code}: {resp.text}")
except Exception as e:
    log_fail("GET /orders/all with admin", str(e))

# 4.6 PATCH /api/orders/{id} WITH admin
print("\n[4.6] PATCH /api/orders/{id} (with admin)")
if test_order_id:
    try:
        resp = requests.patch(f"{API_BASE}/orders/{test_order_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "status": "processing",
                "payment_status": "paid"
            }
        )
        if resp.status_code == 200:
            order = resp.json()
            if order.get('status') == 'processing' and order.get('payment_status') == 'paid':
                log_pass("PATCH /orders/{id} with admin updates order status")
            else:
                log_fail("PATCH /orders/{id} with admin", f"Status not updated: {order}")
        else:
            log_fail("PATCH /orders/{id} with admin", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        log_fail("PATCH /orders/{id} with admin", str(e))
else:
    log_warning("PATCH /orders/{id}", "Skipped - no test order created")

# ============================================================================
# 5. IMAGE UPLOADS TESTS
# ============================================================================
print("\n" + "="*80)
print("5. TESTING IMAGE UPLOADS")
print("="*80)

# 5.1 POST /api/uploads WITHOUT admin token
print("\n[5.1] POST /api/uploads (no admin token)")
try:
    # Create a small test PNG (1x1 pixel)
    import base64
    png_data = base64.b64decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    )
    files = {'file': ('test.png', io.BytesIO(png_data), 'image/png')}
    resp = requests.post(f"{API_BASE}/uploads", files=files)
    if resp.status_code in [401, 403]:
        log_pass("POST /uploads without admin returns 401/403")
    else:
        log_fail("POST /uploads without admin", f"Expected 401/403, got {resp.status_code}")
except Exception as e:
    log_fail("POST /uploads without admin", str(e))

# 5.2 POST /api/uploads WITH admin token
print("\n[5.2] POST /api/uploads (with admin token)")
uploaded_url = None
try:
    png_data = base64.b64decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    )
    files = {'file': ('test.png', io.BytesIO(png_data), 'image/png')}
    resp = requests.post(f"{API_BASE}/uploads", 
        files=files,
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    if resp.status_code == 200:
        data = resp.json()
        if 'filename' in data and 'url' in data:
            uploaded_url = data['url']
            if data['url'].startswith('/api/uploads/'):
                log_pass(f"POST /uploads with admin returns filename and URL: {data['url']}")
            else:
                log_fail("POST /uploads with admin", f"URL format incorrect: {data['url']}")
        else:
            log_fail("POST /uploads with admin", "Missing filename or url in response")
    else:
        log_fail("POST /uploads with admin", f"Status {resp.status_code}: {resp.text}")
except Exception as e:
    log_fail("POST /uploads with admin", str(e))

# 5.3 GET uploaded image
print("\n[5.3] GET uploaded image URL")
if uploaded_url:
    try:
        full_url = f"{BACKEND_URL}{uploaded_url}"
        resp = requests.get(full_url)
        if resp.status_code == 200:
            content_type = resp.headers.get('content-type', '')
            if 'image' in content_type:
                log_pass(f"GET {uploaded_url} returns image (content-type: {content_type})")
            else:
                log_warning("GET uploaded image", f"Content-type is {content_type}, expected image/*")
        else:
            log_fail("GET uploaded image", f"Status {resp.status_code}")
    except Exception as e:
        log_fail("GET uploaded image", str(e))
else:
    log_warning("GET uploaded image", "Skipped - no image uploaded")

# ============================================================================
# 6. PAYPAL TESTS
# ============================================================================
print("\n" + "="*80)
print("6. TESTING PAYPAL ENDPOINTS")
print("="*80)

# 6.1 GET /api/paypal/config (no auth)
print("\n[6.1] GET /api/paypal/config (no auth)")
try:
    resp = requests.get(f"{API_BASE}/paypal/config")
    if resp.status_code == 200:
        config = resp.json()
        if 'client_id' in config and 'env' in config and 'configured' in config:
            if config.get('configured') == False:
                log_pass(f"GET /paypal/config returns config with configured=false (expected with placeholder creds)")
            else:
                log_warning("GET /paypal/config", f"configured={config.get('configured')}, expected false with placeholder creds")
        else:
            log_fail("GET /paypal/config", "Missing required fields in response")
    else:
        log_fail("GET /paypal/config", f"Status {resp.status_code}: {resp.text}")
except Exception as e:
    log_fail("GET /paypal/config", str(e))

# 6.2 POST /api/paypal/create-order (expect 503 with placeholder creds)
print("\n[6.2] POST /api/paypal/create-order (expect 503 with placeholder creds)")
if test_order_id:
    try:
        resp = requests.post(f"{API_BASE}/paypal/create-order", json={
            "order_id": test_order_id
        })
        if resp.status_code == 503:
            log_pass("POST /paypal/create-order returns 503 (expected with placeholder credentials)")
        elif resp.status_code == 200:
            log_warning("POST /paypal/create-order", "Returned 200 - PayPal credentials may be configured")
        else:
            log_fail("POST /paypal/create-order", f"Unexpected status {resp.status_code}: {resp.text}")
    except Exception as e:
        log_fail("POST /paypal/create-order", str(e))
else:
    log_warning("POST /paypal/create-order", "Skipped - no test order created")

# ============================================================================
# 7. SETTINGS TESTS
# ============================================================================
print("\n" + "="*80)
print("7. TESTING SETTINGS ENDPOINTS")
print("="*80)

# 7.1 GET /api/settings (no auth)
print("\n[7.1] GET /api/settings (no auth)")
original_site_name = None
try:
    resp = requests.get(f"{API_BASE}/settings")
    if resp.status_code == 200:
        settings = resp.json()
        if 'site_name' in settings and 'contact_email' in settings:
            original_site_name = settings.get('site_name')
            log_pass(f"GET /settings returns settings (site_name: {original_site_name})")
        else:
            log_fail("GET /settings", "Missing required fields")
    else:
        log_fail("GET /settings", f"Status {resp.status_code}: {resp.text}")
except Exception as e:
    log_fail("GET /settings", str(e))

# 7.2 PUT /api/settings WITHOUT admin
print("\n[7.2] PUT /api/settings (no admin token)")
try:
    resp = requests.put(f"{API_BASE}/settings", json={
        "site_name": "Unauthorized Change"
    })
    if resp.status_code in [401, 403]:
        log_pass("PUT /settings without admin returns 401/403")
    else:
        log_fail("PUT /settings without admin", f"Expected 401/403, got {resp.status_code}")
except Exception as e:
    log_fail("PUT /settings without admin", str(e))

# 7.3 PUT /api/settings WITH admin
print("\n[7.3] PUT /api/settings (with admin token)")
test_site_name = f"Test Site {uuid.uuid4().hex[:6]}"
try:
    resp = requests.put(f"{API_BASE}/settings",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "site_name": test_site_name,
            "contact_email": "ghpeptides@outlook.com",
            "customer_hours": "Mon - Fri: 9am - 5pm (GMT)",
            "tiktok": "",
            "instagram": "",
            "wholesale_banner": "Wholesale now available - please email team for further information",
            "free_shipping_threshold": 50.0,
            "flat_shipping": 4.99,
            "currency": "GBP",
            "currency_symbol": "£"
        }
    )
    if resp.status_code == 200:
        settings = resp.json()
        if settings.get('site_name') == test_site_name:
            log_pass("PUT /settings with admin updates settings")
        else:
            log_fail("PUT /settings with admin", f"site_name not updated: {settings.get('site_name')}")
    else:
        log_fail("PUT /settings with admin", f"Status {resp.status_code}: {resp.text}")
except Exception as e:
    log_fail("PUT /settings with admin", str(e))

# 7.4 Verify GET /api/settings reflects the change
print("\n[7.4] GET /api/settings (verify update)")
try:
    resp = requests.get(f"{API_BASE}/settings")
    if resp.status_code == 200:
        settings = resp.json()
        if settings.get('site_name') == test_site_name:
            log_pass("GET /settings reflects updated site_name")
        else:
            log_fail("GET /settings after update", f"site_name is {settings.get('site_name')}, expected {test_site_name}")
    else:
        log_fail("GET /settings after update", f"Status {resp.status_code}: {resp.text}")
except Exception as e:
    log_fail("GET /settings after update", str(e))

# ============================================================================
# 8. ADMIN STATS TESTS
# ============================================================================
print("\n" + "="*80)
print("8. TESTING ADMIN STATS ENDPOINTS")
print("="*80)

# 8.1 GET /api/admin/stats WITHOUT admin
print("\n[8.1] GET /api/admin/stats (no admin token)")
try:
    resp = requests.get(f"{API_BASE}/admin/stats")
    if resp.status_code in [401, 403]:
        log_pass("GET /admin/stats without admin returns 401/403")
    else:
        log_fail("GET /admin/stats without admin", f"Expected 401/403, got {resp.status_code}")
except Exception as e:
    log_fail("GET /admin/stats without admin", str(e))

# 8.2 GET /api/admin/stats WITH admin
print("\n[8.2] GET /api/admin/stats (with admin token)")
try:
    resp = requests.get(f"{API_BASE}/admin/stats", headers={
        "Authorization": f"Bearer {admin_token}"
    })
    if resp.status_code == 200:
        stats = resp.json()
        required_keys = [
            'revenue_today', 'revenue_week', 'revenue_month',
            'orders_total', 'orders_pending', 'products_total',
            'customers_total', 'recent_orders', 'top_products'
        ]
        missing_keys = [k for k in required_keys if k not in stats]
        if not missing_keys:
            log_pass(f"GET /admin/stats with admin returns all required keys")
        else:
            log_fail("GET /admin/stats with admin", f"Missing keys: {missing_keys}")
    else:
        log_fail("GET /admin/stats with admin", f"Status {resp.status_code}: {resp.text}")
except Exception as e:
    log_fail("GET /admin/stats with admin", str(e))

# ============================================================================
# 9. ADMIN CUSTOMERS TESTS
# ============================================================================
print("\n" + "="*80)
print("9. TESTING ADMIN CUSTOMERS ENDPOINTS")
print("="*80)

# 9.1 GET /api/admin/customers WITHOUT admin
print("\n[9.1] GET /api/admin/customers (no admin token)")
try:
    resp = requests.get(f"{API_BASE}/admin/customers")
    if resp.status_code in [401, 403]:
        log_pass("GET /admin/customers without admin returns 401/403")
    else:
        log_fail("GET /admin/customers without admin", f"Expected 401/403, got {resp.status_code}")
except Exception as e:
    log_fail("GET /admin/customers without admin", str(e))

# 9.2 GET /api/admin/customers WITH admin
print("\n[9.2] GET /api/admin/customers (with admin token)")
try:
    resp = requests.get(f"{API_BASE}/admin/customers", headers={
        "Authorization": f"Bearer {admin_token}"
    })
    if resp.status_code == 200:
        customers = resp.json()
        if isinstance(customers, list):
            # Check all have role=customer
            all_customers = all(c.get('role') == 'customer' for c in customers)
            if all_customers:
                log_pass(f"GET /admin/customers with admin returns {len(customers)} customer users")
            else:
                log_fail("GET /admin/customers with admin", "Some users are not customers")
        else:
            log_fail("GET /admin/customers with admin", "Response is not a list")
    else:
        log_fail("GET /admin/customers with admin", f"Status {resp.status_code}: {resp.text}")
except Exception as e:
    log_fail("GET /admin/customers with admin", str(e))

# ============================================================================
# FINAL SUMMARY
# ============================================================================
print_summary()
