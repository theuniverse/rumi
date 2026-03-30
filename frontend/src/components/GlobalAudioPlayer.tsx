import { Play, Pause, Volume2, VolumeX, X } from "lucide-react";
import { useAudioPlayer } from "../contexts/AudioPlayerContext";

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function GlobalAudioPlayer() {
  const {
    track, isPlaying, currentTime, duration,
    volume, visible, toggle, seek, setVolume, close,
  } = useAudioPlayer();

  if (!visible || !track) return null;

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-rim"
      style={{
        background: "rgba(10, 10, 10, 0.97)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow: "0 -4px 32px rgba(0,0,0,0.5)",
        paddingBottom: "var(--safe-area-bottom)",
      }}
    >
      <div className="flex items-center gap-4 px-5 py-3 max-w-5xl mx-auto">

        {/* ── Left: Play / Pause ── */}
        <button
          onClick={toggle}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full border border-rim text-ghost hover:text-soft hover:border-muted active:scale-95 transition-all"
        >
          {isPlaying
            ? <Pause size={15} fill="currentColor" strokeWidth={0} />
            : <Play  size={15} fill="currentColor" strokeWidth={0} className="translate-x-px" />}
        </button>

        {/* ── Center: info + scrubber ── */}
        <div className="flex-1 min-w-0">
          {/* Top row: title + time */}
          <div className="flex items-baseline justify-between gap-4 mb-1.5">
            <div className="min-w-0">
              <span className="text-xs font-medium text-soft leading-none truncate block">
                {track.title}
              </span>
              {track.subtitle && (
                <span className="text-[10px] text-faint leading-none truncate block mt-0.5">
                  {track.subtitle}
                </span>
              )}
            </div>
            <span className="text-[10px] font-mono text-ghost shrink-0 tabular-nums">
              {fmt(currentTime)}&thinsp;/&thinsp;{fmt(duration)}
            </span>
          </div>

          {/* Progress scrubber */}
          <div className="relative h-[3px] group cursor-pointer">
            {/* Track background */}
            <div className="absolute inset-0 rounded-full bg-rim" />
            {/* Filled portion */}
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-sand/60 group-hover:bg-sand transition-colors"
              style={{ width: `${progress * 100}%` }}
            />
            {/* Thumb dot — appears on hover */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-sand opacity-0 group-hover:opacity-100 transition-opacity -translate-x-1/2 pointer-events-none"
              style={{ left: `${progress * 100}%` }}
            />
            {/* Invisible range input for interaction */}
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.5}
              value={currentTime}
              onChange={(e) => seek(Number(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              aria-label="Seek"
            />
          </div>
        </div>

        {/* ── Right: volume + close ── */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Volume icon (mute toggle) */}
          <button
            onClick={() => setVolume(volume > 0 ? 0 : 1)}
            className="text-faint hover:text-ghost transition-colors"
            aria-label={volume > 0 ? "Mute" : "Unmute"}
          >
            {volume === 0
              ? <VolumeX size={14} />
              : <Volume2 size={14} />}
          </button>

          {/* Volume slider */}
          <div className="relative w-16 h-[3px] group cursor-pointer">
            <div className="absolute inset-0 rounded-full bg-rim" />
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-ghost/50 group-hover:bg-ghost transition-colors"
              style={{ width: `${volume * 100}%` }}
            />
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              aria-label="Volume"
            />
          </div>

          {/* Close */}
          <button
            onClick={close}
            className="text-faint hover:text-ghost transition-colors ml-1"
            aria-label="Close player"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
