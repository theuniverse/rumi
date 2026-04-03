"""Match extracted events against reference data and track discoveries."""
import json
import logging
import re
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Discovery, DiscoveryStatus, EventEntityMatch,
    ExtractedEvent, RefArtist, RefLabel, RefVenue, TimetableSlot,
)

logger = logging.getLogger(__name__)

# Prefixes commonly attached to DJ names in Chinese event listings
_STRIP_PREFIXES = re.compile(r"^(DJ|VJ|MC|dj|vj|mc)\s+", re.IGNORECASE)


def normalize_name(name: str) -> str:
    """Normalize a name for fuzzy comparison."""
    name = name.strip()
    name = _STRIP_PREFIXES.sub("", name)
    return name.lower().strip()


def _all_names(entity) -> list[str]:
    """Return [primary_name] + aliases, all normalized."""
    aliases = json.loads(entity.aliases or "[]")
    return [normalize_name(n) for n in [entity.name] + aliases]


def _find_match(raw_name: str, candidates: list, threshold: int = 2):
    """Try exact match against name + aliases, then Levenshtein if threshold > 0.

    Returns (entity, confidence) or None.
    """
    normalized = normalize_name(raw_name)
    if not normalized:
        return None

    # Pass 1: exact match (case-insensitive, after normalization)
    for c in candidates:
        if normalized in _all_names(c):
            return (c, 1.0)

    # Pass 2: Levenshtein distance (only for short-ish names)
    if threshold > 0 and len(normalized) <= 30:
        best_dist = threshold + 1
        best_candidate = None
        for c in candidates:
            for cn in _all_names(c):
                d = _levenshtein(normalized, cn)
                if d <= threshold and d < best_dist:
                    best_dist = d
                    best_candidate = c
        if best_candidate:
            confidence = max(0.5, 1.0 - best_dist * 0.2)
            return (best_candidate, confidence)

    return None


def _levenshtein(s1: str, s2: str) -> int:
    """Simple Levenshtein distance (good enough for short names)."""
    if len(s1) < len(s2):
        return _levenshtein(s2, s1)
    if len(s2) == 0:
        return len(s1)

    prev = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        curr = [i + 1]
        for j, c2 in enumerate(s2):
            curr.append(min(
                prev[j + 1] + 1,       # deletion
                curr[j] + 1,            # insertion
                prev[j] + (c1 != c2),   # substitution
            ))
        prev = curr
    return prev[-1]


async def _upsert_discovery(
    session: AsyncSession,
    entity_type: str,
    raw_name: str,
) -> None:
    """Record or increment an unmatched entity name as a discovery."""
    normalized = normalize_name(raw_name)
    if not normalized or len(normalized) < 2:
        return

    existing = (await session.execute(
        select(Discovery)
        .where(Discovery.entity_type == entity_type)
        .where(Discovery.raw_name == raw_name.strip())
        .where(Discovery.status == DiscoveryStatus.pending)
    )).scalar_one_or_none()

    if existing:
        existing.frequency += 1
    else:
        session.add(Discovery(
            entity_type=entity_type,
            raw_name=raw_name.strip(),
            frequency=1,
            first_seen_at=datetime.utcnow(),
        ))


async def match_event(session: AsyncSession, event: ExtractedEvent) -> None:
    """Match an extracted event's venue and artists against reference data.

    Updates event.ref_venue_id, event.has_followed_match and creates
    EventEntityMatch records. Unmatched names are tracked as discoveries.
    """
    # Load reference data (cached per-call; for batch use, consider caching externally)
    ref_venues = (await session.execute(select(RefVenue))).scalars().all()
    ref_artists = (await session.execute(select(RefArtist))).scalars().all()
    ref_labels = (await session.execute(select(RefLabel))).scalars().all()

    # Clear previous matches for this event (in case of re-extraction)
    old_matches = (await session.execute(
        select(EventEntityMatch).where(EventEntityMatch.event_id == event.id)
    )).scalars().all()
    for m in old_matches:
        await session.delete(m)
    await session.flush()

    has_followed = False

    # ── Venue matching ──────────────────────────────────────────────────
    if event.venue:
        result = _find_match(event.venue, ref_venues)
        if result:
            venue, confidence = result
            event.ref_venue_id = venue.id
            session.add(EventEntityMatch(
                event_id=event.id, entity_type="venue",
                entity_id=venue.id, raw_name=event.venue,
                confidence=confidence,
            ))
            if venue.followed:
                has_followed = True
        else:
            await _upsert_discovery(session, "venue", event.venue)

    # ── Artist matching ─────────────────────────────────────────────────
    slots = (await session.execute(
        select(TimetableSlot).where(TimetableSlot.event_id == event.id)
    )).scalars().all()

    seen_artists: set[str] = set()
    for slot in slots:
        artists = json.loads(slot.artists_json or "[]")
        for raw_name in artists:
            norm = normalize_name(raw_name)
            if norm in seen_artists:
                continue
            seen_artists.add(norm)

            result = _find_match(raw_name, ref_artists)
            if result:
                artist, confidence = result
                session.add(EventEntityMatch(
                    event_id=event.id, entity_type="artist",
                    entity_id=artist.id, raw_name=raw_name,
                    confidence=confidence,
                ))
                if artist.followed:
                    has_followed = True
            else:
                await _upsert_discovery(session, "artist", raw_name)

    # ── Label matching (from event name heuristic) ──────────────────────
    # WeChat articles often mention the promoter label in the event name.
    # This is a lightweight heuristic; full label extraction could come later.
    if event.event_name:
        for label in ref_labels:
            for label_name in _all_names(label):
                if label_name and label_name in normalize_name(event.event_name):
                    session.add(EventEntityMatch(
                        event_id=event.id, entity_type="label",
                        entity_id=label.id, raw_name=event.event_name,
                        confidence=0.7,
                    ))
                    if label.followed:
                        has_followed = True
                    break  # one match per label is enough

    event.has_followed_match = has_followed
    logger.info(
        "Matched event %d (%s): followed=%s",
        event.id, event.event_name, has_followed,
    )
