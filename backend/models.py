"""Pydantic models for API and storage."""
from datetime import datetime
from typing import List, Optional, Literal
from pydantic import BaseModel, EmailStr, Field
import uuid


def _id() -> str:
    return str(uuid.uuid4())


# ---------- USERS ----------
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    first_name: Optional[str] = ''
    last_name: Optional[str] = ''


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    first_name: str = ''
    last_name: str = ''
    role: Literal['customer', 'admin', 'ambassador'] = 'customer'
    ambassador_code: Optional[str] = None
    commission_rate: Optional[float] = None
    ambassador_active: Optional[bool] = None
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = 'bearer'
    user: UserOut


# ---------- CATEGORIES ----------
class CategoryBase(BaseModel):
    slug: str
    name: str
    image: Optional[str] = ''
    sort_order: int = 0
    visible: bool = True


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    slug: Optional[str] = None
    name: Optional[str] = None
    image: Optional[str] = None
    sort_order: Optional[int] = None
    visible: Optional[bool] = None


class CategoryOut(CategoryBase):
    id: str


# ---------- PRODUCTS ----------
class ProductVariant(BaseModel):
    label: str
    price: float = 0.0
    stock: Optional[int] = None  # per-variant stock; falls back to product.stock if None


class ProductBase(BaseModel):
    slug: str
    name: str
    category: str  # category slug
    price: float = 0.0
    was_price: Optional[float] = None
    price_label: Optional[str] = None  # e.g., "Email for wholesale"
    image: Optional[str] = ''
    images: List[str] = Field(default_factory=list)
    description: str = ''
    tagline: Optional[str] = ''
    badge: Optional[str] = ''
    options: List[str] = Field(default_factory=list)  # legacy: labels only
    variants: List[ProductVariant] = Field(default_factory=list)  # per-variant pricing
    stock: int = 999
    visible: bool = True
    featured: bool = False


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    slug: Optional[str] = None
    name: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    was_price: Optional[float] = None
    price_label: Optional[str] = None
    image: Optional[str] = None
    images: Optional[List[str]] = None
    description: Optional[str] = None
    tagline: Optional[str] = None
    badge: Optional[str] = None
    options: Optional[List[str]] = None
    variants: Optional[List[ProductVariant]] = None
    stock: Optional[int] = None
    visible: Optional[bool] = None
    featured: Optional[bool] = None


class ProductOut(ProductBase):
    id: str
    created_at: datetime
    updated_at: datetime


# ---------- ORDERS ----------
class OrderItem(BaseModel):
    product_id: Optional[str] = None  # null for custom "Other" line items on paylinks
    slug: str
    name: str
    image: str = ''
    option: Optional[str] = None
    qty: int
    price: float


