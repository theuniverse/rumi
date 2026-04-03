"""Orchestration: classify → queue → extract → diff."""
import asyncio
import json
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import (
    ExtractedEvent, EventStatus, LLMCall,
    PageStatus, ScrapedPage, Source, TimetableSlot,
)
from app.services.llm_client import (
    LLMResult, build_classify_messages, build_diff_messages,
    build_extract_messages, call_openrouter,
)
from app.services.matcher import match_event
from app.services.refdata_context import build_reference_context

logger = logging.getLogger(__name__)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _safe_json(text: str) -> dict:
    try:
        return json.loads(text)
    except Exception:
        return {}


async def _save_llm_call(
    session: AsyncSession,
    result: LLMResult,
    page_id: int | None,
    job_name: str,
    task: str,
    prompt_text: str,
) -> None:
    call = LLMCall(
        page_id=page_id,
        job_name=job_name,
        task=task,
        model=result.model,
        prompt=prompt_text[:8000],
        response=result.content[:8000],
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        cost_usd=result.cost_usd,
        latency_ms=result.latency_ms,
        success=result.success,
    )
    session.add(call)
    await session.flush()


# ── Monitor: classify new articles ───────────────────────────────────────────

async def classify_and_save(
    session: AsyncSession,
    source: Source,
    articles: list[dict],
) -> int:
    """Persist new articles and classify them via LLM. Returns count of new pages."""
    new_count = 0
    ref_context = await build_reference_context(session)

    from app.scrapers.rss_fetcher import fetch_article_text

    for article in articles:
        url = article["url"]
        content_hash = article["content_hash"]

        # Dedup by URL
        existing = (
            await session.execute(select(ScrapedPage).where(ScrapedPage.url == url))
        ).scalar_one_or_none()

        if existing:
            if existing.content_hash != content_hash:
                # Content changed — re-queue for update
                existing.content_hash = content_hash
                existing.raw_html = article["content"]
                if existing.status == PageStatus.done:
                    existing.status = PageStatus.pending_extract
            continue

        # ── Pre-fetch full article text before classification ──────────────
        # WeChat RSS feeds only carry the title; fetch the real article body
        # so the classifier (and later extractor) has useful content.
        # We rate-limit to 1 req/1.5 s to stay polite with mp.weixin.qq.com.
        content = article["content"]
        is_wechat = "mp.weixin.qq.com" in url
        if is_wechat and len(content.strip()) < 300:
            logger.info("Pre-fetching full article for classify: %s", article["title"])
            fetched = await fetch_article_text(url)
            if fetched:
                content = fetched
                content_hash = __import__("hashlib").sha256(content.encode()).hexdigest()
            await asyncio.sleep(1.5)   # polite rate limit for WeChat

        page = ScrapedPage(
            source_id=source.id,
            url=url,
            content_hash=content_hash,
            raw_html=content,          # store full content, not just RSS title
            status=PageStatus.new,
        )
        session.add(page)
        await session.flush()
        new_count += 1

        # Classify with LLM (now has full article text)
        messages = build_classify_messages(content, ref_context)
        result = await call_openrouter(messages, model=settings.model_classify)
        prompt_text = messages[-1]["content"]
        await _save_llm_call(session, result, page.id, "monitor", "classify", prompt_text)

        if result.success:
            data = _safe_json(result.content)
            if data.get("event_detected"):
                page.status = PageStatus.pending_extract
            else:
                page.status = PageStatus.done
        else:
            # LLM failed — queue for extraction anyway so it gets another chance
            logger.warning("Classify failed for page %d (%s): %s", page.id, url, result.error)
            page.status = PageStatus.pending_extract

    await session.commit()
    return new_count


# ── Extract: deep extraction ──────────────────────────────────────────────────

