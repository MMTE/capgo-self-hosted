require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

app.use(cors());
app.use(express.json());

const bundlesDir = path.join(__dirname, 'data', 'bundles');
if (!fs.existsSync(bundlesDir)) fs.mkdirSync(bundlesDir, { recursive: true });

// ── Semver comparison ────────────────────────────────────────────────
function parseSemver(v) {
  const parts = (v || '0.0.0').split('.').map(Number);
  return { major: parts[0] || 0, minor: parts[1] || 0, patch: parts[2] || 0 };
}

function semverGt(a, b) {
  const va = parseSemver(a);
  const vb = parseSemver(b);
  if (va.major !== vb.major) return va.major > vb.major;
  if (va.minor !== vb.minor) return va.minor > vb.minor;
  return va.patch > vb.patch;
}

// ── POST /v1/updates — Update check ─────────────────────────────────
app.post('/v1/updates', (req, res) => {
  const { platform, device_id, app_id, version_name, is_emulator, is_prod } = req.body;
  const currentVersion = version_name || 'builtin';

  // Find device channel (default "production")
  const device = db.prepare('SELECT channel FROM devices WHERE device_id = ? AND app_id = ?').get(device_id, app_id);
  const channelName = (device && device.channel) || 'production';

  // Verify channel allows this device
  const channel = db.prepare('SELECT * FROM channels WHERE name = ?').get(channelName);
  if (!channel) {
    return res.json({ error: 'no_new_version_available', message: 'Channel not found' });
  }
  if (platform === 'ios' && !channel.ios) return res.json({ error: 'no_new_version_available', message: 'Platform not supported' });
  if (platform === 'android' && !channel.android) return res.json({ error: 'no_new_version_available', message: 'Platform not supported' });
  if (platform === 'electron' && !channel.electron) return res.json({ error: 'no_new_version_available', message: 'Platform not supported' });
  if (is_emulator && !channel.allow_emulator) return res.json({ error: 'no_new_version_available', message: 'Emulators not allowed' });
  if (is_prod && !channel.allow_prod) return res.json({ error: 'no_new_version_available', message: 'Prod builds not allowed' });
  if (!is_prod && !channel.allow_dev) return res.json({ error: 'no_new_version_available', message: 'Dev builds not allowed' });

  // Find latest bundle newer than current version, scoped to this app
  const bundles = db.prepare('SELECT * FROM bundles WHERE app_id = ? ORDER BY id DESC').all(app_id || '');
  let latest = null;
  for (const bundle of bundles) {
    if (currentVersion === 'builtin' || semverGt(bundle.version, currentVersion)) {
      if (!latest || semverGt(bundle.version, latest.version)) {
        latest = bundle;
      }
    }
  }

  if (!latest) {
    return res.json({ error: 'no_new_version_available', message: 'No new version available' });
  }

  const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
  const bundleFilename = `${latest.app_id}_${latest.version}.zip`;
  res.json({
    version: latest.version,
    url: `${baseUrl}/v1/bundles/${bundleFilename}`,
    checksum: latest.checksum
  });
});

// ── POST /v1/stats — Statistics ──────────────────────────────────────
app.post('/v1/stats', (req, res) => {
  const { action, device_id, app_id, version_name, version_build, platform } = req.body;
  console.log('[stats]', { action, device_id, app_id, version_name, version_build, platform });

  db.prepare(`
    INSERT INTO stats (action, device_id, app_id, version_name, version_build, platform)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(action, device_id, app_id, version_name, version_build, platform);

  res.json({ status: 'ok' });
});

// ── POST /v1/errors — Client error reporting ─────────────────────────
app.post('/v1/errors', (req, res) => {
  const { device_id, app_id, version, platform, message, stack, context } = req.body;
  console.error('[error]', { device_id, app_id, version, platform, message, context });

  db.prepare(`
    INSERT INTO errors (device_id, app_id, version, platform, message, stack, context)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(device_id, app_id, version, platform, message, stack || '', context || '');

  res.json({ status: 'ok' });
});

// ── GET /v1/admin/errors — List recent errors ────────────────────────
app.get('/v1/admin/errors', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const errors = db.prepare('SELECT * FROM errors ORDER BY id DESC LIMIT ?').all(limit);
  res.json(errors);
});

// ── GET /v1/channel_self — List compatible channels ──────────────────
app.get('/v1/channel_self', (req, res) => {
  const { platform, is_emulator, is_prod } = req.query;
  const emulator = is_emulator === 'true' || is_emulator === '1';
  const prod = is_prod !== 'false' && is_prod !== '0';

  let channels = db.prepare('SELECT * FROM channels').all();

  channels = channels.filter(ch => {
    if (platform === 'ios' && !ch.ios) return false;
    if (platform === 'android' && !ch.android) return false;
    if (platform === 'electron' && !ch.electron) return false;
    if (emulator && !ch.allow_emulator) return false;
    if (prod && !ch.allow_prod) return false;
    if (!prod && !ch.allow_dev) return false;
    return ch.public || ch.allow_self_set;
  });

  res.json(channels.map(ch => ({
    id: ch.id,
    name: ch.name,
    public: ch.public,
    allow_self_set: ch.allow_self_set
  })));
});

