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

function keyMatchesSearch(item: AdminApiKey, search: string) {
  if (!search) return true;

  const normalized = search.toLowerCase();
  const haystack = [
    item.name,
    item.key,
    item.status,
    item.group?.name,
    item.group_id,
    item.user?.email,
    item.user?.username,
    item.user_id,
  ].filter(Boolean).join(' ').toLowerCase();

  return haystack.includes(normalized);
}

function normalizeAdminApiKey(raw: AdminApiKey | Record<string, unknown>, owner?: AdminUser): AdminApiKey {
  const source = raw as Record<string, unknown>;
  const id = firstNumberField(source, ['id', 'api_key_id', 'apiKeyId', 'key_id', 'keyId']) ?? 0;
  const userId = firstNumberField(source, ['user_id', 'userId', 'owner_id', 'ownerId']) ?? owner?.id ?? 0;
  const groupId = firstNumberField(source, ['group_id', 'groupId']);
  const key = firstStringField(source, ['key', 'api_key', 'apiKey', 'key_value', 'keyValue', 'token', 'value']) ?? '';
  const name = firstStringField(source, ['name', 'label', 'title', 'remark', 'description']) || (key ? `Key ${key.slice(0, 8)}` : `Key #${id || '--'}`);
  const enabled = firstBooleanField(source, ['enabled', 'is_active', 'isActive', 'active']);
  const status = firstStringField(source, ['status', 'state']) || (enabled === false ? 'disabled' : 'active');
  const quota = firstNumberField(source, ['quota', 'quota_limit', 'quotaLimit', 'limit', 'total_quota']) ?? 0;
  const quotaUsed = firstNumberField(source, ['quota_used', 'quotaUsed', 'used_quota', 'usedQuota', 'usage', 'used']) ?? 0;
  const rawUser = isRecord(source.user) ? source.user : undefined;
  const rawGroup = isRecord(source.group) ? source.group : undefined;

  return {
    ...(raw as AdminApiKey),
    id,
    user_id: userId,
    key,
    name,
    group_id: groupId ?? ((raw as AdminApiKey).group_id ?? null),
    status,
    quota,
    quota_used: quotaUsed,
    last_used_at: firstStringField(source, ['last_used_at', 'lastUsedAt', 'last_used', 'lastUsed']) ?? (raw as AdminApiKey).last_used_at,
    expires_at: firstStringField(source, ['expires_at', 'expiresAt', 'expired_at', 'expiredAt']) ?? (raw as AdminApiKey).expires_at,
    created_at: firstStringField(source, ['created_at', 'createdAt', 'created']) ?? (raw as AdminApiKey).created_at,
    updated_at: firstStringField(source, ['updated_at', 'updatedAt', 'modified_at', 'modifiedAt']) ?? (raw as AdminApiKey).updated_at,
    usage_5h: firstNumberField(source, ['usage_5h', 'usage5h', 'usage_5_hours']),
    usage_1d: firstNumberField(source, ['usage_1d', 'usage1d', 'usage_today', 'today_usage']),
    usage_7d: firstNumberField(source, ['usage_7d', 'usage7d', 'usage_week', 'weekly_usage']),
    group: (raw as AdminApiKey).group ?? (rawGroup as AdminGroup | undefined),
    user: (raw as AdminApiKey).user ?? {
      id: userId,
      email: firstStringField(rawUser, ['email']) ?? owner?.email,
      username: firstStringField(rawUser, ['username', 'name']) ?? owner?.username,
    },
  };
}

