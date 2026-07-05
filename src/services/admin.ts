import { adminFetch } from '@/src/lib/admin-fetch';
import type {
  AccountTodayStats,
  AdminAccount,
  AdminApiKey,
  AdminGroup,
  AdminSettings,
  AdminUser,
  BalanceOperation,
  CreateApiKeyRequest,
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
  return adminFetch<PaginatedData<AdminApiKey>>(`/api/v1/admin/users/${userId}/api-keys${buildQuery({ page: 1, page_size: 100 })}`);
}

export function searchAdminApiKeys(search = '') {
  const keyword = search.trim();
  return adminFetch<PaginatedData<AdminApiKey>>(
    `/api/v1/admin/usage/search-api-keys${buildQuery({ page: 1, page_size: 100, search: keyword, keyword })}`
  );
}

export function createUserApiKey(userId: number, body: CreateApiKeyRequest) {
  return adminFetch<AdminApiKey>(`/api/v1/admin/users/${userId}/api-keys`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateAdminApiKey(apiKeyId: number, body: UpdateApiKeyRequest) {
  return adminFetch<AdminApiKey>(`/api/v1/admin/api-keys/${apiKeyId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function deleteAdminApiKey(apiKeyId: number) {
  return adminFetch(`/api/v1/admin/api-keys/${apiKeyId}`, {
    method: 'DELETE',
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
  return adminFetch<PaginatedData<AdminAccount>>(
    `/api/v1/admin/accounts${buildQuery({ page: 1, page_size: 20, search: search.trim() })}`
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

export function getAccountStats(accountId: number, params?: { start_date?: string; end_date?: string; granularity?: 'day' | 'hour' }) {
  return adminFetch<UsageStats>(`/api/v1/admin/accounts/${accountId}/stats${buildQuery(params ?? {})}`);
}

export function getAccountUsage(accountId: number, params?: { start_date?: string; end_date?: string; granularity?: 'day' | 'hour' }) {
  return adminFetch<{ items?: OpsRecord[]; usage?: OpsRecord[]; total?: number }>(
    `/api/v1/admin/accounts/${accountId}/usage${buildQuery(params ?? {})}`
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

export function setAccountTempUnschedulable(accountId: number, seconds?: number) {
  return adminFetch(`/api/v1/admin/accounts/${accountId}/temp-unschedulable`, {
    method: 'POST',
    body: JSON.stringify({ seconds }),
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
    body: JSON.stringify({ account_ids: accountIds, ids: accountIds }),
  });
}

export function batchClearAccountErrors(accountIds: number[]) {
  return adminFetch('/api/v1/admin/accounts/batch-clear-error', {
    method: 'POST',
    body: JSON.stringify({ account_ids: accountIds, ids: accountIds }),
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

export function getOpsRequests(params: { page?: number; page_size?: number; search?: string } = {}) {
  return adminFetch<PaginatedData<OpsRecord>>(
    `/api/v1/admin/ops/requests${buildQuery({ page: params.page ?? 1, page_size: params.page_size ?? 20, search: params.search?.trim() })}`
  );
}

export function getOpsRequestErrors(params: { page?: number; page_size?: number; status?: string; search?: string } = {}) {
  return adminFetch<PaginatedData<OpsRecord>>(
    `/api/v1/admin/ops/request-errors${buildQuery({
      page: params.page ?? 1,
      page_size: params.page_size ?? 20,
      status: params.status,
      search: params.search?.trim(),
    })}`
  );
}

export function resolveOpsRequestError(errorId: number | string) {
  return adminFetch(`/api/v1/admin/ops/request-errors/${errorId}/resolve`, {
    method: 'POST',
  });
}

export function getOpsUpstreamErrors(params: { page?: number; page_size?: number; status?: string; search?: string } = {}) {
  return adminFetch<PaginatedData<OpsRecord>>(
    `/api/v1/admin/ops/upstream-errors${buildQuery({
      page: params.page ?? 1,
      page_size: params.page_size ?? 20,
      status: params.status,
      search: params.search?.trim(),
    })}`
  );
}

export function resolveOpsUpstreamError(errorId: number | string) {
  return adminFetch(`/api/v1/admin/ops/upstream-errors/${errorId}/resolve`, {
    method: 'POST',
  });
}

export function getOpsSystemLogs(params: { page?: number; page_size?: number; level?: string; search?: string } = {}) {
  return adminFetch<PaginatedData<OpsRecord>>(
    `/api/v1/admin/ops/system-logs${buildQuery({
      page: params.page ?? 1,
      page_size: params.page_size ?? 20,
      level: params.level,
      search: params.search?.trim(),
    })}`
  );
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
  return adminFetch<PaginatedData<OpsRecord>>(
    `/api/v1/admin/ops/alert-events${buildQuery({
      page: params.page ?? 1,
      page_size: params.page_size ?? 20,
      status: params.status,
    })}`
  );
}

export function updateOpsAlertEventStatus(eventId: number | string, status: string) {
  return adminFetch(`/api/v1/admin/ops/alert-events/${eventId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
}

export function getOpsErrorTrend() {
  return adminFetch<{ trend?: OpsMetricPoint[]; items?: OpsMetricPoint[] }>('/api/v1/admin/ops/dashboard/error-trend');
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
