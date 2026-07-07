import { adminFetch } from '@/src/lib/admin-fetch';
import type {
  AccountTodayStats,
  AccountBulkUpdateRequest,
  AccountDataImportResult,
  AccountListParams,
  AdminAccount,
  AdminAccountModel,
  AdminApiKey,
  AdminGroup,
  AdminSettings,
  AdminUsageListParams,
  AdminUsageRecord,
  AdminUser,
  BalanceOperation,
  CreateUsageCleanupTaskRequest,
  DashboardModelStats,
  DashboardSnapshot,
  DashboardStats,
  DashboardTrend,
  CreateApiKeyRequest,
  CreateAccountRequest,
  CreateUserRequest,
  GroupCapacitySummary,
  GroupListParams,
  GroupRequest,
  GroupUsageSummary,
  OpsDashboardOverview,
  OpsDashboardSnapshot,
  OpsMetricPoint,
  OpsRecord,
  PaginatedData,
  UpdateAccountRequest,
  UpdateApiKeyRequest,
  UsageStats,
  UsageCleanupTask,
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

function parseNumberLike(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const normalized = trimmed.replace(/,/g, '').replace(/％$/, '%');
  const direct = normalized.replace(/%$/, '');
  if (Number.isFinite(Number(direct))) return Number(direct);

  const match = normalized.match(/[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?\s*([kKmMbBtT万亿])?/);
  if (!match) return undefined;

  const number = Number(match[0].replace(/[^0-9.+\-eE]/g, ''));
  if (!Number.isFinite(number)) return undefined;

  const suffix = match[1]?.toLowerCase();
  const multiplier =
    suffix === 'k' ? 1_000
    : suffix === 'm' ? 1_000_000
    : suffix === 'b' ? 1_000_000_000
    : suffix === 't' ? 1_000_000_000_000
    : suffix === '万' ? 10_000
    : suffix === '亿' ? 100_000_000
    : 1;

  return number * multiplier;
}

function firstNumberField(source: unknown, keys: string[]): number | undefined {
  if (!isRecord(source)) return undefined;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = parseNumberLike(value);
      if (parsed !== undefined) return parsed;
    }
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
  start?: string;
  end?: string;
  interval?: string;
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
  view?: string;
  sort_by?: string;
  sort_order?: string;
  model?: string;
  account_id?: number;
  user_id?: number;
  api_key_id?: number;
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

export function listAdminUsage(params: AdminUsageListParams = {}) {
  return adminFetch<PaginatedData<AdminUsageRecord>>(
    `/api/v1/admin/usage${buildQuery({
      page: params.page ?? 1,
      page_size: params.page_size ?? 20,
      exact_total: params.exact_total,
      start_date: params.start_date,
      end_date: params.end_date,
      user_id: params.user_id,
      api_key_id: params.api_key_id,
      account_id: params.account_id,
      group_id: params.group_id,
      model: params.model,
      request_type: params.request_type,
      stream: params.stream,
      billing_type: params.billing_type,
      billing_mode: params.billing_mode,
      sort_by: params.sort_by ?? 'created_at',
      sort_order: params.sort_order ?? 'desc',
      timezone: params.timezone,
    })}`
  );
}

export function getAdminUsageStats(params: AdminUsageListParams = {}) {
  return adminFetch<UsageStats>(
    `/api/v1/admin/usage/stats${buildQuery({
      start_date: params.start_date,
      end_date: params.end_date,
      user_id: params.user_id,
      api_key_id: params.api_key_id,
      account_id: params.account_id,
      group_id: params.group_id,
      model: params.model,
      request_type: params.request_type,
      stream: params.stream,
      billing_type: params.billing_type,
      billing_mode: params.billing_mode,
      nocache: params.nocache,
      timezone: params.timezone,
    })}`
  );
}

export function searchUsageUsers(q = '') {
  return adminFetch<AdminUser[]>(`/api/v1/admin/usage/search-users${buildQuery({ q: q.trim() })}`);
}

export function searchUsageApiKeys(params: { user_id?: number; q?: string } = {}) {
  return adminFetch<AdminApiKey[]>(
    `/api/v1/admin/usage/search-api-keys${buildQuery({ user_id: params.user_id, q: params.q?.trim() })}`
  );
}

export function listUsageCleanupTasks(params: { page?: number; page_size?: number; timezone?: string } = {}) {
  return adminFetch<PaginatedData<UsageCleanupTask>>(
    `/api/v1/admin/usage/cleanup-tasks${buildQuery({
      page: params.page ?? 1,
      page_size: params.page_size ?? 5,
      timezone: params.timezone,
    })}`
  );
}

export function createUsageCleanupTask(body: CreateUsageCleanupTaskRequest) {
  return adminFetch<UsageCleanupTask>('/api/v1/admin/usage/cleanup-tasks', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function cancelUsageCleanupTask(taskId: number | string) {
  return adminFetch<UsageCleanupTask>(`/api/v1/admin/usage/cleanup-tasks/${taskId}/cancel`, {
    method: 'POST',
  });
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

export function listGroups(params: string | GroupListParams = '') {
  const query = typeof params === 'string'
    ? { page: 1, page_size: 20, search: params.trim(), sort_by: 'sort_order', sort_order: 'asc' }
    : {
        page: params.page ?? 1,
        page_size: params.page_size ?? 50,
        search: params.search?.trim(),
        platform: params.platform,
        status: params.status,
        is_exclusive: params.is_exclusive ?? undefined,
        sort_by: params.sort_by ?? 'sort_order',
        sort_order: params.sort_order ?? 'asc',
      };

  return adminFetch<PaginatedData<AdminGroup>>(
    `/api/v1/admin/groups${buildQuery(query)}`
  );
}

export function listAllGroups(params: { platform?: string; include_inactive?: boolean } = {}) {
  return adminFetch<AdminGroup[]>(
    `/api/v1/admin/groups/all${buildQuery(params)}`
  );
}

export function getGroup(groupId: number) {
  return adminFetch<AdminGroup>(`/api/v1/admin/groups/${groupId}`);
}

export function createGroup(body: GroupRequest) {
  return adminFetch<AdminGroup>('/api/v1/admin/groups', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateGroup(groupId: number, body: Partial<GroupRequest>) {
  return adminFetch<AdminGroup>(`/api/v1/admin/groups/${groupId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function deleteGroup(groupId: number) {
  return adminFetch(`/api/v1/admin/groups/${groupId}`, {
    method: 'DELETE',
  });
}

export function updateGroupSortOrder(updates: Array<{ id: number; sort_order: number }>) {
  return adminFetch('/api/v1/admin/groups/sort-order', {
    method: 'PUT',
    body: JSON.stringify({ updates }),
  });
}

export function getGroupUsageSummary(timezone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  return adminFetch<GroupUsageSummary[]>(`/api/v1/admin/groups/usage-summary${buildQuery({ timezone })}`);
}

export function getGroupCapacitySummary() {
  return adminFetch<GroupCapacitySummary[]>('/api/v1/admin/groups/capacity-summary');
}

export function getGroupStats(groupId: number) {
  return adminFetch<Record<string, unknown>>(`/api/v1/admin/groups/${groupId}/stats`);
}

export function getGroupModelsListCandidates(groupId: number, platform?: string) {
  return adminFetch<{ models?: unknown[] }>(
    `/api/v1/admin/groups/${groupId}/models-list-candidates${buildQuery({ platform })}`
  );
}

export function getGroupApiKeys(groupId: number, page = 1, pageSize = 20) {
  return adminFetch<PaginatedData<AdminApiKey>>(
    `/api/v1/admin/groups/${groupId}/api-keys${buildQuery({ page, page_size: pageSize })}`
  );
}

export function getGroupRateMultipliers(groupId: number) {
  return adminFetch<Array<Record<string, unknown>>>(`/api/v1/admin/groups/${groupId}/rate-multipliers`);
}

export function batchSetGroupRateMultipliers(groupId: number, entries: Array<{ user_id: number; rate_multiplier: number | null }>) {
  return adminFetch(`/api/v1/admin/groups/${groupId}/rate-multipliers`, {
    method: 'PUT',
    body: JSON.stringify({ entries }),
  });
}

export function clearGroupRateMultipliers(groupId: number) {
  return adminFetch(`/api/v1/admin/groups/${groupId}/rate-multipliers`, {
    method: 'DELETE',
  });
}

export function batchSetGroupRpmOverrides(groupId: number, entries: Array<{ user_id: number; rpm_override: number | null }>) {
  return adminFetch(`/api/v1/admin/groups/${groupId}/rpm-overrides`, {
    method: 'PUT',
    body: JSON.stringify({ entries }),
  });
}

export function clearGroupRpmOverrides(groupId: number) {
  return adminFetch(`/api/v1/admin/groups/${groupId}/rpm-overrides`, {
    method: 'DELETE',
  });
}

export async function listAccounts(params: string | AccountListParams = '') {
  const query = typeof params === 'string'
    ? {
        page: 1,
        page_size: 100,
        search: params.trim(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }
    : {
        page: params.page ?? 1,
        page_size: params.page_size ?? 100,
        platform: params.platform,
        type: params.type,
        status: params.status,
        group: params.group,
        privacy_mode: params.privacy_mode,
        search: params.search?.trim(),
        sort_by: params.sort_by,
        sort_order: params.sort_order,
        timezone: params.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      };

  const payload = await adminFetch<unknown>(
    `/api/v1/admin/accounts${buildQuery(query)}`
  );

  return toPaginatedData<AdminAccount>(payload, ['accounts', 'items', 'data']);
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

export function checkAccountMixedChannelRisk(body: { platform: string; group_ids?: number[] }) {
  return adminFetch<Record<string, unknown>>('/api/v1/admin/accounts/check-mixed-channel', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function applyAccountOAuthCredentials(
  accountId: number,
  body: {
    access_token: string;
    refresh_token?: string;
    expires_at?: string | number | null;
    client_id?: string;
    account_id?: string;
    email?: string;
  }
) {
  return adminFetch<AdminAccount>(`/api/v1/admin/accounts/${accountId}/apply-oauth-credentials`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getAccountTempUnschedulable(accountId: number) {
  return adminFetch<Record<string, unknown>>(`/api/v1/admin/accounts/${accountId}/temp-unschedulable`);
}

export function clearAccountTempUnschedulable(accountId: number) {
  return adminFetch(`/api/v1/admin/accounts/${accountId}/temp-unschedulable`, {
    method: 'DELETE',
  });
}

export function batchCreateAccounts(accounts: CreateAccountRequest[]) {
  return adminFetch<{ accounts?: AdminAccount[]; items?: AdminAccount[]; created?: number; errors?: unknown[] }>(
    '/api/v1/admin/accounts/batch',
    {
      method: 'POST',
      body: JSON.stringify({ accounts }),
    }
  );
}

export function batchUpdateAccountCredentials(body: {
  account_ids: number[];
  credentials: Record<string, unknown>;
  extra?: Record<string, unknown>;
}) {
  return adminFetch('/api/v1/admin/accounts/batch-update-credentials', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function bulkUpdateAccounts(body: AccountBulkUpdateRequest) {
  return adminFetch('/api/v1/admin/accounts/bulk-update', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function normalizeAccountTodayStats(source: unknown): AccountTodayStats {
  const cost = firstNumberField(source, ['cost', 'actual_cost', 'actualCost', 'account_cost', 'accountCost']) ?? 0;

  return {
    requests: firstNumberField(source, ['requests', 'request_count', 'requestCount']) ?? 0,
    tokens: firstNumberField(source, ['tokens', 'total_tokens', 'totalTokens']) ?? 0,
    cost,
    standard_cost: firstNumberField(source, ['standard_cost', 'standardCost']) ?? 0,
    user_cost: firstNumberField(source, ['user_cost', 'userCost']) ?? cost,
  };
}

function hasAccountTodayStatsShape(value: unknown) {
  if (!isRecord(value)) return false;
  return firstNumberField(value, [
    'account_id',
    'accountId',
    'requests',
    'tokens',
    'cost',
    'standard_cost',
    'user_cost',
  ]) !== undefined;
}

function extractAccountTodayStatsRows(payload: unknown): Record<string, unknown>[] {
  const items = extractItems<Record<string, unknown>>(payload, ['stats', 'items', 'accounts', 'records', 'rows']);
  if (items.length > 0) return items;
  if (!isRecord(payload)) return [];

  for (const key of ['data', 'stats', 'items', 'accounts', 'records', 'rows', 'payload', 'result', 'response']) {
    const nested = extractAccountTodayStatsRows(payload[key]);
    if (nested.length > 0) return nested;
  }

  return Object.entries(payload)
    .filter(([, value]) => hasAccountTodayStatsShape(value))
    .map(([key, value]) => {
      const row = value as Record<string, unknown>;
      const accountId = firstNumberField(row, ['account_id', 'accountId', 'id']) ?? Number(key);
      return Number.isFinite(accountId) && accountId > 0 && row.account_id === undefined
        ? { ...row, account_id: accountId }
        : row;
    });
}

function normalizeUsageStats(payload: unknown): UsageStats {
  const directRequests = firstNumberField(payload, ['total_requests', 'totalRequests']);
  const directTokens = firstNumberField(payload, ['total_tokens', 'totalTokens']);
  const directCost = firstNumberField(payload, ['total_account_cost', 'totalAccountCost', 'total_actual_cost', 'totalActualCost', 'total_cost', 'totalCost']);

  if (directRequests !== undefined || directTokens !== undefined || directCost !== undefined) {
    return {
      total_requests: directRequests ?? firstNumberField(payload, ['requests', 'request_count', 'requestCount']) ?? 0,
      total_tokens: directTokens ?? firstNumberField(payload, ['tokens', 'token_consumed', 'tokenConsumed']) ?? 0,
      total_input_tokens: firstNumberField(payload, ['total_input_tokens', 'totalInputTokens', 'input_tokens', 'inputTokens']),
      total_output_tokens: firstNumberField(payload, ['total_output_tokens', 'totalOutputTokens', 'output_tokens', 'outputTokens']),
      total_cost: directCost ?? firstNumberField(payload, ['cost', 'actual_cost', 'actualCost']) ?? 0,
      total_actual_cost: firstNumberField(payload, ['total_actual_cost', 'totalActualCost', 'actual_cost', 'actualCost']),
      total_account_cost: firstNumberField(payload, ['total_account_cost', 'totalAccountCost']),
      average_duration_ms: firstNumberField(payload, ['average_duration_ms', 'averageDurationMs', 'avg_duration_ms', 'avgDurationMs']),
    };
  }

  const rows = extractItems<Record<string, unknown>>(payload, ['stats', 'items', 'data', 'usage', 'usage_logs', 'usageLogs', 'records', 'rows']);
  const totals = rows.reduce<{
    requests: number;
    tokens: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    duration: number;
    durationCount: number;
  }>((current, row) => {
    const inputTokens = firstNumberField(row, ['input_tokens', 'inputTokens']) ?? 0;
    const outputTokens = firstNumberField(row, ['output_tokens', 'outputTokens']) ?? 0;
    const cacheCreationTokens = firstNumberField(row, ['cache_creation_tokens', 'cacheCreationTokens']) ?? 0;
    const cacheReadTokens = firstNumberField(row, ['cache_read_tokens', 'cacheReadTokens']) ?? 0;
    const rowTokens = firstNumberField(row, ['total_tokens', 'totalTokens', 'tokens', 'token_consumed', 'tokenConsumed'])
      ?? inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;

    return {
      requests: current.requests + (firstNumberField(row, ['total_requests', 'totalRequests', 'requests', 'request_count', 'requestCount', 'success_count', 'successCount']) ?? 0),
      tokens: current.tokens + rowTokens,
      inputTokens: current.inputTokens + inputTokens,
      outputTokens: current.outputTokens + outputTokens,
      cost: current.cost + (firstNumberField(row, ['total_account_cost', 'totalAccountCost', 'total_actual_cost', 'totalActualCost', 'total_cost', 'totalCost', 'actual_cost', 'actualCost', 'cost']) ?? 0),
      duration: current.duration + (firstNumberField(row, ['duration_ms', 'durationMs', 'average_duration_ms', 'averageDurationMs', 'avg_duration_ms', 'avgDurationMs']) ?? 0),
      durationCount: current.durationCount + (firstNumberField(row, ['duration_ms', 'durationMs', 'average_duration_ms', 'averageDurationMs', 'avg_duration_ms', 'avgDurationMs']) !== undefined ? 1 : 0),
    };
  }, { requests: 0, tokens: 0, inputTokens: 0, outputTokens: 0, cost: 0, duration: 0, durationCount: 0 });

  return {
    total_requests: totals.requests,
    total_tokens: totals.tokens,
    total_input_tokens: totals.inputTokens,
    total_output_tokens: totals.outputTokens,
    total_cost: totals.cost,
    total_actual_cost: totals.cost,
    total_account_cost: totals.cost,
    average_duration_ms: totals.durationCount > 0 ? totals.duration / totals.durationCount : undefined,
  };
}

export async function getAccountTodayStats(accountId: number) {
  const payload = await adminFetch<unknown>(`/api/v1/admin/accounts/${accountId}/today-stats`);
  return normalizeAccountTodayStats(payload);
}

export async function getAccountTodayStatsBatch(accountIds: number[]) {
  if (accountIds.length === 0) return {} as Record<number, AccountTodayStats>;

  const payload = await adminFetch<unknown>('/api/v1/admin/accounts/today-stats/batch', {
    method: 'POST',
    body: JSON.stringify({ account_ids: accountIds }),
  });
  const result: Record<number, AccountTodayStats> = {};
  extractAccountTodayStatsRows(payload).forEach((item) => {
    const accountId = firstNumberField(item, ['account_id', 'accountId', 'id']);
    if (accountId !== undefined) {
      result[accountId] = normalizeAccountTodayStats(item);
    }
  });

  const missingIds = accountIds.filter((accountId) => !result[accountId]);
  if (missingIds.length > 0) {
    const fallbackEntries = await Promise.all(
      missingIds.map(async (accountId) => {
        const stats = await getAccountTodayStats(accountId).catch(() => ({
          requests: 0,
          tokens: 0,
          cost: 0,
          standard_cost: 0,
          user_cost: 0,
        }));
        return [accountId, stats] as const;
      })
    );
    fallbackEntries.forEach(([accountId, stats]) => {
      result[accountId] = stats;
    });
  }

  return result;
}

export async function getAccountStats(accountId: number, params?: { days?: number }) {
  const payload = await adminFetch<unknown>(`/api/v1/admin/accounts/${accountId}/stats${buildQuery(params ?? {})}`);
  return normalizeUsageStats(payload);
}

export function getAccountUsage(accountId: number) {
  return adminFetch<{ items?: OpsRecord[]; usage?: OpsRecord[]; total?: number }>(
    `/api/v1/admin/accounts/${accountId}/usage`
  );
}

export async function getAccountModels(accountId: number) {
  const payload = await adminFetch<unknown>(`/api/v1/admin/accounts/${accountId}/models`);
  return { models: extractItems<AdminAccountModel>(payload, ['models', 'data', 'items']) };
}

function parseAccountTestStream(payload: unknown) {
  if (typeof payload !== 'string') return payload;

  const events = payload
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return undefined;
      }
    })
    .filter((event): event is Record<string, unknown> => Boolean(event));

  if (events.length === 0) return payload;

  const errorEvent = events.find((event) => event.type === 'error' || (event.type === 'test_complete' && (event.error || event.success === false)));
  if (errorEvent) {
    throw new Error(String(errorEvent.error || errorEvent.message || '测试失败'));
  }

  const completeEvent = events.find((event) => event.type === 'test_complete');
  const startEvent = events.find((event) => event.type === 'test_start');
  const content = events
    .filter((event) => event.type === 'content' && typeof event.text === 'string')
    .map((event) => event.text)
    .join('');

  return {
    success: completeEvent?.success !== false,
    model: firstStringField(startEvent, ['model']) ?? firstStringField(completeEvent, ['model']),
    text: content || undefined,
  };
}

export async function testAccount(accountId: number, params?: { modelId?: string; prompt?: string }) {
  const modelId = params?.modelId?.trim();
  const payload = await adminFetch<unknown>(`/api/v1/admin/accounts/${accountId}/test`, {
    method: 'POST',
    body: modelId ? JSON.stringify({ model_id: modelId, prompt: params?.prompt ?? '' }) : undefined,
  });
  return parseAccountTestStream(payload);
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

export function getOpenAiAccountQuota(accountId: number) {
  return adminFetch<Record<string, unknown>>(`/api/v1/admin/openai/accounts/${accountId}/quota`);
}

export function resetOpenAiAccountQuota(accountId: number) {
  return adminFetch<Record<string, unknown>>(`/api/v1/admin/openai/accounts/${accountId}/reset-quota`, {
    method: 'POST',
  });
}

export function getGrokAccountQuota(accountId: number) {
  return adminFetch<Record<string, unknown>>(`/api/v1/admin/grok/accounts/${accountId}/quota`);
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

export function previewSyncAccountModels(body: Record<string, unknown>) {
  return adminFetch<Record<string, unknown>>('/api/v1/admin/accounts/models/sync-upstream-preview', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function previewCrsAccountSync(body: { base_url: string; username: string; password: string }) {
  return adminFetch<Record<string, unknown>>('/api/v1/admin/accounts/sync/crs/preview', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function syncCrsAccounts(body: {
  base_url: string;
  username: string;
  password: string;
  sync_proxies?: boolean;
  selected_account_ids?: Array<string | number>;
}) {
  return adminFetch<Record<string, unknown>>('/api/v1/admin/accounts/sync/crs', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function exportAccountsData(params: AccountListParams & { ids?: number[] | string; include_proxies?: boolean } = {}) {
  const ids = Array.isArray(params.ids) ? params.ids.join(',') : params.ids;

  return adminFetch<Record<string, unknown>>(
    `/api/v1/admin/accounts/data${buildQuery({
      ids,
      platform: params.platform,
      type: params.type,
      status: params.status,
      group: params.group,
      privacy_mode: params.privacy_mode,
      search: params.search?.trim(),
      sort_by: params.sort_by,
      sort_order: params.sort_order,
      include_proxies: params.include_proxies,
    })}`
  );
}

export function importAccountsData(body: { data: Record<string, unknown>; skip_default_group_bind?: boolean }) {
  return adminFetch<AccountDataImportResult>('/api/v1/admin/accounts/data', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function importCodexSessionAccount(body: {
  content: string;
  name: string;
  notes?: string | null;
  proxy_id?: number | null;
  concurrency?: number;
  load_factor?: number | null;
  priority?: number;
  rate_multiplier?: number;
  group_ids?: number[];
  expires_at?: string | null;
  auto_pause_on_expired?: boolean;
  credential_extras?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  update_existing?: boolean;
}) {
  return adminFetch<Record<string, unknown>>('/api/v1/admin/accounts/import/codex-session', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function createAccountFromCodexPat(body: {
  access_token: string;
  name: string;
  notes?: string | null;
  proxy_id?: number | null;
  concurrency?: number;
  load_factor?: number | null;
  priority?: number;
  rate_multiplier?: number;
  group_ids?: number[];
  expires_at?: string | null;
  auto_pause_on_expired?: boolean;
  credential_extras?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}) {
  return adminFetch<Record<string, unknown>>('/api/v1/admin/openai/create-from-codex-pat', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getAntigravityDefaultModelMapping() {
  return adminFetch<Record<string, unknown>>('/api/v1/admin/accounts/antigravity/default-model-mapping');
}

export function refreshOpenAiToken(body: { refresh_token: string; proxy_id?: number; client_id?: string }) {
  return adminFetch<Record<string, unknown>>('/api/v1/admin/openai/refresh-token', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function revertAccountProxyFallback(accountId: number) {
  return adminFetch(`/api/v1/admin/accounts/${accountId}/revert-proxy-fallback`, {
    method: 'POST',
  });
}

export function setAccountPrivacy(accountId: number, body: { privacy_mode?: string; privacy?: boolean; enabled?: boolean } = {}) {
  return adminFetch<AdminAccount>(`/api/v1/admin/accounts/${accountId}/set-privacy`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function createShadowAccount(accountId: number, body: Record<string, unknown> = {}) {
  return adminFetch<AdminAccount>(`/api/v1/admin/accounts/${accountId}/shadow`, {
    method: 'POST',
    body: JSON.stringify(body),
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

export function getOpsUserConcurrency(params: Pick<OpsQueryParams, 'platform' | 'group_id'> = {}) {
  return adminFetchWithOptionalQuery<Record<string, unknown>>('/api/v1/admin/ops/user-concurrency', params);
}

export function getOpsAccountAvailability(params: Pick<OpsQueryParams, 'platform' | 'group_id'> = {}) {
  return adminFetchWithOptionalQuery<Record<string, unknown>>('/api/v1/admin/ops/account-availability', params);
}

export function getOpsOpenAiTokenStats(params: OpsQueryParams = {}) {
  return adminFetchWithOptionalQuery<Record<string, unknown>>('/api/v1/admin/ops/dashboard/openai-token-stats', params);
}

export function getOpsRuntimeAlert() {
  return adminFetch<Record<string, unknown>>('/api/v1/admin/ops/runtime/alert');
}

export function getOpsMetricThresholds() {
  return adminFetch<Record<string, unknown>>('/api/v1/admin/ops/settings/metric-thresholds');
}

export function getOpsRequests(params: OpsQueryParams = {}) {
  return adminFetchWithOptionalQuery<PaginatedData<OpsRecord>>('/api/v1/admin/ops/requests', params);
}

export function getOpsRequestErrors(params: OpsQueryParams = {}) {
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

export function getOpsUpstreamErrors(params: OpsQueryParams = {}) {
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

export function getOpsErrors(params: OpsQueryParams = {}) {
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
