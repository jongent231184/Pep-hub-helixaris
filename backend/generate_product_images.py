"""
One-off script: generate branded GHP-Health vial product images via Gemini Nano Banana.
For each product in the 'vials' and 'pens' categories, uses the reference vial image
(/app/backend/refs/vial_reference.png) and asks the model to produce the same vial
re-labelled with the product's actual name. Saves output to /app/backend/uploads
and updates the product's `image` field in MongoDB.

Run:
    cd /app/backend && python generate_product_images.py
"""
import asyncio
import base64
import os
import sys
import uuid
from pathlib import Path
from datetime import datetime

from dotenv import load_dotenv

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

REF_IMAGE = ROOT / "refs" / "vial_reference.png"
UPLOADS_DIR = Path(os.environ.get("UPLOADS_DIR", ROOT / "uploads"))
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "test_database")
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]

GEMINI_MODEL = "gemini-2.5-flash-image"  # nano banana
TARGET_CATEGORIES = {"vials", "pens"}


def build_prompt(product_name: str, category: str) -> str:
    """Prompt asks Gemini to keep the exact design but swap product label."""
    return (
        "Recreate the supplied product photo exactly, keeping the same composition, "
        "lighting, glass vial shape, materials, hexagon background pattern, gold/silver DNA-helix logo, "
        "'GHP Health' wordmark, 'For Research Purposes Only' vertical text, and overall premium look. "
        f"Change only the large gold product name printed across the lower part of the label to read: "
        f"\"{product_name}\". Output a clean square image with a neutral light-grey background, "
        "the vial centered, no extra text or watermarks."
    )


async def generate_one(product: dict, ref_b64: str) -> str | None:
    """Generate a single product image and return the saved /api/uploads/<file> URL."""
    name = product["name"]
    cat = product["category"]
    session_id = f"img-{product['id']}-{uuid.uuid4().hex[:6]}"

    chat = (
        LlmChat(api_key=EMERGENT_LLM_KEY, session_id=session_id, system_message="You generate product photography.")
        .with_model("gemini", GEMINI_MODEL)
        .with_params(modalities=["image", "text"])
    )

    msg = UserMessage(
        text=build_prompt(name, cat),
        file_contents=[ImageContent(ref_b64)],
    )
    try:
        text, images = await chat.send_message_multimodal_response(msg)
    except Exception as e:
        print(f"  [ERR] {name}: {e}")
        return None

    if not images:
        print(f"  [WARN] {name}: no images returned. Text response: {str(text)[:120]}")
        return None

    img = images[0]
    raw = base64.b64decode(img["data"])
    ext = "png" if "png" in img.get("mime_type", "image/png") else "jpg"
    filename = f"gen_{product['id']}.{ext}"
    fp = UPLOADS_DIR / filename
    fp.write_bytes(raw)
    return f"/api/uploads/{filename}"


async def main(limit: int | None = None, only_slug: str | None = None) -> None:
    if not REF_IMAGE.exists():
        print(f"Reference image missing at {REF_IMAGE}")
        sys.exit(1)
    ref_b64 = base64.b64encode(REF_IMAGE.read_bytes()).decode()

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    flt: dict = {"category": {"$in": list(TARGET_CATEGORIES)}}
    if only_slug:
        flt["slug"] = only_slug
    products = await db.products.find(flt).sort("name", 1).to_list(500)

    if limit:
        products = products[:limit]

    print(f"Generating images for {len(products)} products...")
    success = 0
    for i, p in enumerate(products, 1):
        print(f"[{i}/{len(products)}] {p['name']} ({p['category']})")
        url = await generate_one(p, ref_b64)
        if url:
            await db.products.update_one(
                {"id": p["id"]},
                {"$set": {"image": url, "updated_at": datetime.utcnow()}},
            )
            print(f"  -> saved {url}")
            success += 1
        # be gentle on the API
        await asyncio.sleep(0.5)

    print(f"\nDone. {success}/{len(products)} generated successfully.")


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None, help="Limit number of products (testing)")
    ap.add_argument("--slug", type=str, default=None, help="Generate only this product slug")
    args = ap.parse_args()
    asyncio.run(main(limit=args.limit, only_slug=args.slug))
