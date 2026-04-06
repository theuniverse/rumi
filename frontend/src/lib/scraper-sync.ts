/**
 * Sync matched scraper events into Rumi's local database.
 *
 * Flow:
 * 1. Fetch events with has_followed_match=true && pushed_to_rumi=false from scraper
 * 2. Convert to Rumi event format and save locally
 * 3. Mark as pushed on the scraper side
 */

import { scraperApi } from "./scraper-api";
import type { MatchedEvent } from "./scraper-api";

const LS_SCRAPER_LAST_IMPORT = "rumi_scraper_last_import";
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Import matched scraper events into Rumi's local event store.
 * Returns the number of events imported.
 */
async function _doImport(): Promise<number> {
  let data: { items: MatchedEvent[] };
  try {
    data = await scraperApi.getMatchedEvents(true);
  } catch {
    // Scraper might not be reachable
    return 0;
  }

  if (!data.items || data.items.length === 0) return 0;

  // Dynamic import to avoid circular dependency
  const { addScraperEventToMyEvents } = await import("./db");

  let imported = 0;
  for (const event of data.items) {
    try {
      await addScraperEventToMyEvents(event);
      // Mark as pushed on scraper side
      await scraperApi.markEventPushed(event.id);
      imported++;
    } catch {
      // Skip on error (e.g. duplicate)
    }
  }

  return imported;
}

/**
 * Called on app open. Skips if imported within the last hour.
 */
export async function checkAndImportScraperEvents(): Promise<void> {
  const last = localStorage.getItem(LS_SCRAPER_LAST_IMPORT);
  if (last && Date.now() - parseInt(last) < CACHE_TTL) return;

  try {
    await _doImport();
    localStorage.setItem(LS_SCRAPER_LAST_IMPORT, String(Date.now()));
  } catch {
    // best-effort
  }
}

/**
 * Manual import from Settings — ignores the TTL cache.
 */
export async function forceImportScraperEvents(): Promise<number> {
  localStorage.removeItem(LS_SCRAPER_LAST_IMPORT);
  try {
    const count = await _doImport();
    localStorage.setItem(LS_SCRAPER_LAST_IMPORT, String(Date.now()));
    return count;
  } catch {
    return 0;
  }
}
