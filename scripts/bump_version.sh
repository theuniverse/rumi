#!/bin/bash

# Generate version number: YYYYMMDDHHmmSSSS (date + time + 4-digit sequence)
# Example: 2026033015330001

# Get current date and time
DATETIME=$(date +"%Y%m%d%H%M")

# Read current version to get sequence number
CURRENT_VERSION=$(cat backend/version.txt 2>/dev/null || echo "${DATETIME}0000")
CURRENT_DATETIME=${CURRENT_VERSION:0:12}
CURRENT_SEQ=${CURRENT_VERSION:12:4}

# If date/time changed, reset sequence to 0001
if [ "$DATETIME" != "$CURRENT_DATETIME" ]; then
  NEW_SEQ="0001"
else
  # Increment sequence
  NEW_SEQ=$(printf "%04d" $((10#$CURRENT_SEQ + 1)))
fi

NEW_VERSION="${DATETIME}${NEW_SEQ}"

echo "Current version: $CURRENT_VERSION"
echo "New version: $NEW_VERSION"

# Update version files
echo "$NEW_VERSION" > backend/version.txt
echo "$NEW_VERSION" > frontend/public/version.txt

echo "✅ Version bumped to $NEW_VERSION"
echo ""
echo "Next steps:"
echo "1. Review changes: git diff"
echo "2. Commit: git add -A && git commit -m \"chore: bump version to $NEW_VERSION\""
echo "3. Rebuild frontend (version will be injected at build time)"
echo "4. Deploy the application"

# Made with Bob
