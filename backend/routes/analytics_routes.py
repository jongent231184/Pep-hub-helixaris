"""Cookie-free first-party traffic analytics."""
import asyncio
import hashlib
import os
import re
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urlparse
from fastapi import APIRouter, Request, Depends, Query
from pydantic import BaseModel
from db import db
from auth import require_admin
from ip_org import enrich_pageview

router = APIRouter(tags=['analytics'])

BOT_RE = re.compile(r'bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pingdom|monitor', re.I)
SKIP_PREFIXES = ('/admin', '/hub', '/coach', '/ambassador', '/portal')

SOURCE_MAP = [
    (re.compile(r'google\.'), 'Google'),
    (re.compile(r'bing\.com'), 'Bing'),
    (re.compile(r'duckduckgo'), 'DuckDuckGo'),
    (re.compile(r'yahoo\.'), 'Yahoo'),
    (re.compile(r'instagram\.com|l\.instagram'), 'Instagram'),
    (re.compile(r'facebook\.com|fb\.com|l\.facebook|m\.facebook'), 'Facebook'),
    (re.compile(r't\.co$|twitter\.com|x\.com'), 'X / Twitter'),
    (re.compile(r'tiktok\.com'), 'TikTok'),
    (re.compile(r'reddit\.com'), 'Reddit'),
    (re.compile(r'youtube\.com|youtu\.be'), 'YouTube'),
    (re.compile(r'whatsapp'), 'WhatsApp'),
    (re.compile(r't\.me|telegram'), 'Telegram'),
    (re.compile(r'linkedin\.com'), 'LinkedIn'),
    (re.compile(r'pinterest'), 'Pinterest'),
    (re.compile(r'chatgpt\.com|openai\.com'), 'ChatGPT'),
]


class PageView(BaseModel):
    path: str
    referrer: Optional[str] = ''
    screen_w: Optional[int] = None


def _client_ip(request: Request) -> str:
    xff = request.headers.get('x-forwarded-for', '')
    if xff:
        return xff.split(',')[0].strip()
    return request.client.host if request.client else ''


def _device(screen_w: Optional[int], ua: str) -> str:
    if screen_w:
        if screen_w < 768:
            return 'mobile'
        if screen_w < 1024:
            return 'tablet'
        return 'desktop'
    return 'mobile' if re.search(r'Mobi|Android|iPhone', ua) else 'desktop'


def _source(referrer: str, own_host: str) -> tuple[str, str]:
    if not referrer:
        return '', 'Direct / none'
    host = (urlparse(referrer).hostname or '').lower()
    if not host or host == own_host or host.endswith('.' + own_host):
        return '', 'Direct / none'
    for rx, label in SOURCE_MAP:
        if rx.search(host):
            return host, label
    return host, host.removeprefix('www.')


@router.post('/analytics/pv')
async def record_pageview(payload: PageView, request: Request):
    ua = request.headers.get('user-agent', '')
    path = (payload.path or '/').split('?')[0][:200].rstrip('/') or '/'
    if BOT_RE.search(ua) or path.startswith(SKIP_PREFIXES):
        return {'ok': True, 'skipped': True}
    now = datetime.utcnow()
    salt = os.environ.get('ANALYTICS_SALT') or os.environ.get('JWT_SECRET', '')
    visitor = hashlib.sha256(f"{salt}|{now:%Y-%m-%d}|{_client_ip(request)}|{ua}".encode()).hexdigest()[:16]
    own_host = (request.headers.get('origin') or request.headers.get('host') or '')
    own_host = (urlparse(own_host).hostname if '://' in own_host else own_host.split(':')[0]).lower()
    ref_host, source = _source(payload.referrer or '', own_host)
    res = await db.page_views.insert_one({
        'ts': now,
        'date': now.strftime('%Y-%m-%d'),
        'path': path,
        'ref_host': ref_host,
        'source': source,
        'device': _device(payload.screen_w, ua),
        'visitor': visitor,
    })
    asyncio.create_task(enrich_pageview(res.inserted_id, _client_ip(request)))
    return {'ok': True}


