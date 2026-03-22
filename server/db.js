const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'capgo.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS bundles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT UNIQUE NOT NULL,
    checksum TEXT NOT NULL,
    file_path TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    public INTEGER DEFAULT 1,
    allow_self_set INTEGER DEFAULT 0,
    ios INTEGER DEFAULT 1,
    android INTEGER DEFAULT 1,
    electron INTEGER DEFAULT 1,
    allow_emulator INTEGER DEFAULT 0,
    allow_device INTEGER DEFAULT 1,
    allow_dev INTEGER DEFAULT 1,
    allow_prod INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    app_id TEXT NOT NULL,
    channel TEXT DEFAULT 'production',
    platform TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(device_id, app_id)
  );

  CREATE TABLE IF NOT EXISTS stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT,
    device_id TEXT,
    app_id TEXT,
    version_name TEXT,
    version_build TEXT,
    platform TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Seed default production channel
const existing = db.prepare('SELECT id FROM channels WHERE name = ?').get('production');
if (!existing) {
  db.prepare(`
    INSERT INTO channels (name, public, allow_self_set, ios, android, electron, allow_emulator, allow_device, allow_dev, allow_prod)
    VALUES ('production', 1, 0, 1, 1, 1, 0, 1, 1, 1)
  `).run();
  console.log('Seeded default "production" channel');
}

module.exports = db;
