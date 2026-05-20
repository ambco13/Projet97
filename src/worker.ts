interface Env {
  DB?: D1Database;
  ASSETS: Fetcher;
}

const PRESENCE_WINDOW_MS = 5 * 60 * 1000;
const ACTIVE_WINDOW_SECONDS = 60;
const ALERT_WINDOW_MS = 5 * 60 * 1000;
const inMemoryPresence = new Map<string, { ip: string; lastSeen: number }>();


const computeDistanceKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const cosCentralAngle =
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(((lng2 - lng1) * Math.PI) / 180) +
    Math.sin((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180);
  const normalized = Math.min(1, Math.max(-1, cosCentralAngle));
  return 6371 * Math.acos(normalized);
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
} as const;

type MessagePlatform = 'android' | 'ios' | 'unknown';

const toSessionId = (rawDeviceId: string) => {
  let hash = 0;
  for (let i = 0; i < rawDeviceId.length; i += 1) hash = (hash * 31 + rawDeviceId.charCodeAt(i)) >>> 0;
  return `p97_${hash.toString(16).padStart(8, '0')}`;
};

const registerInMemoryPresence = (deviceId: string, ip: string) => {
  const now = Date.now();
  inMemoryPresence.set(deviceId, { ip, lastSeen: now });
  for (const [id, entry] of inMemoryPresence.entries()) {
    if (now - entry.lastSeen > PRESENCE_WINDOW_MS) inMemoryPresence.delete(id);
  }
};

