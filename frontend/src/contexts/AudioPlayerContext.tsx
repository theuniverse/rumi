import {
  createContext, useContext, useRef, useState,
  useCallback, useEffect, type ReactNode,
} from "react";

export interface TrackInfo {
  src: string;
  title: string;      // e.g. "House" or "house_124bpm"
  subtitle: string;   // e.g. "12:23 · 124 bpm" or "Classic house music groove"
}

interface AudioPlayerContextValue {
  track: TrackInfo | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  visible: boolean;
  playTrack: (src: string, title: string, subtitle?: string) => void;
  toggle: () => void;
  seek: (time: number) => void;
  setVolume: (vol: number) => void;
  close: () => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null);

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  // Stable audio element — never recreated
  const audioRef = useRef<HTMLAudioElement | null>(null);
  if (!audioRef.current) audioRef.current = new Audio();

  const [track, setTrack] = useState<TrackInfo | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [visible, setVisible] = useState(false);

  // Attach native audio events once
  useEffect(() => {
    const audio = audioRef.current!;
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => setDuration(isFinite(audio.duration) ? audio.duration : 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => { setIsPlaying(false); setCurrentTime(0); };
    const onVolumeChange = () => setVolumeState(audio.volume);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("volumechange", onVolumeChange);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("volumechange", onVolumeChange);
      audio.pause();
    };
  }, []);

  const playTrack = useCallback((src: string, title: string, subtitle = "") => {
    const audio = audioRef.current!;
    const resolved = new URL(src, window.location.href).href;
    if (audio.src !== resolved) {
      audio.src = src;
      audio.currentTime = 0;
    }
    setTrack({ src, title, subtitle });
    setVisible(true);
    audio.play().catch(() => {});
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current!;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }, []);

  const seek = useCallback((time: number) => {
    audioRef.current!.currentTime = time;
    setCurrentTime(time);
  }, []);

  const setVolume = useCallback((vol: number) => {
    audioRef.current!.volume = Math.max(0, Math.min(1, vol));
  }, []);

  const close = useCallback(() => {
    const audio = audioRef.current!;
    audio.pause();
    audio.src = "";
    setTrack(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setVisible(false);
  }, []);

  return (
    <AudioPlayerContext.Provider value={{
      track, isPlaying, currentTime, duration, volume, visible,
      playTrack, toggle, seek, setVolume, close,
    }}>
      {children}
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayer(): AudioPlayerContextValue {
  const ctx = useContext(AudioPlayerContext);
  if (!ctx) throw new Error("useAudioPlayer must be used inside AudioPlayerProvider");
  return ctx;
}
