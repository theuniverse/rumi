import { useState, useEffect, useCallback, useMemo } from "react";
import { Calendar, Clock, MapPin, Music, Disc, Trash2, ChevronDown, Play } from "lucide-react";
import {
  Session, Recording, Tag,
  getSessions, getRecordingsForSession, getTagsForRecording,
  deleteSession, deleteRecording,
} from "../lib/api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useAudioPlayer } from "../contexts/AudioPlayerContext";

interface RecordingWithTags extends Recording { tags: Tag[] }
interface SessionWithRecordings extends Session { recordings: RecordingWithTags[] }

// ── DJ-day helpers ─────────────────────────────────────────────────────────────
// "DJ day" = 06:00 today → 05:59 tomorrow (all in local time)
function getDJDay(iso: string): string {
  const d = new Date(iso.replace(" ", "T") + "Z");
  // If local hour is before 6 AM, it belongs to the previous calendar day
  if (d.getHours() < 6) d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDJDay(dayStr: string): string {
  const d = new Date(dayStr + "T12:00:00"); // noon avoids DST edge cases
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  const [y, m, day] = dayStr.split("-");
  return `${y}/${m}/${day}, ${weekday}`;
}

/** Returns true if the session time is in the 00:00–05:59 window (past midnight) */
function isPastMidnight(iso: string): boolean {
  const h = new Date(iso.replace(" ", "T") + "Z").getHours();
  return h < 6;
}

function formatTime(iso: string): string {
  return new Date(iso.replace(" ", "T") + "Z").toLocaleTimeString("zh-CN", {
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function BpmBadge({ avg, min, max }: { avg: number | null; min: number | null; max: number | null }) {
  if (!avg) return null;
  return (
    <span className="text-xs font-mono text-ghost">
      {avg} <span className="text-faint">bpm</span>
      {min && max && <span className="text-faint ml-1">({min}–{max})</span>}
    </span>
  );
}

function TagPills({ tags }: { tags: Tag[] }) {
  if (!tags.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span
          key={t.id}
          className="px-1.5 py-0.5 rounded text-[10px] border"
          style={{
            borderColor: (t.color ?? "#8a8a8a") + "55",
            color: t.color ?? "#8a8a8a",
            background: (t.color ?? "#8a8a8a") + "18",
          }}
        >
          {t.name}
        </span>
      ))}
    </div>
  );
}

// ── Filter select ──────────────────────────────────────────────────────────────
function FilterSelect({
  label, value, onChange, children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative inline-flex items-center">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none pl-2.5 pr-7 py-1.5 rounded bg-surface border border-rim text-ghost text-xs focus:outline-none focus:border-muted hover:border-muted transition-colors cursor-pointer"
      >
        <option value="">{label}: All</option>
        {children}
      </select>
      <ChevronDown size={11} className="pointer-events-none absolute right-2 text-faint" />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Sessions() {
  const [sessions, setSessions] = useState<SessionWithRecordings[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedVenueId, setSelectedVenueId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: "session"; id: number }
    | { kind: "recording"; id: number }
    | null
  >(null);
  const { playTrack } = useAudioPlayer();

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await getSessions();
      const enriched = await Promise.all(
        raw.map(async (s) => {
          const recs = await getRecordingsForSession(s.id);
          const recordings = await Promise.all(
            recs.map(async (r) => ({ ...r, tags: await getTagsForRecording(r.id) }))
          );
          return { ...s, recordings };
        })
      );
      setSessions(enriched);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // ── Filter options derived from full dataset ───────────────────────────────
  const allDJDays = useMemo(() => {
    const days = [...new Set(sessions.map((s) => getDJDay(s.started_at)))];
    return days.sort().reverse(); // newest first
  }, [sessions]);

  const allVenues = useMemo(() => {
    const map = new Map<string, string>();
    sessions.forEach((s) => {
      if (s.venue_id != null && s.venue_name) map.set(String(s.venue_id), s.venue_name);
    });
    return [...map.entries()]; // [id, name]
  }, [sessions]);

  // ── Filtered + grouped ────────────────────────────────────────────────────
  const groups = useMemo(() => {
    const filtered = sessions.filter((s) => {
      if (selectedDay && getDJDay(s.started_at) !== selectedDay) return false;
      if (selectedVenueId && String(s.venue_id) !== selectedVenueId) return false;
      return true;
    });

    const map = new Map<string, SessionWithRecordings[]>();
    filtered.forEach((s) => {
      const day = getDJDay(s.started_at);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(s);
    });

    return [...map.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([day, daysSessions]) => ({ day, sessions: daysSessions }));
  }, [sessions, selectedDay, selectedVenueId]);

  // ── Delete handler ────────────────────────────────────────────────────────
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === "session") {
      await deleteSession(deleteTarget.id).catch(() => {});
    } else {
      await deleteRecording(deleteTarget.id).catch(() => {});
    }
    setDeleteTarget(null);
    loadSessions();
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto px-8 py-16">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-soft tracking-tight mb-1">Sessions</h1>
        <p className="text-ghost text-sm">Past nights, by date and place.</p>
      </div>

      {/* Filter bar */}
      {!loading && sessions.length > 0 && (
        <div className="flex items-center gap-2 mb-8 flex-wrap">
          <FilterSelect label="Date" value={selectedDay} onChange={setSelectedDay}>
            {allDJDays.map((d) => (
              <option key={d} value={d}>{formatDJDay(d)}</option>
            ))}
          </FilterSelect>

          {allVenues.length > 0 && (
            <FilterSelect label="Place" value={selectedVenueId} onChange={setSelectedVenueId}>
              {allVenues.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </FilterSelect>
          )}

          {(selectedDay || selectedVenueId) && (
            <button
              onClick={() => { setSelectedDay(""); setSelectedVenueId(""); }}
              className="text-xs text-ghost hover:text-soft transition-colors underline underline-offset-2"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <p className="text-ghost text-sm text-center py-24">Loading…</p>
      )}

      {/* Empty */}
      {!loading && sessions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Calendar size={32} strokeWidth={1} className="text-faint mb-4" />
          <p className="text-ghost text-sm">No sessions yet.</p>
          <p className="text-faint text-xs mt-1">Start a live recording to create your first session.</p>
        </div>
      )}

      {/* No results after filter */}
      {!loading && sessions.length > 0 && groups.length === 0 && (
        <p className="text-ghost text-sm text-center py-16">No sessions match the current filters.</p>
      )}

      {/* Grouped sessions */}
      {!loading && groups.map(({ day, sessions: daySessions }) => (
        <div key={day} className="mb-10">
          {/* Day header */}
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs font-medium text-ghost tracking-wide">
              {formatDJDay(day)}
            </span>
            <div className="flex-1 h-px bg-rim" />
            <span className="text-xs text-faint">
              {daySessions.length} session{daySessions.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Session cards */}
          <div className="space-y-3">
            {daySessions.map((s) => {
              const nextDay = isPastMidnight(s.started_at);
              return (
                <div key={s.id} className="rounded-lg border border-rim overflow-hidden">
                  {/* Session header (no date — shown in group header) */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-surface border-b border-rim">
                    <Clock size={13} className="text-faint shrink-0" />
                    <span className="text-soft text-sm font-medium font-mono">
                      {formatTime(s.started_at)}
                    </span>
                    {nextDay && (
                      <span className="text-[10px] text-faint border border-rim rounded px-1 py-0.5 font-mono">
                        +1 day
                      </span>
                    )}
                    {s.venue_name && (
                      <>
                        <span className="text-faint text-xs">·</span>
                        <span className="flex items-center gap-1 text-ghost text-xs">
                          <MapPin size={10} className="text-faint" />
                          {s.venue_name}
                        </span>
                      </>
                    )}
                    <div className="flex-1" />
                    <span className="text-faint text-xs">
                      {s.recordings.length} rec{s.recordings.length !== 1 ? "s" : ""}
                    </span>
                    <button
                      onClick={() => setDeleteTarget({ kind: "session", id: s.id })}
                      className="text-faint hover:text-red-400 transition-colors ml-1"
                      title="Delete session"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {/* Recordings */}
                  {s.recordings.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-faint italic">No recordings</div>
                  ) : (
                    s.recordings.map((r, i) => (
                      <div
                        key={r.id}
                        className={`px-4 py-3 text-sm group${
                          i < s.recordings.length - 1 ? " border-b border-rim/60" : ""
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <Disc size={13} className="text-faint shrink-0" />
                          <span className="text-ghost text-xs font-mono w-12 shrink-0">
                            {formatTime(r.started_at)}
                          </span>
                          {r.dominant_genre && (
                            <span className="flex items-center gap-1 text-ghost text-xs">
                              <Music size={10} className="text-faint" />
                              {r.dominant_genre}
                            </span>
                          )}
                          <BpmBadge avg={r.avg_bpm} min={r.min_bpm} max={r.max_bpm} />
                          <div className="flex-1" />
                          <TagPills tags={r.tags} />
                          <button
                            onClick={() => setDeleteTarget({ kind: "recording", id: r.id })}
                            className="text-faint hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 ml-1"
                            title="Delete recording"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        {r.audio_url && (
                          <button
                            onClick={() => playTrack(
                              r.audio_url!,
                              r.dominant_genre ?? "Recording",
                              `${formatTime(r.started_at)}${r.avg_bpm ? ` · ${r.avg_bpm} bpm` : ""}`,
                            )}
                            className="mt-2 flex items-center gap-1.5 text-[10px] text-faint hover:text-ghost transition-colors"
                          >
                            <Play size={10} fill="currentColor" strokeWidth={0} />
                            Play recording
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {!loading && groups.length > 0 && (
        <p className="text-xs text-faint">
          {sessions.length} session{sessions.length !== 1 ? "s" : ""} total
          {(selectedDay || selectedVenueId) && ` · ${groups.reduce((n, g) => n + g.sessions.length, 0)} shown`}
        </p>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget?.kind === "session" ? "Delete session" : "Delete recording"}
        message={
          deleteTarget?.kind === "session"
            ? "This session and all its recordings will be permanently deleted."
            : "This recording will be permanently deleted."
        }
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
