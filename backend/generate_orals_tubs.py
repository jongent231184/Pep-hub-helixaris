"""Generate 3 branded GHP-Health capsule tub images for the Oral Peptides category tile options."""
import asyncio
import base64
import os
from pathlib import Path
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage

load_dotenv()

OUT_DIR = Path('/app/backend/uploads/orals-tubs')
OUT_DIR.mkdir(parents=True, exist_ok=True)

BRAND_STYLE = (
    "The tub is bright white with the GHP-Health logo in sky-blue (#0EA5E9) clearly printed on the front label. "
    "The label reads 'GHP-HEALTH' in bold uppercase sans-serif, with a subtle blue cross emblem. "
    "Background is a soft sky-blue-to-white gradient. Clean, minimalist medical/research aesthetic. "
    "Studio product photography, soft shadow underneath, no other text, no other logos."
)

VARIANTS = [
    ("wide-round", "A short wide round pharmaceutical capsule tub, screw-top white cap, front-facing centered. "),
    ("tall-cylinder", "A tall cylindrical pharmaceutical tablet bottle with a white flat cap, front-facing centered. "),
    ("square-shoulder", "A square-shouldered pharmaceutical capsule bottle with a white cap, front-facing centered. "),
]


async def main():
    api_key = os.getenv('EMERGENT_LLM_KEY')
    for slug, opener in VARIANTS:
        chat = LlmChat(api_key=api_key, session_id=f'orals-{slug}', system_message='Product design assistant')
        chat.with_model('gemini', 'gemini-3.1-flash-image-preview').with_params(modalities=['image', 'text'])
        prompt = opener + BRAND_STYLE
        text, images = await chat.send_message_multimodal_response(UserMessage(text=prompt))
        if not images:
            print(f'{slug}: no image returned. Text: {text[:200]}')
            continue
        out_path = OUT_DIR / f'{slug}.png'
        out_path.write_bytes(base64.b64decode(images[0]['data']))
        print(f'{slug}: {out_path}')


asyncio.run(main())
