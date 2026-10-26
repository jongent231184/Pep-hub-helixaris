"""Generate branded GHP-Health vial images for the October 2026 product pack (matches existing vial style)."""
import asyncio
import base64
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage

load_dotenv()
OUT_DIR = Path('/app/frontend/public/vials')

PACK = [
    ('cerebrolysin-60mg', 'Cerebrolysin 60mg'),
    ('ace-031-10mg', 'ACE-031 10mg'),
    ('pinealon-10mg', 'Pinealon 10mg'),
    ('pe-22-28-10mg', 'PE-22-28 10mg'),
    ('peg-mgf-2mg', 'PEG-MGF 2mg'),
    ('pnc-27-10mg', 'PNC-27 10mg'),
    ('hcg-5000iu', 'HCG 5000iu'),
    ('hmg-75iu', 'HMG 75iu'),
    ('vip-10mg', 'VIP 10mg'),
    ('reta-5mg-cagri-5mg', 'Reta 5mg / Cagri 5mg'),
    ('gonadorelin-2mg', 'Gonadorelin 2mg'),
    ('p21-10mg', 'P21 10mg'),
]

PROMPT = (
    "Studio product photography of a small pharmaceutical peptide vial, clear glass with a black rubber stopper and silver metallic crimp cap. "
    "Portrait orientation (taller than wide), the single vial front-facing and centered on a soft light-grey studio background with a subtle shadow underneath. "
    "A large black label wraps the front of the vial. The label design is: "
    "black-to-dark-grey gradient background with a subtle golden honeycomb hexagon pattern overlay, "
    "a metallic gold DNA-helix logo centered in the upper portion of the label, "
    "the words 'GHP Health' in metallic gold serif-style lettering directly beneath the DNA helix, "
    "on the right vertical edge of the label the text 'For Research Purposes Only' running vertically in gold, "
    "and at the bottom of the label the product name '{name}' in large bold metallic gold text, spelled exactly. "
    "Sharp focus on the label, professional pharma product shot, high resolution, no other text or logos, no background objects, no loose labels or extra items — only the one vial."
)


async def gen(slug: str, name: str, key: str) -> None:
    out = OUT_DIR / f'{slug}.png'
    if out.exists():
        print(f'skip {slug} (exists)', flush=True)
        return
    for attempt in range(3):
        try:
            chat = LlmChat(api_key=key, session_id=f'pack-{slug}-{attempt}', system_message='Pharmaceutical product photography artist')
            chat.with_model('gemini', 'gemini-3.1-flash-image-preview').with_params(modalities=['image', 'text'])
            text, images = await chat.send_message_multimodal_response(UserMessage(text=PROMPT.format(name=name)))
            if images:
                out.write_bytes(base64.b64decode(images[0]['data']))
                print(f'OK {slug} ({out.stat().st_size // 1024}KB)', flush=True)
                return
            print(f'no image for {slug}: {text[:120]}', flush=True)
        except Exception as e:
            print(f'error {slug} attempt {attempt}: {e}', flush=True)
            await asyncio.sleep(3)
    print(f'FAILED {slug}', flush=True)


async def main():
    key = os.getenv('EMERGENT_LLM_KEY')
    only = sys.argv[1:]
    items = [p for p in PACK if not only or p[0] in only]
    sem = asyncio.Semaphore(3)

    async def run(p):
        async with sem:
            await gen(p[0], p[1], key)

    await asyncio.gather(*(run(p) for p in items))


asyncio.run(main())
