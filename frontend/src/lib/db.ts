/**
 * Browser SQLite (sql.js) — all structured data for Rumi.
 *
 * Persistence: the SQLite DB is serialised to a Uint8Array and stored in
 * IndexedDB under the key "rumi_db" after every write operation.
 * On startup, main.tsx awaits initDB() before rendering.
 */

// sql.js ships as a UMD bundle; handle both ESM default and CJS interop
import * as SqlJsModule from "sql.js";
import type { Database, SqlJsStatic } from "sql.js";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const initSqlJs: (config?: { locateFile?: (f: string) => string }) => Promise<SqlJsStatic> =
  (SqlJsModule as any).default ?? SqlJsModule;
import type { Tag, Place, PlaceType, Session, Recording, AnalysisSnapshot, AllData, ExportableType, ExportData, ImportResult } from "./types";

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

const IDB_NAME = "rumi";
const IDB_STORE = "kv";
const IDB_KEY = "rumi_db";

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<Uint8Array | null> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function idbSet(key: string, value: Uint8Array): Promise<void> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const req = tx.objectStore(IDB_STORE).put(value, key);
    req.onsuccess = () => { db.close(); resolve(); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

// ── Module state ──────────────────────────────────────────────────────────────

let _db: Database | null = null;
let _initPromise: Promise<void> | null = null;

/** Serialised write queue — prevents concurrent IDB writes from racing. */
let _persistQueue: Promise<void> = Promise.resolve();

async function _persist(): Promise<void> {
  if (!_db) return;
  const data = _db.export();
  _persistQueue = _persistQueue.then(() => idbSet(IDB_KEY, data));
  return _persistQueue;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Execute a SELECT and return plain objects. */
function query<T>(sql: string, params: (string | number | null)[] = []): T[] {
  if (!_db) throw new Error("DB not initialised");
  const stmt = _db.prepare(sql);
  stmt.bind(params);
  const rows: T[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as unknown as T);
  }
  stmt.free();
  return rows;
}

/** Execute one statement (INSERT / UPDATE / DELETE). */
function run(sql: string, params: (string | number | null)[] = []): void {
  if (!_db) throw new Error("DB not initialised");
  _db.run(sql, params);
}

function lastInsertRowid(): number {
  return query<{ id: number }>("SELECT last_insert_rowid() AS id")[0].id;
}

// ── Schema DDL ────────────────────────────────────────────────────────────────

function _applySchema(db: Database): void {
  db.run("PRAGMA foreign_keys = ON");
  db.run(`
    CREATE TABLE IF NOT EXISTS tags (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      slug        TEXT NOT NULL UNIQUE,
      parent_id   INTEGER REFERENCES tags(id) ON DELETE CASCADE,
      description TEXT,
      color       TEXT DEFAULT '#8a8a8a',
      bpm_min     INTEGER,
      bpm_max     INTEGER,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS venues (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      type        TEXT DEFAULT 'club' CHECK(type IN ('venue', 'club', 'other')),
      address     TEXT,
      city        TEXT DEFAULT 'Shanghai',
      latitude    REAL,
      longitude   REAL,
      ra_id       TEXT,
      amap_id     TEXT,
      source      TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      venue_id        INTEGER REFERENCES venues(id),
      started_at      TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at        TEXT,
      notes           TEXT,
      flomo_notified  INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recordings (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id      INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
      started_at      TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at        TEXT,
      avg_bpm         REAL,
      min_bpm         REAL,
      max_bpm         REAL,
      dominant_genre  TEXT,
      latitude        REAL,
      longitude       REAL,
      notes           TEXT,
      source          TEXT,
      audio_url       TEXT,
      created_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recording_tags (
      recording_id  INTEGER NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
      tag_id        INTEGER NOT NULL REFERENCES tags(id)       ON DELETE CASCADE,
      PRIMARY KEY (recording_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS venue_tags (
      venue_id  INTEGER NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      tag_id    INTEGER NOT NULL REFERENCES tags(id)   ON DELETE CASCADE,
      PRIMARY KEY (venue_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS analysis_snapshots (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      recording_id  INTEGER NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
      captured_at   TEXT NOT NULL DEFAULT (datetime('now')),
      bpm           REAL,
      genre_hint    TEXT,
      confidence    REAL
    );
  `);
  // ── Migrations ────────────────────────────────────────────────────────────
  try { _db!.run("ALTER TABLE recordings ADD COLUMN source TEXT"); } catch { /* already exists */ }
  try { _db!.run("ALTER TABLE recordings ADD COLUMN audio_url TEXT"); } catch { /* already exists */ }
}

// ── Default tag seed ──────────────────────────────────────────────────────────

const DEFAULT_TAGS: [string, string | null, number | null, number | null, string][] = [
  ["Electronic",    null,          null, null, "#6b7280"],
  ["House",         "Electronic",  118,  132,  "#7c6fcd"],
  ["Deep House",    "House",       118,  125,  "#5b8dd9"],
  ["Tech House",    "House",       125,  132,  "#4b9fd5"],
  ["Minimal House", "House",       120,  128,  "#5ba3a0"],
  ["Acid House",    "House",       122,  130,  "#c4913a"],
  ["Techno",        "Electronic",  130,  145,  "#9b8ea0"],
  ["Detroit Techno","Techno",      130,  140,  "#8a7fa8"],
  ["Hard Techno",   "Techno",      138,  150,  "#c45858"],
  ["Industrial",    "Techno",      135,  150,  "#8a6060"],
  ["Minimal Techno","Techno",      128,  138,  "#7a9a8a"],
  ["Drum & Bass",   "Electronic",  160,  180,  "#5a9e6e"],
  ["Liquid DnB",    "Drum & Bass", 160,  174,  "#4d9e8a"],
  ["Neurofunk",     "Drum & Bass", 170,  180,  "#4d7a9e"],
  ["Jungle",        "Electronic",  155,  175,  "#7a9e4d"],
  ["Ambient",       "Electronic",  null, 90,   "#8a9aaa"],
  ["Experimental",  "Electronic",  null, null, "#aaaaaa"],
  ["Breaks",        "Electronic",  120,  145,  "#c4a050"],
  ["UK Garage",     "Electronic",  128,  136,  "#c0c050"],
  ["Trance",        "Electronic",  138,  145,  "#8a50c4"],
  ["Psytrance",     "Trance",      143,  150,  "#a050c4"],
  ["Hip-Hop",       null,          85,   105,  "#c4b050"],
  ["Jazz",          null,          null, null, "#c4a070"],
];

export async function seedDefaultTags(): Promise<void> {
  if (!_db) return;
  const nameToId: Record<string, number> = {};

  for (const [name, parentName, bpmMin, bpmMax, color] of DEFAULT_TAGS) {
    const sl = slugify(name);
    const existing = query<{ id: number }>("SELECT id FROM tags WHERE slug = ?", [sl]);
    if (existing.length > 0) {
      nameToId[name] = existing[0].id;
      continue;
    }
    const parentId = parentName ? (nameToId[parentName] ?? null) : null;
    run(
      "INSERT OR IGNORE INTO tags (name, slug, parent_id, color, bpm_min, bpm_max) VALUES (?,?,?,?,?,?)",
      [name, sl, parentId, color, bpmMin, bpmMax]
    );
    const id = lastInsertRowid();
    nameToId[name] = id;
  }
  await _persist();
}

// ── Default place seed ────────────────────────────────────────────────────────

const DEFAULT_PLACES: { name: string; type: PlaceType; address: string; tags: string[] }[] = [
  { name: "Potent",      type: "club",  address: "淮海中路 TX淮海 3楼", tags: ["Techno"] },
  { name: "Dirty House", type: "club",  address: "INS新乐园 4楼",       tags: ["Techno"] },
  { name: "Heim",        type: "club",  address: "南阳路",               tags: ["Techno", "House"] },
  { name: "Wigwam",      type: "venue", address: "昭化路618号",          tags: ["Ambient"] },
  { name: "Reactor",     type: "club",  address: "昭化路618号",          tags: [] },
  { name: "Exit",        type: "club",  address: "幸福路",               tags: [] },
];

async function seedDefaultPlaces(): Promise<void> {
  if (!_db) return;
  const count = query<{ c: number }>("SELECT COUNT(*) AS c FROM venues")[0].c;
  if (count > 0) {
    // Migration: add type column to existing venues if it doesn't exist
    try {
      run("UPDATE venues SET type = 'club' WHERE type IS NULL");
    } catch (e) {
      // Column might not exist yet, will be added by schema
    }
    return;
  }

  for (const p of DEFAULT_PLACES) {
    run("INSERT INTO venues (name, type, address, city) VALUES (?,?,?,?)", [p.name, p.type, p.address, "Shanghai"]);
    const placeId = lastInsertRowid();
    for (const tagName of p.tags) {
      const tag = query<{ id: number }>("SELECT id FROM tags WHERE name = ?", [tagName]);
      if (tag.length > 0) {
        run("INSERT OR IGNORE INTO venue_tags (venue_id, tag_id) VALUES (?,?)", [placeId, tag[0].id]);
      }
    }
  }
  await _persist();
}

// ── Init ──────────────────────────────────────────────────────────────────────

export async function initDB(): Promise<void> {
  if (_db) return;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const SQL = await initSqlJs({ locateFile: (f: string) => `/${f}` });
    const saved = await idbGet(IDB_KEY);

    if (saved) {
      _db = new SQL.Database(saved);
      // Ensure foreign keys are on for every connection
      _db.run("PRAGMA foreign_keys = ON");

      // Migration: Add type column to existing venues table if it doesn't exist
      try {
        const columns = query<{ name: string }>("PRAGMA table_info(venues)");
        const hasTypeColumn = columns.some(col => col.name === 'type');
        if (!hasTypeColumn) {
          console.log("Migrating venues table: adding type column");
          run("ALTER TABLE venues ADD COLUMN type TEXT DEFAULT 'club' CHECK(type IN ('venue', 'club', 'other'))");
          run("UPDATE venues SET type = 'club' WHERE type IS NULL");
          await _persist();
        }
      } catch (e) {
        console.error("Migration error:", e);
      }

      // Ensure schema is up-to-date (idempotent via IF NOT EXISTS)
      _applySchema(_db);
      // Seed defaults for users who had an existing DB before these were added
      await seedDefaultTags();
      await seedDefaultPlaces();
    } else {
      _db = new SQL.Database();
      _applySchema(_db);
      await seedDefaultTags();
      await seedDefaultPlaces();
    }
  })();

  return _initPromise;
}

