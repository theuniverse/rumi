import asyncio
import logging
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone="Asia/Shanghai")


def start_scheduler():
    from app.jobs import run_monitor, run_extract, run_update, run_weekly

    scheduler.add_job(
        run_monitor,
        trigger=IntervalTrigger(hours=2),
        id="monitor",
        name="RSS Monitor",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=300,
    )
    scheduler.add_job(
        run_extract,
        trigger=CronTrigger(hour="11,19", minute=0),
        id="extract",
        name="LLM Extract",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=600,
    )
    scheduler.add_job(
        run_update,
        trigger=CronTrigger(hour="10,18", minute=30),
        id="update",
        name="Incremental Update",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=600,
    )
    scheduler.add_job(
        run_weekly,
        trigger=CronTrigger(day_of_week="mon", hour=9, minute=0),
        id="weekly",
        name="Weekly Report",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=3600,
    )
    scheduler.start()


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