class ShippingAddress(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    phone: str
    address1: str
    address2: Optional[str] = ''
    city: str
    postcode: str
    country: str = 'United Kingdom'


class OrderCreate(BaseModel):
    items: List[OrderItem]
    shipping_address: ShippingAddress
    billing_address: Optional[ShippingAddress] = None  # if None, billing == shipping
    subtotal: float
    shipping: float
    total: float
    notes: Optional[str] = ''
    promo_code: Optional[str] = None


class PaylinkItemIn(BaseModel):
    product_id: Optional[str] = None
    name: Optional[str] = None      # required when product_id is null (custom line)
    price: Optional[float] = None   # required when product_id is null (custom line)
    qty: int = 1
    option: Optional[str] = None


class PaylinkCreate(BaseModel):
    items: List[PaylinkItemIn]
    customer_email: Optional[EmailStr] = None
    customer_name: Optional[str] = None
    notes: Optional[str] = ''
    promo_code: Optional[str] = None
    shipping: Optional[float] = None  # if None, use site default


class PaylinkAddress(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    phone: str
    address1: str
    address2: Optional[str] = ''
    city: str
    postcode: str
    country: str = 'United Kingdom'


class OrderOut(BaseModel):
    id: str
    order_number: str
    user_id: Optional[str] = None
    items: List[OrderItem]
    shipping_address: ShippingAddress
    billing_address: Optional[ShippingAddress] = None
    subtotal: float
    shipping: float
    total: float
    discount: float = 0
    promo_code: Optional[str] = None
    currency: str = 'GBP'
    payment_status: Literal['pending', 'paid', 'failed', 'refunded'] = 'pending'
    payment_provider: str = 'paypal'
    payment_id: Optional[str] = ''
    payment_source: Optional[str] = None  # 'webhook' | 'polling' | 'manual'
    wallid_api_payment_id: Optional[str] = None
    wallid_status: Optional[str] = None
    status: Literal['pending', 'processing', 'shipped', 'delivered', 'cancelled'] = 'pending'
    source: Optional[str] = None  # 'web' | 'paylink'
    notes: Optional[str] = ''
    created_at: datetime
    updated_at: datetime


class OrderStatusUpdate(BaseModel):
    status: Optional[Literal['pending', 'processing', 'shipped', 'delivered', 'cancelled']] = None
    payment_status: Optional[Literal['pending', 'paid', 'failed', 'refunded']] = None
    notes: Optional[str] = None
    order_number: Optional[str] = None  # admin-only renumber


class CounterReset(BaseModel):
    next_seq: int  # next order will be GHP-{seq:03d}


# ---------- SETTINGS ----------
class Settings(BaseModel):
    site_name: str = 'GHP-Health'
    contact_email: str = 'GHP-Health@outlook.com'
    customer_hours: str = 'Mon - Fri: 9am - 5pm (GMT)'
    tiktok: str = ''
    instagram: str = ''
    wholesale_banner: str = 'Wholesale now available - please email team for further information'
    free_shipping_threshold: float = 50.0
    flat_shipping: float = 4.99
    currency: str = 'GBP'
    currency_symbol: str = '£'
    # Publish controls (Squarespace-style)
    published: bool = False
    site_password: str = ''


# ---------- PROMO CODES ----------
class PromoBase(BaseModel):
    code: str
    type: Literal['percent', 'fixed', 'free_shipping'] = 'percent'
    value: float = 0.0  # percent (0-100) or £ amount; ignored for free_shipping
    active: bool = True
    min_subtotal: float = 0.0
    max_uses: Optional[int] = None
    expires_at: Optional[datetime] = None


class PromoCreate(PromoBase):
    pass


class PromoUpdate(BaseModel):
    code: Optional[str] = None
    type: Optional[Literal['percent', 'fixed', 'free_shipping']] = None
    value: Optional[float] = None
    active: Optional[bool] = None
    min_subtotal: Optional[float] = None
    max_uses: Optional[int] = None
    expires_at: Optional[datetime] = None


class PromoOut(PromoBase):
    id: str
    uses: int = 0
    created_at: datetime
    updated_at: datetime


class PromoValidateIn(BaseModel):
    code: str
    subtotal: float
    shipping: float = 0.0


class PromoValidateOut(BaseModel):
    valid: bool
    code: Optional[str] = None
    type: Optional[Literal['percent', 'fixed', 'free_shipping']] = None
    value: float = 0.0
    discount: float = 0.0            # amount deducted from subtotal
    shipping_discount: float = 0.0   # amount deducted from shipping (for free_shipping)
    message: str = ''


# ---------- SAVED ADDRESSES ----------
class AddressBase(BaseModel):
    label: str = ''  # e.g. "Home", "Office"
    first_name: str
    last_name: str
    phone: str = ''
    address1: str
    address2: Optional[str] = ''
    city: str
    postcode: str
    country: str = 'United Kingdom'
    is_default: bool = False


class AddressCreate(AddressBase):
    pass


class AddressUpdate(BaseModel):
    label: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    address1: Optional[str] = None
    address2: Optional[str] = None
    city: Optional[str] = None
    postcode: Optional[str] = None
    country: Optional[str] = None
    is_default: Optional[bool] = None


class AddressOut(AddressBase):
    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime


# ---------- AMBASSADORS ----------
class AmbassadorCreate(BaseModel):
    email: EmailStr
    password: str
    first_name: str = ''
    last_name: str = ''
    ambassador_code: str  # promo code they share (uppercase, unique)
    commission_rate: float = 15.0  # % of net sales they earn
    customer_discount: float = 10.0  # % off the code gives to customers


class AmbassadorUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    ambassador_code: Optional[str] = None
    commission_rate: Optional[float] = None
    customer_discount: Optional[float] = None
    ambassador_active: Optional[bool] = None


class PayoutCreate(BaseModel):
    amount: float
    note: str = ''


class PayoutOut(BaseModel):
    id: str
    ambassador_user_id: str
    amount: float
    note: str = ''
    created_at: datetime
