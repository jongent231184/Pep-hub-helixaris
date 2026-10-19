"""IP → network organisation lookup (Team Cymru DNS + reverse DNS), cached in Mongo."""
import asyncio
import ipaddress
import re
from datetime import datetime
from typing import Optional
import dns.asyncresolver
import dns.reversename
from db import db

CONSUMER_RE = re.compile(
    r'\b(O2|TELEFONICA|VODAFONE|EE\b|EVERYTHING EVERYWHERE|ORANGE|T-MOBILE|THREE|HUTCHISON|H3G|BT-UK|BRITISH TELECOM|BTNET|'
    r'PLUSNET|SKY|VIRGIN MEDIA|NTL|TALKTALK|TALK TALK|TISCALI|ZEN INTERNET|HYPEROPTIC|GIGACLEAR|COMMUNITY FIBRE|'
    r'KCOM|VOXILITY|ANDREWS & ARNOLD|AAISP|IDNET|SHELL ENERGY|NOW BROADBAND|YOUFIBRE|TRUESPEED|CITYFIBRE|LEBARA|GIFFGAFF|'
    r'TESCO MOBILE|VIRGIN MOBILE|SMARTY|VOXI|ID MOBILE|COMCAST|VERIZON|AT&T|SPRINT|CHARTER|COX|ROGERS|BELL CANADA|TELUS|'
    r'DEUTSCHE TELEKOM|TELIA|PROXIMUS|KPN|ZIGGO|FREE SAS|BOUYGUES|SFR|TELSTRA|OPTUS|EIR|VIRGIN|BROADBAND|MOBILE|CELLULAR|WIRELESS|ISP|TELECOM\w*|TELEKOM\w*|COMMUNICATIONS)\b',
    re.I,
)
HOSTING_RE = re.compile(
    r'\b(AMAZON|AWS|GOOGLE|MICROSOFT|AZURE|CLOUDFLARE|AKAMAI|FASTLY|OVH|HETZNER|DIGITALOCEAN|LINODE|AKAMAI|VULTR|'
    r'ORACLE|ALIBABA|TENCENT|HOSTING|DATACENTER|DATA CENTER|SERVERS|CLOUD|CDN|LEASEWEB|M247|CONTABO|IONOS|GODADDY|'
    r'RACKSPACE|SCALEWAY|UPCLOUD|ZSCALER|NORDVPN|EXPRESSVPN|MULLVAD|PROTON|SURFSHARK|PACKETHUB|DATACAMP|APPLE)\b',
    re.I,
)
PUBLIC_SECTOR_RE = re.compile(
    r'\b(NHS|GOV|GOVERNMENT|HMRC|HM TREASURY|MINISTRY|DEPARTMENT|HOME OFFICE|CABINET OFFICE|COUNCIL|BOROUGH|POLICE|'
    r'CONSTABULARY|MHRA|UNIVERSITY|UNIV|COLLEGE|SCHOOL|ACADEMY|JANET|JISC|PARLIAMENT|CROWN|ROYAL|HEALTH|HOSPITAL|TRUST|'
    r'BBC|OFCOM|TRADING STANDARDS|ADVERTISING STANDARDS|ASA\b|FCA\b|CQC)\b',
    re.I,
)
PTR_PUBLIC_RE = re.compile(r'\.(gov\.uk|nhs\.uk|nhs\.net|ac\.uk|police\.uk|sch\.uk|mod\.uk|parliament\.uk|gov|edu)\.?$', re.I)

_resolver = dns.asyncresolver.Resolver()
_resolver.lifetime = 4.0


def _is_public_ip(ip: str) -> bool:
    try:
        a = ipaddress.ip_address(ip)
        return not (a.is_private or a.is_loopback or a.is_reserved or a.is_link_local or a.is_multicast)
    except ValueError:
        return False


def classify(org: str, ptr: str) -> str:
    """'public' (gov/NHS/edu) | 'org' (company / other) | 'consumer' | 'hosting'."""
    if PTR_PUBLIC_RE.search(ptr or '') or PUBLIC_SECTOR_RE.search(org or ''):
        return 'public'
    if HOSTING_RE.search(org or ''):
        return 'hosting'
    if CONSUMER_RE.search(org or ''):
        return 'consumer'
    return 'org'


async def _txt(name: str) -> Optional[str]:
    try:
        ans = await _resolver.resolve(name, 'TXT')
        return ''.join(s.decode() if isinstance(s, bytes) else s for s in ans[0].strings)
    except Exception:
        return None


async def _ptr(ip: str) -> str:
    try:
        ans = await _resolver.resolve(dns.reversename.from_address(ip), 'PTR')
        return ans[0].to_text().rstrip('.')
    except Exception:
        return ''


async def lookup_ip(ip: str) -> Optional[dict]:
    if not _is_public_ip(ip):
        return None
    cached = await db.ip_orgs.find_one({'ip': ip})
    if cached:
        return cached
    a = ipaddress.ip_address(ip)
    if a.version == 4:
        rev = '.'.join(reversed(ip.split('.')))
        origin = await _txt(f'{rev}.origin.asn.cymru.com')
    else:
        nibbles = '.'.join(reversed(a.exploded.replace(':', '')))
        origin = await _txt(f'{nibbles}.origin6.asn.cymru.com')
    asn, cc, org = '', '', ''
    if origin:
        parts = [p.strip() for p in origin.split('|')]
        asn = parts[0].split(' ')[0]
        cc = parts[2] if len(parts) > 2 else ''
        detail = await _txt(f'AS{asn}.asn.cymru.com')
        if detail:
            name = detail.split('|')[-1].strip()
            org = re.sub(r'^[A-Z0-9_.-]+\s+-\s+', '', name)
            org = re.sub(r',\s*[A-Z]{2}$', '', org).strip()
    ptr = await _ptr(ip)
    doc = {
        'ip': ip, 'asn': asn, 'cc': cc, 'org': org or 'Unknown network', 'ptr': ptr,
        'kind': classify(org, ptr) if org else 'unknown', 'looked_up_at': datetime.utcnow(),
    }
    await db.ip_orgs.update_one({'ip': ip}, {'$set': doc}, upsert=True)
    return doc


async def enrich_pageview(pv_id, ip: str) -> None:
    try:
        info = await asyncio.wait_for(lookup_ip(ip), timeout=10)
    except Exception:
        info = None
    if not info:
        return
    await db.page_views.update_one({'_id': pv_id}, {'$set': {
        'org': info['org'], 'asn': info['asn'], 'org_kind': info['kind'], 'ptr': info.get('ptr', ''),
    }})
