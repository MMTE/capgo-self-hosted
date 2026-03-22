# Capgo Self-Hosted

Lightweight self-hosted OTA update server for Capacitor apps. Implements the `@capgo/capacitor-updater` plugin API so your apps can receive over-the-air JavaScript bundle updates without app store review.

Production instance: **https://capgo.abrane.ir**

## Architecture

```
server/          Express + SQLite OTA server (port 3001)
sample-app/      Capacitor demo app with manual update UI
scripts/         Build & upload helpers
```

Caddy reverse-proxies `capgo.abrane.ir` → `localhost:3001` with wildcard TLS for `*.abrane.ir`.

## Setup

```bash
cd server && npm install && npm start
```

Set `BASE_URL=https://capgo.abrane.ir` (or your domain) so bundle download URLs in `/v1/updates` responses point to the right place.

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

## Notifications

Build logs and APK artifacts are sent to Telegram via [Watch Tower](https://github.com/MMTE/watch-tower) (`watchtower.abrane.ir`).

```bash
# Send a log
curl -X POST https://watchtower.abrane.ir/api/log \
  -H "x-api-key: $WATCHTOWER_KEY" \
  -d '{"source":"capgo","log":"BUILD SUCCESSFUL"}'

# Send the APK
curl -X POST https://watchtower.abrane.ir/api/file \
  -H "x-api-key: $WATCHTOWER_KEY" \
  -F "file=@app-debug.apk" \
  -F "caption=My Daily Prayers debug build"
```
