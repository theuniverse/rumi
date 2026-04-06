import asyncio
import json
import logging
import os
import re
import struct
import subprocess
import tempfile
import time
import wave
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Optional

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

_VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm", ".flv", ".wmv", ".3gp"}


def _parse_gps_string(location: str) -> tuple[Optional[float], Optional[float]]:
    """
    Parse GPS coordinates from various formats:
    - iPhone format: "+31.2345+121.4567/" or "+31.2345-121.4567/"
    - Standard format: "31.2345, 121.4567"
    Returns (latitude, longitude) or (None, None) if parsing fails
    """
    if not location:
        return None, None

    try:
        # iPhone format: +31.2345+121.4567/
        match = re.match(r'([+-]\d+\.\d+)([+-]\d+\.\d+)', location)
        if match:
            lat = float(match.group(1))
            lng = float(match.group(2))
            return lat, lng

        # Standard comma-separated format
        if ',' in location:
            parts = location.split(',')
            if len(parts) == 2:
                lat = float(parts[0].strip())
                lng = float(parts[1].strip())
                return lat, lng
    except (ValueError, AttributeError):
        pass

    return None, None


def _extract_video_metadata(file_path: str) -> dict:
    """
    Extract metadata from video file using ffprobe.
    Returns dict with: created_at, latitude, longitude, device, duration
    """
    metadata = {
        "created_at": None,
        "latitude": None,
        "longitude": None,
        "device": None,
        "duration": None,
    }

    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "quiet", "-print_format", "json",
                "-show_format", "-show_streams", file_path
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )

        if result.returncode != 0:
            logger.warning(f"ffprobe failed with code {result.returncode}")
            return metadata

        data = json.loads(result.stdout)
        format_tags = data.get("format", {}).get("tags", {})

        # Extract creation time (various tag names used by different devices)
        for key in ["creation_time", "date", "com.apple.quicktime.creationdate"]:
            if key in format_tags:
                try:
                    # Parse ISO format datetime
                    created_at = format_tags[key]
                    # Normalize to ISO format
                    if created_at:
                        # Handle various datetime formats
                        dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                        metadata["created_at"] = dt.isoformat()
                        break
                except (ValueError, AttributeError) as e:
                    logger.warning(f"Failed to parse creation_time: {e}")

        # Extract GPS location
        for key in ["location", "com.apple.quicktime.location.ISO6709"]:
            if key in format_tags:
                lat, lng = _parse_gps_string(format_tags[key])
                if lat is not None and lng is not None:
                    metadata["latitude"] = lat
                    metadata["longitude"] = lng
                    break

        # Extract device info
        for key in ["make", "com.apple.quicktime.make"]:
            if key in format_tags:
                make = format_tags[key]
                model = format_tags.get("model", format_tags.get("com.apple.quicktime.model", ""))
                metadata["device"] = f"{make} {model}".strip() if model else make
                break

        # Extract duration
        duration = data.get("format", {}).get("duration")
        if duration:
            try:
                metadata["duration"] = float(duration)
            except (ValueError, TypeError):
                pass

        logger.info(f"Extracted metadata: {metadata}")

    except FileNotFoundError:
        logger.warning("ffprobe not found, metadata extraction skipped")
    except subprocess.TimeoutExpired:
        logger.warning("ffprobe timeout, metadata extraction skipped")
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse ffprobe output: {e}")
    except Exception as e:
        logger.warning(f"Unexpected error extracting metadata: {e}")

    return metadata


