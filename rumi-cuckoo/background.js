/**
 * Service worker — manages polling, tab lifecycle, and job state.
 *
 * Uses chrome.alarms (not setInterval) so the worker survives Chrome's
 * 30-second idle suspension of MV3 service workers.
 */

import {
  getSettings,
  fetchNeedsContentPages,
  submitPageContent,
  getRerun,
  skipPage,
} from "./api.js";

// ---------------------------------------------------------------------------
// In-memory state (resets on service worker restart — that is acceptable;
// pages remain needs_content in the DB and reappear on the next poll)
// ---------------------------------------------------------------------------

/** @type {Map<number, Job>} pageId → job */
const activeJobs = new Map();

/**
 * @typedef {{ pageId: number, tabId: number|null, url: string,
 *             status: 'opening'|'extracting'|'submitting'|'done'|'error',
 *             sourceName: string, fetchedAt: string,
 *             runId: string|null, error: string|null }} Job
 */

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function setBadge(text, color) {
  chrome.action.setBadgeText({ text: String(text) });
  chrome.action.setBadgeBackgroundColor({ color: color || "#e05c00" });
}

// ---------------------------------------------------------------------------
// Popup messaging helpers
// ---------------------------------------------------------------------------

/** Push a full queue snapshot to the popup if it is open. */
function notifyPopup(type, payload) {
  chrome.runtime
    .sendMessage({ type, ...payload })
    .catch(() => {}); // popup may be closed — safe to ignore
}

function pushQueueUpdate(pendingPages) {
  notifyPopup("QUEUE_UPDATE", {
    pages: pendingPages,
    activeJobs: [...activeJobs.values()],
  });
}

function pushJobUpdate(job) {
  notifyPopup("JOB_UPDATE", { job });
}

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------

async function poll() {
  let pages;
  try {
    const data = await fetchNeedsContentPages();
    pages = data.items || [];
  } catch (err) {
    setBadge("?", "#888888");
    notifyPopup("QUEUE_UPDATE", { pages: [], activeJobs: [...activeJobs.values()], apiError: err.message });
    return;
  }

  // Filter out pages already being processed
  const pending = pages.filter((p) => !activeJobs.has(p.id));

  const totalWaiting = pending.length + [...activeJobs.values()].filter((j) => j.status !== "done" && j.status !== "error").length;
  setBadge(totalWaiting > 0 ? String(totalWaiting) : "", "#e05c00");

  pushQueueUpdate(pages);

  const settings = await getSettings();
  if (settings.autoOpen && pending.length > 0) {
    processPage(pending[0]);
  }
}

// ---------------------------------------------------------------------------
// Tab lifecycle
// ---------------------------------------------------------------------------

/** Open a WeChat article tab and start the extraction pipeline. */
async function processPage(page) {
  if (activeJobs.has(page.id)) return;

  /** @type {Job} */
  const job = {
    pageId: page.id,
    tabId: null,
    url: page.url,
    status: "opening",
    sourceName: page.source_name || "",
    fetchedAt: page.fetched_at || "",
    runId: null,
    error: null,
  };
  activeJobs.set(page.id, job);
  pushJobUpdate(job);

  let tab;
  try {
    tab = await chrome.tabs.create({ url: page.url, active: false });
  } catch (err) {
    job.status = "error";
    job.error = `Failed to open tab: ${err.message}`;
    pushJobUpdate(job);
    return;
  }

  job.tabId = tab.id;
  pushJobUpdate(job);
}

/**
 * Called when a WeChat tab finishes loading.
 * Sends EXTRACT to the content script.
 */
async function onTabReady(tabId) {
  // Find the job that owns this tab
  const job = [...activeJobs.values()].find((j) => j.tabId === tabId);
  if (!job || job.status !== "opening") return;

  job.status = "extracting";
  pushJobUpdate(job);

  let response;
  try {
    response = await chrome.tabs.sendMessage(tabId, {
      type: "EXTRACT",
      pageId: job.pageId,
    });
  } catch (err) {
    job.status = "error";
    job.error = `Could not reach content script: ${err.message}`;
    pushJobUpdate(job);
    return;
  }

  if (response?.type === "EXTRACT_ERROR") {
    job.status = "error";
    job.error = response.error;
    pushJobUpdate(job);
    return;
  }

  if (response?.type === "EXTRACT_RESULT") {
    await submitContent(job, response.text);
  }
}

