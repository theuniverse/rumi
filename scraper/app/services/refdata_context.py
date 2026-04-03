"""Build compact reference data context for LLM prompt injection."""
import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import RefArtist, RefLabel, RefVenue


async def build_reference_context(session: AsyncSession) -> str:
    """Assemble reference data into a compact Chinese-language context string.

    Returns an empty string if no reference data exists, so callers can skip
    injection when there is nothing to inject.
    """
    venues = (await session.execute(select(RefVenue).order_by(RefVenue.name))).scalars().all()
    artists = (await session.execute(select(RefArtist).order_by(RefArtist.name))).scalars().all()
    labels = (await session.execute(select(RefLabel).order_by(RefLabel.name))).scalars().all()

    if not venues and not artists and not labels:
        return ""

    lines: list[str] = []

    if venues:
        parts = []
        for v in venues:
            aliases = json.loads(v.aliases or "[]")
            names = " / ".join([v.name] + aliases)
            parts.append(f"{names} ({v.city})" if v.city else names)
        lines.append("已知场地: " + ", ".join(parts))

    if artists:
        parts = []
        for a in artists:
            aliases = json.loads(a.aliases or "[]")
            parts.append(" / ".join([a.name] + aliases))
        lines.append("已知艺人/DJ: " + ", ".join(parts))

    if labels:
        parts = []
        for l in labels:
            aliases = json.loads(l.aliases or "[]")
            parts.append(" / ".join([l.name] + aliases))
        lines.append("已知厂牌/主办: " + ", ".join(parts))

    return "\n".join(lines)
