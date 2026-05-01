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
