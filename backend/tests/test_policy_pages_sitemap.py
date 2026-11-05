# Xoala compliance: sitemap includes new policy pages; settings expose shipping values used by /shipping-policy
import os
import pytest
import requests
from pathlib import Path
from dotenv import dotenv_values

BASE_URL = (os.environ.get('REACT_APP_BACKEND_URL') or dotenv_values(Path('/app/frontend/.env'))['REACT_APP_BACKEND_URL']).rstrip('/')


class TestSitemapPolicies:
    def test_sitemap_contains_policy_pages(self):
        r = requests.get(f"{BASE_URL}/api/sitemap.xml", timeout=20)
        assert r.status_code == 200
        assert 'xml' in r.headers.get('content-type', '')
        for p in ['/privacy-policy', '/shipping-policy', '/refund-policy', '/research-use-policy', '/terms']:
            assert f"{p}</loc>" in r.text, f"missing {p}"


class TestSettingsShipping:
    def test_settings_shipping_fields(self):
        r = requests.get(f"{BASE_URL}/api/settings", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d.get('flat_shipping'), (int, float))
        assert isinstance(d.get('free_shipping_threshold'), (int, float))
        assert d.get('payments_paused') is False


@pytest.mark.parametrize('path', ['/privacy-policy', '/shipping-policy', '/refund-policy'])
def test_spa_route_served(path):
    r = requests.get(f"{BASE_URL}{path}", timeout=20)
    assert r.status_code == 200
