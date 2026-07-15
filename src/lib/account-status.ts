import type { AdminAccount } from '@/src/types/admin';

const RATE_LIMIT_STATUSES = new Set([
  'rate_limited',
  'rate-limited',
  'rate_limit',
  'limited',
  'throttled',
  'too_many_requests',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function firstValue(source: Record<string, unknown> | undefined, keys: string[]) {
  if (!source) return undefined;
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}

function firstText(source: Record<string, unknown> | undefined, keys: string[]) {
  if (!source) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function explicitBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value !== 0;
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'limited', 'rate_limited', 'throttled'].includes(normalized)) return true;
  if (['false', '0', 'no', 'normal', 'available', 'none'].includes(normalized)) return false;
  return undefined;
}

function explicitRateLimitState(source: Record<string, unknown> | undefined) {
  if (!source) return undefined;
  for (const key of ['is_rate_limited', 'isRateLimited', 'rate_limited', 'rateLimited']) {
    const state = explicitBoolean(source[key]);
    if (state !== undefined) return state;
  }
  return undefined;
}

function timeValue(value?: string) {
  if (!value) return undefined;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

function hasRateLimitSignal(source: Record<string, unknown>) {
  const errorCode = Number(firstValue(source, ['error_code', 'errorCode', 'status_code', 'statusCode']));
  if (errorCode === 429) return true;

  const message = firstText(source, ['error_message', 'errorMessage', 'message', 'reason'])?.toLowerCase() ?? '';
  return message.includes('rate limit') || message.includes('rate_limit') || message.includes('429') || message.includes('限流');
}

function hasActiveRateLimitWindow(source: Record<string, unknown>, now: number) {
  const resetAt = firstText(source, ['rate_limit_reset_at', 'rateLimitResetAt']);
  const resetTime = timeValue(resetAt);
  if (resetTime === undefined || resetTime <= now) return false;

  const limitedAt = firstText(source, ['rate_limited_at', 'rateLimitedAt']);
  const limitedTime = timeValue(limitedAt);
  return (limitedTime !== undefined && limitedTime <= now) || hasRateLimitSignal(source);
}

function hasExplicitRateLimitStatus(source: Record<string, unknown>) {
  const status = firstText(source, ['status', 'state'])?.toLowerCase();
  return Boolean(status && RATE_LIMIT_STATUSES.has(status));
}

export function isAccountRateLimited(account: AdminAccount, now = Date.now()) {
  const source = account as Record<string, unknown>;
  const extra = isRecord(account.extra) ? account.extra : undefined;
  const explicitState = explicitRateLimitState(source) ?? explicitRateLimitState(extra);
  if (explicitState !== undefined) return explicitState;

  if (
    hasExplicitRateLimitStatus(source)
    || hasActiveRateLimitWindow(source, now)
    || (extra && hasActiveRateLimitWindow(extra, now))
  ) return true;

  const modelLimits = firstValue(extra, ['model_rate_limits', 'modelRateLimits']);
  if (!isRecord(modelLimits)) return false;

  return Object.values(modelLimits).some((value) => {
    if (!isRecord(value)) return false;
    const modelState = explicitRateLimitState(value);
    if (modelState !== undefined) return modelState;
    return hasExplicitRateLimitStatus(value) || hasActiveRateLimitWindow(value, now);
  });
}
