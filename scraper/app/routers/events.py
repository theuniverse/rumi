"""Extracted events endpoints."""
import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import ExtractedEvent, TimetableSlot

router = APIRouter(tags=["events"])


@router.get("/events")
async def list_events(
    status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
):
    q = select(ExtractedEvent).order_by(ExtractedEvent.event_date.desc().nullslast(), ExtractedEvent.created_at.desc())
    if status:
        q = q.where(ExtractedEvent.status == status)
    if date_from:
        q = q.where(ExtractedEvent.event_date >= date_from)
    if date_to:
        q = q.where(ExtractedEvent.event_date <= date_to)

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    result = await db.execute(q.offset(offset).limit(limit))
    events = result.scalars().all()

    return {
        "total": total,
        "items": [
            {
                "id": e.id,
                "event_name": e.event_name,
                "event_date": e.event_date,
                "venue": e.venue,
                "city": e.city,
                "info_level": e.info_level,
                "status": e.status,
                "confidence": e.confidence,
                "page_id": e.page_id,
                "created_at": e.created_at,
                "updated_at": e.updated_at,
            }
            for e in events
        ],
    }


@router.get("/events/{event_id}")
async def get_event(event_id: int, db: AsyncSession = Depends(get_db)):
    event = (await db.execute(select(ExtractedEvent).where(ExtractedEvent.id == event_id))).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    slots_result = await db.execute(
        select(TimetableSlot).where(TimetableSlot.event_id == event_id).order_by(TimetableSlot.stage_name, TimetableSlot.start_time)
    )
    slots = slots_result.scalars().all()

    return {
        "id": event.id,
        "event_name": event.event_name,
        "event_date": event.event_date,
        "venue": event.venue,
        "city": event.city,
        "info_level": event.info_level,
        "status": event.status,
        "confidence": event.confidence,
        "page_id": event.page_id,
        "raw_json": json.loads(event.raw_json) if event.raw_json else None,
        "created_at": event.created_at,
        "updated_at": event.updated_at,
        "timetable_slots": [
            {
                "id": s.id,
                "stage_name": s.stage_name,
                "start_time": s.start_time,
                "end_time": s.end_time,
                "artists": json.loads(s.artists_json or "[]"),
                "is_b2b": s.is_b2b,
                "set_type": s.set_type,
                "special_note": s.special_note,
            }
            for s in slots
        ],
    }
