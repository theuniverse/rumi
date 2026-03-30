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
  created_at: string;
  /** Populated when fetched via getPlaces() */
  tags?: Tag[];
}

/** @deprecated Use Place instead */
export type Venue = Place;

export type PersonType = 'dj' | 'musician' | 'promoter' | 'raver' | 'other';

export interface Person {
  id: number;
  name: string;
  type: PersonType;
  city: string | null;
  instagram: string | null;   // handle only, e.g. "djname" (no @)
  ra_url: string | null;      // full Resident Advisor profile URL
  bio: string | null;
  created_at: string;
  /** Populated when fetched via getPeople() */
  tags?: Tag[];
}

export interface Session {
  id: number;
  venue_id: number | null;
  venue_name: string | null; // joined field
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

export interface AllData {
  tags: Tag[];
  venues: Venue[];
  people: Person[];
  sessions: Session[];
  recordings: Recording[];
  snapshots: AnalysisSnapshot[];
}

export type ExportableType = 'tags' | 'venues' | 'people' | 'sessions' | 'recordings' | 'snapshots';

export interface ExportData {
  _meta: { version: number; exported_at: string };
  tags?: Omit<Tag, 'children'>[];
  venues?: Place[];
  people?: Person[];
  sessions?: Session[];
  recordings?: Recording[];
  snapshots?: AnalysisSnapshot[];
  venue_tags?: { venue_id: number; tag_id: number }[];
  person_tags?: { person_id: number; tag_id: number }[];
  recording_tags?: { recording_id: number; tag_id: number }[];
}

export type ImportResult = {
  imported: Partial<Record<ExportableType, number>>;
  skipped: Partial<Record<ExportableType, number>>;
};
