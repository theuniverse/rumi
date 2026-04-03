import asyncio
import json
import logging
import re
from typing import Literal

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["ra"])


class RAEntity(BaseModel):
    entity_type: Literal["artist", "venue", "promoter"]
    ra_id: str


class RAFetchRequest(BaseModel):
    entities: list[RAEntity]


_RA_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "KHTML, like Gecko Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

_URL_TEMPLATES = {
    "artist":   "https://ra.co/dj/{ra_id}",
    "venue":    "https://ra.co/clubs/{ra_id}",
    "promoter": "https://ra.co/promoters/{ra_id}",
}

_ENTITY_KEY = {
    "artist":   "artist",
    "venue":    "club",
    "promoter": "promoter",
}


def _extract_next_data(html: str) -> dict:
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
    if not m:
        return {}
    try:
        return json.loads(m.group(1))
    except Exception:
        return {}


def _extract_flyer(event: dict) -> str | None:
    images = event.get("images", [])
    if images and images[0].get("filename"):
        return f"https://img.ra.co/{images[0]['filename']}"
    return None


def _parse_events(next_data: dict, entity_type: str) -> list[dict]:
    key = _ENTITY_KEY.get(entity_type, entity_type)
    try:
        raw = (
            next_data.get("props", {})
            .get("pageProps", {})
            .get("data", {})
            .get(key, {})
            .get("events", {})
            .get("data", [])
        )
    except Exception:
        return []

    result = []
    for e in raw:
        date_raw = e.get("date", "") or ""
        result.append({
            "ra_event_id": str(e.get("id", "")),
            "title":       e.get("title", ""),
            "date":        date_raw[:10],
            "start_time":  e.get("startTime") or None,
            "end_time":    e.get("endTime") or None,
            "ra_url":      f"https://ra.co/events/{e.get('id', '')}" if e.get("id") else None,
            "flyer_url":   _extract_flyer(e),
            "venue_name":  (e.get("venue") or {}).get("name"),
            "venue_ra_id": str((e.get("venue") or {}).get("id", "")) or None,
            "lineup": [
                {"name": a.get("name", ""), "ra_id": str(a.get("id", ""))}
                for a in (e.get("artists") or [])
            ],
            "labels": [p.get("name", "") for p in (e.get("promoters") or [])],
        })
    return result


async def _fetch_one(entity: RAEntity) -> list[dict]:
    url = _URL_TEMPLATES[entity.entity_type].format(ra_id=entity.ra_id)
    try:
        async with httpx.AsyncClient(
            timeout=15, headers=_RA_HEADERS, follow_redirects=True
        ) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                logging.warning("RA fetch %s returned %d", url, resp.status_code)
                return []
        next_data = _extract_next_data(resp.text)
        return _parse_events(next_data, entity.entity_type)
    except Exception as exc:
        logging.warning("RA fetch failed for %s/%s: %s", entity.entity_type, entity.ra_id, exc)
        return []


@router.post("/api/ra/fetch")
async def fetch_ra_events(body: RAFetchRequest):
    """
    Concurrently fetch upcoming RA events for a list of followed entities.
    Returns a deduplicated list of normalized event objects.
    """
    results = await asyncio.gather(*[_fetch_one(e) for e in body.entities])

    seen: dict[str, dict] = {}
    for event_list in results:
        for ev in event_list:
            key = ev.get("ra_event_id") or (ev.get("title", "") + ev.get("date", ""))
            if key and key not in seen:
                seen[key] = ev

    return {"events": list(seen.values())}
