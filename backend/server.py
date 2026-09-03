"""Main FastAPI app for GHP-Health storefront + admin."""
import os
import logging
from pathlib import Path
from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from db import init_indexes  # noqa: E402
from seed import run_all as seed_all  # noqa: E402
from routes.auth_routes import router as auth_router  # noqa: E402
from routes.category_routes import router as category_router  # noqa: E402
from routes.product_routes import router as product_router  # noqa: E402
from routes.order_routes import router as order_router  # noqa: E402
from routes.upload_routes import router as upload_router  # noqa: E402
from routes.paypal_routes import router as paypal_router  # noqa: E402
from routes.settings_routes import router as settings_router  # noqa: E402
from routes.admin_routes import router as admin_router  # noqa: E402
from routes.promo_routes import router as promo_router  # noqa: E402
from routes.address_routes import router as address_router  # noqa: E402
from routes.wallid_routes import router as wallid_router  # noqa: E402
from routes.dose_plan_routes import router as dose_plan_router  # noqa: E402
from routes.ambassador_routes import router as ambassador_router  # noqa: E402
from routes.coa_routes import router as coa_router  # noqa: E402
from routes.coaching_routes import router as coaching_router  # noqa: E402
from routes.admin_seed_routes import router as admin_seed_router  # noqa: E402
from routes.admin_sales_routes import router as admin_sales_router  # noqa: E402
from routes.coach_earnings_routes import router as coach_earnings_router  # noqa: E402
from routes.admin_product_desc_routes import router as admin_product_desc_router  # noqa: E402
from routes.portal_routes import router as portal_router, ensure_default_portal_user_and_brands  # noqa: E402
from routes.wallid_routes import start_wallid_poller  # noqa: E402

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s - %(message)s')
logger = logging.getLogger('ghp')

app = FastAPI(title='GHP-Health API', version='1.0.0')

# CORS
cors_origins = os.environ.get('CORS_ORIGINS', '*').split(',')
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


# Discourage AI training scrapers from consuming our API responses
@app.middleware('http')
async def _add_noai_header(request, call_next):
    response = await call_next(request)
    response.headers['X-Robots-Tag'] = 'noindex, nofollow, noai, noimageai'
    return response

# Static uploads are now served from Emergent Object Storage via the
# `/api/uploads/{filename}` GET route in `routes/upload_routes.py` — no
# local disk directory is needed. The old UPLOADS_DIR / StaticFiles mount
# has been removed for pod-restart durability.

# Main API router with /api prefix
api_router = APIRouter(prefix='/api')


@api_router.get('/')
async def root():
    return {'status': 'ok', 'service': 'GHP-Health API'}


@api_router.get('/health')
async def health():
    return {'status': 'healthy'}


# Mount sub-routers
api_router.include_router(auth_router)
api_router.include_router(category_router)
api_router.include_router(product_router)
api_router.include_router(order_router)
api_router.include_router(upload_router)
api_router.include_router(paypal_router)
api_router.include_router(settings_router)
api_router.include_router(admin_router)
api_router.include_router(promo_router)
api_router.include_router(address_router)
api_router.include_router(wallid_router)
api_router.include_router(dose_plan_router)
api_router.include_router(ambassador_router)
api_router.include_router(coa_router)
api_router.include_router(coaching_router)
api_router.include_router(admin_seed_router)
api_router.include_router(admin_sales_router)
api_router.include_router(coach_earnings_router)
api_router.include_router(admin_product_desc_router)
api_router.include_router(portal_router)

app.include_router(api_router)


@app.on_event('startup')
async def on_startup():
    """Non-blocking startup: schedule DB init + seed in background so the readiness probe
    can return immediately even if the DB is temporarily slow.
    """
    import asyncio

    # Warm the object-storage session key so the first admin upload doesn't
    # pay the init round-trip. Non-fatal if it fails — put_object retries.
    try:
        from storage import init_storage
        await asyncio.to_thread(init_storage)
    except Exception as e:
        logger.warning(f'Object storage warm-up failed (uploads may still work): {e}')

    async def _background_init():
        try:
            logger.info('Background init: creating indexes and seeding data...')
            await init_indexes()
            await seed_all()
            await ensure_default_portal_user_and_brands()
            logger.info('Background init complete')
        except Exception as e:
            logger.exception(f'Background init error (server still running): {e}')

    asyncio.create_task(_background_init())
    asyncio.create_task(start_wallid_poller())
    logger.info('Startup: background init scheduled; server ready to accept requests')
