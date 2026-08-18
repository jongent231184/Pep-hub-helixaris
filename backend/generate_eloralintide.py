"""Generate a branded GHP-Health vial image for Eloralintide 10mg matching existing vial style."""
import asyncio
import base64
import os
from pathlib import Path
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage

load_dotenv()

OUT = Path('/app/frontend/public/vials/eloralintide-10mg.png')
OUT.parent.mkdir(parents=True, exist_ok=True)

PROMPT = (
    "Studio product photography of a small pharmaceutical peptide vial, clear glass with a black rubber stopper and silver metallic crimp cap. "
    "Front-facing, centered on a soft light-grey studio background with a subtle shadow underneath. "
    "A large black label wraps the front of the vial. The label design is: "
    "black-to-dark-grey gradient background with a subtle golden honeycomb hexagon pattern overlay, "
    "a metallic gold DNA-helix logo centered in the upper portion of the label, "
    "the words 'GHP Health' in metallic gold serif-style lettering directly beneath the DNA helix, "
    "on the right vertical edge of the label the text 'For Research Purposes Only' running vertically in gold, "
    "and at the bottom of the label the product name 'Eloralintide 10mg' in large bold metallic gold text. "
    "Sharp focus on the label, professional pharma product shot, high resolution, no other text or logos, no background objects."
)


async def main():
    key = os.getenv('EMERGENT_LLM_KEY')
    chat = LlmChat(api_key=key, session_id='eloralintide', system_message='Pharmaceutical product photography artist')
    chat.with_model('gemini', 'gemini-3.1-flash-image-preview').with_params(modalities=['image', 'text'])
    text, images = await chat.send_message_multimodal_response(UserMessage(text=PROMPT))
    if not images:
        print(f'NO IMAGE — {text[:200]}')
        return
    OUT.write_bytes(base64.b64decode(images[0]['data']))
    print(f'OK — {OUT} ({OUT.stat().st_size // 1024}KB)')


asyncio.run(main())
