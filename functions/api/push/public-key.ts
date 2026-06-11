interface Env {
  VAPID_PUBLIC_KEY?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
} as const;

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'GET') return Response.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: corsHeaders });
  if (!env.VAPID_PUBLIC_KEY) return Response.json({ error: 'PUSH_NOT_CONFIGURED' }, { status: 503, headers: corsHeaders });
  return Response.json({ publicKey: env.VAPID_PUBLIC_KEY }, { headers: corsHeaders });
};
