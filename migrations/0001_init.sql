CREATE TABLE IF NOT EXISTS presence (
  device_id TEXT PRIMARY KEY,
  ip TEXT,
  lat REAL,
  lng REAL,
  last_emergency_at TEXT,
  last_seen INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS guardian_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_device_id TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  radius_km REAL NOT NULL DEFAULT 1,
  resolved_at INTEGER,
  created_at INTEGER NOT NULL
);
