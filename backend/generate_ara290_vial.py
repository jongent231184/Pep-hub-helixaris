"""One-off: generate an ARA-290 branded vial matching the KLOW/vial reference."""
import asyncio, base64, os, uuid
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from storage import APP_NAME, put_object  # noqa: E402

REF = ROOT / "refs" / "vial_reference.png"
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
MODEL = "gemini-2.5-flash-image"

PRODUCT = "ARA-290"
STRENGTH = "10MG"


def prompt():
    return (
        "Create a professional pharmaceutical product photograph of a glass "
        "research vial in the EXACT physical style and lighting as the reference "
        "image. Same clear glass vial, same shiny black metal crimp cap on top, "
        "same soft grey studio background with subtle reflection under the vial.\n\n"
        "The vial wraps a glossy black-to-charcoal label. On the label print:\n"
        "  - Silver-and-gold interlocking DNA-helix logo in the upper centre "
        "(same style as reference)\n"
        "  - 'GHP Health' wordmark below the logo (silver + gold)\n"
        f"  - Large gold uppercase product name across the lower half: '{PRODUCT} {STRENGTH}'\n"
        "  - Faint gold hexagon molecular-lattice pattern across the label\n"
        "  - Vertical text on the right edge of the label reading 'For Research "
        "Purposes Only'\n\n"
        "Sharp focus, professional pharmaceutical product photography, "
        "square-ish aspect ratio, no watermarks, no additional text."
    )


async def main():
    ref_b64 = base64.b64encode(REF.read_bytes()).decode()
    chat = (
        LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"ara290-{uuid.uuid4().hex[:8]}",
            system_message="You generate pharmaceutical vial photography matching a reference.",
        )
        .with_model("gemini", MODEL)
        .with_params(modalities=["image", "text"])
    )
    msg = UserMessage(
        text=prompt(),
        file_contents=[ImageContent(ref_b64)],
    )
    print(f"Generating {PRODUCT} {STRENGTH} vial...")
    text, images = await chat.send_message_multimodal_response(msg)
    if not images:
        print("[ERROR] No image returned.")
        print(f"Model text: {str(text)[:300]}")
        return
    img = images[0]
    ext = ".png" if "png" in img.get("mime_type", "image/png") else ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    contents = base64.b64decode(img["data"])
    storage_path = f"{APP_NAME}/uploads/{filename}"
    result = await asyncio.to_thread(put_object, storage_path, contents, "image/png" if ext == ".png" else "image/jpeg")

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ.get("DB_NAME", "test_database")]
    await db.uploads.insert_one({
        "id": str(uuid.uuid4()),
        "filename": filename,
        "storage_path": result["path"],
        "content_type": "image/png" if ext == ".png" else "image/jpeg",
        "size": result.get("size", len(contents)),
        "category": "image",
        "created_at": datetime.now(timezone.utc),
    })
    (ROOT / "uploads").mkdir(exist_ok=True)
    (ROOT / "uploads" / f"ara290-{filename}").write_bytes(contents)
    print("\n✅ ARA-290 vial uploaded.")
    print(f"   Filename : {filename}")
    print(f"   Size     : {len(contents)/1024:.1f} KB")
    print(f"   URL path : /api/uploads/{filename}")


if __name__ == "__main__":
    asyncio.run(main())
