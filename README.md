# Capgo Self-Hosted

Lightweight self-hosted OTA update server for Capacitor apps. Implements the `@capgo/capacitor-updater` plugin API so your apps can receive over-the-air JavaScript bundle updates without app store review.

Production instance: **https://capgo.abrane.ir**

## Repository Structure

```
server/              Express + SQLite OTA server (port 3001)
my-daily-prayers/    Persian prayer tracker Capacitor app (React 18 + TS + Vite + Tailwind)
sample-app/          Capacitor demo app with manual update UI
scripts/             Build & upload helpers
```

## Server Setup

```bash
cd server && npm install && npm start
```

Set `BASE_URL=https://capgo.abrane.ir` (or your domain) so bundle download URLs in `/v1/updates` responses point to the right place.

Caddy reverse-proxies `capgo.abrane.ir` -> `localhost:3001` with wildcard TLS for `*.abrane.ir`.

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/updates` | Update check (used by the plugin) |
| POST | `/v1/stats` | Device statistics |
| GET/PUT/POST/DELETE | `/v1/channel_self` | Channel management |
| POST | `/v1/admin/upload` | Upload bundle (multipart: `file` + `version`) |
| GET | `/v1/admin/bundles` | List bundles |
| GET | `/v1/bundles/:version.zip` | Download bundle |
| POST | `/v1/admin/channels` | Create channel |

### Upload a bundle

```bash
curl -X POST https://capgo.abrane.ir/v1/admin/upload \
  -F "file=@bundle.zip" \
  -F "version=0.2.0"
```

### Check for updates

```bash
curl -X POST https://capgo.abrane.ir/v1/updates \
  -H "Content-Type: application/json" \
  -d '{"platform":"android","device_id":"test","app_id":"com.capgo.mydailyprayers","version_name":"0.1.0","is_prod":true}'
```

## My Daily Prayers App

See [`my-daily-prayers/README.md`](my-daily-prayers/README.md) for full build and deploy instructions.

- React 18 + TypeScript + Vite + Tailwind + shadcn/ui + Capacitor 6
- `autoUpdate: true` -- checks `capgo.abrane.ir` on each launch
- Build: `npm run build` then `npx cap sync` then `./gradlew assembleDebug`
- OTA deploy: `bash scripts/build-and-upload-mdp.sh`
- CI: `my-daily-prayers/.github/workflows/android.yml` on push to `main`

## Notifications

Build logs and APK artifacts are sent to Telegram via [Watch Tower](https://github.com/MMTE/watch-tower) at `watchtower.abrane.ir`.

```bash
# Send a log
curl -X POST https://watchtower.abrane.ir/api/log \
  -H "x-api-key: $WATCHTOWER_KEY" \
  -d '{"source":"capgo","log":"BUILD SUCCESSFUL"}'

# Send the APK (use filename field so Telegram shows a proper name)
curl -X POST https://watchtower.abrane.ir/api/file \
  -H "x-api-key: $WATCHTOWER_KEY" \
  -F "file=@app-debug.apk" \
  -F "filename=my-daily-prayers-v0.2.0-debug.apk" \
  -F "caption=My Daily Prayers debug build"
```

## Troubleshooting

### ARM64 aapt2 failure

On ARM64 servers, Gradle downloads an x86-64 `aapt2` binary that can't run. The error looks like:

```
AAPT2 aapt2-8.3.2-10880808-linux Daemon #0: Daemon startup failed
```

Fix: replace Gradle's cached aapt2 with the native ARM64 one from the Android SDK:

```bash
# Find the bad binary
find ~/.gradle/caches/transforms-4 -name "aapt2" -type f

# Replace it
cp /opt/android-sdk/build-tools/35.0.0/aapt2 ~/.gradle/caches/transforms-4/<hash>/transformed/aapt2-8.3.2-10880808-linux/aapt2
```

If the cache is corrupted beyond repair, delete `~/.gradle/caches/transforms-4/` entirely and rebuild.

### Gradle transforms cache corruption

If you see `Immutable workspace contents have been modified` or `Could not read workspace metadata`, stop the daemon and nuke the transforms cache:

```bash
cd android && ./gradlew --stop
rm -rf ~/.gradle/caches/transforms-4
./gradlew clean assembleDebug
```

### Watch Tower file uploads have random names

When uploading files to Watch Tower, always pass a `filename` field so Telegram shows a human-readable name instead of multer's random hash:

```bash
curl -X POST https://watchtower.abrane.ir/api/file \
  -H "x-api-key: $WATCHTOWER_KEY" \
  -F "file=@app-debug.apk" \
  -F "filename=my-daily-prayers-v0.2.0-debug.apk" \
  -F "caption=My Daily Prayers debug build"
```

### Watch Tower code changes not taking effect

Watch Tower runs in Docker without volume mounts. A `docker compose restart` reuses the old image. You must rebuild:

```bash
cd /root/projects/watch-tower
docker compose up -d --build
```
