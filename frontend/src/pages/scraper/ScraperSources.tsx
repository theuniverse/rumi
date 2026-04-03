import { useEffect, useRef, useState } from "react";
import { Plus, Pencil, Trash2, Check, X, ToggleLeft, ToggleRight, FlaskConical, Loader, ExternalLink } from "lucide-react";
import clsx from "clsx";
import { scraperApi, Source, SourceCreate, TestFetchResult, WeWeAccount } from "../../lib/scraper-api";

const EMPTY_FORM: SourceCreate = { name: "", feed_path: "", keywords: [], city: "", active: true };

// WeWeRSS UI is served on port 4000 of whatever host this app is running on
const WEWE_RSS_URL = `${window.location.protocol}//${window.location.hostname}:4000`;

function KeywordInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [raw, setRaw] = useState(value.join(", "));
  return (
    <input
      type="text"
      value={raw}
      placeholder="party, lineup, event"
      onChange={(e) => {
        setRaw(e.target.value);
        onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean));
      }}
      className="w-full bg-surface border border-rim rounded px-2.5 py-1.5 text-soft text-xs focus:outline-none focus:border-ghost"
    />
  );
}

function TestResultPanel({ result }: { result: TestFetchResult }) {
  return (
    <tr>
      <td colSpan={6} className="px-0 py-0">
        <div className={clsx(
          "mx-3 mb-3 rounded-lg border p-3 text-xs space-y-2",
          result.ok
            ? "border-emerald-400/20 bg-emerald-400/5"
            : "border-red-400/20 bg-red-400/5",
        )}>
          {/* Header */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={clsx(
              "px-1.5 py-0.5 rounded border text-[10px]",
              result.ok
                ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/30"
                : "text-red-400 bg-red-400/10 border-red-400/30",
            )}>
              {result.ok ? `${result.articles_found} articles found` : "fetch failed"}
            </span>
            <span className="text-faint font-mono truncate">{result.feed_url}</span>
          </div>

          {/* Error */}
          {!result.ok && result.error && (
            <p className="text-red-400">{result.error}</p>
          )}

          {/* Article list */}
          {result.ok && result.articles.length === 0 && (
            <p className="text-faint">No articles matched the keyword filter.</p>
          )}
          {result.articles.map((a, i) => (
            <div key={i} className="border border-rim rounded px-2.5 py-2 space-y-1 bg-surface">
              <div className="flex items-start gap-2">
                <span className="text-soft flex-1 leading-snug">{a.title || "(no title)"}</span>
                {a.keyword_matched && (
                  <span className="px-1.5 py-0.5 rounded border border-blue-400/30 text-blue-400 bg-blue-400/10 text-[10px] shrink-0">
                    {a.keyword_matched}
                  </span>
                )}
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-faint hover:text-ghost transition-colors shrink-0"
                >
                  <ExternalLink size={11} />
                </a>
              </div>
              {a.content_preview && (
                <p className="text-faint leading-relaxed line-clamp-2">{a.content_preview}</p>
              )}
            </div>
          ))}
          {result.ok && result.articles_found > 10 && (
            <p className="text-faint text-[10px]">Showing first 10 of {result.articles_found} articles.</p>
          )}
        </div>
      </td>
    </tr>
  );
}

function SourceRow({
  source,
  isTesting,
  testResult,
  onEdit,
  onToggle,
  onDelete,
  onTest,
}: {
  source: Source;
  isTesting: boolean;
  testResult: TestFetchResult | null;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onTest: () => void;
}) {
  return (
    <>
      <tr className="border-t border-rim hover:bg-elevated/30 transition-colors text-xs">
        <td className="px-3 py-2.5 text-soft">{source.name}</td>
        <td className="px-3 py-2.5 text-ghost font-mono truncate max-w-[200px]">{source.feed_path}</td>
        <td className="px-3 py-2.5 text-ghost">{source.city || "—"}</td>
        <td className="px-3 py-2.5">
          <div className="flex flex-wrap gap-1">
            {source.keywords.length === 0
              ? <span className="text-faint">—</span>
              : source.keywords.map((k) => (
                  <span key={k} className="px-1.5 py-0.5 rounded border border-rim text-ghost text-[10px]">{k}</span>
                ))
            }
          </div>
        </td>
        <td className="px-3 py-2.5">
          <button onClick={onToggle} className="text-ghost hover:text-soft transition-colors">
            {source.active
              ? <ToggleRight size={16} className="text-emerald-400" />
              : <ToggleLeft size={16} className="text-faint" />
            }
          </button>
        </td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1">
            <button
              onClick={onTest}
              title="Test fetch"
              className={clsx(
                "p-1 rounded transition-colors",
                testResult
                  ? "bg-blue-400/10 text-blue-400 hover:bg-blue-400/20"
                  : "hover:bg-elevated text-ghost hover:text-soft",
              )}
            >
              {isTesting
                ? <Loader size={12} className="animate-spin" />
                : <FlaskConical size={12} />
              }
            </button>
            <button onClick={onEdit} className="p-1 rounded hover:bg-elevated text-ghost hover:text-soft transition-colors">
              <Pencil size={12} />
            </button>
            <button onClick={onDelete} className="p-1 rounded hover:bg-red-400/10 text-ghost hover:text-red-400 transition-colors">
              <Trash2 size={12} />
            </button>
          </div>
        </td>
      </tr>
      {testResult && <TestResultPanel result={testResult} />}
    </>
  );
}

function FeedPathCombobox({
  value,
  accounts,
  onChange,
  onSelectAccount,
}: {
  value: string;
  accounts: WeWeAccount[];
  onChange: (v: string) => void;
  onSelectAccount: (a: WeWeAccount) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const query = value.toLowerCase();
  const filtered = accounts.filter(
    (a) =>
      a.name.toLowerCase().includes(query) ||
      a.id.toLowerCase().includes(query) ||
      a.feed_path.toLowerCase().includes(query),
  );

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={accounts.length ? "输入名称搜索或直接填写路径…" : "/feeds/Gh_xxxxxxxx.xml"}
        className="w-full bg-surface border border-rim rounded px-2.5 py-1.5 text-soft font-mono text-xs focus:outline-none focus:border-ghost"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full mt-0.5 left-0 right-0 max-h-48 overflow-y-auto rounded border border-rim bg-surface shadow-lg">
          {filtered.map((a) => (
            <button
              key={a.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelectAccount(a);
                setOpen(false);
              }}
              className="w-full text-left px-2.5 py-1.5 hover:bg-elevated flex items-center gap-2 border-b border-rim/50 last:border-0"
            >
              <span className="text-soft text-xs truncate flex-1">{a.name}</span>
              <span className="text-faint font-mono text-[10px] shrink-0">{a.id}</span>
            </button>
          ))}
        </div>
      )}
      {open && accounts.length > 0 && filtered.length === 0 && (
        <div className="absolute z-50 top-full mt-0.5 left-0 right-0 rounded border border-rim bg-surface shadow-lg px-2.5 py-2 text-faint text-xs">
          无匹配账号，将使用手动输入的路径
        </div>
      )}
    </div>
  );
}

