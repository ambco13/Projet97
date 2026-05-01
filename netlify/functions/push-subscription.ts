import { Handler } from '@netlify/functions';

const getDatabaseUrl = () =>
  process.env.NETLIFY_DATABASE_URL ||
  process.env.NETLIFY_DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL ||
  '';

let poolPromise: Promise<any> | null = null;

const getPool = async () => {
  if (poolPromise) return poolPromise;
  const connectionString = getDatabaseUrl();
  if (!connectionString) return null;
  try {
    poolPromise = (async () => {
      const pg = await import('pg');
      const Pool = (pg as any).Pool;
      return new Pool({ connectionString });
    })();
    return poolPromise;
  } catch {
    poolPromise = null;
    return null;
  }
};

export const handler: Handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  } as const;
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: corsHeaders, body: '' };

  try {
    const body = JSON.parse(event.body || '{}') as { deviceId?: string; subscription?: any };
    const deviceId = body.deviceId?.trim();
    const subscription = body.subscription;
    if (!deviceId || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'INVALID_PAYLOAD' }) };
    }

    const db = await getPool();
    if (!db) return { statusCode: 503, headers: corsHeaders, body: JSON.stringify({ error: 'DB_UNAVAILABLE' }) };

    await db.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        device_id TEXT PRIMARY KEY,
        subscription JSONB NOT NULL,
        last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await db.query(
      `INSERT INTO push_subscriptions (device_id, subscription, last_seen)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (device_id)
       DO UPDATE SET subscription = EXCLUDED.subscription, last_seen = NOW()`,
      [deviceId, JSON.stringify(subscription)],
    );

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) };
  } catch {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'INTERNAL_ERROR' }) };
  }
};
