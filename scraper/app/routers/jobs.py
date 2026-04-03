"""Manual job trigger endpoint."""
import asyncio
import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException

router = APIRouter(tags=["jobs"])
logger = logging.getLogger(__name__)

_JOB_MAP = {
    "monitor": "app.jobs.run_monitor",
    "extract": "app.jobs.run_extract",
    "update": "app.jobs.run_update",
    "weekly": "app.jobs.run_weekly",
}


@router.post("/jobs/trigger/{job_name}")
async def trigger_job(job_name: str, background_tasks: BackgroundTasks):
    if job_name not in _JOB_MAP:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown job '{job_name}'. Valid jobs: {list(_JOB_MAP.keys())}",
        )

    import importlib
    module_path, func_name = _JOB_MAP[job_name].rsplit(".", 1)
    module = importlib.import_module(module_path)
    job_fn = getattr(module, func_name)

    background_tasks.add_task(_run_async_job, job_fn, job_name)
    return {"triggered": job_name, "status": "queued"}


async def _run_async_job(job_fn, job_name: str):
    logger.info("Manual trigger: %s", job_name)
    try:
        await job_fn()
    except Exception as e:
        logger.error("Manual trigger %s failed: %s", job_name, e)
