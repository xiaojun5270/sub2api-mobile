import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Gauge, Hash, KeyRound, Pencil, Power, RotateCcw, Search, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import type { Edge } from 'react-native-safe-area-context';

import { ListCard } from '@/src/components/list-card';
import { ScreenShell } from '@/src/components/screen-shell';
import { useDebouncedValue } from '@/src/hooks/use-debounced-value';
import { formatCompactNumber, formatTokenValue } from '@/src/lib/formatters';
import { type AppTheme, useAppTheme } from '@/src/lib/theme';
import {
  batchClearAccountErrors,
  batchRefreshAccounts,
  deleteAccount,
  getAccountTodayStats,
  getAccountTodayStatsBatch,
  getAccountStats,
  getGrokAccountQuota,
  getOpenAiAccountQuota,
  listAccounts,
  resetAccountQuota,
  resetOpenAiAccountQuota,
  setAccountSchedulable,
  testAccount,
  updateAccount,
} from '@/src/services/admin';
import type { AdminAccount } from '@/src/types/admin';

type AccountStatusFilter = 'all' | 'active' | 'paused' | 'error';
type UsageSort = 'usage-desc' | 'usage-asc';
type AccountVisualStatus = {
  filterKey: AccountStatusFilter;
  label: '正常' | '暂停' | '异常';
  badgeTone: 'success' | 'muted' | 'danger';
};

type AccountTodaySummary = {
  requests: number;
  tokens: number;
  cost: number;
};

type AccountTotalSummary = {
  cost: number;
  requests: number;
  tokens: number;
};

type AccountQuotaMode = 'openai' | 'grok' | 'generic' | 'unsupported';

type AccountQuotaPanelState = {
  availableCount?: number;
  resetAt?: string | null;
  creditExpiresAt?: string | null;
  retryAfterSeconds?: number;
  entitlementStatus?: string;
  queriedAt?: string;
  error?: string;
};

type CodexWindowUsage = {
  label: '5h' | '7d';
  percent?: number;
  resetLabel: string;
};

function formatTime(value?: string | null) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return '操作失败，请稍后重试。';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function firstNumberValue(source: unknown, keys: string[]) {
  if (!isRecord(source)) return undefined;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const normalized = value.trim().replace(/%$/, '');
      if (Number.isFinite(Number(normalized))) return Number(normalized);
    }
  }

  return undefined;
}

function firstStringValue(source: unknown, keys: string[]) {
  if (!isRecord(source)) return undefined;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }

  return undefined;
}

function getExtraNumber(account: AdminAccount, keys: string[]) {
  return firstNumberValue(account.extra, keys);
}

function getExtraString(account: AdminAccount, keys: string[]) {
  return firstStringValue(account.extra, keys);
}

function normalizePercent(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const percent = value > 0 && value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, percent));
}

function formatPercent(value?: number) {
  if (value === undefined) return '--';
  return `${value >= 10 || value === 0 ? value.toFixed(0) : value.toFixed(1)}%`;
}

