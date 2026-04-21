import { Handler } from '@netlify/functions';

const getDatabaseUrl = () =>
  process.env.NETLIFY_DATABASE_URL ||
  process.env.NETLIFY_DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL ||
  '';

const PRESENCE_WINDOW_MS = 5 * 60 * 1000;
const inMemoryPresence = new Map<string, { ip: string; lastSeen: number }>();

let poolPromise: Promise<any> | null = null;

const getPool = async () => {
  if (poolPromise) return poolPromise;

  const connectionString = getDatabaseUrl();
  if (!connectionString) return null;

  try {
    poolPromise = (async () => {
      const pgModuleName = 'pg';
      const pg = await import(pgModuleName);
      const Pool = (pg as any).Pool;
      return new Pool({ connectionString });
    })();

    return poolPromise;
  } catch (error) {
    poolPromise = null;
    return null;
  }
};

const registerInMemoryPresence = (deviceId: string, userIP: string) => {
  const now = Date.now();
  inMemoryPresence.set(deviceId, { ip: userIP, lastSeen: now });

  for (const [id, item] of inMemoryPresence.entries()) {
    if (now - item.lastSeen > PRESENCE_WINDOW_MS) {
      inMemoryPresence.delete(id);
    }
  }

  return inMemoryPresence.size;
};

const registerInMemoryPresence = (deviceId: string, userIP: string) => {
  const now = Date.now();
  inMemoryPresence.set(deviceId, { ip: userIP, lastSeen: now });

  for (const [id, item] of inMemoryPresence.entries()) {
    if (now - item.lastSeen > PRESENCE_WINDOW_MS) {
      inMemoryPresence.delete(id);
    }
  }

  return inMemoryPresence.size;
};

export const handler: Handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  } as const;

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: '',
    };
  }

  try {
    const { deviceId = 'anonymous_device' } = JSON.parse(event.body || '{}');
    const userIP = event.headers['x-nf-client-connection-ip'] || '127.0.0.1';

    const startedAt = Date.now();
    const db = await getPool();

    if (!db) {
      const count = registerInMemoryPresence(deviceId, userIP);
      return {
        statusCode: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          count,
          trend: 'stable',
          engine: 'NETLIFY_FUNCTION_MEMORY',
          latency: `${Date.now() - startedAt}ms`,
          storage: 'memory-fallback',
        }),
      };
    }

    await db.query(`
      CREATE TABLE IF NOT EXISTS presence (
        device_id TEXT PRIMARY KEY,
        ip TEXT,
        last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await db.query(
      `
        INSERT INTO presence (device_id, ip, last_seen)
        VALUES ($1, $2, NOW())
        ON CONFLICT (device_id)
        DO UPDATE SET
          ip = EXCLUDED.ip,
          last_seen = NOW()
      `,
      [deviceId, userIP],
    );

    const countResult = await db.query(
      `
        SELECT COUNT(*)::int AS count
        FROM presence
        WHERE last_seen > NOW() - INTERVAL '5 minutes'
      `,
    );

    const finalCount = Number(countResult.rows?.[0]?.count ?? 0);

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        count: finalCount,
        trend: 'stable',
        engine: 'NETLIFY_POSTGRES',
        latency: `${Date.now() - startedAt}ms`,
        session_id: `p97_${Buffer.from(deviceId).toString('hex').slice(0, 12)}`,
        ip_mask: userIP.replace(/\.\d+$/, '.***'),
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: 'Cloud Sync Error',
        detail: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
