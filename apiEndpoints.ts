const rawBaseUrl = import.meta.env.VITE_PRESENCE_BASE_URL?.trim() || '';

const normalizeBaseUrl = (value: string) => {
  if (!value) return '';
  return value.endsWith('/') ? value.slice(0, -1) : value;
};

const baseUrl = normalizeBaseUrl(rawBaseUrl);

const toAbsolute = (path: string) => (baseUrl ? `${baseUrl}${path}` : path);

export const PRESENCE_ENDPOINTS = [
  toAbsolute('/api/presence'),
  '/api/presence',
];

export const MESSAGE_COMPOSE_ENDPOINTS = [
  toAbsolute('/api/messages/compose'),
  '/api/messages/compose',
];

export const PUSH_PUBLIC_KEY_ENDPOINTS = [
  toAbsolute('/api/push/public-key'),
  '/api/push/public-key',
];

export const PUSH_SUBSCRIBE_ENDPOINTS = [
  toAbsolute('/api/push/subscribe'),
  '/api/push/subscribe',
];
