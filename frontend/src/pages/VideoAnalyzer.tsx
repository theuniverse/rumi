import { useState, useRef, useEffect, useCallback } from "react";
import { Upload, Music, Play, Loader2, MapPin, Plus, Check, X, Save, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import clsx from "clsx";
import { useAudioPlayer } from "../contexts/AudioPlayerContext";
import { recordingTitle, recordingMeta } from "../lib/recordingFormat";
import {
  Place,
  PlaceType,
  Tag,
  Recording,
  getPlaces,
  createPlace,
  getTags,
  startRecording,
  stopRecording,
  addRecordingTags,
  createSession,
  getRecentRecordings,
  deleteRecording,
} from "../lib/api";
import { ConfirmDialog } from "../components/ConfirmDialog";

interface AnalysisResult {
  bpm: number;
  genre_hint: string;
  confidence: number;
  stability: number;
  audio_url?: string | null;
}

interface TutorialAudio {
  name: string;
  path: string;
  expectedBpm: number;
  description: string;
}

const TUTORIAL_AUDIOS: TutorialAudio[] = [
  {
    name: "Ambient",
    path: `${import.meta.env.BASE_URL}test-audio/ambient_82bpm.wav`,
    expectedBpm: 82,
    description: "Slow, atmospheric ambient track"
  },
  {
    name: "House",
    path: `${import.meta.env.BASE_URL}test-audio/house_124bpm.wav`,
    expectedBpm: 124,
    description: "Classic house music groove"
  },
  {
    name: "Techno",
    path: `${import.meta.env.BASE_URL}test-audio/techno_138bpm.wav`,
    expectedBpm: 138,
    description: "High-energy techno beat"
  }
];


export default function VideoAnalyzer() {
  // Upload area
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // History
  const [recentRecordings, setRecentRecordings] = useState<Recording[]>([]);
  const [showExamples, setShowExamples] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const { playTrack } = useAudioPlayer();

  // Upload analysis state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<AnalysisResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Save to session
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<number | null>(null);
  const [selectedTags, setSelectedTags] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPlaceForm, setShowPlaceForm] = useState(false);
  const [newPlaceName, setNewPlaceName] = useState("");
  const [newPlaceType, setNewPlaceType] = useState<PlaceType>("club");
  const [newPlaceAddress, setNewPlaceAddress] = useState("");

  const loadRecent = useCallback(() => {
    getRecentRecordings("video").then(setRecentRecordings).catch(() => {});
  }, []);

  useEffect(() => { loadRecent(); }, [loadRecent]);
  useEffect(() => {
    getPlaces().then(setPlaces).catch(() => {});
    getTags().then(setTags).catch(() => {});
  }, []);

  // Auto-upload and analyze when file is selected
  useEffect(() => {
    if (!uploadedFile) return;
    let cancelled = false;
    setIsUploading(true);
    setUploadError(null);
    setUploadResult(null);
    setSaved(false);
    setShowSaveDialog(false);

    const formData = new FormData();
    formData.append("file", uploadedFile, uploadedFile.name);

    fetch(`${import.meta.env.BASE_URL}api/analyze/file`, { method: "POST", body: formData })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.text();
          let msg = body;
          try { msg = JSON.parse(body)?.detail ?? body; } catch { /* use raw */ }
          throw new Error(msg);
        }
        return res.json();
      })
      .then((data: AnalysisResult) => {
        if (!cancelled) setUploadResult({
          ...data,
          audio_url: data.audio_url ? import.meta.env.BASE_URL + data.audio_url.slice(1) : null,
        });
      })
      .catch((err) => { if (!cancelled) setUploadError(err instanceof Error ? err.message : "Analysis failed"); })
      .finally(() => { if (!cancelled) setIsUploading(false); });

    return () => { cancelled = true; };
  }, [uploadedFile]);

  const handleDragOver = (e: React.DragEvent) => {
    if (isUploading) return;
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isUploading) return;
    const file = e.dataTransfer.files[0];
    if (file && isAudioFile(file)) setUploadedFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isUploading) return;
    const file = e.target.files?.[0];
    if (file) setUploadedFile(file);
    e.target.value = "";
  };

  const isAudioFile = (file: File) =>
    file.type.startsWith("audio/") || file.type.startsWith("video/") ||
    /\.(mov|mp4|m4v|avi|mkv|webm|flv|wmv|3gp)$/i.test(file.name);

  const handleCreatePlace = async () => {
    if (!newPlaceName.trim()) return;
    try {
      const place = await createPlace({ name: newPlaceName.trim(), type: newPlaceType, address: newPlaceAddress.trim() || null, city: undefined });
      setPlaces([...places, place]);
      setSelectedPlaceId(place.id);
      setShowPlaceForm(false);
      setNewPlaceName(""); setNewPlaceType("club"); setNewPlaceAddress("");
    } catch (err) { console.error("Failed to create place:", err); }
  };

  const toggleTag = (id: number) => {
    setSelectedTags((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const handleSaveToSession = async () => {
    if (!uploadResult) return;
    setIsSaving(true);
    try {
      const session = await createSession({ venue_id: selectedPlaceId ?? null });
      const recording = await startRecording({ session_id: session.id, source: "video" });
      await stopRecording(recording.id, {
        avg_bpm: uploadResult.bpm, min_bpm: uploadResult.bpm, max_bpm: uploadResult.bpm,
        dominant_genre: uploadResult.genre_hint, audio_url: uploadResult.audio_url ?? null,
      });
      if (selectedTags.size > 0) await addRecordingTags(recording.id, [...selectedTags]);
      setSaved(true);
      setShowSaveDialog(false);
      loadRecent();
    } catch (err) {
      console.error("Failed to save:", err);
      setUploadError("Failed to save to session");
    } finally { setIsSaving(false); }
  };

  const hasHistory = recentRecordings.length > 0;

  return (
    <div className="max-w-2xl mx-auto px-8 py-16">
      <div className="mb-10">
        <h1 className="text-xl font-semibold text-soft tracking-tight mb-1">
          Audio/Video Analyzer
        </h1>
        <p className="text-ghost text-sm">
          Upload an audio or video file to extract BPM and style.
        </p>
      </div>

      {/* Upload Control */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={clsx(
          "flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg text-center transition-colors mb-6",
          isUploading
            ? "border-sand/30 bg-sand/5 cursor-not-allowed"
            : isDragging
              ? "border-sand bg-sand/5 cursor-pointer"
              : "border-rim hover:border-muted hover:bg-surface cursor-pointer"
        )}
      >
        {isUploading
          ? <Loader2 size={32} strokeWidth={1} className="text-sand mb-4 animate-spin" />
          : <Upload size={32} strokeWidth={1} className="text-faint mb-4" />
        }
        <p className="text-soft text-sm mb-1">
          {isUploading
            ? "Uploading and analyzing..."
            : uploadedFile ? uploadedFile.name : "Drop audio/video file here or click to browse"}
        </p>
        <p className="text-ghost text-xs">
          {isUploading ? "Please wait" : "Supports WAV, MP3, MP4, MOV, M4A, FLAC, OGG"}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,video/*,.mov"
          onChange={handleFileSelect}
          className="hidden"
          disabled={isUploading}
        />
      </div>

      {/* Upload result */}
      {uploadError && (
        <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
          <p className="text-xs text-red-400">{uploadError}</p>
        </div>
      )}

      {uploadResult && !isUploading && (
        <div className="mb-8 space-y-3">
          <div className="p-3 rounded-lg bg-surface border border-rim">
            <div className="grid grid-cols-2 gap-3 text-xs mb-3">
              <div>
                <span className="text-ghost block mb-0.5">Detected BPM</span>
                <span className="text-soft font-mono text-lg font-semibold">{uploadResult.bpm}</span>
              </div>
              <div>
                <span className="text-ghost block mb-0.5">Genre</span>
                <span className="text-sand text-sm">{uploadResult.genre_hint}</span>
              </div>
              <div>
                <span className="text-ghost block mb-0.5">Confidence</span>
                <span className="text-soft font-mono">{Math.round(uploadResult.confidence * 100)}%</span>
              </div>
              <div>
                <span className="text-ghost block mb-0.5">Stability</span>
                <span className="text-soft font-mono">{Math.round(uploadResult.stability * 100)}%</span>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-rim">
              {uploadResult.audio_url && (
                <button
                  onClick={() => {
                    const now = new Date().toISOString();
                    playTrack(
                      uploadResult.audio_url!,
                      recordingTitle({ started_at: now, venue_name: null }),
                      recordingMeta({ dominant_genre: uploadResult.genre_hint, avg_bpm: uploadResult.bpm, started_at: now, ended_at: null }),
                    );
                  }}
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

          {showSaveDialog && !saved && (
            <div className="p-4 rounded-lg bg-base border border-sand/30">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-soft">Save to Session</h4>
                <button onClick={() => setShowSaveDialog(false)} className="text-ghost hover:text-soft transition-colors">
                  <X size={14} />
                </button>
              </div>
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <MapPin size={12} className="text-faint" />
                  <span className="text-xs text-ghost">Place (Optional)</span>
                </div>
                {!showPlaceForm ? (
                  <div className="space-y-2">
                    <select
                      value={selectedPlaceId ?? ""}
                      onChange={(e) => setSelectedPlaceId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full px-2.5 py-1.5 rounded bg-surface border border-rim text-soft text-xs focus:outline-none focus:border-muted"
                    >
                      <option value="">No place</option>
                      {places.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}{p.address ? ` - ${p.address}` : ""}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => setShowPlaceForm(true)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-rim text-ghost hover:text-soft hover:border-muted transition-colors"
                    >
                      <Plus size={10} /> Add new place
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input type="text" placeholder="Place name" value={newPlaceName} onChange={(e) => setNewPlaceName(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-surface border border-rim text-soft text-xs focus:outline-none focus:border-muted" />
                    <select value={newPlaceType} onChange={(e) => setNewPlaceType(e.target.value as PlaceType)}
                      className="w-full px-2.5 py-1.5 rounded bg-surface border border-rim text-soft text-xs focus:outline-none focus:border-muted">
                      <option value="venue">🎭 Venue</option>
                      <option value="club">🎵 Club</option>
                      <option value="other">🏠 Other</option>
                    </select>
                    <input type="text" placeholder="Address (optional)" value={newPlaceAddress} onChange={(e) => setNewPlaceAddress(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-surface border border-rim text-soft text-xs focus:outline-none focus:border-muted" />
                    <div className="flex gap-2">
                      <button onClick={handleCreatePlace} disabled={!newPlaceName.trim()}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-sand/10 border border-sand/30 text-sand hover:bg-sand/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        <Check size={10} /> Create
                      </button>
                      <button onClick={() => { setShowPlaceForm(false); setNewPlaceName(""); setNewPlaceType("club"); setNewPlaceAddress(""); }}
                        className="px-2 py-1 rounded text-xs border border-rim text-ghost hover:text-soft hover:border-muted transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {tags.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-ghost mb-2">Tags (Optional)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((t) => {
                      const active = selectedTags.has(t.id);
                      return (
                        <button key={t.id} onClick={() => toggleTag(t.id)}
                          className={clsx("px-2 py-0.5 rounded text-xs border transition-colors",
                            active ? "border-sand/50 text-sand bg-sand/10" : "border-rim text-ghost hover:border-muted hover:text-soft")}
                          style={active ? { borderColor: t.color + "88", color: t.color ?? undefined } : {}}>
                          {t.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <button onClick={handleSaveToSession} disabled={isSaving}
                className={clsx("w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded text-sm font-medium transition-colors",
                  isSaving ? "bg-sand/10 border border-sand/30 text-sand/50 cursor-not-allowed" : "bg-sand/10 border border-sand/30 text-sand hover:bg-sand/20")}>
                {isSaving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <><Check size={14} /> Save</>}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Latest Analysis — shown when history exists */}
      {hasHistory && (
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-soft flex items-center gap-2">
              <Music size={14} className="text-faint" />
              Latest analysis
            </h2>
            <button
              onClick={() => setShowExamples((v) => !v)}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-rim text-ghost hover:text-soft hover:border-muted transition-colors"
            >
              Examples
              {showExamples ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
          </div>

          {/* Tutorial blocks — collapsible */}
          {showExamples && (
            <div className="space-y-4 mb-6">
              {TUTORIAL_AUDIOS.map((audio) => (
                <TutorialBlock key={audio.path} audio={audio} onSaved={loadRecent} />
              ))}
            </div>
          )}

          {/* Recording history */}
          <div className="space-y-2">
            {recentRecordings.map((r) => (
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

      {/* Tutorial Section — shown only when no history */}
      {!hasHistory && (
        <>
          <div className="mb-6">
            <h2 className="text-sm font-medium text-soft mb-4 flex items-center gap-2">
              <Music size={14} className="text-faint" />
              Try these examples
            </h2>
            <p className="text-xs text-ghost mb-6">
              Click "Analyze" on any example below to see how the BPM detection works
            </p>
          </div>
          <div className="space-y-4">
            {TUTORIAL_AUDIOS.map((audio) => (
              <TutorialBlock key={audio.path} audio={audio} onSaved={loadRecent} />
            ))}
          </div>
        </>
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

function TutorialBlock({ audio, onSaved }: { audio: TutorialAudio; onSaved: () => void }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<number | null>(null);
  const [showPlaceForm, setShowPlaceForm] = useState(false);
  const [newPlaceName, setNewPlaceName] = useState("");
  const [newPlaceType, setNewPlaceType] = useState<PlaceType>("club");
  const [newPlaceAddress, setNewPlaceAddress] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { playTrack } = useAudioPlayer();

  useEffect(() => {
    getTags().then(setTags).catch(() => {});
    getPlaces().then(setPlaces).catch(() => {});
  }, []);

  const handlePlay = () => {
    playTrack(audio.path, audio.name, audio.description);
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setError(null);
    setResult(null);
    setSaved(false);
    setShowSaveDialog(false);

    try {
      const response = await fetch(audio.path);
      if (!response.ok) throw new Error("Failed to load audio file");
      const blob = await response.blob();
      if (blob.size === 0) throw new Error("Audio file is empty");

      const formData = new FormData();
      formData.append("file", blob, audio.name.toLowerCase() + ".wav");

      const analyzeResponse = await fetch(`${import.meta.env.BASE_URL}api/analyze/file`, { method: "POST", body: formData });
      if (!analyzeResponse.ok) {
        const errorText = await analyzeResponse.text();
        throw new Error(`Analysis failed: ${errorText}`);
      }

      const data: AnalysisResult = await analyzeResponse.json();
      setResult({
        ...data,
        audio_url: data.audio_url ? import.meta.env.BASE_URL + data.audio_url.slice(1) : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCreatePlace = async () => {
    if (!newPlaceName.trim()) return;
    try {
      const place = await createPlace({
        name: newPlaceName.trim(),
        type: newPlaceType,
        address: newPlaceAddress.trim() || null,
        city: "Shanghai",
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

  const handleSaveToSession = async () => {
    if (!result) return;
    setIsSaving(true);
    try {
      const session = await createSession({ venue_id: selectedPlaceId ?? null });
      const recording = await startRecording({
        session_id: session.id,
        latitude: null,
        longitude: null,
        source: "video",
      });
      await stopRecording(recording.id, {
        avg_bpm: result.bpm,
        min_bpm: result.bpm,
        max_bpm: result.bpm,
        dominant_genre: result.genre_hint,
        audio_url: result.audio_url ?? null,
      });
      if (selectedTags.size > 0) {
        await addRecordingTags(recording.id, [...selectedTags]);
      }
      setSaved(true);
      setShowSaveDialog(false);
      onSaved();
      setTimeout(() => {
        setSelectedPlaceId(null);
        setSelectedTags(new Set());
      }, 2000);
    } catch (err) {
      console.error("Failed to save to session:", err);
      setError("Failed to save to session");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleTag = (id: number) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="p-4 rounded-lg bg-surface border border-rim">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Music size={16} className="text-sand" />
            <h3 className="text-sm font-medium text-soft">
              {audio.name} ({audio.expectedBpm} BPM)
            </h3>
          </div>
          <p className="text-xs text-ghost">{audio.description}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={handlePlay}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs border border-rim text-ghost hover:text-soft hover:border-muted transition-colors"
        >
          <Play size={12} fill="currentColor" strokeWidth={0} className="translate-x-px" /> Play
        </button>
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          className={clsx(
            "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors",
            isAnalyzing
              ? "bg-sand/10 border border-sand/30 text-sand/50 cursor-not-allowed"
              : "bg-sand/10 border border-sand/30 text-sand hover:bg-sand/20"
          )}
        >
          {isAnalyzing ? <><Loader2 size={12} className="animate-spin" /> Analyzing...</> : "Analyze"}
        </button>
      </div>

      {result && (
        <div className="space-y-3">
          <div className="p-3 rounded bg-base border border-rim">
            <div className="grid grid-cols-2 gap-3 text-xs mb-3">
              <div>
                <span className="text-ghost block mb-0.5">Detected BPM</span>
                <span className="text-soft font-mono text-lg font-semibold">{result.bpm}</span>
              </div>
              <div>
                <span className="text-ghost block mb-0.5">Genre</span>
                <span className="text-sand text-sm">{result.genre_hint}</span>
              </div>
              <div>
                <span className="text-ghost block mb-0.5">Confidence</span>
                <span className="text-soft font-mono">{Math.round(result.confidence * 100)}%</span>
              </div>
              <div>
                <span className="text-ghost block mb-0.5">Stability</span>
                <span className="text-soft font-mono">{Math.round(result.stability * 100)}%</span>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-rim">
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

          {showSaveDialog && !saved && (
            <div className="p-4 rounded-lg bg-base border border-sand/30">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-soft">Save to Session</h4>
                <button onClick={() => setShowSaveDialog(false)} className="text-ghost hover:text-soft transition-colors">
                  <X size={14} />
                </button>
              </div>

              <div className="mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <MapPin size={12} className="text-faint" />
                  <span className="text-xs text-ghost">Place (Optional)</span>
                </div>
                {!showPlaceForm ? (
                  <div className="space-y-2">
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
                        onClick={() => { setShowPlaceForm(false); setNewPlaceName(""); setNewPlaceType("club"); setNewPlaceAddress(""); }}
                        className="px-2 py-1 rounded text-xs border border-rim text-ghost hover:text-soft hover:border-muted transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {tags.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-ghost mb-2">Tags (Optional)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((t) => {
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
                {isSaving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <><Check size={14} /> Save</>}
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="p-2 rounded bg-red-500/10 border border-red-500/30">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}

// Made with Bob
