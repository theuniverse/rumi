import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db, load_settings_from_db
from app.scheduler import start_scheduler, stop_scheduler
from app.routers import audit, sources, events, jobs, refdata, settings as settings_router, wewe as wewe_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    logger.info("Database initialized")
    await load_settings_from_db()
    logger.info("Settings loaded from DB")
    start_scheduler()
    logger.info("Scheduler started")
    yield
    stop_scheduler()
    logger.info("Scheduler stopped")


app = FastAPI(title="Rumi Event Scraper", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(audit.router, prefix="/api")
app.include_router(sources.router, prefix="/api")
app.include_router(events.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
app.include_router(refdata.router, prefix="/api")
app.include_router(settings_router.router, prefix="/api")
app.include_router(wewe_router.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok"}
