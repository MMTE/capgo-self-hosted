# BUILD PLAN — Self-Hosted Capgo OTA Update System

## Overview
Build a complete self-hosted OTA update system using @capgo/capacitor-updater plugin, with a Node.js server and a sample Capacitor app.

## Part 1: Server (/root/projects/capgo/server/)

### Tech Stack
- Node.js + Express
- better-sqlite3 for database
- multer for file uploads
- dotenv for config

### Files to Create

#### 1. `server/package.json`
- Dependencies: express, better-sqlite3, multer, cors, dotenv
- Scripts: start, dev

#### 2. `server/.env`
```
PORT=3001
HOST=0.0.0.0
```

#### 3. `server/db.js` — Database initialization
- Create SQLite DB at `server/data/capgo.db`
- Tables:
  - `bundles`: id INTEGER PK, version TEXT UNIQUE, checksum TEXT, file_path TEXT, created_at TEXT
  - `channels`: id INTEGER PK, name TEXT UNIQUE, public INTEGER DEFAULT 1, allow_self_set INTEGER DEFAULT 0, ios INTEGER DEFAULT 1, android INTEGER DEFAULT 1, electron INTEGER DEFAULT 1, allow_emulator INTEGER DEFAULT 0, allow_device INTEGER DEFAULT 1, allow_dev INTEGER DEFAULT 1, allow_prod INTEGER DEFAULT 1
  - `devices`: id INTEGER PK, device_id TEXT, app_id TEXT, channel TEXT DEFAULT "production", platform TEXT, created_at TEXT, UNIQUE(device_id, app_id)
  - `stats`: id INTEGER PK, action TEXT, device_id TEXT, app_id TEXT, version_name TEXT, version_build TEXT, platform TEXT, created_at TEXT
- Seed default "production" channel

#### 4. `server/index.js` — Main Express server
- Enable CORS for all origins (important for mobile apps)
- JSON body parser

##### Endpoints:

**POST /v1/updates** — Update check
```
Request body:
{
  "platform": "ios"|"android"|"electron",
  "device_id": "string",
  "app_id": "string",
  "custom_id": "string|null",
  "plugin_version": "string",
  "version_build": "string",
  "version_code": "string",
  "version_name": "string" (last web version or "builtin"),
  "version_os": "string",
  "is_emulator": false,
  "is_prod": true
}

Logic:
1. Find device channel (from devices table, default "production")
2. Find latest bundle with version > version_name (semver compare)
3. If found, return: { version, url, checksum }
   url = `${process.env.HOST || "http://localhost:3001"}/v1/bundles/${bundle.version}.zip`
4. If no new version, return: { error: "no_new_version_available", message: "No new version available" }
   HTTP 200!
```

**POST /v1/stats** — Statistics
```
Request body: { action, device_id, app_id, version_name, version_build, platform, plugin_version, is_emulator, is_prod, ... }
Logic: Insert into stats table. Console log it.
Response: { status: "ok" }
```

**GET /v1/channel_self** — List compatible channels
```
Query: app_id, platform, is_emulator, is_prod
Response: Array of { id, name, public, allow_self_set }
Filter: channel must support platform, device type, build type, and be public OR allow_self_set
```

**PUT /v1/channel_self** — Get device channel
```
Request body: { device_id, app_id, platform, ... }
Response: { status: "ok", channel: "production", allowSet: true, message: "", error: "" }
```

**POST /v1/channel_self** — Set device channel
```
Request body: { device_id, app_id, channel, platform, ... }
Logic: Upsert device channel. Validate channel exists.
Response: { status: "ok", message: "..." }
```

**DELETE /v1/channel_self** — Unset device channel
```
Request body: { device_id, app_id }
Logic: Reset device channel to "production"
Response: { status: "ok", message: "..." }
```

**GET /v1/bundles/:version.zip** — Serve bundle file
```
Serve the zip file from server/data/bundles/
```

**POST /v1/admin/upload** — Upload new bundle
```
multipart/form-data with: file (zip), version (string)
Logic:
1. Save file to server/data/bundles/{version}.zip
2. Generate SHA256 checksum
3. Insert into bundles table
Response: { status: "ok", version, checksum }
```

**GET /v1/admin/bundles** — List all bundles
```
Response: Array of { id, version, checksum, created_at }
```

**POST /v1/admin/channels** — Create channel
```
Request body: { name, public, allow_self_set, ios, android, electron, ... }
```

#### 5. `server/public/` — folder for serving bundle zips

### Part 2: Sample Capacitor App (/root/projects/capgo/sample-app/)

### Setup
1. Create a Vite + vanilla-ts project
2. Add @capacitor/core, @capacitor/cli, @capgo/capacitor-updater
3. `npx cap init` (if needed, or create config manually)

### Files

#### `sample-app/package.json`
- Dependencies: @capacitor/core, @capgo/capacitor-updater
- DevDependencies: @capacitor/cli, vite, typescript
- Scripts: dev, build, zip (creates bundle zip)

#### `sample-app/capacitor.config.ts`
```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.capgo.demo',
  appName: 'Capgo Demo',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    CapacitorUpdater: {
      autoUpdate: false,
      updateUrl: 'http://localhost:3001/v1/updates',
      statsUrl: 'http://localhost:3001/v1/stats',
      channelUrl: 'http://localhost:3001/v1/channel_self'
    }
  }
};

export default config;
```

#### `sample-app/src/main.ts`
- Call `CapacitorUpdater.notifyAppReady()` immediately on load
- Show current version
- "Check for Updates" button that:
  1. Calls download() manually (with hardcoded URL or via the auto update URL)
  2. Shows download progress
  3. Asks user confirmation before applying (set())
  4. Shows result

#### `sample-app/index.html`
- Simple UI showing:
  - App name + version
  - "Check for Updates" button
  - Status messages area
  - Styled nicely with inline CSS

#### `sample-app/vite.config.ts`
- Standard Vite config for vanilla-ts

#### `sample-app/tsconfig.json`
- Standard TypeScript config

### Part 3: Scripts

#### `scripts/build-and-upload.sh`
```bash
#!/bin/bash
# Build sample app, create zip, upload to server
cd /root/projects/capgo/sample-app
npm run build
npx @capgo/cli bundle zip --path ./dist
VERSION=$(cat package.json | grep version | head -1 | awk -F: '{print $2}' | tr -d '", ')
curl -X POST http://localhost:3001/v1/admin/upload \
  -F "file=@$(ls *.zip)" \
  -F "version=$VERSION"
echo "Bundle uploaded!"
```

#### `scripts/init-db.sh`
- Just start the server (DB auto-initializes)

### Part 4: Root Files

#### `README.md`
- Project overview
- Prerequisites
- Quick start (server + app)
- API documentation
- How to test OTA updates

#### `.gitignore`
- node_modules, dist, data/, *.zip, etc.

### Critical Requirements
1. Server must run on port 3001
2. CORS must be enabled for ALL origins
3. The updateUrl response must use HTTP 200 with exact error key "no_new_version_available" when no update
4. Bundle zip must be served from the server
5. notifyAppReady() must be called in sample app
6. Sample app must show version and have update button
7. All code must be clean, well-commented, and production-quality

### Testing Flow
1. Start server: `cd server && npm start`
2. Build + upload initial bundle v1.0.0
3. Run sample app (or open dist/ in browser for testing)
4. Change version to 1.0.1, build, upload
5. Click "Check for Updates" in app → should detect v1.0.1
6. Confirm update → app reloads with new version
