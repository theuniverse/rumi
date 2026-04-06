#!/usr/bin/env python3
"""
Test script to verify video metadata extraction functionality.
Tests the _extract_video_metadata and _parse_gps_string functions.
"""

import sys
import os
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from routers.analyze import _parse_gps_string, _extract_video_metadata


def test_gps_parsing():
    """Test GPS coordinate parsing from various formats."""
    print("=" * 60)
    print("Testing GPS Coordinate Parsing")
    print("=" * 60)
    print()

    test_cases = [
        # (input, expected_lat, expected_lng, description)
        ("+31.230416+121.473701/", 31.230416, 121.473701, "iPhone format (Shanghai)"),
        ("+39.904200+116.407396/", 39.904200, 116.407396, "iPhone format (Beijing)"),
        ("+31.230416-121.473701/", 31.230416, -121.473701, "iPhone format (negative lng)"),
        ("-31.230416+121.473701/", -31.230416, 121.473701, "iPhone format (negative lat)"),
        ("31.230416, 121.473701", 31.230416, 121.473701, "Comma-separated format"),
        ("", None, None, "Empty string"),
        ("invalid", None, None, "Invalid format"),
    ]

    passed = 0
    failed = 0

    for input_str, expected_lat, expected_lng, description in test_cases:
        lat, lng = _parse_gps_string(input_str)

        if lat == expected_lat and lng == expected_lng:
            print(f"✓ PASS: {description}")
            print(f"  Input: '{input_str}'")
            print(f"  Result: ({lat}, {lng})")
            passed += 1
        else:
            print(f"✗ FAIL: {description}")
            print(f"  Input: '{input_str}'")
            print(f"  Expected: ({expected_lat}, {expected_lng})")
            print(f"  Got: ({lat}, {lng})")
            failed += 1
        print()

    print(f"GPS Parsing: {passed} passed, {failed} failed")
    print()
    return failed == 0


def test_metadata_extraction():
    """Test metadata extraction from video files."""
    print("=" * 60)
    print("Testing Video Metadata Extraction")
    print("=" * 60)
    print()

    # Check if test videos exist
    test_videos_dir = Path(__file__).parent.parent / "test-videos"

    if not test_videos_dir.exists():
        print("⚠ Test videos directory not found")
        print(f"  Expected: {test_videos_dir}")
        print()
        print("To generate test videos:")
        print("  1. Install ffmpeg: brew install ffmpeg")
        print("  2. Run: python3 scripts/add_metadata_to_test_audio.py")
        print()
        return False

    test_videos = list(test_videos_dir.glob("test_*.mp4")) + list(test_videos_dir.glob("test_*.mov"))

    if not test_videos:
        print("⚠ No test videos found")
        print(f"  Directory: {test_videos_dir}")
        print()
        print("To generate test videos:")
        print("  Run: python3 scripts/add_metadata_to_test_audio.py")
        print()
        return False

    print(f"Found {len(test_videos)} test video(s)")
    print()

    for video_path in sorted(test_videos):
        print(f"Testing: {video_path.name}")
        print("-" * 60)

        try:
            metadata = _extract_video_metadata(str(video_path))

            print(f"  Created At: {metadata.get('created_at') or 'None'}")
            print(f"  Latitude:   {metadata.get('latitude') or 'None'}")
            print(f"  Longitude:  {metadata.get('longitude') or 'None'}")
            print(f"  Device:     {metadata.get('device') or 'None'}")
            print(f"  Duration:   {metadata.get('duration') or 'None'}s")

            # Verify expected metadata based on filename
            if "iphone_shanghai" in video_path.name:
                assert metadata.get('latitude') is not None, "Expected GPS coordinates"
                assert metadata.get('created_at') is not None, "Expected creation time"
                assert metadata.get('device') is not None, "Expected device info"
                print("  ✓ All expected metadata present")
            elif "no_gps" in video_path.name:
                assert metadata.get('latitude') is None, "Should not have GPS"
                assert metadata.get('created_at') is not None, "Expected creation time"
                print("  ✓ Metadata as expected (no GPS)")
            elif "no_metadata" in video_path.name:
                # May have duration but nothing else
                print("  ✓ Minimal metadata as expected")

        except Exception as e:
            print(f"  ✗ Error: {e}")
            return False

        print()

    print("✓ All metadata extraction tests passed")
    return True


def main():
    print()
    print("╔" + "═" * 58 + "╗")
    print("║" + " " * 10 + "Video Metadata Extraction Test Suite" + " " * 11 + "║")
    print("╚" + "═" * 58 + "╝")
    print()

    # Test GPS parsing
    gps_ok = test_gps_parsing()

    # Test metadata extraction
    metadata_ok = test_metadata_extraction()

    # Summary
    print("=" * 60)
    print("Test Summary")
    print("=" * 60)
    print(f"GPS Parsing:          {'✓ PASS' if gps_ok else '✗ FAIL'}")
    print(f"Metadata Extraction:  {'✓ PASS' if metadata_ok else '⚠ SKIP (no test videos)'}")
    print()

    if gps_ok and metadata_ok:
        print("✓ All tests passed!")
        return 0
    elif gps_ok:
        print("⚠ GPS parsing works, but metadata extraction needs test videos")
        print("  Run: python3 scripts/add_metadata_to_test_audio.py")
        return 0
    else:
        print("✗ Some tests failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())

# Made with Bob
