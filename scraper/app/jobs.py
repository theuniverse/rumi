"""APScheduler job implementations — each runs as an async task."""
import logging
from datetime import datetime, timezone

from sqlalchemy import select, or_

from app.database import AsyncSessionLocal
from app.models import Source, ScrapeRun, RunStatus, ScrapedPage, PageStatus, ExtractedEvent, EventStatus

logger = logging.getLogger(__name__)


async def _begin_run(session, job_name: str) -> ScrapeRun:
    run = ScrapeRun(job_name=job_name, status=RunStatus.running, started_at=datetime.utcnow())
    session.add(run)
    await session.commit()
    await session.refresh(run)
    return run


async def _finish_run(session, run: ScrapeRun, pages_found=0, pages_new=0, error=None):
    run.status = RunStatus.failed if error else RunStatus.success
    run.finished_at = datetime.utcnow()
    run.pages_found = pages_found
    run.pages_new = pages_new
    run.error_msg = str(error) if error else None
    await session.commit()


async def run_monitor():
    """Fetch RSS feeds for all active sources, classify new articles."""
    logger.info("[monitor] Starting RSS monitor job")
    from app.scrapers.rss_fetcher import fetch_source_articles
    from app.services.extractor import classify_and_save

    async with AsyncSessionLocal() as session:
        run = await _begin_run(session, "monitor")
        try:
            result = await session.execute(select(Source).where(Source.active == True))
            sources = result.scalars().all()

            total_found = 0
            total_new = 0

            for source in sources:
                try:
                    articles = await fetch_source_articles(source)
                    total_found += len(articles)
                    new_count = await classify_and_save(session, source, articles)
                    total_new += new_count
                except Exception as e:
                    logger.warning("[monitor] source %s failed: %s", source.name, e)

            await _finish_run(session, run, pages_found=total_found, pages_new=total_new)
            logger.info("[monitor] Done — found %d articles, %d new", total_found, total_new)
        except Exception as e:
            logger.error("[monitor] Job failed: %s", e)
            await _finish_run(session, run, error=e)


async def run_extract():
    """Deep-extract pages queued as pending_extract."""
    logger.info("[extract] Starting extraction job")
    from app.services.extractor import extract_pending

    async with AsyncSessionLocal() as session:
        run = await _begin_run(session, "extract")
        try:
            processed = await extract_pending(session)
            await _finish_run(session, run, pages_found=processed)
            logger.info("[extract] Processed %d pages", processed)
        except Exception as e:
            logger.error("[extract] Job failed: %s", e)
            await _finish_run(session, run, error=e)


async def run_extract_single(page_id: int):
    """Extract a single page immediately — used by the re-run endpoint."""
    logger.info("[rerun] Extracting single page %d", page_id)
    from app.services.extractor import extract_single_page

    async with AsyncSessionLocal() as session:
        try:
            await extract_single_page(session, page_id)
            logger.info("[rerun] Done for page %d", page_id)
        except Exception as e:
            logger.error("[rerun] Extraction failed for page %d: %s", page_id, e)


async def run_extract_single_with_job(page_id: int, job):
    """Extract a single page and report per-step progress into *job*."""
    from datetime import datetime as _dt
    from app.services.extractor import extract_single_page
    logger.info("[rerun] Extracting page %d (job %s)", page_id, job.run_id)

    async with AsyncSessionLocal() as session:
        try:
            await extract_single_page(session, page_id, job=job)
            logger.info("[rerun] Done for page %d (job %s)", page_id, job.run_id)
        except Exception as e:
            logger.error("[rerun] Extraction failed for page %d: %s", page_id, e)
            job.status = "error"
            job.error = str(e)
            job.finished_at = _dt.utcnow()
            # Mark any still-running step as error
            for step in job.steps:
                if step.status in ("pending", "running"):
                    step.status = "error"
                    step.detail = str(e)
                    step.finished_at = _dt.utcnow()


async def run_update():
    """Re-fetch partial/tba events and check for content updates."""
    logger.info("[update] Starting incremental update job")
    from app.services.extractor import update_partial_events

    async with AsyncSessionLocal() as session:
        run = await _begin_run(session, "update")
        try:
            updated = await update_partial_events(session)
            await _finish_run(session, run, pages_found=updated)
            logger.info("[update] Updated %d events", updated)
        except Exception as e:
            logger.error("[update] Job failed: %s", e)
            await _finish_run(session, run, error=e)


async def run_weekly():
    """Log a weekly summary."""
    logger.info("[weekly] Generating weekly stats")
    async with AsyncSessionLocal() as session:
        run = await _begin_run(session, "weekly")
        try:
            from sqlalchemy import func
            total_pages = (await session.execute(select(func.count()).select_from(ScrapedPage))).scalar()
            total_events = (await session.execute(select(func.count()).select_from(ExtractedEvent))).scalar()
            await _finish_run(session, run, pages_found=total_pages)
            logger.info("[weekly] Total pages: %d, Total events: %d", total_pages, total_events)
        except Exception as e:
            logger.error("[weekly] Job failed: %s", e)
            await _finish_run(session, run, error=e)
