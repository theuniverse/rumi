import { useEffect, useState } from "react";
import { Play, RefreshCw, Activity, FileText, Zap, DollarSign } from "lucide-react";
import clsx from "clsx";
import { scraperApi, Dashboard, ScrapeRun } from "../../lib/scraper-api";

function StatCard({ label, value, sub, icon: Icon }: { label: string; value: string | number; sub?: string; icon: React.ElementType }) {
  return (
    <div className="bg-elevated border border-rim rounded-lg p-4 flex gap-3 items-start">
      <div className="mt-0.5 text-ghost">
        <Icon size={16} strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-soft text-xl font-mono font-semibold leading-none">{value}</p>
        <p className="text-ghost text-xs mt-1">{label}</p>
        {sub && <p className="text-faint text-[10px] mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function RunStatusBadge({ status }: { status: ScrapeRun["status"] }) {
  const cfg = {
    running:  "text-blue-400 bg-blue-400/10 border-blue-400/30",
    success:  "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
    failed:   "text-red-400 bg-red-400/10 border-red-400/30",
  };
  return (
    <span className={clsx("px-1.5 py-0.5 rounded text-[10px] border", cfg[status])}>
      {status}
    </span>
  );
}

type JobName = "monitor" | "extract" | "update" | "weekly";

const JOBS: { name: JobName; label: string; desc: string }[] = [
  { name: "monitor", label: "Monitor",  desc: "Fetch RSS + classify articles" },
  { name: "extract", label: "Extract",  desc: "Deep LLM extraction on queued pages" },
  { name: "update",  label: "Update",   desc: "Re-check partial/TBA events" },
  { name: "weekly",  label: "Weekly",   desc: "Log weekly summary stats" },
];

export default function ScraperDashboard() {
  const [stats, setStats]       = useState<Dashboard | null>(null);
  const [runs, setRuns]         = useState<ScrapeRun[]>([]);
  const [triggering, setTriggering] = useState<JobName | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [d, r] = await Promise.all([
        scraperApi.getDashboard(),
        scraperApi.getRuns(10),
      ]);
      setStats(d);
      setRuns(r.items);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function trigger(job: JobName) {
    setTriggering(job);
    try {
      await scraperApi.triggerJob(job);
      setTimeout(load, 1500);
    } catch (e) {
      alert(`Failed to trigger ${job}: ${e}`);
    } finally {
      setTriggering(null);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-soft text-lg font-semibold">Scraper Dashboard</h1>
          <p className="text-ghost text-sm">Event scraping via RSSHub + Qwen</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-rim text-ghost hover:text-soft hover:bg-elevated text-xs transition-colors"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-400/10 border border-red-400/30 rounded-lg p-3 text-red-400 text-sm">
          {error} — is the scraper service running?
        </div>
      )}

      {/* Stats grid */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Runs today" value={stats.runs_today} icon={Activity} />
          <StatCard label="Pages scraped" value={stats.total_pages} sub={`+${stats.pages_today} today`} icon={FileText} />
          <StatCard label="Events found" value={stats.total_events} icon={Zap} />
          <StatCard
            label="LLM cost (total)"
            value={`$${stats.total_cost_usd.toFixed(4)}`}
            sub={`$${stats.cost_today_usd.toFixed(4)} today`}
            icon={DollarSign}
          />
        </div>
      )}

      {/* Job triggers */}
      <div>
        <h2 className="text-ghost text-xs uppercase tracking-widest mb-2">Trigger Jobs</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {JOBS.map((job) => (
            <button
              key={job.name}
              onClick={() => trigger(job.name)}
              disabled={triggering !== null}
              className="flex flex-col gap-1 p-3 rounded-lg border border-rim bg-elevated hover:bg-elevated/80 hover:border-rim/60 transition-colors text-left disabled:opacity-50"
            >
              <div className="flex items-center gap-1.5">
                <Play size={12} className="text-ghost" />
                <span className="text-soft text-sm">{job.label}</span>
                {triggering === job.name && (
                  <RefreshCw size={11} className="text-ghost animate-spin ml-auto" />
                )}
              </div>
              <p className="text-faint text-[11px] leading-tight">{job.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Recent runs */}
      <div>
        <h2 className="text-ghost text-xs uppercase tracking-widest mb-2">Recent Runs</h2>
        {runs.length === 0 && !loading && (
          <p className="text-faint text-sm">No runs yet. Trigger a job above.</p>
        )}
        <div className="space-y-1.5">
          {runs.map((run) => (
            <div
              key={run.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-rim bg-elevated text-sm"
            >
              <RunStatusBadge status={run.status} />
              <span className="text-soft font-mono w-20 shrink-0">{run.job_name}</span>
              <span className="text-ghost text-xs">
                {new Date(run.started_at).toLocaleString()}
              </span>
              <span className="text-ghost text-xs ml-auto">
                {run.pages_found} found / {run.pages_new} new
              </span>
              {run.error_msg && (
                <span className="text-red-400 text-[10px] truncate max-w-48" title={run.error_msg}>
                  {run.error_msg}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