// ── Tags ──────────────────────────────────────────────────────────────────────

export async function getTags(): Promise<Tag[]> {
  return query<Tag>(
    "SELECT id,name,slug,parent_id,description,color,bpm_min,bpm_max,created_at FROM tags ORDER BY name"
  ).map((t) => ({ ...t, children: [] }));
}

export async function getTagTree(): Promise<Tag[]> {
  const all = await getTags();
  const map = new Map(all.map((t) => [t.id, t]));
  const roots: Tag[] = [];
  for (const tag of all) {
    if (tag.parent_id == null) {
      roots.push(tag);
    } else {
      const parent = map.get(tag.parent_id);
      if (parent) parent.children.push(tag);
    }
  }
  return roots;
}

export async function createTag(input: {
  name: string;
  parent_id?: number | null;
  description?: string | null;
  color?: string;
  bpm_min?: number | null;
  bpm_max?: number | null;
}): Promise<Tag> {
  const sl = slugify(input.name);
  const collision = query<{ id: number }>("SELECT id FROM tags WHERE slug = ?", [sl]);
  if (collision.length > 0) throw new Error(`Tag "${input.name}" already exists`);

  run(
    "INSERT INTO tags (name, slug, parent_id, description, color, bpm_min, bpm_max) VALUES (?,?,?,?,?,?,?)",
    [input.name, sl, input.parent_id ?? null, input.description ?? null,
     input.color ?? "#8a8a8a", input.bpm_min ?? null, input.bpm_max ?? null]
  );
  const id = lastInsertRowid();
  await _persist();
  return query<Tag>("SELECT *,'' AS children FROM tags WHERE id = ?", [id]).map((t) => ({
    ...t, children: [],
  }))[0];
}

