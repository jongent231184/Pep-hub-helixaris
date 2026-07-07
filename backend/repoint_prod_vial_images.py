"""Re-point production's 16 new vials to the same gen_XXX.png filenames as preview.

These filenames live in /app/backend/uploads/ on preview and will be baked into
every production pod on the next Deploy — solving the "random 404 depending on
which pod serves the request" issue caused by non-shared uploads.
"""
import asyncio
import os
import sys
from pathlib import Path
import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")
sys.path.insert(0, str(ROOT))
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

PROD = "https://www.ghp-health.com"

NEW_SLUGS = [
    "bpc-157-tb500", "mt-2-10mg", "mt-1-10mg", "tesamorelin-10mg",
    "tb-500-10mg", "selank-10mg", "semax-10mg", "pt-141-10mg",
    "ss-31-10mg", "slu-pp-5mg", "ipamorelin-10mg", "kisspeptin-10mg",
    "klow-80mg-vial", "kpv-10mg", "mots-c-40mg", "nad-plus",
]


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ.get("DB_NAME", "test_database")]

    async with httpx.AsyncClient(timeout=60) as http:
        login = await http.post(f"{PROD}/api/auth/login",
                                json={"email": "admin@ghp-health.com",
                                      "password": "GHP-Health26"})
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        for slug in NEW_SLUGS:
            # Get preview image path (gen_XXX.png)
            prev = await db.products.find_one({"slug": slug})
            if not prev:
                print(f"SKIP (not in preview): {slug}")
                continue
            preview_img = prev.get("image", "")

            # Get production product id
            r = await http.get(f"{PROD}/api/products/{slug}")
            if r.status_code != 200:
                print(f"SKIP (not on prod): {slug}")
                continue
            prod_id = r.json()["id"]

            # Update production's image to the preview gen filename
            upd = await http.put(f"{PROD}/api/products/{prod_id}",
                                 json={"image": preview_img},
                                 headers=headers)
            if upd.status_code == 200:
                print(f"REPOINTED {slug} → {preview_img}")
            else:
                print(f"FAIL {slug}: {upd.status_code} {upd.text[:200]}")


if __name__ == "__main__":
    asyncio.run(main())
