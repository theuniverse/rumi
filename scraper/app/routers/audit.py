"""Audit endpoints — read-only views for scraping runs, pages, and LLM calls."""
import json
from typing import Optional

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, Query

logger = logging.getLogger(__name__)
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import ExtractedEvent, LLMCall, PageStatus, ScrapeRun, ScrapedPage, Source, TimetableSlot

router = APIRouter(tags=["audit"])


@router.get("/audit/dashboard")
async def get_dashboard(db: AsyncSession = Depends(get_db)):
    from datetime import datetime, timedelta
    today = datetime.utcnow().date()
    today_start = datetime(today.year, today.month, today.day)

    runs_today = (await db.execute(
        select(func.count()).select_from(ScrapeRun).where(ScrapeRun.started_at >= today_start)
    )).scalar()

    total_pages = (await db.execute(select(func.count()).select_from(ScrapedPage))).scalar()
    pages_today = (await db.execute(
        select(func.count()).select_from(ScrapedPage).where(ScrapedPage.fetched_at >= today_start)
    )).scalar()

    total_events = (await db.execute(select(func.count()).select_from(ExtractedEvent))).scalar()

    total_cost = (await db.execute(select(func.sum(LLMCall.cost_usd)))).scalar() or 0.0
    cost_today = (await db.execute(
        select(func.sum(LLMCall.cost_usd)).where(LLMCall.created_at >= today_start)
    )).scalar() or 0.0

    total_sources = (await db.execute(
        select(func.count()).select_from(Source).where(Source.active == True)
    )).scalar()

    return {
        "runs_today": runs_today,
        "total_pages": total_pages,
        "pages_today": pages_today,
        "total_events": total_events,
        "total_cost_usd": round(total_cost, 4),
        "cost_today_usd": round(cost_today, 4),
        "active_sources": total_sources,
    }


@router.get("/audit/runs")
async def list_runs(
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ScrapeRun).order_by(ScrapeRun.started_at.desc()).offset(offset).limit(limit)
    )
    runs = result.scalars().all()
    total = (await db.execute(select(func.count()).select_from(ScrapeRun))).scalar()
    return {
        "total": total,
        "items": [
            {
                "id": r.id,
                "job_name": r.job_name,
                "status": r.status,
                "started_at": r.started_at,
                "finished_at": r.finished_at,
                "pages_found": r.pages_found,
                "pages_new": r.pages_new,
                "error_msg": r.error_msg,
            }
            for r in runs
        ],
    }


@router.get("/audit/pages")
async def list_pages(
    source_id: Optional[int] = None,
    status: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
):
    q = select(ScrapedPage).order_by(ScrapedPage.fetched_at.desc())
    if source_id:
        q = q.where(ScrapedPage.source_id == source_id)
    if status:
        q = q.where(ScrapedPage.status == status)

    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar()
    result = await db.execute(q.offset(offset).limit(limit))
    pages = result.scalars().all()

    # Load source names
    source_ids = {p.source_id for p in pages if p.source_id}
    sources_map: dict[int, str] = {}
    if source_ids:
        sr = await db.execute(select(Source).where(Source.id.in_(source_ids)))
        for s in sr.scalars().all():
            sources_map[s.id] = s.name

    return {
        "total": total,
        "items": [
            {
                "id": p.id,
                "url": p.url,
                "source_id": p.source_id,
                "source_name": sources_map.get(p.source_id, "—"),
                "status": p.status,
                "content_hash": p.content_hash[:8],
                "fetched_at": p.fetched_at,
                "updated_at": p.updated_at,
            }
            for p in pages
        ],
    }


