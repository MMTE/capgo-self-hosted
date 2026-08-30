# Capgo Self-Hosted

Lightweight self-hosted OTA update server for Capacitor apps. Implements the `@capgo/capacitor-updater` plugin API so your apps can receive over-the-air JavaScript bundle updates without app store review.

Production instance: **https://capgo.abrane.ir**

## Repository Structure

```
server/              PocketBase + SQLite (port 8090); custom /v1/* routes in pb_hooks
my-daily-prayers/    Persian prayer tracker Capacitor app (React 18 + TS + Vite + Tailwind)
scripts/             Build & upload helpers
```

## Server Setup

The OTA API is served by [PocketBase](https://pocketbase.io/) with JavaScript hooks (`server/pb_hooks/routes.pb.js`) and migrations (`server/pb_migrations/`). Bundle ZIPs live under `pb_data/bundles/`.

### Local (binary)

Download PocketBase v0.25.9+, then from the repo root:

```bash
./pocketbase serve --http=127.0.0.1:8090 \
  --dir=./pb_data \
  --hooksDir=./server/pb_hooks \
  --migrationsDir=./server/pb_migrations
```

Create the first superuser in the dashboard at **http://127.0.0.1:8090/_/** or:

```bash
./pocketbase superuser upsert you@example.com 'your-secure-password' --dir=./pb_data
```

Set `BASE_URL=https://capgo.abrane.ir` (or your domain) in the environment so `/v1/updates` returns correct bundle download URLs.

Optional: `WATCHTOWER_KEY` and `WATCHTOWER_URL` (e.g. `https://watchtower.abrane.ir/api/log`) send a log line when a bundle is uploaded.

### Docker

```bash
docker compose up --build
```

Listens on **8090**. Persist data in volume `capgo-data` → `/app/pb_data`.

Caddy (or any reverse proxy) should forward `capgo.abrane.ir` → `localhost:8090` (previously 3001).

### Migrating from the old Express server

1. Install root deps: `npm install` (for `better-sqlite3`).
2. Start PocketBase with a superuser and run:

```bash
export CAPGO_PB_URL=http://127.0.0.1:8090
export CAPGO_ADMIN_EMAIL=you@example.com
export CAPGO_ADMIN_PASSWORD=...
export CAPGO_PB_DATA=/path/to/pb_data   # optional; default copies zips under pb_data_import
node server/migrate-data.js
```

This reads `server/data/capgo.db` (read-only), copies `server/data/bundles/*.zip` into the target `bundles/` folder, and inserts rows via the PocketBase API.

## API

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/v1/updates` | none | Update check (plugin) |
| POST | `/v1/stats` | none | Device statistics |
| POST | `/v1/errors` | none | Client errors |
| GET/PUT/POST/DELETE | `/v1/channel_self` | none | Channel management |
| GET | `/v1/bundles/:filename` | none | Download bundle ZIP |
| POST | `/v1/admin/upload` | **superuser** | Upload bundle (`file`, `version`, `app_id`) |
| GET | `/v1/admin/bundles` | **superuser** | List bundles (`?app_id=` optional) |
| GET | `/v1/admin/errors` | **superuser** | List errors (`?limit=`, `?app_id=` optional) |
| POST | `/v1/admin/channels` | **superuser** | Create channel |

Admin UI: **/_/** (PocketBase dashboard). Authenticate as superuser; collection APIs are restricted to superusers.

### Superuser token (scripts / CI)

```bash
curl -s -X POST http://127.0.0.1:8090/api/collections/_superusers/auth-with-password \
  -H "Content-Type: application/json" \
  -d '{"identity":"you@example.com","password":"..."}'
# Use the returned "token" as: Authorization: <token>
```

### Upload a bundle

```bash
curl -X POST https://capgo.abrane.ir/v1/admin/upload \
  -H "Authorization: $TOKEN" \
  -F "file=@bundle.zip" \
  -F "version=0.2.0" \
  -F "app_id=com.example.app"
```

### Check for updates

```bash
curl -X POST https://capgo.abrane.ir/v1/updates \
  -H "Content-Type: application/json" \
  -d '{"platform":"android","device_id":"test","app_id":"com.example.app","version_name":"0.1.0","is_prod":true}'
```

## My Daily Prayers App

See [`my-daily-prayers/README.md`](my-daily-prayers/README.md) for full build and deploy instructions.

- React 18 + TypeScript + Vite + Tailwind + shadcn/ui + Capacitor 6
- `autoUpdate: true` — checks `capgo.abrane.ir` on each launch
- Build: `npm run build` then `npx cap sync` then `./gradlew assembleDebug`
- OTA deploy: set `CAPGO_ADMIN_EMAIL`, `CAPGO_ADMIN_PASSWORD`, then `bash scripts/build-and-upload-mdp.sh`
- CI: `my-daily-prayers/.github/workflows/android.yml` on push to `main`

## Notifications

Build logs and APK artifacts are sent to Telegram via [Watch Tower](https://github.com/MMTE/watch-tower) at `watchtower.abrane.ir`.

```bash
curl -X POST https://watchtower.abrane.ir/api/log \
  -H "x-api-key: $WATCHTOWER_KEY" \
  -d '{"source":"capgo","log":"BUILD SUCCESSFUL"}'
```

## Troubleshooting

### ARM64 aapt2 failure

On ARM64 servers, Gradle downloads an x86-64 `aapt2` binary that can't run. The error looks like:

```
AAPT2 aapt2-8.3.2-10880808-linux Daemon #0: Daemon startup failed
```

Fix: replace Gradle's cached aapt2 with the native ARM64 one from the Android SDK:

```bash
find ~/.gradle/caches/transforms-4 -name "aapt2" -type f
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

When uploading files to Watch Tower, always pass a `filename` field so Telegram shows a human-readable name instead of multer's random hash.

### Watch Tower code changes not taking effect

Watch Tower runs in Docker without volume mounts. A `docker compose restart` reuses the old image. Rebuild:

```bash
cd /root/projects/watch-tower
docker compose up -d --build
```
