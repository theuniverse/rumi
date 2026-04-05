/**
 * Content script — injected into https://mp.weixin.qq.com/s/* pages.
 *
 * WeChat's article body (#js_content) is populated asynchronously by their
 * SPA framework, even after document_idle. We use a MutationObserver to wait
 * for it, then notify the service worker that this tab is ready to extract.
 */

const CONTENT_SELECTOR = "#js_content";
const MIN_CONTENT_LENGTH = 100;
const READY_TIMEOUT_MS = 15000;

let contentReady = false;
let observerTimer = null;

function sendToSW(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Service worker may not be listening yet — safe to ignore
  });
}

function reportReady() {
  if (contentReady) return;
  contentReady = true;
  if (observerTimer) clearTimeout(observerTimer);
  sendToSW({ type: "CONTENT_READY" });
}

function reportError(error) {
  if (contentReady) return;
  contentReady = true;
  if (observerTimer) clearTimeout(observerTimer);
  sendToSW({ type: "EXTRACT_ERROR", error });
}

function extractText() {
  const el = document.querySelector(CONTENT_SELECTOR);
  if (!el) return null;
  return el.innerText.trim();
}

function checkReady() {
  const text = extractText();
  if (text && text.length >= MIN_CONTENT_LENGTH) {
    reportReady();
    return true;
  }
  return false;
}

// --- Wait for #js_content to populate ---
if (!checkReady()) {
  const observer = new MutationObserver(() => {
    if (checkReady()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  observerTimer = setTimeout(() => {
    observer.disconnect();
    // One final check before giving up
    if (!checkReady()) {
      reportError("Timed out waiting for article content (#js_content)");
    }
  }, READY_TIMEOUT_MS);
}

// --- Handle EXTRACT request from service worker ---
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== "EXTRACT") return false;

  const text = extractText();

  if (!text || text.length < 50) {
    sendResponse({
      type: "EXTRACT_ERROR",
      error: text
        ? "Content too short — page may be blocked or require verification"
        : "Article element (#js_content) not found",
    });
    return true;
  }

  sendResponse({ type: "EXTRACT_RESULT", text });
  return true;
});
