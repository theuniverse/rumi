import { useEffect, useState } from "react";
import { Eye, EyeOff, Save, RotateCcw, CheckCircle2, AlertCircle, Loader } from "lucide-react";
import clsx from "clsx";
import { scraperApi, type ScraperSettings as ScraperSettingsData, SettingsUpdate } from "../../lib/scraper-api";

// Preset models available on OpenRouter — confirmed accessible
const MODEL_OPTIONS = [
  { value: "qwen/qwen3.5-9b",             label: "Qwen 3.5 9B (default · $0.05/1M · 256K ctx)" },
  { value: "qwen/qwen3-8b",               label: "Qwen3 8B ($0.05/1M · 40K ctx)" },
  { value: "qwen/qwen-2.5-7b-instruct",   label: "Qwen 2.5 7B ($0.04/1M · 32K ctx)" },
  { value: "qwen/qwen-2.5-72b-instruct",  label: "Qwen 2.5 72B ($0.12/1M · best quality)" },
  { value: "deepseek/deepseek-chat",       label: "DeepSeek Chat ($0.27/1M)" },
];

function SourceBadge({ source }: { source: "db" | "env" | "unset" }) {
  if (source === "db")
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-400/30 bg-emerald-400/10 text-emerald-400">
        DB override
      </span>
    );
  if (source === "env")
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded border border-sky-400/30 bg-sky-400/10 text-sky-400">
        from .env
      </span>
    );
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-400/30 bg-amber-400/10 text-amber-400">
      not set
    </span>
  );
}

