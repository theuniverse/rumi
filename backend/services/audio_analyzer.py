import numpy as np
import librosa
from dataclasses import dataclass


@dataclass
class AnalysisResult:
    bpm: float
    genre_hint: str
    confidence: float
    bpm_stability: float  # 0-1, how consistent the beat is


# BPM ranges mapped to genre hints (simplified for MVP)
_GENRE_MAP = [
    (0,   85,  "Ambient / Drone",     0.5),
    (85,  100, "Hip-Hop / Downtempo", 0.6),
    (100, 115, "R&B / Soul",          0.6),
    (115, 122, "Deep House / Garage", 0.7),
    (122, 128, "House",               0.8),
    (128, 133, "Tech House",          0.8),
    (133, 140, "Techno",              0.8),
    (140, 150, "Hard Techno",         0.75),
    (150, 160, "Trance",              0.7),
    (160, 178, "Drum & Bass",         0.75),
    (178, 300, "Hardcore / Breaks",   0.6),
]


def _bpm_to_genre(bpm: float) -> tuple[str, float]:
    for lo, hi, genre, conf in _GENRE_MAP:
        if lo <= bpm < hi:
            return genre, conf
    return "Unknown", 0.4


def _normalize_bpm(bpm: float, lo: float = 80.0, hi: float = 200.0) -> float:
    """Fold BPM into a reasonable range by halving/doubling."""
    if bpm <= 0:
        return 0.0
    for _ in range(16):  # cap iterations to avoid infinite loop
        if bpm >= lo:
            break
        bpm *= 2.0
    for _ in range(16):
        if bpm <= hi:
            break
        bpm /= 2.0
    return bpm


def analyze_chunk(audio: np.ndarray, sample_rate: int) -> AnalysisResult:
    """
    Analyze a PCM audio buffer and return BPM + genre hint.
    audio: float32 mono PCM
    sample_rate: Hz (e.g. 44100)
    """
    # Resample to 22050 Hz (librosa default, faster analysis)
    target_sr = 22050
    if sample_rate != target_sr:
        audio = librosa.resample(audio, orig_sr=sample_rate, target_sr=target_sr)

    # Beat tracking — librosa 0.10+ returns tempo as ndarray
    tempo, beat_frames = librosa.beat.beat_track(y=audio, sr=target_sr, units="frames")

    # Squeeze ndarray to scalar (handles both 0-d and shape-(1,) returns)
    bpm = float(np.squeeze(tempo))

    # If signal is silent / no beat detected, return zero-confidence result immediately
    if bpm <= 0:
        return AnalysisResult(bpm=0.0, genre_hint="Unknown", confidence=0.0, bpm_stability=0.0)

    bpm = _normalize_bpm(bpm)

    # Stability: how evenly spaced are the detected beats?
    stability = 0.5
    if len(beat_frames) >= 4:
        intervals = np.diff(beat_frames.astype(float))
        cv = intervals.std() / (intervals.mean() + 1e-6)  # coefficient of variation
        stability = float(max(0.0, min(1.0, 1.0 - cv)))

    genre, confidence = _bpm_to_genre(bpm)

    return AnalysisResult(
        bpm=round(bpm, 1),
        genre_hint=genre,
        confidence=round(confidence * stability, 2),
        bpm_stability=round(stability, 2),
    )
