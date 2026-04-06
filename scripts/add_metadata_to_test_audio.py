#!/usr/bin/env python3
"""
Add metadata to existing test audio files to create test videos with metadata.
This script uses existing audio files and converts them to video format with metadata.
"""

import subprocess
import sys
from pathlib import Path

def add_metadata_to_audio(
    input_audio: str,
    output_video: str,
    creation_time: str = None,
    latitude: float = None,
    longitude: float = None,
    device_make: str = None,
    device_model: str = None,
):
    """
    Convert audio to video with metadata using ffmpeg.
    Creates a black video with the audio track and embedded metadata.
    """

    cmd = [
        "ffmpeg", "-y",
        # Input audio file
        "-i", input_audio,
        # Create a black video
        "-f", "lavfi", "-i", "color=c=black:s=640x480:d=10",
        # Map audio and video
        "-map", "0:a", "-map", "1:v",
        # Codec settings
        "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k",
        "-shortest",
    ]

    # Add metadata
    if creation_time:
        cmd.extend(["-metadata", f"creation_time={creation_time}"])

    if latitude is not None and longitude is not None:
        location_str = f"{latitude:+.6f}{longitude:+.6f}/"
        cmd.extend(["-metadata", f"location={location_str}"])
        cmd.extend(["-metadata", f"com.apple.quicktime.location.ISO6709={location_str}"])

    if device_make:
        cmd.extend(["-metadata", f"make={device_make}"])
        cmd.extend(["-metadata", f"com.apple.quicktime.make={device_make}"])

    if device_model:
        cmd.extend(["-metadata", f"model={device_model}"])
        cmd.extend(["-metadata", f"com.apple.quicktime.model={device_model}"])

    cmd.append(output_video)

    print(f"Converting: {Path(input_audio).name} -> {Path(output_video).name}")
    if creation_time:
        print(f"  Creation time: {creation_time}")
    if latitude is not None and longitude is not None:
        print(f"  GPS: {latitude}, {longitude}")
    if device_make or device_model:
        print(f"  Device: {device_make} {device_model}")

    try:
        subprocess.run(cmd, capture_output=True, text=True, check=True)
        print(f"  ✓ Success")
        return True
    except subprocess.CalledProcessError as e:
        print(f"  ✗ Failed: {e.stderr[:200]}")
        return False
    except FileNotFoundError:
        print("  ✗ Error: ffmpeg not found")
        return False


def main():
    # Check if ffmpeg is available
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("=" * 60)
        print("ERROR: ffmpeg is not installed")
        print("=" * 60)
        print()
        print("Please install ffmpeg first:")
        print("  macOS:   brew install ffmpeg")
        print("  Ubuntu:  sudo apt-get install ffmpeg")
        print("  Windows: Download from https://ffmpeg.org/download.html")
        print()
        print("Note: The backend already uses ffmpeg for video processing,")
        print("so it should be available in your environment.")
        return 1

    # Find test audio files
    test_audio_dir = Path(__file__).parent.parent / "test-audio"
    if not test_audio_dir.exists():
        test_audio_dir = Path(__file__).parent.parent / "frontend" / "public" / "test-audio"

    if not test_audio_dir.exists():
        print(f"Error: Test audio directory not found: {test_audio_dir}")
        return 1

    audio_files = list(test_audio_dir.glob("*.wav"))
    if not audio_files:
        print(f"Error: No WAV files found in {test_audio_dir}")
        return 1

    # Create output directory
    output_dir = Path(__file__).parent.parent / "test-videos"
    output_dir.mkdir(exist_ok=True)

    print("=" * 60)
    print("Adding Metadata to Test Audio Files")
    print("=" * 60)
    print()

    successes = 0

    # Use the first audio file for all test cases
    source_audio = str(audio_files[0])

    # Test case 1: iPhone video with full metadata (Shanghai)
    if add_metadata_to_audio(
        input_audio=source_audio,
        output_video=str(output_dir / "test_iphone_shanghai.mp4"),
        creation_time="2024-03-15T14:30:00Z",
        latitude=31.230416,
        longitude=121.473701,
        device_make="Apple",
        device_model="iPhone 15 Pro",
    ):
        successes += 1
    print()

    # Test case 2: Android video (Beijing)
    if add_metadata_to_audio(
        input_audio=source_audio,
        output_video=str(output_dir / "test_android_beijing.mp4"),
        creation_time="2024-03-20T18:45:00Z",
        latitude=39.904200,
        longitude=116.407396,
        device_make="Samsung",
        device_model="Galaxy S24",
    ):
        successes += 1
    print()

    # Test case 3: Video with time only, no GPS
    if add_metadata_to_audio(
        input_audio=source_audio,
        output_video=str(output_dir / "test_no_gps.mp4"),
        creation_time="2024-04-01T20:00:00Z",
        device_make="Sony",
        device_model="A7 IV",
    ):
        successes += 1
    print()

    # Test case 4: Minimal video with no metadata
    if add_metadata_to_audio(
        input_audio=source_audio,
        output_video=str(output_dir / "test_no_metadata.mp4"),
    ):
        successes += 1
    print()

    print("=" * 60)
    print("Summary")
    print("=" * 60)
    print(f"Created {successes}/4 test videos successfully")
    print(f"Test videos saved to: {output_dir}")
    print()
    print("Test videos:")
    for video in sorted(output_dir.glob("test_*.mp4")):
        print(f"  - {video.name}")
    print()

    return 0 if successes > 0 else 1


if __name__ == "__main__":
    sys.exit(main())

# Made with Bob
