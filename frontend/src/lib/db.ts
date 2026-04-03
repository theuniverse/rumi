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
import type { Tag, Place, PlaceType, Person, PersonType, Label, LabelType, Session, Recording, AnalysisSnapshot, RumiEvent, EventLineupEntry, EventStatus, RAEventRaw, AllData, ExportableType, ExportData, ImportResult } from "./types";

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

    CREATE TABLE IF NOT EXISTS people (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      type        TEXT DEFAULT 'dj' CHECK(type IN ('dj', 'musician', 'promoter', 'raver', 'other')),
      city        TEXT,
      instagram   TEXT,
      ra_url      TEXT,
      bio         TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS person_tags (
      person_id  INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      tag_id     INTEGER NOT NULL REFERENCES tags(id)   ON DELETE CASCADE,
      PRIMARY KEY (person_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS analysis_snapshots (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      recording_id  INTEGER NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
      captured_at   TEXT NOT NULL DEFAULT (datetime('now')),
      bpm           REAL,
      genre_hint    TEXT,
      confidence    REAL
    );

    CREATE TABLE IF NOT EXISTS labels (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      type        TEXT DEFAULT 'promoter' CHECK(type IN ('promoter', 'record_label')),
      city        TEXT,
      instagram   TEXT,
      ra_url      TEXT,
      ra_id       TEXT,
      bio         TEXT,
      followed    INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS label_tags (
      label_id  INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
      tag_id    INTEGER NOT NULL REFERENCES tags(id)   ON DELETE CASCADE,
      PRIMARY KEY (label_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS events (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      ra_event_id  TEXT UNIQUE,
      title        TEXT NOT NULL,
      venue_id     INTEGER REFERENCES venues(id),
      venue_name   TEXT,
      date         TEXT NOT NULL,
      start_time   TEXT,
      end_time     TEXT,
      ra_url       TEXT,
      flyer_url    TEXT,
      status       TEXT DEFAULT 'interested'
                   CHECK(status IN ('interested', 'attended', 'skipped')),
      created_at   TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS event_lineup (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      person_id   INTEGER REFERENCES people(id),
      person_name TEXT NOT NULL,
      start_time  TEXT,
      end_time    TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS event_labels (
      event_id  INTEGER NOT NULL REFERENCES events(id)  ON DELETE CASCADE,
      label_id  INTEGER NOT NULL REFERENCES labels(id)  ON DELETE CASCADE,
      PRIMARY KEY (event_id, label_id)
    );

    CREATE TABLE IF NOT EXISTS recording_people (
      recording_id  INTEGER NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
      person_id     INTEGER NOT NULL REFERENCES people(id)     ON DELETE CASCADE,
      PRIMARY KEY (recording_id, person_id)
    );
  `);
  // ── Migrations ────────────────────────────────────────────────────────────
  try { _db!.run("ALTER TABLE recordings ADD COLUMN source TEXT"); } catch { /* already exists */ }
  try { _db!.run("ALTER TABLE recordings ADD COLUMN audio_url TEXT"); } catch { /* already exists */ }
  try { _db!.run("ALTER TABLE venues ADD COLUMN followed INTEGER NOT NULL DEFAULT 0"); } catch {}
  try { _db!.run("ALTER TABLE people ADD COLUMN followed INTEGER NOT NULL DEFAULT 0"); } catch {}
  try { _db!.run("ALTER TABLE sessions ADD COLUMN event_id INTEGER REFERENCES events(id)"); } catch {}
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

// ── Default people seed ───────────────────────────────────────────────────────

const DEFAULT_PEOPLE: {
  name: string; type: PersonType; city: string | null;
  instagram: string | null; ra_url: string | null; bio: string | null;
  tags: string[];
}[] = [
  { name: "Call Super",   type: "dj", city: "Berlin", instagram: "callsuper",    ra_url: "https://ra.co/dj/callsuper",   bio: null, tags: ["Techno", "Experimental"] },
  { name: "Objekt",       type: "dj", city: "Berlin", instagram: "objekt_music", ra_url: "https://ra.co/dj/objekt",      bio: null, tags: ["Techno"] },
  { name: "Pariah",       type: "dj", city: "London", instagram: "pariahmusic",  ra_url: "https://ra.co/dj/pariah",      bio: null, tags: ["Techno", "Ambient"] },
  { name: "Black Merlin", type: "dj", city: "Berlin", instagram: "black_merlin", ra_url: "https://ra.co/dj/blackmerlin", bio: null, tags: ["Techno", "Industrial"] },
  { name: "Qiu Qiu",      type: "dj", city: null,     instagram: null,           ra_url: null,                           bio: null, tags: ["Techno"] },
  { name: "吕志良",        type: "dj", city: null,     instagram: null,           ra_url: "https://ra.co/dj/lvzhiliang",  bio: null, tags: ["Techno"] },
];

async function seedDefaultPeople(): Promise<void> {
  if (!_db) return;
  const count = query<{ c: number }>("SELECT COUNT(*) AS c FROM people")[0].c;
  if (count > 0) return;

  for (const p of DEFAULT_PEOPLE) {
    run(
      "INSERT INTO people (name, type, city, instagram, ra_url, bio) VALUES (?,?,?,?,?,?)",
      [p.name, p.type, p.city, p.instagram, p.ra_url, p.bio]
    );
    const personId = lastInsertRowid();
    for (const tagName of p.tags) {
      const tag = query<{ id: number }>("SELECT id FROM tags WHERE name = ?", [tagName]);
      if (tag.length > 0) {
        run("INSERT OR IGNORE INTO person_tags (person_id, tag_id) VALUES (?,?)", [personId, tag[0].id]);
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
    const SQL = await initSqlJs({ locateFile: (f: string) => `${import.meta.env.BASE_URL}${f}` });
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
      await seedDefaultPeople();
    } else {
      _db = new SQL.Database();
      _applySchema(_db);
      await seedDefaultTags();
      await seedDefaultPlaces();
      await seedDefaultPeople();
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

// ── People ────────────────────────────────────────────────────────────────────

export async function getPeople(): Promise<(Person & { tags: Tag[] })[]> {
  const people = query<Person>("SELECT * FROM people ORDER BY name");
  if (people.length === 0) return [];

  type PT = { person_id: number } & Omit<Tag, 'children'>;
  const rows = query<PT>(`
    SELECT pt.person_id, t.id, t.name, t.color, t.slug, t.parent_id,
           t.description, t.bpm_min, t.bpm_max, t.created_at
    FROM person_tags pt JOIN tags t ON t.id = pt.tag_id
    ORDER BY t.name
  `);
  const byPerson = new Map<number, Tag[]>();
  for (const { person_id, ...t } of rows) {
    if (!byPerson.has(person_id)) byPerson.set(person_id, []);
    byPerson.get(person_id)!.push({ ...t, children: [] });
  }
  return people.map((p) => ({ ...p, tags: byPerson.get(p.id) ?? [] }));
}

export async function createPerson(input: {
  name: string; type: PersonType;
  city?: string | null; instagram?: string | null;
  ra_url?: string | null; bio?: string | null;
}): Promise<Person> {
  run("INSERT INTO people (name, type, city, instagram, ra_url, bio) VALUES (?,?,?,?,?,?)",
    [input.name, input.type, input.city ?? null, input.instagram ?? null,
     input.ra_url ?? null, input.bio ?? null]);
  const id = lastInsertRowid();
  await _persist();
  return query<Person>("SELECT * FROM people WHERE id = ?", [id])[0];
}

export async function updatePerson(
  id: number,
  input: Partial<Pick<Person, 'name' | 'type' | 'city' | 'instagram' | 'ra_url' | 'bio'>>
): Promise<Person> {
  const fields: string[] = [];
  const vals: (string | number | null)[] = [];

  if (input.name !== undefined)   { fields.push("name = ?");      vals.push(input.name); }
  if (input.type !== undefined)   { fields.push("type = ?");      vals.push(input.type); }
  if ("city" in input)            { fields.push("city = ?");      vals.push(input.city ?? null); }
  if ("instagram" in input)       { fields.push("instagram = ?"); vals.push(input.instagram ?? null); }
  if ("ra_url" in input)          { fields.push("ra_url = ?");    vals.push(input.ra_url ?? null); }
  if ("bio" in input)             { fields.push("bio = ?");       vals.push(input.bio ?? null); }

  if (fields.length === 0) throw new Error("Nothing to update");
  run(`UPDATE people SET ${fields.join(", ")} WHERE id = ?`, [...vals, id]);
  await _persist();
  return query<Person>("SELECT * FROM people WHERE id = ?", [id])[0];
}

export async function deletePerson(id: number): Promise<void> {
  run("DELETE FROM people WHERE id = ?", [id]);
  await _persist();
}

export async function setPersonTags(personId: number, tagIds: number[]): Promise<void> {
  run("DELETE FROM person_tags WHERE person_id = ?", [personId]);
  for (const tid of tagIds) {
    run("INSERT OR IGNORE INTO person_tags (person_id, tag_id) VALUES (?,?)", [personId, tid]);
  }
  await _persist();
}

// ── Labels ────────────────────────────────────────────────────────────────────

export async function getLabels(): Promise<(Label & { tags: Tag[] })[]> {
  const labels = query<Label>("SELECT * FROM labels ORDER BY name");
  if (labels.length === 0) return [];

  type LT = { label_id: number } & Omit<Tag, 'children'>;
  const rows = query<LT>(`
    SELECT lt.label_id, t.id, t.name, t.color, t.slug, t.parent_id,
           t.description, t.bpm_min, t.bpm_max, t.created_at
    FROM label_tags lt JOIN tags t ON t.id = lt.tag_id ORDER BY t.name
  `);
  const byLabel = new Map<number, Tag[]>();
  for (const { label_id, ...t } of rows) {
    if (!byLabel.has(label_id)) byLabel.set(label_id, []);
    byLabel.get(label_id)!.push({ ...t, children: [] });
  }
  return labels.map((l) => ({ ...l, tags: byLabel.get(l.id) ?? [] }));
}

export async function createLabel(input: {
  name: string; type: LabelType;
  city?: string | null; instagram?: string | null;
  ra_url?: string | null; ra_id?: string | null; bio?: string | null;
}): Promise<Label> {
  run(
    "INSERT INTO labels (name, type, city, instagram, ra_url, ra_id, bio) VALUES (?,?,?,?,?,?,?)",
    [input.name, input.type, input.city ?? null, input.instagram ?? null,
     input.ra_url ?? null, input.ra_id ?? null, input.bio ?? null]
  );
  const id = lastInsertRowid();
  await _persist();
  return query<Label>("SELECT * FROM labels WHERE id = ?", [id])[0];
}

export async function updateLabel(
  id: number,
  input: Partial<Pick<Label, 'name' | 'type' | 'city' | 'instagram' | 'ra_url' | 'ra_id' | 'bio'>>
): Promise<Label> {
  const fields: string[] = [];
  const vals: (string | number | null)[] = [];

  if (input.name !== undefined)      { fields.push("name = ?");      vals.push(input.name); }
  if (input.type !== undefined)      { fields.push("type = ?");      vals.push(input.type); }
  if ("city" in input)               { fields.push("city = ?");      vals.push(input.city ?? null); }
  if ("instagram" in input)          { fields.push("instagram = ?"); vals.push(input.instagram ?? null); }
  if ("ra_url" in input)             { fields.push("ra_url = ?");    vals.push(input.ra_url ?? null); }
  if ("ra_id" in input)              { fields.push("ra_id = ?");     vals.push(input.ra_id ?? null); }
  if ("bio" in input)                { fields.push("bio = ?");       vals.push(input.bio ?? null); }

  if (fields.length === 0) throw new Error("Nothing to update");
  run(`UPDATE labels SET ${fields.join(", ")} WHERE id = ?`, [...vals, id]);
  await _persist();
  return query<Label>("SELECT * FROM labels WHERE id = ?", [id])[0];
}

export async function deleteLabel(id: number): Promise<void> {
  run("DELETE FROM labels WHERE id = ?", [id]);
  await _persist();
}

export async function setLabelTags(labelId: number, tagIds: number[]): Promise<void> {
  run("DELETE FROM label_tags WHERE label_id = ?", [labelId]);
  for (const tid of tagIds) {
    run("INSERT OR IGNORE INTO label_tags (label_id, tag_id) VALUES (?,?)", [labelId, tid]);
  }
  await _persist();
}

export async function setLabelFollowed(id: number, followed: boolean): Promise<void> {
  run("UPDATE labels SET followed = ? WHERE id = ?", [followed ? 1 : 0, id]);
  await _persist();
}

// ── Follow toggles ────────────────────────────────────────────────────────────

export async function setVenueFollowed(id: number, followed: boolean): Promise<void> {
  run("UPDATE venues SET followed = ? WHERE id = ?", [followed ? 1 : 0, id]);
  await _persist();
}

export async function setPersonFollowed(id: number, followed: boolean): Promise<void> {
  run("UPDATE people SET followed = ? WHERE id = ?", [followed ? 1 : 0, id]);
  await _persist();
}

export async function getFollowedEntities(): Promise<{
  artists: Person[]; venues: Place[]; labels: Label[];
}> {
  return {
    artists: query<Person>("SELECT * FROM people WHERE followed = 1 ORDER BY name"),
    venues:  query<Place>("SELECT * FROM venues WHERE followed = 1 ORDER BY name"),
    labels:  query<Label>("SELECT * FROM labels WHERE followed = 1 ORDER BY name"),
  };
}

// ── Events ────────────────────────────────────────────────────────────────────

export async function getEvents(filter?: { status?: EventStatus }): Promise<RumiEvent[]> {
  const where = filter?.status ? `WHERE e.status = '${filter.status}'` : '';
  const rows = query<RumiEvent>(`
    SELECT e.*, v.name AS venue_name
    FROM events e LEFT JOIN venues v ON v.id = e.venue_id
    ${where} ORDER BY e.date ASC, e.start_time ASC
  `);
  if (rows.length === 0) return [];

  const lineupRows = query<EventLineupEntry & { event_id: number }>(
    "SELECT * FROM event_lineup ORDER BY event_id, start_time"
  );
  const byEvent = new Map<number, EventLineupEntry[]>();
  for (const row of lineupRows) {
    if (!byEvent.has(row.event_id)) byEvent.set(row.event_id, []);
    byEvent.get(row.event_id)!.push(row);
  }
  return rows.map((e) => ({ ...e, lineup: byEvent.get(e.id) ?? [] }));
}

export async function saveEvent(input: RAEventRaw, resolvedVenueId?: number | null): Promise<RumiEvent> {
  // Upsert: if ra_event_id already saved, return existing
  if (input.ra_event_id) {
    const existing = query<{ id: number }>("SELECT id FROM events WHERE ra_event_id = ?", [input.ra_event_id]);
    if (existing.length > 0) {
      return query<RumiEvent>("SELECT * FROM events WHERE id = ?", [existing[0].id])[0];
    }
  }
  run(
    `INSERT INTO events (ra_event_id, title, venue_id, venue_name, date, start_time, end_time, ra_url, flyer_url)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [input.ra_event_id || null, input.title, resolvedVenueId ?? null,
     input.venue_name, input.date, input.start_time, input.end_time,
     input.ra_url, input.flyer_url]
  );
  const eventId = lastInsertRowid();
  for (const artist of input.lineup) {
    run(
      "INSERT INTO event_lineup (event_id, person_name) VALUES (?,?)",
      [eventId, artist.name]
    );
  }
  await _persist();
  return query<RumiEvent>("SELECT * FROM events WHERE id = ?", [eventId])[0];
}

/**
 * Save a scraper-matched event into the local Rumi events table.
 * Uses a synthetic ra_event_id prefixed with "scraper_" for dedup.
 */
export async function saveScraperEvent(scraperEvent: {
  id: number;
  event_name: string | null;
  event_date: string | null;
  venue: string | null;
  city: string | null;
  timetable_slots: { artists: string[]; start_time: string | null; end_time: string | null }[];
}): Promise<void> {
  const syntheticRaId = `scraper_${scraperEvent.id}`;
  const existing = query<{ id: number }>("SELECT id FROM events WHERE ra_event_id = ?", [syntheticRaId]);
  if (existing.length > 0) return; // already imported

  run(
    `INSERT INTO events (ra_event_id, title, venue_name, date, start_time, end_time, status)
     VALUES (?,?,?,?,?,?,?)`,
    [syntheticRaId, scraperEvent.event_name, scraperEvent.venue,
     scraperEvent.event_date, null, null, "interested"]
  );
  const eventId = lastInsertRowid();

  // Flatten all artists from timetable slots into lineup
  const seen = new Set<string>();
  for (const slot of scraperEvent.timetable_slots ?? []) {
    for (const name of slot.artists ?? []) {
      if (seen.has(name)) continue;
      seen.add(name);
      run(
        "INSERT INTO event_lineup (event_id, person_name, start_time, end_time) VALUES (?,?,?,?)",
        [eventId, name, slot.start_time, slot.end_time]
      );
    }
  }

  await _persist();
}

export async function updateEventStatus(id: number, status: EventStatus): Promise<void> {
  run("UPDATE events SET status = ? WHERE id = ?", [status, id]);
  await _persist();
}

export async function deleteEvent(id: number): Promise<void> {
  run("DELETE FROM events WHERE id = ?", [id]);
  await _persist();
}

export async function getEventLineup(eventId: number): Promise<EventLineupEntry[]> {
  return query<EventLineupEntry>(
    "SELECT * FROM event_lineup WHERE event_id = ? ORDER BY start_time",
    [eventId]
  );
}

export async function setEventLineup(
  eventId: number,
  lineup: { person_name: string; person_id?: number | null; start_time?: string | null; end_time?: string | null }[]
): Promise<void> {
  run("DELETE FROM event_lineup WHERE event_id = ?", [eventId]);
  for (const entry of lineup) {
    run(
      "INSERT INTO event_lineup (event_id, person_id, person_name, start_time, end_time) VALUES (?,?,?,?,?)",
      [eventId, entry.person_id ?? null, entry.person_name, entry.start_time ?? null, entry.end_time ?? null]
    );
  }
  await _persist();
}

// ── Session attribution ───────────────────────────────────────────────────────

export async function linkSessionEvent(sessionId: number, eventId: number | null): Promise<void> {
  run("UPDATE sessions SET event_id = ? WHERE id = ?", [eventId, sessionId]);
  await _persist();
}

export async function setRecordingPeople(recordingId: number, personIds: number[]): Promise<void> {
  run("DELETE FROM recording_people WHERE recording_id = ?", [recordingId]);
  for (const pid of personIds) {
    run("INSERT OR IGNORE INTO recording_people (recording_id, person_id) VALUES (?,?)", [recordingId, pid]);
  }
  await _persist();
}

export async function getRecordingPeople(recordingId: number): Promise<Person[]> {
  return query<Person>(`
    SELECT p.* FROM people p
    JOIN recording_people rp ON rp.person_id = p.id
    WHERE rp.recording_id = ? ORDER BY p.name
  `, [recordingId]);
}

/** Find existing Person by name or create from lineup entry. */
export async function findOrCreatePersonFromLineup(name: string, raId?: string): Promise<Person> {
  const existing = query<Person>("SELECT * FROM people WHERE name = ?", [name]);
  if (existing.length > 0) return existing[0];
  const ra_url = raId ? `https://ra.co/dj/${raId}` : null;
  run(
    "INSERT INTO people (name, type, ra_url) VALUES (?,?,?)",
    [name, 'dj', ra_url]
  );
  const id = lastInsertRowid();
  await _persist();
  return query<Person>("SELECT * FROM people WHERE id = ?", [id])[0];
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function getSessions(): Promise<Session[]> {
  return query<Session>(`
    SELECT s.*, v.name AS venue_name, e.title AS event_title
    FROM sessions s
    LEFT JOIN venues v ON v.id = s.venue_id
    LEFT JOIN events e ON e.id = s.event_id
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
    `SELECT r.*, v.name AS venue_name
     FROM recordings r
     LEFT JOIN sessions s ON s.id = r.session_id
     LEFT JOIN venues v ON v.id = s.venue_id
     WHERE r.source = ? AND r.ended_at IS NOT NULL
     ORDER BY r.started_at DESC LIMIT ?`,
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
    people:     query<{ c: number }>("SELECT COUNT(*) AS c FROM people")[0].c,
    labels:     query<{ c: number }>("SELECT COUNT(*) AS c FROM labels")[0].c,
    events:     query<{ c: number }>("SELECT COUNT(*) AS c FROM events")[0].c,
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
  if (types.includes('people')) {
    result.people = query<Person>(
      "SELECT id, name, type, city, instagram, ra_url, bio, created_at FROM people"
    );
    result.person_tags = query<{ person_id: number; tag_id: number }>(
      "SELECT person_id, tag_id FROM person_tags"
    );
  }
  if (types.includes('labels')) {
    result.labels = query<Label>(
      "SELECT id, name, type, city, instagram, ra_url, ra_id, bio, followed, created_at FROM labels"
    );
    result.label_tags = query<{ label_id: number; tag_id: number }>(
      "SELECT label_id, tag_id FROM label_tags"
    );
  }
  if (types.includes('events')) {
    result.events = query<RumiEvent>(
      "SELECT id, ra_event_id, title, venue_id, venue_name, date, start_time, end_time, ra_url, flyer_url, status, created_at FROM events"
    );
    result.event_lineup = query<EventLineupEntry>(
      "SELECT id, event_id, person_id, person_name, start_time, end_time FROM event_lineup"
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
    if (selectedTypes.includes('recordings')) { run("DELETE FROM recording_people"); run("DELETE FROM recording_tags"); run("DELETE FROM recordings"); }
    if (selectedTypes.includes('sessions'))   run("DELETE FROM sessions");
    if (selectedTypes.includes('events'))     { run("DELETE FROM event_lineup"); run("DELETE FROM event_labels"); run("DELETE FROM events"); }
    if (selectedTypes.includes('venues'))     { run("DELETE FROM venue_tags"); run("DELETE FROM venues"); }
    if (selectedTypes.includes('people'))     { run("DELETE FROM person_tags"); run("DELETE FROM people"); }
    if (selectedTypes.includes('labels'))     { run("DELETE FROM label_tags"); run("DELETE FROM labels"); }
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

  // Step 2b: People (dedup by name)
  const personIdMap   = new Map<number, number>();
  if (selectedTypes.includes('people') && data.people) {
    let imp = 0, skip = 0;
    for (const person of data.people) {
      const existing = query<{ id: number }>(
        "SELECT id FROM people WHERE name = ?", [person.name]
      );
      if (existing.length > 0) {
        personIdMap.set(person.id, existing[0].id);
        skip++;
      } else {
        run(
          "INSERT INTO people (name, type, city, instagram, ra_url, bio) VALUES (?,?,?,?,?,?)",
          [person.name, person.type ?? 'dj', person.city, person.instagram,
           person.ra_url, person.bio]
        );
        const newId = lastInsertRowid();
        personIdMap.set(person.id, newId);
        imp++;
      }
    }
    if (data.person_tags) {
      for (const pt of data.person_tags) {
        const newPersonId = personIdMap.get(pt.person_id);
        const newTagId    = tagIdMap.get(pt.tag_id);
        if (newPersonId == null || newTagId == null) continue;
        run("INSERT OR IGNORE INTO person_tags (person_id, tag_id) VALUES (?,?)", [newPersonId, newTagId]);
      }
    }
    imported.people = imp;
    skipped.people  = skip;
  } else {
    for (const row of query<{ id: number }>("SELECT id FROM people")) {
      personIdMap.set(row.id, row.id);
    }
  }

  // Step 2c: Labels (dedup by name)
  const labelIdMap = new Map<number, number>();
  if (selectedTypes.includes('labels') && data.labels) {
    let imp = 0, skip = 0;
    for (const label of data.labels) {
      const existing = query<{ id: number }>("SELECT id FROM labels WHERE name = ?", [label.name]);
      if (existing.length > 0) {
        labelIdMap.set(label.id, existing[0].id);
        skip++;
      } else {
        run(
          "INSERT INTO labels (name, type, city, instagram, ra_url, ra_id, bio, followed) VALUES (?,?,?,?,?,?,?,?)",
          [label.name, label.type ?? 'promoter', label.city, label.instagram,
           label.ra_url, label.ra_id, label.bio, label.followed ?? 0]
        );
        const newId = lastInsertRowid();
        labelIdMap.set(label.id, newId);
        imp++;
      }
    }
    if (data.label_tags) {
      for (const lt of data.label_tags) {
        const newLabelId = labelIdMap.get(lt.label_id);
        const newTagId   = tagIdMap.get(lt.tag_id);
        if (newLabelId == null || newTagId == null) continue;
        run("INSERT OR IGNORE INTO label_tags (label_id, tag_id) VALUES (?,?)", [newLabelId, newTagId]);
      }
    }
    imported.labels = imp;
    skipped.labels  = skip;
  } else {
    for (const row of query<{ id: number }>("SELECT id FROM labels")) {
      labelIdMap.set(row.id, row.id);
    }
  }

  // Step 2d: Events (dedup by ra_event_id)
  const eventIdMap = new Map<number, number>();
  if (selectedTypes.includes('events') && data.events) {
    let imp = 0, skip = 0;
    for (const ev of data.events) {
      const newVenueId = ev.venue_id != null ? (venueIdMap.get(ev.venue_id) ?? null) : null;
      const existing = ev.ra_event_id
        ? query<{ id: number }>("SELECT id FROM events WHERE ra_event_id = ?", [ev.ra_event_id])
        : [];
      if (existing.length > 0) {
        eventIdMap.set(ev.id, existing[0].id);
        skip++;
      } else {
        run(
          `INSERT INTO events (ra_event_id, title, venue_id, venue_name, date, start_time, end_time, ra_url, flyer_url, status)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [ev.ra_event_id, ev.title, newVenueId, ev.venue_name, ev.date,
           ev.start_time, ev.end_time, ev.ra_url, ev.flyer_url, ev.status ?? 'interested']
        );
        const newId = lastInsertRowid();
        eventIdMap.set(ev.id, newId);
        imp++;
      }
    }
    if (data.event_lineup) {
      for (const entry of data.event_lineup) {
        const newEventId  = eventIdMap.get(entry.event_id);
        const newPersonId = entry.person_id != null ? (personIdMap.get(entry.person_id) ?? null) : null;
        if (newEventId == null) continue;
        run(
          "INSERT INTO event_lineup (event_id, person_id, person_name, start_time, end_time) VALUES (?,?,?,?,?)",
          [newEventId, newPersonId, entry.person_name, entry.start_time, entry.end_time]
        );
      }
    }
    imported.events = imp;
    skipped.events  = skip;
  } else {
    for (const row of query<{ id: number }>("SELECT id FROM events")) {
      eventIdMap.set(row.id, row.id);
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
        const newEventId = session.event_id != null ? (eventIdMap.get(session.event_id) ?? null) : null;
        run(
          "INSERT INTO sessions (venue_id, event_id, started_at, ended_at, notes, flomo_notified) VALUES (?,?,?,?,?,?)",
          [newVenueId, newEventId, session.started_at, session.ended_at, session.notes, session.flomo_notified ?? 0]
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
    if (data.recording_people) {
      for (const rp of data.recording_people) {
        const newRecordingId = recordingIdMap.get(rp.recording_id);
        const newPersonId    = personIdMap.get(rp.person_id);
        if (newRecordingId == null || newPersonId == null) continue;
        run("INSERT OR IGNORE INTO recording_people (recording_id, person_id) VALUES (?,?)", [newRecordingId, newPersonId]);
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
    people: query<Person>("SELECT * FROM people"),
    sessions: query<Session>("SELECT * FROM sessions"),
    recordings: query<Recording>("SELECT * FROM recordings"),
    snapshots: query<AnalysisSnapshot>("SELECT * FROM analysis_snapshots"),
  };
}

export async function clearAllData(): Promise<void> {
  if (!_db) return;
  _db.run(`
    DELETE FROM analysis_snapshots;
    DELETE FROM recording_people;
    DELETE FROM recording_tags;
    DELETE FROM recordings;
    DELETE FROM sessions;
    DELETE FROM event_lineup;
    DELETE FROM event_labels;
    DELETE FROM events;
    DELETE FROM venue_tags;
    DELETE FROM venues;
    DELETE FROM person_tags;
    DELETE FROM people;
    DELETE FROM label_tags;
    DELETE FROM labels;
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
