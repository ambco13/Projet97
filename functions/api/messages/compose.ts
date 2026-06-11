interface ComposeResponse {
  ok: true;
  phone: string;
  messageLength: number;
  channel: 'carrier_sms' | 'apple_messages';
  platform: 'android' | 'ios';
  composeUrl: string;
  autoSendSupported: boolean;
  note: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as const;

type MessagePlatform = 'android' | 'ios' | 'unknown';

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

export const onRequest: PagesFunction = async ({ request }) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') {
    return Response.json(
      { error: 'METHOD_NOT_ALLOWED', detail: 'Use POST to prepare native message compose.' },
      { status: 405, headers: corsHeaders },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const platform = normalizePlatform(body.platform);
  const phone = sanitizePhone(body.phone);
  const text = typeof body.text === 'string' ? body.text.trim() : '';

  if (!phone) return Response.json({ error: 'INVALID_PHONE' }, { status: 400, headers: corsHeaders });
  if (!text) return Response.json({ error: 'MISSING_MESSAGE_TEXT' }, { status: 400, headers: corsHeaders });

  const encodedText = encodeURIComponent(text);
  const iosUrl = `sms:${phone}&body=${encodedText}`;
  const androidUrl = `sms:${phone}?body=${encodedText}`;

  const response: ComposeResponse = platform === 'android'
    ? {
        ok: true,
        phone,
        messageLength: text.length,
        channel: 'carrier_sms',
        platform: 'android',
        composeUrl: androidUrl,
        autoSendSupported: true,
        note: 'Android prépare le SMS natif avec la SIM si les permissions le permettent.',
      }
    : {
        ok: true,
        phone,
        messageLength: text.length,
        channel: 'apple_messages',
        platform: 'ios',
        composeUrl: iosUrl,
        autoSendSupported: false,
        note: "iOS ouvre l'app Messages et nécessite une confirmation utilisateur.",
      };

  return Response.json(response, { headers: corsHeaders });
};
