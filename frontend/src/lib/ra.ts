/**
 * RA (Resident Advisor) event fetching.
 *
 * Fetches upcoming events for followed artists, venues, and labels
 * via the backend proxy which parses RA's __NEXT_DATA__.
 *
 * TTL: 24 hours. Silently skips if no followed entities have an RA id.
 */

import type { RAEventRaw, Person, Place, Label } from "./types";
import { getFollowedEntities, saveEvent } from "./db";

const LS_RA_LAST_FETCH = "rumi_ra_last_fetch";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 h

interface RAEntityRequest {
  entity_type: "artist" | "venue" | "promoter";
  ra_id: string;
}

function artistSlug(ra_url: string | null): string | null {
  if (!ra_url) return null;
  const m = ra_url.match(/ra\.co\/dj\/([^/?#]+)/);
  return m ? m[1] : null;
}

function buildEntities(
  artists: Person[],
  venues: Place[],
  labels: Label[]
): RAEntityRequest[] {
  const out: RAEntityRequest[] = [];
  for (const p of artists) {
    const slug = artistSlug((p as Person & { ra_url?: string | null }).ra_url ?? null);
    if (slug) out.push({ entity_type: "artist", ra_id: slug });
  }
  for (const v of venues) {
    const ra_id = (v as Place & { ra_id?: string | null }).ra_id;
    if (ra_id) out.push({ entity_type: "venue", ra_id });
  }
  for (const l of labels) {
    if (l.ra_id) out.push({ entity_type: "promoter", ra_id: l.ra_id });
  }
  return out;
}

async function fetchFromBackend(entities: RAEntityRequest[]): Promise<RAEventRaw[]> {
  const resp = await fetch(`${import.meta.env.BASE_URL}api/ra/fetch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entities }),
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  return (data.events as RAEventRaw[]) ?? [];
}

/**
 * Fetch RA events for all followed entities and upsert into the local DB.
 * Returns the number of new events saved.
 */
async function _doRefresh(): Promise<number> {
  const { artists, venues, labels } = await getFollowedEntities();
  const entities = buildEntities(artists, venues, labels);
  if (entities.length === 0) return 0;

  const rawEvents = await fetchFromBackend(entities);
  let saved = 0;
  for (const ev of rawEvents) {
    try {
      await saveEvent(ev);
      saved++;
    } catch {
      // skip duplicates / errors silently
    }
  }
  return saved;
}

/**
 * Called on app open. Skips if fetched within the last 24 h.
 * Runs in the background — does not block rendering.
 */
export async function checkAndRefreshRAEvents(): Promise<void> {
  const last = localStorage.getItem(LS_RA_LAST_FETCH);
  if (last && Date.now() - parseInt(last) < CACHE_TTL) return;

  try {
    await _doRefresh();
    localStorage.setItem(LS_RA_LAST_FETCH, String(Date.now()));
  } catch {
    // best-effort
  }
}

/**
 * Manual refresh from Settings — ignores the TTL cache.
 * Returns the number of new events saved.
 */
export async function forceRefreshRAEvents(): Promise<number> {
  localStorage.removeItem(LS_RA_LAST_FETCH);
  try {
    const count = await _doRefresh();
    localStorage.setItem(LS_RA_LAST_FETCH, String(Date.now()));
    return count;
  } catch {
    return 0;
  }
}
