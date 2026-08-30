# my-daily-prayers Release Workflow

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Release Pipeline                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Pre-build checks                                           │
│     ├── Lint (eslint)                                          │
│     ├── Tests (vitest)                                         │
│     └── Git status check                                       │
│                                                                  │
│  2. Version bump                                               │
│     ├── Update package.json                                    │
│     ├── Git commit                                             │
│     └── Git tag                                                │
│                                                                  │
│  3. Build                                                      │
│     ├── npm run build (vite)                                   │
│     └── npx cap sync                                           │
│                                                                  │
│  4. Upload bundle                                              │
│     ├── Create zip from dist/                                  │
│     ├── Authenticate to PocketBase                             │
│     └── Upload to /v1/admin/upload                             │
│                                                                  │
│  5. Verification                                               │
│     ├── Test /v1/updates endpoint                              │
│     └── List recent bundles                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Scripts

### Full Release (Recommended)
```bash
# Setup credentials once
export CAPGO_ADMIN_EMAIL=your@email.com
export CAPGO_ADMIN_PASSWORD=your-password

# Patch release (0.0.1 -> 0.0.2)
./scripts/release.sh patch

# Minor release (0.0.1 -> 0.1.0)
./scripts/release.sh minor

# Major release (0.0.1 -> 1.0.0)
./scripts/release.sh major

# Explicit version
./scripts/release.sh 1.2.3
```

### Quick Release (Development)
```bash
# Auto-increment patch, skip tests, skip confirmations
CAPGO_ADMIN_EMAIL=x CAPGO_ADMIN_PASSWORD=y ./scripts/quick-release.sh
```

### Legacy Scripts (Still Work)
```bash
./scripts/build-and-upload.sh
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CAPGO_ADMIN_EMAIL` | Yes | PocketBase superuser email |
| `CAPGO_ADMIN_PASSWORD` | Yes | PocketBase superuser password |
| `CAPGO_SERVER_URL` | No | Default: `http://localhost:8090` |

## PocketBase Setup

The PocketBase server needs a superuser for uploads:

```bash
# Create superuser (one-time)
docker exec -it capgo-server pocketbase superuser upsert admin@yourdomain.com 'your-password'

# Or use the admin UI at http://localhost:8090/_/
```

## CI/CD

### GitHub Actions (Automatic)

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `android.yml` | Push to main/master | Build APK, test Capgo |
| `server-test.yml` | Push to main/master | Test PocketBase routes |

### Manual Workflow (Recommended for Releases)

1. Create a release branch
2. Run `./scripts/release.sh patch`
3. Test on device
4. Push tags: `git push && git push --tags`

## Version Testing

Before releasing to users:

```bash
# 1. Build APK with new version
cd android
./gradlew assembleDebug

# 2. Install on device
adb install app/build/outputs/apk/debug/app-debug.apk

# 3. Check update is available
curl -X POST "http://localhost:8090/v1/updates" \
  -H "Content-Type: application/json" \
  -d '{
    "device_id":"test-device",
    "app_id":"com.tdhcloud.mydailyprayers",
    "version_name":"0.0.0",
    "platform":"android"
  }'
```

## Troubleshooting

### Upload fails with 401/403
- Check `CAPGO_ADMIN_EMAIL` and `CAPGO_ADMIN_PASSWORD`
- Verify superuser exists in PocketBase

### Bundle returns "no_new_version_available"
- Check `version_name` in request is less than bundle version
- Verify `active=true` in bundles table
- Check channel settings allow your platform

### Build fails
- Run `npm install` to update dependencies
- Check `node -v` (should be 20+)

## Direct Database Access (Emergency)

```bash
# List bundles
docker exec capgo-server sh -c 'sqlite3 /app/pb_data/data.db "SELECT version, active, created FROM bundles"'

# Deactivate a bundle
docker exec capgo-server sh -c 'sqlite3 /app/pb_data/data.db "UPDATE bundles SET active=0 WHERE version=\"0.0.1\""'
```