@router.get("/audit/pages/{page_id}")
async def get_page_detail(page_id: int, db: AsyncSession = Depends(get_db)):
    page = (await db.execute(select(ScrapedPage).where(ScrapedPage.id == page_id))).scalar_one_or_none()
    if not page:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Page not found")

    # LLM calls
    llm_calls_result = await db.execute(
        select(LLMCall).where(LLMCall.page_id == page_id).order_by(LLMCall.created_at)
    )
    llm_calls = llm_calls_result.scalars().all()

    # Extracted event
    event = (await db.execute(
        select(ExtractedEvent).where(ExtractedEvent.page_id == page_id)
    )).scalar_one_or_none()

    slots = []
    if event:
        slots_result = await db.execute(
            select(TimetableSlot).where(TimetableSlot.event_id == event.id)
        )
        slots = slots_result.scalars().all()

    # Source
    source = None
    if page.source_id:
        source = (await db.execute(select(Source).where(Source.id == page.source_id))).scalar_one_or_none()

    return {
        "id": page.id,
        "url": page.url,
        "source_name": source.name if source else None,
        "status": page.status,
        "content_hash": page.content_hash,
        "raw_html_preview": (page.raw_html or "")[:3000],
        "fetched_at": page.fetched_at,
        "llm_calls": [
            {
                "id": c.id,
                "task": c.task,
                "model": c.model,
                "input_tokens": c.input_tokens,
                "output_tokens": c.output_tokens,
                "cost_usd": c.cost_usd,
                "latency_ms": c.latency_ms,
                "success": c.success,
                "prompt_preview": (c.prompt or "")[:500],
                "response_preview": (c.response or "")[:2000],
                "created_at": c.created_at,
            }
            for c in llm_calls
        ],
        "extracted_event": (
            {
                "id": event.id,
                "event_name": event.event_name,
                "event_date": event.event_date,
                "venue": event.venue,
                "city": event.city,
                "info_level": event.info_level,
                "status": event.status,
                "confidence": event.confidence,
                "timetable_slots": [
                    {
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
            if event else None
        ),
    }


@router.patch("/audit/pages/{page_id}/content")
async def set_page_content(
    page_id: int,
    body: dict,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Save manually-pasted article text and immediately kick off extraction."""
    import hashlib
    from fastapi import HTTPException
    from app.services.rerun_tracker import create_job
    page = (await db.execute(select(ScrapedPage).where(ScrapedPage.id == page_id))).scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    content = (body.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=422, detail="content must not be empty")
    page.raw_html = content
    page.content_hash = hashlib.sha256(content.encode()).hexdigest()
    page.status = PageStatus.pending_extract
    await db.commit()

    job = create_job(page_id)

    async def _run():
        try:
            from app.jobs import run_extract_single_with_job
            await run_extract_single_with_job(page_id, job)
        except Exception as e:
            logger.error("Extract after manual content failed for page %d: %s", page_id, e)

    background_tasks.add_task(_run)
    return {"ok": True, "page_id": page_id, "run_id": job.run_id, "status": "pending_extract"}


@router.post("/audit/pages/{page_id}/rerun")
async def rerun_page(
    page_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Reset a page to pending_extract and kick off extraction with per-step tracking."""
    from fastapi import HTTPException
    from app.services.rerun_tracker import create_job
    page = (await db.execute(select(ScrapedPage).where(ScrapedPage.id == page_id))).scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    page.status = PageStatus.pending_extract
    await db.commit()

    job = create_job(page_id)

    async def _run():
        try:
            from app.jobs import run_extract_single_with_job
            await run_extract_single_with_job(page_id, job)
        except Exception as e:
            logger.error("Rerun extract failed for page %d: %s", page_id, e)

    background_tasks.add_task(_run)
    return {"ok": True, "page_id": page_id, "run_id": job.run_id, "status": "pending_extract"}


@router.get("/audit/pages/{page_id}/reruns")
async def list_reruns(page_id: int, db: AsyncSession = Depends(get_db)):
    """Return all tracked re-run jobs for a page (newest first)."""
    from app.services.rerun_tracker import get_jobs
    return {"items": [j.to_dict() for j in get_jobs(page_id)]}


@router.get("/audit/pages/{page_id}/reruns/{run_id}")
async def get_rerun(page_id: int, run_id: str, db: AsyncSession = Depends(get_db)):
    """Poll a specific re-run job for its current step statuses."""
    from fastapi import HTTPException
    from app.services.rerun_tracker import get_job
    job = get_job(page_id, run_id)
    if not job:
        raise HTTPException(status_code=404, detail="Run not found")
    return job.to_dict()


@router.get("/audit/llm-calls")
async def list_llm_calls(
    task: Optional[str] = None,
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
):
    q = select(LLMCall).order_by(LLMCall.created_at.desc())
    if task:
        q = q.where(LLMCall.task == task)

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
    result = await db.execute(q.offset(offset).limit(limit))
    calls = result.scalars().all()

    total_cost = (await db.execute(select(func.sum(LLMCall.cost_usd)))).scalar() or 0.0

    return {
        "total": total,
        "total_cost_usd": round(total_cost, 4),
        "items": [
            {
                "id": c.id,
                "page_id": c.page_id,
                "job_name": c.job_name,
                "task": c.task,
                "model": c.model,
                "input_tokens": c.input_tokens,
                "output_tokens": c.output_tokens,
                "cost_usd": c.cost_usd,
                "latency_ms": c.latency_ms,
                "success": c.success,
                "created_at": c.created_at,
            }
            for c in calls
        ],
    }
