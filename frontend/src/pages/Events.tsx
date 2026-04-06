import { useState, useEffect, useCallback } from "react";
import { ExternalLink, Trash2, Check, Star, Clock, Sparkles, RefreshCw, Plus } from "lucide-react";
import clsx from "clsx";
import { getEvents, updateEventStatus, deleteEvent, getEventLineup, addScraperEventToMyEvents } from "../lib/db";
import { fetchRecommendedEvents, type ScoredEvent } from "../lib/event-recommendations";
import type { RumiEvent, EventStatus, EventLineupEntry } from "../lib/types";

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<EventStatus, string> = {
  interested: "Interested",
  attended:   "Attended",
  skipped:    "Skipped",
};

const STATUS_STYLES: Record<EventStatus, string> = {
  interested: "text-blue-400 border-blue-400/30 bg-blue-400/5",
  attended:   "text-live   border-live/30   bg-live/5",
  skipped:    "text-faint  border-rim       bg-transparent",
};

function StatusBadge({ status, onClick }: { status: EventStatus; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "text-xs px-2 py-0.5 rounded border transition-colors",
        STATUS_STYLES[status],
        onClick && "cursor-pointer hover:opacity-80"
      )}
    >
      {STATUS_LABELS[status]}
    </button>
  );
}

// ── Lineup section ────────────────────────────────────────────────────────────

function LineupList({ eventId }: { eventId: number }) {
  const [lineup, setLineup] = useState<EventLineupEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getEventLineup(eventId).then(l => { setLineup(l); setLoading(false); });
  }, [eventId]);

  if (loading) return <p className="text-xs text-faint">Loading…</p>;
  if (lineup.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {lineup.map(entry => (
        <span key={entry.id} className="text-xs text-ghost border border-rim rounded px-1.5 py-0.5">
          {entry.person_name}
          {entry.start_time && (
            <span className="text-faint ml-1">{entry.start_time.slice(0, 5)}</span>
          )}
        </span>
      ))}
    </div>
  );
}

// ── My Event row ──────────────────────────────────────────────────────────────

const STATUS_CYCLE: Record<EventStatus, EventStatus> = {
  interested: "attended",
  attended:   "skipped",
  skipped:    "interested",
};

