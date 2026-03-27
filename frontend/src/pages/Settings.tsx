import { useState, useRef } from "react";
import { Check, X, Download, Upload, Trash2, Scissors } from "lucide-react";
import clsx from "clsx";
import { getStoredWebhook, setStoredWebhook, postToFlomo } from "../lib/flomo";
import {
  exportSelectedData, importData as dbImportData, getDataCounts,
  clearAllData, pruneSnapshots,
} from "../lib/db";
import type { ExportableType, ExportData, ImportResult } from "../lib/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const EXPORTABLE_TYPES: ExportableType[] = ['tags', 'venues', 'sessions', 'recordings', 'snapshots'];

const TYPE_LABELS: Record<ExportableType, string> = {
  tags:       'Styles',
  venues:     'Places',
  sessions:   'Sessions',
  recordings: 'Recordings',
  snapshots:  'Analysis Snapshots',
};

function getSample(items: unknown[] | undefined, type: ExportableType): string {
  if (!items || items.length === 0) return '';
  const sample = items.slice(0, 3).map((item) => {
    const r = item as Record<string, unknown>;
    if (type === 'tags' || type === 'venues') return String(r.name ?? '');
    return String(r.started_at ?? r.captured_at ?? '').slice(0, 10);
  });
  return sample.join(', ') + (items.length > 3 ? '…' : '');
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-rim rounded-lg overflow-hidden">
      <div className="px-4 py-3 bg-surface border-b border-rim">
        <h2 className="text-sm font-medium text-soft">{title}</h2>
      </div>
      <div className="px-4 py-4 space-y-3">{children}</div>
    </div>
  );
}

