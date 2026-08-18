"""Regenerate Eloralintide vial using an existing vial as an image reference so branding is identical."""
import asyncio
import base64
import mimetypes
import os
from pathlib import Path
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

load_dotenv()

REF = Path('/app/backend/uploads/gen_7d26a5aa-6bf1-4b81-ae84-8fcc08b394f3.png')  # AHKcu 100mg
OUT = Path('/app/frontend/public/vials/eloralintide-10mg.png')

PROMPT = (
    "Using the attached reference vial image as the exact style and branding, create a new pharmaceutical peptide vial "
    "with the SAME label design, SAME layout, SAME colours, SAME gold DNA helix, SAME 'GHP Health' lettering, "
    "SAME hexagon pattern, SAME 'For Research Purposes Only' side text, SAME vial shape, SAME background. "
    "The ONLY difference: at the bottom of the label where the product name appears, replace it with 'Eloralintide 10mg' "
    "in the same gold metallic font, same size, same position. Keep everything else pixel-identical to the reference. "
    "Do not add or remove any other elements."
)


async def main():
    key = os.getenv('EMERGENT_LLM_KEY')
    chat = LlmChat(api_key=key, session_id='eloralintide-ref', system_message='Pharmaceutical product photography artist — match reference exactly.')
    chat.with_model('gemini', 'gemini-3.1-flash-image-preview').with_params(modalities=['image', 'text'])
    ref_b64 = base64.b64encode(REF.read_bytes()).decode()
    mime = mimetypes.guess_type(str(REF))[0] or 'image/png'
    user_msg = UserMessage(
        text=PROMPT,
        file_contents=[ImageContent(image_base64=ref_b64)],
    )
    text, images = await chat.send_message_multimodal_response(user_msg)
    if not images:
        print(f'NO IMAGE — {text[:200]}')
        return
    OUT.write_bytes(base64.b64decode(images[0]['data']))
    print(f'OK — {OUT} ({OUT.stat().st_size // 1024}KB)')


asyncio.run(main())
