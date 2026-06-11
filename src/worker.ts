interface Env {
  DB?: D1Database;
  ASSETS: Fetcher;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}

type MessagePlatform = 'android' | 'ios' | 'unknown';

const PRESENCE_WINDOW_MS = 5 * 60 * 1000;
const ACTIVE_WINDOW_SECONDS = 60;
const ALERT_WINDOW_MS = 5 * 60 * 1000;
const inMemoryPresence = new Map<string, { ip: string; lastSeen: number }>();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
} as const;

const base64UrlEncode = (input: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const base64UrlDecode = (value: string) => {
  const normalized = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const computeDistanceKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const cosCentralAngle =
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(((lng2 - lng1) * Math.PI) / 180) +
    Math.sin((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180);
  const normalized = Math.min(1, Math.max(-1, cosCentralAngle));
  return 6371 * Math.acos(normalized);
};

const toSessionId = (rawDeviceId: string) => {
  let hash = 0;
  for (let i = 0; i < rawDeviceId.length; i += 1) hash = (hash * 31 + rawDeviceId.charCodeAt(i)) >>> 0;
  return `p97_${hash.toString(16).padStart(8, '0')}`;
};

const normalizePhone = (rawPhone: unknown): string | null => {
  if (typeof rawPhone !== 'string') return null;
  const compact = rawPhone.replace(/(?!^)\+/g, '').replace(/[^\d+]/g, '');
  return /^\+?[0-9]{6,18}$/.test(compact) ? compact : null;
};

const normalizePhoneList = (rawPhones: unknown) => {
  if (!Array.isArray(rawPhones)) return [];
  return Array.from(new Set(rawPhones.map(normalizePhone).filter(Boolean) as string[])).slice(0, 20);
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
      phone TEXT,
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
      sender_phone TEXT,
      contact_phones TEXT,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      radius_km REAL NOT NULL DEFAULT 1,
      sender_name TEXT,
      message TEXT,
      resolved_at INTEGER,
      created_at INTEGER NOT NULL
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      phone TEXT,
      p256dh TEXT,
      auth TEXT,
      last_seen INTEGER NOT NULL
    )
  `).run();

  await db.prepare(`ALTER TABLE presence ADD COLUMN phone TEXT`).run().catch(() => undefined);
  await db.prepare(`ALTER TABLE guardian_alerts ADD COLUMN sender_phone TEXT`).run().catch(() => undefined);
  await db.prepare(`ALTER TABLE guardian_alerts ADD COLUMN contact_phones TEXT`).run().catch(() => undefined);
  await db.prepare(`ALTER TABLE guardian_alerts ADD COLUMN sender_name TEXT`).run().catch(() => undefined);
  await db.prepare(`ALTER TABLE guardian_alerts ADD COLUMN message TEXT`).run().catch(() => undefined);
};

const buildVapidJwt = async (audience: string, env: Env) => {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  const publicKeyBytes = base64UrlDecode(env.VAPID_PUBLIC_KEY);
  if (publicKeyBytes.length !== 65 || publicKeyBytes[0] !== 4) return null;
  const key = await crypto.subtle.importKey('jwk', {
    kty: 'EC',
    crv: 'P-256',
    x: base64UrlEncode(publicKeyBytes.slice(1, 33)),
    y: base64UrlEncode(publicKeyBytes.slice(33, 65)),
    d: base64UrlEncode(base64UrlDecode(env.VAPID_PRIVATE_KEY)),
    ext: true,
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = base64UrlEncode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = base64UrlEncode(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, sub: env.VAPID_SUBJECT || 'mailto:admin@projet97.app' }));
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${header}.${body}`));
  return `${header}.${body}.${base64UrlEncode(signature)}`;
};

