import enum
from datetime import datetime

from sqlalchemy import (
    Boolean, Column, DateTime, Enum, Float, ForeignKey,
    Integer, String, Text, func,
)
from sqlalchemy.orm import relationship

from app.database import Base


class SourceStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"


class PageStatus(str, enum.Enum):
    new = "new"
    needs_content = "needs_content"   # auto-fetch blocked; awaiting manual paste
    pending_extract = "pending_extract"
    extracting = "extracting"
    done = "done"
    skipped = "skipped"               # manually dismissed; will not be re-queued
    error = "error"


class EventStatus(str, enum.Enum):
    tba = "tba"
    partial = "partial"
    complete = "complete"


class RunStatus(str, enum.Enum):
    running = "running"
    success = "success"
    failed = "failed"


class Source(Base):
    __tablename__ = "sources"

    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    feed_path = Column(String(500), nullable=False)  # e.g. /feeds/Gh_xxxxxxxx.xml
    keywords = Column(Text, default="[]")              # JSON array of strings
    city = Column(String(100), default="")
    active = Column(Boolean, default=True)
    notes = Column(Text, nullable=True)                # Human-maintained extraction hints injected into LLM prompt
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    pages = relationship("ScrapedPage", back_populates="source", lazy="select")


class ScrapeRun(Base):
    __tablename__ = "scrape_runs"

    id = Column(Integer, primary_key=True)
    job_name = Column(String(50), nullable=False)
    status = Column(Enum(RunStatus), default=RunStatus.running)
    started_at = Column(DateTime, default=datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)
    pages_found = Column(Integer, default=0)
    pages_new = Column(Integer, default=0)
    error_msg = Column(Text, nullable=True)


class ScrapedPage(Base):
    __tablename__ = "scraped_pages"

    id = Column(Integer, primary_key=True)
    source_id = Column(Integer, ForeignKey("sources.id", ondelete="SET NULL"), nullable=True)
    url = Column(String(2000), nullable=False, unique=True)
    content_hash = Column(String(64), nullable=False)
    raw_html = Column(Text, nullable=True)
    status = Column(Enum(PageStatus), default=PageStatus.new)
    fetched_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    source = relationship("Source", back_populates="pages")
    llm_calls = relationship("LLMCall", back_populates="page", lazy="select")
    extracted_event = relationship("ExtractedEvent", back_populates="page", uselist=False)


class LLMCall(Base):
    __tablename__ = "llm_calls"

    id = Column(Integer, primary_key=True)
    page_id = Column(Integer, ForeignKey("scraped_pages.id", ondelete="CASCADE"), nullable=True)
    job_name = Column(String(50), nullable=False)
    task = Column(String(50), nullable=False)  # classify / extract / diff
    model = Column(String(100), nullable=False)
    prompt = Column(Text, nullable=True)
    response = Column(Text, nullable=True)
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    cost_usd = Column(Float, default=0.0)
    latency_ms = Column(Integer, default=0)
    success = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    page = relationship("ScrapedPage", back_populates="llm_calls")


class ExtractedEvent(Base):
    __tablename__ = "extracted_events"

    id = Column(Integer, primary_key=True)
    page_id = Column(Integer, ForeignKey("scraped_pages.id", ondelete="SET NULL"), nullable=True)
    event_name = Column(String(500), nullable=True)
    event_date = Column(String(20), nullable=True)  # YYYY-MM-DD
    venue = Column(String(300), nullable=True)
    city = Column(String(100), nullable=True)
    info_level = Column(Integer, default=1)          # 1=date+venue only, 2=lineup, 3=timetable
    status = Column(Enum(EventStatus), default=EventStatus.tba)
    confidence = Column(Float, default=0.0)
    raw_json = Column(Text, nullable=True)           # Full LLM extraction JSON
    ref_venue_id = Column(Integer, ForeignKey("ref_venues.id", ondelete="SET NULL"), nullable=True)
    has_followed_match = Column(Boolean, default=False)
    pushed_to_rumi = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    page = relationship("ScrapedPage", back_populates="extracted_event")
    timetable_slots = relationship("TimetableSlot", back_populates="event", lazy="select")
    entity_matches = relationship("EventEntityMatch", lazy="select")


class TimetableSlot(Base):
    __tablename__ = "timetable_slots"

    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey("extracted_events.id", ondelete="CASCADE"))
    stage_name = Column(String(200), nullable=True)
    start_time = Column(String(10), nullable=True)   # HH:MM
    end_time = Column(String(10), nullable=True)     # HH:MM
    artists_json = Column(Text, default="[]")        # JSON array of artist names
    is_b2b = Column(Boolean, default=False)
    set_type = Column(String(20), default="DJ")      # DJ / Live / VJ / Hybrid
    special_note = Column(String(200), nullable=True)

    event = relationship("ExtractedEvent", back_populates="timetable_slots")


class AppSetting(Base):
    """Key-value store for runtime configuration overrides (e.g. API keys, model names)."""
    __tablename__ = "app_settings"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ── Reference Data ──────────────────────────────────────────────────────────


class DiscoveryStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    ignored = "ignored"


class RefVenue(Base):
    __tablename__ = "ref_venues"

    id = Column(Integer, primary_key=True)
    name = Column(String(300), nullable=False)
    aliases = Column(Text, default="[]")        # JSON array of alternate names
    type = Column(String(20), default="club")   # venue | club | other
    address = Column(String(500), nullable=True)
    city = Column(String(100), default="")
    ra_id = Column(String(100), nullable=True)
    followed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RefArtist(Base):
    __tablename__ = "ref_artists"

    id = Column(Integer, primary_key=True)
    name = Column(String(300), nullable=False)
    aliases = Column(Text, default="[]")        # JSON array of alternate names
    type = Column(String(20), default="dj")     # dj | musician | promoter | other
    city = Column(String(100), nullable=True)
    ra_url = Column(String(500), nullable=True)
    followed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RefLabel(Base):
    __tablename__ = "ref_labels"

    id = Column(Integer, primary_key=True)
    name = Column(String(300), nullable=False)
    aliases = Column(Text, default="[]")        # JSON array of alternate names
    type = Column(String(20), default="promoter")  # promoter | record_label
    city = Column(String(100), nullable=True)
    ra_id = Column(String(100), nullable=True)
    followed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class EventEntityMatch(Base):
    __tablename__ = "event_entity_matches"

    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey("extracted_events.id", ondelete="CASCADE"))
    entity_type = Column(String(20), nullable=False)  # venue | artist | label
    entity_id = Column(Integer, nullable=False)
    raw_name = Column(String(300), nullable=True)
    confidence = Column(Float, default=1.0)


class Discovery(Base):
    __tablename__ = "discoveries"

    id = Column(Integer, primary_key=True)
    entity_type = Column(String(20), nullable=False)  # venue | artist | label
    raw_name = Column(String(300), nullable=False)
    frequency = Column(Integer, default=1)
    first_seen_at = Column(DateTime, default=datetime.utcnow)
    status = Column(Enum(DiscoveryStatus), default=DiscoveryStatus.pending)
    accepted_as_id = Column(Integer, nullable=True)   # ref entity id after acceptance