async def extract_single_page(session: AsyncSession, page_id: int) -> None:
    """Extract a single specific page with per-step commits so pollers see status transitions."""
    page = (
        await session.execute(select(ScrapedPage).where(ScrapedPage.id == page_id))
    ).scalar_one_or_none()
    if not page:
        logger.warning("[rerun] Page %d not found", page_id)
        return
    if page.status not in (PageStatus.pending_extract, PageStatus.error):
        logger.info("[rerun] Page %d is in status %s — skipping", page_id, page.status)
        return

    # Commit extracting status so the polling client can see the transition
    page.status = PageStatus.extracting
    await session.commit()

    # Check whether full article text was properly fetched.
    # WeChat articles are typically 2000–10000+ chars; anything shorter is likely
    # just the RSS title/stub that the classify step grabbed.  Non-WeChat pages
    # are lighter so we use a lower floor of 500 chars.
    content = page.raw_html or ""
    url = page.url or ""
    is_wechat = "mp.weixin.qq.com" in url
    full_content_floor = 2000 if is_wechat else 500

    if len(content) < full_content_floor and url:
        from app.scrapers.rss_fetcher import fetch_article_text
        logger.info(
            "[rerun] Content looks incomplete (%d chars, floor %d) for page %d — re-fetching full article",
            len(content), full_content_floor, page_id,
        )
        full_text = await fetch_article_text(url)
        if full_text and len(full_text) > len(content):
            logger.info("[rerun] Got full article (%d chars) for page %d", len(full_text), page_id)
            content = full_text
            page.raw_html = full_text
            await session.commit()
        else:
            logger.warning(
                "[rerun] Re-fetch didn't improve content for page %d (%d → %d chars), proceeding with existing",
                page_id, len(content), len(full_text) if full_text else 0,
            )
        await asyncio.sleep(1.5)

    ref_context = await build_reference_context(session)
    messages = build_extract_messages(content, ref_context)
    llm = await call_openrouter(messages, model=settings.model_extract, max_tokens=6000)
    await _save_llm_call(session, llm, page.id, "rerun", "extract", messages[-1]["content"])

    if llm.success:
        data = _safe_json(llm.content)
        await _upsert_event(session, page, data, llm.content)
        page.status = PageStatus.done
    else:
        logger.error("[rerun] LLM extract failed for page %d: %s", page_id, llm.error)
        page.status = PageStatus.error

    await session.commit()


async def extract_pending(session: AsyncSession) -> int:
    """Run deep extraction on all pending_extract pages."""
    ref_context = await build_reference_context(session)
    result = await session.execute(
        select(ScrapedPage)
        .where(ScrapedPage.status == PageStatus.pending_extract)
        .limit(50)
    )
    pages = result.scalars().all()
    processed = 0

    for page in pages:
        page.status = PageStatus.extracting
        await session.flush()

        # Fallback: if classify step didn't manage to fetch full text, do it now.
        # (Handles non-WeChat sources or cases where pre-fetch failed.)
        content = page.raw_html or ""
        if len(content) < 500 and page.url:
            from app.scrapers.rss_fetcher import fetch_article_text
            logger.info("Content sparse (%d chars) for page %d — fallback full-article fetch: %s",
                        len(content), page.id, page.url)
            full_text = await fetch_article_text(page.url)
            if full_text:
                content = full_text
                page.raw_html = full_text
                await session.flush()
            else:
                logger.warning("Full article fetch failed for page %d, extracting from title only", page.id)
            await asyncio.sleep(1.5)   # rate limit WeChat fetches

        messages = build_extract_messages(content, ref_context)
        llm = await call_openrouter(messages, model=settings.model_extract, max_tokens=6000)
        await _save_llm_call(session, llm, page.id, "extract", "extract", messages[-1]["content"])

        if llm.success:
            data = _safe_json(llm.content)
            await _upsert_event(session, page, data, llm.content)
            page.status = PageStatus.done
        else:
            page.status = PageStatus.error

        processed += 1

    await session.commit()
    return processed