export async function updateTag(
  id: number,
  input: Partial<Pick<Tag, "name" | "parent_id" | "description" | "color" | "bpm_min" | "bpm_max">>
): Promise<Tag> {
  const fields: string[] = [];
  const vals: (string | number | null)[] = [];

  if (input.name !== undefined) {
    fields.push("name = ?", "slug = ?");
    vals.push(input.name, slugify(input.name));
  }
  if ("parent_id" in input) { fields.push("parent_id = ?"); vals.push(input.parent_id ?? null); }
  if ("description" in input) { fields.push("description = ?"); vals.push(input.description ?? null); }
  if ("color" in input) { fields.push("color = ?"); vals.push(input.color ?? null); }
  if ("bpm_min" in input) { fields.push("bpm_min = ?"); vals.push(input.bpm_min ?? null); }
  if ("bpm_max" in input) { fields.push("bpm_max = ?"); vals.push(input.bpm_max ?? null); }

  if (fields.length === 0) throw new Error("Nothing to update");
  run(`UPDATE tags SET ${fields.join(", ")} WHERE id = ?`, [...vals, id]);
  await _persist();
  return query<Tag>("SELECT * FROM tags WHERE id = ?", [id]).map((t) => ({ ...t, children: [] }))[0];
}

export async function deleteTag(id: number): Promise<void> {
  run("DELETE FROM tags WHERE id = ?", [id]);
  await _persist();
}

