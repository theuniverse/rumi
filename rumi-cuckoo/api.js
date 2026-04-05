/**
 * Scraper API client for rumi-cuckoo.
 * Mirrors the pattern in frontend/src/lib/scraper-api.ts but in plain JS.
 *
 * All paths are relative to apiBase, e.g. "http://localhost:8888/scraper-api"
 * which nginx proxies to http://scraper:9000/api/
 */

export async function getSettings() {
  const result = await chrome.storage.local.get("settings");
  return Object.assign(
    {
      apiBase: "http://localhost:8888/scraper-api",
      pollIntervalMinutes: 2,
      autoOpen: false,
      closeTabAfterExtract: true,
    },
    result.settings || {}
  );
}

async function apiBase() {
  const s = await getSettings();
  return s.apiBase;
}

/**
 * Fetch pages with needs_content status from the scraper.
 * @returns {{ total: number, items: PageListItem[] }}
 */
export async function fetchNeedsContentPages() {
  const base = await apiBase();
  const url = `${base}/audit/pages?status=needs_content&limit=50`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET /audit/pages → ${res.status}`);
  return res.json();
}

/**
 * Submit manually extracted article text to the scraper.
 * Triggers LLM extraction pipeline and returns a run_id for polling.
 * @param {number} pageId
 * @param {string} content
 * @returns {{ ok: boolean, page_id: number, run_id: string, status: string }}
 */
export async function submitPageContent(pageId, content) {
  const base = await apiBase();
  const url = `${base}/audit/pages/${pageId}/content`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`PATCH /audit/pages/${pageId}/content → ${res.status}`);
  return res.json();
}

/**
 * Poll a rerun job's progress.
 * @param {number} pageId
 * @param {string} runId
 * @returns {RerunJob}
 */
export async function getRerun(pageId, runId) {
  const base = await apiBase();
  const url = `${base}/audit/pages/${pageId}/reruns/${runId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET reruns/${runId} → ${res.status}`);
  return res.json();
}