/** Submit extracted text to the scraper API and poll for completion. */
async function submitContent(job, text) {
  job.status = "submitting";
  pushJobUpdate(job);

  let result;
  try {
    result = await submitPageContent(job.pageId, text);
  } catch (err) {
    job.status = "error";
    job.error = `API error: ${err.message}`;
    pushJobUpdate(job);
    return;
  }

  if (!result.ok) {
    job.status = "error";
    job.error = "Scraper API returned ok=false";
    pushJobUpdate(job);
    return;
  }

  job.runId = result.run_id;
  pushJobUpdate(job);

  // Close the tab now that content has been submitted successfully
  const settings = await getSettings();
  if (settings.closeTabAfterExtract && job.tabId) {
    chrome.tabs.remove(job.tabId).catch(() => {});
  }

  // Poll rerun progress until done or error
  await pollRerun(job);
}

async function pollRerun(job) {
  const MAX_POLLS = 60; // 2 minutes at 2s intervals
  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(2000);

    let rerun;
    try {
      rerun = await getRerun(job.pageId, job.runId);
    } catch {
      continue;
    }

    if (rerun.status === "done") {
      job.status = "done";
      pushJobUpdate(job);

      // Refresh badge count
      const totalActive = [...activeJobs.values()].filter(
        (j) => j.status !== "done" && j.status !== "error"
      ).length;
      setBadge(totalActive > 0 ? String(totalActive) : "", "#e05c00");
      return;
    }

    if (rerun.status === "error") {
      job.status = "error";
      job.error = rerun.error || "Extraction failed";
      pushJobUpdate(job);
      return;
    }
  }

  job.status = "error";
  job.error = "Timed out waiting for extraction to complete";
  pushJobUpdate(job);
}

// ---------------------------------------------------------------------------
// Chrome event listeners
// ---------------------------------------------------------------------------

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete") {
    onTabReady(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  const job = [...activeJobs.values()].find((j) => j.tabId === tabId);
  if (!job) return;
  if (job.status === "opening" || job.status === "extracting") {
    job.status = "error";
    job.error = "Tab was closed before extraction completed";
    pushJobUpdate(job);
  }
});

// CONTENT_READY is sent proactively by the content script; we treat it the
// same as tab onUpdated (sometimes fires before the tab update event)
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "CONTENT_READY" && sender.tab?.id) {
    onTabReady(sender.tab.id);
  }
});

// Popup requests
chrome.runtime.onMessage.addListener(async (msg, _sender, sendResponse) => {
  if (msg.type === "GET_QUEUE") {
    try {
      const data = await fetchNeedsContentPages();
      sendResponse({
        pages: data.items || [],
        activeJobs: [...activeJobs.values()],
      });
    } catch (err) {
      sendResponse({ pages: [], activeJobs: [...activeJobs.values()], apiError: err.message });
    }
    return true; // async sendResponse
  }

  if (msg.type === "PROCESS_PAGE") {
    const page = { id: msg.pageId, url: msg.url, source_name: msg.sourceName, fetched_at: msg.fetchedAt };
    processPage(page);
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "RETRY_PAGE") {
    const job = activeJobs.get(msg.pageId);
    if (job && job.tabId) {
      // Reuse already-open tab (user may have passed CAPTCHA)
      job.status = "extracting";
      job.error = null;
      pushJobUpdate(job);
      onTabReady(job.tabId);
    } else {
      // Re-open tab
      const page = { id: msg.pageId, url: msg.url, source_name: msg.sourceName, fetched_at: msg.fetchedAt };
      activeJobs.delete(msg.pageId);
      processPage(page);
    }
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "DISMISS_JOB") {
    // Tell the scraper to move this page out of needs_content permanently,
    // so it doesn't reappear on the next poll.
    skipPage(msg.pageId).catch(() => {}); // best-effort; don't block the response
    activeJobs.delete(msg.pageId);
    sendResponse({ ok: true });
    return true;
  }
});

// ---------------------------------------------------------------------------
// Alarm setup (polling heartbeat)
// ---------------------------------------------------------------------------

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "poll") poll();
});

async function setupAlarm() {
  const settings = await getSettings();
  await chrome.alarms.clearAll();
  chrome.alarms.create("poll", {
    delayInMinutes: 0.1, // first poll ~6 seconds after SW start
    periodInMinutes: settings.pollIntervalMinutes,
  });
}

// Re-setup alarm when settings change
chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings) setupAlarm();
});

// Boot
setupAlarm();

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
