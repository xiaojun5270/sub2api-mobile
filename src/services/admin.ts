import { adminFetch } from '@/src/lib/admin-fetch';
import type {
  AccountTodayStats,
  AdminAccount,
  AdminApiKey,
  AdminGroup,
  AdminSettings,
  AdminUser,
  BalanceOperation,
  DashboardModelStats,
  DashboardSnapshot,
  DashboardStats,
  DashboardTrend,
  CreateApiKeyRequest,
  CreateAccountRequest,
  CreateUserRequest,
  OpsDashboardOverview,
  OpsDashboardSnapshot,
  OpsMetricPoint,
  OpsRecord,
  PaginatedData,
  UpdateAccountRequest,
  UpdateApiKeyRequest,
  UsageStats,
  UserUsageSummary,
} from '@/src/types/admin';

function buildQuery(params: Record<string, string | number | boolean | null | undefined>) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });

  const value = query.toString();

  return value ? `?${value}` : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function firstNumberField(source: unknown, keys: string[]): number | undefined {
  if (!isRecord(source)) return undefined;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }

  for (const key of ['data', 'payload', 'result', 'response']) {
    const nested: number | undefined = firstNumberField(source[key], keys);
    if (nested !== undefined) return nested;
  }

  return undefined;
}

function firstStringField(source: unknown, keys: string[]): string | undefined {
  if (!isRecord(source)) return undefined;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
  }

  for (const key of ['data', 'payload', 'result', 'response']) {
    const nested: string | undefined = firstStringField(source[key], keys);
    if (nested) return nested;
  }

  return undefined;
}

function firstBooleanField(source: unknown, keys: string[]) {
  if (!isRecord(source)) return undefined;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string' && value.trim()) {
      const normalized = value.toLowerCase();
      if (['true', '1', 'yes', 'active', 'enabled'].includes(normalized)) return true;
      if (['false', '0', 'no', 'disabled', 'inactive', 'revoked'].includes(normalized)) return false;
    }
    if (typeof value === 'number' && Number.isFinite(value)) return value !== 0;
  }

  return undefined;
}

function extractItems<T>(payload: unknown, preferredKeys: string[] = []): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (!isRecord(payload)) return [];

  const keys = [
    ...preferredKeys,
    'items',
    'data',
    'list',
    'records',
    'results',
    'rows',
    'content',
    'options',
    'suggestions',
    'values',
    'entries',
    'children',
    'payload',
    'result',
    'response',
    'api_keys',
    'apiKeys',
    'keys',
    'users',
    'logs',
    'errors',
    'events',
  ];

  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) return value as T[];
    if (isRecord(value)) {
      const nested = extractItems<T>(value, preferredKeys);
      if (nested.length > 0) return nested;
    }
  }

  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) return value as T[];
    if (isRecord(value)) {
      const nested = extractItems<T>(value, preferredKeys);
      if (nested.length > 0) return nested;
    }
  }

  return [];
}

function hasApiKeyUsageShape(value: unknown) {
  if (!isRecord(value)) return false;
  return firstNumberField(value, [
    'api_key_id',
    'apiKeyId',
    'today_actual_cost',
    'todayActualCost',
    'total_actual_cost',
    'totalActualCost',
    'total_cost',
    'totalCost',
    'actual_cost',
    'actualCost',
  ]) !== undefined;
}

function extractApiKeyUsageRows(payload: unknown): Record<string, unknown>[] {
  const items = extractItems<Record<string, unknown>>(payload, ['stats', 'items', 'data', 'api_keys', 'apiKeys', 'keys']);
  if (items.length > 0) return items;

  if (!isRecord(payload)) return [];

  for (const key of ['stats', 'data', 'payload', 'result', 'response']) {
    const value = payload[key];
    if (Array.isArray(value)) return value as Record<string, unknown>[];
    if (isRecord(value)) {
      const nested = extractApiKeyUsageRows(value);
      if (nested.length > 0) return nested;
    }
  }

  return Object.entries(payload)
    .filter(([, value]) => hasApiKeyUsageShape(value))
    .map(([key, value]) => {
      const row = value as Record<string, unknown>;
      const apiKeyId = firstNumberField(row, ['api_key_id', 'apiKeyId', 'id']) ?? Number(key);
      return Number.isFinite(apiKeyId) && apiKeyId > 0 && row.api_key_id === undefined
        ? { ...row, api_key_id: apiKeyId }
        : row;
    });
}

function toPaginatedData<T>(payload: unknown, preferredKeys: string[] = []): PaginatedData<T> {
  const items = extractItems<T>(payload, preferredKeys);
  const total = firstNumberField(payload, ['total', 'total_count', 'count']) ?? items.length;
  const page = firstNumberField(payload, ['page', 'current_page']) ?? 1;
  const pageSize = firstNumberField(payload, ['page_size', 'per_page', 'limit']) ?? Math.max(items.length, 1);
  const pages = firstNumberField(payload, ['pages', 'total_pages']) ?? Math.max(Math.ceil(total / Math.max(pageSize, 1)), 1);

  return {
    items,
    total,
    page,
    page_size: pageSize,
    pages,
  };
}