// ── Flomo section ─────────────────────────────────────────────────────────────
function FlomoSection() {
  const [url, setUrl] = useState(getStoredWebhook);
  const [status, setStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");

  const save = () => {
    setStoredWebhook(url.trim());
    localStorage.removeItem("rumi_flomo_mode");
    setStatus("idle");
  };

  const test = async () => {
    if (!url.trim()) return;
    setStoredWebhook(url.trim());
    setStatus("testing");
    const ok = await postToFlomo(
      "这是来自 Rumi 的测试消息 ✓\n\n如果你看到这条消息，说明 Flomo 集成配置成功了。"
    );
    setStatus(ok ? "ok" : "fail");
    setTimeout(() => setStatus("idle"), 3000);
  };

  return (
    <Section title="Flomo 集成">
      <p className="text-ghost text-xs leading-relaxed">
        填入 Flomo 的 API Webhook URL（在 Flomo App → 设置 → API 中获取）。
        配置后，昨晚的录音将在每次开启 Rumi 时自动发送回顾提问。
      </p>
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://flomoapp.com/iwh/..."
          className="flex-1 bg-elevated border border-rim rounded px-3 py-2 text-sm text-soft outline-none
                     focus:border-muted placeholder:text-faint font-mono text-xs"
        />
        <button
          onClick={save}
          className="px-3 py-2 rounded border border-rim text-ghost hover:text-soft hover:border-muted text-xs transition-colors"
        >
          Save
        </button>
      </div>
      <button
        onClick={test}
        disabled={!url.trim() || status === "testing"}
        className={clsx(
          "flex items-center gap-2 px-3 py-2 rounded border text-xs transition-colors",
          status === "ok" && "border-live/40 text-live bg-live/5",
          status === "fail" && "border-red-400/40 text-red-400 bg-red-400/5",
          status === "idle" && "border-rim text-ghost hover:text-soft hover:border-muted",
          status === "testing" && "border-rim text-faint cursor-not-allowed"
        )}
      >
        {status === "ok" && <Check size={12} />}
        {status === "fail" && <X size={12} />}
        {status === "testing" ? "发送中…" : status === "ok" ? "发送成功" : status === "fail" ? "发送失败" : "发送测试消息"}
      </button>
      {status === "fail" && (
        <p className="text-xs text-red-400/70">
          发送失败。请检查 Webhook URL 是否正确，以及后端服务是否在运行（代理模式）。
        </p>
      )}
    </Section>
  );
}

// ── Data management section ───────────────────────────────────────────────────
type Panel = 'none' | 'export' | 'import-preview' | 'import-result';

function DataSection() {
  // Prune / clear state
  const [prunedays, setPruneDays] = useState("90");
  const [pruneResult, setPruneResult] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);

  // Panel state machine
  const [panel, setPanel] = useState<Panel>('none');

  // Export state
  const [counts, setCounts] = useState<Record<ExportableType, number> | null>(null);
  const [exportSelected, setExportSelected] = useState<Set<ExportableType>>(new Set(EXPORTABLE_TYPES));
  const [exporting, setExporting] = useState(false);

  // Import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importFile, setImportFile] = useState<ExportData | null>(null);
  const [importParseError, setImportParseError] = useState<string | null>(null);
  const [importSelected, setImportSelected] = useState<Set<ExportableType>>(new Set());
  const [importMode, setImportMode] = useState<'merge' | 'overwrite'>('merge');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // ── Export handlers ──────────────────────────────────────────────────────
  const openExportPanel = () => {
    if (panel === 'export') { setPanel('none'); return; }
    setCounts(getDataCounts());
    setExportSelected(new Set(EXPORTABLE_TYPES));
    setPanel('export');
  };

  const toggleExportType = (t: ExportableType) =>
    setExportSelected(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; });

  const doExport = async () => {
    if (exportSelected.size === 0) return;
    setExporting(true);
    const data = await exportSelectedData([...exportSelected]);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rumi-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
    setPanel('none');
  };

  // ── Import handlers ──────────────────────────────────────────────────────
  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as ExportData;
        if (!parsed._meta) throw new Error('Not a valid Rumi export file (missing _meta)');
        setImportFile(parsed);
        setImportParseError(null);
        const present = EXPORTABLE_TYPES.filter(t => {
          const arr = parsed[t] as unknown[] | undefined;
          return arr != null && arr.length > 0;
        });
        setImportSelected(new Set(present));
        setImportMode('merge');
        setPanel('import-preview');
      } catch (err) {
        setImportParseError(err instanceof Error ? err.message : 'Failed to parse file');
        setPanel('none');
      }
    };
    reader.readAsText(file);
  };

  const toggleImportType = (t: ExportableType) =>
    setImportSelected(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; });

  const doImport = async () => {
    if (!importFile || importSelected.size === 0) return;
    setImporting(true);
    const result = await dbImportData(importFile, [...importSelected], importMode);
    setImportResult(result);
    setImporting(false);
    setPanel('import-result');
  };

  const resetImport = () => {
    setImportFile(null);
    setImportResult(null);
    setImportParseError(null);
    setPanel('none');
  };

  // ── Prune / clear handlers ───────────────────────────────────────────────
  const prune = async () => {
    const days = parseInt(prunedays);
    if (isNaN(days) || days < 1) return;
    const count = await pruneSnapshots(days);
    setPruneResult(count);
    setTimeout(() => setPruneResult(null), 4000);
  };

  const clearAll = async () => {
    if (!confirm("Clear all data? This will delete all recordings, sessions, places, and style tags and cannot be undone.")) return;
    setClearing(true);
    await clearAllData();
    setClearing(false);
    window.location.reload();
  };

  const showImportButton = panel === 'none' || panel === 'export';

  return (
    <Section title="Data Management">

      {/* ── Export ───────────────────────────────────────────────────── */}
      <button
        onClick={openExportPanel}
        className={clsx(
          "flex items-center gap-2 px-3 py-2 rounded border text-xs transition-colors",
          panel === 'export'
            ? "border-muted text-soft"
            : "border-rim text-ghost hover:text-soft hover:border-muted"
        )}
      >
        <Download size={13} />
        Export Data (JSON)
      </button>

      {panel === 'export' && counts && (
        <div className="rounded border border-rim bg-elevated px-3 py-3 space-y-2">
          <p className="text-xs text-ghost mb-2">Select data types to export:</p>
          {EXPORTABLE_TYPES.map(t => (
            <label key={t} className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={exportSelected.has(t)}
                onChange={() => toggleExportType(t)}
                className="accent-sand"
              />
              <span className="text-xs text-soft flex-1">{TYPE_LABELS[t]}</span>
              <span className="text-xs text-faint font-mono tabular-nums">{counts[t]}</span>
            </label>
          ))}
          <div className="flex gap-2 pt-1">
            <button
              onClick={doExport}
              disabled={exporting || exportSelected.size === 0}
              className="px-3 py-1.5 rounded border border-sand/40 text-sand/80 hover:text-sand hover:border-sand/60 text-xs transition-colors disabled:opacity-40"
            >
              {exporting ? 'Exporting…' : 'Download'}
            </button>
            <button
              onClick={() => setPanel('none')}
              className="px-3 py-1.5 rounded border border-rim text-ghost hover:text-soft text-xs transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Import ───────────────────────────────────────────────────── */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={onFileSelected}
      />

      {showImportButton && (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-3 py-2 rounded border border-rim text-ghost hover:text-soft hover:border-muted text-xs transition-colors"
        >
          <Upload size={13} />
          Import Data (JSON)
        </button>
      )}

      {importParseError && (
        <p className="text-xs text-red-400/70">{importParseError}</p>
      )}

      {/* Import preview panel */}
      {panel === 'import-preview' && importFile && (
        <div className="rounded border border-rim bg-elevated px-3 py-3 space-y-2">
          <p className="text-xs text-ghost">
            File version v{importFile._meta.version} · exported {importFile._meta.exported_at.slice(0, 10)}
          </p>

          <p className="text-xs text-ghost pt-1">Select types to import:</p>
          {EXPORTABLE_TYPES.map(t => {
            const items = importFile[t] as unknown[] | undefined;
            if (!items) return null;
            return (
              <label key={t} className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={importSelected.has(t)}
                  onChange={() => toggleImportType(t)}
                  className="mt-0.5 accent-sand"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-soft">{TYPE_LABELS[t]}</span>
                  <span className="text-xs text-faint font-mono ml-2">{items.length}</span>
                  {items.length > 0 && (
                    <p className="text-xs text-faint truncate mt-0.5">{getSample(items, t)}</p>
                  )}
                </div>
              </label>
            );
          })}

          {/* Mode toggle */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs text-ghost">Mode:</span>
            {(['merge', 'overwrite'] as const).map(m => (
              <button
                key={m}
                onClick={() => setImportMode(m)}
                className={clsx(
                  "px-3 py-1 rounded border text-xs transition-colors",
                  importMode === m
                    ? "border-sand/50 text-sand bg-sand/10"
                    : "border-rim text-ghost hover:text-soft hover:border-muted"
                )}
              >
                {m === 'merge' ? 'Merge' : 'Overwrite'}
              </button>
            ))}
          </div>
          {importMode === 'overwrite' && (
            <p className="text-xs text-amber-400/70">
              Overwrite mode will delete existing data for selected types before importing.
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={doImport}
              disabled={importing || importSelected.size === 0}
              className="px-3 py-1.5 rounded border border-sand/40 text-sand/80 hover:text-sand hover:border-sand/60 text-xs transition-colors disabled:opacity-40"
            >
              {importing ? 'Importing…' : 'Start Import'}
            </button>
            <button
              onClick={resetImport}
              className="px-3 py-1.5 rounded border border-rim text-ghost hover:text-soft text-xs transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Import result panel */}
      {panel === 'import-result' && importResult && (
        <div className="rounded border border-live/30 bg-elevated px-3 py-3 space-y-1">
          <p className="text-xs text-live mb-2">Import complete</p>
          {EXPORTABLE_TYPES.map(t => {
            const imp  = importResult.imported[t];
            const skip = importResult.skipped[t];
            if (imp == null && skip == null) return null;
            return (
              <div key={t} className="flex gap-3 text-xs">
                <span className="text-ghost w-28">{TYPE_LABELS[t]}</span>
                <span className="text-live font-mono tabular-nums">+{imp ?? 0}</span>
                <span className="text-faint font-mono tabular-nums">skipped {skip ?? 0}</span>
              </div>
            );
          })}
          <button
            onClick={resetImport}
            className="mt-2 px-3 py-1.5 rounded border border-rim text-ghost hover:text-soft text-xs transition-colors"
          >
            Done
          </button>
        </div>
      )}

      {/* ── Prune snapshots ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <Scissors size={13} className="text-faint shrink-0" />
        <span className="text-xs text-ghost">Delete snapshots older than</span>
        <input
          type="number"
          min="1"
          value={prunedays}
          onChange={(e) => setPruneDays(e.target.value)}
          className="w-14 bg-elevated border border-rim rounded px-2 py-1 text-center text-xs text-soft outline-none"
        />
        <span className="text-xs text-ghost">days</span>
        <button
          onClick={prune}
          className="px-3 py-1 rounded border border-rim text-ghost hover:text-soft hover:border-muted text-xs transition-colors"
        >
          Prune
        </button>
        {pruneResult !== null && (
          <span className="text-xs text-live">Deleted {pruneResult}</span>
        )}
      </div>

      {/* ── Clear all ────────────────────────────────────────────────── */}
      <button
        onClick={clearAll}
        disabled={clearing}
        className="flex items-center gap-2 px-3 py-2 rounded border border-red-400/20 text-red-400/60
                   hover:border-red-400/40 hover:text-red-400 text-xs transition-colors disabled:opacity-40"
      >
        <Trash2 size={13} />
        {clearing ? 'Clearing…' : 'Clear All Data'}
      </button>
    </Section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Settings() {
  return (
    <div className="max-w-lg mx-auto px-8 py-16 space-y-6">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-soft tracking-tight mb-1">Settings</h1>
        <p className="text-ghost text-sm">Configure Flomo integration and manage local data.</p>
      </div>
      <FlomoSection />
      <DataSection />
    </div>
  );
}