// ── Places (Venues) ───────────────────────────────────────────────────────────

export async function getPlaces(): Promise<(Place & { session_count: number; tags: Tag[] })[]> {
  const places = query<Place & { session_count: number }>(`
    SELECT v.*, COUNT(s.id) AS session_count
    FROM venues v
    LEFT JOIN sessions s ON s.venue_id = v.id
    GROUP BY v.id
    ORDER BY v.name
  `);
  if (places.length === 0) return [];

  type VT = { venue_id: number } & Omit<Tag, "children">;
  const rows = query<VT>(`
    SELECT vt.venue_id, t.id, t.name, t.color, t.slug, t.parent_id,
           t.description, t.bpm_min, t.bpm_max, t.created_at
    FROM venue_tags vt JOIN tags t ON t.id = vt.tag_id
    ORDER BY t.name
  `);
  const byPlace = new Map<number, Tag[]>();
  for (const { venue_id, ...t } of rows) {
    if (!byPlace.has(venue_id)) byPlace.set(venue_id, []);
    byPlace.get(venue_id)!.push({ ...t, children: [] });
  }
  return places.map((p) => ({ ...p, tags: byPlace.get(p.id) ?? [] }));
}

export async function setPlaceTags(placeId: number, tagIds: number[]): Promise<void> {
  run("DELETE FROM venue_tags WHERE venue_id = ?", [placeId]);
  for (const tid of tagIds) {
    run("INSERT OR IGNORE INTO venue_tags (venue_id, tag_id) VALUES (?,?)", [placeId, tid]);
  }
  await _persist();
}

export async function createPlace(input: Partial<Place> & { type: PlaceType }): Promise<Place> {
  run(
    "INSERT INTO venues (name, type, address, city, latitude, longitude) VALUES (?,?,?,?,?,?)",
    [input.name ?? "Unknown", input.type, input.address ?? null, input.city ?? "Shanghai",
     input.latitude ?? null, input.longitude ?? null]
  );
  const id = lastInsertRowid();
  await _persist();
  return query<Place>("SELECT * FROM venues WHERE id = ?", [id])[0];
}

export async function updatePlace(
  id: number,
  input: Partial<Pick<Place, "name" | "type" | "address" | "city" | "latitude" | "longitude">>
): Promise<Place> {
  const fields: string[] = [];
  const vals: (string | number | null)[] = [];

  if (input.name !== undefined) { fields.push("name = ?"); vals.push(input.name); }
  if (input.type !== undefined) { fields.push("type = ?"); vals.push(input.type); }
  if ("address" in input) { fields.push("address = ?"); vals.push(input.address ?? null); }
  if ("city" in input) { fields.push("city = ?"); vals.push(input.city ?? "Shanghai"); }
  if ("latitude" in input) { fields.push("latitude = ?"); vals.push(input.latitude ?? null); }
  if ("longitude" in input) { fields.push("longitude = ?"); vals.push(input.longitude ?? null); }

  if (fields.length === 0) throw new Error("Nothing to update");
  run(`UPDATE venues SET ${fields.join(", ")} WHERE id = ?`, [...vals, id]);
  await _persist();
  return query<Place>("SELECT * FROM venues WHERE id = ?", [id])[0];
}

export async function deletePlace(id: number): Promise<void> {
  run("DELETE FROM venues WHERE id = ?", [id]);
  await _persist();
}

/** @deprecated Use getPlaces instead */
export const getVenues = getPlaces;
/** @deprecated Use setPlaceTags instead */
export const setVenueTags = setPlaceTags;
/** @deprecated Use createPlace instead */
export const createVenue = createPlace;
/** @deprecated Use updatePlace instead */
export const updateVenue = updatePlace;
/** @deprecated Use deletePlace instead */
export const deleteVenue = deletePlace;

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function getSessions(): Promise<Session[]> {
  return query<Session>(`
    SELECT s.*, v.name AS venue_name
    FROM sessions s LEFT JOIN venues v ON v.id = s.venue_id
    ORDER BY s.started_at DESC
  `);
}

