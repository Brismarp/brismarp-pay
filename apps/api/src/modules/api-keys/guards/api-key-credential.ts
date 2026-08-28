const API_KEY_PREFIXES = ['bpay_sandbox_', 'bpay_production_'] as const;

export function extractApiKeyFromRequest(request: {
  headers?: Record<string, unknown>;
}): string | null {
  const headers = request.headers ?? {};
  const xApiKey = headers['x-api-key'];
  if (typeof xApiKey === 'string' && xApiKey.trim()) return xApiKey.trim();

  const authorization = headers.authorization ?? headers.Authorization;
  if (typeof authorization !== 'string') return null;
  const raw = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!raw) return null;
  if (API_KEY_PREFIXES.some((prefix) => raw.startsWith(prefix))) return raw;
  return null;
}

export function hasApiKeyCredential(request: { headers?: Record<string, unknown> }): boolean {
  return extractApiKeyFromRequest(request) !== null;
}
