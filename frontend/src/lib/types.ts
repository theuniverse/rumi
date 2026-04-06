// ── Domain types matching the browser SQLite schema ──────────────────────────

export interface Tag {
  id: number;
  name: string;
  slug: string;
  parent_id: number | null;
  description: string | null;
  color: string | null;
  bpm_min: number | null;
  bpm_max: number | null;
  created_at: string;
  /** Populated only when querying the tree view */
  children: Tag[];
}

export type PlaceType = 'venue' | 'club' | 'other';

export interface Place {
  id: number;
  name: string;
  type: PlaceType;
  address: string | null;
  city: string;
  latitude: number | null;
  longitude: number | null;
  ra_id: string | null;
  amap_id: string | null;
  source: string | null;
  followed?: number;              // 0 | 1 - for event recommendations
  scraper_venue_id?: number | null; // Link to scraper RefVenue
  created_at: string;
  /** Populated when fetched via getPlaces() */
  tags?: Tag[];
}

/** @deprecated Use Place instead */
export type Venue = Place;

export type PersonType = 'dj' | 'musician' | 'promoter' | 'raver' | 'other';

export type LabelType = 'promoter' | 'record_label';

export interface Label {
  id: number;
  name: string;
  type: LabelType;
  city: string | null;
  instagram: string | null;
  ra_url: string | null;
  ra_id: string | null;       // RA slug for event fetching
  bio: string | null;
  followed: number;           // 0 | 1
  scraper_label_id?: number | null; // Link to scraper RefLabel
  created_at: string;
  /** Populated when fetched via getLabels() */
  tags?: Tag[];
}

export interface Person {
  id: number;
  name: string;
  type: PersonType;
  city: string | null;
  instagram: string | null;   // handle only, e.g. "djname" (no @)
  ra_url: string | null;      // full Resident Advisor profile URL
  bio: string | null;
  followed?: number;              // 0 | 1 - for event recommendations
  scraper_artist_id?: number | null; // Link to scraper RefArtist
  created_at: string;
  /** Populated when fetched via getPeople() */
  tags?: Tag[];
}

export interface Session {
  id: number;
  venue_id: number | null;
  venue_name: string | null;  // joined field
  event_id: number | null;
  event_title?: string | null; // joined field
  started_at: string;
  ended_at: string | null;
  notes: string | null;
  flomo_notified: number; // 0 | 1
  created_at: string;
}

export interface Recording {
  id: number;
  session_id: number | null;
  started_at: string;
  ended_at: string | null;
  avg_bpm: number | null;
  min_bpm: number | null;
  max_bpm: number | null;
  dominant_genre: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  source: string | null;   // 'live' | 'video' | null
  audio_url: string | null;
  created_at: string;
  /** Joined from sessions → venues, populated by getRecentRecordings */
  venue_name?: string | null;
}

export interface AnalysisSnapshot {
  id: number;
  recording_id: number;
  captured_at: string;
  bpm: number | null;
  genre_hint: string | null;
  confidence: number | null;
}

export type EventStatus = 'interested' | 'attended' | 'skipped';
export type EventSource = 'manual' | 'scraper' | 'ra_sync';

/** Named RumiEvent to avoid collision with the DOM Event type */
export interface RumiEvent {
  id: number;
  ra_event_id: string | null;
  title: string;
  venue_id: number | null;
  venue_name: string | null;
  date: string;                // "YYYY-MM-DD"
  start_time: string | null;
  end_time: string | null;
  ra_url: string | null;
  flyer_url: string | null;
  status: EventStatus;
  source?: EventSource;        // Origin of the event (manual, scraper, ra_sync)
  scraper_event_id?: number | null; // Link to scraper ExtractedEvent for deduplication
  created_at: string;
  lineup?: EventLineupEntry[];
}

export interface EventLineupEntry {
  id: number;
  event_id: number;
  person_id: number | null;   // NULL until linked to a Person record
  person_name: string;        // RA original name (denormalized)
  start_time: string | null;
  end_time: string | null;
}

/** Raw event shape returned by the /api/ra/fetch backend endpoint */
export interface RAEventRaw {
  ra_event_id: string;
  title: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  venue_name: string | null;
  venue_ra_id: string | null;
  ra_url: string | null;
  flyer_url: string | null;
  lineup: { name: string; ra_id: string }[];
  labels: string[];
}

export interface AllData {
  tags: Tag[];
  venues: Venue[];
  people: Person[];
  sessions: Session[];
  recordings: Recording[];
  snapshots: AnalysisSnapshot[];
}

export type ExportableType =
  'tags' | 'venues' | 'people' | 'labels' | 'events' | 'sessions' | 'recordings' | 'snapshots';

export interface ExportData {
  _meta: { version: number; exported_at: string };
  tags?: Omit<Tag, 'children'>[];
  venues?: Place[];
  people?: Person[];
  labels?: Label[];
  events?: RumiEvent[];
  sessions?: Session[];
  recordings?: Recording[];
  snapshots?: AnalysisSnapshot[];
  venue_tags?: { venue_id: number; tag_id: number }[];
  person_tags?: { person_id: number; tag_id: number }[];
  label_tags?: { label_id: number; tag_id: number }[];
  event_lineup?: EventLineupEntry[];
  recording_tags?: { recording_id: number; tag_id: number }[];
  recording_people?: { recording_id: number; person_id: number }[];
}

export type ImportResult = {
  imported: Partial<Record<ExportableType, number>>;
  skipped: Partial<Record<ExportableType, number>>;
};
