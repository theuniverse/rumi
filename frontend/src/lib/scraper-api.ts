/**
 * Typed API client for the scraper microservice.
 * All calls go through nginx proxy at /scraper-api/ → scraper:9000/api/
 */

const BASE = `${import.meta.env.BASE_URL}scraper-api`;

async function get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(BASE + path, window.location.origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
  return res.json();
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path} → ${res.status}`);
  return res.json();
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE ${path} → ${res.status}`);
  return res.json();
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${path} → ${res.status}`);
  return res.json();
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface Dashboard {
  runs_today: number;
  total_pages: number;
  pages_today: number;
  total_events: number;
  total_cost_usd: number;
  cost_today_usd: number;
  active_sources: number;
}

export interface ScrapeRun {
  id: number;
  job_name: string;
  status: "running" | "success" | "failed";
  started_at: string;
  finished_at: string | null;
  pages_found: number;
  pages_new: number;
  error_msg: string | null;
}

export type PageStatus = "new" | "needs_content" | "pending_extract" | "extracting" | "done" | "error";

export interface ScrapedPage {
  id: number;
  url: string;
  source_id: number | null;
  source_name: string;
  status: PageStatus;
  content_hash: string;
  fetched_at: string;
  updated_at: string;
}

export interface RunStep {
  key: string;
  label: string;
  status: "pending" | "running" | "done" | "skipped" | "error";
  detail: string;
  duration_ms: number | null;
}

export interface RerunJob {
  run_id: string;
  page_id: number;
  status: "running" | "done" | "error";
  steps: RunStep[];
  created_at: string;
  finished_at: string | null;
  elapsed_ms: number;
  error: string | null;
}

export interface LLMCallSummary {
  id: number;
  page_id: number | null;
  task: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  latency_ms: number;
  success: boolean;
  prompt_preview: string;
  response_preview: string;
  created_at: string;
}

export interface TimetableSlot {
  id?: number;
  stage_name: string | null;
  start_time: string | null;
  end_time: string | null;
  artists: string[];
  is_b2b: boolean;
  set_type: string;
  special_note: string | null;
}

export interface ExtractedEventSummary {
  id: number;
  event_name: string | null;
  event_date: string | null;
  venue: string | null;
  city: string | null;
  info_level: number;
  status: "tba" | "partial" | "complete";
  confidence: number;
  page_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface ExtractedEventDetail extends ExtractedEventSummary {
  raw_json: Record<string, unknown> | null;
  timetable_slots: TimetableSlot[];
}

export interface PageDetail {
  id: number;
  url: string;
  source_name: string | null;
  status: string;
  content_hash: string;
  raw_html_preview: string;
  fetched_at: string;
  llm_calls: LLMCallSummary[];
  extracted_event: (ExtractedEventSummary & { timetable_slots: TimetableSlot[] }) | null;
}

export interface Source {
  id: number;
  name: string;
  feed_path: string;
  keywords: string[];
  city: string;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SourceCreate {
  name: string;
  feed_path: string;
  keywords: string[];
  city: string;
  active: boolean;
  notes?: string | null;
}

export interface ScraperSettings {
  openrouter_api_key_set: boolean;
  openrouter_api_key_preview: string;
  openrouter_api_key_source: "db" | "env" | "unset";
  rsshub_base: string;
  wewe_auth_code_set: boolean;
  wewe_auth_code_preview: string;
  model_classify: string;
  model_extract: string;
  model_diff: string;
}

export interface SettingsUpdate {
  openrouter_api_key?: string;
  rsshub_base?: string;
  wewe_auth_code?: string;
  model_classify?: string;
  model_extract?: string;
  model_diff?: string;
}

export interface WeWeAccount {
  id: string;
  name: string;
  feed_path: string;
}

export interface TestFetchArticle {
  title: string;
  url: string;
  content_preview: string;
  keyword_matched: string | null;
}

export interface TestFetchResult {
  source_name: string;
  feed_url: string;
  ok: boolean;
  articles_found: number;
  articles: TestFetchArticle[];
  error: string | null;
}

// ── Reference Data types ─────────────────────────────────────────────────────

export interface RefVenue {
  id: number;
  name: string;
  aliases: string[];
  type: string;
  address: string | null;
  city: string;
  ra_id: string | null;
  followed: boolean;
  created_at: string;
  updated_at: string;
}

export interface RefArtist {
  id: number;
  name: string;
  aliases: string[];
  type: string;
  city: string | null;
  ra_url: string | null;
  followed: boolean;
  created_at: string;
  updated_at: string;
}

export interface RefLabel {
  id: number;
  name: string;
  aliases: string[];
  type: string;
  city: string | null;
  ra_id: string | null;
  followed: boolean;
  created_at: string;
  updated_at: string;
}

export interface DiscoveryItem {
  id: number;
  entity_type: "venue" | "artist" | "label";
  raw_name: string;
  frequency: number;
  first_seen_at: string;
  status: "pending" | "accepted" | "ignored";
  accepted_as_id: number | null;
}

export interface EntityMatch {
  entity_type: string;
  entity_id: number;
  raw_name: string;
  confidence: number;
}

export interface MatchedEvent extends ExtractedEventSummary {
  ref_venue_id: number | null;
  has_followed_match: boolean;
  pushed_to_rumi: boolean;
  entity_matches: EntityMatch[];
  timetable_slots: TimetableSlot[];
}

// ── API functions ─────────────────────────────────────────────────────────────

export const scraperApi = {
  getDashboard: () => get<Dashboard>("/audit/dashboard"),

  getRuns: (limit = 50, offset = 0) =>
    get<{ total: number; items: ScrapeRun[] }>("/audit/runs", { limit, offset }),

  getPages: (params?: { source_id?: number; status?: string; limit?: number; offset?: number }) =>
    get<{ total: number; items: ScrapedPage[] }>("/audit/pages", params as Record<string, string | number>),

  getPageDetail: (id: number) => get<PageDetail>(`/audit/pages/${id}`),
  rerunPage: (id: number) =>
    post<{ ok: boolean; page_id: number; run_id: string; status: string }>(`/audit/pages/${id}/rerun`),
  setPageContent: (id: number, content: string) =>
    patch<{ ok: boolean; page_id: number; run_id: string; status: string }>(`/audit/pages/${id}/content`, { content }),
  getReruns: (id: number) =>
    get<{ items: RerunJob[] }>(`/audit/pages/${id}/reruns`),
  getRerun: (id: number, runId: string) =>
    get<RerunJob>(`/audit/pages/${id}/reruns/${runId}`),

  getLlmCalls: (params?: { task?: string; limit?: number; offset?: number }) =>
    get<{ total: number; total_cost_usd: number; items: LLMCallSummary[] }>(
      "/audit/llm-calls",
      params as Record<string, string | number>,
    ),

  getEvents: (params?: { status?: string; date_from?: string; date_to?: string; limit?: number; offset?: number }) =>
    get<{ total: number; items: ExtractedEventSummary[] }>("/events", params as Record<string, string | number>),

  getEventDetail: (id: number) => get<ExtractedEventDetail>(`/events/${id}`),

  getSources: () => get<{ items: Source[] }>("/sources"),
  createSource: (body: SourceCreate) => post<Source>("/sources", body),
  updateSource: (id: number, body: Partial<SourceCreate>) => put<Source>(`/sources/${id}`, body),
  deleteSource: (id: number) => del<{ ok: boolean }>(`/sources/${id}`),
  testSource: (id: number) => post<TestFetchResult>(`/sources/${id}/test`),

  triggerJob: (name: "monitor" | "extract" | "update" | "weekly") =>
    post<{ triggered: string; status: string }>(`/jobs/trigger/${name}`),

  getSettings: () => get<ScraperSettings>("/settings"),
  updateSettings: (body: SettingsUpdate) =>
    put<{ ok: boolean; changed: string[] }>("/settings", body),

  getWeWeAccounts: () =>
    get<{ ok: boolean; accounts: WeWeAccount[]; error?: string }>("/wewe/accounts"),

  // ── Reference Data ──────────────────────────────────────────────────────

  getRefVenues: (params?: { followed?: boolean }) =>
    get<{ items: RefVenue[] }>("/refdata/venues", params as Record<string, string | number>),
  createRefVenue: (body: Omit<RefVenue, "id" | "created_at" | "updated_at">) =>
    post<RefVenue>("/refdata/venues", body),
  updateRefVenue: (id: number, body: Partial<RefVenue>) =>
    put<RefVenue>(`/refdata/venues/${id}`, body),
  deleteRefVenue: (id: number) => del<{ ok: boolean }>(`/refdata/venues/${id}`),

  getRefArtists: (params?: { followed?: boolean }) =>
    get<{ items: RefArtist[] }>("/refdata/artists", params as Record<string, string | number>),
  createRefArtist: (body: Omit<RefArtist, "id" | "created_at" | "updated_at">) =>
    post<RefArtist>("/refdata/artists", body),
  updateRefArtist: (id: number, body: Partial<RefArtist>) =>
    put<RefArtist>(`/refdata/artists/${id}`, body),
  deleteRefArtist: (id: number) => del<{ ok: boolean }>(`/refdata/artists/${id}`),

  getRefLabels: (params?: { followed?: boolean }) =>
    get<{ items: RefLabel[] }>("/refdata/labels", params as Record<string, string | number>),
  createRefLabel: (body: Omit<RefLabel, "id" | "created_at" | "updated_at">) =>
    post<RefLabel>("/refdata/labels", body),
  updateRefLabel: (id: number, body: Partial<RefLabel>) =>
    put<RefLabel>(`/refdata/labels/${id}`, body),
  deleteRefLabel: (id: number) => del<{ ok: boolean }>(`/refdata/labels/${id}`),

  getDiscoveries: (status?: string) =>
    get<{ items: DiscoveryItem[] }>("/refdata/discoveries", { status }),
  acceptDiscovery: (id: number, body: { name: string; aliases?: string[]; type?: string; city?: string; followed?: boolean }) =>
    post<{ ok: boolean; entity_id: number }>(`/refdata/discoveries/${id}/accept`, body),
  ignoreDiscovery: (id: number) =>
    post<{ ok: boolean }>(`/refdata/discoveries/${id}/ignore`),

  getMatchedEvents: (unpushedOnly = true) =>
    get<{ items: MatchedEvent[] }>("/refdata/matched-events", { unpushed_only: unpushedOnly ? "true" : "false" }),
  markEventPushed: (id: number) =>
    post<{ ok: boolean }>(`/refdata/matched-events/${id}/mark-pushed`),

  getRefDataVersion: () =>
    get<{ version: string | null }>("/refdata/version"),
};
