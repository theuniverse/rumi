import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronDown, ChevronUp, ExternalLink, RefreshCw, CheckCircle2, XCircle, Clock, AlertTriangle, ClipboardPaste, SkipForward, Loader2 } from "lucide-react";
import clsx from "clsx";
import { scraperApi, PageDetail, RerunJob, RunStep } from "../../lib/scraper-api";

// ── Sub-components ──────────────────────────────────────────────────────────

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-rim rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-elevated text-left hover:bg-elevated/80 transition-colors"
      >
        <span className="text-ghost text-xs uppercase tracking-widest">{title}</span>
        {open ? <ChevronUp size={13} className="text-ghost" /> : <ChevronDown size={13} className="text-ghost" />}
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

function InfoLevel({ level }: { level: number }) {
  const cfg = ["", "text-amber-400 bg-amber-400/10 border-amber-400/30", "text-blue-400 bg-blue-400/10 border-blue-400/30", "text-emerald-400 bg-emerald-400/10 border-emerald-400/30"];
  const labels = ["", "L1 · Date+Venue", "L2 · Lineup", "L3 · Timetable"];
  return <span className={clsx("px-1.5 py-0.5 rounded text-[10px] border", cfg[level] ?? cfg[1])}>{labels[level] ?? level}</span>;
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-rim rounded-full overflow-hidden">
        <div className={clsx("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-ghost text-[10px] w-8 text-right">{pct}%</span>
    </div>
  );
}

// ── Per-step icon ─────────────────────────────────────────────────────────────

function StepIcon({ status }: { status: RunStep["status"] }) {
  if (status === "running")  return <Loader2 size={12} className="text-amber-400 animate-spin shrink-0" />;
  if (status === "done")     return <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />;
  if (status === "skipped")  return <SkipForward size={12} className="text-ghost shrink-0" />;
  if (status === "error")    return <XCircle size={12} className="text-red-400 shrink-0" />;
  return <div className="w-3 h-3 rounded-full border border-rim shrink-0" />;
}

// ── Single run card ────────────────────────────────────────────────────────────

function RunCard({ job, defaultOpen }: { job: RerunJob; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  const isDone    = job.status === "done";
  const isError   = job.status === "error";
  const isRunning = job.status === "running";
  const elapsedS  = (job.elapsed_ms / 1000).toFixed(1);

  return (
    <div className={clsx(
      "rounded-lg border overflow-hidden",
      isDone  ? "border-emerald-400/25" :
      isError ? "border-red-400/25" :
                "border-amber-400/25",
    )}>
      {/* Header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-elevated/40 transition-colors"
      >
        {isRunning && <RefreshCw size={12} className="text-amber-400 animate-spin shrink-0" />}
        {isDone    && <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />}
        {isError   && <XCircle size={12} className="text-red-400 shrink-0" />}

        <span className={clsx("text-xs font-mono",
          isDone ? "text-emerald-400" : isError ? "text-red-400" : "text-amber-400"
        )}>
          #{job.run_id}
        </span>
        <span className="text-faint text-[10px]">
          {new Date(job.created_at).toLocaleTimeString()}
        </span>
        <span className={clsx("text-[10px] ml-auto flex items-center gap-1",
          isDone ? "text-emerald-400" : isError ? "text-red-400" : "text-amber-400"
        )}>
          <Clock size={10} />
          {elapsedS}s
        </span>
        {open ? <ChevronUp size={12} className="text-ghost shrink-0" /> : <ChevronDown size={12} className="text-ghost shrink-0" />}
      </button>

      {/* Steps */}
      {open && (
        <div className="border-t border-rim divide-y divide-rim">
          {job.steps.map((step) => (
            <div key={step.key} className="flex items-start gap-2.5 px-4 py-2.5">
              <div className="mt-0.5"><StepIcon status={step.status} /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-ghost text-xs">{step.label}</span>
                  {step.duration_ms != null && (
                    <span className="text-faint text-[10px]">{step.duration_ms}ms</span>
                  )}
                </div>
                {step.detail && (
                  <p className={clsx("text-[11px] mt-0.5 break-all",
                    step.status === "error" ? "text-red-400" :
                    step.status === "skipped" ? "text-faint" : "text-ghost"
                  )}>
                    {step.detail}
                  </p>
                )}
              </div>
            </div>
          ))}
          {job.error && (
            <div className="px-4 py-2 text-red-400 text-[11px]">{job.error}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Manual content input (shown when needs_content) ──────────────────────────

function ManualContentInput({
  blocked,
  onSubmit,
}: {
  blocked: boolean;
  onSubmit: (text: string) => Promise<void>;
}) {
  const [text, setText]     = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onSubmit(trimmed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={clsx(
      "rounded-lg border p-4 space-y-3",
      blocked ? "border-orange-400/30 bg-orange-400/5" : "border-rim bg-elevated/40",
    )}>
      {blocked && (
        <div className="flex items-start gap-2">
          <AlertTriangle size={14} className="text-orange-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-orange-400 text-xs font-medium">自动抓取被拦截</p>
            <p className="text-ghost text-xs mt-0.5">
              WeChat 将服务器请求识别为机器人，无法获取正文。
              请手工打开原文，复制全部文字内容粘贴到下方，之后的 LLM 分析步骤会自动继续。
            </p>
          </div>
        </div>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={blocked ? "将文章正文粘贴到这里…" : "粘贴新正文以替换现有内容并重新分析…"}
        rows={blocked ? 10 : 6}
        className={clsx(
          "w-full bg-surface border rounded px-3 py-2 text-ghost text-xs font-mono placeholder:text-faint focus:outline-none resize-y",
          blocked ? "border-rim focus:border-orange-400/50" : "border-rim focus:border-sky-400/50",
        )}
      />
      <div className="flex items-center justify-between">
        <span className="text-faint text-[10px]">{text.trim().length} 字符</span>
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || saving}
          className={clsx(
            "flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs transition-colors disabled:opacity-40",
            blocked
              ? "border-orange-400/40 text-orange-400 hover:bg-orange-400/10"
              : "border-rim text-ghost hover:text-soft hover:bg-elevated",
          )}
        >
          <ClipboardPaste size={12} />
          {saving ? "提交中…" : blocked ? "提交正文并开始分析" : "替换正文并重新分析"}
        </button>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS  = 120_000; // stop polling after 2 min

export default function ScraperPageDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [detail, setDetail]   = useState<PageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [expandPrompt, setExpandPrompt] = useState<number | null>(null);

  // Re-run jobs list (newest first)
  const [runs, setRuns]       = useState<RerunJob[]>([]);
  const [rerunning, setRerunning] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRunId = useRef<string | null>(null);

  // Initial load
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    scraperApi.getPageDetail(Number(id))
      .then(setDetail)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  // Poll the active run until terminal
  function startPolling(runId: string) {
    activeRunId.current = runId;
    if (pollTimer.current) clearInterval(pollTimer.current);

    pollTimer.current = setInterval(async () => {
      if (!id || activeRunId.current !== runId) return;
      try {
        const [job, page] = await Promise.all([
          scraperApi.getRerun(Number(id), runId),
          scraperApi.getPageDetail(Number(id)),
        ]);
        setRuns((prev) => prev.map((r) => r.run_id === runId ? job : r));
        setDetail(page);
        if (job.status !== "running") {
          clearInterval(pollTimer.current!);
          pollTimer.current = null;
          activeRunId.current = null;
        }
      } catch {
        // ignore transient poll errors
      }
    }, POLL_INTERVAL_MS);

    // Safety timeout — stop after 2 min regardless
    setTimeout(() => {
      if (activeRunId.current === runId) {
        clearInterval(pollTimer.current!);
        pollTimer.current = null;
        activeRunId.current = null;
      }
    }, POLL_TIMEOUT_MS);
  }

  useEffect(() => () => { if (pollTimer.current) clearInterval(pollTimer.current); }, []);

  async function triggerRun(apiCall: () => Promise<{ run_id: string }>) {
    if (!id || rerunning) return;
    setRerunning(true);
    try {
      const { run_id } = await apiCall();
      // Add optimistic placeholder so the card appears immediately
      const placeholder: RerunJob = {
        run_id,
        page_id: Number(id),
        status: "running",
        steps: [
          { key: "content", label: "正文准备", status: "pending", detail: "", duration_ms: null },
          { key: "extract", label: "LLM 提取",  status: "pending", detail: "", duration_ms: null },
          { key: "save",    label: "保存结果",   status: "pending", detail: "", duration_ms: null },
        ],
        created_at: new Date().toISOString(),
        finished_at: null,
        elapsed_ms: 0,
        error: null,
      };
      setRuns((prev) => [placeholder, ...prev]);
      startPolling(run_id);
    } catch (e) {
      alert(`操作失败: ${e}`);
    } finally {
      setRerunning(false);
    }
  }

  function handleRerun() {
    return triggerRun(() => scraperApi.rerunPage(Number(id!)));
  }

  async function handleManualContent(text: string) {
    await triggerRun(() => scraperApi.setPageContent(Number(id!), text));
  }

  if (loading) return <div className="flex-1 flex items-center justify-center text-ghost">Loading…</div>;
  if (error)   return <div className="flex-1 flex items-center justify-center text-red-400">{error}</div>;
  if (!detail) return null;

  const ev = detail.extracted_event;

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">

      {/* Back + header */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => navigate(-1)}
          className="mt-0.5 p-1.5 rounded border border-rim text-ghost hover:text-soft transition-colors"
        >
          <ArrowLeft size={14} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-soft text-base font-semibold truncate">Page #{detail.id}</h1>
            {/* Live status badge */}
            <span className={clsx("px-1.5 py-0.5 rounded text-[10px] border shrink-0",
              detail.status === "done"            ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/30" :
              detail.status === "error"           ? "text-red-400 bg-red-400/10 border-red-400/30" :
              detail.status === "extracting"      ? "text-purple-400 bg-purple-400/10 border-purple-400/30" :
              detail.status === "pending_extract" ? "text-amber-400 bg-amber-400/10 border-amber-400/30" :
              detail.status === "needs_content"   ? "text-orange-400 bg-orange-400/10 border-orange-400/30" :
              "text-ghost border-rim"
            )}>
              {detail.status}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-ghost text-xs">{detail.source_name ?? "—"}</span>
            <a
              href={detail.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-faint hover:text-ghost text-[10px] flex items-center gap-0.5 transition-colors"
            >
              <ExternalLink size={10} />
              open
            </a>
          </div>
          <p className="text-faint font-mono text-[10px] truncate mt-0.5">{detail.url}</p>
        </div>
        <button
          onClick={handleRerun}
          disabled={rerunning}
          title="Reset to pending_extract and re-run extraction"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-rim text-ghost hover:text-soft hover:bg-elevated text-xs transition-colors disabled:opacity-40"
        >
          <RefreshCw size={13} className={rerunning ? "animate-spin" : ""} />
          Re-run
        </button>
      </div>

      {/* Manual content input — always available; orange mode when fetch was blocked */}
      <Section
        title={detail.status === "needs_content" ? "⚠ 手工提供正文" : "替换正文"}
        defaultOpen={detail.status === "needs_content"}
      >
        <ManualContentInput
          blocked={detail.status === "needs_content"}
          onSubmit={handleManualContent}
        />
      </Section>

      {/* Re-run history — one card per run, newest first */}
      {runs.length > 0 && (
        <div className="space-y-2">
          {runs.map((job, i) => (
            <RunCard key={job.run_id} job={job} defaultOpen={i === 0} />
          ))}
        </div>
      )}

      {/* 1. Raw content preview */}
      <Section title="Raw Content (preview)">
        <pre className="text-faint text-[11px] font-mono whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
          {detail.raw_html_preview || "(empty)"}
        </pre>
        <p className="text-faint text-[10px] mt-2">Hash: {detail.content_hash}</p>
      </Section>

      {/* 2. LLM Calls */}
      <Section title={`LLM Calls (${detail.llm_calls.length})`}>
        {detail.llm_calls.length === 0 && <p className="text-faint text-sm">No LLM calls yet.</p>}
        <div className="space-y-3">
          {detail.llm_calls.map((c) => (
            <div key={c.id} className="border border-rim rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-soft text-xs font-mono">{c.task}</span>
                <span className="text-ghost text-[10px] border border-rim px-1.5 py-0.5 rounded">{c.model}</span>
                <span className={clsx("text-[10px] px-1.5 py-0.5 rounded border",
                  c.success ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/30" : "text-red-400 bg-red-400/10 border-red-400/30"
                )}>
                  {c.success ? "ok" : "failed"}
                </span>
                <span className="text-faint text-[10px] ml-auto">
                  {c.input_tokens}+{c.output_tokens} tok · ${c.cost_usd.toFixed(5)} · {c.latency_ms}ms
                </span>
              </div>

              <div>
                <button
                  onClick={() => setExpandPrompt(expandPrompt === c.id ? null : c.id)}
                  className="text-faint text-[10px] hover:text-ghost transition-colors flex items-center gap-1"
                >
                  {expandPrompt === c.id ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                  Prompt preview
                </button>
                {expandPrompt === c.id && (
                  <pre className="text-faint text-[10px] font-mono whitespace-pre-wrap mt-1 max-h-32 overflow-y-auto bg-surface border border-rim rounded p-2">
                    {c.prompt_preview}
                  </pre>
                )}
              </div>

              <div>
                <p className="text-faint text-[10px] mb-1">Response</p>
                <pre className="text-ghost text-[11px] font-mono whitespace-pre-wrap max-h-48 overflow-y-auto bg-surface border border-rim rounded p-2">
                  {c.response_preview}
                </pre>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* 3. Extracted Event */}
      <Section title="Extracted Event">
        {!ev && <p className="text-faint text-sm">No event extracted yet.</p>}
        {ev && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <InfoLevel level={ev.info_level} />
              <span className={clsx("px-1.5 py-0.5 rounded text-[10px] border",
                ev.status === "complete" ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/30" :
                ev.status === "partial"  ? "text-amber-400 bg-amber-400/10 border-amber-400/30" :
                "text-ghost border-rim"
              )}>
                {ev.status}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-ghost">Name</span>  <span className="text-soft ml-1">{ev.event_name ?? "—"}</span></div>
              <div><span className="text-ghost">Date</span>  <span className="text-soft ml-1">{ev.event_date ?? "—"}</span></div>
              <div><span className="text-ghost">Venue</span> <span className="text-soft ml-1">{ev.venue ?? "—"}</span></div>
              <div><span className="text-ghost">City</span>  <span className="text-soft ml-1">{ev.city ?? "—"}</span></div>
            </div>
            <div>
              <p className="text-ghost text-xs mb-1">Confidence</p>
              <ConfidenceBar value={ev.confidence} />
            </div>
            {ev.timetable_slots.length > 0 && (
              <div>
                <p className="text-ghost text-xs mb-2">Timetable ({ev.timetable_slots.length} slots)</p>
                <div className="space-y-1">
                  {ev.timetable_slots.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs bg-surface border border-rim rounded px-2.5 py-2">
                      <span className="text-faint w-24 shrink-0">{s.start_time ?? "?"} – {s.end_time ?? "?"}</span>
                      <span className="text-ghost text-[10px] w-16 shrink-0">{s.stage_name ?? "—"}</span>
                      <span className="text-soft">{s.artists.join(s.is_b2b ? " b2b " : " / ")}</span>
                      {s.set_type && s.set_type !== "DJ" && (
                        <span className="text-faint text-[10px] ml-auto">{s.set_type}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}