function SourceForm({
  initial,
  accounts,
  onSave,
  onCancel,
}: {
  initial: SourceCreate;
  accounts: WeWeAccount[];
  onSave: (v: SourceCreate) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<SourceCreate>(initial);

  function set<K extends keyof SourceCreate>(k: K, v: SourceCreate[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function selectAccount(a: WeWeAccount) {
    setForm((f) => ({
      ...f,
      feed_path: a.feed_path,
      name: f.name || a.name,   // only fill name if still empty
    }));
  }

  return (
    <tr className="border-t border-rim bg-elevated/50 text-xs">
      <td className="px-3 py-2">
        <input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Source name"
          className="w-full bg-surface border border-rim rounded px-2.5 py-1.5 text-soft text-xs focus:outline-none focus:border-ghost"
        />
      </td>
      <td className="px-3 py-2">
        <FeedPathCombobox
          value={form.feed_path}
          accounts={accounts}
          onChange={(v) => set("feed_path", v)}
          onSelectAccount={selectAccount}
        />
      </td>
      <td className="px-3 py-2">
        <input
          value={form.city}
          onChange={(e) => set("city", e.target.value)}
          placeholder="City"
          className="w-full bg-surface border border-rim rounded px-2.5 py-1.5 text-soft text-xs focus:outline-none focus:border-ghost"
        />
      </td>
      <td className="px-3 py-2">
        <KeywordInput value={form.keywords} onChange={(v) => set("keywords", v)} />
      </td>
      <td className="px-3 py-2">
        <button onClick={() => set("active", !form.active)} className="text-ghost">
          {form.active ? <ToggleRight size={16} className="text-emerald-400" /> : <ToggleLeft size={16} className="text-faint" />}
        </button>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onSave(form)}
            disabled={!form.name || !form.feed_path}
            className="p-1 rounded hover:bg-emerald-400/10 text-ghost hover:text-emerald-400 transition-colors disabled:opacity-30"
          >
            <Check size={13} />
          </button>
          <button onClick={onCancel} className="p-1 rounded hover:bg-elevated text-ghost hover:text-soft transition-colors">
            <X size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function ScraperSources() {
  const [sources, setSources]     = useState<Source[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [adding, setAdding]       = useState(false);
  const [editId, setEditId]       = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, TestFetchResult>>({});
  const [weweAccounts, setWeweAccounts] = useState<WeWeAccount[]>([]);

  async function load() {
    setLoading(true);
    try {
      const res = await scraperApi.getSources();
      setSources(res.items);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadWeweAccounts() {
    try {
      const res = await scraperApi.getWeWeAccounts();
      if (res.ok) setWeweAccounts(res.accounts);
    } catch {
      // WeWeRSS might not be running — silently ignore
    }
  }

  useEffect(() => {
    load();
    loadWeweAccounts();
  }, []);

  async function handleCreate(form: SourceCreate) {
    await scraperApi.createSource(form);
    setAdding(false);
    load();
  }

  async function handleUpdate(id: number, form: SourceCreate) {
    await scraperApi.updateSource(id, form);
    setEditId(null);
    load();
  }

  async function handleToggle(source: Source) {
    await scraperApi.updateSource(source.id, { active: !source.active });
    load();
  }

  async function handleDelete(id: number) {
    if (!confirm("Deactivate this source?")) return;
    await scraperApi.deleteSource(id);
    load();
  }

  async function handleTest(id: number) {
    if (testResults[id] && testingId !== id) {
      setTestResults((prev) => { const next = { ...prev }; delete next[id]; return next; });
      return;
    }
    setTestingId(id);
    try {
      const result = await scraperApi.testSource(id);
      setTestResults((prev) => ({ ...prev, [id]: result }));
    } catch (e) {
      setTestResults((prev) => ({
        ...prev,
        [id]: { source_name: "", feed_url: "", ok: false, articles_found: 0, articles: [], error: String(e) },
      }));
    } finally {
      setTestingId(null);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-soft text-lg font-semibold">RSS Sources</h1>
          <p className="text-ghost text-sm">公众号订阅源，通过 WeWeRSS 转换为 RSS</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={WEWE_RSS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-rim text-ghost hover:text-soft hover:bg-elevated text-xs transition-colors"
            title={`打开 WeWeRSS 管理界面 (${WEWE_RSS_URL})`}
          >
            <ExternalLink size={12} />
            WeWeRSS
          </a>
          {!adding && (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-rim text-ghost hover:text-soft hover:bg-elevated text-xs transition-colors"
            >
              <Plus size={13} />
              Add source
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-400/10 border border-red-400/30 rounded-lg p-3 text-red-400 text-sm">{error}</div>
      )}

      <div className="rounded-lg border border-rim overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-elevated border-b border-rim">
            <tr>
              <th className="text-left px-3 py-2 text-ghost font-normal">Name</th>
              <th className="text-left px-3 py-2 text-ghost font-normal">Feed Path</th>
              <th className="text-left px-3 py-2 text-ghost font-normal">City</th>
              <th className="text-left px-3 py-2 text-ghost font-normal">Keywords</th>
              <th className="px-3 py-2 text-ghost font-normal">Active</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {adding && (
              <SourceForm
                initial={EMPTY_FORM}
                accounts={weweAccounts}
                onSave={handleCreate}
                onCancel={() => setAdding(false)}
              />
            )}
            {loading && sources.length === 0 && (
              <tr><td colSpan={6} className="text-center text-ghost py-8">Loading…</td></tr>
            )}
            {!loading && sources.length === 0 && !adding && (
              <tr>
                <td colSpan={6} className="text-center py-10 space-y-2">
                  <p className="text-faint">还没有订阅源。</p>
                  <p className="text-faint text-[11px]">
                    先去{" "}
                    <a href={WEWE_RSS_URL} target="_blank" rel="noopener noreferrer"
                       className="underline hover:text-ghost">
                      WeWeRSS
                    </a>
                    {" "}订阅公众号，再在这里添加对应的 Feed Path。
                  </p>
                </td>
              </tr>
            )}
            {sources.map((s) =>
              editId === s.id ? (
                <SourceForm
                  key={s.id}
                  initial={{ name: s.name, feed_path: s.feed_path, keywords: s.keywords, city: s.city, active: s.active }}
                  accounts={weweAccounts}
                  onSave={(form) => handleUpdate(s.id, form)}
                  onCancel={() => setEditId(null)}
                />
              ) : (
                <SourceRow
                  key={s.id}
                  source={s}
                  isTesting={testingId === s.id}
                  testResult={testResults[s.id] ?? null}
                  onEdit={() => setEditId(s.id)}
                  onToggle={() => handleToggle(s)}
                  onDelete={() => handleDelete(s.id)}
                  onTest={() => handleTest(s.id)}
                />
              )
            )}
          </tbody>
        </table>
      </div>

      <div className="text-faint text-xs space-y-1">
        <p>
          Feed Path 示例：<code className="font-mono">/feeds/Gh_xxxxxxxx.xml</code>
          （mpId 在 WeWeRSS 订阅列表中可以看到）
        </p>
        <p>
          Keywords 过滤文章标题/摘要，留空则抓取全部。
          点 <FlaskConical size={10} className="inline" /> 可实时预览抓取结果。
        </p>
      </div>
    </div>
  );
}
