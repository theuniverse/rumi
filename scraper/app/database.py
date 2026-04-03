from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(settings.database_url, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def init_db():
    from app import models  # noqa: F401 — ensures models are registered
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # One-time migration: rsshub_path → feed_path (idempotent)
        from sqlalchemy import text
        try:
            await conn.execute(text("ALTER TABLE sources RENAME COLUMN rsshub_path TO feed_path"))
        except Exception:
            pass  # Column already renamed or doesn't exist under old name
        # Migration: add ref data columns to extracted_events
        for col, defn in [
            ("ref_venue_id", "INTEGER"),
            ("has_followed_match", "INTEGER DEFAULT 0"),
            ("pushed_to_rumi", "INTEGER DEFAULT 0"),
        ]:
            try:
                await conn.execute(text(f"ALTER TABLE extracted_events ADD COLUMN {col} {defn}"))
            except Exception:
                pass


async def load_settings_from_db():
    """Override in-memory settings with values persisted in app_settings table."""
    from app.models import AppSetting
    from app.config import settings
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(AppSetting))).scalars().all()
        for row in rows:
            if row.value and hasattr(settings, row.key):
                try:
                    setattr(settings, row.key, row.value)
                except Exception:
                    pass
