"""In-memory tracker for per-step re-run progress.

Kept in a module-level dict (single-process uvicorn).
Stores the last MAX_RUNS_PER_PAGE runs per page so the UI can show history.
"""
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from collections import defaultdict
from typing import Optional

MAX_RUNS_PER_PAGE = 10


@dataclass
class RunStep:
    key: str
    label: str
    status: str = "pending"     # pending | running | done | skipped | error
    detail: str = ""
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None

    def duration_ms(self) -> Optional[int]:
        if self.started_at and self.finished_at:
            return int((self.finished_at - self.started_at).total_seconds() * 1000)
        return None

    def to_dict(self) -> dict:
        return {
            "key": self.key,
            "label": self.label,
            "status": self.status,
            "detail": self.detail,
            "duration_ms": self.duration_ms(),
        }


@dataclass
class RerunJob:
    run_id: str
    page_id: int
    status: str = "running"     # running | done | error
    steps: list = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.utcnow)
    finished_at: Optional[datetime] = None
    error: Optional[str] = None

    def elapsed_ms(self) -> int:
        end = self.finished_at or datetime.utcnow()
        return int((end - self.created_at).total_seconds() * 1000)

    def to_dict(self) -> dict:
        return {
            "run_id": self.run_id,
            "page_id": self.page_id,
            "status": self.status,
            "steps": [s.to_dict() for s in self.steps],
            "created_at": self.created_at.isoformat(),
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "elapsed_ms": self.elapsed_ms(),
            "error": self.error,
        }


# page_id → [RerunJob, ...] oldest-first
_jobs: dict[int, list] = defaultdict(list)


def create_job(page_id: int) -> RerunJob:
    job = RerunJob(
        run_id=str(uuid.uuid4())[:8],
        page_id=page_id,
        steps=[
            RunStep(key="content", label="正文准备"),
            RunStep(key="extract", label="LLM 提取"),
            RunStep(key="save",    label="保存结果"),
        ],
    )
    bucket = _jobs[page_id]
    bucket.append(job)
    if len(bucket) > MAX_RUNS_PER_PAGE:
        bucket.pop(0)
    return job


def get_jobs(page_id: int) -> list:
    """Return runs newest-first."""
    return list(reversed(_jobs.get(page_id, [])))


def get_job(page_id: int, run_id: str) -> Optional[RerunJob]:
    for job in _jobs.get(page_id, []):
        if job.run_id == run_id:
            return job
    return None