function formatRemainingSeconds(seconds?: number) {
  if (seconds === undefined || !Number.isFinite(seconds)) return undefined;
  if (seconds <= 0) return '现在';

  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) return restMinutes ? `${hours}h ${restMinutes}m` : `${hours}h`;

  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days}d ${restHours}h` : `${days}d`;
}

function formatResetLabel(resetAfterSeconds?: number, resetAt?: string) {
  const remaining = formatRemainingSeconds(resetAfterSeconds);
  if (remaining) return remaining === '现在' ? '现在' : `剩余 ${remaining}`;

  if (resetAt) {
    const resetTime = new Date(resetAt).getTime();
    if (!Number.isNaN(resetTime)) {
      return formatResetLabel(Math.ceil((resetTime - Date.now()) / 1000));
    }
  }

  return '--';
}

function getCodexWindowUsage(account: AdminAccount, windowKey: '5h' | '7d'): CodexWindowUsage {
  const prefix = windowKey === '5h' ? 'codex_5h' : 'codex_7d';
  const percent = normalizePercent(getExtraNumber(account, [`${prefix}_used_percent`, `${prefix}_usage_percent`]));
  const resetAfterSeconds = getExtraNumber(account, [`${prefix}_reset_after_seconds`, `${prefix}_resetAfterSeconds`]);
  const resetAt = getExtraString(account, [`${prefix}_reset_at`, `${prefix}_resetAt`]);

  return {
    label: windowKey,
    percent,
    resetLabel: formatResetLabel(resetAfterSeconds, resetAt),
  };
}

function hasQuotaConfig(account: AdminAccount) {
  return [
    'quota_limit',
    'quota_daily_limit',
    'quota_weekly_limit',
  ].some((key) => {
    const value = account.extra?.[key];
    if (typeof value === 'number') return value > 0;
    if (typeof value === 'string') return Number(value) > 0;
    return false;
  });
}

function getAccountQuotaMode(account: AdminAccount): AccountQuotaMode {
  const platform = `${account.platform || ''}`.toLowerCase();
  const type = `${account.type || ''}`.toLowerCase();

  if (platform.includes('grok') || platform.includes('xai')) return 'grok';
  if (platform.includes('openai') && type === 'oauth') return 'openai';
  if (type === 'apikey' || type === 'bedrock' || hasQuotaConfig(account)) return hasQuotaConfig(account) ? 'generic' : 'unsupported';
  return 'unsupported';
}

function getFirstCreditExpiresAt(source: unknown) {
  const credits = isRecord(source)
    ? isRecord(source.rate_limit_reset_credits)
      ? source.rate_limit_reset_credits.credits
      : undefined
    : undefined;

  if (!Array.isArray(credits)) return undefined;
  const firstCredit = credits.find(isRecord);
  return firstStringValue(firstCredit, ['expires_at', 'expiresAt']);
}

function parseQuotaInfo(source: unknown, mode: AccountQuotaMode): AccountQuotaPanelState {
  const resetCredits = isRecord(source) ? source.rate_limit_reset_credits : undefined;
  const snapshot = isRecord(source) ? source.snapshot : undefined;

  return {
    availableCount: firstNumberValue(resetCredits, ['available_count', 'availableCount', 'count', 'remaining']),
    resetAt: firstStringValue(source, ['reset_at', 'resetAt']) ?? null,
    creditExpiresAt: getFirstCreditExpiresAt(source) ?? null,
    retryAfterSeconds: firstNumberValue(snapshot, ['retry_after_seconds', 'retryAfterSeconds']),
    entitlementStatus: firstStringValue(snapshot, ['entitlement_status', 'entitlementStatus']),
    queriedAt: new Date().toISOString(),
    error: mode === 'grok' ? undefined : undefined,
  };
}

function getQuotaInfoText(info: AccountQuotaPanelState | undefined, mode: AccountQuotaMode, account: AdminAccount) {
  if (info?.error) return info.error;
  if (mode === 'openai') {
    if (info?.availableCount !== undefined) return `可重置 ${formatCompactNumber(info.availableCount)} 次`;
    return '先查询次数';
  }
  if (mode === 'grok') {
    if (info?.retryAfterSeconds !== undefined) return `等待 ${formatRemainingSeconds(info.retryAfterSeconds) ?? '--'}`;
    if (info?.entitlementStatus) return info.entitlementStatus;
    return '支持查询';
  }
  if (mode === 'generic') return hasQuotaConfig(account) ? '普通额度' : '未配置额度';
  return '暂无额度接口';
}

function getQuotaCountMessage(info: AccountQuotaPanelState, mode: AccountQuotaMode) {
  if (mode === 'openai') {
    const count = info.availableCount !== undefined ? formatCompactNumber(info.availableCount) : '--';
    const expires = info.creditExpiresAt ? `\n最近一次过期：${formatTime(info.creditExpiresAt)}` : '';
    const resetAt = info.resetAt ? `\n重置时间：${formatTime(info.resetAt)}` : '';
    return `可重置次数：${count}${expires}${resetAt}`;
  }

  if (mode === 'grok') {
    const wait = info.retryAfterSeconds !== undefined ? formatRemainingSeconds(info.retryAfterSeconds) : '--';
    return `权益状态：${info.entitlementStatus || '--'}\n等待恢复：${wait}`;
  }

  return '当前账号类型没有次数查询接口。';
}

function formatMoneyValue(value?: number) {
  const number = Number(value ?? 0);
  return `$${Number.isFinite(number) ? number.toFixed(2) : '0.00'}`;
}

function getAccountInlineTotalStats(account: AdminAccount): AccountTotalSummary | undefined {
  const cost = getExtraNumber(account, [
    'total_account_cost',
    'total_actual_cost',
    'total_cost',
    'quota_used',
    'used_quota',
    'total_usage',
    'usage_total',
    'lifetime_cost',
  ]);
  const requests = getExtraNumber(account, ['total_requests', 'request_count_total', 'requests_total']);
  const tokens = getExtraNumber(account, ['total_tokens', 'token_consumed_total', 'tokens_total']);

  if (cost === undefined && requests === undefined && tokens === undefined) return undefined;

  return {
    cost: cost ?? 0,
    requests: requests ?? 0,
    tokens: tokens ?? 0,
  };
}

function toOptionalNumber(raw: string) {
  if (!raw.trim()) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
}) {
  const colors = useAppTheme();

  return (
    <View style={{ flex: 1, minWidth: 128 }}>
      <Text style={{ color: colors.subtext, fontSize: 11, marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        keyboardType={keyboardType}
        style={{
          backgroundColor: colors.muted,
          borderColor: colors.border,
          borderRadius: 12,
          borderWidth: 1,
          color: colors.text,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      />
    </View>
  );
}

function AccountQuotaPanel({
  account,
  colors,
  info,
  mode,
  querying,
  resetting,
  onQuery,
  onShowCount,
  onReset,
}: {
  account: AdminAccount;
  colors: AppTheme;
  info?: AccountQuotaPanelState;
  mode: AccountQuotaMode;
  querying: boolean;
  resetting: boolean;
  onQuery: () => void;
  onShowCount: () => void;
  onReset: () => void;
}) {
  const windows = [getCodexWindowUsage(account, '5h'), getCodexWindowUsage(account, '7d')];
  const updatedAt = getExtraString(account, ['codex_usage_updated_at', 'codexUsageUpdatedAt']);
  const canQuery = mode === 'openai' || mode === 'grok';
  const canReset = mode === 'openai' || mode === 'generic';
  const resetDisabled = resetting || !canReset || (mode === 'openai' && info?.availableCount === 0);
  const buttonBase = {
    alignItems: 'center' as const,
    borderRadius: 999,
    flexDirection: 'row' as const,
    gap: 6,
    justifyContent: 'center' as const,
    paddingHorizontal: 12,
    paddingVertical: 9,
  };

  return (
    <View style={{ backgroundColor: colors.mutedCard, borderColor: colors.border, borderRadius: 16, borderWidth: 1, gap: 10, padding: 12 }}>
      <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 7 }}>
          <Gauge color={colors.primary} size={15} />
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: '800' }}>额度窗口</Text>
        </View>
        <Text numberOfLines={1} style={{ color: colors.subtext, flexShrink: 1, fontSize: 11 }}>
          {info && !info.error ? getQuotaInfoText(info, mode, account) : updatedAt ? `更新 ${formatTime(updatedAt)}` : getQuotaInfoText(info, mode, account)}
        </Text>
      </View>

      <View style={{ gap: 9 }}>
        {windows.map((item) => {
          const barWidth = `${item.percent ?? 0}%` as `${number}%`;
          const isHigh = (item.percent ?? 0) >= 80;
          return (
            <View key={item.label} style={{ gap: 6 }}>
              <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' }}>{item.label}</Text>
                <Text style={{ color: colors.subtext, fontSize: 11 }}>{formatPercent(item.percent)} · {item.resetLabel}</Text>
              </View>
              <View style={{ backgroundColor: colors.chartTrack, borderRadius: 999, height: 7, overflow: 'hidden' }}>
                <View style={{ backgroundColor: isHigh ? colors.danger : colors.primary, borderRadius: 999, height: 7, width: barWidth }} />
              </View>
            </View>
          );
        })}
      </View>

      {info?.error ? <Text style={{ color: colors.errorText, fontSize: 11 }}>{info.error}</Text> : null}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          disabled={!canQuery || querying}
          onPress={(event) => {
            event.stopPropagation();
            onQuery();
          }}
          style={{ ...buttonBase, backgroundColor: colors.surface, flex: 1, opacity: !canQuery ? 0.5 : 1 }}
        >
          <Search color={colors.badgeDefaultText} size={13} />
          <Text style={{ color: colors.badgeDefaultText, fontSize: 12, fontWeight: '800' }}>{querying ? '查询中' : '查询'}</Text>
        </Pressable>
        <Pressable
          disabled={!canQuery || querying}
          onPress={(event) => {
            event.stopPropagation();
            onShowCount();
          }}
          style={{ ...buttonBase, backgroundColor: colors.surface, flex: 1, opacity: !canQuery ? 0.5 : 1 }}
        >
          <Hash color={colors.badgeDefaultText} size={13} />
          <Text style={{ color: colors.badgeDefaultText, fontSize: 12, fontWeight: '800' }}>次数</Text>
        </Pressable>
        <Pressable
          disabled={resetDisabled}
          onPress={(event) => {
            event.stopPropagation();
            onReset();
          }}
          style={{ ...buttonBase, backgroundColor: colors.accentBg, flex: 1, opacity: resetDisabled ? 0.5 : 1 }}
        >
          <RotateCcw color={colors.accentText} size={13} />
          <Text style={{ color: colors.accentText, fontSize: 12, fontWeight: '800' }}>{resetting ? '重置中' : '重置'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function getAccountError(account: AdminAccount) {
  return Boolean(account.status === 'error' || account.error_message);
}

function getAccountVisualStatus(account: AdminAccount): AccountVisualStatus {
  const normalizedStatus = `${account.status ?? ''}`.toLowerCase();
  const isPausedStatus = ['inactive', 'disabled', 'paused', 'stop', 'stopped'].includes(normalizedStatus);

  if (getAccountError(account)) {
    return { filterKey: 'error', label: '异常', badgeTone: 'danger' };
  }
  if (isPausedStatus || account.schedulable === false) {
    return { filterKey: 'paused', label: '暂停', badgeTone: 'muted' };
  }
  return { filterKey: 'active', label: '正常', badgeTone: 'success' };
}

type AccountsListScreenProps = {
  safeAreaEdges?: Edge[];
};

export function AccountsListScreen({ safeAreaEdges }: AccountsListScreenProps) {
  const colors = useAppTheme();
  const [searchText, setSearchText] = useState('');
  const [filter, setFilter] = useState<AccountStatusFilter>('all');
  const [usageSort, setUsageSort] = useState<UsageSort>('usage-desc');
  const [testingAccountId, setTestingAccountId] = useState<number | null>(null);
  const [testFeedbackByAccountId, setTestFeedbackByAccountId] = useState<Record<number, string>>({});
  const [togglingAccountId, setTogglingAccountId] = useState<number | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [editConcurrency, setEditConcurrency] = useState('');
  const [editRateMultiplier, setEditRateMultiplier] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [quotaInfoByAccountId, setQuotaInfoByAccountId] = useState<Record<number, AccountQuotaPanelState>>({});
  const [quotaQueryingAccountId, setQuotaQueryingAccountId] = useState<number | null>(null);
  const [quotaResettingAccountId, setQuotaResettingAccountId] = useState<number | null>(null);
  const keyword = useDebouncedValue(searchText.trim(), 300);
  const queryClient = useQueryClient();

  const accountsQuery = useQuery({
    queryKey: ['accounts'],
    queryFn: () => listAccounts(),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ accountId, schedulable }: { accountId: number; schedulable: boolean }) =>
      setAccountSchedulable(accountId, schedulable),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  });

  const testMutation = useMutation({
    mutationFn: (accountId: number) => testAccount(accountId),
  });

  const accountEditMutation = useMutation({
    mutationFn: ({ accountId }: { accountId: number }) =>
      updateAccount(accountId, {
        name: editName.trim() || undefined,
        priority: toOptionalNumber(editPriority),
        concurrency: toOptionalNumber(editConcurrency),
        rate_multiplier: toOptionalNumber(editRateMultiplier),
        notes: editNotes.trim(),
      }),
    onSuccess: () => {
      setEditingAccountId(null);
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  const accountStatusMutation = useMutation({
    mutationFn: ({ account, enabled }: { account: AdminAccount; enabled: boolean }) =>
      updateAccount(account.id, {
        status: enabled ? 'active' : 'disabled',
        schedulable: enabled,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  });

  const accountDeleteMutation = useMutation({
    mutationFn: (accountId: number) => deleteAccount(accountId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  });

  const batchRefreshMutation = useMutation({
    mutationFn: (accountIds: number[]) => batchRefreshAccounts(accountIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  });

  const batchClearErrorMutation = useMutation({
    mutationFn: (accountIds: number[]) => batchClearAccountErrors(accountIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  });

  const items = accountsQuery.data?.items ?? [];
  const accountIds = useMemo(() => items.map((account) => account.id), [items]);
  const accountIdsKey = accountIds.join(',');
  const todayStatsQuery = useQuery({
    queryKey: ['account-today-stats-batch', accountIdsKey],
    enabled: accountIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        return await getAccountTodayStatsBatch(accountIds);
      } catch {
        const entries = await Promise.all(
          accountIds.map(async (accountId) => {
            const stats = await getAccountTodayStats(accountId).catch(() => ({ requests: 0, tokens: 0, cost: 0 }));
            return [accountId, stats] as const;
          })
        );

        return Object.fromEntries(entries) as Record<number, AccountTodaySummary>;
      }
    },
  });
  const totalStatsQuery = useQuery({
    queryKey: ['account-total-stats-batch', accountIdsKey],
    enabled: accountIds.length > 0,
    staleTime: 120_000,
    queryFn: async () => {
      const entries = await Promise.all(
        items.map(async (account) => {
          const inlineStats = getAccountInlineTotalStats(account);
          if (inlineStats) return [account.id, inlineStats] as const;

          const stats = await getAccountStats(account.id, { days: 30 }).catch(() => undefined);
          return [
            account.id,
            {
              cost: Number(stats?.total_account_cost ?? stats?.total_actual_cost ?? stats?.total_cost ?? 0),
              requests: Number(stats?.total_requests ?? 0),
              tokens: Number(stats?.total_tokens ?? 0),
            },
          ] as const;
        })
      );

      return Object.fromEntries(entries) as Record<number, AccountTotalSummary>;
    },
  });

  const todayByAccountId = useMemo(() => {
    const next = new Map<number, AccountTodaySummary>();
    items.forEach((account) => {
      const result = todayStatsQuery.data?.[account.id];
      const fromStatsCost = typeof result?.cost === 'number' && Number.isFinite(result.cost) ? result.cost : undefined;
      const fromExtra = typeof account.extra?.today_cost === 'number' ? account.extra.today_cost : undefined;
      const cost = fromStatsCost ?? fromExtra ?? 0;
      const requests = typeof result?.requests === 'number' && Number.isFinite(result.requests) ? result.requests : 0;
      const tokens = typeof result?.tokens === 'number' && Number.isFinite(result.tokens) ? result.tokens : 0;
      next.set(account.id, { requests, tokens, cost });
    });
    return next;
  }, [items, todayStatsQuery.data]);

  const totalByAccountId = useMemo(() => {
    const next = new Map<number, AccountTotalSummary>();
    items.forEach((account) => {
      const result = totalStatsQuery.data?.[account.id] ?? getAccountInlineTotalStats(account);
      next.set(account.id, {
        cost: typeof result?.cost === 'number' && Number.isFinite(result.cost) ? result.cost : 0,
        requests: typeof result?.requests === 'number' && Number.isFinite(result.requests) ? result.requests : 0,
        tokens: typeof result?.tokens === 'number' && Number.isFinite(result.tokens) ? result.tokens : 0,
      });
    });
    return next;
  }, [items, totalStatsQuery.data]);

  const filteredItems = useMemo(() => {
    const normalizedKeyword = keyword.toLowerCase();
    const keywordMatched = normalizedKeyword
      ? items.filter((account) => {
          const haystack = [
            account.id,
            account.name,
            account.platform,
            account.type,
            account.status,
            account.groups?.map((group) => group.name).join(' '),
          ].filter(Boolean).join(' ').toLowerCase();

          return haystack.includes(normalizedKeyword);
        })
      : items;

    const statusMatched = keywordMatched.filter((account) => {
      const visualStatus = getAccountVisualStatus(account);
      if (filter === 'all') return true;
      if (filter === 'active') return visualStatus.filterKey === 'active';
      if (filter === 'paused') return visualStatus.filterKey === 'paused';
      if (filter === 'error') return visualStatus.filterKey === 'error';
      return true;
    });

    const sorted = [...statusMatched].sort((left, right) => {
      const requestsLeft = todayByAccountId.get(left.id)?.requests ?? 0;
      const requestsRight = todayByAccountId.get(right.id)?.requests ?? 0;
      if (requestsLeft === requestsRight) {
        const tokensLeft = todayByAccountId.get(left.id)?.tokens ?? 0;
        const tokensRight = todayByAccountId.get(right.id)?.tokens ?? 0;
        return tokensLeft - tokensRight;
      }
      if (usageSort === 'usage-asc') return requestsLeft - requestsRight;
      return requestsRight - requestsLeft;
    });

    return sorted;
  }, [filter, items, keyword, todayByAccountId, usageSort]);
  const errorMessage = accountsQuery.error instanceof Error ? accountsQuery.error.message : '';

  function confirmBatch(action: 'refresh' | 'clear-error') {
    const accountIds = filteredItems.map((item) => item.id);
    if (accountIds.length === 0) return;

    const title = action === 'refresh' ? '批量刷新账号' : '批量清除错误';
    const message = `确认对当前筛选的 ${accountIds.length} 个账号执行该操作吗？`;

    Alert.alert(title, message, [
      { text: '取消', style: 'cancel' },
      {
        text: '确认',
        onPress: () => {
          if (action === 'refresh') {
            batchRefreshMutation.mutate(accountIds);
          } else {
            batchClearErrorMutation.mutate(accountIds);
          }
        },
      },
    ]);
  }

  function startEditAccount(account: AdminAccount) {
    setEditingAccountId(account.id);
    setEditName(account.name || '');
    setEditPriority(account.priority !== undefined ? String(account.priority) : '');
    setEditConcurrency(account.concurrency !== undefined ? String(account.concurrency) : '');
    setEditRateMultiplier(account.rate_multiplier !== undefined ? String(account.rate_multiplier) : '');
    setEditNotes(account.notes || '');
  }

  function confirmDeleteAccount(account: AdminAccount) {
    Alert.alert('删除账号', `确认删除 ${account.name || `账号 #${account.id}`} 吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => accountDeleteMutation.mutate(account.id),
      },
    ]);
  }

  async function fetchAccountQuota(account: AdminAccount) {
    const mode = getAccountQuotaMode(account);
    if (mode === 'openai') {
      return parseQuotaInfo(await getOpenAiAccountQuota(account.id), mode);
    }
    if (mode === 'grok') {
      return parseQuotaInfo(await getGrokAccountQuota(account.id), mode);
    }

    throw new Error('当前账号类型暂无额度查询接口');
  }

  async function handleQuotaQuery(account: AdminAccount, showCount = false) {
    const mode = getAccountQuotaMode(account);
    setQuotaQueryingAccountId(account.id);

    try {
      const info = await fetchAccountQuota(account);
      setQuotaInfoByAccountId((current) => ({ ...current, [account.id]: info }));
      if (showCount) {
        Alert.alert('次数查询', getQuotaCountMessage(info, mode));
      }
      return info;
    } catch (error) {
      const message = getErrorMessage(error);
      setQuotaInfoByAccountId((current) => ({ ...current, [account.id]: { error: message, queriedAt: new Date().toISOString() } }));
      Alert.alert('查询失败', message);
      return undefined;
    } finally {
      setQuotaQueryingAccountId((current) => (current === account.id ? null : current));
    }
  }

  function handleQuotaCount(account: AdminAccount) {
    const mode = getAccountQuotaMode(account);
    const info = quotaInfoByAccountId[account.id];

    if (mode !== 'openai' && mode !== 'grok') {
      Alert.alert('次数查询', '当前账号类型没有次数查询接口。');
      return;
    }

    if (info && !info.error) {
      Alert.alert('次数查询', getQuotaCountMessage(info, mode));
      return;
    }

    void handleQuotaQuery(account, true);
  }

  function confirmQuotaReset(account: AdminAccount) {
    const mode = getAccountQuotaMode(account);
    const info = quotaInfoByAccountId[account.id];

    if (mode === 'grok') {
      Alert.alert('暂不支持', 'Grok 账号支持额度查询，Web 端标记为不支持重置。');
      return;
    }
    if (mode === 'unsupported') {
      Alert.alert('无法重置', '当前账号类型未提供额度重置接口。');
      return;
    }
    if (mode === 'openai' && info?.availableCount === 0) {
      Alert.alert('无法重置', '当前没有可用重置次数。');
      return;
    }

    Alert.alert('重置额度', `确认重置 ${account.name || `账号 #${account.id}`} 的额度吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '重置',
        style: 'destructive',
        onPress: () => {
          void handleQuotaReset(account);
        },
      },
    ]);
  }

  async function handleQuotaReset(account: AdminAccount) {
    const mode = getAccountQuotaMode(account);
    setQuotaResettingAccountId(account.id);

    try {
      if (mode === 'openai') {
        let info = quotaInfoByAccountId[account.id];
        if (!info || info.availableCount === undefined || info.error) {
          info = await fetchAccountQuota(account);
          setQuotaInfoByAccountId((current) => ({ ...current, [account.id]: info as AccountQuotaPanelState }));
        }
        if ((info.availableCount ?? 0) <= 0) {
          throw new Error('当前没有可用重置次数');
        }
        await resetOpenAiAccountQuota(account.id);
        const nextInfo = await fetchAccountQuota(account).catch(() => undefined);
        if (nextInfo) {
          setQuotaInfoByAccountId((current) => ({ ...current, [account.id]: nextInfo }));
        }
      } else if (mode === 'generic') {
        await resetAccountQuota(account.id);
      } else if (mode === 'grok') {
        throw new Error('Grok 账号不支持重置');
      } else {
        throw new Error('当前账号类型未提供额度重置接口');
      }

      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['account-today-stats-batch'] });
      queryClient.invalidateQueries({ queryKey: ['account-today-stats', account.id] });
      Alert.alert('重置成功', '账号额度已重置，数据将自动刷新。');
    } catch (error) {
      Alert.alert('重置失败', getErrorMessage(error));
    } finally {
      setQuotaResettingAccountId((current) => (current === account.id ? null : current));
    }
  }

  const summary = useMemo(() => {
    const total = items.length;
    const errors = items.filter((item) => getAccountVisualStatus(item).filterKey === 'error').length;
    const paused = items.filter((item) => getAccountVisualStatus(item).filterKey === 'paused').length;
    const active = items.filter((item) => getAccountVisualStatus(item).filterKey === 'active').length;
    return { total, active, paused, errors };
  }, [items]);

  const listHeader = useMemo(
    () => (
      <View className="pb-2">
        <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 10 }}>
          <View style={{ alignItems: 'center', backgroundColor: colors.mutedCard, borderRadius: 18, flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12 }}>
            <Search color={colors.subtext} size={18} />
            <TextInput
              defaultValue=""
              onChangeText={setSearchText}
              placeholder="搜索账号名称 / 平台"
              placeholderTextColor={colors.placeholder}
              style={{ color: colors.text, flex: 1, fontSize: 16, marginLeft: 12 }}
            />
          </View>

          <View className="mt-3 flex-row gap-2">
            {([
              ['all', `全部 ${summary.total}`],
              ['active', `正常 ${summary.active}`],
              ['paused', `暂停 ${summary.paused}`],
              ['error', `异常 ${summary.errors}`],
            ] as const).map(([key, label]) => {
              const active = filter === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setFilter(key)}
                  style={{ backgroundColor: active ? colors.primary : colors.mutedCard, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}
                >
                  <Text style={{ color: active ? colors.primaryText : colors.badgeDefaultText, fontSize: 12, fontWeight: '600' }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View className="mt-3 flex-row gap-2">
            {([
              ['usage-desc', '请求高→低'],
              ['usage-asc', '请求低→高'],
            ] as const).map(([key, label]) => {
              const active = usageSort === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setUsageSort(key)}
                  style={{ backgroundColor: active ? colors.dark : colors.mutedCard, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 12 }}
                >
                  <Text style={{ color: active ? colors.primaryText : colors.badgeDefaultText, fontSize: 12, fontWeight: '600' }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View className="mt-3 flex-row gap-2">
            <Pressable
              disabled={filteredItems.length === 0 || batchRefreshMutation.isPending}
              onPress={() => confirmBatch('refresh')}
              style={{ alignItems: 'center', backgroundColor: colors.primary, borderRadius: 999, flex: 1, opacity: filteredItems.length === 0 ? 0.6 : 1, paddingHorizontal: 12, paddingVertical: 11 }}
            >
              <Text style={{ color: colors.primaryText, fontSize: 12, fontWeight: '800' }}>
                {batchRefreshMutation.isPending ? '刷新中...' : '批量刷新'}
              </Text>
            </Pressable>
            <Pressable
              disabled={filteredItems.length === 0 || batchClearErrorMutation.isPending}
              onPress={() => confirmBatch('clear-error')}
              style={{ alignItems: 'center', backgroundColor: colors.mutedCard, borderRadius: 999, flex: 1, opacity: filteredItems.length === 0 ? 0.6 : 1, paddingHorizontal: 12, paddingVertical: 11 }}
            >
              <Text style={{ color: colors.badgeDefaultText, fontSize: 12, fontWeight: '800' }}>
                {batchClearErrorMutation.isPending ? '清理中...' : '批量清错'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    ),
    [batchClearErrorMutation.isPending, batchRefreshMutation.isPending, colors, filter, filteredItems, summary.active, summary.errors, summary.paused, summary.total, usageSort]
  );

  const renderItem = useCallback(
    ({ item: account }: { item: (typeof filteredItems)[number] }) => {
      const isError = getAccountError(account);
      const visualStatus = getAccountVisualStatus(account);
      const statusText = visualStatus.label;
      const todayStats = todayByAccountId.get(account.id) ?? { requests: 0, tokens: 0, cost: 0 };
      const totalStats = totalByAccountId.get(account.id) ?? { requests: 0, tokens: 0, cost: 0 };
      const nextSchedulable = visualStatus.filterKey === 'paused';
      const toggleLabel = nextSchedulable ? '恢复' : '暂停';
      const statusDisabled = ['disabled', 'inactive', 'paused'].includes(`${account.status || ''}`.toLowerCase());
      const nextEnabled = statusDisabled;
      const testFeedback = testFeedbackByAccountId[account.id];
      const isTogglingCurrent = togglingAccountId === account.id && toggleMutation.isPending;
      const isTestingCurrent = testingAccountId === account.id && testMutation.isPending;
      const isEditing = editingAccountId === account.id;
      const quotaMode = getAccountQuotaMode(account);
      const quotaInfo = quotaInfoByAccountId[account.id];
      const isQuotaQuerying = quotaQueryingAccountId === account.id;
      const isQuotaResetting = quotaResettingAccountId === account.id;

      return (
        <Pressable onPress={() => router.push(`/accounts/${account.id}`)}>
          <ListCard
            title={account.name}
            meta={`#${account.id} · ${account.platform} · ${account.type}`}
            badge={statusText}
            badgeTone={visualStatus.badgeTone}
            icon={KeyRound}
          >
            <View className="gap-3">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  {account.schedulable && !isError ? <ShieldCheck color={colors.subtext} size={14} /> : <ShieldOff color={colors.subtext} size={14} />}
                  <Text style={{ color: colors.subtext, fontSize: 14 }}>状态：{statusText}</Text>
                </View>
                <Text style={{ color: colors.subtext, fontSize: 12 }}>最近使用 {formatTime(account.last_used_at || account.updated_at)}</Text>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <View style={{ backgroundColor: colors.mutedCard, borderRadius: 14, flex: 1, minWidth: 132, paddingHorizontal: 12, paddingVertical: 12 }}>
                  <Text style={{ color: colors.subtext, fontSize: 11 }}>请求次数</Text>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 4 }}>{todayStats.requests}</Text>
                </View>
                <View style={{ backgroundColor: colors.mutedCard, borderRadius: 14, flex: 1, minWidth: 132, paddingHorizontal: 12, paddingVertical: 12 }}>
                  <Text style={{ color: colors.subtext, fontSize: 11 }}>今日用量</Text>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 4 }}>{formatMoneyValue(todayStats.cost)}</Text>
                </View>
                <View style={{ backgroundColor: colors.mutedCard, borderRadius: 14, flex: 1, minWidth: 132, paddingHorizontal: 12, paddingVertical: 12 }}>
                  <Text style={{ color: colors.subtext, fontSize: 11 }}>总使用额度</Text>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 4 }}>{formatMoneyValue(totalStats.cost)}</Text>
                </View>
                <View style={{ backgroundColor: colors.mutedCard, borderRadius: 14, flex: 1, minWidth: 132, paddingHorizontal: 12, paddingVertical: 12 }}>
                  <Text style={{ color: colors.subtext, fontSize: 11 }}>token消耗</Text>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 4 }}>{formatTokenValue(todayStats.tokens)}</Text>
                </View>
              </View>

              <AccountQuotaPanel
                account={account}
                colors={colors}
                info={quotaInfo}
                mode={quotaMode}
                querying={isQuotaQuerying}
                resetting={isQuotaResetting}
                onQuery={() => {
                  void handleQuotaQuery(account);
                }}
                onShowCount={() => handleQuotaCount(account)}
                onReset={() => confirmQuotaReset(account)}
              />

              {isEditing ? (
                <View style={{ backgroundColor: colors.mutedCard, borderRadius: 14, padding: 12 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    <Field label="名称" value={editName} onChangeText={setEditName} placeholder="账号名称" />
                    <Field label="优先级" value={editPriority} onChangeText={setEditPriority} placeholder="0" keyboardType="number-pad" />
                    <Field label="并发" value={editConcurrency} onChangeText={setEditConcurrency} placeholder="留空不改" keyboardType="number-pad" />
                    <Field label="倍率" value={editRateMultiplier} onChangeText={setEditRateMultiplier} placeholder="1" keyboardType="decimal-pad" />
                    <Field label="备注" value={editNotes} onChangeText={setEditNotes} placeholder="备注" />
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                    <Pressable
                      disabled={accountEditMutation.isPending}
                      onPress={(event) => {
                        event.stopPropagation();
                        accountEditMutation.mutate({ accountId: account.id });
                      }}
                      style={{ alignItems: 'center', backgroundColor: colors.primary, borderRadius: 12, flex: 1, paddingVertical: 11 }}
                    >
                      <Text style={{ color: colors.primaryText, fontWeight: '800' }}>{accountEditMutation.isPending ? '保存中...' : '保存'}</Text>
                    </Pressable>
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        setEditingAccountId(null);
                      }}
                      style={{ alignItems: 'center', backgroundColor: colors.muted, borderRadius: 12, flex: 1, paddingVertical: 11 }}
                    >
                      <Text style={{ color: colors.badgeDefaultText, fontWeight: '800' }}>取消</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Pressable
                  style={{ backgroundColor: colors.dark, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 }}
                  disabled={isTestingCurrent}
                  onPress={(event) => {
                    event.stopPropagation();
                    setTestingAccountId(account.id);
                    testMutation.mutate(account.id, {
                      onSuccess: () => {
                        setTestFeedbackByAccountId((current) => ({ ...current, [account.id]: '测试成功' }));
                      },
                      onError: (error) => {
                        const message = error instanceof Error && error.message ? error.message : '测试失败';
                        setTestFeedbackByAccountId((current) => ({ ...current, [account.id]: message }));
                      },
                      onSettled: () => {
                        setTestingAccountId((current) => (current === account.id ? null : current));
                      },
                    });
                  }}
                >
                  <Text style={{ color: colors.primaryText, fontSize: 12, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' }}>{isTestingCurrent ? '测试中...' : '测试'}</Text>
                </Pressable>
                <Pressable
                  style={{ backgroundColor: colors.mutedCard, borderRadius: 999, flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingVertical: 8 }}
                  onPress={(event) => {
                    event.stopPropagation();
                    startEditAccount(account);
                  }}
                >
                  <Pencil color={colors.badgeDefaultText} size={13} />
                  <Text style={{ color: colors.badgeDefaultText, fontSize: 12, fontWeight: '800' }}>编辑</Text>
                </Pressable>
                <Pressable
                  disabled={accountStatusMutation.isPending}
                  style={{ backgroundColor: colors.mutedCard, borderRadius: 999, flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingVertical: 8 }}
                  onPress={(event) => {
                    event.stopPropagation();
                    accountStatusMutation.mutate({ account, enabled: nextEnabled });
                  }}
                >
                  <Power color={nextEnabled ? colors.success : colors.badgeDefaultText} size={13} />
                  <Text style={{ color: nextEnabled ? colors.success : colors.badgeDefaultText, fontSize: 12, fontWeight: '800' }}>{nextEnabled ? '启用' : '禁用'}</Text>
                </Pressable>
                <Pressable
                  style={{ backgroundColor: colors.mutedCard, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 }}
                  disabled={isTogglingCurrent}
                  onPress={(event) => {
                    event.stopPropagation();
                    setTogglingAccountId(account.id);
                    toggleMutation.mutate({
                      accountId: account.id,
                      schedulable: nextSchedulable,
                    }, {
                      onSettled: () => {
                        setTogglingAccountId((current) => (current === account.id ? null : current));
                      },
                    });
                  }}
                >
                  <Text style={{ color: colors.badgeDefaultText, fontSize: 12, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' }}>{isTogglingCurrent ? '处理中...' : toggleLabel}</Text>
                </Pressable>
                <Pressable
                  disabled={accountDeleteMutation.isPending}
                  style={{ backgroundColor: colors.errorBg, borderRadius: 999, flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingVertical: 8 }}
                  onPress={(event) => {
                    event.stopPropagation();
                    confirmDeleteAccount(account);
                  }}
                >
                  <Trash2 color={colors.errorText} size={13} />
                  <Text style={{ color: colors.errorText, fontSize: 12, fontWeight: '800' }}>删除</Text>
                </Pressable>
              </View>

              {testFeedback ? <Text style={{ color: colors.success, fontSize: 12 }}>测试结果：{testFeedback}</Text> : null}
            </View>
          </ListCard>
        </Pressable>
      );
    },
    [accountDeleteMutation, accountEditMutation, accountStatusMutation, colors, confirmQuotaReset, editConcurrency, editName, editNotes, editPriority, editRateMultiplier, editingAccountId, handleQuotaCount, handleQuotaQuery, quotaInfoByAccountId, quotaQueryingAccountId, quotaResettingAccountId, testFeedbackByAccountId, testMutation, testingAccountId, todayByAccountId, toggleMutation, togglingAccountId, totalByAccountId]
  );

  const emptyState = useMemo(
    () => <ListCard title="暂无账号" meta={errorMessage || '连上后这里会展示账号列表。'} icon={KeyRound} />,
    [errorMessage]
  );

  return (
    <ScreenShell
      title="账号清单"
      subtitle="查看名称、平台&类型、请求次数、消费金额、token消耗，并支持筛选与排序。"
      icon={KeyRound}
      titleAside={(
        <Text style={{ color: colors.subtext, fontSize: 11 }}>更接近网页后台的账号视图。</Text>
      )}
      variant="minimal"
      scroll={false}
      safeAreaEdges={safeAreaEdges}
      bottomInsetClassName="pb-6"
      contentGapClassName="mt-2 gap-2"
    >
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 12, flexGrow: 1 }}
        data={filteredItems}
        renderItem={renderItem}
        keyExtractor={(item) => `${item.id}`}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={accountsQuery.isRefetching || todayStatsQuery.isRefetching || totalStatsQuery.isRefetching} onRefresh={() => {
          void accountsQuery.refetch();
          void todayStatsQuery.refetch();
          void totalStatsQuery.refetch();
        }} tintColor={colors.primary} />}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyState}
        ItemSeparatorComponent={() => <View className="h-4" />}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
      />
    </ScreenShell>
  );
}
