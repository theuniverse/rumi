# Test Videos with Metadata

This directory contains test video files with embedded metadata for testing the video metadata extraction feature.

## Generating Test Videos

### Prerequisites

Install ffmpeg (required for video processing):

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html
```

### Generate Test Videos

Run the script to create test videos with various metadata:

```bash
python3 scripts/add_metadata_to_test_audio.py
```

This will create the following test videos:

1. **test_iphone_shanghai.mp4**
   - Creation time: 2024-03-15 14:30:00 UTC
   - GPS: 31.230416, 121.473701 (Shanghai, China)
   - Device: Apple iPhone 15 Pro

2. **test_android_beijing.mp4**
   - Creation time: 2024-03-20 18:45:00 UTC
   - GPS: 39.904200, 116.407396 (Beijing, China)
   - Device: Samsung Galaxy S24

3. **test_no_gps.mp4**
   - Creation time: 2024-04-01 20:00:00 UTC
   - Device: Sony A7 IV
   - No GPS coordinates

4. **test_no_metadata.mp4**
   - No metadata at all

## Manual Testing

### Using Real Videos

You can also test with real videos from your phone:

1. **iPhone**: Videos shot with iPhone automatically include:
   - Creation time
   - GPS coordinates (if Location Services enabled)
   - Device make and model

2. **Android**: Most Android phones include:
   - Creation time
   - GPS coordinates (varies by manufacturer)
   - Device information

### Verifying Metadata

To check what metadata is in a video file:

```bash
ffprobe -v quiet -print_format json -show_format your_video.mp4
```

Look for these fields in the output:
- `tags.creation_time` - Recording timestamp
- `tags.location` or `tags.com.apple.quicktime.location.ISO6709` - GPS coordinates
- `tags.make` - Device manufacturer
- `tags.model` - Device model

## Testing the Feature

1. Start the backend server:
   ```bash
   cd backend
   uvicorn main:app --reload
   ```

2. Start the frontend:
   ```bash
   cd frontend
   npm run dev
   ```

3. Navigate to the Video Analyzer page

4. Upload one of the test videos

5. Verify that the metadata is displayed:
   - Recorded At (timestamp)
   - GPS Location (coordinates)
   - Device (make and model)
   - Duration

6. Save the recording and verify that:
   - GPS coordinates are stored in the recording
   - The recording time reflects the video's creation time (not current time)

## Expected Results

### test_iphone_shanghai.mp4
```json
{
  "metadata": {
    "created_at": "2024-03-15T14:30:00+00:00",
    "latitude": 31.230416,
    "longitude": 121.473701,
    "device": "Apple iPhone 15 Pro",
    "duration": ~10
  }
}
```

### test_android_beijing.mp4
```json
{
  "metadata": {
    "created_at": "2024-03-20T18:45:00+00:00",
    "latitude": 39.904200,
    "longitude": 116.407396,
    "device": "Samsung Galaxy S24",
    "duration": ~10
  }
}
```

### test_no_gps.mp4
```json
{
  "metadata": {
    "created_at": "2024-04-01T20:00:00+00:00",
    "latitude": null,
    "longitude": null,
    "device": "Sony A7 IV",
    "duration": ~10
  }
}
```

### test_no_metadata.mp4
```json
{
  "metadata": {
    "created_at": null,
    "latitude": null,
    "longitude": null,
    "device": null,
    "duration": ~10
  }
}
```

## Troubleshooting

### ffmpeg not found
- Make sure ffmpeg is installed and in your PATH
- Try running `ffmpeg -version` to verify installation

### Metadata not extracted
- Check backend logs for errors
- Verify ffprobe is working: `ffprobe -version`
- Some video formats may not support all metadata fields

### GPS coordinates not showing
- Not all devices embed GPS data in videos
- Check privacy settings on your device
- Use the test videos which have known GPS data
