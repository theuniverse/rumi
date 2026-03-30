# Version Management System

## Version Format

Version numbers follow the format: `YYYYMMDDHHmmSSSS`

- `YYYYMMDD`: Date (e.g., 20260330)
- `HHmm`: Time in 24-hour format (e.g., 1533 for 3:33 PM)
- `SSSS`: 4-digit sequence number for multiple releases in the same minute (0001, 0002, etc.)

Example: `2026033015330001` = March 30, 2026, 3:33 PM, first release

## How It Works

1. **Version Storage**: Version number is stored in:
   - `backend/version.txt` - Backend version
   - `frontend/public/version.txt` - Frontend version (for reference)
   - `frontend/src/hooks/useVersionCheck.ts` - Hardcoded in frontend code

2. **Version Check**:
   - Frontend checks `/api/version` endpoint every 5 minutes
   - Compares server version with hardcoded client version
   - Shows update prompt if versions differ

3. **Update Flow**:
   - User sees "重新加载以使用最新版本" button in sidebar
   - Clicking the button:
     - Unregisters service workers
     - Clears all caches
     - Forces page reload

## Bumping Version

### Automatic (Recommended)

Run the bump script:

```bash
./scripts/bump_version.sh
```

This will:
- Generate new version number based on current date/time
- Update all version files
- Show git commands for committing

### Manual

1. Generate version number: `date +"%Y%m%d%H%M"` + sequence (e.g., `0001`)
2. Update `backend/version.txt`
3. Update `frontend/public/version.txt`
4. Update `CURRENT_VERSION` in `frontend/src/hooks/useVersionCheck.ts`

## Deployment Workflow

```bash
# 1. Make your changes
git add .
git commit -m "feat: your changes"

# 2. Bump version
./scripts/bump_version.sh

# 3. Commit version bump
git add -A
git commit -m "chore: bump version to $(cat backend/version.txt)"

# 4. Push and deploy
git push
./scripts/deploy.sh
```

## API Endpoint

**GET** `/api/version`

Response:
```json
{
  "version": "2026033015330001"
}
```

## Frontend Hook

```typescript
import { useVersionCheck } from "../hooks/useVersionCheck";

function MyComponent() {
  const { hasUpdate, currentVersion, latestVersion, reload } = useVersionCheck();

  if (hasUpdate) {
    return <button onClick={reload}>Update Available</button>;
  }

  return <div>Version: {currentVersion}</div>;
}
```

## Notes

- Version check runs every 5 minutes automatically
- PWA service worker is cleared on update to ensure fresh content
- All browser caches are cleared on update
- Sequence number resets to 0001 when date/time changes
