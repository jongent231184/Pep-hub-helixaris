"""
Generate realistic insulin-pen product photos in the style of the user's reference image,
applying the GHP-Health brand (phoenix DNA-helix logo, 'GHP Health' wordmark, dark/gold palette).

Uses TWO reference images:
  refs/pen_reference.webp  - desired physical look (white plastic body + silver cartridge + label band)
  refs/vial_reference.png  - GHP-Health brand identity (logo, label style, wordmark)
"""
import asyncio
import base64
import os
import uuid
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

PEN_REF = ROOT / "refs" / "pen_reference.webp"
BRAND_REF = ROOT / "refs" / "vial_reference.png"
UPLOADS_DIR = Path(os.environ.get("UPLOADS_DIR", ROOT / "uploads"))
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "test_database")
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
GEMINI_MODEL = "gemini-2.5-flash-image"


def build_pen_prompt(product_name: str) -> str:
    return (
        "Create a professional pharmaceutical product photograph of an insulin-style injection pen "
        "in the EXACT physical style of the FIRST reference image. The pen must have: a long "
        "white plastic upper body with a removable matte-white cap, a polished silver/chrome "
        "cartridge holder in the lower half showing a small transparent dose-display window, and "
        "a small orange/red plastic ring at the very tip where the needle attaches. It should "
        "clearly read as a medical insulin pen, not a writing pen.\n\n"
        "Apply the GHP-Health BRAND from the SECOND reference image: place a glossy dark "
        "black-to-charcoal label wrap around the silver cartridge section that displays the "
        "gold/silver phoenix DNA-helix logo on the left, the 'GHP Health' wordmark, and the large "
        f"gold product name printed across the label reading: \"{product_name}\". Keep the hexagon "
        "background pattern from the brand reference visible on the label band.\n\n"
        "Behind the pen, lying flat on the surface, place a premium dark navy-black product box "
        f"with the gold phoenix DNA-helix logo on the left and the large gold product name \"{product_name}\" "
        "printed on the right of the box. The pen rests on top of the box.\n\n"
        "Setting: clean modern laboratory background, softly blurred with cool blue lighting "
        "(beakers and pipettes visible but out of focus), subtle reflection on the surface. "
        "Professional pharmaceutical product photography, sharp focus on the pen and box, "
        "square aspect ratio, no extra text, no watermarks."
    )


async def generate_one(product: dict, pen_ref_b64: str, brand_ref_b64: str) -> str | None:
    session_id = f"img-pen-v3-{product['id']}-{uuid.uuid4().hex[:6]}"
    chat = (
        LlmChat(api_key=EMERGENT_LLM_KEY, session_id=session_id, system_message="You generate pharmaceutical product photography.")
        .with_model("gemini", GEMINI_MODEL)
        .with_params(modalities=["image", "text"])
    )
    msg = UserMessage(
        text=build_pen_prompt(product["name"]),
        file_contents=[ImageContent(pen_ref_b64), ImageContent(brand_ref_b64)],
    )
    try:
        text, images = await chat.send_message_multimodal_response(msg)
    except Exception as e:
        print(f"  [ERR] {product['name']}: {e}")
        return None
    if not images:
        print(f"  [WARN] {product['name']}: no image returned. {str(text)[:120]}")
        return None
    img = images[0]
    ext = "png" if "png" in img.get("mime_type", "image/png") else "jpg"
    filename = f"gen_{product['id']}.{ext}"
    (UPLOADS_DIR / filename).write_bytes(base64.b64decode(img["data"]))
    return f"/api/uploads/{filename}"


async def main(only_slug: str | None = None):
    pen_b64 = base64.b64encode(PEN_REF.read_bytes()).decode()
    brand_b64 = base64.b64encode(BRAND_REF.read_bytes()).decode()
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    flt = {"category": "pens"}
    if only_slug:
        flt["slug"] = only_slug
    products = await db.products.find(flt).sort("name", 1).to_list(50)
    print(f"Regenerating {len(products)} pen products (insulin-pen style)...")
    success = 0
    for i, p in enumerate(products, 1):
        print(f"[{i}/{len(products)}] {p['name']}")
        url = await generate_one(p, pen_b64, brand_b64)
        if url:
            await db.products.update_one(
                {"id": p["id"]},
                {"$set": {"image": url, "updated_at": datetime.utcnow()}},
            )
            print(f"  -> {url}")
            success += 1
        await asyncio.sleep(0.5)
    print(f"\nDone. {success}/{len(products)} regenerated.")


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", default=None)
    args = ap.parse_args()
    asyncio.run(main(only_slug=args.slug))
