import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronDown, ChevronUp, ExternalLink, RefreshCw, CheckCircle2, XCircle, Clock } from "lucide-react";
import clsx from "clsx";
import { scraperApi, PageDetail } from "../../lib/scraper-api";

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

// Status pipeline step labels & order
const PIPELINE: Array<{ key: string; label: string }> = [
  { key: "pending_extract", label: "Queued" },
  { key: "extracting",      label: "Extracting" },
  { key: "done",            label: "Done" },
];

function RerunStatusBlock({
  pageStatus,
  elapsed,
  onDismiss,
}: {
  pageStatus: string;
  elapsed: number;
  onDismiss: () => void;
}) {
  const isError   = pageStatus === "error";
  const isDone    = pageStatus === "done";
  const isRunning = !isDone && !isError;

  const currentIdx = PIPELINE.findIndex((s) => s.key === pageStatus);

  return (
    <div className={clsx(
      "rounded-lg border p-3 space-y-2.5 transition-colors",
      isDone  ? "border-emerald-400/30 bg-emerald-400/5" :
      isError ? "border-red-400/30 bg-red-400/5" :
                "border-amber-400/30 bg-amber-400/5",
    )}>
      {/* Header row */}
      <div className="flex items-center gap-2">
        {isRunning && <RefreshCw size={13} className="text-amber-400 animate-spin shrink-0" />}
        {isDone    && <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />}
        {isError   && <XCircle size={13} className="text-red-400 shrink-0" />}

        <span className={clsx("text-xs font-medium",
          isDone ? "text-emerald-400" : isError ? "text-red-400" : "text-amber-400"
        )}>
          {isDone ? "Extraction complete" : isError ? "Extraction failed" : "Re-running extraction…"}
        </span>

        <span className="text-faint text-[10px] ml-auto flex items-center gap-1">
          <Clock size={10} />
          {elapsed}s
        </span>

        {(isDone || isError) && (
          <button
            onClick={onDismiss}
            className="text-faint hover:text-ghost text-[10px] ml-1 transition-colors"
          >
            dismiss
          </button>
        )}
      </div>

      {/* Pipeline steps */}
      <div className="flex items-center gap-0">
        {PIPELINE.map((step, i) => {
          const isActive  = step.key === pageStatus;
          const isPast    = currentIdx > i || isDone;
          const isUpcoming = currentIdx < i && !isDone;
          return (
            <div key={step.key} className="flex items-center">
              {i > 0 && (
                <div className={clsx("h-px w-6 mx-1", isPast || isDone ? "bg-emerald-400/50" : "bg-rim")} />
              )}
              <div className="flex flex-col items-center gap-0.5">
                <div className={clsx(
                  "w-2 h-2 rounded-full transition-colors",
                  isError && isActive ? "bg-red-400" :
                  isDone || isPast    ? "bg-emerald-400" :
                  isActive            ? "bg-amber-400 ring-2 ring-amber-400/30" :
                  "bg-rim",
                )} />
                <span className={clsx(
                  "text-[9px] whitespace-nowrap",
                  isError && isActive ? "text-red-400" :
                  isDone || isPast    ? "text-emerald-400" :
                  isActive            ? "text-amber-400" :
                  isUpcoming          ? "text-faint" : "text-ghost",
                )}>
                  {step.label}
                </span>
              </div>
            </div>
          );
        })}
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

  // Re-run state
  const [rerunActive, setRerunActive]   = useState(false);  // block visible
  const [rerunning,   setRerunning]     = useState(false);  // button spinner
  const [elapsed,     setElapsed]       = useState(0);
  const pollTimer   = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTime   = useRef<number>(0);

  // Initial load
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    scraperApi.getPageDetail(Number(id))
      .then(setDetail)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  // Polling logic — runs while rerunActive and not yet terminal
  useEffect(() => {
    if (!rerunActive || !id) return;
    const terminal = (s: string) => s === "done" || s === "error";

    pollTimer.current = setInterval(async () => {
      try {
        const updated = await scraperApi.getPageDetail(Number(id));
        setDetail(updated);
        if (terminal(updated.status)) {
          stopPolling();
        }
      } catch {
        // ignore transient errors while polling
      }
    }, POLL_INTERVAL_MS);

    // Elapsed-seconds counter
    elapsedTimer.current = setInterval(() => {
      setElapsed(Math.round((Date.now() - startTime.current) / 1000));
    }, 1000);

    // Safety timeout
    const safetyTimeout = setTimeout(() => stopPolling(), POLL_TIMEOUT_MS);

    return () => {
      clearInterval(pollTimer.current!);
      clearInterval(elapsedTimer.current!);
      clearTimeout(safetyTimeout);
    };
  }, [rerunActive, id]);

  function stopPolling() {
    clearInterval(pollTimer.current!);
    clearInterval(elapsedTimer.current!);
    pollTimer.current = null;
    elapsedTimer.current = null;
  }

  async function handleRerun() {
    if (!id || rerunning) return;
    setRerunning(true);
    try {
      await scraperApi.rerunPage(Number(id));
      // Immediately refresh so status shows pending_extract
      const updated = await scraperApi.getPageDetail(Number(id));
      setDetail(updated);
      // Start polling block
      startTime.current = Date.now();
      setElapsed(0);
      setRerunActive(true);
    } catch (e) {
      alert(`Re-run failed: ${e}`);
    } finally {
      setRerunning(false);
    }
  }

  function dismissRerun() {
    stopPolling();
    setRerunActive(false);
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
          disabled={rerunning || rerunActive}
          title="Reset to pending_extract and re-run extraction"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-rim text-ghost hover:text-soft hover:bg-elevated text-xs transition-colors disabled:opacity-40"
        >
          <RefreshCw size={13} className={rerunning ? "animate-spin" : ""} />
          Re-run
        </button>
      </div>

      {/* Re-run status block — appears after clicking Re-run */}
      {rerunActive && (
        <RerunStatusBlock
          pageStatus={detail.status}
          elapsed={elapsed}
          onDismiss={dismissRerun}
        />
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