async function adminFetchWithOptionalQuery<T>(
  path: string,
  params: Record<string, string | number | boolean | null | undefined>
) {
  const query = buildQuery(params);

  if (!query) {
    return adminFetch<T>(path);
  }

  try {
    return await adminFetch<T>(`${path}${query}`);
  } catch {
    return adminFetch<T>(path);
  }
}

type OpsQueryParams = {
  time_range?: string;
  start_time?: string;
  end_time?: string;
  platform?: string;
  group_id?: number | null;
  mode?: string;
  window?: string;
  page?: number;
  page_size?: number;
  level?: string;
  status?: string;
  severity?: string;
  limit?: number;
  top_n?: number;
  search?: string;
  q?: string;
};

type ApiKeyRequestValue = string | number | boolean | null | string[] | undefined;

function cleanApiKeyRequestBody(body: Record<string, ApiKeyRequestValue>) {
  const payload: Record<string, Exclude<ApiKeyRequestValue, undefined>> = {};

  Object.entries(body).forEach(([key, value]) => {
    if (value !== undefined) {
      payload[key] = value;
    }
  });

  return payload;
}

function expiryDateFromDays(days?: number | null) {
  if (typeof days !== 'number' || !Number.isFinite(days) || days <= 0) return undefined;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);

  return expiresAt.toISOString();
}

function toPrimaryApiKeyRequestBody(body: CreateApiKeyRequest | UpdateApiKeyRequest) {
  const payload = cleanApiKeyRequestBody(body as Record<string, ApiKeyRequestValue>);
  const customKey = body.custom_key || body.key;

  delete payload.key;
  delete payload.user_id;

  if (customKey?.trim()) {
    payload.custom_key = customKey.trim();
  } else {
    delete payload.custom_key;
  }

  return payload;
}

function toLegacyApiKeyRequestBody(body: CreateApiKeyRequest | UpdateApiKeyRequest) {
  const payload = cleanApiKeyRequestBody(body as Record<string, ApiKeyRequestValue>);

  if (!payload.key && body.custom_key?.trim()) {
    payload.key = body.custom_key.trim();
  }

  if (!payload.expires_at) {
    const expiresAt = expiryDateFromDays('expires_in_days' in body ? body.expires_in_days : undefined);
    if (expiresAt) {
      payload.expires_at = expiresAt;
    }
  }

  delete payload.custom_key;
  delete payload.expires_in_days;

  return payload;
}

function keyMatchesSearch(item: AdminApiKey, search: string) {
  if (!search) return true;

  const normalized = search.toLowerCase();
  const haystack = [
    item.name,
    item.key,
    item.status,
    item.group_name,
    item.group?.name,
    item.group_id,
    item.user_email,
    item.user?.email,
    item.user?.username,
    item.user_id,
  ].filter(Boolean).join(' ').toLowerCase();

  return haystack.includes(normalized);
}

function isDeletedApiKey(item: AdminApiKey) {
  return Boolean(item.deleted_at) || item.key?.startsWith('__deleted');
}

