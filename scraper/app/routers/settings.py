"""Manage runtime configuration: API key, model selection, RSSHub URL."""
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import AppSetting

router = APIRouter(tags=["settings"])

# Keys that can be persisted and overridden via the UI
_MANAGED_KEYS = {"openrouter_api_key", "rsshub_base", "wewe_auth_code", "model_classify", "model_extract", "model_diff"}


def _mask_key(key: str) -> str:
    """Return a visually masked version: sk-or-v3-abc...wxyz"""
    if not key:
        return ""
    if len(key) <= 12:
        return "•" * len(key)
    return key[:8] + "•" * (len(key) - 12) + key[-4:]


async def _db_get(db: AsyncSession, key: str) -> Optional[str]:
    row = (await db.execute(select(AppSetting).where(AppSetting.key == key))).scalar_one_or_none()
    return row.value if row else None


async def _db_set(db: AsyncSession, key: str, value: str) -> None:
    row = (await db.execute(select(AppSetting).where(AppSetting.key == key))).scalar_one_or_none()
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=key, value=value))


@router.get("/settings")
async def get_settings(db: AsyncSession = Depends(get_db)):
    api_key_db = await _db_get(db, "openrouter_api_key")
    live_key = api_key_db or settings.openrouter_api_key

    source: str
    if api_key_db:
        source = "db"
    elif settings.openrouter_api_key:
        source = "env"
    else:
        source = "unset"

    return {
        "openrouter_api_key_set": bool(live_key),
        "openrouter_api_key_preview": _mask_key(live_key),
        "openrouter_api_key_source": source,
        "rsshub_base": await _db_get(db, "rsshub_base") or settings.rsshub_base,
        "wewe_auth_code_set": bool(await _db_get(db, "wewe_auth_code") or settings.wewe_auth_code),
        "wewe_auth_code_preview": _mask_key(await _db_get(db, "wewe_auth_code") or settings.wewe_auth_code),
        "model_classify": await _db_get(db, "model_classify") or settings.model_classify,
        "model_extract": await _db_get(db, "model_extract") or settings.model_extract,
        "model_diff": await _db_get(db, "model_diff") or settings.model_diff,
    }


class SettingsUpdate(BaseModel):
    openrouter_api_key: Optional[str] = None   # None = no change; "" = clear
    rsshub_base: Optional[str] = None
    wewe_auth_code: Optional[str] = None
    model_classify: Optional[str] = None
    model_extract: Optional[str] = None
    model_diff: Optional[str] = None


@router.put("/settings")
async def update_settings(body: SettingsUpdate, db: AsyncSession = Depends(get_db)):
    changed: list[str] = []

    if body.openrouter_api_key is not None:
        await _db_set(db, "openrouter_api_key", body.openrouter_api_key)
        settings.openrouter_api_key = body.openrouter_api_key
        changed.append("openrouter_api_key")

    if body.rsshub_base is not None:
        await _db_set(db, "rsshub_base", body.rsshub_base)
        settings.rsshub_base = body.rsshub_base
        changed.append("rsshub_base")

    if body.wewe_auth_code is not None:
        await _db_set(db, "wewe_auth_code", body.wewe_auth_code)
        settings.wewe_auth_code = body.wewe_auth_code
        changed.append("wewe_auth_code")

    if body.model_classify is not None:
        await _db_set(db, "model_classify", body.model_classify)
        settings.model_classify = body.model_classify
        changed.append("model_classify")

    if body.model_extract is not None:
        await _db_set(db, "model_extract", body.model_extract)
        settings.model_extract = body.model_extract
        changed.append("model_extract")

    if body.model_diff is not None:
        await _db_set(db, "model_diff", body.model_diff)
        settings.model_diff = body.model_diff
        changed.append("model_diff")

    await db.commit()
    return {"ok": True, "changed": changed}
