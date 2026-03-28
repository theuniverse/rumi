/**
 * Flomo integration — send notes under #rumi tag.
 *
 * Strategy:
 *   1. Try calling the Flomo webhook directly from the browser.
 *   2. If that fails (CORS / network), fall back to the local backend proxy.
 *   3. Remember which mode worked in localStorage so future calls are instant.
 */

import { getPendingFollowUpSessions, markSessionFlomoNotified } from "./db";

const LS_WEBHOOK = "rumi_flomo_webhook";
const LS_MODE = "rumi_flomo_mode"; // "direct" | "proxy"

export function getStoredWebhook(): string {
  return localStorage.getItem(LS_WEBHOOK) ?? "";
}

export function setStoredWebhook(url: string): void {
  localStorage.setItem(LS_WEBHOOK, url);
}

async function _postDirect(webhook: string, content: string): Promise<boolean> {
  try {
    const resp = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

async function _postViaProxy(webhook: string, content: string): Promise<boolean> {
  try {
    const resp = await fetch(`${import.meta.env.BASE_URL}api/flomo/proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhook, content }),
    });
    const data = await resp.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

/**
 * Post a note to Flomo. Tries direct first, falls back to proxy.
 * Returns true on success.
 */
export async function postToFlomo(content: string): Promise<boolean> {
  const webhook = getStoredWebhook();
  if (!webhook) return false;

  const tagged = `#rumi\n\n${content}`;
  const cachedMode = localStorage.getItem(LS_MODE);

  if (cachedMode === "proxy") {
    return _postViaProxy(webhook, tagged);
  }

  // Try direct first
  const directOk = await _postDirect(webhook, tagged);
  if (directOk) {
    localStorage.setItem(LS_MODE, "direct");
    return true;
  }

  // Fall back to proxy
  const proxyOk = await _postViaProxy(webhook, tagged);
  if (proxyOk) {
    localStorage.setItem(LS_MODE, "proxy");
  }
  return proxyOk;
}

/**
 * Build and send a follow-up question for a past session.
 */
async function _sendFollowUp(sessionId: number, venueName: string | null, startedAt: string): Promise<boolean> {
  const d = new Date(startedAt);
  const dateStr = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  const venueStr = venueName ? `在 ${venueName}` : "在某个地方";

  const content = [
    `**${dateStr}的夜晚回顾**`,
    "",
    `昨晚${venueStr}听到的音乐，现在回想起来有什么感受？`,
    "",
    "— 你记住了哪个 set？",
    "— 有什么特别的时刻让你印象深刻？",
    "— DJ 的选曲风格如何？",
    "",
    `_session #${sessionId}_`,
  ].join("\n");

  return postToFlomo(content);
}

/**
 * Called on app open. Finds sessions from yesterday that haven't been
 * followed up on, sends them to Flomo, and marks them as notified.
 */
export async function checkPendingFollowUps(): Promise<void> {
  if (!getStoredWebhook()) return;

  try {
    const pending = await getPendingFollowUpSessions();
    for (const session of pending) {
      const sent = await _sendFollowUp(session.id, session.venue_name, session.started_at);
      if (sent) await markSessionFlomoNotified(session.id);
    }
  } catch {
    // Silently ignore — follow-ups are best-effort
  }
}
