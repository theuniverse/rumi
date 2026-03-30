import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Circle, Square, MapPin, Tag, Navigation, Save, Check, X, Loader2, Plus, Trash2, Play } from "lucide-react";
import { useAudioAnalyzer } from "../hooks/useAudioAnalyzer";
import {
  startRecording, stopRecording, addRecordingTags,
  getTagTree, getPlaces, createSession, createPlace, updateRecordingSession,
  getRecentRecordings, deleteRecording, updateRecordingAudioUrl,
  Tag as TagType, Place, PlaceType, Recording,
} from "../lib/api";
import { findNearbyPlaces, formatDistance, getCurrentLocation, PlaceWithDistance } from "../lib/location";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useAudioPlayer } from "../contexts/AudioPlayerContext";
import { recordingTitle, recordingMeta } from "../lib/recordingFormat";

// ── Waveform canvas ───────────────────────────────────────────────────────────
function Waveform({ data, active }: { data: number[]; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    const barW = W / data.length;
    data.forEach((amp, i) => {
      const barH = Math.max(2, amp * H * 0.85);
      const y = (H - barH) / 2;
      const alpha = active ? 0.7 + amp * 0.3 : 0.15;
      ctx.fillStyle = active
        ? `rgba(77, 158, 110, ${alpha})`
        : `rgba(68, 68, 68, ${0.3 + amp * 0.4})`;
      ctx.fillRect(i * barW + 0.5, y, barW - 1, barH);
    });
  }, [data, active]);

  return (
    <canvas
      ref={canvasRef}
      width={480}
      height={64}
      className="w-full h-16 rounded"
    />
  );
}

// ── Stability ring ────────────────────────────────────────────────────────────
function StabilityRing({ value }: { value: number }) {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - value);
  return (
    <svg width="36" height="36" className="-rotate-90">
      <circle cx="18" cy="18" r={r} fill="none" stroke="#262626" strokeWidth="2" />
      <circle
        cx="18" cy="18" r={r} fill="none"
        stroke={value > 0.7 ? "#4d9e6e" : value > 0.4 ? "#c4913a" : "#8a8a8a"}
        strokeWidth="2"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.8s ease, stroke 0.4s" }}
      />
    </svg>
  );
}

// ── Place type badge ──────────────────────────────────────────────────────────
function PlaceTypeBadge({ type }: { type: Place["type"] }) {
  const config = {
    venue: { icon: "🎭", label: "Venue" },
    club: { icon: "🎵", label: "Club" },
    other: { icon: "🏠", label: "Other" },
  };
  const { icon, label } = config[type];
  return <span className="text-[10px]">{icon} {label}</span>;
}

// ── Location Badge ────────────────────────────────────────────────────────────
interface LocationBadgeProps {
  location: { lat: number; lng: number };
  nearbyPlaces: PlaceWithDistance[];
  popupUp?: boolean;
}