function SectionCard({
  title,
  description,
  children,
  onSave,
  saving,
  saved,
  dirty,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  dirty: boolean;
}) {
  return (
    <div className="rounded-xl border border-rim bg-surface overflow-hidden">
      <div className="px-5 py-4 border-b border-rim">
        <h2 className="text-soft font-medium text-sm">{title}</h2>
        <p className="text-ghost text-xs mt-0.5">{description}</p>
      </div>
      <div className="px-5 py-4 space-y-4">
        {children}
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-faint">
            {saved && (
              <span className="flex items-center gap-1 text-emerald-400">
                <CheckCircle2 size={12} /> Saved
              </span>
            )}
          </span>
          <button
            onClick={onSave}
            disabled={saving || !dirty}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors",
              dirty
                ? "bg-sand/90 hover:bg-sand text-black"
                : "bg-elevated text-ghost cursor-not-allowed",
            )}
          >
            {saving ? <Loader size={12} className="animate-spin" /> : <Save size={12} />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-soft font-medium">
        {label}
        {hint && <span className="ml-2 text-ghost font-normal">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

export default function ScraperSettings() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ScraperSettingsData | null>(null);

  // API key section state
  const [newKey, setNewKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [keySaving, setKeySaving] = useState(false);
  const [keySaved, setKeySaved] = useState(false);

  // Models section state
  const [classify, setClassify] = useState("");
  const [extract, setExtract] = useState("");
  const [diff, setDiff] = useState("");
  const [modelSaving, setModelSaving] = useState(false);
  const [modelSaved, setModelSaved] = useState(false);

  // RSSHub section state
  const [rsshub, setRsshub] = useState("");
  const [rssSaving, setRssSaving] = useState(false);
  const [rssSaved, setRssSaved] = useState(false);

  // WeWeRSS auth code state
  const [newWeweCode, setNewWeweCode] = useState("");
  const [showWeweCode, setShowWeweCode] = useState(false);
  const [weweSaving, setWeweSaving] = useState(false);
  const [weweSaved, setWeweSaved] = useState(false);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const s = await scraperApi.getSettings();
      setData(s);
      setClassify(s.model_classify);
      setExtract(s.model_extract);
      setDiff(s.model_diff);
      setRsshub(s.rsshub_base);
      setNewKey("");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function saveKey() {
    if (!newKey.trim()) return;
    setKeySaving(true);
    try {
      await scraperApi.updateSettings({ openrouter_api_key: newKey.trim() });
      setKeySaved(true);
      setNewKey("");
      await load();
      setTimeout(() => setKeySaved(false), 3000);
    } finally {
      setKeySaving(false);
    }
  }

  async function saveModels() {
    setModelSaving(true);
    try {
      await scraperApi.updateSettings({ model_classify: classify, model_extract: extract, model_diff: diff });
      setModelSaved(true);
      setTimeout(() => setModelSaved(false), 3000);
    } finally {
      setModelSaving(false);
    }
  }

  async function saveRss() {
    setRssSaving(true);
    try {
      await scraperApi.updateSettings({ rsshub_base: rsshub.trim() });
      setRssSaved(true);
      setTimeout(() => setRssSaved(false), 3000);
    } finally {
      setRssSaving(false);
    }
  }

  async function saveWeweCode() {
    if (!newWeweCode.trim()) return;
    setWeweSaving(true);
    try {
      await scraperApi.updateSettings({ wewe_auth_code: newWeweCode.trim() });
      setWeweSaved(true);
      setNewWeweCode("");
      await load();
      setTimeout(() => setWeweSaved(false), 3000);
    } finally {
      setWeweSaving(false);
    }
  }

  const inputCls = "w-full bg-surface border border-rim rounded px-2.5 py-1.5 text-soft text-xs focus:outline-none focus:border-ghost font-mono";
  const selectCls = "w-full bg-surface border border-rim rounded px-2.5 py-1.5 text-soft text-xs focus:outline-none focus:border-ghost";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-ghost text-sm">
        <Loader size={16} className="animate-spin mr-2" /> Loading…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 text-red-400 text-sm p-6">
        <AlertCircle size={16} />
        {error ?? "Failed to load settings"}
      </div>
    );
  }

  const modelsDirty =
    classify !== data.model_classify ||
    extract !== data.model_extract ||
    diff !== data.model_diff;

  const rssDirty = rsshub.trim() !== data.rsshub_base;

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-soft font-semibold text-base">Scraper Settings</h1>
        <p className="text-ghost text-xs mt-1">
          Settings are stored in SQLite and survive restarts, overriding .env values.
        </p>
      </div>

      {/* ── API Key ─────────────────────────────────────────── */}
      <SectionCard
        title="OpenRouter API Key"
        description="Used by LLMs for article classification and event extraction"
        onSave={saveKey}
        saving={keySaving}
        saved={keySaved}
        dirty={newKey.trim().length > 0}
      >
        {/* Current key status */}
        <div className="flex items-center gap-2 p-2.5 rounded bg-elevated border border-rim">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-ghost">Current key</span>
              <SourceBadge source={data.openrouter_api_key_source} />
            </div>
            <p className="font-mono text-xs text-soft mt-0.5 truncate">
              {data.openrouter_api_key_set ? data.openrouter_api_key_preview : "(not set)"}
            </p>
          </div>
          <button
            onClick={load}
            className="text-ghost hover:text-soft p-1 rounded hover:bg-rim transition-colors"
            title="Refresh"
          >
            <RotateCcw size={13} />
          </button>
        </div>

        {/* Input new key */}
        <FieldRow label="New key" hint="leave blank to keep current">
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="sk-or-v3-..."
              className={clsx(inputCls, "pr-8")}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ghost hover:text-soft"
              tabIndex={-1}
            >
              {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
          <p className="text-faint text-[10px]">
            Get one at{" "}
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-ghost"
            >
              openrouter.ai/keys
            </a>
          </p>
        </FieldRow>
      </SectionCard>

      {/* ── WeWeRSS Auth Code ───────────────────────────────── */}
      <SectionCard
        title="WeWeRSS Auth Code"
        description="WeWeRSS login password — lets the scraper read your subscribed accounts"
        onSave={saveWeweCode}
        saving={weweSaving}
        saved={weweSaved}
        dirty={newWeweCode.trim().length > 0}
      >
        <div className="flex items-center gap-2 p-2.5 rounded bg-elevated border border-rim">
          <div className="flex-1 min-w-0">
            <span className="text-xs text-ghost">Current</span>
            <p className="font-mono text-xs text-soft mt-0.5">
              {data.wewe_auth_code_set ? data.wewe_auth_code_preview : "(not set)"}
            </p>
          </div>
        </div>
        <FieldRow label="New code" hint="must match AUTH_CODE in docker-compose">
          <div className="relative">
            <input
              type={showWeweCode ? "text" : "password"}
              value={newWeweCode}
              onChange={(e) => setNewWeweCode(e.target.value)}
              placeholder="changeme_wewe"
              className={clsx(inputCls, "pr-8")}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowWeweCode((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ghost hover:text-soft"
              tabIndex={-1}
            >
              {showWeweCode ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
          <p className="text-faint text-[10px]">
            Once set, the Sources page will autocomplete from your WeWeRSS subscriptions
          </p>
        </FieldRow>
      </SectionCard>

      {/* ── Models ──────────────────────────────────────────── */}
      <SectionCard
        title="LLM Models"
        description="Light model for classify/diff, stronger for extraction"
        onSave={saveModels}
        saving={modelSaving}
        saved={modelSaved}
        dirty={modelsDirty}
      >
        <FieldRow label="Classify model" hint="detect if article is an event">
          <ModelSelect value={classify} onChange={setClassify} className={selectCls} />
        </FieldRow>
        <FieldRow label="Extract model" hint="deep structured event data extraction">
          <ModelSelect value={extract} onChange={setExtract} className={selectCls} />
        </FieldRow>
        <FieldRow label="Diff model" hint="detect new info in re-fetched articles">
          <ModelSelect value={diff} onChange={setDiff} className={selectCls} />
        </FieldRow>
      </SectionCard>

      {/* ── RSSHub ──────────────────────────────────────────── */}
      <SectionCard
        title="RSS Service URL"
        description="WeWeRSS base URL used to construct each source's feed URL"
        onSave={saveRss}
        saving={rssSaving}
        saved={rssSaved}
        dirty={rssDirty}
      >
        <FieldRow label="Base URL">
          <input
            type="text"
            value={rsshub}
            onChange={(e) => setRsshub(e.target.value)}
            placeholder="http://rsshub:1200"
            className={inputCls}
          />
          <p className="text-faint text-[10px]">
            Docker (internal): <code className="font-mono">http://wewe-rss:4000</code> · Local dev: <code className="font-mono">http://localhost:4000</code>
          </p>
        </FieldRow>
      </SectionCard>
    </div>
  );
}

function ModelSelect({ value, onChange, className }: { value: string; onChange: (v: string) => void; className: string }) {
  const isPreset = MODEL_OPTIONS.some((o) => o.value === value);

  return (
    <div className="space-y-1">
      <select
        value={isPreset ? value : "__custom__"}
        onChange={(e) => {
          if (e.target.value !== "__custom__") onChange(e.target.value);
        }}
        className={className}
      >
        {MODEL_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {!isPreset && (
          <option value="__custom__" disabled>
            Custom: {value}
          </option>
        )}
        <option value="__custom__" disabled={isPreset}>
          Custom…
        </option>
      </select>
      {/* Always show editable text input for full model ID */}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="provider/model-name"
        className={clsx(className, "text-faint")}
      />
    </div>
  );
}
