import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, ChevronLeft, RefreshCw } from "lucide-react";
import clsx from "clsx";
import { scraperApi, ExtractedEventSummary } from "../../lib/scraper-api";

const PAGE_SIZE = 50;

function InfoLevelBadge({ level }: { level: number }) {
  const cfg = [
    "",
    "text-amber-400 bg-amber-400/10 border-amber-400/30",
    "text-blue-400 bg-blue-400/10 border-blue-400/30",
    "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
  ];
  const labels = ["", "L1", "L2", "L3"];
  return (
    <span className={clsx("px-1.5 py-0.5 rounded text-[10px] border shrink-0", cfg[level] ?? cfg[1])}>
      {labels[level] ?? level}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    tba:      "text-ghost border-rim",
    partial:  "text-amber-400 bg-amber-400/10 border-amber-400/30",
    complete: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
  };
  return <span className={clsx("px-1.5 py-0.5 rounded text-[10px] border shrink-0", cfg[status] ?? cfg.tba)}>{status}</span>;
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-1.5 w-20">
      <div className="flex-1 h-1 bg-rim rounded-full overflow-hidden">
        <div className={clsx("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-faint text-[10px] w-6 text-right">{pct}%</span>
    </div>
  );
}

export default function ScraperEvents() {
  const navigate = useNavigate();
  const [events, setEvents]   = useState<ExtractedEventSummary[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [rematching, setRematching] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState("");
  const [offset, setOffset]             = useState(0);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await scraperApi.getEvents({
        status: filterStatus || undefined,
        limit: PAGE_SIZE,
        offset,
      });
      setEvents(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function rematchAll() {
    if (!confirm('Re-match all events? This will update artist/venue matches for all events.')) {
      return;
    }

    setRematching(true);
    try {
      const result = await scraperApi.rematchAllEvents({
        status_filter: filterStatus || undefined,
        limit: 100
      });
      alert(`Rematch complete!\nMatched: ${result.matched_count}/${result.total_events} events\nErrors: ${result.errors.length}`);
      // Reload events to see updated data
      await load();
    } catch (e) {
      alert(`Rematch failed: ${e}`);
    } finally {
      setRematching(false);
    }
  }

  useEffect(() => { setOffset(0); }, [filterStatus]);
  useEffect(() => { load(); }, [filterStatus, offset]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-soft text-lg font-semibold">Extracted Events</h1>
          <p className="text-ghost text-sm">{total} events parsed by LLM</p>
        </div>
        <button
          onClick={rematchAll}
          disabled={rematching || loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded border border-rim text-ghost text-xs hover:text-soft hover:border-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={rematching ? "animate-spin" : ""} />
          {rematching ? 'Rematching...' : 'Rematch All'}
        </button>
      </div>

      {error && (
        <div className="bg-red-400/10 border border-red-400/30 rounded-lg p-3 text-red-400 text-sm">{error}</div>
      )}

      {/* Filters */}
      <div className="flex gap-2">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-elevated border border-rim rounded px-2.5 py-1.5 text-ghost text-xs focus:outline-none"
        >
          <option value="">All statuses</option>
          <option value="tba">tba</option>
          <option value="partial">partial</option>
          <option value="complete">complete</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-rim overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-elevated border-b border-rim">
            <tr>
              <th className="text-left px-3 py-2 text-ghost font-normal">Event</th>
              <th className="text-left px-3 py-2 text-ghost font-normal">Date</th>
              <th className="text-left px-3 py-2 text-ghost font-normal">Venue / City</th>
              <th className="text-left px-3 py-2 text-ghost font-normal">Level</th>
              <th className="text-left px-3 py-2 text-ghost font-normal">Status</th>
              <th className="text-left px-3 py-2 text-ghost font-normal">Confidence</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="text-center text-ghost py-8">Loading…</td></tr>
            )}
            {!loading && events.length === 0 && (
              <tr><td colSpan={7} className="text-center text-faint py-8">No events found.</td></tr>
            )}
            {events.map((e) => (
              <tr
                key={e.id}
                onClick={() => e.page_id && navigate(`/scraper/pages/${e.page_id}`)}
                className="border-t border-rim hover:bg-elevated/40 cursor-pointer transition-colors"
              >
                <td className="px-3 py-2.5 text-soft max-w-[200px] truncate">{e.event_name ?? "—"}</td>
                <td className="px-3 py-2.5 text-ghost font-mono whitespace-nowrap">{e.event_date ?? "—"}</td>
                <td className="px-3 py-2.5 text-ghost truncate max-w-[150px]">
                  {[e.venue, e.city].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="px-3 py-2.5"><InfoLevelBadge level={e.info_level} /></td>
                <td className="px-3 py-2.5"><StatusBadge status={e.status} /></td>
                <td className="px-3 py-2.5"><ConfidenceBar value={e.confidence} /></td>
                <td className="px-3 py-2.5 text-ghost"><ChevronRight size={13} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0}
            className="p-1.5 rounded border border-rim text-ghost hover:text-soft disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-ghost text-xs">{currentPage} / {totalPages}</span>
          <button
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={offset + PAGE_SIZE >= total}
            className="p-1.5 rounded border border-rim text-ghost hover:text-soft disabled:opacity-30 transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
