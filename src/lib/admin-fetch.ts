import { adminConfigState } from '@/src/store/admin-config';
import type { ApiEnvelope } from '@/src/types/admin';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasNumericCode(value: unknown): value is ApiEnvelope<unknown> {
  return isRecord(value) && typeof value.code === 'number';
}

function hasBooleanSuccess(value: unknown): value is { success: boolean; message?: string; reason?: string; data?: unknown } {
  return isRecord(value) && typeof value.success === 'boolean';
}

function buildRequestUrl(baseUrl: string, path: string) {
  const normalizedBase = baseUrl.trim().replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const duplicatedPrefixes = ['/api/v1', '/api'];

  for (const prefix of duplicatedPrefixes) {
    if (normalizedBase.endsWith(prefix) && normalizedPath.startsWith(`${prefix}/`)) {
      const baseWithoutPrefix = normalizedBase.slice(0, -prefix.length);
      return `${baseWithoutPrefix}${normalizedPath}`;
    }
  }

  return `${normalizedBase}${normalizedPath}`;
}

function formatAuthorizationHeader(value: string) {
  return value.toLowerCase().startsWith('bearer ') ? value : `Bearer ${value}`;
}

function compactResponseText(value: string) {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned.length > 180 ? `${cleaned.slice(0, 180)}...` : cleaned;
}

export async function adminFetch<T>(
  path: string,
  init: RequestInit = {},
  options?: { idempotencyKey?: string }
): Promise<T> {
  const baseUrl = adminConfigState.baseUrl.trim().replace(/\/$/, '');
  const adminApiKey = adminConfigState.adminApiKey.trim();

  if (!baseUrl) {
    throw new Error('BASE_URL_REQUIRED');
  }

  if (!adminApiKey) {
    throw new Error('ADMIN_API_KEY_REQUIRED');
  }

  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (adminApiKey) {
    headers.set('x-api-key', adminApiKey);
    if (!headers.has('Authorization')) {
      headers.set('Authorization', formatAuthorizationHeader(adminApiKey));
    }
  }

  if (options?.idempotencyKey) {
    headers.set('Idempotency-Key', options.idempotencyKey);
  }

  const response = await fetch(buildRequestUrl(baseUrl, path), {
    ...init,
    headers,
  });

  let json: unknown;
  const method = (init.method || 'GET').toUpperCase();
  const rawText = await response.text();

  if (!rawText.trim()) {
    if (!response.ok) {
      throw new Error('REQUEST_FAILED');
    }

    return undefined as T;
  }

  try {
    json = JSON.parse(rawText);
  } catch {
    const detail = compactResponseText(rawText);
    const looksLikeHtml = /^</.test(detail) || /<html/i.test(rawText);
    if (!response.ok) {
      throw new Error(detail || `HTTP_${response.status}`);
    }

    if (method !== 'GET' && !looksLikeHtml) {
      return rawText as T;
    }

    throw new Error(detail || 'INVALID_SERVER_RESPONSE');
  }

  if (hasNumericCode(json)) {
    const okCode = json.code === 0 || (json.code >= 200 && json.code < 300);
    if (!response.ok || !okCode) {
      throw new Error(json.reason || json.message || 'REQUEST_FAILED');
    }

    return json.data as T;
  }

  if (hasBooleanSuccess(json)) {
    if (!response.ok || !json.success) {
      throw new Error(json.reason || json.message || 'REQUEST_FAILED');
    }

    return (json.data ?? json) as T;
  }

  if (!response.ok) {
    const message = isRecord(json) && typeof json.message === 'string'
      ? json.message
      : isRecord(json) && typeof json.detail === 'string'
        ? json.detail
        : 'REQUEST_FAILED';
    throw new Error(message);
  }

  return json as T;
}
