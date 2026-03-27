"""
Generate three test WAV files: Techno (138 BPM), House (124 BPM), Ambient (82 BPM).
Each file is ~30 seconds, 44100 Hz, 16-bit mono.
"""

import numpy as np
import struct
import wave
import os

SR = 44100
DURATION = 30  # seconds


def write_wav(path: str, samples: np.ndarray):
    """Write mono 16-bit WAV."""
    samples = np.clip(samples, -1.0, 1.0)
    pcm = (samples * 32767).astype(np.int16)
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm.tobytes())
    print(f"  wrote {path}  ({len(pcm)/SR:.1f}s, {os.path.getsize(path)//1024} KB)")


# ── Synth primitives ────────────────────────────────────────────────

def sine(freq, dur, sr=SR):
    t = np.arange(int(sr * dur)) / sr
    return np.sin(2 * np.pi * freq * t)


def noise(dur, sr=SR):
    return np.random.randn(int(sr * dur))


def envelope(n, attack=0.005, decay=0.05, sustain=0.3, release=0.1, sr=SR):
    """Simple ADSR envelope."""
    a = int(sr * attack)
    d = int(sr * decay)
    r = int(sr * release)
    s = max(0, n - a - d - r)
    env = np.concatenate([
        np.linspace(0, 1, a),
        np.linspace(1, sustain, d),
        np.full(s, sustain),
        np.linspace(sustain, 0, r),
    ])
    return env[:n]


def kick(dur=0.25):
    """Punchy kick: pitch-swept sine with fast decay."""
    n = int(SR * dur)
    t = np.arange(n) / SR
    # pitch sweep from 150 Hz down to 45 Hz
    freq = 45 + 105 * np.exp(-t * 30)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    amp = np.exp(-t * 12)
    return np.sin(phase) * amp


def hihat(dur=0.05, is_open=False):
    """Hi-hat: filtered noise burst."""
    actual_dur = dur * (3 if is_open else 1)
    n = int(SR * actual_dur)
    sig = noise(actual_dur) * envelope(n, attack=0.001, decay=0.02, sustain=0.15 if is_open else 0.0, release=actual_dur * 0.3)
    # crude high-pass: subtract smoothed version
    kernel = 8
    smoothed = np.convolve(sig, np.ones(kernel) / kernel, mode="same")
    return (sig - smoothed) * (0.35 if is_open else 0.25)


def bass_note(freq, dur):
    """Fat bass: fundamental + sub-octave with envelope."""
    n = int(SR * dur)
    t = np.arange(n) / SR
    sig = 0.6 * sine(freq, dur) + 0.4 * sine(freq / 2, dur)
    env = envelope(n, attack=0.005, decay=0.05, sustain=0.7, release=0.05)
    return sig * env


def pad_chord(freqs, dur, detune=0.5):
    """Warm pad: layered detuned sines with slow attack."""
    n = int(SR * dur)
    sig = np.zeros(n)
    for f in freqs:
        for d in [-detune, 0, detune]:
            sig += sine(f + d, dur) * 0.15
    env = envelope(n, attack=dur * 0.3, decay=dur * 0.1, sustain=0.6, release=dur * 0.3)
    return sig * env


# ── Sequencer helper ────────────────────────────────────────────────

def place(out, sample, start_sample):
    """Mix sample into output at a given position."""
    end = min(start_sample + len(sample), len(out))
    length = end - start_sample
    if length > 0:
        out[start_sample:end] += sample[:length]


# ── TECHNO  (138 BPM) ──────────────────────────────────────────────

def gen_techno():
    print("Generating Techno (138 BPM)...")
    bpm = 138
    beat = 60.0 / bpm  # ~0.435s
    n = int(SR * DURATION)
    out = np.zeros(n)

    total_beats = int(DURATION / beat)
    for i in range(total_beats):
        pos = int(i * beat * SR)

        # Four-on-the-floor kick
        place(out, kick(0.2) * 0.85, pos)

        # Closed hi-hat on every 8th note
        place(out, hihat(0.04), pos + int(beat * SR * 0.5))

        # Open hi-hat every 4 beats on the "and" of beat 2
        if i % 4 == 1:
            place(out, hihat(0.08, is_open=True) * 1.2, pos + int(beat * SR * 0.5))

        # Acid-style bass on beats 1 and 3
        if i % 4 in (0, 2):
            note = [55, 55, 58.27, 55][i % 4]  # A1, A1, Bb1, A1
            place(out, bass_note(note, beat * 0.7) * 0.45, pos)

        # Stab synth on the "and" of every 2nd beat
        if i % 8 == 4:
            stab_freqs = [220, 277.18, 329.63]  # A3, C#4, E4
            stab = pad_chord(stab_freqs, beat * 0.3, detune=1.0) * 0.3
            place(out, stab, pos)

    return out * 0.8


