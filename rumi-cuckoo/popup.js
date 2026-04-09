/**
 * Popup script — renders the queue, handles user interactions,
 * and syncs with the service worker via chrome.runtime messaging.
 */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let allPages = [];      // PageListItem[] from the scraper API
let activeJobs = [];    // Job[] from the service worker
let settings = {};
let apiError = null;
let settingsOpen = false;

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------

const $badge         = document.getElementById("badge");
const $queue         = document.getElementById("queue");
const $queueEmpty    = document.getElementById("queue-empty");
const $apiError      = document.getElementById("api-error");
const $btnRefresh    = document.getElementById("btn-refresh");
const $toggleAuto    = document.getElementById("toggle-auto");
const $btnSettings   = document.getElementById("btn-settings-toggle");
const $settingsPanel = document.getElementById("settings-panel");
const $apiBase       = document.getElementById("setting-api-base");
const $pollInterval  = document.getElementById("setting-poll-interval");
const $closeTab      = document.getElementById("setting-close-tab");
const $btnSave       = document.getElementById("btn-save-settings");

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render() {
  // Merge API pages with active job overrides
  const jobMap = new Map(activeJobs.map((j) => [j.pageId, j]));

  // Pages that are in the API queue (needs_content) or have an active job
  const allIds = new Set([
    ...allPages.map((p) => p.id),
    ...activeJobs.map((j) => j.pageId),
  ]);

  const items = [...allIds].map((id) => {
    const page = allPages.find((p) => p.id === id);
    const job  = jobMap.get(id);
    return { page, job };
  });

  // Badge
  const waiting = items.filter(({ job }) => !job || (job.status !== "done" && job.status !== "error")).length;
  $badge.textContent = String(waiting);
  $badge.className   = "badge" + (waiting === 0 ? " zero" : "");

  // API error banner
  if (apiError) {
    $apiError.textContent = `无法连接 API：${apiError}`;
    $apiError.style.display = "block";
  } else {
    $apiError.style.display = "none";
  }

  // Queue cards
  const cards = items.map(({ page, job }) => buildCard(page, job));

  // Clear existing cards (keep the empty-state node)
  [...$queue.querySelectorAll(".card")].forEach((el) => el.remove());

  if (cards.length === 0) {
    $queueEmpty.style.display = "flex";
  } else {
    $queueEmpty.style.display = "none";
    cards.forEach((el) => $queue.appendChild(el));
  }
}

function buildCard(page, job) {
  const el = document.createElement("div");
  const status = job?.status ?? "idle";
  el.className = `card status-${status}`;
  el.dataset.pageId = String(page?.id ?? job?.pageId);

  const url     = page?.url     ?? job?.url ?? "";
  const source  = page?.source_name ?? job?.sourceName ?? "未知来源";
  const fetched = page?.fetched_at  ?? job?.fetchedAt  ?? "";
  const pageId  = page?.id ?? job?.pageId;

  el.innerHTML = `
    <div class="card-top">
      <span class="card-source" title="${esc(source)}">${esc(source)}</span>
      <span class="status-dot ${dotClass(status)}"></span>
    </div>
    <div class="card-url" title="${esc(url)}">${esc(shortUrl(url))}</div>
    <div class="card-meta">${metaContent(status, job, fetched)}</div>
    ${job?.error ? `<div class="card-error">${esc(job.error)}</div>` : ""}
    <div class="card-actions">${actionButtons(status, pageId, url, source, fetched, job)}</div>
  `;

  return el;
}

function dotClass(status) {
  if (status === "done")  return "done";
  if (status === "error") return "error";
  if (status === "idle")  return "idle";
  return "active"; // opening | extracting | submitting
}

function metaContent(status, job, fetched) {
  const timeAgo = fetched ? relativeTime(fetched) : "";
  if (status === "opening")    return `<span class="spinner"></span> 正在打开标签页…`;
  if (status === "extracting") return `<span class="spinner"></span> 正在提取正文…`;
  if (status === "submitting") return `<span class="spinner"></span> 正在提交到 API…`;
  if (status === "done")       return `<span>✓ 已提交，等待提取</span>`;
  if (status === "error")      return `<span>${timeAgo}</span>`;
  return `<span>${timeAgo}</span>`;
}

function actionButtons(status, pageId, url, source, fetched, job) {
  if (status === "idle") {
    return `<button class="btn-sm primary" data-action="extract" data-page-id="${pageId}" data-url="${esc(url)}" data-source="${esc(source)}" data-fetched="${esc(fetched)}">提取</button>
            <a class="btn-sm" href="${esc(url)}" target="_blank" rel="noopener">打开</a>
            <button class="btn-sm danger" data-action="dismiss" data-page-id="${pageId}">忽略</button>`;
  }
  if (status === "error") {
    return `<button class="btn-sm primary" data-action="retry" data-page-id="${pageId}" data-url="${esc(url)}" data-source="${esc(source)}" data-fetched="${esc(fetched)}" data-tab-id="${job?.tabId ?? ""}">重试</button>
            <button class="btn-sm danger" data-action="dismiss" data-page-id="${pageId}">忽略</button>`;
  }
  if (status === "done") {
    return `<button class="btn-sm danger" data-action="dismiss" data-page-id="${pageId}">关闭</button>`;
  }
  return ""; // active states — no buttons
}

function shortUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname + u.pathname.slice(0, 20) + (u.pathname.length > 20 ? "…" : "");
  } catch {
    return url.slice(0, 40);
  }
}

function relativeTime(iso) {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return "刚刚";
    if (m < 60) return `${m} 分钟前`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} 小时前`;
    return `${Math.floor(h / 24)} 天前`;
  } catch {
    return "";
  }
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

async function loadSettings() {
  const result = await chrome.storage.local.get("settings");
  settings = Object.assign(
    { apiBase: "http://localhost:8888/scraper-api", pollIntervalMinutes: 2, autoOpen: false, closeTabAfterExtract: true },
    result.settings || {}
  );
  $apiBase.value      = settings.apiBase;
  $pollInterval.value = String(settings.pollIntervalMinutes);
  $closeTab.checked   = settings.closeTabAfterExtract;
  $toggleAuto.checked = settings.autoOpen;
}

async function saveSettings() {
  settings.apiBase              = $apiBase.value.trim() || "http://localhost:8888/scraper-api";
  settings.pollIntervalMinutes  = Math.max(1, parseInt($pollInterval.value) || 2);
  settings.closeTabAfterExtract = $closeTab.checked;
  settings.autoOpen             = $toggleAuto.checked;
  await chrome.storage.local.set({ settings });
  $btnSave.textContent = "已保存 ✓";
  setTimeout(() => { $btnSave.textContent = "保存"; }, 1500);
}

// ---------------------------------------------------------------------------
// Communication with service worker
// ---------------------------------------------------------------------------

async function refreshQueue() {
  $btnRefresh.style.opacity = "0.4";
  try {
    const resp = await chrome.runtime.sendMessage({ type: "GET_QUEUE" });
    allPages   = resp.pages ?? [];
    activeJobs = resp.activeJobs ?? [];
    apiError   = resp.apiError ?? null;
    render();
  } catch {
    apiError = "Service worker 未响应";
    render();
  } finally {
    $btnRefresh.style.opacity = "";
  }
}

// Push messages from the service worker (live updates while popup is open)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "QUEUE_UPDATE") {
    allPages   = msg.pages ?? [];
    activeJobs = msg.activeJobs ?? [];
    apiError   = msg.apiError ?? null;
    render();
  }
  if (msg.type === "JOB_UPDATE") {
    const idx = activeJobs.findIndex((j) => j.pageId === msg.job.pageId);
    if (idx >= 0) activeJobs[idx] = msg.job;
    else activeJobs.push(msg.job);
    render();
  }
});

// ---------------------------------------------------------------------------
// Event delegation for card buttons
// ---------------------------------------------------------------------------

$queue.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;

  const action  = btn.dataset.action;
  const pageId  = Number(btn.dataset.pageId);
  const url     = btn.dataset.url     ?? "";
  const source  = btn.dataset.source  ?? "";
  const fetched = btn.dataset.fetched ?? "";
  const tabId   = btn.dataset.tabId ? Number(btn.dataset.tabId) : null;

  if (action === "extract") {
    await chrome.runtime.sendMessage({ type: "PROCESS_PAGE", pageId, url, sourceName: source, fetchedAt: fetched });
    // Optimistically add job to local state
    activeJobs.push({ pageId, tabId: null, url, status: "opening", sourceName: source, fetchedAt: fetched, runId: null, error: null });
    render();
  }

  if (action === "retry") {
    await chrome.runtime.sendMessage({ type: "RETRY_PAGE", pageId, url, sourceName: source, fetchedAt: fetched, tabId });
    const job = activeJobs.find((j) => j.pageId === pageId);
    if (job) { job.status = "extracting"; job.error = null; }
    else activeJobs.push({ pageId, tabId, url, status: "extracting", sourceName: source, fetchedAt: fetched, runId: null, error: null });
    render();
  }

  if (action === "dismiss") {
    await chrome.runtime.sendMessage({ type: "DISMISS_JOB", pageId });
    activeJobs = activeJobs.filter((j) => j.pageId !== pageId);
    allPages   = allPages.filter((p) => p.id !== pageId);
    render();
  }
});

// ---------------------------------------------------------------------------
// Misc controls
// ---------------------------------------------------------------------------

$btnRefresh.addEventListener("click", refreshQueue);

$toggleAuto.addEventListener("change", async () => {
  settings.autoOpen = $toggleAuto.checked;
  await chrome.storage.local.set({ settings });
});

$btnSettings.addEventListener("click", () => {
  settingsOpen = !settingsOpen;
  $settingsPanel.style.display = settingsOpen ? "flex" : "none";
  $btnSettings.querySelector("svg + *") ?? null;
  // Rotate arrow hint
  $btnSettings.style.color = settingsOpen ? "var(--text)" : "";
});

$btnSave.addEventListener("click", saveSettings);

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

(async () => {
  await loadSettings();
  await refreshQueue();
})();
