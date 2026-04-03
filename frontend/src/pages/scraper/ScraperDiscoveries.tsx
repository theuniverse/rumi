import { useEffect, useState } from "react";
import { Check, X, Eye } from "lucide-react";
import clsx from "clsx";
import { scraperApi, DiscoveryItem } from "../../lib/scraper-api";

function TypeBadge({ type }: { type: string }) {
  const cfg: Record<string, string> = {
    venue:  "text-blue-400 bg-blue-400/10 border-blue-400/30",
    artist: "text-purple-400 bg-purple-400/10 border-purple-400/30",
    label:  "text-amber-400 bg-amber-400/10 border-amber-400/30",
  };
  return <span className={clsx("px-1.5 py-0.5 rounded text-[10px] border", cfg[type] ?? "text-ghost border-rim")}>{type}</span>;
}

export default function ScraperDiscoveries() {
  const [items, setItems] = useState<DiscoveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("pending");

  // Accept modal state
  const [acceptId, setAcceptId] = useState<number | null>(null);
  const [acceptForm, setAcceptForm] = useState({ name: "", aliases: [] as string[], type: "", city: "", followed: false });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await scraperApi.getDiscoveries(filterStatus || undefined);
      setItems(res.items);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filterStatus]);

  function startAccept(d: DiscoveryItem) {
    setAcceptId(d.id);
    setAcceptForm({
      name: d.raw_name,
      aliases: [],
      type: d.entity_type === "venue" ? "club" : d.entity_type === "artist" ? "dj" : "promoter",
      city: "",
      followed: false,
    });
  }

  async function confirmAccept() {
    if (!acceptId) return;
    await scraperApi.acceptDiscovery(acceptId, acceptForm);
    setAcceptId(null);
    load();
  }

  async function ignore(id: number) {
    await scraperApi.ignoreDiscovery(id);
    load();
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
      <div>
        <h1 className="text-soft text-lg font-semibold">Discoveries</h1>
        <p className="text-ghost text-sm">Scraper 在提取事件时发现的未知实体，审核后可加入参考数据</p>
      </div>

      {error && (
        <div className="bg-red-400/10 border border-red-400/30 rounded-lg p-3 text-red-400 text-sm">{error}</div>
      )}

      <div className="flex gap-2">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-elevated border border-rim rounded px-2.5 py-1.5 text-ghost text-xs focus:outline-none"
        >
          <option value="pending">Pending</option>
          <option value="accepted">Accepted</option>
          <option value="ignored">Ignored</option>
          <option value="">All</option>
        </select>
      </div>

      <div className="rounded-lg border border-rim overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-elevated border-b border-rim">
            <tr>
              <th className="text-left px-3 py-2 text-ghost font-normal">Name</th>
              <th className="text-left px-3 py-2 text-ghost font-normal">Type</th>
              <th className="text-left px-3 py-2 text-ghost font-normal">Frequency</th>
              <th className="text-left px-3 py-2 text-ghost font-normal">First Seen</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="text-center text-ghost py-8">Loading...</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={5} className="text-center text-faint py-8">No discoveries.</td></tr>}
            {items.map((d) => (
              <tr key={d.id} className="border-t border-rim hover:bg-elevated/30 transition-colors">
                <td className="px-3 py-2.5 text-soft">{d.raw_name}</td>
                <td className="px-3 py-2.5"><TypeBadge type={d.entity_type} /></td>
                <td className="px-3 py-2.5 text-ghost font-mono">{d.frequency}x</td>
                <td className="px-3 py-2.5 text-ghost whitespace-nowrap">
                  {d.first_seen_at ? new Date(d.first_seen_at).toLocaleDateString() : "--"}
                </td>
                <td className="px-3 py-2.5">
                  {d.status === "pending" ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => startAccept(d)} title="Accept" className="p-1 rounded hover:bg-emerald-400/10 text-ghost hover:text-emerald-400"><Check size={12} /></button>
                      <button onClick={() => ignore(d.id)} title="Ignore" className="p-1 rounded hover:bg-red-400/10 text-ghost hover:text-red-400"><X size={12} /></button>
                    </div>
                  ) : (
                    <span className={clsx("text-[10px]", d.status === "accepted" ? "text-emerald-400" : "text-faint")}>{d.status}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Accept modal */}
      {acceptId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setAcceptId(null)}>
          <div className="bg-surface border border-rim rounded-lg p-5 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-soft text-sm font-semibold">Accept as reference data</h3>
            <div className="space-y-2 text-xs">
              <div>
                <label className="text-ghost block mb-1">Name</label>
                <input
                  value={acceptForm.name}
                  onChange={(e) => setAcceptForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full bg-elevated border border-rim rounded px-2.5 py-1.5 text-soft focus:outline-none focus:border-ghost"
                />
              </div>
              <div>
                <label className="text-ghost block mb-1">Type</label>
                <select
                  value={acceptForm.type}
                  onChange={(e) => setAcceptForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full bg-elevated border border-rim rounded px-2.5 py-1.5 text-ghost focus:outline-none"
                >
                  <option value="club">club</option>
                  <option value="venue">venue</option>
                  <option value="other">other</option>
                  <option value="dj">dj</option>
                  <option value="musician">musician</option>
                  <option value="promoter">promoter</option>
                  <option value="record_label">record_label</option>
                </select>
              </div>
              <div>
                <label className="text-ghost block mb-1">City</label>
                <input
                  value={acceptForm.city}
                  onChange={(e) => setAcceptForm((f) => ({ ...f, city: e.target.value }))}
                  placeholder="Optional"
                  className="w-full bg-elevated border border-rim rounded px-2.5 py-1.5 text-soft focus:outline-none focus:border-ghost"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setAcceptId(null)} className="px-3 py-1.5 rounded border border-rim text-ghost hover:text-soft text-xs">Cancel</button>
              <button onClick={confirmAccept} disabled={!acceptForm.name} className="px-3 py-1.5 rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30 text-xs disabled:opacity-30">Accept</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