export async function createSession(input: {
  venue_id?: number | null;
  notes?: string | null;
}): Promise<Session> {
  run("INSERT INTO sessions (venue_id, notes) VALUES (?,?)",
    [input.venue_id ?? null, input.notes ?? null]);
  const id = lastInsertRowid();
  await _persist();
  return query<Session>("SELECT *, NULL AS venue_name FROM sessions WHERE id = ?", [id])[0];
}

export async function endSession(id: number): Promise<Session> {
  run("UPDATE sessions SET ended_at = datetime('now') WHERE id = ?", [id]);
  await _persist();
  return query<Session>(`
    SELECT s.*, v.name AS venue_name FROM sessions s
    LEFT JOIN venues v ON v.id = s.venue_id WHERE s.id = ?
  `, [id])[0];
}

export async function markSessionFlomoNotified(id: number): Promise<void> {
  run("UPDATE sessions SET flomo_notified = 1 WHERE id = ?", [id]);
  await _persist();
}

export async function getPendingFollowUpSessions(): Promise<Session[]> {
  return query<Session>(`
    SELECT s.*, v.name AS venue_name
    FROM sessions s LEFT JOIN venues v ON v.id = s.venue_id
    WHERE s.flomo_notified = 0
      AND date(s.started_at) = date('now', '-1 day')
  `);
}

// ── Recordings ────────────────────────────────────────────────────────────────

export async function startRecording(input: {
  session_id?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  source?: string | null;
}): Promise<Recording> {
  run("INSERT INTO recordings (session_id, latitude, longitude, source) VALUES (?,?,?,?)",
    [input.session_id ?? null, input.latitude ?? null, input.longitude ?? null, input.source ?? null]);
  const id = lastInsertRowid();
  await _persist();
  return query<Recording>("SELECT * FROM recordings WHERE id = ?", [id])[0];
}

export async function stopRecording(
  id: number,
  stats: { avg_bpm?: number | null; min_bpm?: number | null; max_bpm?: number | null; dominant_genre?: string | null; audio_url?: string | null }
): Promise<Recording> {
  run(
    "UPDATE recordings SET ended_at = datetime('now'), avg_bpm=?, min_bpm=?, max_bpm=?, dominant_genre=?, audio_url=? WHERE id = ?",
    [stats.avg_bpm ?? null, stats.min_bpm ?? null, stats.max_bpm ?? null, stats.dominant_genre ?? null, stats.audio_url ?? null, id]
  );
  await _persist();
  return query<Recording>("SELECT * FROM recordings WHERE id = ?", [id])[0];
}

export async function updateRecordingAudioUrl(id: number, audioUrl: string): Promise<void> {
  run("UPDATE recordings SET audio_url = ? WHERE id = ?", [audioUrl, id]);
  await _persist();
}

export async function updateRecordingSession(id: number, sessionId: number | null): Promise<void> {
  run("UPDATE recordings SET session_id = ? WHERE id = ?", [sessionId, id]);
  await _persist();
}

export async function getRecordingsForSession(sessionId: number): Promise<Recording[]> {
  return query<Recording>("SELECT * FROM recordings WHERE session_id = ? ORDER BY started_at", [sessionId]);
}

export async function getRecentRecordings(source: string, limit = 3): Promise<Recording[]> {
  return query<Recording>(
    "SELECT * FROM recordings WHERE source = ? AND ended_at IS NOT NULL ORDER BY started_at DESC LIMIT ?",
    [source, limit]
  );
}

export async function deleteRecording(id: number): Promise<void> {
  run("DELETE FROM recording_tags WHERE recording_id = ?", [id]);
  run("DELETE FROM analysis_snapshots WHERE recording_id = ?", [id]);
  run("DELETE FROM recordings WHERE id = ?", [id]);
  await _persist();
}

export async function deleteSession(id: number): Promise<void> {
  const recs = query<{ id: number }>("SELECT id FROM recordings WHERE session_id = ?", [id]);
  for (const r of recs) {
    run("DELETE FROM recording_tags WHERE recording_id = ?", [r.id]);
    run("DELETE FROM analysis_snapshots WHERE recording_id = ?", [r.id]);
  }
  run("DELETE FROM recordings WHERE session_id = ?", [id]);
  run("DELETE FROM sessions WHERE id = ?", [id]);
  await _persist();
}

