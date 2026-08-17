"""Tests for the new POST /api/admin/seed/orals endpoint + oral peptides catalog."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://ghp-ecommerce-pay.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

ADMIN_EMAIL = 'admin@ghp-health.com'
ADMIN_PASSWORD = 'GHP-Health26'

EXPECTED_SLUGS = {
    'slupp-332-50mg',
    'methylene-blue-20mg',
    'tesofensine-500mcg',
    # combo slug is derived from name; will be validated by count + all use /orals/*.png
    'bam15-50mg',
    '5-amino-1mq-50mg',
    'minoxidil-5mg',
    'tirzepatide-500mcg',
}


@pytest.fixture(scope='module')
def admin_token():
    r = requests.post(f"{API}/auth/login", json={'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get('access_token') or r.json().get('token')
    assert tok, f"no token in login response: {r.json()}"
    return tok


@pytest.fixture(scope='module')
def admin_headers(admin_token):
    return {'Authorization': f'Bearer {admin_token}'}


class TestSeedOralsEndpoint:
    def test_unauthenticated_returns_401(self):
        r = requests.post(f"{API}/admin/seed/orals", timeout=30)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}: {r.text}"

    def test_seed_orals_idempotent(self, admin_headers):
        # First call — since preview was already seeded, expect updates
        r1 = requests.post(f"{API}/admin/seed/orals", headers=admin_headers, timeout=30)
        assert r1.status_code == 200, f"seed failed: {r1.status_code} {r1.text}"
        d1 = r1.json()
        assert d1.get('ok') is True
        assert d1.get('category') == 'oral-peptides'
        total1 = len(d1.get('created', [])) + len(d1.get('updated', []))
        assert total1 == 8, f"expected 8 products total, got {total1}: {d1}"

        # Second call — must be pure updates, no creations
        r2 = requests.post(f"{API}/admin/seed/orals", headers=admin_headers, timeout=30)
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2.get('created') == [], f"idempotency broken: created={d2.get('created')}"
        assert len(d2.get('updated', [])) == 8, f"expected 8 updated, got {d2.get('updated')}"


class TestOralPeptidesCatalog:
    def test_categories_include_oral_peptides(self, admin_headers):
        # Ensure seeded first
        requests.post(f"{API}/admin/seed/orals", headers=admin_headers, timeout=30)

        r = requests.get(f"{API}/categories", timeout=30)
        assert r.status_code == 200
        cats = r.json()
        oral = next((c for c in cats if c.get('slug') == 'oral-peptides'), None)
        assert oral is not None, f"oral-peptides not in categories: {[c.get('slug') for c in cats]}"
        assert oral.get('sort_order') == 4, f"sort_order != 4: {oral}"
        assert oral.get('visible') is True
        assert oral.get('image') == '/orals/slupp-332-50mg.png', f"unexpected image: {oral.get('image')}"

    def test_products_oral_peptides_all_use_static_orals_path(self, admin_headers):
        requests.post(f"{API}/admin/seed/orals", headers=admin_headers, timeout=30)

        r = requests.get(f"{API}/products", params={'category': 'oral-peptides'}, timeout=30)
        assert r.status_code == 200
        products = r.json()
        # products may be list or {items: [...]}
        if isinstance(products, dict):
            products = products.get('items') or products.get('products') or []
        assert len(products) == 8, f"expected 8 products, got {len(products)}"

        for p in products:
            img = p.get('image', '')
            assert img.startswith('/orals/') and img.endswith('.png'), (
                f"product {p.get('slug')} has non-/orals image: {img}"
            )

        slugs = {p.get('slug') for p in products}
        # 7 known slugs must be present (combo has variable slug form)
        missing = EXPECTED_SLUGS - slugs
        assert not missing, f"missing expected slugs: {missing}. Got: {slugs}"


class TestOralStaticImages:
    @pytest.mark.parametrize('filename', [
        'slupp-332-50mg.png',
        'methylene-blue-20mg.png',
        'bam15-50mg.png',
        'tirzepatide-500mcg.png',
    ])
    def test_static_tub_image_served(self, filename):
        r = requests.get(f"{BASE_URL}/orals/{filename}", timeout=30)
        assert r.status_code == 200, f"static {filename} returned {r.status_code}"
        ctype = r.headers.get('content-type', '')
        assert 'image/png' in ctype, f"unexpected content-type for {filename}: {ctype}"
        assert len(r.content) > 1000, f"{filename} suspiciously small ({len(r.content)} bytes)"


class TestOtherCategoriesStillOk:
    @pytest.mark.parametrize('slug', ['vials', 'nasals', 'pens', 'syringes-and-wipes', 'bundles'])
    def test_category_products_still_reachable(self, slug):
        r = requests.get(f"{API}/products", params={'category': slug}, timeout=30)
        assert r.status_code == 200, f"{slug} products failed: {r.status_code}"
        data = r.json()
        if isinstance(data, dict):
            data = data.get('items') or data.get('products') or []
        assert isinstance(data, list) and len(data) >= 1, f"{slug} returned no products"
