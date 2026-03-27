import asyncio
import json
import logging
import struct
import time
import wave
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path

import numpy as np
import librosa
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException

from services.audio_analyzer import analyze_chunk

logger = logging.getLogger(__name__)

router = APIRouter(tags=["analyze"])
_executor = ThreadPoolExecutor(max_workers=4)

ANALYSIS_WINDOW_SECS = 8
OVERLAP_SECS = 4

STORAGE_DIR = Path(__file__).parent.parent / "storage"


def _save_live_wav(all_samples: list, sample_rate: int) -> str:
    """Convert accumulated float32 PCM to a 16-bit mono WAV and return its URL path."""
    (STORAGE_DIR / "live").mkdir(parents=True, exist_ok=True)
    filename = f"live_{int(time.time() * 1000)}.wav"
    filepath = STORAGE_DIR / "live" / filename
    pcm = np.clip(np.array(all_samples, dtype=np.float32), -1.0, 1.0)
    int16 = (pcm * 32767).astype(np.int16)
    with wave.open(str(filepath), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(int16.tobytes())
    return f"/storage/live/{filename}"


def _save_upload(content: bytes, original_name: str) -> str:
    """Save an uploaded file to storage/uploads/ and return its URL path."""
    (STORAGE_DIR / "uploads").mkdir(parents=True, exist_ok=True)
    ext = Path(original_name).suffix or ".bin"
    filename = f"upload_{int(time.time() * 1000)}{ext}"
    (STORAGE_DIR / "uploads" / filename).write_bytes(content)
    return f"/storage/uploads/{filename}"


@router.websocket("/ws/analyze")
async def analyze_stream(websocket: WebSocket):
    """
    WebSocket protocol
    ──────────────────
    Client → Server:
      1st msg  (JSON):   { "sample_rate": 44100, "recording_id": null }
      subsequent (binary): Float32 PCM chunks (little-endian)
      stop msg  (JSON):  { "type": "stop" }

    Server → Client (JSON):
      { "status": "ready", "window_secs": 8 }
      { "bpm": 128.4, "genre_hint": "Tech House", "confidence": 0.8, "stability": 0.9 }
      { "type": "saved", "audio_url": "/storage/live/live_123.wav" }
      { "error": "..." }
    """
    await websocket.accept()
    buffer: list = []
    all_samples: list = []
    sample_rate = 44100

    try:
        raw = await websocket.receive_text()
        config = json.loads(raw)
        sample_rate = int(config.get("sample_rate", 44100))

        samples_needed = sample_rate * ANALYSIS_WINDOW_SECS
        overlap_samples = sample_rate * OVERLAP_SECS

        await websocket.send_json({"status": "ready", "window_secs": ANALYSIS_WINDOW_SECS})

        while True:
            msg = await websocket.receive()

            if "bytes" in msg:
                data = msg["bytes"]
                n = len(data) // 4
                chunk = struct.unpack(f"<{n}f", data)
                all_samples.extend(chunk)
                buffer.extend(chunk)

                if len(buffer) >= samples_needed:
                    audio = np.array(buffer[-samples_needed:], dtype=np.float32)

                    loop = asyncio.get_running_loop()
                    result = await loop.run_in_executor(_executor, analyze_chunk, audio, sample_rate)

                    await websocket.send_json({
                        "bpm": result.bpm,
                        "genre_hint": result.genre_hint,
                        "confidence": result.confidence,
                        "stability": result.bpm_stability,
                    })

                    buffer = buffer[-overlap_samples:]

            elif "text" in msg:
                payload = json.loads(msg["text"])
                if payload.get("type") == "stop":
                    audio_url = None
                    if all_samples:
                        loop = asyncio.get_running_loop()
                        audio_url = await loop.run_in_executor(
                            _executor, _save_live_wav, list(all_samples), sample_rate
                        )
                    await websocket.send_json({"type": "saved", "audio_url": audio_url})
                    break

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.exception("analyze_stream error: %s", e)
        try:
            await websocket.send_json({"error": str(e)})
        except Exception:
            pass



@router.post("/analyze/file")
async def analyze_file(file: UploadFile = File(...)):
    """
    Analyze an uploaded audio file and return BPM + genre hint.
    Also saves the file to storage/uploads/ for later playback.

    Accepts: .wav, .mp3, .mp4, .m4a, .flac, .ogg
    Returns: { "bpm", "genre_hint", "confidence", "stability", "audio_url" }
    """
    try:
        content = await file.read()

        loop = asyncio.get_running_loop()

        # Save file and analyze in parallel via executor
        original_name = file.filename or "upload"
        audio_url = await loop.run_in_executor(_executor, _save_upload, content, original_name)

        audio, sample_rate = librosa.load(BytesIO(content), sr=None, mono=True)
        result = await loop.run_in_executor(_executor, analyze_chunk, audio, sample_rate)

        return {
            "bpm": result.bpm,
            "genre_hint": result.genre_hint,
            "confidence": result.confidence,
            "stability": result.bpm_stability,
            "audio_url": audio_url,
        }

    except Exception as e:
        logger.exception("analyze_file error: %s", e)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")