export async function addRecordingTags(recordingId: number, tagIds: number[]): Promise<void> {
  for (const tid of tagIds) {
    run("INSERT OR IGNORE INTO recording_tags (recording_id, tag_id) VALUES (?,?)", [recordingId, tid]);
  }
  await _persist();
}

export async function getTagsForRecording(recordingId: number): Promise<Tag[]> {
  return query<Tag>(`
    SELECT t.*, '' AS children FROM tags t
    JOIN recording_tags rt ON rt.tag_id = t.id
    WHERE rt.recording_id = ?
  `, [recordingId]).map((t) => ({ ...t, children: [] }));
}

// ── Snapshots ─────────────────────────────────────────────────────────────────

export async function addSnapshot(input: {
  recording_id: number;
  bpm: number | null;
  genre_hint: string | null;
  confidence: number | null;
}): Promise<AnalysisSnapshot> {
  run(
    "INSERT INTO analysis_snapshots (recording_id, bpm, genre_hint, confidence) VALUES (?,?,?,?)",
    [input.recording_id, input.bpm, input.genre_hint, input.confidence]
  );
  const id = lastInsertRowid();
  await _persist();
  return query<AnalysisSnapshot>("SELECT * FROM analysis_snapshots WHERE id = ?", [id])[0];
}

// ── Data management ───────────────────────────────────────────────────────────

export function getDataCounts(): Record<ExportableType, number> {
  return {
    tags:       query<{ c: number }>("SELECT COUNT(*) AS c FROM tags")[0].c,
    venues:     query<{ c: number }>("SELECT COUNT(*) AS c FROM venues")[0].c,
    sessions:   query<{ c: number }>("SELECT COUNT(*) AS c FROM sessions")[0].c,
    recordings: query<{ c: number }>("SELECT COUNT(*) AS c FROM recordings")[0].c,
    snapshots:  query<{ c: number }>("SELECT COUNT(*) AS c FROM analysis_snapshots")[0].c,
  };
}

export async function exportSelectedData(types: ExportableType[]): Promise<ExportData> {
  const result: ExportData = {
    _meta: { version: 1, exported_at: new Date().toISOString() },
  };
  if (types.includes('tags')) {
    result.tags = query<Omit<Tag, 'children'>>(
      "SELECT id, name, slug, parent_id, description, color, bpm_min, bpm_max, created_at FROM tags"
    );
  }
  if (types.includes('venues')) {
    result.venues = query<Place>(
      "SELECT id, name, type, address, city, latitude, longitude, ra_id, amap_id, source, created_at FROM venues"
    );
    result.venue_tags = query<{ venue_id: number; tag_id: number }>(
      "SELECT venue_id, tag_id FROM venue_tags"
    );
  }
  if (types.includes('sessions')) {
    result.sessions = query<Session>(
      "SELECT id, venue_id, started_at, ended_at, notes, flomo_notified, created_at FROM sessions"
    ).map(s => ({ ...s, venue_name: null }));
  }
  if (types.includes('recordings')) {
    result.recordings = query<Recording>(
      "SELECT id, session_id, started_at, ended_at, avg_bpm, min_bpm, max_bpm, dominant_genre, latitude, longitude, notes, source, audio_url, created_at FROM recordings"
    );
    result.recording_tags = query<{ recording_id: number; tag_id: number }>(
      "SELECT recording_id, tag_id FROM recording_tags"
    );
  }
  if (types.includes('snapshots')) {
    result.snapshots = query<AnalysisSnapshot>(
      "SELECT id, recording_id, captured_at, bpm, genre_hint, confidence FROM analysis_snapshots"
    );
  }
  return result;
}

