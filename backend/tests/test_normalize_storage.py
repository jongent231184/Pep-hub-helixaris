"""Backend tests for the normalize-storage endpoint (Cagrilintide fix).

Covers:
- Auth requirement (401/403 without admin token)
- Endpoint returns { ok, updated, total }
- BPC-157 storage_handling gets canonicalized to the constant
"""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://research-profile-seo.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

CANONICAL_START = "Supplied as a lyophilised powder. Store sealed at -20 °C in a desiccated environment"

# Multiple credential candidates from test_credentials.md / task
ADMIN_CANDIDATES = [
    ("admin@ghp-health.com", "GHP-Health26"),
    ("jongent@hotmail.co.uk", "admin123"),
]


@pytest.fixture(scope="module")
def admin_token():
    for email, pw in ADMIN_CANDIDATES:
        try:
            r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
            if r.status_code == 200:
                data = r.json()
                token = data.get("token") or data.get("access_token")
                if token:
                    print(f"Logged in as {email}")
                    return token
        except Exception as e:
            print(f"login attempt {email} failed: {e}")
    pytest.skip("No admin credentials worked")


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


def test_normalize_requires_auth_no_token():
    r = requests.post(f"{API}/admin/products/research-profile:normalize-storage", timeout=15)
    assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"


def test_normalize_requires_auth_bad_token():
    r = requests.post(
        f"{API}/admin/products/research-profile:normalize-storage",
        headers={"Authorization": "Bearer notavalidtoken"},
        timeout=15,
    )
    assert r.status_code in (401, 403)


def test_normalize_success(admin_headers):
    r = requests.post(
        f"{API}/admin/products/research-profile:normalize-storage",
        headers=admin_headers,
        timeout=60,
    )
    assert r.status_code == 200, f"body: {r.text}"
    data = r.json()
    assert data.get("ok") is True
    assert "updated" in data and isinstance(data["updated"], int)
    assert "total" in data and isinstance(data["total"], int)
    assert data["total"] >= 1
    print(f"normalize result: {data}")


def test_bpc157_storage_handling_canonical(admin_headers):
    # First run normalize to guarantee canonical state
    requests.post(
        f"{API}/admin/products/research-profile:normalize-storage",
        headers=admin_headers,
        timeout=60,
    )
    # Now fetch BPC-157
    r = requests.get(f"{API}/products/bpc-157", timeout=15)
    if r.status_code == 404:
        # Try alternate slugs / listAll
        r_all = requests.get(f"{API}/products/all", headers=admin_headers, timeout=15)
        assert r_all.status_code == 200
        prods = r_all.json()
        target = None
        for p in prods:
            if 'bpc' in (p.get('slug') or '').lower() or 'bpc' in (p.get('name') or '').lower():
                target = p
                break
        assert target, "No BPC-157 product found"
        r = requests.get(f"{API}/products/{target['slug']}", timeout=15)
    assert r.status_code == 200, r.text
    product = r.json()
    rp = product.get('research_profile') or {}
    assert rp, "BPC-157 has no research_profile in preview DB"
    sh = rp.get('storage_handling', '')
    print(f"BPC-157 storage_handling: {sh[:120]}...")
    assert sh.startswith(CANONICAL_START), f"storage_handling doesn't start canonically: {sh[:200]}"
    assert '-80' not in sh, "storage_handling still contains '-80'"


def test_bulk_job_status_endpoint(admin_headers):
    r = requests.get(f"{API}/admin/products/research-profile:job-status", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    data = r.json()
    for k in ("running", "updated", "skipped", "failed", "total"):
        assert k in data


def test_bulk_status_requires_auth():
    r = requests.get(f"{API}/admin/products/research-profile:job-status", timeout=15)
    assert r.status_code in (401, 403)
