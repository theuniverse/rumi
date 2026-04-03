"""CRUD for reference data (venues, artists, labels) and discoveries."""
import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import (
    Discovery, DiscoveryStatus, EventEntityMatch,
    ExtractedEvent, RefArtist, RefLabel, RefVenue, TimetableSlot,
)

router = APIRouter(tags=["refdata"])


# ── Pydantic schemas ────────────────────────────────────────────────────────

class RefVenueCreate(BaseModel):
    name: str
    aliases: list[str] = []
    type: str = "club"
    address: Optional[str] = None
    city: str = ""
    ra_id: Optional[str] = None
    followed: bool = False

class RefVenueUpdate(BaseModel):
    name: Optional[str] = None
    aliases: Optional[list[str]] = None
    type: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    ra_id: Optional[str] = None
    followed: Optional[bool] = None

class RefArtistCreate(BaseModel):
    name: str
    aliases: list[str] = []
    type: str = "dj"
    city: Optional[str] = None
    ra_url: Optional[str] = None
    followed: bool = False

class RefArtistUpdate(BaseModel):
    name: Optional[str] = None
    aliases: Optional[list[str]] = None
    type: Optional[str] = None
    city: Optional[str] = None
    ra_url: Optional[str] = None
    followed: Optional[bool] = None

class RefLabelCreate(BaseModel):
    name: str
    aliases: list[str] = []
    type: str = "promoter"
    city: Optional[str] = None
    ra_id: Optional[str] = None
    followed: bool = False

class RefLabelUpdate(BaseModel):
    name: Optional[str] = None
    aliases: Optional[list[str]] = None
    type: Optional[str] = None
    city: Optional[str] = None
    ra_id: Optional[str] = None
    followed: Optional[bool] = None

class DiscoveryAccept(BaseModel):
    name: str
    aliases: list[str] = []
    type: Optional[str] = None
    city: Optional[str] = None
    followed: bool = False


# ── Serializers ─────────────────────────────────────────────────────────────

def _ser_venue(v: RefVenue) -> dict:
    return {
        "id": v.id, "name": v.name, "aliases": json.loads(v.aliases or "[]"),
        "type": v.type, "address": v.address, "city": v.city,
        "ra_id": v.ra_id, "followed": v.followed,
        "created_at": v.created_at, "updated_at": v.updated_at,
    }

def _ser_artist(a: RefArtist) -> dict:
    return {
        "id": a.id, "name": a.name, "aliases": json.loads(a.aliases or "[]"),
        "type": a.type, "city": a.city, "ra_url": a.ra_url,
        "followed": a.followed,
        "created_at": a.created_at, "updated_at": a.updated_at,
    }

def _ser_label(l: RefLabel) -> dict:
    return {
        "id": l.id, "name": l.name, "aliases": json.loads(l.aliases or "[]"),
        "type": l.type, "city": l.city, "ra_id": l.ra_id,
        "followed": l.followed,
        "created_at": l.created_at, "updated_at": l.updated_at,
    }

def _ser_discovery(d: Discovery) -> dict:
    return {
        "id": d.id, "entity_type": d.entity_type, "raw_name": d.raw_name,
        "frequency": d.frequency, "first_seen_at": d.first_seen_at,
        "status": d.status, "accepted_as_id": d.accepted_as_id,
    }


# ── Generic CRUD helpers ────────────────────────────────────────────────────

def _apply_updates(entity, body, fields: list[str], json_fields: set[str] | None = None):
    json_fields = json_fields or set()
    for f in fields:
        val = getattr(body, f, None)
        if val is not None:
            if f in json_fields:
                setattr(entity, f, json.dumps(val, ensure_ascii=False))
            else:
                setattr(entity, f, val)


# ── Venues ──────────────────────────────────────────────────────────────────

@router.get("/refdata/venues")
async def list_venues(followed: Optional[bool] = None, db: AsyncSession = Depends(get_db)):
    q = select(RefVenue).order_by(RefVenue.name)
    if followed is not None:
        q = q.where(RefVenue.followed == followed)
    result = await db.execute(q)
    return {"items": [_ser_venue(v) for v in result.scalars().all()]}

@router.post("/refdata/venues", status_code=201)
async def create_venue(body: RefVenueCreate, db: AsyncSession = Depends(get_db)):
    venue = RefVenue(
        name=body.name, aliases=json.dumps(body.aliases, ensure_ascii=False),
        type=body.type, address=body.address, city=body.city,
        ra_id=body.ra_id, followed=body.followed,
    )
    db.add(venue)
    await db.commit()
    await db.refresh(venue)
    return _ser_venue(venue)