export async function importData(
  data: ExportData,
  selectedTypes: ExportableType[],
  mode: 'overwrite' | 'merge'
): Promise<ImportResult> {
  const imported: Partial<Record<ExportableType, number>> = {};
  const skipped:  Partial<Record<ExportableType, number>> = {};

  // Step 0: overwrite — delete selected types in reverse dependency order
  if (mode === 'overwrite') {
    run("PRAGMA foreign_keys = OFF");
    if (selectedTypes.includes('snapshots'))  run("DELETE FROM analysis_snapshots");
    if (selectedTypes.includes('recordings')) { run("DELETE FROM recording_tags"); run("DELETE FROM recordings"); }
    if (selectedTypes.includes('sessions'))   run("DELETE FROM sessions");
    if (selectedTypes.includes('venues'))     { run("DELETE FROM venue_tags"); run("DELETE FROM venues"); }
    if (selectedTypes.includes('tags'))       run("DELETE FROM tags");
    run("PRAGMA foreign_keys = ON");
  }

  // ID remapping maps: old file ID → new DB ID
  const tagIdMap      = new Map<number, number>();
  const venueIdMap    = new Map<number, number>();
  const sessionIdMap  = new Map<number, number>();
  const recordingIdMap = new Map<number, number>();

  // Step 1: Tags (dedup by name)
  if (selectedTypes.includes('tags') && data.tags) {
    let imp = 0, skip = 0;
    // Pass 1: insert without parent_id
    for (const tag of data.tags) {
      const existing = query<{ id: number }>("SELECT id FROM tags WHERE name = ?", [tag.name]);
      if (existing.length > 0) {
        tagIdMap.set(tag.id, existing[0].id);
        skip++;
      } else {
        run(
          "INSERT INTO tags (name, slug, parent_id, description, color, bpm_min, bpm_max) VALUES (?,?,?,?,?,?,?)",
          [tag.name, slugify(tag.name), null, tag.description, tag.color ?? '#8a8a8a', tag.bpm_min, tag.bpm_max]
        );
        const newId = lastInsertRowid();
        tagIdMap.set(tag.id, newId);
        imp++;
      }
    }
    // Pass 2: wire up parent_id for newly inserted tags
    for (const tag of data.tags) {
      if (tag.parent_id == null) continue;
      const newId = tagIdMap.get(tag.id);
      const newParentId = tagIdMap.get(tag.parent_id);
      if (newId == null || newParentId == null) continue;
      run("UPDATE tags SET parent_id = ? WHERE id = ? AND parent_id IS NULL", [newParentId, newId]);
    }
    imported.tags = imp;
    skipped.tags  = skip;
  } else {
    // Build tagIdMap from existing DB even if tags not selected (needed for junction tables)
    for (const row of query<{ id: number; name: string }>("SELECT id, name FROM tags")) {
      tagIdMap.set(row.id, row.id);
    }
  }

  // Step 2: Venues (dedup by name + city)
  if (selectedTypes.includes('venues') && data.venues) {
    let imp = 0, skip = 0;
    for (const venue of data.venues) {
      const existing = query<{ id: number }>(
        "SELECT id FROM venues WHERE name = ? AND city = ?", [venue.name, venue.city]
      );
      if (existing.length > 0) {
        venueIdMap.set(venue.id, existing[0].id);
        skip++;
      } else {
        run(
          "INSERT INTO venues (name, type, address, city, latitude, longitude, ra_id, amap_id, source) VALUES (?,?,?,?,?,?,?,?,?)",
          [venue.name, venue.type ?? 'club', venue.address, venue.city,
           venue.latitude, venue.longitude, venue.ra_id, venue.amap_id, venue.source]
        );
        const newId = lastInsertRowid();
        venueIdMap.set(venue.id, newId);
        imp++;
      }
    }
    if (data.venue_tags) {
      for (const vt of data.venue_tags) {
        const newVenueId = venueIdMap.get(vt.venue_id);
        const newTagId   = tagIdMap.get(vt.tag_id);
        if (newVenueId == null || newTagId == null) continue;
        run("INSERT OR IGNORE INTO venue_tags (venue_id, tag_id) VALUES (?,?)", [newVenueId, newTagId]);
      }
    }
    imported.venues = imp;
    skipped.venues  = skip;
  } else {
    for (const row of query<{ id: number }>("SELECT id FROM venues")) {
      venueIdMap.set(row.id, row.id);
    }
  }

  // Step 3: Sessions (dedup by started_at + venue_id)
  if (selectedTypes.includes('sessions') && data.sessions) {
    let imp = 0, skip = 0;
    for (const session of data.sessions) {
      const newVenueId = session.venue_id != null ? (venueIdMap.get(session.venue_id) ?? null) : null;
      const existing = query<{ id: number }>(
        "SELECT id FROM sessions WHERE started_at = ? AND venue_id IS ?",
        [session.started_at, newVenueId]
      );
      if (existing.length > 0) {
        sessionIdMap.set(session.id, existing[0].id);
        skip++;
      } else {
        run(
          "INSERT INTO sessions (venue_id, started_at, ended_at, notes, flomo_notified) VALUES (?,?,?,?,?)",
          [newVenueId, session.started_at, session.ended_at, session.notes, session.flomo_notified ?? 0]
        );
        const newId = lastInsertRowid();
        sessionIdMap.set(session.id, newId);
        imp++;
      }
    }
    imported.sessions = imp;
    skipped.sessions  = skip;
  } else {
    for (const row of query<{ id: number }>("SELECT id FROM sessions")) {
      sessionIdMap.set(row.id, row.id);
    }
  }

  // Step 4: Recordings (dedup by started_at + session_id)
  if (selectedTypes.includes('recordings') && data.recordings) {
    let imp = 0, skip = 0;
    for (const rec of data.recordings) {
      const newSessionId = rec.session_id != null ? (sessionIdMap.get(rec.session_id) ?? null) : null;
      const existing = query<{ id: number }>(
        "SELECT id FROM recordings WHERE started_at = ? AND session_id IS ?",
        [rec.started_at, newSessionId]
      );
      if (existing.length > 0) {
        recordingIdMap.set(rec.id, existing[0].id);
        skip++;
      } else {
        run(
          `INSERT INTO recordings
             (session_id, started_at, ended_at, avg_bpm, min_bpm, max_bpm,
              dominant_genre, latitude, longitude, notes, source, audio_url)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [newSessionId, rec.started_at, rec.ended_at, rec.avg_bpm, rec.min_bpm, rec.max_bpm,
           rec.dominant_genre, rec.latitude, rec.longitude, rec.notes, rec.source, rec.audio_url]
        );
        const newId = lastInsertRowid();
        recordingIdMap.set(rec.id, newId);
        imp++;
      }
    }
    if (data.recording_tags) {
      for (const rt of data.recording_tags) {
        const newRecordingId = recordingIdMap.get(rt.recording_id);
        const newTagId       = tagIdMap.get(rt.tag_id);
        if (newRecordingId == null || newTagId == null) continue;
        run("INSERT OR IGNORE INTO recording_tags (recording_id, tag_id) VALUES (?,?)", [newRecordingId, newTagId]);
      }
    }
    imported.recordings = imp;
    skipped.recordings  = skip;
  } else {
    for (const row of query<{ id: number }>("SELECT id FROM recordings")) {
      recordingIdMap.set(row.id, row.id);
    }
  }

  // Step 5: Snapshots (dedup by recording_id + captured_at)
  if (selectedTypes.includes('snapshots') && data.snapshots) {
    let imp = 0, skip = 0;
    for (const snap of data.snapshots) {
      const newRecordingId = snap.recording_id != null ? (recordingIdMap.get(snap.recording_id) ?? null) : null;
      if (newRecordingId == null) { skip++; continue; }
      const existing = query<{ id: number }>(
        "SELECT id FROM analysis_snapshots WHERE recording_id = ? AND captured_at = ?",
        [newRecordingId, snap.captured_at]
      );
      if (existing.length > 0) {
        skip++;
      } else {
        run(
          "INSERT INTO analysis_snapshots (recording_id, captured_at, bpm, genre_hint, confidence) VALUES (?,?,?,?,?)",
          [newRecordingId, snap.captured_at, snap.bpm, snap.genre_hint, snap.confidence]
        );
        imp++;
      }
    }
    imported.snapshots = imp;
    skipped.snapshots  = skip;
  }

  await _persist();
  return { imported, skipped };
}

export async function exportAllData(): Promise<AllData> {
  return {
    tags: await getTags(),
    venues: query<Place>("SELECT * FROM venues"),
    sessions: query<Session>("SELECT * FROM sessions"),
    recordings: query<Recording>("SELECT * FROM recordings"),
    snapshots: query<AnalysisSnapshot>("SELECT * FROM analysis_snapshots"),
  };
}

export async function clearAllData(): Promise<void> {
  if (!_db) return;
  _db.run(`
    DELETE FROM analysis_snapshots;
    DELETE FROM recording_tags;
    DELETE FROM recordings;
    DELETE FROM sessions;
    DELETE FROM venue_tags;
    DELETE FROM venues;
    DELETE FROM tags;
  `);
  await _persist();
}

export async function pruneSnapshots(olderThanDays: number): Promise<number> {
  if (!_db) return 0;
  const before = query<{ c: number }>(
    "SELECT COUNT(*) AS c FROM analysis_snapshots WHERE captured_at < datetime('now', ?)",
    [`-${olderThanDays} days`]
  )[0].c;
  run("DELETE FROM analysis_snapshots WHERE captured_at < datetime('now', ?)",
    [`-${olderThanDays} days`]);
  await _persist();
  return before;
}
