"""One-off: generate an MT-2 pen product photograph in the NEW GHP-Health
premium presentation style (angled black box + white/gold pen + 5 spare
needle tips in a fitted black tray, on a clean white background).

Uses ONE reference image: refs/motsc_reference.png — the MOTSc 40MG box
that defines the current GHP-Health branded look.

Usage:
    cd /app/backend && python generate_mt2_pen_v2.py
"""
import asyncio
import base64
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from storage import APP_NAME, MIME_TYPES, put_object  # noqa: E402

REF = ROOT / "refs" / "motsc_reference.png"

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "test_database")
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
GEMINI_MODEL = "gemini-2.5-flash-image"

PRODUCT_NAME = "MT-2"
PRODUCT_STRENGTH = "10MG"


def build_prompt(product_name: str, strength: str) -> str:
    return (
        "Create a professional pharmaceutical product photograph in the EXACT same "
        "visual style, layout, lighting and branding as the reference image.\n\n"
        "The scene must contain TWO elements arranged on a clean pure-white studio "
        "background with soft shadowing:\n\n"
        "1. A premium matte-black rectangular pharmaceutical BOX positioned in the "
        "upper half of the frame at a slight three-quarter angle. On the box print:\n"
        "   - The GHP Health silver-and-gold DNA-helix logo on the left, exactly as "
        "in the reference (a stylised interlocking silver and gold double-helix).\n"
        "   - The 'GHP Health' wordmark next to it — 'GHP' in brushed silver, 'Health' "
        "in polished gold.\n"
        f"   - Below the wordmark, in gold, the product line: '{product_name} {strength} PEPTIDE'\n"
        "   - Below that, in smaller silver/white text: 'INJECTION PEN'\n"
        "   - Below that, a small STORAGE block in orange/amber text reading:\n"
        "     'STORAGE:'\n"
        "     'Refrigerate at 2°C to 8°C (36°F to 46°F).'\n"
        "     'Do not freeze. Protect from light.'\n"
        "   - A subtle dark DNA-helix and molecular-hexagon watermark pattern faded "
        "into the right-hand side of the box.\n"
        "   - A thin gold trim border along the bottom edge of the box.\n\n"
        "2. In the lower half of the frame, a matte-black fitted plastic tray "
        "containing: a single white pharmaceutical injection pen with gold accent "
        "rings (a gold band near the top, gold cap-tip at the very end, small gold "
        "dose-indicator markings on the mid-body), lying horizontally in the top "
        "well of the tray; and BELOW the pen, five identical dark-grey plastic "
        "needle-tip attachments arranged in a neat row in fitted circular tray "
        "recesses. The pen is white with subtle satin sheen, the tray is glossy "
        "black plastic.\n\n"
        "Composition: box in the upper half, tray in the lower half, both at "
        "matching three-quarter angles, soft even studio lighting, sharp focus, "
        "professional pharmaceutical product photography, clean white background, "
        "no watermarks, no extra text beyond what is described. Square-ish aspect "
        "ratio suitable for an e-commerce product tile."
    )


async def main():
    ref_b64 = base64.b64encode(REF.read_bytes()).decode()

    session_id = f"img-mt2v2-{uuid.uuid4().hex[:8]}"
    chat = (
        LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message="You generate pharmaceutical product photography that matches the reference brand style exactly.",
        )
        .with_model("gemini", GEMINI_MODEL)
        .with_params(modalities=["image", "text"])
    )
    msg = UserMessage(
        text=build_prompt(PRODUCT_NAME, PRODUCT_STRENGTH),
        file_contents=[ImageContent(ref_b64)],
    )
    print(f"Generating {PRODUCT_NAME} pen photograph (v2 — MOTSc style)...")
    text, images = await chat.send_message_multimodal_response(msg)
    if not images:
        print("[ERROR] No image returned.")
        print(f"Model response: {str(text)[:300]}")
        return

    img = images[0]
    mime = img.get("mime_type", "image/png")
    ext = ".png" if "png" in mime else ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    contents = base64.b64decode(img["data"])
    storage_path = f"{APP_NAME}/uploads/{filename}"
    content_type = MIME_TYPES.get(ext, mime or "application/octet-stream")

    result = await asyncio.to_thread(put_object, storage_path, contents, content_type)

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    await db.uploads.insert_one({
        "id": str(uuid.uuid4()),
        "filename": filename,
        "storage_path": result["path"],
        "content_type": content_type,
        "size": result.get("size", len(contents)),
        "category": "image",
        "created_at": datetime.now(timezone.utc),
    })

    # Local copy for preview convenience
    local_out = ROOT / "uploads" / f"mt2v2-{filename}"
    local_out.parent.mkdir(parents=True, exist_ok=True)
    local_out.write_bytes(contents)

    print("\n✅ MT-2 pen (v2) generated and uploaded to Object Storage.")
    print(f"   Filename : {filename}")
    print(f"   Local    : {local_out}")
    print(f"   Size     : {len(contents) / 1024:.1f} KB")
    print(f"   URL path : /api/uploads/{filename}")


if __name__ == "__main__":
    asyncio.run(main())
