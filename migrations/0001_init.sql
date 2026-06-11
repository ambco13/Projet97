CREATE TABLE IF NOT EXISTS presence (
  device_id TEXT PRIMARY KEY,
  ip TEXT,
  phone TEXT,
  lat REAL,
  lng REAL,
  last_emergency_at TEXT,
  last_seen INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS guardian_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_device_id TEXT NOT NULL,
  sender_phone TEXT,
  contact_phones TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  radius_km REAL NOT NULL DEFAULT 1,
  sender_name TEXT,
  message TEXT,
  resolved_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  phone TEXT,
  p256dh TEXT,
  auth TEXT,
  last_seen INTEGER NOT NULL
);
