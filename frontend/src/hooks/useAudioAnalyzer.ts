import { useRef, useState, useCallback, useEffect } from "react";

export type AnalyzerStatus = "idle" | "requesting" | "recording" | "error";

export interface AnalysisFrame {
  bpm: number;
  genre_hint: string;
  confidence: number;
  stability: number;
  ts: number; // Date.now()
}

interface UseAudioAnalyzerOptions {
  recordingId?: number | null;
  onFrame?: (frame: AnalysisFrame) => void;
}

const WS_URL = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${import.meta.env.BASE_URL}ws/analyze`;

export function useAudioAnalyzer({ recordingId, onFrame }: UseAudioAnalyzerOptions = {}) {
  const [status, setStatus] = useState<AnalyzerStatus>("idle");
  const [lastFrame, setLastFrame] = useState<AnalysisFrame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Waveform: rolling Float32Array of amplitude values
  const [waveform, setWaveform] = useState<number[]>(new Array(120).fill(0));

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameBufferRef = useRef<AnalysisFrame[]>([]);

  const start = useCallback(async () => {
    setError(null);
    setAudioUrl(null);
    setStatus("requesting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      const audioCtx = new AudioContext({ sampleRate: 44100 });
      audioCtxRef.current = audioCtx;

      // Open WebSocket
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          sample_rate: audioCtx.sampleRate,
          recording_id: recordingId ?? null,
        }));
      };

      ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.status === "ready") {
          setStatus("recording");
          return;
        }
        if (msg.type === "saved") {
          setAudioUrl(msg.audio_url ?? null);
          wsRef.current?.close();
          wsRef.current = null;
          return;
        }
        if (msg.error) {
          setError(msg.error);
          return;
        }
        const frame: AnalysisFrame = { ...msg, ts: Date.now() };
        frameBufferRef.current = [...frameBufferRef.current.slice(-19), frame];
        setLastFrame(frame);
        onFrame?.(frame);
      };

      ws.onerror = () => {
        // Release mic and audio resources immediately on WS failure
        processorRef.current?.disconnect();
        sourceRef.current?.disconnect();
        streamRef.current?.getTracks().forEach((t) => t.stop());
        audioCtxRef.current?.close();
        processorRef.current = null;
        sourceRef.current = null;
        streamRef.current = null;
        audioCtxRef.current = null;
        wsRef.current = null;
        setError("WebSocket connection failed");
        setStatus("error");
      };

      ws.onclose = () => {
        wsRef.current = null;
        // Use functional setter — avoids reading stale closure `status`
        setStatus((s) => (s === "recording" ? "idle" : s));
      };

      // Audio pipeline: mic → ScriptProcessor → WS
      const source = audioCtx.createMediaStreamSource(stream);
      sourceRef.current = source;

      // @ts-ignore — deprecated but universally supported; AudioWorklet upgrade planned
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        if (ws.readyState !== WebSocket.OPEN) return;

        const data = e.inputBuffer.getChannelData(0); // Float32Array

        // Send PCM chunk
        ws.send(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));

        // Update waveform (RMS amplitude)
        const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
        setWaveform((prev) => [...prev.slice(1), Math.min(1, rms * 8)]);
      };

      // Connect through a silent GainNode so the ScriptProcessorNode fires
      // without routing mic audio to the speakers (avoids feedback).
      const silentGain = audioCtx.createGain();
      silentGain.gain.value = 0;
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioCtx.destination);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Microphone access denied";
      setError(msg);
      setStatus("error");
    }
  }, [recordingId, onFrame]);

  const stop = useCallback(() => {
    // Send stop signal so server can save the WAV before closing
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "stop" }));
      // Keep WS open; server responds with {"type":"saved","audio_url":"..."}
      // then onmessage handler closes it
    }

    // Stop audio pipeline immediately — no more PCM will be sent
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close();

    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    audioCtxRef.current = null;

    setStatus("idle");
  }, []);

  // Cleanup on unmount
  useEffect(() => () => { stop(); }, [stop]);

  return { status, lastFrame, waveform, error, audioUrl, frames: frameBufferRef.current, start, stop };
}