async def _upsert_event(
    session: AsyncSession,
    page: ScrapedPage,
    data: dict[str, Any],
    raw_json: str,
) -> None:
    event_data = data.get("event", {})
    status_str = data.get("status", "tba")
    try:
        status = EventStatus(status_str)
    except ValueError:
        status = EventStatus.tba

    # Check if event already exists for this page
    existing = (
        await session.execute(
            select(ExtractedEvent).where(ExtractedEvent.page_id == page.id)
        )
    ).scalar_one_or_none()

    if existing:
        existing.event_name = event_data.get("name") or existing.event_name
        existing.event_date = event_data.get("date") or existing.event_date
        existing.venue = event_data.get("venue") or existing.venue
        existing.city = event_data.get("city") or existing.city
        existing.status = status
        existing.confidence = data.get("extraction_confidence", 0.0)
        existing.raw_json = raw_json
        existing.info_level = _infer_info_level(data)
        event = existing
    else:
        event = ExtractedEvent(
            page_id=page.id,
            event_name=event_data.get("name"),
            event_date=event_data.get("date"),
            venue=event_data.get("venue"),
            city=event_data.get("city"),
            info_level=_infer_info_level(data),
            status=status,
            confidence=data.get("extraction_confidence", 0.0),
            raw_json=raw_json,
        )
        session.add(event)
        await session.flush()

    # Persist timetable slots
    for stage in data.get("stages", []):
        stage_name = stage.get("name", "Main")
        for slot in stage.get("slots", []):
            ts = TimetableSlot(
                event_id=event.id,
                stage_name=stage_name,
                start_time=slot.get("start_time"),
                end_time=slot.get("end_time"),
                artists_json=json.dumps(slot.get("artists", []), ensure_ascii=False),
                is_b2b=slot.get("is_b2b", False),
                set_type=slot.get("set_type", "DJ"),
                special_note=slot.get("special_note"),
            )
            session.add(ts)

    await session.flush()
    # Match against reference data (venue, artists, labels)
    await match_event(session, event)


def _infer_info_level(data: dict) -> int:
    stages = data.get("stages", [])
    if not stages:
        return 1
    has_timetable = any(
        slot.get("start_time") for stage in stages for slot in stage.get("slots", [])
    )
    if has_timetable:
        return 3
    has_artists = any(slot.get("artists") for stage in stages for slot in stage.get("slots", []))
    return 2 if has_artists else 1


# ── Update: incremental diff ──────────────────────────────────────────────────

async def update_partial_events(session: AsyncSession) -> int:
    """Re-fetch pages for partial/tba events and diff for updates."""
    from app.scrapers.rss_fetcher import fetch_page_html

    result = await session.execute(
        select(ExtractedEvent)
        .where(ExtractedEvent.status.in_([EventStatus.tba, EventStatus.partial]))
        .limit(30)
    )
    events = result.scalars().all()
    updated = 0

    for event in events:
        if not event.page_id:
            continue
        page = (
            await session.execute(select(ScrapedPage).where(ScrapedPage.id == event.page_id))
        ).scalar_one_or_none()
        if not page or not page.url:
            continue

        try:
            new_html, new_hash = await fetch_page_html(page.url)
        except Exception as e:
            logger.warning("Re-fetch failed for %s: %s", page.url, e)
            continue

        if new_hash == page.content_hash:
            continue  # No change

        # Content changed — run diff
        messages = build_diff_messages(page.raw_html or "", new_html)
        llm = await call_openrouter(messages, model=settings.model_diff, max_tokens=2048)
        await _save_llm_call(session, llm, page.id, "update", "diff", messages[-1]["content"])

        if llm.success:
            diff = _safe_json(llm.content)
            if diff.get("has_changes"):
                page.raw_html = new_html
                page.content_hash = new_hash
                page.status = PageStatus.pending_extract
                updated += 1

    await session.commit()
    return updated
