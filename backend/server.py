"""Main FastAPI app for GHP-Health storefront + admin."""
import os
import logging
from pathlib import Path
from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
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

# Static uploads (served at /api/uploads/<filename>)
UPLOADS_DIR = Path(os.environ.get('UPLOADS_DIR', '/app/backend/uploads'))
try:
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
except Exception as e:
    logger_boot = logging.getLogger('ghp.boot')
    logger_boot.warning(f'Could not create UPLOADS_DIR {UPLOADS_DIR}: {e}. Using /tmp/uploads instead.')
    UPLOADS_DIR = Path('/tmp/uploads')
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount('/api/uploads', StaticFiles(directory=str(UPLOADS_DIR)), name='uploads')

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

app.include_router(api_router)


@app.on_event('startup')
async def on_startup():
    """Non-blocking startup: schedule DB init + seed in background so the readiness probe
    can return immediately even if the DB is temporarily slow.
    """
    import asyncio

    async def _background_init():
        try:
            logger.info('Background init: creating indexes and seeding data...')
            await init_indexes()
            await seed_all()
            logger.info('Background init complete')
        except Exception as e:
            logger.exception(f'Background init error (server still running): {e}')

    asyncio.create_task(_background_init())
    logger.info('Startup: background init scheduled; server ready to accept requests')