// ── PUT /v1/channel_self — Get device channel ────────────────────────
app.put('/v1/channel_self', (req, res) => {
  const { device_id, app_id } = req.body;
  const device = db.prepare('SELECT channel FROM devices WHERE device_id = ? AND app_id = ?').get(device_id, app_id);
  const channelName = (device && device.channel) || 'production';
  const channel = db.prepare('SELECT allow_self_set FROM channels WHERE name = ?').get(channelName);

  res.json({
    status: 'ok',
    channel: channelName,
    allowSet: channel ? !!channel.allow_self_set : false,
    message: '',
    error: ''
  });
});

// ── POST /v1/channel_self — Set device channel ──────────────────────
app.post('/v1/channel_self', (req, res) => {
  const { device_id, app_id, channel: channelName, platform } = req.body;

  const channel = db.prepare('SELECT * FROM channels WHERE name = ?').get(channelName);
  if (!channel) {
    return res.status(400).json({ status: 'error', message: `Channel "${channelName}" not found` });
  }

  db.prepare(`
    INSERT INTO devices (device_id, app_id, channel, platform)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(device_id, app_id) DO UPDATE SET channel = excluded.channel, platform = excluded.platform
  `).run(device_id, app_id, channelName, platform);

  res.json({ status: 'ok', message: `Device channel set to "${channelName}"` });
});

// ── DELETE /v1/channel_self — Unset device channel ───────────────────
app.delete('/v1/channel_self', (req, res) => {
  const { device_id, app_id } = req.body;

  db.prepare(`
    UPDATE devices SET channel = 'production' WHERE device_id = ? AND app_id = ?
  `).run(device_id, app_id);

  res.json({ status: 'ok', message: 'Device channel reset to "production"' });
});

// ── GET /v1/bundles/:filename — Serve bundle file ────────────────────
app.get('/v1/bundles/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(bundlesDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'not_found', message: 'Bundle not found' });
  }

  res.setHeader('Content-Type', 'application/zip');
  res.sendFile(filePath);
});

// ── Upload setup ─────────────────────────────────────────────────────
const upload = multer({ dest: path.join(__dirname, 'data', 'tmp') });

// ── POST /v1/admin/upload — Upload new bundle ────────────────────────
app.post('/v1/admin/upload', upload.single('file'), (req, res) => {
  const { version, app_id } = req.body;
  if (!version || !req.file) {
    return res.status(400).json({ status: 'error', message: 'version and file are required' });
  }
  if (!app_id) {
    return res.status(400).json({ status: 'error', message: 'app_id is required' });
  }

  const destPath = path.join(bundlesDir, `${app_id}_${version}.zip`);
  fs.renameSync(req.file.path, destPath);

  const fileBuffer = fs.readFileSync(destPath);
  const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  try {
    db.prepare(`
      INSERT INTO bundles (app_id, version, checksum, file_path) VALUES (?, ?, ?, ?)
      ON CONFLICT(app_id, version) DO UPDATE SET checksum = excluded.checksum, file_path = excluded.file_path
    `).run(app_id, version, checksum, destPath);
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }

  console.log(`[upload] Bundle ${app_id}@${version} uploaded (checksum: ${checksum})`);
  res.json({ status: 'ok', app_id, version, checksum });
});

// ── GET /v1/admin/bundles — List all bundles ─────────────────────────
app.get('/v1/admin/bundles', (req, res) => {
  const bundles = db.prepare('SELECT id, app_id, version, checksum, created_at FROM bundles ORDER BY id DESC').all();
  res.json(bundles);
});

// ── POST /v1/admin/channels — Create channel ────────────────────────
app.post('/v1/admin/channels', (req, res) => {
  const {
    name,
    public: isPublic = 1,
    allow_self_set = 0,
    ios = 1,
    android = 1,
    electron = 1,
    allow_emulator = 0,
    allow_device = 1,
    allow_dev = 1,
    allow_prod = 1
  } = req.body;

  if (!name) {
    return res.status(400).json({ status: 'error', message: 'Channel name is required' });
  }

  try {
    db.prepare(`
      INSERT INTO channels (name, public, allow_self_set, ios, android, electron, allow_emulator, allow_device, allow_dev, allow_prod)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, isPublic ? 1 : 0, allow_self_set ? 1 : 0, ios ? 1 : 0, android ? 1 : 0, electron ? 1 : 0, allow_emulator ? 1 : 0, allow_device ? 1 : 0, allow_dev ? 1 : 0, allow_prod ? 1 : 0);
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message });
  }

  res.json({ status: 'ok', message: `Channel "${name}" created` });
});

app.listen(PORT, HOST, () => {
  console.log(`Capgo OTA server running at http://${HOST}:${PORT}`);
});
