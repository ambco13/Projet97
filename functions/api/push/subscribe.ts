interface Env {
  DB?: D1Database;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as const;

const normalizePhone = (rawPhone: unknown): string | null => {
  if (typeof rawPhone !== 'string') return null;
  const compact = rawPhone.replace(/(?!^)\+/g, '').replace(/[^\d+]/g, '');
  return /^\+?[0-9]{6,18}$/.test(compact) ? compact : null;
};

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
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

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      phone TEXT,
      p256dh TEXT,
      auth TEXT,
      last_seen INTEGER NOT NULL
    )
  `).run();

  await env.DB.prepare(`
    INSERT INTO push_subscriptions(endpoint, device_id, phone, p256dh, auth, last_seen)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT(endpoint) DO UPDATE SET
      device_id=excluded.device_id,
      phone=excluded.phone,
      p256dh=excluded.p256dh,
      auth=excluded.auth,
      last_seen=excluded.last_seen
  `).bind(endpoint, deviceId, phone, p256dh || null, auth || null, Date.now()).run();

  return Response.json({ ok: true }, { headers: corsHeaders });
};
