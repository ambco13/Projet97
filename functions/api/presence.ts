interface Env {
  DB?: D1Database;
}

const PRESENCE_WINDOW_MS = 5 * 60 * 1000;
const ACTIVE_WINDOW_SECONDS = 60;
const inMemoryPresence = new Map<string, { ip: string; lastSeen: number }>();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as const;

const toSessionId = (rawDeviceId: string) => {
  let hash = 0;
  for (let i = 0; i < rawDeviceId.length; i += 1) {
    hash = (hash * 31 + rawDeviceId.charCodeAt(i)) >>> 0;
  }
  return `p97_${hash.toString(16).padStart(8, '0')}`;
};

const registerInMemoryPresence = (deviceId: string, ip: string) => {
  const now = Date.now();
  inMemoryPresence.set(deviceId, { ip, lastSeen: now });
  for (const [id, entry] of inMemoryPresence.entries()) {
    if (now - entry.lastSeen > PRESENCE_WINDOW_MS) {
      inMemoryPresence.delete(id);
    }
  }
  return inMemoryPresence.size;
};

const setupSchema = async (db: D1Database) => {
  await db.exec(`
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
  `);
};

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, { status: 204, headers: corsHeaders });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const deviceId = typeof body.deviceId === 'string' && body.deviceId.trim() ? body.deviceId.trim() : 'anonymous_device';
    const action = body.action === 'alert' ? 'alert' : body.action === 'resolve' ? 'resolve' : 'presence';
    const lat = Number.isFinite(Number(body.lat)) ? Number(body.lat) : null;
    const lng = Number.isFinite(Number(body.lng)) ? Number(body.lng) : null;
    const radiusKm = Number.isFinite(Number(body.radiusKm)) ? Math.max(0.1, Number(body.radiusKm)) : 1;
    const userIP = request.headers.get('cf-connecting-ip') || '127.0.0.1';
    const now = Date.now();

    if (!env.DB) {
      registerInMemoryPresence(deviceId, userIP);
      return Response.json({
        error: 'CLOUD_DATABASE_UNAVAILABLE',
        detail: 'Cloudflare D1 binding "DB" is missing for /api/presence.',
      }, { status: 503, headers: corsHeaders });
    }

    await setupSchema(env.DB);

    await env.DB.prepare(`
      INSERT INTO presence(device_id, ip, lat, lng, last_seen)
      VALUES (?1, ?2, ?3, ?4, ?5)
      ON CONFLICT(device_id) DO UPDATE SET
        ip=excluded.ip,
        lat=COALESCE(excluded.lat, presence.lat),
        lng=COALESCE(excluded.lng, presence.lng),
        last_seen=excluded.last_seen
    `).bind(deviceId, userIP, lat, lng, now).run();

    await env.DB.prepare(`DELETE FROM presence WHERE last_seen <= ?1`).bind(now - ACTIVE_WINDOW_SECONDS * 1000).run();

    const countRow = await env.DB.prepare(`SELECT COUNT(*) as count FROM presence WHERE last_seen > ?1`)
      .bind(now - ACTIVE_WINDOW_SECONDS * 1000)
      .first<{ count: number }>();
    const finalCount = Number(countRow?.count ?? 0);

    let nearbyCount = 0;
    if (action === 'alert' && lat !== null && lng !== null) {
      await env.DB.prepare(`UPDATE presence SET last_emergency_at = ?1 WHERE device_id = ?2`)
        .bind(String(now), deviceId)
        .run();

      const activeRows = await env.DB.prepare(`
        SELECT device_id, lat, lng
        FROM presence
        WHERE device_id <> ?1 AND last_seen > ?2 AND lat IS NOT NULL AND lng IS NOT NULL
      `).bind(deviceId, now - ACTIVE_WINDOW_SECONDS * 1000).all<{ device_id: string; lat: number; lng: number }>();

      nearbyCount = (activeRows.results || []).filter((row) => {
        const distanceKm = 6371 * Math.acos(
          Math.cos((lat * Math.PI) / 180) * Math.cos((row.lat * Math.PI) / 180) * Math.cos(((row.lng - lng) * Math.PI) / 180) +
          Math.sin((lat * Math.PI) / 180) * Math.sin((row.lat * Math.PI) / 180),
        );
        return Number.isFinite(distanceKm) && distanceKm <= radiusKm;
      }).length;

      await env.DB.prepare(`
        INSERT INTO guardian_alerts(sender_device_id, lat, lng, radius_km, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5)
      `).bind(deviceId, lat, lng, radiusKm, now).run();
    }

    if (action === 'resolve') {
      await env.DB.prepare(`
        UPDATE guardian_alerts
        SET resolved_at = ?1
        WHERE sender_device_id = ?2 AND resolved_at IS NULL
      `).bind(now, deviceId).run();
    }

    const alerts = await env.DB.prepare(`
      SELECT id, created_at, lat, lng, sender_device_id, radius_km
      FROM guardian_alerts
      WHERE sender_device_id <> ?1 AND created_at > ?2 AND resolved_at IS NULL
      ORDER BY created_at DESC
      LIMIT 5
    `).bind(deviceId, now - 90_000).all<{ id: number; created_at: number; lat: number; lng: number; sender_device_id: string; radius_km: number }>();

    const latestIncomingAlert = (alerts.results || []).find((row) => {
      if (lat === null || lng === null) return true;
      const distanceKm = 6371 * Math.acos(
        Math.cos((lat * Math.PI) / 180) * Math.cos((row.lat * Math.PI) / 180) * Math.cos(((row.lng - lng) * Math.PI) / 180) +
        Math.sin((lat * Math.PI) / 180) * Math.sin((row.lat * Math.PI) / 180),
      );
      return Number.isFinite(distanceKm) && distanceKm <= row.radius_km;
    });

    const hasIncomingAlert = Boolean(latestIncomingAlert);

    return Response.json({
      count: finalCount,
      trend: 'stable',
      engine: 'CLOUDFLARE_D1',
      latency: `${Date.now() - now}ms`,
      nearbyCount,
      incomingAlerts: hasIncomingAlert ? 1 : 0,
      latestAlertId: hasIncomingAlert ? String(latestIncomingAlert!.id) : null,
      latestAlertAt: hasIncomingAlert ? new Date(latestIncomingAlert!.created_at).toISOString() : null,
      latestAlertLat: hasIncomingAlert ? Number(latestIncomingAlert!.lat) : null,
      latestAlertLng: hasIncomingAlert ? Number(latestIncomingAlert!.lng) : null,
      latestAlertSender: hasIncomingAlert ? toSessionId(String(latestIncomingAlert!.sender_device_id)) : null,
      latestAlertPrecision: hasIncomingAlert ? (lat !== null && lng !== null ? 'exact' : 'approximate') : null,
      session_id: toSessionId(deviceId),
      ip_mask: userIP.replace(/\.\d+$/, '.***'),
    }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({
      error: 'CLOUD_SYNC_ERROR',
      detail: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500, headers: corsHeaders });
  }
};

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method === 'GET') {
    return Response.json(
      {
        ok: true,
        service: 'presence',
        runtime: 'cloudflare-pages',
        dbBinding: Boolean(env.DB),
        hint: env.DB ? 'Use POST to sync presence.' : 'Missing D1 binding named DB in Cloudflare Pages project settings.',
      },
      { headers: corsHeaders },
    );
  }

  return Response.json({ error: 'METHOD_NOT_ALLOWED', detail: 'Use POST to sync presence.' }, { status: 405, headers: corsHeaders });
};