def _extract_audio_if_video(content: bytes, original_name: str) -> tuple[bytes, str, str | None]:
    """Extract audio from a video file using ffmpeg.
    Returns (audio_bytes, effective_name, tmp_path_to_cleanup).
    - If not a video: (content, original_name, None)
    - If ffmpeg succeeds: (wav_bytes, stem.wav, None)
    - If ffmpeg missing: (content, original_name, tmp_video_path) — caller must
      pass tmp_video_path to librosa and delete it afterwards (AVFoundation needs
      a real file path, not BytesIO).
    """
    ext = Path(original_name).suffix.lower()
    if ext not in _VIDEO_EXTENSIONS:
        return content, original_name, None

    tmp_in = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
    try:
        tmp_in.write(content)
        tmp_in.close()
        tmp_out_path = tmp_in.name + ".wav"
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-i", tmp_in.name, "-vn", "-ac", "1", "-ar", "44100", tmp_out_path],
                capture_output=True,
                check=True,
                timeout=300,  # Increased timeout for large video files
            )
            with open(tmp_out_path, "rb") as f:
                wav_content = f.read()
            # Clean up immediately: delete video temp file and wav temp file
            os.unlink(tmp_in.name)
            os.unlink(tmp_out_path)
            return wav_content, Path(original_name).stem + ".wav", None
        except FileNotFoundError:
            # ffmpeg not installed — return the temp file path so librosa can
            # open it directly (required for AVFoundation on macOS)
            logger.warning("ffmpeg not found, will pass file path to librosa for %s", original_name)
            return content, original_name, tmp_in.name  # caller cleans up
        except Exception as e:
            # Clean up on error
            if os.path.exists(tmp_out_path):
                os.unlink(tmp_out_path)
            raise
    except Exception:
        if os.path.exists(tmp_in.name):
            os.unlink(tmp_in.name)
        raise


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


def _save_upload(content: bytes, effective_name: str) -> str:
    """Save bytes to storage/uploads/ and return its URL path."""
    (STORAGE_DIR / "uploads").mkdir(parents=True, exist_ok=True)
    ext = Path(effective_name).suffix or ".bin"
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



@router.post("/api/analyze/file")
async def analyze_file(file: UploadFile = File(...)):
    """
    Analyze an uploaded audio/video file and return BPM + genre hint + metadata.
    Also saves the file to storage/uploads/ for later playback.

    Accepts: .wav, .mp3, .mp4, .m4a, .flac, .ogg, .mov, etc.
    Returns: {
        "bpm", "genre_hint", "confidence", "stability", "audio_url",
        "metadata": { "created_at", "latitude", "longitude", "device", "duration" }
    }
    """
    try:
        content = await file.read()
        original_name = file.filename or "upload.bin"
        loop = asyncio.get_running_loop()

        # Extract metadata from video file before processing
        metadata: dict = {}
        ext = Path(original_name).suffix.lower()
        if ext in _VIDEO_EXTENSIONS:
            # Save to temp file for metadata extraction
            tmp_for_metadata = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
            try:
                tmp_for_metadata.write(content)
                tmp_for_metadata.close()
                metadata = await loop.run_in_executor(
                    _executor, _extract_video_metadata, tmp_for_metadata.name
                )
            finally:
                if os.path.exists(tmp_for_metadata.name):
                    os.unlink(tmp_for_metadata.name)

        # Extract audio track if this is a video file (MOV, MP4, etc.)
        audio_content, effective_name, tmp_video_path = await loop.run_in_executor(
            _executor, _extract_audio_if_video, content, original_name
        )

        audio_url = await loop.run_in_executor(_executor, _save_upload, audio_content, effective_name)

        # Use file path when ffmpeg was absent (AVFoundation needs a real path)
        load_src = tmp_video_path if tmp_video_path else BytesIO(audio_content)
        try:
            audio, sample_rate = await loop.run_in_executor(
                _executor, lambda: librosa.load(load_src, sr=None, mono=True)
            )
        finally:
            if tmp_video_path and os.path.exists(tmp_video_path):
                os.unlink(tmp_video_path)

        result = await loop.run_in_executor(_executor, analyze_chunk, audio, sample_rate)

        return {
            "bpm": result.bpm,
            "genre_hint": result.genre_hint,
            "confidence": result.confidence,
            "stability": result.bpm_stability,
            "audio_url": audio_url,
            "metadata": metadata,
        }

    except Exception as e:
        logger.exception("analyze_file error: %s", e)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")
