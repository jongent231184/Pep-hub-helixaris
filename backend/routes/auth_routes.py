"""Auth routes: register, login, me."""
from datetime import datetime
import secrets
import uuid
from fastapi import APIRouter, HTTPException, Depends, Body
from db import db
from models import UserCreate, UserLogin, UserOut, TokenOut
from auth import hash_password, verify_password, create_access_token, get_current_user, require_admin
from utils import doc_to_dict

router = APIRouter(prefix='/auth', tags=['auth'])


async def _adopt_guest_orders(user_id: str, email: str) -> int:
    """Any anonymous orders that were placed with this email get linked to
    the new (or newly-logged-in) account. Returns the number linked."""
    if not email:
        return 0
    res = await db.orders.update_many(
        {'shipping_address.email': email, '$or': [{'user_id': None}, {'user_id': {'$exists': False}}]},
        {'$set': {'user_id': user_id}},
    )
    return res.modified_count


@router.post('/register', response_model=TokenOut)
async def register(payload: UserCreate):
    existing = await db.users.find_one({'email': payload.email})
    if existing:
        raise HTTPException(400, 'Email already registered')
    user_doc = {
        'id': str(uuid.uuid4()),
        'email': payload.email,
        'password_hash': hash_password(payload.password),
        'first_name': payload.first_name or '',
        'last_name': payload.last_name or '',
        'role': 'customer',
        'created_at': datetime.utcnow(),
    }
    await db.users.insert_one(user_doc)
    await _adopt_guest_orders(user_doc['id'], user_doc['email'])
    token = create_access_token(user_doc['id'], user_doc['role'])
    return TokenOut(access_token=token, user=UserOut(**doc_to_dict(user_doc)))


@router.post('/login', response_model=TokenOut)
async def login(payload: UserLogin):
    user = await db.users.find_one({'email': payload.email})
    if not user or not verify_password(payload.password, user.get('password_hash', '')):
        raise HTTPException(401, 'Invalid email or password')
    # Adopt any guest orders that share this account's email (covers customers
    # who placed a guest order before creating an account, or from another device).
    await _adopt_guest_orders(user['id'], user.get('email', ''))
    token = create_access_token(user['id'], user.get('role', 'customer'))
    return TokenOut(access_token=token, user=UserOut(**doc_to_dict(user)))


@router.get('/me', response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return UserOut(**doc_to_dict(user))


@router.post('/change-password')
async def change_password(payload: dict = Body(...), user: dict = Depends(get_current_user)):
    """Authenticated user changes their own password."""
    current = (payload or {}).get('current_password', '')
    new_pw = (payload or {}).get('new_password', '')
    if not current or not new_pw:
        raise HTTPException(400, 'current_password and new_password required')
    if len(new_pw) < 8:
        raise HTTPException(400, 'New password must be at least 8 characters')
    if not verify_password(current, user.get('password_hash', '')):
        raise HTTPException(401, 'Current password is incorrect')
    await db.users.update_one(
        {'id': user['id']},
        {'$set': {'password_hash': hash_password(new_pw)}}
    )
    return {'ok': True}


@router.post('/admin/reset-user-password')
async def admin_reset_user_password(payload: dict = Body(...), _=Depends(require_admin)):
    """Admin resets any user's password. If new_password is omitted, a random one is generated and returned once."""
    user_id = (payload or {}).get('user_id')
    email = (payload or {}).get('email')
    new_pw = (payload or {}).get('new_password')
    if not user_id and not email:
        raise HTTPException(400, 'user_id or email required')
    flt = {'id': user_id} if user_id else {'email': email}
    target = await db.users.find_one(flt)
    if not target:
        raise HTTPException(404, 'User not found')
    generated = False
    if not new_pw:
        new_pw = secrets.token_urlsafe(9)  # ~12-char temp password
        generated = True
    if len(new_pw) < 8:
        raise HTTPException(400, 'Password must be at least 8 characters')
    await db.users.update_one({'id': target['id']}, {'$set': {'password_hash': hash_password(new_pw)}})
    return {'ok': True, 'email': target['email'], 'temp_password': new_pw if generated else None}
