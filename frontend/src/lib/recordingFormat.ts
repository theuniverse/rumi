import type { Recording } from "./types";

function toLocalDate(iso: string): Date {
  return new Date(iso.replace(" ", "T") + "Z");
}

function formatDate(iso: string): string {
  const d = toLocalDate(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function formatDuration(startedAt: string, endedAt: string | null): string | null {
  if (!endedAt) return null;
  const secs = Math.round(
    (toLocalDate(endedAt).getTime() - toLocalDate(startedAt).getTime()) / 1000
  );
  if (secs < 1) return null;
  if (secs < 60) return `${secs}s`;
  return `${Math.round(secs / 60)}min`;
}

/** "3月30日_Shelter" or "3月30日" if no venue */
export function recordingTitle(r: Pick<Recording, "started_at"> & { venue_name?: string | null }): string {
  const date = formatDate(r.started_at);
  return r.venue_name ? `${date}_${r.venue_name}` : date;
}

/** "Tech House · 138 bpm · 45min" */
export function recordingMeta(r: Pick<Recording, "dominant_genre" | "avg_bpm" | "started_at" | "ended_at">): string {
  const parts: string[] = [];
  if (r.dominant_genre) parts.push(r.dominant_genre);
  if (r.avg_bpm) parts.push(`${r.avg_bpm} bpm`);
  const dur = formatDuration(r.started_at, r.ended_at);
  if (dur) parts.push(dur);
  return parts.join(" · ");
}