function normalizeAdminApiKey(raw: AdminApiKey | Record<string, unknown>, owner?: AdminUser): AdminApiKey {
  const source = raw as Record<string, unknown>;
  const rawUser = isRecord(source.user) ? source.user : undefined;
  const rawGroup = isRecord(source.group) ? source.group : undefined;
  const id = firstNumberField(source, ['id', 'api_key_id', 'apiKeyId', 'key_id', 'keyId']) ?? 0;
  const userId = firstNumberField(source, ['user_id', 'userId', 'owner_id', 'ownerId']) ?? firstNumberField(rawUser, ['id', 'user_id', 'userId']) ?? owner?.id ?? 0;
  const groupId = firstNumberField(source, ['group_id', 'groupId']) ?? firstNumberField(rawGroup, ['id', 'group_id', 'groupId']);
  const groupName = firstStringField(source, ['group_name', 'groupName']) ?? firstStringField(rawGroup, ['name', 'group_name', 'groupName']);
  const userEmail = firstStringField(source, ['user_email', 'userEmail', 'email']) ?? firstStringField(rawUser, ['email', 'user_email', 'userEmail']) ?? owner?.email;
  const key = firstStringField(source, ['key', 'custom_key', 'customKey', 'api_key', 'apiKey', 'key_value', 'keyValue', 'token', 'value']) ?? '';
  const name = firstStringField(source, ['name', 'label', 'title', 'remark', 'description']) || (key ? `Key ${key.slice(0, 8)}` : `Key #${id || '--'}`);
  const enabled = firstBooleanField(source, ['enabled', 'is_active', 'isActive', 'active']);
  const status = firstStringField(source, ['status', 'state']) || (enabled === false ? 'disabled' : 'active');
  const quota = firstNumberField(source, ['quota', 'quota_limit', 'quotaLimit', 'limit', 'total_quota']) ?? 0;
  const quotaUsed = firstNumberField(source, ['quota_used', 'quotaUsed', 'used_quota', 'usedQuota', 'usage', 'used']) ?? 0;
  const group = (raw as AdminApiKey).group
    ?? (rawGroup as AdminGroup | undefined)
    ?? (groupName || groupId
      ? {
          id: groupId ?? 0,
          name: groupName ?? `#${groupId}`,
          platform: firstStringField(source, ['platform']) ?? '',
        } as AdminGroup
      : undefined);

  return {
    ...(raw as AdminApiKey),
    id,
    user_id: userId,
    user_email: userEmail,
    key,
    custom_key: firstStringField(source, ['custom_key', 'customKey']) ?? (raw as AdminApiKey).custom_key,
    name,
    group_id: groupId ?? ((raw as AdminApiKey).group_id ?? null),
    group_name: groupName ?? (raw as AdminApiKey).group_name,
    status,
    quota,
    quota_used: quotaUsed,
    ip_whitelist: firstStringField(source, ['ip_whitelist', 'ipWhitelist']) ?? (raw as AdminApiKey).ip_whitelist,
    ip_blacklist: firstStringField(source, ['ip_blacklist', 'ipBlacklist']) ?? (raw as AdminApiKey).ip_blacklist,
    rate_limit_5h: firstNumberField(source, ['rate_limit_5h', 'rateLimit5h']),
    rate_limit_1d: firstNumberField(source, ['rate_limit_1d', 'rateLimit1d']),
    rate_limit_7d: firstNumberField(source, ['rate_limit_7d', 'rateLimit7d']),
    last_used_at: firstStringField(source, ['last_used_at', 'lastUsedAt', 'last_used', 'lastUsed']) ?? (raw as AdminApiKey).last_used_at,
    expires_at: firstStringField(source, ['expires_at', 'expiresAt', 'expired_at', 'expiredAt']) ?? (raw as AdminApiKey).expires_at,
    created_at: firstStringField(source, ['created_at', 'createdAt', 'created']) ?? (raw as AdminApiKey).created_at,
    updated_at: firstStringField(source, ['updated_at', 'updatedAt', 'modified_at', 'modifiedAt']) ?? (raw as AdminApiKey).updated_at,
    deleted_at: firstStringField(source, ['deleted_at', 'deletedAt']) ?? (raw as AdminApiKey).deleted_at,
    usage_5h: firstNumberField(source, ['usage_5h', 'usage5h', 'usage_5_hours']),
    usage_1d: firstNumberField(source, ['usage_1d', 'usage1d', 'usage_today', 'today_usage']),
    usage_7d: firstNumberField(source, ['usage_7d', 'usage7d', 'usage_week', 'weekly_usage']),
    window_5h_start: firstStringField(source, ['window_5h_start', 'window5hStart']) ?? (raw as AdminApiKey).window_5h_start,
    window_1d_start: firstStringField(source, ['window_1d_start', 'window1dStart']) ?? (raw as AdminApiKey).window_1d_start,
    window_7d_start: firstStringField(source, ['window_7d_start', 'window7dStart']) ?? (raw as AdminApiKey).window_7d_start,
    group,
    user: (raw as AdminApiKey).user ?? {
      id: userId,
      email: firstStringField(rawUser, ['email']) ?? userEmail,
      username: firstStringField(rawUser, ['username', 'name']) ?? owner?.username,
    },
  };
}

function toNormalizedApiKeyPage(payload: unknown, preferredKeys: string[], search = '', owner?: AdminUser): PaginatedData<AdminApiKey> {
  const page = toPaginatedData<AdminApiKey>(payload, preferredKeys);
  const items = page.items
    .map((item) => normalizeAdminApiKey(item, owner))
    .filter((item) => item.id || item.key)
    .filter((item) => !isDeletedApiKey(item))
    .filter((item) => keyMatchesSearch(item, search));

  return {
    ...page,
    items,
    total: items.length,
    page_size: Math.max(page.page_size, items.length, 1),
    pages: Math.max(Math.ceil(items.length / Math.max(page.page_size, 1)), 1),
  };
}

function isSparseApiKey(item: AdminApiKey) {
  return (
    !item.key
    || (!item.group_id && !item.group_name && !item.group)
    || (!item.last_used_at && !item.created_at && !item.updated_at)
    || item.rate_limit_5h === undefined
    || item.usage_5h === undefined
  );
}

function mergeAdminApiKey(base: AdminApiKey, detail: AdminApiKey) {
  return normalizeAdminApiKey({
    ...base,
    ...detail,
    user: detail.user ?? base.user,
    group: detail.group ?? base.group,
  });
}

