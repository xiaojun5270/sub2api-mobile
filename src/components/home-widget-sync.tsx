import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { isAccountRateLimited } from '@/src/lib/account-status';
import { formatTokenValue } from '@/src/lib/formatters';
import { saveHomeWidgetSnapshot } from '@/src/lib/home-widget';
import {
  getAdminSettings,
  getDashboardSnapshot,
  getDashboardStats,
  getDashboardTrend,
  listAllAccounts,
} from '@/src/services/admin';
import { adminConfigState, hasAuthenticatedAdminSession } from '@/src/store/admin-config';
import type { AdminAccount } from '@/src/types/admin';

const { useSnapshot } = require('valtio/react');

type GroupUsageRow = {
  id: string;
  name: string;
  requests: number;
  tokens: number;
  actualCost: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function numberFrom(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const number = Number(value.replace(/,/g, ''));
      if (Number.isFinite(number)) return number;
    }
  }

  return 0;
}

function stringFrom(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }

  return undefined;
}

function normalizeGroupUsageRows(groups: unknown): GroupUsageRow[] {
  if (!Array.isArray(groups)) return [];

  return groups
    .map((item, index) => {
      if (!isRecord(item)) return undefined;

      const groupId = stringFrom(item, ['group_id', 'groupId', 'id']);
      const name = stringFrom(item, ['group_name', 'groupName', 'name', 'label']) ?? (groupId ? `分组 #${groupId}` : `分组 ${index + 1}`);

      return {
        id: groupId ?? `${name}-${index}`,
        name,
        requests: numberFrom(item, ['requests', 'total_requests', 'totalRequests', 'request_count', 'requestCount']),
        tokens: numberFrom(item, ['total_tokens', 'totalTokens', 'tokens', 'token_consumed', 'tokenConsumed']),
        actualCost: numberFrom(item, ['total_actual_cost', 'actual_cost', 'actualCost', 'actual', 'cost']),
      };
    })
    .filter((item): item is GroupUsageRow => Boolean(item))
    .sort((left, right) => right.tokens - left.tokens || right.actualCost - left.actualCost || right.requests - left.requests);
}

function hasAccountError(account: { status?: string; error?: string | null; error_message?: string | null }) {
  return Boolean(account.status === 'error' || account.error_message || account.error);
}

function isAccountNormal(account: AdminAccount) {
  if (hasAccountError(account) || isAccountRateLimited(account)) return false;

  const status = `${account.status ?? ''}`.toLowerCase();
  if (['inactive', 'disabled', 'paused', 'stop', 'stopped'].includes(status) || account.schedulable === false) return false;

  const extraPause = account.extra?.temp_unschedulable_until ?? account.extra?.tempUnschedulableUntil;
  const hasFuturePause = (value: unknown) => {
    if (typeof value !== 'string' || !value.trim()) return false;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) && timestamp > Date.now();
  };

  return !hasFuturePause(account.temp_unschedulable_until) && !hasFuturePause(extraPause);
}

function getTodayRange() {
  const now = new Date();
  const toDate = (value: Date) =>
    `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

  return {
    start_date: toDate(now),
    end_date: toDate(now),
    granularity: 'hour' as const,
  };
}

function formatNumber(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  return new Intl.NumberFormat('en-US').format(value);
}

function formatMoney(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  return `$${value.toFixed(2)}`;
}

function formatCompactNumber(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function formatWidgetUpdatedAt(value = new Date()) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(value);
}

async function syncHomeWidgetSnapshot() {
  const range = getTodayRange();
  const [settings, stats, trendResult, snapshotResult, accountsResult] = await Promise.all([
    getAdminSettings().catch(() => undefined),
    getDashboardStats(),
    getDashboardTrend(range).catch(() => undefined),
    getDashboardSnapshot({
      ...range,
      include_stats: false,
      include_trend: false,
      include_model_stats: false,
      include_group_stats: true,
    }).catch(() => undefined),
    listAllAccounts({ page_size: 100 }).catch(() => undefined),
  ]);

  const trend = trendResult?.trend ?? [];
  const accounts = accountsResult?.items ?? [];
  const groupUsageRows = normalizeGroupUsageRows(snapshotResult?.groups);
  const selectedTokenTotal = trend.reduce((sum, item) => sum + item.total_tokens, 0);
  const selectedCostTotal = trend.reduce((sum, item) => sum + item.cost, 0);
  const selectedOutputTotal = trend.reduce((sum, item) => sum + item.output_tokens, 0);
  const totalAccounts = stats.total_accounts ?? accountsResult?.total ?? accounts.length;
  const currentPageErrorAccounts = accounts.filter(hasAccountError).length;
  const currentPageLimitedAccounts = accounts.filter((item) => isAccountRateLimited(item)).length;
  const errorAccounts = Math.max(stats.error_accounts ?? 0, currentPageErrorAccounts);
  const normalAccounts = accounts.length > 0 ? accounts.filter(isAccountNormal).length : stats.normal_accounts ?? 0;
  const maxGroupTokens = Math.max(...groupUsageRows.map((item) => item.tokens), 0);

  await saveHomeWidgetSnapshot({
    version: 1,
    title: settings?.site_name?.trim() || 'Sub2API',
    rangeLabel: '今日',
    updatedAt: new Date().toISOString(),
    updatedAtLabel: formatWidgetUpdatedAt(),
    summary: {
      requests: {
        label: '今日请求',
        value: formatNumber(stats.today_requests),
        detail: `累计 ${formatNumber(stats.total_requests)}`,
      },
      tokens: {
        label: '今日 Token',
        value: formatTokenValue(selectedTokenTotal || stats.today_tokens),
        detail: `输出 ${formatTokenValue(selectedOutputTotal || stats.today_output_tokens || 0)}`,
      },
      cost: {
        label: '今日成本',
        value: formatMoney(selectedCostTotal || stats.today_cost),
        detail: `TPM ${formatNumber(stats.tpm)}`,
      },
      accounts: {
        label: '账号状态',
        value: `${formatNumber(normalAccounts)}/${formatNumber(totalAccounts)}`,
        detail: `异常 ${formatNumber(errorAccounts)} · 限流 ${formatNumber(currentPageLimitedAccounts)}`,
      },
    },
    groups: groupUsageRows.slice(0, 6).map((item) => ({
      id: item.id,
      name: item.name,
      requests: formatCompactNumber(item.requests),
      tokens: formatTokenValue(item.tokens),
      cost: formatMoney(item.actualCost),
      percent: maxGroupTokens > 0 ? Math.round((item.tokens / maxGroupTokens) * 100) : 0,
    })),
  });
}

export function HomeWidgetSync() {
  const config = useSnapshot(adminConfigState);
  const enabled = config.hydrated && hasAuthenticatedAdminSession(config);

  const { refetch } = useQuery({
    queryKey: ['home-widget-sync', config.activeAccountId, config.baseUrl],
    queryFn: syncHomeWidgetSnapshot,
    enabled,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: true,
    refetchOnMount: 'always',
    refetchOnReconnect: 'always',
    retry: 1,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!enabled) return undefined;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refetch();
      }
    });

    return () => subscription.remove();
  }, [enabled, refetch]);

  return null;
}
