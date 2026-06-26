"""Auth routes: register, login, me."""
from datetime import datetime
import uuid
from fastapi import APIRouter, HTTPException, Depends
from db import db
from models import UserCreate, UserLogin, UserOut, TokenOut
from auth import hash_password, verify_password, create_access_token, get_current_user
from utils import doc_to_dict

router = APIRouter(prefix='/auth', tags=['auth'])


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
    token = create_access_token(user_doc['id'], user_doc['role'])
    return TokenOut(access_token=token, user=UserOut(**doc_to_dict(user_doc)))


@router.post('/login', response_model=TokenOut)
async def login(payload: UserLogin):
    user = await db.users.find_one({'email': payload.email})
    if not user or not verify_password(payload.password, user.get('password_hash', '')):
        raise HTTPException(401, 'Invalid email or password')
    token = create_access_token(user['id'], user.get('role', 'customer'))
    return TokenOut(access_token=token, user=UserOut(**doc_to_dict(user)))


@router.get('/me', response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return UserOut(**doc_to_dict(user))
