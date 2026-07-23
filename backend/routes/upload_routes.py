"""Image + document upload routes (admin only)."""
import os
import uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from auth import require_admin

UPLOADS_DIR = Path(os.environ.get('UPLOADS_DIR', '/app/backend/uploads'))
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXT = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'}
ALLOWED_DOC_EXT = {'.pdf', '.jpg', '.jpeg', '.png', '.webp'}
MAX_SIZE = 8 * 1024 * 1024  # 8MB
MAX_DOC_SIZE = 20 * 1024 * 1024  # 20MB (PDFs are larger)

router = APIRouter(prefix='/uploads', tags=['uploads'])


@router.post('')
async def upload_image(file: UploadFile = File(...), _=Depends(require_admin)):
    ext = Path(file.filename or '').suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f'Unsupported file type. Allowed: {", ".join(ALLOWED_EXT)}')
    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(400, f'File too large. Max {MAX_SIZE // (1024 * 1024)}MB')
    filename = f'{uuid.uuid4().hex}{ext}'
    filepath = UPLOADS_DIR / filename
    with open(filepath, 'wb') as f:
        f.write(contents)
    return {'filename': filename, 'url': f'/api/uploads/{filename}'}


@router.post('/document')
async def upload_document(file: UploadFile = File(...), _=Depends(require_admin)):
    """Upload a PDF or image (for COAs and other documents)."""
    ext = Path(file.filename or '').suffix.lower()
    if ext not in ALLOWED_DOC_EXT:
        raise HTTPException(400, f'Unsupported file type. Allowed: {", ".join(ALLOWED_DOC_EXT)}')
    contents = await file.read()
    if len(contents) > MAX_DOC_SIZE:
        raise HTTPException(400, f'File too large. Max {MAX_DOC_SIZE // (1024 * 1024)}MB')
    filename = f'{uuid.uuid4().hex}{ext}'
    filepath = UPLOADS_DIR / filename
    with open(filepath, 'wb') as f:
        f.write(contents)
    return {
        'filename': filename,
        'url': f'/api/uploads/{filename}',
        'file_type': 'pdf' if ext == '.pdf' else 'image',
    }
