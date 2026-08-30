#!/usr/bin/env node
/**
 * One-time migration: legacy server/data/capgo.db + server/data/bundles/*.zip
 * → PocketBase at CAPGO_PB_URL (default http://127.0.0.1:8090).
 *
 * Requires: npm install (repo root), CAPGO_ADMIN_EMAIL, CAPGO_ADMIN_PASSWORD
 */
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const PB_URL = process.env.CAPGO_PB_URL || "http://127.0.0.1:8090";
const EMAIL = process.env.CAPGO_ADMIN_EMAIL;
const PASSWORD = process.env.CAPGO_ADMIN_PASSWORD;

const OLD_DB = path.join(__dirname, "data", "capgo.db");
const OLD_BUNDLES = path.join(__dirname, "data", "bundles");
const PB_DATA = process.env.CAPGO_PB_DATA || path.join(__dirname, "..", "pb_data_import");
const NEW_BUNDLES = path.join(PB_DATA, "bundles");

async function auth() {
  const res = await fetch(
    `${PB_URL}/api/collections/_superusers/auth-with-password`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: EMAIL, password: PASSWORD }),
    }
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`auth failed: ${res.status} ${t}`);
  }
  const j = await res.json();
  return j.token;
}

async function tryCreate(token, collection, body) {
  const res = await fetch(`${PB_URL}/api/collections/${collection}/records`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
    },
    body: JSON.stringify(body),
  });
  if (res.ok) return res.json();
  const t = await res.text();
  if (res.status === 400 || res.status === 409) {
    console.warn(`skip ${collection}:`, t);
    return null;
  }
  throw new Error(`create ${collection}: ${res.status} ${t}`);
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error("Set CAPGO_ADMIN_EMAIL and CAPGO_ADMIN_PASSWORD");
    process.exit(1);
  }
  if (!fs.existsSync(OLD_DB)) {
    console.error("Missing old database:", OLD_DB);
    process.exit(1);
  }

  fs.mkdirSync(NEW_BUNDLES, { recursive: true });

  const token = await auth();
  const db = new Database(OLD_DB, { readonly: true });

  const channels = db.prepare("SELECT * FROM channels").all();
  for (const ch of channels) {
    await tryCreate(token, "channels", {
      name: ch.name,
      public: !!ch.public,
      allow_self_set: !!ch.allow_self_set,
      ios: !!ch.ios,
      android: !!ch.android,
      electron: !!ch.electron,
      allow_emulator: !!ch.allow_emulator,
      allow_device: !!ch.allow_device,
      allow_dev: !!ch.allow_dev,
      allow_prod: !!ch.allow_prod,
    });
  }

  const bundles = db.prepare("SELECT * FROM bundles").all();
  for (const b of bundles) {
    const fn = `${b.app_id}_${b.version}.zip`;
    const src = path.join(OLD_BUNDLES, fn);
    const dst = path.join(NEW_BUNDLES, fn);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
    }
    await tryCreate(token, "bundles", {
      app_id: b.app_id,
      version: b.version,
      checksum: b.checksum,
      file_path: dst,
      active: true,
    });
  }

  const devices = db.prepare("SELECT * FROM devices").all();
  for (const d of devices) {
    await tryCreate(token, "devices", {
      device_id: d.device_id,
      app_id: d.app_id,
      channel: d.channel || "production",
      platform: d.platform || "",
    });
  }

  const stats = db.prepare("SELECT * FROM stats").all();
  for (const s of stats) {
    await tryCreate(token, "stats", {
      action: s.action || "",
      device_id: s.device_id || "",
      app_id: s.app_id || "",
      version_name: s.version_name || "",
      version_build: s.version_build || "",
      platform: s.platform || "",
    });
  }

  const errors = db.prepare("SELECT * FROM errors").all();
  for (const err of errors) {
    await tryCreate(token, "errors", {
      device_id: err.device_id || "",
      app_id: err.app_id || "",
      version: err.version || "",
      platform: err.platform || "",
      message: err.message || "",
      stack: err.stack || "",
      context: err.context || "",
    });
  }

  db.close();
  console.log("Migration finished. Copied bundle zips to:", NEW_BUNDLES);
  console.log("Point PocketBase --dir at:", PB_DATA);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