@router.put("/refdata/venues/{venue_id}")
async def update_venue(venue_id: int, body: RefVenueUpdate, db: AsyncSession = Depends(get_db)):
    venue = (await db.execute(select(RefVenue).where(RefVenue.id == venue_id))).scalar_one_or_none()
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")
    _apply_updates(venue, body, ["name", "aliases", "type", "address", "city", "ra_id", "followed"], {"aliases"})
    await db.commit()
    await db.refresh(venue)
    return _ser_venue(venue)

@router.delete("/refdata/venues/{venue_id}")
async def delete_venue(venue_id: int, db: AsyncSession = Depends(get_db)):
    venue = (await db.execute(select(RefVenue).where(RefVenue.id == venue_id))).scalar_one_or_none()
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")
    await db.delete(venue)
    await db.commit()
    return {"ok": True}


# ── Artists ─────────────────────────────────────────────────────────────────

@router.get("/refdata/artists")
async def list_artists(followed: Optional[bool] = None, db: AsyncSession = Depends(get_db)):
    q = select(RefArtist).order_by(RefArtist.name)
    if followed is not None:
        q = q.where(RefArtist.followed == followed)
    result = await db.execute(q)
    return {"items": [_ser_artist(a) for a in result.scalars().all()]}

@router.post("/refdata/artists", status_code=201)
async def create_artist(body: RefArtistCreate, db: AsyncSession = Depends(get_db)):
    artist = RefArtist(
        name=body.name, aliases=json.dumps(body.aliases, ensure_ascii=False),
        type=body.type, city=body.city, ra_url=body.ra_url, followed=body.followed,
    )
    db.add(artist)
    await db.commit()
    await db.refresh(artist)
    return _ser_artist(artist)

@router.put("/refdata/artists/{artist_id}")
async def update_artist(artist_id: int, body: RefArtistUpdate, db: AsyncSession = Depends(get_db)):
    artist = (await db.execute(select(RefArtist).where(RefArtist.id == artist_id))).scalar_one_or_none()
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")
    _apply_updates(artist, body, ["name", "aliases", "type", "city", "ra_url", "followed"], {"aliases"})
    await db.commit()
    await db.refresh(artist)
    return _ser_artist(artist)

@router.delete("/refdata/artists/{artist_id}")
async def delete_artist(artist_id: int, db: AsyncSession = Depends(get_db)):
    artist = (await db.execute(select(RefArtist).where(RefArtist.id == artist_id))).scalar_one_or_none()
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")
    await db.delete(artist)
    await db.commit()
    return {"ok": True}


# ── Labels ──────────────────────────────────────────────────────────────────

@router.get("/refdata/labels")
async def list_labels(followed: Optional[bool] = None, db: AsyncSession = Depends(get_db)):
    q = select(RefLabel).order_by(RefLabel.name)
    if followed is not None:
        q = q.where(RefLabel.followed == followed)
    result = await db.execute(q)
    return {"items": [_ser_label(l) for l in result.scalars().all()]}

@router.post("/refdata/labels", status_code=201)
async def create_label(body: RefLabelCreate, db: AsyncSession = Depends(get_db)):
    label = RefLabel(
        name=body.name, aliases=json.dumps(body.aliases, ensure_ascii=False),
        type=body.type, city=body.city, ra_id=body.ra_id, followed=body.followed,
    )
    db.add(label)
    await db.commit()
    await db.refresh(label)
    return _ser_label(label)

@router.put("/refdata/labels/{label_id}")
async def update_label(label_id: int, body: RefLabelUpdate, db: AsyncSession = Depends(get_db)):
    label = (await db.execute(select(RefLabel).where(RefLabel.id == label_id))).scalar_one_or_none()
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")
    _apply_updates(label, body, ["name", "aliases", "type", "city", "ra_id", "followed"], {"aliases"})
    await db.commit()
    await db.refresh(label)
    return _ser_label(label)

@router.delete("/refdata/labels/{label_id}")
async def delete_label(label_id: int, db: AsyncSession = Depends(get_db)):
    label = (await db.execute(select(RefLabel).where(RefLabel.id == label_id))).scalar_one_or_none()
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")
    await db.delete(label)
    await db.commit()
    return {"ok": True}


# ── Discoveries ─────────────────────────────────────────────────────────────

@router.get("/refdata/discoveries")
async def list_discoveries(
    status: Optional[str] = "pending",
    db: AsyncSession = Depends(get_db),
):
    q = select(Discovery).order_by(Discovery.frequency.desc(), Discovery.first_seen_at.desc())
    if status:
        q = q.where(Discovery.status == status)
    result = await db.execute(q)
    return {"items": [_ser_discovery(d) for d in result.scalars().all()]}