async function listApiKeysFromUsers(search: string): Promise<PaginatedData<AdminApiKey>> {
  const usersPayload = await adminFetch<unknown>('/api/v1/admin/users');
  const users = toPaginatedData<AdminUser>(usersPayload, ['users']).items;
  const keyGroups = await Promise.all(
    users.map(async (user) => {
      try {
        const payload = await adminFetch<unknown>(`/api/v1/admin/users/${user.id}/api-keys`);
        return toPaginatedData<AdminApiKey>(payload, ['api_keys', 'apiKeys', 'keys']).items.map((item) => normalizeAdminApiKey(item, user));
      } catch {
        return [] as AdminApiKey[];
      }
    })
  );
  const items = keyGroups.flat().filter((item) => item.id || item.key).filter((item) => keyMatchesSearch(item, search));

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

export function listUserApiKeys(userId: number) {
  return adminFetch<PaginatedData<AdminApiKey>>(`/api/v1/admin/users/${userId}/api-keys`);
}

export async function searchAdminApiKeys(search = '') {
  const keyword = search.trim();
  let directError: unknown;

  try {
    const payload = await adminFetch<unknown>('/api/v1/admin/usage/search-api-keys');
    const direct = toPaginatedData<AdminApiKey>(payload, ['api_keys', 'apiKeys', 'keys']);
    const items = direct.items.map((item) => normalizeAdminApiKey(item)).filter((item) => item.id || item.key).filter((item) => keyMatchesSearch(item, keyword));

    if (items.length > 0) {
      return {
        ...direct,
        items,
        total: items.length,
        page: 1,
        page_size: Math.max(items.length, 1),
        pages: 1,
      };
    }
  } catch (error) {
    directError = error;
  }

  try {
    return await listApiKeysFromUsers(keyword);
  } catch (error) {
    if (directError) {
      throw directError;
    }

    throw error;
  }
}

export function updateAdminApiKey(apiKeyId: number, body: UpdateApiKeyRequest) {
  return adminFetch<AdminApiKey>(`/api/v1/admin/api-keys/${apiKeyId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
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

export function getOpsDashboardOverview() {
  return adminFetch<OpsDashboardOverview>('/api/v1/admin/ops/dashboard/overview');
}

export function getOpsDashboardSnapshot() {
  return adminFetch<OpsDashboardSnapshot>('/api/v1/admin/ops/dashboard/snapshot-v2');
}

export function getOpsRealtimeTraffic() {
  return adminFetch<Record<string, unknown>>('/api/v1/admin/ops/realtime-traffic');
}

export function getOpsConcurrency() {
  return adminFetch<Record<string, unknown>>('/api/v1/admin/ops/concurrency');
}

export function getOpsUserConcurrency() {
  return adminFetch<Record<string, unknown>>('/api/v1/admin/ops/user-concurrency');
}

export function getOpsAccountAvailability() {
  return adminFetch<Record<string, unknown>>('/api/v1/admin/ops/account-availability');
}

export function getOpsOpenAiTokenStats() {
  return adminFetch<Record<string, unknown>>('/api/v1/admin/ops/dashboard/openai-token-stats');
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

export function getOpsSystemLogs(params: { page?: number; page_size?: number; level?: string; search?: string } = {}) {
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

export function getOpsAlertEvents(params: { page?: number; page_size?: number; status?: string } = {}) {
  return adminFetchWithOptionalQuery<PaginatedData<OpsRecord>>('/api/v1/admin/ops/alert-events', params);
}

export function updateOpsAlertEventStatus(eventId: number | string, status: string) {
  return adminFetch(`/api/v1/admin/ops/alert-events/${eventId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

export function getOpsErrorTrend() {
  return adminFetch<{ trend?: OpsMetricPoint[]; items?: OpsMetricPoint[] }>('/api/v1/admin/ops/dashboard/error-trend');
}

export function getOpsErrors(params: { page?: number; page_size?: number; status?: string; search?: string } = {}) {
  return adminFetchWithOptionalQuery<PaginatedData<OpsRecord>>('/api/v1/admin/ops/errors', params);
}

export function getOpsErrorDistribution() {
  return adminFetch<{ distribution?: OpsMetricPoint[]; items?: OpsMetricPoint[] }>('/api/v1/admin/ops/dashboard/error-distribution');
}

export function getOpsLatencyHistogram() {
  return adminFetch<{ histogram?: OpsMetricPoint[]; items?: OpsMetricPoint[] }>('/api/v1/admin/ops/dashboard/latency-histogram');
}

export function getOpsThroughputTrend() {
  return adminFetch<{ trend?: OpsMetricPoint[]; items?: OpsMetricPoint[] }>('/api/v1/admin/ops/dashboard/throughput-trend');
}

export function getSystemVersion() {
  return adminFetch<Record<string, unknown>>('/api/v1/admin/system/version');
}
