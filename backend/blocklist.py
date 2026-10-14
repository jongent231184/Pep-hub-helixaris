"""Customer blocklist matching — shared by checkout + paylink + admin routes."""
import asyncio
import re
from datetime import datetime
from typing import Optional
from db import db
from email_service import send_blocked_attempt_email

BLOCKED_MESSAGE = (
    "We're unable to accept orders for these customer details. "
    "If you believe this is a mistake, please contact support."
)


def norm_text(v: Optional[str]) -> str:
    return re.sub(r'[^a-z0-9]', '', (v or '').lower())


def norm_email(v: Optional[str]) -> str:
    return (v or '').strip().lower()


def norm_name(first: Optional[str], last: Optional[str]) -> str:
    return norm_text(f'{first or ""}{last or ""}')


def entry_matches(entry: dict, addr: dict) -> bool:
    """An entry matches an address when ANY of these hold:
    - email on file equals the order email
    - postcode + address line 1 both match (house-level ban, name-agnostic)
    - postcode + full name both match
    - entry has only a name (no email / postcode) and the full name matches
    """
    e_email = norm_email(entry.get('email'))
    e_post = norm_text(entry.get('postcode'))
    e_addr = norm_text(entry.get('address1'))
    e_name = norm_name(entry.get('first_name'), entry.get('last_name'))

    a_email = norm_email(addr.get('email'))
    a_post = norm_text(addr.get('postcode'))
    a_addr = norm_text(addr.get('address1'))
    a_name = norm_name(addr.get('first_name'), addr.get('last_name'))

    if e_email and a_email and e_email == a_email:
        return True
    if e_post and a_post and e_post == a_post:
        if e_addr and a_addr and e_addr == a_addr:
            return True
        if e_name and a_name and e_name == a_name:
            return True
    if e_name and not e_email and not e_post and a_name and e_name == a_name:
        return True
    return False


async def find_block_match(addresses: list[dict]) -> Optional[dict]:
    entries = await db.blocklist.find().to_list(2000)
    for entry in entries:
        for addr in addresses:
            if addr and entry_matches(entry, addr):
                return entry
    return None


async def record_hit(entry: dict, addr: dict, channel: str = 'checkout') -> None:
    updated = await db.blocklist.find_one_and_update(
        {'id': entry['id']},
        {'$inc': {'hits': 1}, '$set': {
            'last_hit_at': datetime.utcnow(),
            'last_hit_details': {
                'name': f"{addr.get('first_name', '')} {addr.get('last_name', '')}".strip(),
                'email': addr.get('email', ''),
                'postcode': addr.get('postcode', ''),
            },
        }},
        return_document=True,
    )
    hits = int((updated or entry).get('hits', 1))
    asyncio.create_task(send_blocked_attempt_email(entry, addr, channel, hits))
