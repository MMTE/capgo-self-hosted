# Self-Hosted Capgo OTA Update System

A complete self-hosted OTA update server for Capacitor apps using `@capgo/capacitor-updater`.

## Prerequisites

- Node.js 18+
- npm

## Quick Start

### 1. Start the Server

```bash
cd server
npm install
npm start
```

Server runs on `http://localhost:3001`.

### 2. Build & Upload a Bundle

```bash
cd sample-app
npm install
npm run build
bash ../scripts/build-and-upload.sh
```

### 3. Test OTA Updates

1. Bump `version` in `sample-app/package.json` and `APP_VERSION` in `src/main.ts`
2. Rebuild and upload: `bash scripts/build-and-upload.sh`
3. Open the app and click **Check for Updates** — it detects the new version

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/updates` | Check for updates (used by plugin) |
| POST | `/v1/stats` | Report device statistics |
| GET | `/v1/channel_self` | List compatible channels |
| PUT | `/v1/channel_self` | Get device channel |
| POST | `/v1/channel_self` | Set device channel |
| DELETE | `/v1/channel_self` | Reset device channel |
| GET | `/v1/bundles/:version.zip` | Download bundle zip |
| POST | `/v1/admin/upload` | Upload bundle (multipart) |
| GET | `/v1/admin/bundles` | List all bundles |
| POST | `/v1/admin/channels` | Create channel |

### Upload a Bundle

```bash
curl -X POST http://localhost:3001/v1/admin/upload \
  -F "file=@bundle.zip" \
  -F "version=1.0.1"
```

### Check for Updates

```bash
curl -X POST http://localhost:3001/v1/updates \
  -H "Content-Type: application/json" \
  -d '{"platform":"android","device_id":"test","app_id":"com.capgo.demo","version_name":"1.0.0","is_prod":true}'
```

## Project Structure

```
server/          Express OTA server + SQLite DB
sample-app/      Capacitor sample app with update UI
scripts/         Build & upload helpers
```
