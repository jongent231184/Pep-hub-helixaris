"""Generate 8 branded GHP-Health tall-cylinder oral peptide tubs, matching the existing vial label style."""
import asyncio
import base64
import os
from pathlib import Path
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage

load_dotenv()

OUT_DIR = Path('/app/backend/uploads/orals-final')
OUT_DIR.mkdir(parents=True, exist_ok=True)

# 8 products — (filename slug, product name shown on the label)
PRODUCTS = [
    ('slupp-332-50mg', 'SLUPP-332 50mg'),
    ('methylene-blue-20mg', 'Methylene Blue 20mg'),
    ('tesofensine-500mcg', 'Tesofensine 500mcg'),
    ('slupp-332-bma-15-combo', 'SLUPP-332 + BMA-15 300mcg'),
    ('bam15-50mg', 'BAM15 50mg'),
    ('5-amino-1mq-50mg', '5-Amino-1MQ 50mg'),
    ('minoxidil-5mg', 'Minoxidil 5mg'),
    ('tirzepatide-500mcg', 'Tirzepatide 500mcg'),
]

BRAND_PROMPT_TEMPLATE = (
    "Studio product photography of a tall cylindrical pharmaceutical tablet bottle, white opaque plastic, "
    "front-facing, centered on a soft light-grey studio background with a subtle shadow underneath. "
    "The bottle has a chrome/silver metallic screw cap on top. "
    "A large black label wraps the front of the bottle. The label design is: "
    "a black-to-dark-grey gradient background with a subtle golden honeycomb hexagon pattern overlay, "
    "a metallic gold DNA-helix logo centered in the upper portion of the label, "
    "the words 'GHP Health' in metallic gold serif-style lettering directly beneath the DNA helix, "
    "on the right vertical edge of the label the text 'For Research Purposes Only' running vertically in white/gold, "
    "and at the bottom of the label the product name '{name}' in large bold metallic gold text. "
    "Sharp focus on the label, professional pharma product shot, high resolution, no other text or logos, no background objects."
)


async def main():
    api_key = os.getenv('EMERGENT_LLM_KEY')
    for slug, name in PRODUCTS:
        chat = LlmChat(api_key=api_key, session_id=f'orals-{slug}', system_message='Pharmaceutical product photography artist')
        chat.with_model('gemini', 'gemini-3.1-flash-image-preview').with_params(modalities=['image', 'text'])
        prompt = BRAND_PROMPT_TEMPLATE.format(name=name)
        try:
            text, images = await chat.send_message_multimodal_response(UserMessage(text=prompt))
            if not images:
                print(f'{slug}: NO IMAGE returned. Text: {text[:200]}')
                continue
            out_path = OUT_DIR / f'{slug}.png'
            out_path.write_bytes(base64.b64decode(images[0]['data']))
            print(f'{slug}: OK — {out_path.stat().st_size // 1024}KB')
        except Exception as e:
            print(f'{slug}: FAIL — {e}')


asyncio.run(main())
