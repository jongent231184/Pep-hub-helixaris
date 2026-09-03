"""Emergent Object Storage helper — thin sync wrapper around the platform's
`/objstore/api/v1/storage` HTTP API. Init runs once at process start and
caches a session `storage_key`; every subsequent request reuses it.

We keep the HTTP calls sync (`requests`) rather than async — object storage
is only touched by admin-only upload/download endpoints which are low-volume
and running the network I/O in a thread via `run_in_executor` when called
from FastAPI keeps the event loop free.
"""
import os
import logging
from typing import Optional, Tuple

import requests

logger = logging.getLogger('ghp.storage')

# The platform sets INTEGRATION_PROXY_URL; empty string means "use the
# public default". Follow the playbook literally.
_BASE = (os.environ.get('INTEGRATION_PROXY_URL') or '').strip() or 'https://integrations.emergentagent.com'
STORAGE_URL = _BASE.rstrip('/') + '/objstore/api/v1/storage'
EMERGENT_KEY = os.environ.get('EMERGENT_LLM_KEY') or ''
APP_NAME = os.environ.get('STORAGE_APP_NAME', 'ghp-health')

_storage_key: Optional[str] = None


def init_storage(force: bool = False) -> Optional[str]:
    """Mint (or return cached) session storage key. Safe to call repeatedly.

    Returns None if the platform key is missing or the init call fails — the
    caller decides whether that's fatal. Uploads guard against a None key
    with a clear 500."""
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    if not EMERGENT_KEY:
        logger.warning('EMERGENT_LLM_KEY not set — object storage unavailable')
        return None
    try:
        resp = requests.post(
            f'{STORAGE_URL}/init',
            json={'emergent_key': EMERGENT_KEY},
            timeout=30,
        )
        resp.raise_for_status()
        _storage_key = resp.json()['storage_key']
        logger.info('Object storage initialised')
        return _storage_key
    except Exception as e:
        logger.exception(f'init_storage failed: {e}')
        return None


def put_object(path: str, data: bytes, content_type: str) -> dict:
    """Upload bytes at `path` (no leading slash). Returns {path, size, etag}."""
    key = init_storage()
    if not key:
        raise RuntimeError('object storage not initialised')
    resp = requests.put(
        f'{STORAGE_URL}/objects/{path}',
        headers={'X-Storage-Key': key, 'Content-Type': content_type},
        data=data,
        timeout=120,
    )
    if resp.status_code == 404:
        # cached key gone stale — one retry with a fresh key
        key = init_storage(force=True)
        if not key:
            raise RuntimeError('object storage not initialised')
        resp = requests.put(
            f'{STORAGE_URL}/objects/{path}',
            headers={'X-Storage-Key': key, 'Content-Type': content_type},
            data=data,
            timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str) -> Tuple[bytes, str]:
    """Download `path`. Returns (bytes, content_type)."""
    key = init_storage()
    if not key:
        raise RuntimeError('object storage not initialised')
    resp = requests.get(
        f'{STORAGE_URL}/objects/{path}',
        headers={'X-Storage-Key': key},
        timeout=60,
    )
    if resp.status_code == 404:
        key = init_storage(force=True)
        if not key:
            raise RuntimeError('object storage not initialised')
        resp = requests.get(
            f'{STORAGE_URL}/objects/{path}',
            headers={'X-Storage-Key': key},
            timeout=60,
        )
    resp.raise_for_status()
    return resp.content, resp.headers.get('Content-Type', 'application/octet-stream')


MIME_TYPES = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
}