# ── HOUSE  (124 BPM) ───────────────────────────────────────────────

def gen_house():
    print("Generating House (124 BPM)...")
    bpm = 124
    beat = 60.0 / bpm  # ~0.484s
    n = int(SR * DURATION)
    out = np.zeros(n)

    # Chord progression: Am - F - C - G (2 bars each = 8 beats each)
    chords = [
        [220, 261.63, 329.63],     # Am (A3, C4, E4)
        [174.61, 220, 261.63],     # F  (F3, A3, C4)
        [261.63, 329.63, 392.00],  # C  (C4, E4, G4)
        [196.00, 246.94, 293.66],  # G  (G3, B3, D4)
    ]

    total_beats = int(DURATION / beat)
    for i in range(total_beats):
        pos = int(i * beat * SR)

        # Kick on every beat (four-on-the-floor)
        place(out, kick(0.22) * 0.8, pos)

        # Offbeat hi-hat (classic house groove)
        place(out, hihat(0.05), pos + int(beat * SR * 0.5))

        # Open hi-hat on every 4th beat
        if i % 4 == 3:
            place(out, hihat(0.1, is_open=True) * 1.0, pos + int(beat * SR * 0.5))

        # Bass line: root note on beats 1 and 3
        chord_idx = (i // 8) % len(chords)
        root = chords[chord_idx][0]
        if i % 4 in (0, 2):
            place(out, bass_note(root / 2, beat * 0.6) * 0.5, pos)

        # Warm pad chord (sustained over 8 beats)
        if i % 8 == 0:
            pad = pad_chord(chords[chord_idx], beat * 7.5, detune=0.8) * 0.2
            place(out, pad, pos)

    return out * 0.8


# ── AMBIENT  (82 BPM) ──────────────────────────────────────────────

def gen_ambient():
    print("Generating Ambient (82 BPM)...")
    bpm = 82
    beat = 60.0 / bpm  # ~0.732s
    n = int(SR * DURATION)
    out = np.zeros(n)

    # Evolving pad chords (long sustained)
    ambient_chords = [
        [130.81, 196.00, 261.63, 329.63],  # C3, G3, C4, E4
        [146.83, 220.00, 293.66, 349.23],  # D3, A3, D4, F4
        [164.81, 246.94, 329.63, 392.00],  # E3, B3, E4, G4
        [130.81, 196.00, 261.63, 392.00],  # C3, G3, C4, G4
    ]

    # Long pads: each chord lasts ~8 seconds
    chord_dur = 8.0
    for ci, chord in enumerate(ambient_chords):
        for rep in range(int(DURATION / (len(ambient_chords) * chord_dur)) + 1):
            start = int((ci * chord_dur + rep * len(ambient_chords) * chord_dur) * SR)
            if start >= n:
                break
            pad = pad_chord(chord, chord_dur, detune=0.3) * 0.35
            place(out, pad, start)

    # Subtle texture: very quiet filtered noise
    texture = noise(DURATION) * 0.02
    # Simple low-pass approximation
    kernel_size = 50
    texture = np.convolve(texture, np.ones(kernel_size) / kernel_size, mode="same")
    out += texture

    # Sparse bell-like tones on some beats
    total_beats = int(DURATION / beat)
    bell_notes = [523.25, 659.25, 783.99, 1046.50]  # C5, E5, G5, C6
    for i in range(total_beats):
        if i % 8 in (0, 3, 5):
            pos = int(i * beat * SR)
            note = bell_notes[i % len(bell_notes)]
            bell_n = int(SR * 2.0)
            t = np.arange(bell_n) / SR
            bell = np.sin(2 * np.pi * note * t) * np.exp(-t * 2.0) * 0.12
            # Add harmonics
            bell += np.sin(2 * np.pi * note * 2.01 * t) * np.exp(-t * 4.0) * 0.05
            bell += np.sin(2 * np.pi * note * 3.03 * t) * np.exp(-t * 6.0) * 0.03
            place(out, bell, pos)

    # Sub bass drone
    t_all = np.arange(n) / SR
    drone = np.sin(2 * np.pi * 55 * t_all) * 0.1  # A1 drone
    # Slow amplitude modulation
    drone *= 0.5 + 0.5 * np.sin(2 * np.pi * 0.05 * t_all)
    out += drone

    return out * 0.8


# ── Main ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    out_dir = os.path.join(os.path.dirname(__file__), "..", "test-audio")
    os.makedirs(out_dir, exist_ok=True)

    write_wav(os.path.join(out_dir, "techno_138bpm.wav"), gen_techno())
    write_wav(os.path.join(out_dir, "house_124bpm.wav"), gen_house())
    write_wav(os.path.join(out_dir, "ambient_82bpm.wav"), gen_ambient())

    print("\nDone! Files in test-audio/")