function MyEventRow({ event, onUpdate, onDelete }: {
  event: RumiEvent;
  onUpdate: (id: number, status: EventStatus) => void;
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const cycleStatus = async () => {
    const next = STATUS_CYCLE[event.status];
    await updateEventStatus(event.id, next);
    onUpdate(event.id, next);
  };

  const handleDelete = async () => {
    setDeleting(true);
    await deleteEvent(event.id);
    onDelete(event.id);
  };

  // Format date
  const dateStr = (() => {
    try {
      const d = new Date(event.date + "T00:00:00");
      return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    } catch { return event.date; }
  })();

  const isPast = event.date < new Date().toISOString().slice(0, 10);

  return (
    <div className={clsx(
      "group border border-rim rounded-lg bg-surface transition-colors",
      isPast && event.status === "interested" && "opacity-60"
    )}>
      <div
        className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-elevated transition-colors rounded-lg"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Date */}
        <div className="w-16 shrink-0 text-right">
          <p className="text-xs text-ghost leading-tight">{dateStr}</p>
          {event.start_time && (
            <p className="text-xs text-faint">{event.start_time.slice(0, 5)}</p>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-soft font-medium leading-snug truncate">{event.title}</p>
          {event.venue_name && (
            <p className="text-xs text-ghost mt-0.5 truncate">{event.venue_name}</p>
          )}
          {event.source === 'scraper' && (
            <span className="inline-flex items-center gap-1 text-[10px] text-faint mt-1">
              <Sparkles size={10} />
              Recommended
            </span>
          )}
        </div>

        {/* Status + actions */}
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={event.status} onClick={(e) => { e?.stopPropagation(); cycleStatus(); }} />
          {event.ra_url && (
            <a
              href={event.ra_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-faint hover:text-ghost transition-colors"
            >
              <ExternalLink size={13} />
            </a>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(); }}
            disabled={deleting}
            className="text-faint hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-30"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-3 border-t border-rim/50 pt-2">
          <LineupList eventId={event.id} />
        </div>
      )}
    </div>
  );
}

// ── Recommended Event Card ────────────────────────────────────────────────────

function RecommendedEventCard({ event, onAdd }: {
  event: ScoredEvent;
  onAdd: (eventId: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);

  const handleAdd = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setAdding(true);
    try {
      await addScraperEventToMyEvents({
        id: event.id,
        event_name: event.event_name,
        event_date: event.event_date,
        start_time: event.start_time,
        end_time: event.end_time,
        venue: event.venue,
        ref_venue_id: event.ref_venue_id,
        timetable_slots: event.timetable_slots,
      });
      onAdd(event.id);
    } finally {
      setAdding(false);
    }
  };

  // Format date
  const dateStr = (() => {
    try {
      if (!event.event_date) return "TBA";
      const d = new Date(event.event_date + "T00:00:00");
      return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    } catch { return event.event_date || "TBA"; }
  })();

  return (
    <div className="group border border-rim rounded-lg bg-surface hover:bg-elevated transition-colors">
      <div
        className="flex items-start gap-3 px-4 py-3 cursor-pointer"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Date */}
        <div className="w-16 shrink-0 text-right">
          <p className="text-xs text-ghost leading-tight">{dateStr}</p>
          {event.start_time && (
            <p className="text-xs text-faint">{event.start_time.slice(0, 5)}</p>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-soft font-medium leading-snug truncate">
            {event.event_name || "Untitled Event"}
          </p>
          {event.venue && (
            <p className="text-xs text-ghost mt-0.5 truncate">{event.venue}</p>
          )}
          {/* Match reasons */}
          {event.matchReasons.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {event.matchReasons.map((reason, i) => (
                <span key={i} className="text-[10px] text-blue-400 bg-blue-400/10 border border-blue-400/30 rounded px-1.5 py-0.5">
                  {reason}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {event.isAdded ? (
            <span className="text-xs text-live flex items-center gap-1">
              <Check size={12} />
              Added
            </span>
          ) : (
            <button
              onClick={handleAdd}
              disabled={adding}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-sand/15 text-sand hover:bg-sand/25 transition-colors disabled:opacity-50"
            >
              <Plus size={12} />
              {adding ? "Adding..." : "I'm Attending"}
            </button>
          )}
        </div>
      </div>

      {/* Expanded lineup */}
      {expanded && event.timetable_slots.length > 0 && (
        <div className="px-4 pb-3 border-t border-rim/50 pt-2">
          <div className="flex flex-wrap gap-1">
            {event.timetable_slots.map((slot, i) => (
              <div key={i} className="text-xs">
                {slot.artists.map((artist, j) => (
                  <span key={j} className="text-ghost border border-rim rounded px-1.5 py-0.5 inline-block mr-1 mb-1">
                    {artist}
                    {slot.start_time && (
                      <span className="text-faint ml-1">{slot.start_time.slice(0, 5)}</span>
                    )}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = "my-events" | "recommended";

export default function Events() {
  const [activeTab, setActiveTab] = useState<Tab>("my-events");
  const [myEvents, setMyEvents] = useState<RumiEvent[]>([]);
  const [recommendedEvents, setRecommendedEvents] = useState<ScoredEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRecommended, setLoadingRecommended] = useState(false);

  const loadMyEvents = useCallback(async () => {
    setLoading(true);
    const all = await getEvents();
    setMyEvents(all);
    setLoading(false);
  }, []);

  const loadRecommended = useCallback(async () => {
    setLoadingRecommended(true);
    try {
      const events = await fetchRecommendedEvents();
      setRecommendedEvents(events);
    } finally {
      setLoadingRecommended(false);
    }
  }, []);

  useEffect(() => {
    loadMyEvents();
  }, [loadMyEvents]);

  useEffect(() => {
    if (activeTab === "recommended" && recommendedEvents.length === 0) {
      loadRecommended();
    }
  }, [activeTab, recommendedEvents.length, loadRecommended]);

  const handleUpdate = (id: number, status: EventStatus) => {
    setMyEvents(prev => prev.map(e => e.id === id ? { ...e, status } : e));
  };

  const handleDelete = (id: number) => {
    setMyEvents(prev => prev.filter(e => e.id !== id));
  };

  const handleAddRecommended = (scraperEventId: number) => {
    // Mark as added in recommended list
    setRecommendedEvents(prev => prev.map(e =>
      e.id === scraperEventId ? { ...e, isAdded: true } : e
    ));
    // Reload my events to show the new one
    loadMyEvents();
  };

  // Group my events by upcoming vs past
  const today = new Date().toISOString().slice(0, 10);
  const upcomingEvents = myEvents.filter(e => e.date >= today);
  const pastEvents = myEvents.filter(e => e.date < today);

  // Filter recommended events (exclude already added)
  const availableRecommended = recommendedEvents.filter(e => !e.isAdded);

  return (
    <div className="max-w-2xl mx-auto px-5 sm:px-8 py-8 sm:py-16">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-soft tracking-tight mb-1">Events</h1>
        <p className="text-ghost text-sm">
          Your events and personalized recommendations
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-rim">
        <button
          onClick={() => setActiveTab("my-events")}
          className={clsx(
            "px-4 py-2 text-sm transition-colors border-b-2 -mb-px",
            activeTab === "my-events"
              ? "border-sand text-soft"
              : "border-transparent text-ghost hover:text-soft"
          )}
        >
          My Events
          {myEvents.length > 0 && (
            <span className="ml-2 text-xs text-faint">({myEvents.length})</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("recommended")}
          className={clsx(
            "px-4 py-2 text-sm transition-colors border-b-2 -mb-px flex items-center gap-1.5",
            activeTab === "recommended"
              ? "border-sand text-soft"
              : "border-transparent text-ghost hover:text-soft"
          )}
        >
          <Sparkles size={14} />
          Recommended
          {availableRecommended.length > 0 && (
            <span className="ml-1 text-xs text-faint">({availableRecommended.length})</span>
          )}
        </button>
      </div>

      {/* My Events Tab */}
      {activeTab === "my-events" && (
        <>
          {loading && (
            <p className="text-ghost text-sm">Loading…</p>
          )}

          {!loading && myEvents.length === 0 && (
            <div className="text-center py-16">
              <Star size={24} className="text-faint mx-auto mb-3" strokeWidth={1} />
              <p className="text-ghost text-sm mb-1">No events yet</p>
              <p className="text-faint text-xs mb-4">
                Check out recommended events or add your own
              </p>
              <button
                onClick={() => setActiveTab("recommended")}
                className="px-4 py-2 rounded bg-sand/15 text-sand text-sm hover:bg-sand/25 transition-colors"
              >
                View Recommendations
              </button>
            </div>
          )}

          {/* Upcoming */}
          {upcomingEvents.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <Clock size={13} className="text-faint" />
                <span className="text-xs text-faint uppercase tracking-wider">Upcoming</span>
              </div>
              <div className="space-y-2">
                {upcomingEvents.map(ev => (
                  <MyEventRow key={ev.id} event={ev} onUpdate={handleUpdate} onDelete={handleDelete} />
                ))}
              </div>
            </div>
          )}

          {/* Past */}
          {pastEvents.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Check size={13} className="text-faint" />
                <span className="text-xs text-faint uppercase tracking-wider">Past</span>
              </div>
              <div className="space-y-2">
                {pastEvents.map(ev => (
                  <MyEventRow key={ev.id} event={ev} onUpdate={handleUpdate} onDelete={handleDelete} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Recommended Tab */}
      {activeTab === "recommended" && (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-ghost">
              Based on your followed artists and venues
            </p>
            <button
              onClick={loadRecommended}
              disabled={loadingRecommended}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-rim text-ghost text-xs hover:text-soft hover:border-muted transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={loadingRecommended ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          {loadingRecommended && recommendedEvents.length === 0 && (
            <p className="text-ghost text-sm">Loading recommendations…</p>
          )}

          {!loadingRecommended && recommendedEvents.length === 0 && (
            <div className="text-center py-16">
              <Sparkles size={24} className="text-faint mx-auto mb-3" strokeWidth={1} />
              <p className="text-ghost text-sm mb-1">No recommendations yet</p>
              <p className="text-faint text-xs">
                Follow some artists or venues to get personalized event recommendations
              </p>
            </div>
          )}

          {availableRecommended.length > 0 && (
            <div className="space-y-2">
              {availableRecommended.map(event => (
                <RecommendedEventCard
                  key={event.id}
                  event={event}
                  onAdd={handleAddRecommended}
                />
              ))}
            </div>
          )}

          {recommendedEvents.length > 0 && availableRecommended.length === 0 && (
            <div className="text-center py-12">
              <Check size={24} className="text-live mx-auto mb-3" />
              <p className="text-ghost text-sm">All recommendations added!</p>
              <p className="text-faint text-xs mt-1">Check back later for more events</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Made with Bob