const setupSchema = async (db: D1Database) => {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS presence (
      device_id TEXT PRIMARY KEY,
      ip TEXT,
      lat REAL,
      lng REAL,
      last_emergency_at TEXT,
      last_seen INTEGER NOT NULL
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS guardian_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_device_id TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      radius_km REAL NOT NULL DEFAULT 1,
      resolved_at INTEGER,
      created_at INTEGER NOT NULL
    )
  `).run();
};

const normalizePlatform = (rawPlatform: unknown): MessagePlatform => {
  if (typeof rawPlatform !== 'string') return 'unknown';
  const normalized = rawPlatform.trim().toLowerCase();
  if (normalized === 'android') return 'android';
  if (normalized === 'ios' || normalized === 'apple' || normalized === 'iphone') return 'ios';
  return 'unknown';
};

const sanitizePhone = (rawPhone: unknown): string | null => {
  if (typeof rawPhone !== 'string') return null;
  const compact = rawPhone.replace(/\s+/g, '');
  if (!compact) return null;
  if (!/^\+?[0-9]{6,18}$/.test(compact)) return null;
  return compact;
};

const handleMessageCompose = async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return Response.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: corsHeaders });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const platform = normalizePlatform(body.platform);
  const phone = sanitizePhone(body.phone);
  const text = typeof body.text === 'string' ? body.text.trim() : '';

  if (!phone) return Response.json({ error: 'INVALID_PHONE' }, { status: 400, headers: corsHeaders });
  if (!text) return Response.json({ error: 'MISSING_MESSAGE_TEXT' }, { status: 400, headers: corsHeaders });

  const encodedText = encodeURIComponent(text);
  const iosUrl = `sms:${phone}&body=${encodedText}`;
  const androidUrl = `sms:${phone}?body=${encodedText}`;

  const responseByPlatform =
    platform === 'android'
      ? {
          channel: 'carrier_sms',
          platform: 'android',
          composeUrl: androidUrl,
          autoSendSupported: true,
          note: 'Android peut envoyer par la SIM sans ouvrir une application SMS alternative si permissions SMS accordées.',
        }
      : {
          channel: 'apple_messages',
          platform: 'ios',
          composeUrl: iosUrl,
          autoSendSupported: false,
          note: "iOS ouvre l'app Messages Apple et nécessite une confirmation utilisateur.",
        };

  return Response.json(
    {
      ok: true,
      phone,
      messageLength: text.length,
      ...responseByPlatform,
    },
    { headers: corsHeaders },
  );
};

const handlePresence = async (request: Request, env: Env): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method === 'GET') {
    if (!env.DB) return Response.json({ ok: true, service: 'presence', dbBinding: false }, { headers: corsHeaders });

    await setupSchema(env.DB);
    const tableRows = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('presence','guardian_alerts') ORDER BY name")
      .all<{ name: string }>();
    const tables = (tableRows.results || []).map((row) => row.name);
    return Response.json({ ok: true, service: 'presence', dbBinding: true, schemaReady: tables.length === 2, tables }, { headers: corsHeaders });
  }
  if (request.method !== 'POST') return Response.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: corsHeaders });

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
      return Response.json({ error: 'CLOUD_DATABASE_UNAVAILABLE', detail: 'Missing D1 binding DB' }, { status: 503, headers: corsHeaders });
    }

    await setupSchema(env.DB);
    await env.DB.prepare(`INSERT INTO presence(device_id, ip, lat, lng, last_seen) VALUES (?1, ?2, ?3, ?4, ?5)
      ON CONFLICT(device_id) DO UPDATE SET ip=excluded.ip, lat=COALESCE(excluded.lat,presence.lat), lng=COALESCE(excluded.lng,presence.lng), last_seen=excluded.last_seen`)
      .bind(deviceId, userIP, lat, lng, now).run();

    await env.DB.prepare(`DELETE FROM presence WHERE last_seen <= ?1`).bind(now - ACTIVE_WINDOW_SECONDS * 1000).run();
    const countRow = await env.DB.prepare(`SELECT COUNT(*) as count FROM presence WHERE last_seen > ?1`).bind(now - ACTIVE_WINDOW_SECONDS * 1000).first<{ count: number }>();
    const count = Number(countRow?.count ?? 0);

    let nearbyCount = 0;
    if (action === 'alert' && lat !== null && lng !== null) {
      await env.DB.prepare(`UPDATE presence SET last_emergency_at = ?1 WHERE device_id = ?2`).bind(String(now), deviceId).run();
      const activeRows = await env.DB.prepare(`SELECT lat, lng FROM presence WHERE device_id <> ?1 AND last_seen > ?2 AND lat IS NOT NULL AND lng IS NOT NULL`).bind(deviceId, now - ACTIVE_WINDOW_SECONDS * 1000).all<{ lat: number; lng: number }>();
      nearbyCount = (activeRows.results || []).filter((row) => {
        const d = computeDistanceKm(lat, lng, row.lat, row.lng);
        return Number.isFinite(d) && d <= radiusKm;
      }).length;
      await env.DB.prepare(`INSERT INTO guardian_alerts(sender_device_id,lat,lng,radius_km,created_at) VALUES (?1,?2,?3,?4,?5)`).bind(deviceId, lat, lng, radiusKm, now).run();
    }

    if (action === 'resolve') {
      await env.DB.prepare(`UPDATE guardian_alerts SET resolved_at=?1 WHERE sender_device_id=?2 AND resolved_at IS NULL`).bind(now, deviceId).run();
    }

    const alerts = await env.DB.prepare(`
      SELECT id, created_at, lat, lng, sender_device_id, radius_km
      FROM guardian_alerts
      WHERE sender_device_id <> ?1 AND created_at > ?2 AND resolved_at IS NULL
      ORDER BY created_at DESC
      LIMIT 5
    `).bind(deviceId, now - ALERT_WINDOW_MS).all<{ id: number; created_at: number; lat: number; lng: number; sender_device_id: string; radius_km: number }>();

    const latestIncomingAlert = (alerts.results || []).find((row) => {
      if (lat === null || lng === null) return true;
      const distanceKm = computeDistanceKm(lat, lng, row.lat, row.lng);
      return Number.isFinite(distanceKm) && distanceKm <= row.radius_km;
    });

    const hasIncomingAlert = Boolean(latestIncomingAlert);

    return Response.json({
      count,
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
      latestAlertIsSelf: false,
      session_id: toSessionId(deviceId),
      ip_mask: userIP.replace(/\.\d+$/, '.***'),
    }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: 'CLOUD_SYNC_ERROR', detail: error instanceof Error ? error.message : 'Unknown error' }, { status: 500, headers: corsHeaders });
  }
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/presence' || url.pathname === '/api/presence/') return handlePresence(request, env);
    if (url.pathname === '/api/messages/compose' || url.pathname === '/api/messages/compose/') return handleMessageCompose(request);
    if (url.pathname.startsWith('/api/')) return Response.json({ error: 'API_ROUTE_NOT_FOUND', path: url.pathname }, { status: 404, headers: corsHeaders });
    return env.ASSETS.fetch(request);
  },
};
