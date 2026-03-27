"""
Test the /ws/analyze WebSocket endpoint with the 3 generated WAV files.
Streams audio in 4096-sample chunks (matching the frontend ScriptProcessor).
"""

import asyncio
import json
import struct
import wave
import os

import websockets

WS_URL = "ws://localhost:8000/ws/analyze"
CHUNK_SIZE = 4096  # samples per chunk, same as frontend ScriptProcessorNode
TEST_DIR = os.path.join(os.path.dirname(__file__), "..", "test-audio")

FILES = [
    ("techno_138bpm.wav", "Techno", 138),
    ("house_124bpm.wav",  "House",  124),
    ("ambient_82bpm.wav", "Ambient", 82),
]


async def test_file(filename: str, expected_genre: str, expected_bpm: int):
    path = os.path.join(TEST_DIR, filename)
    print(f"\n{'='*60}")
    print(f"  Testing: {filename}")
    print(f"  Expected: ~{expected_bpm} BPM, {expected_genre}")
    print(f"{'='*60}")

    # Read WAV
    with wave.open(path, "rb") as wf:
        assert wf.getnchannels() == 1, "Expected mono"
        assert wf.getsampwidth() == 2, "Expected 16-bit"
        sr = wf.getframerate()
        n_frames = wf.getnframes()
        raw = wf.readframes(n_frames)

    # Convert int16 -> float32
    samples = struct.unpack(f"<{n_frames}h", raw)
    float_samples = [s / 32768.0 for s in samples]

    print(f"  Audio: {n_frames} samples, {sr} Hz, {n_frames/sr:.1f}s")

    results = []
    async with websockets.connect(WS_URL) as ws:
        # Send config
        await ws.send(json.dumps({"sample_rate": sr}))

        # Read "ready" response
        ready = json.loads(await ws.recv())
        print(f"  Server: {ready}")

        # Stream audio in chunks
        total_chunks = 0
        for i in range(0, len(float_samples), CHUNK_SIZE):
            chunk = float_samples[i : i + CHUNK_SIZE]
            # Pack as Float32 little-endian (matching frontend behavior)
            data = struct.pack(f"<{len(chunk)}f", *chunk)
            await ws.send(data)
            total_chunks += 1

            # Non-blocking check for results
            try:
                while True:
                    msg = await asyncio.wait_for(ws.recv(), timeout=0.01)
                    result = json.loads(msg)
                    results.append(result)
                    print(f"  >> Result: BPM={result.get('bpm')}, "
                          f"Genre={result.get('genre_hint')}, "
                          f"Confidence={result.get('confidence')}, "
                          f"Stability={result.get('stability')}")
            except asyncio.TimeoutError:
                pass

        print(f"  Sent {total_chunks} chunks ({total_chunks * CHUNK_SIZE / sr:.1f}s of audio)")

        # Wait for any remaining results (backend might still be processing)
        for _ in range(10):
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=2.0)
                result = json.loads(msg)
                results.append(result)
                print(f"  >> Result: BPM={result.get('bpm')}, "
                      f"Genre={result.get('genre_hint')}, "
                      f"Confidence={result.get('confidence')}, "
                      f"Stability={result.get('stability')}")
            except (asyncio.TimeoutError, websockets.exceptions.ConnectionClosed):
                break

    # Summary
    if not results:
        print(f"\n  FAIL: No analysis results received!")
        return False

    bpms = [r["bpm"] for r in results if r.get("bpm", 0) > 0]
    genres = [r["genre_hint"] for r in results if r.get("genre_hint")]
    avg_bpm = sum(bpms) / len(bpms) if bpms else 0

    bpm_ok = abs(avg_bpm - expected_bpm) < 15
    genre_ok = any(expected_genre.lower() in g.lower() for g in genres)

    print(f"\n  Summary: {len(results)} analysis frame(s)")
    print(f"  Avg BPM: {avg_bpm:.1f}  (expected ~{expected_bpm})  {'OK' if bpm_ok else 'MISMATCH'}")
    print(f"  Genres:  {set(genres)}  (expected {expected_genre})  {'OK' if genre_ok else 'MISMATCH'}")

    return bpm_ok or genre_ok


async def main():
    print("Testing Rumi /ws/analyze endpoint with 3 WAV files")
    print(f"WebSocket: {WS_URL}")

    passed = 0
    for filename, genre, bpm in FILES:
        try:
            ok = await test_file(filename, genre, bpm)
            if ok:
                passed += 1
        except Exception as e:
            print(f"\n  ERROR: {e}")

    print(f"\n{'='*60}")
    print(f"  Results: {passed}/{len(FILES)} passed")
    print(f"{'='*60}")


if __name__ == "__main__":
    asyncio.run(main())
