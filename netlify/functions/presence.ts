import { Handler } from '@netlify/functions';

const getDatabaseUrl = () =>
  process.env.NETLIFY_DATABASE_URL ||
  process.env.NETLIFY_DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL ||
  '';

const PRESENCE_WINDOW_MS = 5 * 60 * 1000;
const inMemoryPresence = new Map<string, { ip: string; lastSeen: number }>();

let poolPromise: Promise<any> | null = null;
const ACTIVE_WINDOW_SQL = "60 seconds";
const toSessionId = (rawDeviceId: string) => {
  let hash = 0;
  for (let i = 0; i < rawDeviceId.length; i += 1) {
    hash = (hash * 31 + rawDeviceId.charCodeAt(i)) >>> 0;
  }
  return `p97_${hash.toString(16).padStart(8, '0')}`;
};

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

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: 'METHOD_NOT_ALLOWED',
        detail: 'Use POST to sync presence.',
      }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}') as {
      action?: unknown;
      deviceId?: unknown;
      lat?: unknown;
      lng?: unknown;
      radiusKm?: unknown;
    };
    const deviceId = typeof body.deviceId === 'string' && body.deviceId.trim().length > 0
      ? body.deviceId.trim()
      : 'anonymous_device';
    const action = body.action === 'alert' ? 'alert' : 'presence';
    const lat = Number.isFinite(Number(body.lat)) ? Number(body.lat) : null;
    const lng = Number.isFinite(Number(body.lng)) ? Number(body.lng) : null;
    const radiusKm = Number.isFinite(Number(body.radiusKm)) ? Math.max(0.1, Number(body.radiusKm)) : 1;
    const userIP = event.headers['x-nf-client-connection-ip'] || '127.0.0.1';

    const startedAt = Date.now();
    const db = await getPool();

    if (!db) {
      const count = registerInMemoryPresence(deviceId, userIP);
      return {
        statusCode: 503,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          error: 'CLOUD_DATABASE_UNAVAILABLE',
          detail: 'Presence requires a configured and reachable Postgres database.',
        }),
      };
    }

    await db.query(`
      CREATE TABLE IF NOT EXISTS presence (
        device_id TEXT PRIMARY KEY,
        ip TEXT,
        lat DOUBLE PRECISION,
        lng DOUBLE PRECISION,
        last_emergency_at TIMESTAMPTZ,
        last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.query(`ALTER TABLE presence ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION`);
    await db.query(`ALTER TABLE presence ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION`);
    await db.query(`ALTER TABLE presence ADD COLUMN IF NOT EXISTS last_emergency_at TIMESTAMPTZ`);
    await db.query(`
      CREATE TABLE IF NOT EXISTS guardian_alerts (
        id BIGSERIAL PRIMARY KEY,
        sender_device_id TEXT NOT NULL,
        lat DOUBLE PRECISION NOT NULL,
        lng DOUBLE PRECISION NOT NULL,
        radius_km DOUBLE PRECISION NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await db.query(
      `
        INSERT INTO presence (device_id, ip, lat, lng, last_seen)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (device_id)
        DO UPDATE SET
          ip = EXCLUDED.ip,
          lat = COALESCE(EXCLUDED.lat, presence.lat),
          lng = COALESCE(EXCLUDED.lng, presence.lng),
          last_seen = NOW()
      `,
      [deviceId, userIP, lat, lng],
    );

    await db.query(
      `
        DELETE FROM presence
        WHERE last_seen <= NOW() - INTERVAL '${ACTIVE_WINDOW_SQL}'
      `,
    );

    const countResult = await db.query(
      `
        SELECT COUNT(*)::int AS count
        FROM presence
        WHERE last_seen > NOW() - INTERVAL '${ACTIVE_WINDOW_SQL}'
      `,
    );

    const finalCount = Number(countResult.rows?.[0]?.count ?? 0);

    let nearbyCount = 0;
    if (action === 'alert' && lat !== null && lng !== null) {
      await db.query(
        `
          UPDATE presence
          SET last_emergency_at = NOW()
          WHERE device_id = $1
        `,
        [deviceId],
      );

      const nearbyResult = await db.query(
        `
          SELECT COUNT(*)::int AS count
          FROM presence
          WHERE device_id <> $1
            AND last_seen > NOW() - INTERVAL '${ACTIVE_WINDOW_SQL}'
            AND lat IS NOT NULL
            AND lng IS NOT NULL
            AND (
              6371 * acos(
                cos(radians($2)) * cos(radians(lat))
                * cos(radians(lng) - radians($3))
                + sin(radians($2)) * sin(radians(lat))
              )
            ) <= $4
        `,
        [deviceId, lat, lng, radiusKm],
      );
      nearbyCount = Number(nearbyResult.rows?.[0]?.count ?? 0);

      await db.query(
        `
          INSERT INTO guardian_alerts (sender_device_id, lat, lng, radius_km, created_at)
          VALUES ($1, $2, $3, $4, NOW())
        `,
        [deviceId, lat, lng, radiusKm],
      );
    }

    const incomingAlertsResult = lat !== null && lng !== null
      ? await db.query(
          `
            SELECT id, created_at, lat, lng, sender_device_id
            FROM guardian_alerts
            WHERE sender_device_id <> $1
              AND created_at > NOW() - INTERVAL '90 seconds'
              AND (
                6371 * acos(
                  cos(radians($2)) * cos(radians(lat))
                  * cos(radians(lng) - radians($3))
                  + sin(radians($2)) * sin(radians(lat))
                )
              ) <= radius_km
            ORDER BY created_at DESC
            LIMIT 1
          `,
          [deviceId, lat, lng],
        )
      : await db.query(
          `
            SELECT id, created_at, lat, lng, sender_device_id
            FROM guardian_alerts
            WHERE sender_device_id <> $1
              AND created_at > NOW() - INTERVAL '90 seconds'
            ORDER BY created_at DESC
            LIMIT 1
          `,
          [deviceId],
        );
    const latestIncomingAlert = incomingAlertsResult.rows?.[0];
    const hasIncomingAlert = Boolean(latestIncomingAlert);
    const alertPrecision = lat !== null && lng !== null ? 'exact' : 'approximate';

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
        nearbyCount,
        incomingAlerts: hasIncomingAlert ? 1 : 0,
        latestAlertId: hasIncomingAlert ? String(latestIncomingAlert.id) : null,
        latestAlertAt: hasIncomingAlert ? latestIncomingAlert.created_at : null,
        latestAlertLat: hasIncomingAlert ? Number(latestIncomingAlert.lat) : null,
        latestAlertLng: hasIncomingAlert ? Number(latestIncomingAlert.lng) : null,
        latestAlertSender: hasIncomingAlert ? toSessionId(String(latestIncomingAlert.sender_device_id)) : null,
        latestAlertPrecision: hasIncomingAlert ? alertPrecision : null,
        session_id: toSessionId(deviceId),
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
        error: 'CLOUD_SYNC_ERROR',
        detail: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
