"""Generate the 5-Amino1MQ 50mg vial image using the existing Eloralintide vial
as a base64 reference so the whole vial catalog stays visually identical."""
import asyncio
import base64
import os
from pathlib import Path

from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

load_dotenv()

REF = Path('/app/frontend/public/vials/eloralintide-10mg.png')
OUT = Path('/app/frontend/public/vials/5-amino1mq-50mg.png')


async def main():
    key = os.getenv('EMERGENT_LLM_KEY')
    if not key or not REF.exists():
        print('Missing EMERGENT_LLM_KEY or reference')
        return
    ref_b64 = base64.b64encode(REF.read_bytes()).decode()

    chat = LlmChat(
        api_key=key,
        session_id='vial-5amino1mq',
        system_message=(
            'You are a pharmaceutical product photography artist. Match the provided '
            'reference vial image exactly and only swap the compound name and mg strength.'
        ),
    ).with_model('gemini', 'gemini-3.1-flash-image-preview').with_params(modalities=['image', 'text'])

    prompt = (
        'Using the attached reference vial image as the exact style, layout and branding, '
        'create a new GHP Health pharmaceutical peptide vial product photograph.\n\n'
        'MATCH EXACTLY (do not change any of the following):\n'
        '- Same 3/4 angle, same lighting, same shadow, same soft studio background.\n'
        '- Same tall glass vial with matte black label wrap, subtle gold trim.\n'
        '- Same gold DNA helix icon + \"GHP Health\" gold wordmark on the label.\n'
        '- Same faint DNA helix + molecular hexagon watermark on the label.\n'
        '- Same silver aluminium cap.\n'
        '- Same font family, weights, positions and kerning for every text element.\n\n'
        'THE ONLY DIFFERENCES:\n'
        '- Replace the compound name line (currently reads \"Eloralintide\") with \"5-Amino1MQ\" '
        'in the same gold metallic font, same size, same position.\n'
        '- Replace the mg strength line (currently reads \"10mg\") with \"50mg\" in the same '
        'font, size and position.\n\n'
        'Do NOT add or remove any other elements. Output a single photorealistic product '
        'photo, high resolution, transparent-friendly background matching the reference.'
    )

    msg = UserMessage(text=prompt, file_contents=[ImageContent(image_base64=ref_b64)])
    text, images = await chat.send_message_multimodal_response(msg)
    if not images:
        print(f'NO IMAGE returned: {text[:180]}')
        return
    OUT.write_bytes(base64.b64decode(images[0]['data']))
    print(f'OK {OUT} ({OUT.stat().st_size // 1024}KB)')


asyncio.run(main())
