"""Image + document upload routes (admin only).

Files are stored in Emergent Object Storage (durable across pod restarts /
redeploys). A DB record in `uploads` maps the public filename (used in the
URL `/api/uploads/{filename}`) to the storage path so downloads can look up
and stream the bytes back with the correct content-type.
"""
import asyncio
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import Response

from auth import require_admin
from db import db
from storage import APP_NAME, MIME_TYPES, get_object, put_object

ALLOWED_EXT = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'}
ALLOWED_DOC_EXT = {'.pdf', '.jpg', '.jpeg', '.png', '.webp'}
MAX_SIZE = 8 * 1024 * 1024  # 8MB
MAX_DOC_SIZE = 20 * 1024 * 1024  # 20MB

router = APIRouter(prefix='/uploads', tags=['uploads'])


async def _store(contents: bytes, ext: str, category: str) -> dict:
    """Upload `contents` to object storage + persist a DB record.

    Returns {filename, url, storage_path, size}.
    """
    filename = f'{uuid.uuid4().hex}{ext}'
    storage_path = f'{APP_NAME}/uploads/{filename}'
    content_type = MIME_TYPES.get(ext, 'application/octet-stream')

    # `requests` is sync — offload to a thread to keep the event loop free.
    result = await asyncio.to_thread(put_object, storage_path, contents, content_type)

    await db.uploads.insert_one({
        'id': str(uuid.uuid4()),
        'filename': filename,
        'storage_path': result['path'],
        'content_type': content_type,
        'size': result.get('size', len(contents)),
        'category': category,  # 'image' | 'document'
        'created_at': datetime.now(timezone.utc),
    })
    return {'filename': filename, 'url': f'/api/uploads/{filename}', 'storage_path': result['path'], 'size': result.get('size', len(contents))}


@router.post('')
async def upload_image(file: UploadFile = File(...), _=Depends(require_admin)):
    ext = Path(file.filename or '').suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f'Unsupported file type. Allowed: {", ".join(ALLOWED_EXT)}')
    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(400, f'File too large. Max {MAX_SIZE // (1024 * 1024)}MB')
    try:
        result = await _store(contents, ext, category='image')
    except Exception as e:
        raise HTTPException(500, f'Storage upload failed: {e}')
    return {'filename': result['filename'], 'url': result['url']}


@router.post('/document')
async def upload_document(file: UploadFile = File(...), _=Depends(require_admin)):
    """Upload a PDF or image (for COAs and other documents)."""
    ext = Path(file.filename or '').suffix.lower()
    if ext not in ALLOWED_DOC_EXT:
        raise HTTPException(400, f'Unsupported file type. Allowed: {", ".join(ALLOWED_DOC_EXT)}')
    contents = await file.read()
    if len(contents) > MAX_DOC_SIZE:
        raise HTTPException(400, f'File too large. Max {MAX_DOC_SIZE // (1024 * 1024)}MB')
    try:
        result = await _store(contents, ext, category='document')
    except Exception as e:
        raise HTTPException(500, f'Storage upload failed: {e}')
    return {
        'filename': result['filename'],
        'url': result['url'],
        'file_type': 'pdf' if ext == '.pdf' else 'image',
    }


@router.get('/{filename}')
async def download_upload(filename: str):
    """Public download endpoint — streams the object back with correct
    content-type. Used by product images / COAs / About hero etc. that were
    written via the upload endpoints above."""
    # Guard against path traversal; filenames are always `{hex}.{ext}`.
    if '/' in filename or '\\' in filename or '..' in filename:
        raise HTTPException(400, 'Invalid filename')

    record = await db.uploads.find_one({'filename': filename})
    if not record:
        raise HTTPException(404, 'File not found')

    try:
        data, content_type = await asyncio.to_thread(get_object, record['storage_path'])
    except Exception as e:
        raise HTTPException(502, f'Storage fetch failed: {e}')

    return Response(
        content=data,
        media_type=record.get('content_type') or content_type,
        headers={'Cache-Control': 'public, max-age=86400'},
    )
