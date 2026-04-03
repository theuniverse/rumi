import { useState, useEffect, useCallback } from "react";
import { ExternalLink, Trash2, Check, Star, Clock } from "lucide-react";
import clsx from "clsx";
import { getEvents, updateEventStatus, deleteEvent, getEventLineup } from "../lib/db";
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

// ── Event row ─────────────────────────────────────────────────────────────────

const STATUS_CYCLE: Record<EventStatus, EventStatus> = {
  interested: "attended",
  attended:   "skipped",
  skipped:    "interested",
};

function EventRow({ event, onUpdate, onDelete }: {
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

// ── Filter tabs ───────────────────────────────────────────────────────────────

const FILTERS: { value: EventStatus | "all"; label: string }[] = [
  { value: "all",        label: "All"       },
  { value: "interested", label: "Interested" },
  { value: "attended",   label: "Attended"  },
  { value: "skipped",    label: "Skipped"   },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Events() {
  const [events, setEvents] = useState<RumiEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<EventStatus | "all">("all");

  const load = useCallback(async () => {
    setLoading(true);
    const all = await getEvents();
    setEvents(all);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUpdate = (id: number, status: EventStatus) => {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, status } : e));
  };

  const handleDelete = (id: number) => {
    setEvents(prev => prev.filter(e => e.id !== id));
  };

  const visible = filter === "all"
    ? events
    : events.filter(e => e.status === filter);

  // Group by upcoming vs past
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = visible.filter(e => e.date >= today);
  const past     = visible.filter(e => e.date <  today);

  return (
    <div className="max-w-2xl mx-auto px-5 sm:px-8 py-8 sm:py-16">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-soft tracking-tight mb-1">Events</h1>
        <p className="text-ghost text-sm">
          Upcoming events from followed venues, artists, and labels.
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={clsx(
              "px-3 py-1.5 rounded text-xs transition-colors border",
              filter === f.value
                ? "border-muted text-soft bg-elevated"
                : "border-rim text-ghost hover:text-soft hover:border-muted"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && (
        <p className="text-ghost text-sm">Loading…</p>
      )}

      {!loading && events.length === 0 && (
        <div className="text-center py-16">
          <Star size={24} className="text-faint mx-auto mb-3" strokeWidth={1} />
          <p className="text-ghost text-sm mb-1">No events yet</p>
          <p className="text-faint text-xs">
            Follow artists, venues, or labels — events will appear after the next RA sync.
          </p>
        </div>
      )}

      {!loading && events.length > 0 && visible.length === 0 && (
        <p className="text-ghost text-sm">No events match this filter.</p>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={13} className="text-faint" />
            <span className="text-xs text-faint uppercase tracking-wider">Upcoming</span>
          </div>
          <div className="space-y-2">
            {upcoming.map(ev => (
              <EventRow key={ev.id} event={ev} onUpdate={handleUpdate} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      )}

      {/* Past */}
      {past.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Check size={13} className="text-faint" />
            <span className="text-xs text-faint uppercase tracking-wider">Past</span>
          </div>
          <div className="space-y-2">
            {past.map(ev => (
              <EventRow key={ev.id} event={ev} onUpdate={handleUpdate} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