@router.post("/refdata/discoveries/{discovery_id}/accept")
async def accept_discovery(discovery_id: int, body: DiscoveryAccept, db: AsyncSession = Depends(get_db)):
    disc = (await db.execute(select(Discovery).where(Discovery.id == discovery_id))).scalar_one_or_none()
    if not disc:
        raise HTTPException(status_code=404, detail="Discovery not found")

    # Create the ref entity based on discovery type
    aliases_json = json.dumps(body.aliases, ensure_ascii=False)
    if disc.entity_type == "venue":
        entity = RefVenue(name=body.name, aliases=aliases_json, type=body.type or "club",
                          city=body.city or "", followed=body.followed)
    elif disc.entity_type == "artist":
        entity = RefArtist(name=body.name, aliases=aliases_json, type=body.type or "dj",
                           city=body.city, followed=body.followed)
    elif disc.entity_type == "label":
        entity = RefLabel(name=body.name, aliases=aliases_json, type=body.type or "promoter",
                          city=body.city, followed=body.followed)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown entity type: {disc.entity_type}")

    db.add(entity)
    await db.flush()

    disc.status = DiscoveryStatus.accepted
    disc.accepted_as_id = entity.id
    await db.commit()
    return {"ok": True, "entity_id": entity.id}

@router.post("/refdata/discoveries/{discovery_id}/ignore")
async def ignore_discovery(discovery_id: int, db: AsyncSession = Depends(get_db)):
    disc = (await db.execute(select(Discovery).where(Discovery.id == discovery_id))).scalar_one_or_none()
    if not disc:
        raise HTTPException(status_code=404, detail="Discovery not found")
    disc.status = DiscoveryStatus.ignored
    await db.commit()
    return {"ok": True}


# ── Matched events (for Rumi import) ────────────────────────────────────────

@router.get("/refdata/matched-events")
async def list_matched_events(
    unpushed_only: bool = True,
    limit: int = Query(default=50, le=200),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(ExtractedEvent)
        .where(ExtractedEvent.has_followed_match == True)  # noqa: E712
        .order_by(ExtractedEvent.event_date.desc().nullslast())
    )
    if unpushed_only:
        q = q.where(ExtractedEvent.pushed_to_rumi == False)  # noqa: E712
    result = await db.execute(q.limit(limit))
    events = result.scalars().all()

    items = []
    for e in events:
        # Gather matched entities
        matches = (await db.execute(
            select(EventEntityMatch).where(EventEntityMatch.event_id == e.id)
        )).scalars().all()

        # Gather timetable slots
        slots = (await db.execute(
            select(TimetableSlot).where(TimetableSlot.event_id == e.id)
            .order_by(TimetableSlot.stage_name, TimetableSlot.start_time)
        )).scalars().all()

        items.append({
            "id": e.id,
            "event_name": e.event_name,
            "event_date": e.event_date,
            "venue": e.venue,
            "city": e.city,
            "info_level": e.info_level,
            "status": e.status,
            "confidence": e.confidence,
            "ref_venue_id": e.ref_venue_id,
            "has_followed_match": e.has_followed_match,
            "pushed_to_rumi": e.pushed_to_rumi,
            "created_at": e.created_at,
            "entity_matches": [
                {"entity_type": m.entity_type, "entity_id": m.entity_id,
                 "raw_name": m.raw_name, "confidence": m.confidence}
                for m in matches
            ],
            "timetable_slots": [
                {"stage_name": s.stage_name, "start_time": s.start_time,
                 "end_time": s.end_time, "artists": json.loads(s.artists_json or "[]"),
                 "is_b2b": s.is_b2b, "set_type": s.set_type}
                for s in slots
            ],
        })

    return {"items": items}

@router.post("/refdata/matched-events/{event_id}/mark-pushed")
async def mark_event_pushed(event_id: int, db: AsyncSession = Depends(get_db)):
    event = (await db.execute(select(ExtractedEvent).where(ExtractedEvent.id == event_id))).scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    event.pushed_to_rumi = True
    await db.commit()
    return {"ok": True}


# ── Version (change detection for Rumi polling) ─────────────────────────────

@router.get("/refdata/version")
async def refdata_version(db: AsyncSession = Depends(get_db)):
    """Return the latest updated_at across all ref tables for change detection."""
    latest = None
    for model in (RefVenue, RefArtist, RefLabel):
        row = (await db.execute(
            select(func.max(model.updated_at))
        )).scalar()
        if row and (latest is None or row > latest):
            latest = row
    return {"version": latest.isoformat() if latest else None}
