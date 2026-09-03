"""Backfill existing local `/app/backend/uploads/*` files into Emergent Object
Storage so the `/api/uploads/{filename}` endpoint keeps serving them after
the ephemeral local disk goes away.

Idempotent — checks the `uploads` collection first and skips any file that
already has a DB record + storage path.

Run inside the pod:
    cd /app/backend && python backfill_uploads_to_storage.py
"""
import asyncio
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

from storage import APP_NAME, MIME_TYPES, init_storage, put_object  # noqa: E402

UPLOADS_DIR = Path('/app/backend/uploads')


async def main():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]

    key = init_storage()
    if not key:
        raise SystemExit('Could not initialise object storage — check EMERGENT_LLM_KEY.')

    if not UPLOADS_DIR.exists():
        print(f'{UPLOADS_DIR} does not exist — nothing to backfill.')
        return

    files = sorted(p for p in UPLOADS_DIR.iterdir() if p.is_file())
    print(f'Found {len(files)} local upload(s) to consider.')

    uploaded = 0
    skipped = 0
    failed = 0

    for path in files:
        filename = path.name
        # Skip if already migrated
        existing = await db.uploads.find_one({'filename': filename})
        if existing and existing.get('storage_path'):
            skipped += 1
            continue

        ext = path.suffix.lower()
        content_type = MIME_TYPES.get(ext, 'application/octet-stream')
        storage_path = f'{APP_NAME}/uploads/{filename}'

        try:
            data = path.read_bytes()
            result = await asyncio.to_thread(put_object, storage_path, data, content_type)
        except Exception as e:
            failed += 1
            print(f'  ✗ {filename}: {e}')
            continue

        # Upsert DB record (unique by filename)
        await db.uploads.update_one(
            {'filename': filename},
            {
                '$set': {
                    'storage_path': result['path'],
                    'content_type': content_type,
                    'size': result.get('size', len(data)),
                    'category': 'document' if ext == '.pdf' else 'image',
                    'updated_at': datetime.now(timezone.utc),
                },
                '$setOnInsert': {
                    'id': str(uuid.uuid4()),
                    'filename': filename,
                    'created_at': datetime.now(timezone.utc),
                },
            },
            upsert=True,
        )
        uploaded += 1
        print(f'  ✓ {filename} → {result["path"]} ({result.get("size", len(data))} bytes)')

    print(f'\nDone. uploaded={uploaded}  skipped={skipped}  failed={failed}')


if __name__ == '__main__':
    asyncio.run(main())