async function getApiKeyDetail(apiKeyId: number) {
  const paths = [`/api/v1/keys/${apiKeyId}`, `/api/v1/admin/api-keys/${apiKeyId}`];

  for (const path of paths) {
    try {
      const payload = await adminFetch<unknown>(path);
      const item = normalizeAdminApiKey(payload as AdminApiKey | Record<string, unknown>);
      if (item.id || item.key) {
        return item;
      }
    } catch {
      // Try the next compatible detail endpoint.
    }
  }

  return undefined;
}

async function getUserApiKeysForEnrichment(userId: number, cache: Map<number, Promise<AdminApiKey[]>>) {
  const cached = cache.get(userId);
  if (cached) return cached;

  const request = adminFetch<unknown>(`/api/v1/admin/users/${userId}/api-keys`)
    .then((payload) => toNormalizedApiKeyPage(payload, ['api_keys', 'apiKeys', 'keys']).items)
    .catch(() => [] as AdminApiKey[]);

  cache.set(userId, request);

  return request;
}

async function enrichApiKey(item: AdminApiKey, userKeyCache: Map<number, Promise<AdminApiKey[]>>) {
  if (!isSparseApiKey(item)) return item;

  const detail = item.id ? await getApiKeyDetail(item.id) : undefined;
  if (detail) {
    return mergeAdminApiKey(item, detail);
  }

  if (item.user_id) {
    const userKeys = await getUserApiKeysForEnrichment(item.user_id, userKeyCache);
    const userKey = userKeys.find((candidate) => candidate.id === item.id || (item.key && candidate.key === item.key));

    if (userKey) {
      return mergeAdminApiKey(item, userKey);
    }
  }

  return item;
}

async function enrichApiKeyPage(page: PaginatedData<AdminApiKey>, search = '') {
  const userKeyCache = new Map<number, Promise<AdminApiKey[]>>();
  const items = (await Promise.all(page.items.map((item) => enrichApiKey(item, userKeyCache))))
    .filter((item) => item.id || item.key)
    .filter((item) => !isDeletedApiKey(item))
    .filter((item) => keyMatchesSearch(item, search));

  return {
    ...page,
    items,
    total: items.length,
    page_size: Math.max(page.page_size, items.length, 1),
    pages: Math.max(Math.ceil(items.length / Math.max(page.page_size, 1)), 1),
  };
}

async function listApiKeysFromUsers(search: string): Promise<PaginatedData<AdminApiKey>> {
  const usersPayload = await adminFetch<unknown>('/api/v1/admin/users');
  const users = toPaginatedData<AdminUser>(usersPayload, ['users']).items;
  const keyGroups = await Promise.all(
    users.map(async (user) => {
      try {
        const payload = await adminFetch<unknown>(`/api/v1/admin/users/${user.id}/api-keys`);
        return toNormalizedApiKeyPage(payload, ['api_keys', 'apiKeys', 'keys'], search, user).items;
      } catch {
        return [] as AdminApiKey[];
      }
    })
  );
  const items = keyGroups.flat();

  return {
    items,
    total: items.length,
    page: 1,
    page_size: Math.max(items.length, 1),
    pages: 1,
  };
}

export function getDashboardStats() {
  return adminFetch<DashboardStats>('/api/v1/admin/dashboard/stats');
}

export function getAdminSettings() {
  return adminFetch<AdminSettings>('/api/v1/admin/settings');
}

export function getDashboardTrend(params: {
  start_date: string;
  end_date: string;
  granularity?: 'day' | 'hour';
  account_id?: number;
  group_id?: number;
  user_id?: number;
  api_key_id?: number;
}) {
  return adminFetch<DashboardTrend>(`/api/v1/admin/dashboard/trend${buildQuery(params)}`);
}

export function getDashboardModels(params: { start_date: string; end_date: string }) {
  return adminFetch<DashboardModelStats>(`/api/v1/admin/dashboard/models${buildQuery(params)}`);
}

export function getDashboardSnapshot(params: {
  start_date: string;
  end_date: string;
  granularity?: 'day' | 'hour';
  account_id?: number;
  user_id?: number;
  group_id?: number;
  model?: string;
  request_type?: string;
  billing_type?: string | null;
  include_stats?: boolean;
  include_trend?: boolean;
  include_model_stats?: boolean;
  include_group_stats?: boolean;
  include_users_trend?: boolean;
}) {
  return adminFetch<DashboardSnapshot>(`/api/v1/admin/dashboard/snapshot-v2${buildQuery(params)}`);
}

export function getUsageStats(params: {
  start_date: string;
  end_date: string;
  user_id?: number;
  account_id?: number;
  group_id?: number;
  model?: string;
  request_type?: string;
  billing_type?: string | null;
}) {
  return adminFetch<UsageStats>(`/api/v1/admin/usage/stats${buildQuery(params)}`);
}