async def _period_stats(start: datetime, end: datetime) -> dict:
    pipeline = [
        {'$match': {'ts': {'$gte': start, '$lt': end}}},
        {'$group': {'_id': None, 'views': {'$sum': 1}, 'visitors': {'$addToSet': '$visitor'}}},
    ]
    rows = await db.page_views.aggregate(pipeline).to_list(1)
    if not rows:
        return {'views': 0, 'visitors': 0}
    return {'views': rows[0]['views'], 'visitors': len(rows[0]['visitors'])}


@router.get('/admin/analytics/summary')
async def analytics_summary(days: int = Query(30, ge=1, le=365), _=Depends(require_admin)):
    now = datetime.utcnow()
    end = datetime(now.year, now.month, now.day) + timedelta(days=1)
    start = end - timedelta(days=days)
    prev_start = start - timedelta(days=days)
    match = {'$match': {'ts': {'$gte': start, '$lt': end}}}

    daily_rows = await db.page_views.aggregate([
        match,
        {'$group': {'_id': '$date', 'views': {'$sum': 1}, 'visitors': {'$addToSet': '$visitor'}}},
    ]).to_list(400)
    by_date = {r['_id']: {'views': r['views'], 'visitors': len(r['visitors'])} for r in daily_rows}
    daily = []
    for i in range(days):
        d = (start + timedelta(days=i)).strftime('%Y-%m-%d')
        daily.append({'date': d, **by_date.get(d, {'views': 0, 'visitors': 0})})

    async def top(field: str, limit: int = 10, extra_match: Optional[dict] = None):
        m = {'$match': {'ts': {'$gte': start, '$lt': end}, **(extra_match or {})}}
        rows = await db.page_views.aggregate([
            m,
            {'$group': {'_id': f'${field}', 'views': {'$sum': 1}, 'visitors': {'$addToSet': '$visitor'}}},
            {'$sort': {'views': -1}},
            {'$limit': limit},
        ]).to_list(limit)
        return [{'key': r['_id'], 'views': r['views'], 'visitors': len(r['visitors'])} for r in rows]

    current = await _period_stats(start, end)
    previous = await _period_stats(prev_start, start)

    org_rows = await db.page_views.aggregate([
        {'$match': {'ts': {'$gte': start, '$lt': end}, 'org_kind': {'$in': ['org', 'public']}}},
        {'$group': {
            '_id': '$org', 'asn': {'$first': '$asn'}, 'kind': {'$first': '$org_kind'},
            'views': {'$sum': 1}, 'visitors': {'$addToSet': '$visitor'},
            'last_seen': {'$max': '$ts'}, 'pages': {'$addToSet': '$path'},
        }},
        {'$sort': {'views': -1}},
        {'$limit': 25},
    ]).to_list(25)
    organisations = [{
        'key': r['_id'], 'asn': r['asn'], 'kind': r['kind'], 'views': r['views'],
        'visitors': len(r['visitors']), 'last_seen': r['last_seen'], 'pages': sorted(r['pages'])[:6],
    } for r in org_rows]
    kinds = await db.page_views.aggregate([
        match, {'$group': {'_id': '$org_kind', 'views': {'$sum': 1}}},
    ]).to_list(10)

    return {
        'range': {'days': days, 'start': start.strftime('%Y-%m-%d'), 'end': (end - timedelta(days=1)).strftime('%Y-%m-%d')},
        'totals': current,
        'previous': previous,
        'daily': daily,
        'top_pages': await top('path'),
        'sources': await top('source'),
        'devices': await top('device', 5),
        'organisations': organisations,
        'network_kinds': {(k['_id'] or 'unknown'): k['views'] for k in kinds},
    }
