#!/usr/bin/env python3
"""
Generate test video files with embedded metadata for testing video metadata extraction.
Creates minimal video files with GPS coordinates, creation time, and device info.
"""

import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

def create_test_video_with_metadata(
    output_path: str,
    duration: int = 5,
    creation_time: str = None,
    latitude: float = None,
    longitude: float = None,
    device_make: str = None,
    device_model: str = None,
):
    """
    Create a minimal test video with metadata using ffmpeg.

    Args:
        output_path: Path to save the video file
        duration: Video duration in seconds
        creation_time: ISO format datetime string (e.g., "2024-03-15T14:30:00Z")
        latitude: GPS latitude
        longitude: GPS longitude
        device_make: Device manufacturer (e.g., "Apple")
        device_model: Device model (e.g., "iPhone 15 Pro")
    """

    # Build ffmpeg command to create a minimal video with a test tone
    cmd = [
        "ffmpeg", "-y",
        # Generate a test tone (440 Hz sine wave)
        "-f", "lavfi", "-i", f"sine=frequency=440:duration={duration}",
        # Generate a test pattern video
        "-f", "lavfi", "-i", f"testsrc=duration={duration}:size=640x480:rate=30",
        # Map audio and video
        "-map", "0:a", "-map", "1:v",
        # Codec settings (fast encoding)
        "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k",
    ]

    # Add metadata
    metadata = []

    if creation_time:
        metadata.extend(["-metadata", f"creation_time={creation_time}"])

    if latitude is not None and longitude is not None:
        # iPhone format: +latitude+longitude/
        location_str = f"{latitude:+.6f}{longitude:+.6f}/"
        metadata.extend(["-metadata", f"location={location_str}"])
        # Also add the Apple-specific tag
        metadata.extend(["-metadata", f"com.apple.quicktime.location.ISO6709={location_str}"])

    if device_make:
        metadata.extend(["-metadata", f"make={device_make}"])
        metadata.extend(["-metadata", f"com.apple.quicktime.make={device_make}"])

    if device_model:
        metadata.extend(["-metadata", f"model={device_model}"])
        metadata.extend(["-metadata", f"com.apple.quicktime.model={device_model}"])

    cmd.extend(metadata)
    cmd.append(output_path)

    print(f"Creating test video: {output_path}")
    print(f"  Duration: {duration}s")
    if creation_time:
        print(f"  Creation time: {creation_time}")
    if latitude is not None and longitude is not None:
        print(f"  GPS: {latitude}, {longitude}")
    if device_make or device_model:
        print(f"  Device: {device_make} {device_model}")

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        print(f"✓ Successfully created: {output_path}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"✗ Failed to create video: {e}")
        print(f"  stdout: {e.stdout}")
        print(f"  stderr: {e.stderr}")
        return False
    except FileNotFoundError:
        print("✗ Error: ffmpeg not found. Please install ffmpeg first.")
        return False


def main():
    # Create test-videos directory
    test_dir = Path(__file__).parent.parent / "test-videos"
    test_dir.mkdir(exist_ok=True)

    print("=" * 60)
    print("Generating Test Videos with Metadata")
    print("=" * 60)
    print()

    # Test case 1: iPhone video with full metadata (Shanghai location)
    success1 = create_test_video_with_metadata(
        output_path=str(test_dir / "test_iphone_shanghai.mp4"),
        duration=5,
        creation_time="2024-03-15T14:30:00Z",
        latitude=31.230416,
        longitude=121.473701,
        device_make="Apple",
        device_model="iPhone 15 Pro",
    )
    print()

    # Test case 2: Android video with GPS only (Beijing location)
    success2 = create_test_video_with_metadata(
        output_path=str(test_dir / "test_android_beijing.mp4"),
        duration=5,
        creation_time="2024-03-20T18:45:00Z",
        latitude=39.904200,
        longitude=116.407396,
        device_make="Samsung",
        device_model="Galaxy S24",
    )
    print()

    # Test case 3: Video with time only, no GPS
    success3 = create_test_video_with_metadata(
        output_path=str(test_dir / "test_no_gps.mp4"),
        duration=5,
        creation_time="2024-04-01T20:00:00Z",
        device_make="Sony",
        device_model="A7 IV",
    )
    print()

    # Test case 4: Minimal video with no metadata
    success4 = create_test_video_with_metadata(
        output_path=str(test_dir / "test_no_metadata.mp4"),
        duration=5,
    )
    print()

    # Test case 5: MOV format (Apple QuickTime)
    success5 = create_test_video_with_metadata(
        output_path=str(test_dir / "test_iphone_mov.mov"),
        duration=5,
        creation_time="2024-03-25T16:20:00Z",
        latitude=31.224361,
        longitude=121.469170,
        device_make="Apple",
        device_model="iPhone 14 Pro Max",
    )
    print()

    print("=" * 60)
    print("Summary")
    print("=" * 60)
    successes = sum([success1, success2, success3, success4, success5])
    print(f"Created {successes}/5 test videos successfully")
    print(f"Test videos saved to: {test_dir}")
    print()
    print("You can now upload these videos to test metadata extraction:")
    print("  1. test_iphone_shanghai.mp4 - Full metadata (Shanghai)")
    print("  2. test_android_beijing.mp4 - Full metadata (Beijing)")
    print("  3. test_no_gps.mp4 - Time only, no GPS")
    print("  4. test_no_metadata.mp4 - No metadata")
    print("  5. test_iphone_mov.mov - MOV format with metadata")
    print()

    return 0 if successes == 5 else 1


if __name__ == "__main__":
    sys.exit(main())

# Made with Bob