export function listUsers(search = '') {
  return adminFetch<PaginatedData<AdminUser>>(
    `/api/v1/admin/users${buildQuery({ page: 1, page_size: 20, search: search.trim() })}`
  );
}

export function getUser(userId: number) {
  return adminFetch<AdminUser>(`/api/v1/admin/users/${userId}`);
}

export function createUser(body: CreateUserRequest) {
  return adminFetch<AdminUser>('/api/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getUserUsage(userId: number, period: 'day' | 'week' | 'month' = 'month') {
  return adminFetch<UserUsageSummary>(`/api/v1/admin/users/${userId}/usage${buildQuery({ period })}`);
}

export async function listUserApiKeys(userId: number) {
  const payload = await adminFetch<unknown>(`/api/v1/admin/users/${userId}/api-keys`);
  return enrichApiKeyPage(toNormalizedApiKeyPage(payload, ['api_keys', 'apiKeys', 'keys']));
}

export async function searchAdminApiKeys(search = '') {
  const keyword = search.trim();
  let primaryError: unknown;

  try {
    const payload = await adminFetchWithOptionalQuery<unknown>('/api/v1/keys', {
      page: 1,
      page_size: 100,
      search: keyword,
    });

    return await enrichApiKeyPage(toNormalizedApiKeyPage(payload, ['api_keys', 'apiKeys', 'keys'], keyword), keyword);
  } catch (error) {
    primaryError = error;
  }

  try {
    const payload = await adminFetchWithOptionalQuery<unknown>('/api/v1/admin/api-keys', {
      page: 1,
      page_size: 100,
      search: keyword,
    });

    return await enrichApiKeyPage(toNormalizedApiKeyPage(payload, ['api_keys', 'apiKeys', 'keys'], keyword), keyword);
  } catch (error) {
    if (!primaryError) {
      primaryError = error;
    }
  }

  try {
    const payload = await adminFetch<unknown>('/api/v1/admin/usage/search-api-keys');
    return await enrichApiKeyPage(toNormalizedApiKeyPage(payload, ['api_keys', 'apiKeys', 'keys'], keyword), keyword);
  } catch (error) {
    if (!primaryError) {
      primaryError = error;
    }
  }

  try {
    return await listApiKeysFromUsers(keyword);
  } catch (error) {
    if (primaryError) {
      throw primaryError;
    }

    throw error;
  }
}

export async function createAdminApiKey(body: CreateApiKeyRequest) {
  const primaryBody = toPrimaryApiKeyRequestBody(body);
  const legacyBody = toLegacyApiKeyRequestBody(body);

  try {
    return await adminFetch<AdminApiKey>('/api/v1/keys', {
      method: 'POST',
      body: JSON.stringify(primaryBody),
    });
  } catch {
    try {
      return await adminFetch<AdminApiKey>('/api/v1/api-keys', {
        method: 'POST',
        body: JSON.stringify(primaryBody),
      });
    } catch {
      try {
        return await adminFetch<AdminApiKey>('/api/v1/admin/api-keys', {
          method: 'POST',
          body: JSON.stringify(legacyBody),
        });
      } catch (error) {
        if (!body.user_id) {
          throw error;
        }

        return adminFetch<AdminApiKey>(`/api/v1/admin/users/${body.user_id}/api-keys`, {
          method: 'POST',
          body: JSON.stringify(legacyBody),
        });
      }
    }
  }
}

function isAdminApiKeyUpdateBody(body: Record<string, Exclude<ApiKeyRequestValue, undefined>>) {
  const adminFields = new Set(['group_id', 'reset_rate_limit_usage']);
  const keys = Object.keys(body);
  return keys.length > 0 && keys.every((key) => adminFields.has(key));
}

function getApiKeyOwnerQuery(userId?: number) {
  return userId ? buildQuery({ user_id: userId }) : '';
}

function isInactiveStatus(status: string) {
  return ['inactive', 'disabled', 'revoked', 'false', '0'].includes(status.trim().toLowerCase());
}

function uniqueApiKeyBodies(bodies: Record<string, Exclude<ApiKeyRequestValue, undefined>>[]) {
  const seen = new Set<string>();

  return bodies.filter((body) => {
    const key = JSON.stringify(body);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildApiKeyUpdateBodies(
  body: UpdateApiKeyRequest,
  primaryBody: Record<string, Exclude<ApiKeyRequestValue, undefined>>,
  legacyBody: Record<string, Exclude<ApiKeyRequestValue, undefined>>
) {
  const bodies = [primaryBody, legacyBody];

  if (typeof body.status === 'string' && body.status.trim()) {
    const enabled = !isInactiveStatus(body.status);
    bodies.push({ ...primaryBody, enabled, active: enabled });
    bodies.push({ ...legacyBody, status: enabled ? 'active' : 'disabled' });
    bodies.push({ ...legacyBody, enabled, active: enabled });
  }

  return uniqueApiKeyBodies(bodies);
}

export async function updateAdminApiKey(apiKeyId: number, body: UpdateApiKeyRequest, userId?: number) {
  const primaryBody = toPrimaryApiKeyRequestBody(body);
  const legacyBody = toLegacyApiKeyRequestBody(body);
  const ownerQuery = getApiKeyOwnerQuery(userId);
  const bodyVariants = buildApiKeyUpdateBodies(body, primaryBody, legacyBody);
  const requests: { path: string; body: Record<string, Exclude<ApiKeyRequestValue, undefined>> }[] = [];
  const seen = new Set<string>();

  const addRequest = (path: string, requestBody: Record<string, Exclude<ApiKeyRequestValue, undefined>>) => {
    const key = `${path}:${JSON.stringify(requestBody)}`;
    if (seen.has(key)) return;
    seen.add(key);
    requests.push({ path, body: requestBody });
  };

  bodyVariants.forEach((requestBody) => {
    addRequest(`/api/v1/keys/${apiKeyId}${ownerQuery}`, requestBody);
  });

  if (userId) {
    bodyVariants.forEach((requestBody) => {
      addRequest(`/api/v1/admin/users/${userId}/api-keys/${apiKeyId}`, requestBody);
    });
  }

  bodyVariants.forEach((requestBody) => {
    addRequest(`/api/v1/api-keys/${apiKeyId}${ownerQuery}`, requestBody);
    addRequest(`/api/v1/keys/${apiKeyId}`, requestBody);
  });

  if (isAdminApiKeyUpdateBody(legacyBody)) {
    addRequest(`/api/v1/admin/api-keys/${apiKeyId}`, legacyBody);
  }

  let firstError: unknown;
  let lastError: unknown;

  for (const request of requests) {
    try {
      return await adminFetch<AdminApiKey>(request.path, {
        method: 'PUT',
        body: JSON.stringify(request.body),
      });
    } catch (error) {
      if (!firstError) {
        firstError = error;
      }
      lastError = error;
    }
  }

  throw firstError ?? lastError;
}

export async function deleteAdminApiKey(apiKeyId: number, userId?: number) {
  const ownerQuery = getApiKeyOwnerQuery(userId);
  const paths = [
    `/api/v1/keys/${apiKeyId}${ownerQuery}`,
    ...(userId ? [`/api/v1/admin/users/${userId}/api-keys/${apiKeyId}`] : []),
    `/api/v1/api-keys/${apiKeyId}${ownerQuery}`,
    `/api/v1/api-keys/${apiKeyId}`,
    `/api/v1/keys/${apiKeyId}`,
    `/api/v1/admin/api-keys/${apiKeyId}`,
  ].filter((path, index, list) => list.indexOf(path) === index);
  let firstError: unknown;
  let lastError: unknown;

  for (const path of paths) {
    try {
      return await adminFetch(path, {
        method: 'DELETE',
      });
    } catch (error) {
      if (!firstError) {
        firstError = error;
      }
      lastError = error;
    }
  }

  throw firstError ?? lastError;
}

export async function getApiKeysUsageDashboard(apiKeyIds: number[] = []) {
  try {
    const payload = await adminFetch<unknown>('/api/v1/admin/dashboard/api-keys-usage', {
      method: 'POST',
      body: JSON.stringify({ api_key_ids: apiKeyIds }),
    });

    return extractApiKeyUsageRows(payload);
  } catch {
    const payload = await adminFetch<unknown>('/api/v1/usage/dashboard/api-keys-usage', {
      method: 'POST',
      body: JSON.stringify({ api_key_ids: apiKeyIds }),
    });

    return extractApiKeyUsageRows(payload);
  }
}

export async function getApiKeyDailyUsage(apiKeyId: number) {
  try {
    const payload = await adminFetch<unknown>(`/api/v1/user/api-keys/${apiKeyId}/usage/daily${buildQuery({ days: 30, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })}`);
    return extractItems<Record<string, unknown>>(payload, ['items', 'data', 'usage', 'records', 'rows']);
  } catch {
    try {
      const today = new Date();
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      const startDate = start.toISOString().slice(0, 10);
      const endDate = today.toISOString().slice(0, 10);
      const payload = await adminFetch<unknown>(`/api/v1/admin/dashboard/trend${buildQuery({
        api_key_id: apiKeyId,
        end_date: endDate,
        granularity: 'day',
        start_date: startDate,
      })}`);

      return extractItems<Record<string, unknown>>(payload, ['trend', 'items', 'data', 'usage', 'records', 'rows']);
    } catch {
      const payload = await adminFetch<unknown>(`/api/v1/usage${buildQuery({ api_key_id: apiKeyId, page: 1, page_size: 200 })}`);
      return extractItems<Record<string, unknown>>(payload, ['items', 'data', 'usage', 'records', 'rows']);
    }
  }
}

export function updateUserBalance(
  userId: number,
  body: { balance: number; operation: BalanceOperation; notes?: string }
) {
  return adminFetch<AdminUser>(
    `/api/v1/admin/users/${userId}/balance`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    {
      idempotencyKey: `user-balance-${userId}-${Date.now()}`,
    }
  );
}

export function updateUserStatus(userId: number, status: 'active' | 'disabled') {
  return adminFetch<AdminUser>(`/api/v1/admin/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

export function listGroups(search = '') {
  return adminFetch<PaginatedData<AdminGroup>>(
    `/api/v1/admin/groups${buildQuery({ page: 1, page_size: 20, search: search.trim() })}`
  );
}

export function getGroup(groupId: number) {
  return adminFetch<AdminGroup>(`/api/v1/admin/groups/${groupId}`);
}

export function listAccounts(search = '') {
  void search;
  return adminFetch<PaginatedData<AdminAccount>>(
    `/api/v1/admin/accounts${buildQuery({ page: 1, page_size: 20 })}`
  );
}

export function getAccount(accountId: number) {
  return adminFetch<AdminAccount>(`/api/v1/admin/accounts/${accountId}`);
}

export function createAccount(body: CreateAccountRequest) {
  return adminFetch<AdminAccount>('/api/v1/admin/accounts', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateAccount(accountId: number, body: UpdateAccountRequest) {
  return adminFetch<AdminAccount>(`/api/v1/admin/accounts/${accountId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function deleteAccount(accountId: number) {
  return adminFetch(`/api/v1/admin/accounts/${accountId}`, {
    method: 'DELETE',
  });
}

export function getAccountTodayStats(accountId: number) {
  return adminFetch<AccountTodayStats>(`/api/v1/admin/accounts/${accountId}/today-stats`);
}

export function getAccountStats(accountId: number, params?: { days?: number }) {
  return adminFetch<UsageStats>(`/api/v1/admin/accounts/${accountId}/stats${buildQuery(params ?? {})}`);
}

export function getAccountUsage(accountId: number) {
  return adminFetch<{ items?: OpsRecord[]; usage?: OpsRecord[]; total?: number }>(
    `/api/v1/admin/accounts/${accountId}/usage`
  );
}

export function getAccountModels(accountId: number) {
  return adminFetch<{ models?: Array<string | { model?: string; name?: string; enabled?: boolean; [key: string]: unknown }> }>(
    `/api/v1/admin/accounts/${accountId}/models`
  );
}

export function testAccount(accountId: number) {
  return adminFetch(`/api/v1/admin/accounts/${accountId}/test`, {
    method: 'POST',
  });
}

export function refreshAccount(accountId: number) {
  return adminFetch(`/api/v1/admin/accounts/${accountId}/refresh`, {
    method: 'POST',
  });
}

export function resetAccountQuota(accountId: number) {
  return adminFetch(`/api/v1/admin/accounts/${accountId}/reset-quota`, {
    method: 'POST',
  });
}

export function clearAccountError(accountId: number) {
  return adminFetch(`/api/v1/admin/accounts/${accountId}/clear-error`, {
    method: 'POST',
  });
}

export function clearAccountRateLimit(accountId: number) {
  return adminFetch(`/api/v1/admin/accounts/${accountId}/clear-rate-limit`, {
    method: 'POST',
  });
}

export function recoverAccountState(accountId: number) {
  return adminFetch(`/api/v1/admin/accounts/${accountId}/recover-state`, {
    method: 'POST',
  });
}

export function syncAccountModels(accountId: number) {
  return adminFetch(`/api/v1/admin/accounts/${accountId}/models/sync-upstream`, {
    method: 'POST',
  });
}

export function setAccountSchedulable(accountId: number, schedulable: boolean) {
  return adminFetch<AdminAccount>(`/api/v1/admin/accounts/${accountId}/schedulable`, {
    method: 'POST',
    body: JSON.stringify({ schedulable }),
  });
}

export function batchRefreshAccounts(accountIds: number[]) {
  return adminFetch('/api/v1/admin/accounts/batch-refresh', {
    method: 'POST',
    body: JSON.stringify({ account_ids: accountIds }),
  });
}

export function batchClearAccountErrors(accountIds: number[]) {
  return adminFetch('/api/v1/admin/accounts/batch-clear-error', {
    method: 'POST',
    body: JSON.stringify({ account_ids: accountIds }),
  });
}

export function getOpsDashboardOverview(params: OpsQueryParams = {}) {
  return adminFetchWithOptionalQuery<OpsDashboardOverview>('/api/v1/admin/ops/dashboard/overview', params);
}

export function getOpsDashboardSnapshot(params: OpsQueryParams = {}) {
  return adminFetchWithOptionalQuery<OpsDashboardSnapshot>('/api/v1/admin/ops/dashboard/snapshot-v2', params);
}

export function getOpsRealtimeTraffic(params: Pick<OpsQueryParams, 'window' | 'platform' | 'group_id'> = {}) {
  return adminFetchWithOptionalQuery<Record<string, unknown>>('/api/v1/admin/ops/realtime-traffic', params);
}

export function getOpsConcurrency(params: Pick<OpsQueryParams, 'platform' | 'group_id'> = {}) {
  return adminFetchWithOptionalQuery<Record<string, unknown>>('/api/v1/admin/ops/concurrency', params);
}

export function getOpsUserConcurrency() {
  return adminFetch<Record<string, unknown>>('/api/v1/admin/ops/user-concurrency');
}

export function getOpsAccountAvailability() {
  return adminFetch<Record<string, unknown>>('/api/v1/admin/ops/account-availability');
}

export function getOpsOpenAiTokenStats(params: OpsQueryParams = {}) {
  return adminFetchWithOptionalQuery<Record<string, unknown>>('/api/v1/admin/ops/dashboard/openai-token-stats', params);
}

export function getOpsRuntimeAlert() {
  return adminFetch<Record<string, unknown>>('/api/v1/admin/ops/runtime/alert');
}

export function getOpsRequests(params: { page?: number; page_size?: number; search?: string } = {}) {
  return adminFetchWithOptionalQuery<PaginatedData<OpsRecord>>('/api/v1/admin/ops/requests', params);
}

export function getOpsRequestErrors(params: { page?: number; page_size?: number; status?: string; search?: string } = {}) {
  return adminFetchWithOptionalQuery<PaginatedData<OpsRecord>>('/api/v1/admin/ops/request-errors', params);
}

export function resolveOpsRequestError(errorId: number | string) {
  return adminFetch(`/api/v1/admin/ops/request-errors/${errorId}/resolve`, {
    method: 'PUT',
    body: JSON.stringify({ resolved: true }),
  });
}

export function resolveOpsError(errorId: number | string) {
  return adminFetch(`/api/v1/admin/ops/errors/${errorId}/resolve`, {
    method: 'PUT',
    body: JSON.stringify({ resolved: true }),
  });
}

export function getOpsUpstreamErrors(params: { page?: number; page_size?: number; status?: string; search?: string } = {}) {
  return adminFetchWithOptionalQuery<PaginatedData<OpsRecord>>('/api/v1/admin/ops/upstream-errors', params);
}

export function resolveOpsUpstreamError(errorId: number | string) {
  return adminFetch(`/api/v1/admin/ops/upstream-errors/${errorId}/resolve`, {
    method: 'PUT',
    body: JSON.stringify({ resolved: true }),
  });
}

export function getOpsSystemLogs(params: OpsQueryParams = {}) {
  return adminFetchWithOptionalQuery<PaginatedData<OpsRecord>>('/api/v1/admin/ops/system-logs', params);
}

export function getOpsSystemLogsHealth() {
  return adminFetch<Record<string, unknown>>('/api/v1/admin/ops/system-logs/health');
}

export function cleanupOpsSystemLogs() {
  return adminFetch('/api/v1/admin/ops/system-logs/cleanup', {
    method: 'POST',
  });
}

export function getOpsAlertEvents(params: OpsQueryParams = {}) {
  return adminFetchWithOptionalQuery<PaginatedData<OpsRecord>>('/api/v1/admin/ops/alert-events', params);
}

export function updateOpsAlertEventStatus(eventId: number | string, status: string) {
  return adminFetch(`/api/v1/admin/ops/alert-events/${eventId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

export function getOpsErrorTrend(params: OpsQueryParams = {}) {
  return adminFetchWithOptionalQuery<{ trend?: OpsMetricPoint[]; items?: OpsMetricPoint[] }>('/api/v1/admin/ops/dashboard/error-trend', params);
}

export function getOpsErrors(params: { page?: number; page_size?: number; status?: string; search?: string } = {}) {
  return adminFetchWithOptionalQuery<PaginatedData<OpsRecord>>('/api/v1/admin/ops/errors', params);
}

export function getOpsErrorDistribution(params: OpsQueryParams = {}) {
  return adminFetchWithOptionalQuery<{ distribution?: OpsMetricPoint[]; items?: OpsMetricPoint[] }>('/api/v1/admin/ops/dashboard/error-distribution', params);
}

export function getOpsLatencyHistogram(params: OpsQueryParams = {}) {
  return adminFetchWithOptionalQuery<{ histogram?: OpsMetricPoint[]; items?: OpsMetricPoint[] }>('/api/v1/admin/ops/dashboard/latency-histogram', params);
}

export function getOpsThroughputTrend(params: OpsQueryParams = {}) {
  return adminFetchWithOptionalQuery<{ trend?: OpsMetricPoint[]; items?: OpsMetricPoint[] }>('/api/v1/admin/ops/dashboard/throughput-trend', params);
}

export function getSystemVersion() {
  return adminFetch<Record<string, unknown>>('/api/v1/admin/system/version');
}
