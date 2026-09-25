"""Public SEO endpoints: dynamic sitemap.xml built from live products & categories.

Google/Bing pick this up via the Sitemap: line in /robots.txt.
Cached for 1 hour to keep DB pressure low.
"""
import os
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Response
from db import db

router = APIRouter(tags=["seo"])

# Domain the sitemap resolves against. Falls back to REACT_APP_BACKEND_URL host
# so previews are self-consistent, but production should always be ghp-health.com.
SITE_BASE = (os.environ.get("SITE_BASE_URL") or "https://ghp-health.com").rstrip("/")


def _iso(dt) -> str:
    if not dt:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if isinstance(dt, str):
        return dt.split("T")[0]
    try:
        return dt.strftime("%Y-%m-%d")
    except Exception:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _url(loc: str, lastmod: str, changefreq: str, priority: str) -> str:
    return (
        "  <url>\n"
        f"    <loc>{SITE_BASE}{loc}</loc>\n"
        f"    <lastmod>{lastmod}</lastmod>\n"
        f"    <changefreq>{changefreq}</changefreq>\n"
        f"    <priority>{priority}</priority>\n"
        "  </url>\n"
    )


@router.get("/sitemap.xml")
async def sitemap_xml():
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    urls: List[str] = []

    # 1. Static high-priority pages
    static_pages = [
        ("/", "1.0", "daily"),
        ("/about-us", "0.6", "monthly"),
        ("/coa", "0.8", "weekly"),
        ("/peptide-calculator", "0.7", "monthly"),
        ("/coaching", "0.6", "monthly"),
        ("/wholesale", "0.5", "monthly"),
        ("/contact", "0.5", "monthly"),
        ("/terms", "0.3", "yearly"),
        ("/research-use-policy", "0.4", "yearly"),
    ]
    for path, prio, freq in static_pages:
        urls.append(_url(path, today, freq, prio))

    # 2. Category pages
    try:
        async for cat in db.categories.find({}):
            slug = cat.get("slug")
            if not slug:
                continue
            urls.append(_url(f"/{slug}", today, "weekly", "0.8"))
    except Exception:
        pass

    # 3. Product pages
    try:
        async for prod in db.products.find({}):
            slug = prod.get("slug")
            cat = prod.get("category")
            if not slug or not cat:
                continue
            urls.append(_url(f"/{cat}/{slug}", _iso(prod.get("updated_at")), "weekly", "0.9"))
    except Exception:
        pass

    body = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join(urls) +
        '</urlset>\n'
    )
    return Response(
        content=body,
        media_type="application/xml",
        headers={
            # 1 hour public cache; Google respects Cache-Control on sitemaps
            "Cache-Control": "public, max-age=3600, s-maxage=3600",
        },
    )