function LocationBadge({ location, nearbyPlaces, popupUp }: LocationBadgeProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const nearest = nearbyPlaces[0] ?? null;
  const matchedPlace = nearest && nearest.distance <= 0.5 ? nearest : null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-faint font-mono hover:text-ghost transition-colors"
      >
        <MapPin size={11} />
        {matchedPlace
          ? <span className="text-ghost">{matchedPlace.name}</span>
          : <span>{location.lat.toFixed(5)}, {location.lng.toFixed(5)}</span>
        }
      </button>

      {open && (
        <div className={clsx(
          "absolute right-0 z-50 w-60 p-3 rounded-lg bg-base border border-rim shadow-xl text-xs space-y-2.5",
          popupUp ? "bottom-6" : "top-6"
        )}>
          {matchedPlace ? (
            <>
              <div>
                <span className="text-faint block mb-0.5">Place</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-soft font-medium">{matchedPlace.name}</span>
                  <PlaceTypeBadge type={matchedPlace.type} />
                </div>
              </div>
              {matchedPlace.latitude != null && matchedPlace.longitude != null && (
                <div>
                  <span className="text-faint block mb-0.5">Place coordinates</span>
                  <span className="font-mono text-ghost">
                    {Number(matchedPlace.latitude).toFixed(5)}, {Number(matchedPlace.longitude).toFixed(5)}
                  </span>
                </div>
              )}
              <div>
                <span className="text-faint block mb-0.5">Distance</span>
                <span className="text-ghost">{formatDistance(nearest.distance)}</span>
              </div>
              <div className="pt-2 border-t border-rim">
                <span className="text-faint block mb-0.5">Your location</span>
                <span className="font-mono text-ghost">
                  {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                </span>
              </div>
            </>
          ) : (
            <div>
              <span className="text-faint block mb-0.5">Your location</span>
              <span className="font-mono text-ghost">
                {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LiveAnalyzer() {
  const [recordingId, setRecordingId] = useState<number | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [tags, setTags] = useState<TagType[]>([]);
  const [selectedTags, setSelectedTags] = useState<Set<number>>(new Set());
  const [summary, setSummary] = useState<{
    avg_bpm: number; min_bpm: number; max_bpm: number; dominant_genre: string;
  } | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [nearbyPlaces, setNearbyPlaces] = useState<PlaceWithDistance[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<number | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPlaceForm, setShowPlaceForm] = useState(false);
  const [newPlaceName, setNewPlaceName] = useState("");
  const [newPlaceType, setNewPlaceType] = useState<PlaceType>("club");
  const [newPlaceAddress, setNewPlaceAddress] = useState("");
  const [recentRecordings, setRecentRecordings] = useState<Recording[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const { status, lastFrame, waveform, error, audioUrl, frames, start, stop } = useAudioAnalyzer();
  const { playTrack } = useAudioPlayer();

  // When the backend finishes saving the WAV, persist the URL to the recording
  useEffect(() => {
    if (audioUrl && recordingId) {
      updateRecordingAudioUrl(recordingId, audioUrl).catch(() => {});
    }
  }, [audioUrl, recordingId]);

  const isRecording = status === "recording";

  const loadRecent = useCallback(() => {
    getRecentRecordings("live").then(setRecentRecordings).catch(() => {});
  }, []);

  // Load tags, places, and recent recordings
  useEffect(() => {
    getTagTree().then(setTags).catch(() => {});
    getPlaces().then(setPlaces).catch(() => {});
    loadRecent();
  }, [loadRecent]);

  // Try geolocation on mount and when places load
  useEffect(() => {
    getCurrentLocation().then((loc) => {
      if (!loc) return;
      setLocation(loc);
      const nearby = findNearbyPlaces(loc.lat, loc.lng, places, 0.5);
      setNearbyPlaces(nearby);
      if (nearby.length > 0 && nearby[0].distance <= 0.1) {
        setSelectedPlaceId(nearby[0].id);
      }
    });
  }, [places]);

  const handleStart = async () => {
    setSummary(null);
    setSaved(false);
    setShowSaveDialog(false);
    setSelectedTags(new Set());
    const rec = await startRecording({
      latitude: location?.lat ?? null,
      longitude: location?.lng ?? null,
      source: "live",
    }).catch(() => null);
    setRecordingId(rec?.id ?? null);
    start();
  };

  const handleStop = async () => {
    stop();
    const bpms = frames.map((f) => f.bpm).filter((b) => b > 0);
    const avg_bpm = bpms.length
      ? Math.round((bpms.reduce((a, b) => a + b, 0) / bpms.length) * 10) / 10
      : 0;
    const min_bpm = bpms.length ? Math.round(Math.min(...bpms) * 10) / 10 : 0;
    const max_bpm = bpms.length ? Math.round(Math.max(...bpms) * 10) / 10 : 0;
    const genres = frames.map((f) => f.genre_hint).filter(Boolean) as string[];
    const dominant_genre = genres.length
      ? genres.sort((a, b) => genres.filter((g) => g === b).length - genres.filter((g) => g === a).length)[0]
      : "";
    const stats = { avg_bpm, min_bpm, max_bpm, dominant_genre };
    if (recordingId) {
      await stopRecording(recordingId, stats).catch(() => null);
    }
    setSummary(stats);
    loadRecent();
  };

  const handleSaveToSession = async () => {
    if (!recordingId) return;
    setIsSaving(true);
    try {
      const session = await createSession({ venue_id: selectedPlaceId ?? null });
      await updateRecordingSession(recordingId, session.id);
      if (selectedTags.size > 0) {
        await addRecordingTags(recordingId, [...selectedTags]);
      }
      setSaved(true);
      setShowSaveDialog(false);
    } catch (err) {
      console.error("Failed to save:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreatePlace = async () => {
    if (!newPlaceName.trim()) return;
    try {
      const place = await createPlace({
        name: newPlaceName.trim(),
        type: newPlaceType,
        address: newPlaceAddress.trim() || null,
        city: undefined,
      });
      setPlaces([...places, place]);
      setSelectedPlaceId(place.id);
      setShowPlaceForm(false);
      setNewPlaceName("");
      setNewPlaceType("club");
      setNewPlaceAddress("");
    } catch (err) {
      console.error("Failed to create place:", err);
    }
  };

  const toggleTag = (id: number) =>
    setSelectedTags((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const flatTags = (list: TagType[]): TagType[] =>
    list.flatMap((t) => [t, ...flatTags(t.children)]);

  const bpm = lastFrame?.bpm;
  const bpmStr = bpm != null ? bpm.toFixed(1) : "—";
  const genre = lastFrame?.genre_hint ?? (summary?.dominant_genre ?? null);
  const stability = lastFrame?.stability ?? 0;

  return (
    <div className="max-w-xl mx-auto px-8 py-16 flex flex-col items-center gap-10">
      {/* Status bar */}
      <div className="w-full flex items-center justify-between">
        <h1 className="text-xl font-semibold text-soft tracking-tight">Live</h1>
        <div className="flex items-center gap-2">
          {location && (
            <LocationBadge location={location} nearbyPlaces={nearbyPlaces} />
          )}
          <span
            className={clsx(
              "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors",
              isRecording
                ? "border-live/40 text-live bg-live/5 live-glow"
                : "border-rim text-ghost"
            )}
          >
            <span className={clsx("w-1.5 h-1.5 rounded-full", isRecording ? "bg-live animate-pulse" : "bg-faint")} />
            {status === "requesting" ? "Connecting…" : isRecording ? "Recording" : "Idle"}
          </span>
        </div>
      </div>

      {/* BPM display */}
      <div className="flex flex-col items-center gap-1 select-none">
        <div
          className={clsx(
            "font-mono font-semibold leading-none tracking-tighter transition-colors duration-500",
            "text-[7rem] sm:text-[9rem]",
            isRecording && bpm ? "text-soft bpm-glow" : "text-faint"
          )}
        >
          {bpmStr}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-faint uppercase tracking-widest">BPM</span>
          {lastFrame && (
            <div className="flex items-center gap-1.5">
              <StabilityRing value={stability} />
              <span className="text-xs text-ghost">{Math.round(stability * 100)}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Genre hint */}
      <div
        className={clsx(
          "text-sm font-medium transition-all duration-700",
          genre ? "text-sand opacity-100" : "text-faint opacity-50"
        )}
      >
        {genre ?? "—"}
      </div>

      {/* Waveform */}
      <div className="w-full">
        <Waveform data={waveform} active={isRecording} />
      </div>

      {/* Record button */}
      <button
        onClick={isRecording ? handleStop : handleStart}
        disabled={status === "requesting"}
        className={clsx(
          "flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all",
          isRecording
            ? "bg-live/10 border border-live/30 text-live hover:bg-live/20"
            : "bg-surface border border-rim text-ghost hover:text-soft hover:border-muted",
          status === "requesting" && "opacity-50 cursor-not-allowed"
        )}
      >
        {isRecording ? (
          <><Square size={14} className="fill-live" /> Stop</>
        ) : (
          <><Circle size={14} className="fill-ghost" /> Start recording</>
        )}
      </button>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-400/80 text-center">{error}</p>
      )}

      {/* Post-recording summary + Save to Session */}
      {summary && !isRecording && (
        <div className="w-full space-y-3">
          <div className="p-4 rounded-lg bg-surface border border-rim text-sm">
            <p className="text-ghost mb-2">Session summary</p>
            <div className="grid grid-cols-2 gap-3 text-xs mb-3">
              <div>
                <span className="text-ghost block mb-0.5">Avg BPM</span>
                <span className="text-soft font-mono text-lg font-semibold">{summary.avg_bpm}</span>
              </div>
              <div>
                <span className="text-ghost block mb-0.5">Genre</span>
                <span className="text-sand text-sm">{summary.dominant_genre || "—"}</span>
              </div>
              <div>
                <span className="text-ghost block mb-0.5">Min BPM</span>
                <span className="text-soft font-mono">{summary.min_bpm || "—"}</span>
              </div>
              <div>
                <span className="text-ghost block mb-0.5">Max BPM</span>
                <span className="text-soft font-mono">{summary.max_bpm || "—"}</span>
              </div>
            </div>
            {location && (
              <div className="mb-3">
                <LocationBadge location={location} nearbyPlaces={nearbyPlaces} popupUp />
              </div>
            )}
            <div className="flex items-center gap-2 pt-2 border-t border-rim">
              {audioUrl && (
                <button
                  onClick={() => playTrack(
                    audioUrl,
                    recordingTitle({ started_at: new Date().toISOString(), venue_name: null }),
                    recordingMeta({ ...summary, started_at: new Date().toISOString(), ended_at: null }),
                  )}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs border border-rim text-ghost hover:text-soft hover:border-muted transition-colors"
                >
                  <Play size={12} fill="currentColor" strokeWidth={0} className="translate-x-px" /> Play
                </button>
              )}
              {!saved ? (
                <button
                  onClick={() => setShowSaveDialog(!showSaveDialog)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-sand/10 border border-sand/30 text-sand hover:bg-sand/20 transition-colors"
                >
                  <Save size={12} /> Save to Session
                </button>
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-green-400">
                  <Check size={12} /> Saved to Sessions
                </span>
              )}
            </div>
          </div>

          {/* Save Dialog */}
          {showSaveDialog && !saved && (
            <div className="p-4 rounded-lg bg-base border border-sand/30">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-soft">Save to Session</h4>
                <button
                  onClick={() => setShowSaveDialog(false)}
                  className="text-ghost hover:text-soft transition-colors"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Place Selection */}
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <Navigation size={12} className="text-faint" />
                  <span className="text-xs text-ghost">Place (Optional)</span>
                </div>

                {/* Nearby places quick-pick */}
                {nearbyPlaces.length > 0 && !showPlaceForm && (
                  <div className="space-y-1 mb-2">
                    {nearbyPlaces.map((place) => {
                      const isSelected = selectedPlaceId === place.id;
                      return (
                        <button
                          key={place.id}
                          onClick={() => setSelectedPlaceId(isSelected ? null : place.id)}
                          className={clsx(
                            "w-full text-left px-3 py-2 rounded border text-xs transition-colors",
                            isSelected
                              ? "border-sand/50 bg-sand/10 text-soft"
                              : "border-rim bg-surface text-ghost hover:border-muted hover:text-soft"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{place.name}</span>
                              <PlaceTypeBadge type={place.type} />
                            </div>
                            <span className="text-faint flex items-center gap-1">
                              <MapPin size={9} />
                              {formatDistance(place.distance)}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {!showPlaceForm ? (
                  <div className="space-y-2">
                    {nearbyPlaces.length === 0 && (
                      <select
                        value={selectedPlaceId ?? ""}
                        onChange={(e) => setSelectedPlaceId(e.target.value ? Number(e.target.value) : null)}
                        className="w-full px-2.5 py-1.5 rounded bg-surface border border-rim text-soft text-xs focus:outline-none focus:border-muted"
                      >
                        <option value="">No place</option>
                        {places.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.address ? `- ${p.address}` : ""}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={() => setShowPlaceForm(true)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-rim text-ghost hover:text-soft hover:border-muted transition-colors"
                    >
                      <Plus size={10} /> Add new place
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Place name"
                      value={newPlaceName}
                      onChange={(e) => setNewPlaceName(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-surface border border-rim text-soft text-xs focus:outline-none focus:border-muted"
                    />
                    <select
                      value={newPlaceType}
                      onChange={(e) => setNewPlaceType(e.target.value as PlaceType)}
                      className="w-full px-2.5 py-1.5 rounded bg-surface border border-rim text-soft text-xs focus:outline-none focus:border-muted"
                    >
                      <option value="venue">🎭 Venue</option>
                      <option value="club">🎵 Club</option>
                      <option value="other">🏠 Other</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Address (optional)"
                      value={newPlaceAddress}
                      onChange={(e) => setNewPlaceAddress(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-surface border border-rim text-soft text-xs focus:outline-none focus:border-muted"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleCreatePlace}
                        disabled={!newPlaceName.trim()}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-sand/10 border border-sand/30 text-sand hover:bg-sand/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Check size={10} /> Create
                      </button>
                      <button
                        onClick={() => {
                          setShowPlaceForm(false);
                          setNewPlaceName("");
                          setNewPlaceType("club");
                          setNewPlaceAddress("");
                        }}
                        className="px-2 py-1 rounded text-xs border border-rim text-ghost hover:text-soft hover:border-muted transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Tag Selection */}
              {flatTags(tags).length > 0 && (
                <div className="mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Tag size={12} className="text-faint" />
                    <span className="text-xs text-ghost">Tags (Optional)</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {flatTags(tags).map((t) => {
                      const active = selectedTags.has(t.id);
                      return (
                        <button
                          key={t.id}
                          onClick={() => toggleTag(t.id)}
                          className={clsx(
                            "px-2 py-0.5 rounded text-xs border transition-colors",
                            active
                              ? "border-sand/50 text-sand bg-sand/10"
                              : "border-rim text-ghost hover:border-muted hover:text-soft"
                          )}
                          style={active ? { borderColor: t.color + "88", color: t.color ?? undefined } : {}}
                        >
                          {t.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Save Button */}
              <button
                onClick={handleSaveToSession}
                disabled={isSaving}
                className={clsx(
                  "w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded text-sm font-medium transition-colors",
                  isSaving
                    ? "bg-sand/10 border border-sand/30 text-sand/50 cursor-not-allowed"
                    : "bg-sand/10 border border-sand/30 text-sand hover:bg-sand/20"
                )}
              >
                {isSaving ? (
                  <><Loader2 size={14} className="animate-spin" /> Saving...</>
                ) : (
                  <><Check size={14} /> Save</>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Latest Analysis */}
      {recentRecordings.length > 0 && (
        <div className="w-full">
          <h3 className="text-xs font-medium text-ghost uppercase tracking-widest mb-3">
            Latest analysis
          </h3>
          <div className="space-y-2">
            {recentRecordings.filter((r) => r.id !== recordingId).map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface border border-rim text-xs">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-soft font-medium">{recordingTitle(r)}</span>
                    {r.session_id != null ? (
                      <span className="flex items-center gap-0.5 text-green-400/80">
                        <Check size={9} /> Saved
                      </span>
                    ) : (
                      <span className="text-faint/60">Unsaved</span>
                    )}
                    {r.audio_url && (
                      <button
                        onClick={() => playTrack(r.audio_url!, recordingTitle(r), recordingMeta(r))}
                        className="flex items-center gap-1 text-faint hover:text-ghost transition-colors"
                      >
                        <Play size={9} fill="currentColor" strokeWidth={0} /> Play
                      </button>
                    )}
                  </div>
                  <div className="text-faint mt-0.5">{recordingMeta(r) || "—"}</div>
                </div>
                <button
                  onClick={() => setDeleteTarget(r.id)}
                  className="text-faint hover:text-red-400 transition-colors shrink-0"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete recording"
        message="This recording will be permanently deleted. This action cannot be undone."
        onConfirm={async () => {
          if (deleteTarget == null) return;
          await deleteRecording(deleteTarget).catch(() => {});
          setDeleteTarget(null);
          loadRecent();
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
