"""CRUD for RSS sources."""
import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Source

router = APIRouter(tags=["sources"])


class SourceCreate(BaseModel):
    name: str
    feed_path: str
    keywords: list[str] = []
    city: str = ""
    active: bool = True


class SourceUpdate(BaseModel):
    name: Optional[str] = None
    feed_path: Optional[str] = None
    keywords: Optional[list[str]] = None
    city: Optional[str] = None
    active: Optional[bool] = None


def _serialize(s: Source) -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "feed_path": s.feed_path,
        "keywords": json.loads(s.keywords or "[]"),
        "city": s.city,
        "active": s.active,
        "created_at": s.created_at,
        "updated_at": s.updated_at,
    }


@router.get("/sources")
async def list_sources(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Source).order_by(Source.name))
    return {"items": [_serialize(s) for s in result.scalars().all()]}


@router.post("/sources", status_code=201)
async def create_source(body: SourceCreate, db: AsyncSession = Depends(get_db)):
    source = Source(
        name=body.name,
        feed_path=body.feed_path,
        keywords=json.dumps(body.keywords, ensure_ascii=False),
        city=body.city,
        active=body.active,
    )
    db.add(source)
    await db.commit()
    await db.refresh(source)
    return _serialize(source)


@router.put("/sources/{source_id}")
async def update_source(source_id: int, body: SourceUpdate, db: AsyncSession = Depends(get_db)):
    source = (await db.execute(select(Source).where(Source.id == source_id))).scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    if body.name is not None:
        source.name = body.name
    if body.feed_path is not None:
        source.feed_path = body.feed_path
    if body.keywords is not None:
        source.keywords = json.dumps(body.keywords, ensure_ascii=False)
    if body.city is not None:
        source.city = body.city
    if body.active is not None:
        source.active = body.active

    await db.commit()
    await db.refresh(source)
    return _serialize(source)


@router.delete("/sources/{source_id}")
async def delete_source(source_id: int, db: AsyncSession = Depends(get_db)):
    source = (await db.execute(select(Source).where(Source.id == source_id))).scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    source.active = False
    await db.commit()
    return {"ok": True}


@router.post("/sources/{source_id}/test")
async def test_source(source_id: int, db: AsyncSession = Depends(get_db)):
    """Live-fetch the RSS feed for a source and return a preview. Nothing is saved to the DB."""
    from app.scrapers.rss_fetcher import fetch_source_articles
    from app.config import settings

    source = (await db.execute(select(Source).where(Source.id == source_id))).scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    feed_url = f"{settings.rsshub_base}{source.feed_path}"
    keywords = json.loads(source.keywords or "[]")

    try:
        articles = await fetch_source_articles(source)
    except Exception as e:
        return {
            "source_name": source.name,
            "feed_url": feed_url,
            "ok": False,
            "articles_found": 0,
            "articles": [],
            "error": str(e),
        }

    def _first_matched_keyword(content: str) -> str | None:
        if not keywords:
            return None
        for kw in keywords:
            if kw.lower() in content.lower():
                return kw
        return None

    return {
        "source_name": source.name,
        "feed_url": feed_url,
        "ok": True,
        "articles_found": len(articles),
        "articles": [
            {
                "title": a["title"],
                "url": a["url"],
                "content_preview": a["content"][:300],
                "keyword_matched": _first_matched_keyword(a["content"]),
            }
            for a in articles[:10]
        ],
        "error": None,
    }
