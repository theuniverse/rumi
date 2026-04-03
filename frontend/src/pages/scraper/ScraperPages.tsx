import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, ChevronLeft } from "lucide-react";
import clsx from "clsx";
import { scraperApi, ScrapedPage, Source } from "../../lib/scraper-api";

const STATUS_CFG: Record<string, string> = {
  new:             "text-sky-400 bg-sky-400/10 border-sky-400/30",
  pending_extract: "text-amber-400 bg-amber-400/10 border-amber-400/30",
  extracting:      "text-purple-400 bg-purple-400/10 border-purple-400/30",
  done:            "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
  error:           "text-red-400 bg-red-400/10 border-red-400/30",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={clsx("px-1.5 py-0.5 rounded text-[10px] border shrink-0", STATUS_CFG[status] ?? "text-ghost border-rim")}>
      {status}
    </span>
  );
}

const PAGE_SIZE = 50;

export default function ScraperPages() {
  const navigate = useNavigate();
  const [pages, setPages]     = useState<ScrapedPage[]>([]);
  const [total, setTotal]     = useState(0);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [filterSource, setFilterSource] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [offset, setOffset]             = useState(0);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [p, s] = await Promise.all([
        scraperApi.getPages({
          source_id: filterSource ? Number(filterSource) : undefined,
          status: filterStatus || undefined,
          limit: PAGE_SIZE,
          offset,
        }),
        scraperApi.getSources(),
      ]);
      setPages(p.items);
      setTotal(p.total);
      setSources(s.items);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { setOffset(0); }, [filterSource, filterStatus]);
  useEffect(() => { load(); }, [filterSource, filterStatus, offset]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-soft text-lg font-semibold">Scraped Pages</h1>
          <p className="text-ghost text-sm">{total} total articles fetched</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-400/10 border border-red-400/30 rounded-lg p-3 text-red-400 text-sm">{error}</div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
          className="bg-elevated border border-rim rounded px-2.5 py-1.5 text-ghost text-xs focus:outline-none"
        >
          <option value="">All sources</option>
          {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-elevated border border-rim rounded px-2.5 py-1.5 text-ghost text-xs focus:outline-none"
        >
          <option value="">All statuses</option>
          <option value="new">new</option>
          <option value="pending_extract">pending_extract</option>
          <option value="done">done</option>
          <option value="error">error</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-rim overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-elevated border-b border-rim">
            <tr>
              <th className="text-left px-3 py-2 text-ghost font-normal">Source</th>
              <th className="text-left px-3 py-2 text-ghost font-normal">URL</th>
              <th className="text-left px-3 py-2 text-ghost font-normal">Status</th>
              <th className="text-left px-3 py-2 text-ghost font-normal">Fetched</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="text-center text-ghost py-8">Loading…</td></tr>
            )}
            {!loading && pages.length === 0 && (
              <tr><td colSpan={5} className="text-center text-faint py-8">No pages found.</td></tr>
            )}
            {pages.map((p) => (
              <tr
                key={p.id}
                onClick={() => navigate(`/scraper/pages/${p.id}`)}
                className="border-t border-rim hover:bg-elevated/40 cursor-pointer transition-colors"
              >
                <td className="px-3 py-2.5 text-ghost truncate max-w-[120px]">{p.source_name}</td>
                <td className="px-3 py-2.5 text-soft font-mono truncate max-w-[280px]">
                  <span title={p.url}>{p.url.replace(/^https?:\/\//, "").slice(0, 60)}</span>
                </td>
                <td className="px-3 py-2.5"><StatusBadge status={p.status} /></td>
                <td className="px-3 py-2.5 text-faint whitespace-nowrap">
                  {new Date(p.fetched_at).toLocaleString()}
                </td>
                <td className="px-3 py-2.5 text-ghost">
                  <ChevronRight size={13} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
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