const sendWebPush = async (endpoint: string, env: Env) => {
  const jwt = await buildVapidJwt(new URL(endpoint).origin, env).catch(() => null);
  if (!jwt || !env.VAPID_PUBLIC_KEY) return false;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { TTL: '300', Urgency: 'high', Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}` },
  }).catch(() => null);
  return Boolean(response?.ok || response?.status === 201);
};

const notifySubscriptions = async (env: Env, subscriptions: Array<{ endpoint: string }>) => {
  const endpoints = Array.from(new Set(subscriptions.map((subscription) => subscription.endpoint))).slice(0, 100);
  await Promise.all(endpoints.map((endpoint) => sendWebPush(endpoint, env)));
};

const querySubscriptionsByPhones = async (db: D1Database, phones: string[]) => {
  if (!phones.length) return [] as Array<{ endpoint: string }>;
  const placeholders = phones.map((_, index) => `?${index + 1}`).join(',');
  const result = await db.prepare(`SELECT endpoint FROM push_subscriptions WHERE phone IN (${placeholders})`).bind(...phones).all<{ endpoint: string }>();
  return result.results || [];
};

const querySubscriptionsByDeviceIds = async (db: D1Database, deviceIds: string[]) => {
  if (!deviceIds.length) return [] as Array<{ endpoint: string }>;
  const placeholders = deviceIds.map((_, index) => `?${index + 1}`).join(',');
  const result = await db.prepare(`SELECT endpoint FROM push_subscriptions WHERE device_id IN (${placeholders})`).bind(...deviceIds).all<{ endpoint: string }>();
  return result.results || [];
};

const normalizePlatform = (rawPlatform: unknown): MessagePlatform => {
  if (typeof rawPlatform !== 'string') return 'unknown';
  const normalized = rawPlatform.trim().toLowerCase();
  if (normalized === 'android') return 'android';
  if (normalized === 'ios' || normalized === 'apple' || normalized === 'iphone') return 'ios';
  return 'unknown';
};

const handleMessageCompose = async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return Response.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: corsHeaders });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const platform = normalizePlatform(body.platform);
  const phone = normalizePhone(body.phone);
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!phone) return Response.json({ error: 'INVALID_PHONE' }, { status: 400, headers: corsHeaders });
  if (!text) return Response.json({ error: 'MISSING_MESSAGE_TEXT' }, { status: 400, headers: corsHeaders });
  const encodedText = encodeURIComponent(text);
  const iosUrl = `sms:${phone}&body=${encodedText}`;
  const androidUrl = `sms:${phone}?body=${encodedText}`;
  return Response.json({
    ok: true,
    phone,
    messageLength: text.length,
    channel: platform === 'android' ? 'carrier_sms' : 'apple_messages',
    platform: platform === 'android' ? 'android' : 'ios',
    composeUrl: platform === 'android' ? androidUrl : iosUrl,
    autoSendSupported: platform === 'android',
    note: platform === 'android' ? 'Android prépare le SMS natif avec la SIM si les permissions le permettent.' : "iOS ouvre l'app Messages et nécessite une confirmation utilisateur.",
  }, { headers: corsHeaders });
};

const handlePushPublicKey = async (request: Request, env: Env) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'GET') return Response.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: corsHeaders });
  if (!env.VAPID_PUBLIC_KEY) return Response.json({ error: 'PUSH_NOT_CONFIGURED' }, { status: 503, headers: corsHeaders });
  return Response.json({ publicKey: env.VAPID_PUBLIC_KEY }, { headers: corsHeaders });
};

const handlePushSubscribe = async (request: Request, env: Env) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return Response.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: corsHeaders });
  if (!env.DB) return Response.json({ error: 'CLOUD_DATABASE_UNAVAILABLE' }, { status: 503, headers: corsHeaders });
  const body = (await request.json().catch(() => ({}))) as Record<string, any>;
  const subscription = body.subscription;
  const endpoint = typeof subscription?.endpoint === 'string' ? subscription.endpoint : '';
  const p256dh = typeof subscription?.keys?.p256dh === 'string' ? subscription.keys.p256dh : '';
  const auth = typeof subscription?.keys?.auth === 'string' ? subscription.keys.auth : '';
  const deviceId = typeof body.deviceId === 'string' && body.deviceId.trim() ? body.deviceId.trim() : 'anonymous_device';
  const phone = normalizePhone(body.phone);
  if (!endpoint) return Response.json({ error: 'INVALID_SUBSCRIPTION' }, { status: 400, headers: corsHeaders });
  await setupSchema(env.DB);
  await env.DB.prepare(`
    INSERT INTO push_subscriptions(endpoint, device_id, phone, p256dh, auth, last_seen)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT(endpoint) DO UPDATE SET device_id=excluded.device_id, phone=excluded.phone, p256dh=excluded.p256dh, auth=excluded.auth, last_seen=excluded.last_seen
  `).bind(endpoint, deviceId, phone, p256dh || null, auth || null, Date.now()).run();
  return Response.json({ ok: true }, { headers: corsHeaders });
};

const handlePresence = async (request: Request, env: Env): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method === 'GET') {
    if (!env.DB) return Response.json({ ok: true, service: 'presence', dbBinding: false, pushConfigured: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) }, { headers: corsHeaders });
    await setupSchema(env.DB);
    const tableRows = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('presence','guardian_alerts','push_subscriptions') ORDER BY name").all<{ name: string }>();
    const tables = (tableRows.results || []).map((row) => row.name);
    return Response.json({ ok: true, service: 'presence', dbBinding: true, pushConfigured: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY), schemaReady: tables.length === 3, tables }, { headers: corsHeaders });
  }
  if (request.method !== 'POST') return Response.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: corsHeaders });

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const deviceId = typeof body.deviceId === 'string' && body.deviceId.trim() ? body.deviceId.trim() : 'anonymous_device';
    const action = body.action === 'alert' ? 'alert' : body.action === 'resolve' ? 'resolve' : 'presence';
    const lat = Number.isFinite(Number(body.lat)) ? Number(body.lat) : null;
    const lng = Number.isFinite(Number(body.lng)) ? Number(body.lng) : null;
    const radiusKm = Number.isFinite(Number(body.radiusKm)) ? Math.max(0.1, Number(body.radiusKm)) : 1;
    const senderName = typeof body.sender === 'string' ? body.sender.trim().slice(0, 80) : '';
    const appMessage = typeof body.message === 'string' ? body.message.trim().slice(0, 500) : '';
    const phone = normalizePhone(body.phone);
    const contactPhones = normalizePhoneList(body.contactPhones);
    const contactPhonesJson = JSON.stringify(contactPhones);
    const userIP = request.headers.get('cf-connecting-ip') || '127.0.0.1';
    const now = Date.now();

    if (!env.DB) {
      registerInMemoryPresence(deviceId, userIP);
      return Response.json({ error: 'CLOUD_DATABASE_UNAVAILABLE', detail: 'Missing D1 binding DB' }, { status: 503, headers: corsHeaders });
    }

    await setupSchema(env.DB);
    await env.DB.prepare(`INSERT INTO presence(device_id, ip, phone, lat, lng, last_seen) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      ON CONFLICT(device_id) DO UPDATE SET ip=excluded.ip, phone=COALESCE(excluded.phone,presence.phone), lat=COALESCE(excluded.lat,presence.lat), lng=COALESCE(excluded.lng,presence.lng), last_seen=excluded.last_seen`)
      .bind(deviceId, userIP, phone, lat, lng, now).run();

    await env.DB.prepare(`DELETE FROM presence WHERE last_seen <= ?1`).bind(now - ACTIVE_WINDOW_SECONDS * 1000).run();
    const countRow = await env.DB.prepare(`SELECT COUNT(*) as count FROM presence WHERE last_seen > ?1`).bind(now - ACTIVE_WINDOW_SECONDS * 1000).first<{ count: number }>();
    const count = Number(countRow?.count ?? 0);

    let nearbyCount = 0;
    if (action === 'alert' && lat !== null && lng !== null) {
      await env.DB.prepare(`UPDATE presence SET last_emergency_at = ?1 WHERE device_id = ?2`).bind(String(now), deviceId).run();
      const activeRows = await env.DB.prepare(`SELECT device_id, phone, lat, lng FROM presence WHERE device_id <> ?1 AND last_seen > ?2 AND lat IS NOT NULL AND lng IS NOT NULL`).bind(deviceId, now - ACTIVE_WINDOW_SECONDS * 1000).all<{ device_id: string; phone?: string | null; lat: number; lng: number }>();
      const nearbyRows = (activeRows.results || []).filter((row) => {
        const d = computeDistanceKm(lat, lng, row.lat, row.lng);
        return Number.isFinite(d) && d <= radiusKm;
      });
      nearbyCount = nearbyRows.length;
      await env.DB.prepare(`INSERT INTO guardian_alerts(sender_device_id,sender_phone,contact_phones,lat,lng,radius_km,sender_name,message,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`).bind(deviceId, phone, contactPhonesJson, lat, lng, radiusKm, senderName || null, appMessage || null, now).run();
      const contactSubscriptions = await querySubscriptionsByPhones(env.DB, contactPhones);
      const nearbyNonContactIds = nearbyRows.filter((row) => !row.phone || !contactPhones.includes(row.phone)).map((row) => row.device_id);
      const nearbySubscriptions = await querySubscriptionsByDeviceIds(env.DB, nearbyNonContactIds);
      await notifySubscriptions(env, [...contactSubscriptions, ...nearbySubscriptions]);
    }

    if (action === 'resolve') await env.DB.prepare(`UPDATE guardian_alerts SET resolved_at=?1 WHERE sender_device_id=?2 AND resolved_at IS NULL`).bind(now, deviceId).run();

    const alerts = await env.DB.prepare(`
      SELECT id, created_at, lat, lng, sender_device_id, sender_name, message, contact_phones, radius_km
      FROM guardian_alerts
      WHERE sender_device_id <> ?1 AND created_at > ?2 AND resolved_at IS NULL
      ORDER BY created_at DESC
      LIMIT 10
    `).bind(deviceId, now - ALERT_WINDOW_MS).all<{ id: number; created_at: number; lat: number; lng: number; sender_device_id: string; sender_name?: string | null; message?: string | null; contact_phones?: string | null; radius_km: number }>();

    const latestIncomingAlert = (alerts.results || []).map((row) => {
      const alertContactPhones = JSON.parse(row.contact_phones || '[]') as string[];
      const isContactRecipient = Boolean(phone && alertContactPhones.includes(phone));
      const isNearby = lat === null || lng === null ? false : computeDistanceKm(lat, lng, row.lat, row.lng) <= row.radius_km;
      return { ...row, isContactRecipient, isNearby };
    }).find((row) => row.isContactRecipient || row.isNearby);
    const hasIncomingAlert = Boolean(latestIncomingAlert);
    const isContactRecipient = Boolean(latestIncomingAlert?.isContactRecipient);

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
      latestAlertSender: hasIncomingAlert && isContactRecipient ? (latestIncomingAlert!.sender_name || toSessionId(String(latestIncomingAlert!.sender_device_id))) : null,
      latestAlertMessage: hasIncomingAlert && isContactRecipient ? (latestIncomingAlert!.message || 'HELP') : hasIncomingAlert ? 'HELP' : null,
      latestAlertPrecision: hasIncomingAlert ? (latestIncomingAlert!.isNearby ? 'exact' : 'approximate') : null,
      latestAlertIsSelf: false,
      latestAlertIsContact: isContactRecipient,
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
    if (url.pathname === '/api/push/public-key' || url.pathname === '/api/push/public-key/') return handlePushPublicKey(request, env);
    if (url.pathname === '/api/push/subscribe' || url.pathname === '/api/push/subscribe/') return handlePushSubscribe(request, env);
    if (url.pathname.startsWith('/api/')) return Response.json({ error: 'API_ROUTE_NOT_FOUND', path: url.pathname }, { status: 404, headers: corsHeaders });
    return env.ASSETS.fetch(request);
  },
};
