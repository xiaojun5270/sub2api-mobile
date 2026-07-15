import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { router } from 'expo-router';
import {
  Activity,
  AlertCircle,
  ArrowDownUp,
  CircleCheck,
  Clock3,
  Cpu,
  Download,
  DollarSign,
  Gauge,
  Hash,
  KeyRound,
  Pencil,
  Power,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Upload,
  Wallet,
  type LucideIcon,
} from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import type { Edge } from 'react-native-safe-area-context';

import { ListCard } from '@/src/components/list-card';
import { ScreenShell } from '@/src/components/screen-shell';
import { useDebouncedValue } from '@/src/hooks/use-debounced-value';
import { isAccountRateLimited } from '@/src/lib/account-status';
import { formatCompactNumber, formatTokenValue } from '@/src/lib/formatters';
import { type AppTheme, useAppTheme } from '@/src/lib/theme';
import {
  batchClearAccountErrors,
  batchRefreshAccounts,
  deleteAccount,
  exportAccountsData,
  getAccountTodayStats,
  getAccountTodayStatsBatch,
  getAccountStats,
  getGrokAccountQuota,
  getAccountModels,
  getOpenAiAccountQuota,
  importAccountsData,
  listAllAccounts,
  resetAccountQuota,
  resetOpenAiAccountQuota,
  setAccountSchedulable,
  testAccount,
  updateAccount,
} from '@/src/services/admin';
import type { AccountTodayStats, AdminAccount } from '@/src/types/admin';

type AccountStatusFilter = 'all' | 'active' | 'paused' | 'error' | 'limited';
type UsageSort = 'usage-desc' | 'usage-asc';
type AccountVisualStatus = {
  filterKey: AccountStatusFilter;
  label: '正常' | '暂停' | '异常' | '限流';
  badgeTone: 'success' | 'muted' | 'danger';
};

type AccountTodaySummary = {
  requests: number;
  tokens: number;
  cost: number;
  standardCost: number;
  userCost: number;
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

type AccountModelOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type AccountStatTone = 'todayRequests' | 'todayTokens' | 'todayQuota' | 'totalQuota' | 'totalRequests' | 'totalTokens';

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

function firstNumberValue(source: unknown, keys: string[]) {
  if (!isRecord(source)) return undefined;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = parseNumberLike(value);
      if (parsed !== undefined) return parsed;
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

function normalizeAccountModelOption(value: unknown, fallbackName?: string): AccountModelOption | undefined {
  if (typeof value === 'string' && value.trim()) return { value: value.trim(), label: value.trim() };
  if (typeof value === 'number' && Number.isFinite(value)) return { value: String(value), label: String(value) };
  if (!isRecord(value)) {
    return fallbackName?.trim() ? { value: fallbackName.trim(), label: fallbackName.trim() } : undefined;
  }

  const optionValue = firstStringValue(value, ['id', 'model', 'name', 'path', 'value']) ?? fallbackName;
  if (!optionValue?.trim()) return undefined;

  const label = firstStringValue(value, ['display_name', 'displayName', 'label', 'name', 'model', 'id']) ?? optionValue;

  const enabled = value.enabled;
  const available = value.available;
  const status = typeof value.status === 'string' ? value.status.toLowerCase() : '';
  const disabled = enabled === false || available === false || ['disabled', 'inactive', 'off'].includes(status);
  return { value: optionValue.trim(), label: label.trim(), disabled };
}

function collectAccountModelOptions(source: unknown): AccountModelOption[] {
  if (Array.isArray(source)) {
    return source
      .map((item) => normalizeAccountModelOption(item))
      .filter((item): item is AccountModelOption => Boolean(item?.value));
  }

  if (typeof source === 'string' && source.trim()) {
    const trimmed = source.trim();
    if (trimmed.includes(',')) {
      return trimmed
        .split(',')
        .map((item) => normalizeAccountModelOption(item))
        .filter((item): item is AccountModelOption => Boolean(item?.value));
    }
    return [{ value: trimmed, label: trimmed }];
  }

  if (!isRecord(source)) return [];
  const direct = normalizeAccountModelOption(source);
  if (direct) return [direct];

  return Object.entries(source)
    .flatMap(([key, value]) => {
      const keyOption = normalizeAccountModelOption(key);
      const valueOption = normalizeAccountModelOption(value, key);
      if (keyOption && valueOption && keyOption.value !== valueOption.value) return [keyOption, valueOption];
      return [valueOption ?? keyOption].filter((item): item is AccountModelOption => Boolean(item?.value));
    })
    .filter((item): item is AccountModelOption => Boolean(item?.value));
}

function uniqueAccountModelOptions(options: AccountModelOption[]) {
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = option.value.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getAccountInlineModelOptions(account: AdminAccount) {
  const source = account as unknown;
  const extra = account.extra as unknown;
  const sources = [
    firstStringValue(source, ['model', 'default_model', 'defaultModel']),
    isRecord(source) ? source.models : undefined,
    isRecord(source) ? source.available_models : undefined,
    isRecord(source) ? source.availableModels : undefined,
    isRecord(source) ? source.enabled_models : undefined,
    isRecord(source) ? source.enabledModels : undefined,
    isRecord(extra) ? extra.models : undefined,
    isRecord(extra) ? extra.available_models : undefined,
    isRecord(extra) ? extra.availableModels : undefined,
    isRecord(extra) ? extra.enabled_models : undefined,
    isRecord(extra) ? extra.enabledModels : undefined,
    isRecord(extra) ? extra.model_rate_limits : undefined,
    isRecord(extra) ? extra.modelRateLimits : undefined,
    isRecord(extra) ? extra.model_mapping : undefined,
    isRecord(extra) ? extra.modelMapping : undefined,
  ];

  return uniqueAccountModelOptions(sources.flatMap((item) => collectAccountModelOptions(item))).slice(0, 12);
}

function getDefaultAccountTestModel(account: AdminAccount, options: AccountModelOption[]) {
  const enabledOptions = options.filter((option) => !option.disabled);
  if (enabledOptions.length === 0) return undefined;

  const platform = `${account.platform || ''}`.toLowerCase();
  if (platform === 'gemini') return enabledOptions[0].value;

  if (platform === 'antigravity') {
    const priority = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'];
    const matched = [...enabledOptions].sort((left, right) => {
      const leftIndex = priority.findIndex((item) => left.value.toLowerCase().includes(item));
      const rightIndex = priority.findIndex((item) => right.value.toLowerCase().includes(item));
      return (leftIndex === -1 ? priority.length : leftIndex) - (rightIndex === -1 ? priority.length : rightIndex);
    })[0];
    return matched.value;
  }

  return enabledOptions.find((option) => option.value.toLowerCase().includes('sonnet'))?.value ?? enabledOptions[0].value;
}

function getAccountNumber(account: AdminAccount, keys: string[]) {
  for (const source of [account, account.extra, account.usage, account.quota]) {
    const value = firstNumberValue(source, keys);
    if (value !== undefined) return value;
  }
  return undefined;
}

function getExtraString(account: AdminAccount, keys: string[]) {
  return firstStringValue(account.extra, keys);
}

function getAccountString(account: AdminAccount, keys: string[]) {
  return firstStringValue(account as unknown, keys) ?? getExtraString(account, keys);
}

function getAccountWindowNumber(account: AdminAccount, keys: string[]) {
  const sources = [account, account.extra, account.usage, account.quota, account.credentials];
  for (const source of sources) {
    const value = firstNumberValue(source, keys);
    if (value !== undefined) return value;
  }
  return undefined;
}

function getAccountWindowString(account: AdminAccount, keys: string[]) {
  const sources = [account, account.extra, account.usage, account.quota, account.credentials];
  for (const source of sources) {
    const value = firstStringValue(source, keys);
    if (value !== undefined) return value;
  }
  return undefined;
}

function normalizePercent(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(100, value));
}

function calculateWindowPercent(used?: number, limit?: number) {
  if (used === undefined || limit === undefined || !Number.isFinite(used) || !Number.isFinite(limit)) return undefined;
  if (limit <= 1 || used < 0) return undefined;
  return normalizePercent((used / limit) * 100);
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
  const compactPrefix = windowKey === '5h' ? 'codex5h' : 'codex7d';
  const percentKeys = [
    `${prefix}_used_percent`,
    `${prefix}_usage_percent`,
    `${prefix}_used_percentage`,
    `${prefix}_usage_percentage`,
    `${prefix}_usage_pct`,
    `${prefix}_percent`,
    `${compactPrefix}UsedPercent`,
    `${compactPrefix}UsagePercent`,
    `${compactPrefix}UsedPercentage`,
    `${compactPrefix}UsagePercentage`,
    `${compactPrefix}UsagePct`,
    windowKey === '5h' ? 'usage_5h_percent' : 'usage_7d_percent',
    windowKey === '5h' ? 'usage_5h_percentage' : 'usage_7d_percentage',
    windowKey === '5h' ? 'usage5hPercent' : 'usage7dPercent',
    windowKey === '5h' ? 'usage5hPercentage' : 'usage7dPercentage',
    windowKey === '5h' ? 'rate_limit_5h_percent' : 'rate_limit_7d_percent',
    windowKey === '5h' ? 'rate_limit_5h_percentage' : 'rate_limit_7d_percentage',
    windowKey === '5h' ? 'rateLimit5hPercent' : 'rateLimit7dPercent',
    windowKey === '5h' ? 'rateLimit5hPercentage' : 'rateLimit7dPercentage',
  ];
  const usageKeys = windowKey === '5h'
    ? ['codex_5h_usage', 'codex_5h_used', 'codex5hUsage', 'codex5hUsed', 'usage_5h', 'usage5h', 'usage_5_hours', 'used_5h', 'used5h']
    : ['codex_7d_usage', 'codex_7d_used', 'codex7dUsage', 'codex7dUsed', 'usage_7d', 'usage7d', 'usage_week', 'weekly_usage', 'used_7d', 'used7d'];
  const limitKeys = windowKey === '5h'
    ? ['codex_5h_limit', 'codex_5h_quota', 'codex5hLimit', 'codex5hQuota', 'rate_limit_5h', 'rateLimit5h', 'limit_5h', 'quota_5h']
    : ['codex_7d_limit', 'codex_7d_quota', 'codex7dLimit', 'codex7dQuota', 'rate_limit_7d', 'rateLimit7d', 'limit_7d', 'quota_7d', 'weekly_limit'];
  const rawPercent = getAccountWindowNumber(account, percentKeys);
  const used = getAccountWindowNumber(account, usageKeys);
  const limit = getAccountWindowNumber(account, limitKeys);
  const percent = rawPercent !== undefined
    ? normalizePercent(rawPercent)
    : calculateWindowPercent(used, limit);
  const resetAfterSeconds = getAccountWindowNumber(account, [
    `${prefix}_reset_after_seconds`,
    `${prefix}_resetAfterSeconds`,
    `${compactPrefix}ResetAfterSeconds`,
    windowKey === '5h' ? 'reset_after_seconds_5h' : 'reset_after_seconds_7d',
    windowKey === '5h' ? 'resetAfterSeconds5h' : 'resetAfterSeconds7d',
    windowKey === '5h' ? 'rate_limit_5h_reset_after_seconds' : 'rate_limit_7d_reset_after_seconds',
    windowKey === '5h' ? 'rateLimit5hResetAfterSeconds' : 'rateLimit7dResetAfterSeconds',
  ]);
  const resetAt = getAccountWindowString(account, [
    `${prefix}_reset_at`,
    `${prefix}_resetAt`,
    `${compactPrefix}ResetAt`,
    windowKey === '5h' ? 'reset_at_5h' : 'reset_at_7d',
    windowKey === '5h' ? 'resetAt5h' : 'resetAt7d',
    windowKey === '5h' ? 'rate_limit_5h_reset_at' : 'rate_limit_7d_reset_at',
    windowKey === '5h' ? 'rateLimit5hResetAt' : 'rateLimit7dResetAt',
  ]);

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

function formatReqValue(value?: number) {
  return `${formatCompactNumber(Number(value ?? 0))} req`;
}

function getAccountStatPalette(colors: AppTheme, tone: AccountStatTone) {
  const dark = colors.mode === 'dark';
  const palettes: Record<AccountStatTone, { background: string; border: string; iconBg: string; icon: string; glow: string }> = {
    todayRequests: dark
      ? { background: '#101d34', border: '#25456f', iconBg: '#172b52', icon: '#93c5fd', glow: '#60a5fa' }
      : { background: '#eef5ff', border: '#d6e5ff', iconBg: '#dfeaff', icon: '#2563eb', glow: '#93c5fd' },
    todayTokens: dark
      ? { background: '#0f2634', border: '#25556c', iconBg: '#123849', icon: '#67e8f9', glow: '#22d3ee' }
      : { background: '#edfaff', border: '#cceff8', iconBg: '#dff8ff', icon: '#0891b2', glow: '#67e8f9' },
    todayQuota: dark
      ? { background: '#2a210b', border: '#604613', iconBg: '#3a2d0e', icon: '#fbbf24', glow: '#f59e0b' }
      : { background: '#fff8e7', border: '#f3dda5', iconBg: '#fff0c2', icon: '#b45309', glow: '#fbbf24' },
    totalQuota: dark
      ? { background: '#072b27', border: '#14564e', iconBg: '#0d3b35', icon: '#5eead4', glow: '#2dd4bf' }
      : { background: '#effbf7', border: '#c9f0e5', iconBg: '#ddf8ef', icon: '#047857', glow: '#5eead4' },
    totalRequests: dark
      ? { background: '#172136', border: '#334663', iconBg: '#22314b', icon: '#a5b4fc', glow: '#818cf8' }
      : { background: '#f2f5ff', border: '#dce4ff', iconBg: '#e7edff', icon: '#4f46e5', glow: '#a5b4fc' },
    totalTokens: dark
      ? { background: '#0d2a2d', border: '#1b535a', iconBg: '#153e43', icon: '#6ee7b7', glow: '#34d399' }
      : { background: '#f0fdf8', border: '#cceedd', iconBg: '#dcfce7', icon: '#059669', glow: '#6ee7b7' },
  };

  return palettes[tone];
}

function getQuotaUsageColor(colors: AppTheme, percent?: number) {
  if (percent === undefined || !Number.isFinite(percent)) return colors.subtext;
  if (percent >= 90) return colors.danger;
  if (percent >= 70) return colors.accentText;
  if (percent >= 40) return colors.primary;
  return colors.success;
}

function getQuotaUsageTextColor(colors: AppTheme, percent?: number) {
  if (percent !== undefined && percent >= 90) return colors.danger;
  if (percent !== undefined && percent >= 70) return colors.accentText;
  return colors.subtext;
}

function AccountStatTile({
  colors,
  icon: Icon,
  detail,
  label,
  tone,
  value,
}: {
  colors: AppTheme;
  icon: LucideIcon;
  detail?: string;
  label: string;
  tone: AccountStatTone;
  value: string;
}) {
  const palette = getAccountStatPalette(colors, tone);

  return (
    <View
      style={{
        backgroundColor: palette.background,
        borderColor: palette.border,
        borderRadius: 14,
        borderWidth: 1,
        flex: 1,
        flexBasis: 0,
        minHeight: detail ? 78 : 66,
        minWidth: 0,
        paddingHorizontal: 9,
        paddingVertical: 8,
        shadowColor: palette.glow,
        shadowOffset: { height: 4, width: 0 },
        shadowOpacity: colors.mode === 'dark' ? 0.08 : 0.11,
        shadowRadius: 9,
      }}
    >
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 6 }}>
        <View style={{ alignItems: 'center', backgroundColor: palette.iconBg, borderRadius: 999, height: 22, justifyContent: 'center', width: 22 }}>
          <Icon color={palette.icon} size={12} />
        </View>
        <Text numberOfLines={1} style={{ color: colors.subtext, flex: 1, fontSize: 11, fontWeight: '700' }}>
          {label}
        </Text>
      </View>
      <Text
        adjustsFontSizeToFit
        numberOfLines={1}
        style={{ color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 5 }}
      >
        {value}
      </Text>
      {detail ? (
        <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 11, fontWeight: '700', marginTop: 3 }}>
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

function getAccountInlineTotalStats(account: AdminAccount): AccountTotalSummary | undefined {
  const cost = getAccountNumber(account, [
    'total_account_cost',
    'total_actual_cost',
    'total_cost',
    'quota_used',
    'used_quota',
    'total_usage',
    'usage_total',
    'lifetime_cost',
  ]);
  const requests = getAccountNumber(account, ['total_requests', 'request_count_total', 'requests_total']);
  const tokens = getAccountNumber(account, ['total_tokens', 'token_consumed_total', 'tokens_total']);

  if (cost === undefined && requests === undefined && tokens === undefined) return undefined;

  return {
    cost: cost ?? 0,
    requests: requests ?? 0,
    tokens: tokens ?? 0,
  };
}

function normalizeTodaySummary(value: unknown): AccountTodaySummary {
  const cost = firstNumberValue(value, ['cost', 'actual_cost', 'actualCost', 'account_cost', 'accountCost']) ?? 0;

  return {
    requests: firstNumberValue(value, ['requests', 'request_count', 'requestCount']) ?? 0,
    tokens: firstNumberValue(value, ['tokens', 'total_tokens', 'totalTokens']) ?? 0,
    cost,
    standardCost: firstNumberValue(value, ['standard_cost', 'standardCost']) ?? 0,
    userCost: firstNumberValue(value, ['user_cost', 'userCost']) ?? cost,
  };
}

function toOptionalNumber(raw: string) {
  if (!raw.trim()) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function toNullableNumber(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.toLowerCase() === 'null') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

function toGroupIds(raw: string) {
  const values = raw
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);

  return values.length > 0 ? values : undefined;
}

function parseJsonObjectInput(raw: string, label: string) {
  if (!raw.trim()) {
    throw new Error(`${label} 不能为空`);
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`${label} 必须是 JSON 对象`);
  }

  return parsed;
}

function chunkItems<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function createAccountsExportFilename() {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  return `sub2api-accounts-${date}-${time}.json`;
}

async function exportJsonFile(data: Record<string, unknown>) {
  const filename = createAccountsExportFilename();
  const content = JSON.stringify(data, null, 2);

  if (Platform.OS === 'web') {
    if (typeof document === 'undefined') throw new Error('当前环境无法下载文件');
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return;
  }

  if (!FileSystem.cacheDirectory) throw new Error('无法创建导出文件');
  const uri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });

  if (!(await Sharing.isAvailableAsync())) throw new Error('当前设备不支持文件分享');
  await Sharing.shareAsync(uri, {
    dialogTitle: '导出账号数据',
    mimeType: 'application/json',
    UTI: 'public.json',
  });
}

async function pickJsonImportFile() {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: ['application/json', 'text/json', 'text/plain', 'application/octet-stream'],
  });
  if (result.canceled || !result.assets[0]) return undefined;

  const asset = result.assets[0];
  const content = Platform.OS === 'web' && asset.file
    ? await asset.file.text()
    : Platform.OS === 'web'
      ? await (await fetch(asset.uri)).text()
      : await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });

  return {
    data: parseJsonObjectInput(content, '导入文件'),
    name: asset.name,
  };
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
  const updatedAt = getAccountString(account, ['codex_usage_updated_at', 'codexUsageUpdatedAt']);
  const canQuery = mode === 'openai' || mode === 'grok';
  const canReset = mode === 'openai' || mode === 'generic';
  const resetDisabled = resetting || !canReset || (mode === 'openai' && info?.availableCount === 0);
  const countButtonLabel = mode === 'openai' && info?.availableCount !== undefined
    ? `可重置 ${formatCompactNumber(info.availableCount)} 次`
    : '次数';
  const hasNoResetCount = mode === 'openai' && info?.availableCount === 0;
  const countButtonColor = hasNoResetCount ? colors.danger : colors.badgeDefaultText;
  const countButtonBackground = hasNoResetCount ? colors.dangerBg : colors.surface;
  const quotaMeta = mode === 'openai' && info?.availableCount !== undefined
    ? updatedAt
      ? `更新 ${formatTime(updatedAt)}`
      : `查询 ${formatTime(info.queriedAt)}`
    : info && !info.error
      ? getQuotaInfoText(info, mode, account)
      : updatedAt
        ? `更新 ${formatTime(updatedAt)}`
        : getQuotaInfoText(info, mode, account);
  const buttonBase = {
    alignItems: 'center' as const,
    borderRadius: 999,
    flexDirection: 'row' as const,
    gap: 6,
    justifyContent: 'center' as const,
    paddingHorizontal: 12,
    paddingVertical: 6,
  };

  return (
    <View style={{ backgroundColor: colors.mutedCard, borderColor: colors.border, borderRadius: 14, borderWidth: 1, gap: 6, padding: 8 }}>
      <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 7 }}>
          <Gauge color={colors.primary} size={15} />
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: '800' }}>额度窗口</Text>
        </View>
        <Text numberOfLines={1} style={{ color: colors.subtext, flexShrink: 1, fontSize: 11 }}>
          {quotaMeta}
        </Text>
      </View>

      <View style={{ gap: 5 }}>
        {windows.map((item) => {
          const barWidth = `${item.percent ?? 0}%` as `${number}%`;
          const usageColor = getQuotaUsageColor(colors, item.percent);
          const usageTextColor = getQuotaUsageTextColor(colors, item.percent);
          return (
            <View key={item.label} style={{ gap: 4 }}>
              <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' }}>{item.label}</Text>
                <View style={{ alignItems: 'center', flexDirection: 'row', flexShrink: 1, gap: 4 }}>
                  <Text style={{ color: usageTextColor, fontSize: 11, fontWeight: '800' }}>{formatPercent(item.percent)}</Text>
                  <Text numberOfLines={1} style={{ color: colors.subtext, flexShrink: 1, fontSize: 11 }}>· {item.resetLabel}</Text>
                </View>
              </View>
              <View style={{ backgroundColor: colors.chartTrack, borderRadius: 999, height: 5, overflow: 'hidden' }}>
                <View style={{ backgroundColor: usageColor, borderRadius: 999, height: 5, width: barWidth }} />
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
          style={{ ...buttonBase, backgroundColor: countButtonBackground, flex: 1, opacity: !canQuery ? 0.5 : 1 }}
        >
          <Hash color={countButtonColor} size={13} />
          <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={{ color: countButtonColor, fontSize: 12, fontWeight: '800' }}>{countButtonLabel}</Text>
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
  return Boolean(account.status === 'error' || account.error_message || account.error);
}

function getAccountErrorDetail(account: AdminAccount) {
  const message = account.error_message?.trim()
    || account.error?.trim()
    || getAccountString(account, ['last_error', 'lastError', 'error_reason', 'errorReason']);
  if (message) return message;
  if (account.error_code !== undefined && account.error_code !== null) return `错误代码 ${account.error_code}`;
  return '后端未返回具体异常信息';
}

function hasFutureTime(value?: string | null) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return !Number.isNaN(time) && time > Date.now();
}

function getAccountVisualStatus(account: AdminAccount): AccountVisualStatus {
  const normalizedStatus = `${account.status ?? ''}`.toLowerCase();
  const isPausedStatus = ['inactive', 'disabled', 'paused', 'stop', 'stopped'].includes(normalizedStatus);
  const extraPausedUntil = getExtraString(account, ['temp_unschedulable_until', 'tempUnschedulableUntil']);

  if (isAccountRateLimited(account)) {
    return { filterKey: 'limited', label: '限流', badgeTone: 'muted' };
  }
  if (getAccountError(account)) {
    return { filterKey: 'error', label: '异常', badgeTone: 'danger' };
  }
  if (isPausedStatus || account.schedulable === false || hasFutureTime(account.temp_unschedulable_until) || hasFutureTime(extraPausedUntil)) {
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
  const [expandedModelAccountId, setExpandedModelAccountId] = useState<number | null>(null);
  const [loadingModelAccountId, setLoadingModelAccountId] = useState<number | null>(null);
  const [modelsByAccountId, setModelsByAccountId] = useState<Record<number, AccountModelOption[]>>({});
  const [selectedModelByAccountId, setSelectedModelByAccountId] = useState<Record<number, string>>({});
  const [togglingAccountId, setTogglingAccountId] = useState<number | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [editConcurrency, setEditConcurrency] = useState('');
  const [editLoadFactor, setEditLoadFactor] = useState('');
  const [editRateMultiplier, setEditRateMultiplier] = useState('');
  const [editProxyId, setEditProxyId] = useState('');
  const [editGroupIds, setEditGroupIds] = useState('');
  const [editPrivacyMode, setEditPrivacyMode] = useState('');
  const [editExpiresAt, setEditExpiresAt] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [toolsOpen, setToolsOpen] = useState(false);
  const [toolsMessage, setToolsMessage] = useState<string | null>(null);
  const [quotaInfoByAccountId, setQuotaInfoByAccountId] = useState<Record<number, AccountQuotaPanelState>>({});
  const [quotaQueryingAccountId, setQuotaQueryingAccountId] = useState<number | null>(null);
  const [quotaResettingAccountId, setQuotaResettingAccountId] = useState<number | null>(null);
  const keyword = useDebouncedValue(searchText.trim(), 300);
  const queryClient = useQueryClient();

  const accountsQuery = useQuery({
    queryKey: ['accounts', 'all'],
    queryFn: () => listAllAccounts({ page_size: 100 }),
    staleTime: 120_000,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ accountId, schedulable }: { accountId: number; schedulable: boolean }) =>
      setAccountSchedulable(accountId, schedulable),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  });

  const testMutation = useMutation({
    mutationFn: ({ accountId, modelId }: { accountId: number; modelId?: string }) => testAccount(accountId, { modelId }),
  });

  const accountEditMutation = useMutation({
    mutationFn: ({ accountId }: { accountId: number }) =>
      updateAccount(accountId, {
        name: editName.trim() || undefined,
        priority: toOptionalNumber(editPriority),
        concurrency: toOptionalNumber(editConcurrency),
        load_factor: toOptionalNumber(editLoadFactor) ?? null,
        rate_multiplier: toOptionalNumber(editRateMultiplier),
        proxy_id: toNullableNumber(editProxyId),
        group_ids: toGroupIds(editGroupIds),
        privacy_mode: editPrivacyMode.trim() || undefined,
        expires_at: editExpiresAt.trim() || null,
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

  const exportDataMutation = useMutation({
    mutationFn: async () => {
      const ids = filteredItems.map((item) => item.id);
      const payload = await exportAccountsData({ ids, include_proxies: false });
      await exportJsonFile(payload);
      return ids.length;
    },
    onSuccess: (count) => setToolsMessage(`已导出 ${count} 个账号的 JSON 文件`),
    onError: (error) => setToolsMessage(`导出失败：${getErrorMessage(error)}`),
  });

  const importDataMutation = useMutation({
    mutationFn: async () => {
      const selected = await pickJsonImportFile();
      if (!selected) return undefined;
      const result = await importAccountsData({ data: selected.data, skip_default_group_bind: false });
      return { ...result, filename: selected.name };
    },
    onSuccess: (result) => {
      if (!result) return;
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['monitor-stats'] });
      const created = result.account_created ?? 0;
      const failed = result.account_failed ?? 0;
      setToolsMessage(`${result.filename} 导入完成：创建 ${created}，失败 ${failed}`);
    },
    onError: (error) => setToolsMessage(`导入失败：${getErrorMessage(error)}`),
  });

  const items = accountsQuery.data?.items ?? [];
  const inlineTotalStats = useMemo(() => {
    const result: Record<number, AccountTotalSummary> = {};
    items.forEach((account) => {
      const stats = getAccountInlineTotalStats(account);
      if (stats) result[account.id] = stats;
    });
    return result;
  }, [items]);
  const accountIds = useMemo(() => items.map((account) => account.id), [items]);
  const accountIdsKey = accountIds.join(',');
  const todayStatsQuery = useQuery<Record<number, AccountTodayStats>>({
    queryKey: ['account-today-stats-batch', accountIdsKey],
    enabled: accountIds.length > 0,
    staleTime: 60_000,
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      const results: Record<number, AccountTodayStats> = {};

      for (const accountIdBatch of chunkItems(accountIds, 100)) {
        try {
          Object.assign(results, await getAccountTodayStatsBatch(accountIdBatch));
        } catch {
          for (const fallbackBatch of chunkItems(accountIdBatch, 10)) {
            const entries = await Promise.all(
              fallbackBatch.map(async (accountId) => {
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
            Object.assign(results, Object.fromEntries(entries));
          }
        }
      }

      return results;
    },
  });
  const totalStatsQueryKey = ['account-total-stats-batch', accountIdsKey] as const;
  const todayStatsReady = Boolean(todayStatsQuery.data) || todayStatsQuery.isError;
  const totalStatsQuery = useQuery<Record<number, AccountTotalSummary>>({
    queryKey: totalStatsQueryKey,
    enabled: accountIds.length > 0 && todayStatsReady,
    staleTime: 120_000,
    placeholderData: (previousData) => ({ ...inlineTotalStats, ...previousData }),
    queryFn: async () => {
      const results: Record<number, AccountTotalSummary> = { ...inlineTotalStats };
      const missingAccounts = items.filter((account) => !results[account.id]);

      for (const accountBatch of chunkItems(missingAccounts, 8)) {
        const entries = await Promise.all(
          accountBatch.map(async (account) => {
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
        Object.assign(results, Object.fromEntries(entries));
        queryClient.setQueryData<Record<number, AccountTotalSummary>>(totalStatsQueryKey, { ...results });
      }

      return results;
    },
  });

  const todayByAccountId = useMemo(() => {
    const next = new Map<number, AccountTodaySummary>();
    items.forEach((account) => {
      const result = todayStatsQuery.data?.[account.id];
      next.set(account.id, normalizeTodaySummary(result));
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
      if (filter === 'limited') return visualStatus.filterKey === 'limited';
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
    setEditLoadFactor(account.load_factor !== undefined && account.load_factor !== null ? String(account.load_factor) : '');
    setEditRateMultiplier(account.rate_multiplier !== undefined ? String(account.rate_multiplier) : '');
    setEditProxyId(account.proxy_id !== undefined && account.proxy_id !== null ? String(account.proxy_id) : '');
    setEditGroupIds(account.group_ids?.join(',') || account.groups?.map((group) => group.id).join(',') || '');
    setEditPrivacyMode(account.privacy_mode || '');
    setEditExpiresAt(account.expires_at || '');
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

  async function toggleAccountModelPicker(account: AdminAccount) {
    if (expandedModelAccountId === account.id) {
      setExpandedModelAccountId(null);
      return;
    }

    setExpandedModelAccountId(account.id);
    const inlineOptions = getAccountInlineModelOptions(account);
    if (inlineOptions.length > 0) {
      setModelsByAccountId((current) => ({ ...current, [account.id]: current[account.id] ?? inlineOptions }));
      const defaultModel = getDefaultAccountTestModel(account, inlineOptions);
      if (defaultModel) {
        setSelectedModelByAccountId((current) => current[account.id] ? current : { ...current, [account.id]: defaultModel });
      }
    }

    if (modelsByAccountId[account.id]) return;

    setLoadingModelAccountId(account.id);
    try {
      const payload = await getAccountModels(account.id);
      const remoteOptions = collectAccountModelOptions(payload.models);
      const nextOptions = uniqueAccountModelOptions([...remoteOptions, ...inlineOptions]).slice(0, 16);
      setModelsByAccountId((current) => ({ ...current, [account.id]: nextOptions }));
      const defaultModel = getDefaultAccountTestModel(account, nextOptions);
      if (defaultModel) {
        setSelectedModelByAccountId((current) => current[account.id] ? current : { ...current, [account.id]: defaultModel });
      }
      if (nextOptions.length === 0) {
        Alert.alert('暂无模型', '未获取到该账号可选模型。');
      }
    } catch (error) {
      if (inlineOptions.length === 0) {
        Alert.alert('模型加载失败', getErrorMessage(error));
      }
    } finally {
      setLoadingModelAccountId((current) => (current === account.id ? null : current));
    }
  }

  function selectAccountTestModel(accountId: number, model?: string) {
    setSelectedModelByAccountId((current) => {
      const next = { ...current };
      if (model) {
        next[accountId] = model;
      } else {
        delete next[accountId];
      }
      return next;
    });
    setExpandedModelAccountId(null);
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
    const limited = items.filter((item) => getAccountVisualStatus(item).filterKey === 'limited').length;
    return { total, active, paused, errors, limited };
  }, [items]);

  const listHeader = useMemo(
    () => (
      <View className="pb-2">
        <View
          style={{
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderRadius: 20,
            borderWidth: 1,
            padding: 10,
            shadowColor: colors.primary,
            shadowOffset: { height: 8, width: 0 },
            shadowOpacity: colors.mode === 'dark' ? 0.1 : 0.08,
            shadowRadius: 18,
          }}
        >
          <View
            style={{
              alignItems: 'center',
              backgroundColor: colors.mode === 'dark' ? '#141f31' : '#f4f7fb',
              borderColor: colors.border,
              borderRadius: 18,
              borderWidth: 1,
              flexDirection: 'row',
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
          >
            <Search color={colors.primary} size={18} />
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
              { key: 'all', label: `全部 ${summary.total}`, icon: Gauge },
              { key: 'active', label: `正常 ${summary.active}`, icon: CircleCheck },
              { key: 'paused', label: `暂停 ${summary.paused}`, icon: Clock3 },
              { key: 'error', label: `异常 ${summary.errors}`, icon: AlertCircle },
            ] as Array<{ key: AccountStatusFilter; label: string; icon: LucideIcon }>).map((item) => {
              const active = filter === item.key;
              const Icon = item.icon;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => setFilter(item.key)}
                  style={{
                    alignItems: 'center',
                    backgroundColor: active ? colors.primary : colors.mutedCard,
                    borderColor: active ? colors.primary : colors.border,
                    borderRadius: 999,
                    borderWidth: 1,
                    flex: 1,
                    flexDirection: 'row',
                    gap: 5,
                    justifyContent: 'center',
                    minWidth: 0,
                    paddingHorizontal: 8,
                    paddingVertical: 8,
                  }}
                >
                  <Icon color={active ? colors.primaryText : colors.badgeDefaultText} size={12} />
                  <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: active ? colors.primaryText : colors.badgeDefaultText, fontSize: 12, fontWeight: '700' }}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View className="mt-3 flex-row gap-2">
            {([
              { key: 'usage-desc', label: '请求高→低' },
              { key: 'usage-asc', label: '请求低→高' },
            ] as Array<{ key: UsageSort; label: string }>).map((item) => {
              const active = usageSort === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => setUsageSort(item.key)}
                  style={{
                    alignItems: 'center',
                    backgroundColor: active ? colors.dark : colors.mutedCard,
                    borderColor: active ? colors.dark : colors.border,
                    borderRadius: 999,
                    borderWidth: 1,
                    flex: 1,
                    flexDirection: 'row',
                    gap: 6,
                    justifyContent: 'center',
                    minWidth: 0,
                    paddingHorizontal: 8,
                    paddingVertical: 10,
                  }}
                >
                  <ArrowDownUp color={active ? colors.primaryText : colors.badgeDefaultText} size={13} />
                  <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: active ? colors.primaryText : colors.badgeDefaultText, fontSize: 12, fontWeight: '700' }}>{item.label}</Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => setFilter('limited')}
              style={{
                alignItems: 'center',
                backgroundColor: filter === 'limited' ? colors.primary : colors.mutedCard,
                borderColor: filter === 'limited' ? colors.primary : colors.border,
                borderRadius: 999,
                borderWidth: 1,
                flex: 1,
                flexDirection: 'row',
                gap: 6,
                justifyContent: 'center',
                minWidth: 0,
                paddingHorizontal: 8,
                paddingVertical: 10,
              }}
            >
              <Gauge color={filter === 'limited' ? colors.primaryText : colors.badgeDefaultText} size={13} />
              <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: filter === 'limited' ? colors.primaryText : colors.badgeDefaultText, fontSize: 12, fontWeight: '700' }}>
                限流 {summary.limited}
              </Text>
            </Pressable>
          </View>

          <View className="mt-3 flex-row gap-2">
            <Pressable
              disabled={filteredItems.length === 0 || batchRefreshMutation.isPending}
              onPress={() => confirmBatch('refresh')}
              style={{ alignItems: 'center', backgroundColor: colors.primary, borderRadius: 999, flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', opacity: filteredItems.length === 0 ? 0.6 : 1, paddingHorizontal: 12, paddingVertical: 11 }}
            >
              <RefreshCw color={colors.primaryText} size={13} />
              <Text style={{ color: colors.primaryText, fontSize: 12, fontWeight: '800' }}>
                {batchRefreshMutation.isPending ? '刷新中...' : '批量刷新'}
              </Text>
            </Pressable>
            <Pressable
              disabled={filteredItems.length === 0 || batchClearErrorMutation.isPending}
              onPress={() => confirmBatch('clear-error')}
              style={{ alignItems: 'center', backgroundColor: colors.errorBg, borderRadius: 999, flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', opacity: filteredItems.length === 0 ? 0.6 : 1, paddingHorizontal: 12, paddingVertical: 11 }}
            >
              <ShieldOff color={colors.errorText} size={13} />
              <Text style={{ color: colors.errorText, fontSize: 12, fontWeight: '800' }}>
                {batchClearErrorMutation.isPending ? '清理中...' : '批量清错'}
              </Text>
            </Pressable>
          </View>

          <View className="mt-3">
            <Pressable
              onPress={() => setToolsOpen((value) => !value)}
              style={{ alignItems: 'center', backgroundColor: colors.mutedCard, borderColor: colors.border, borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10 }}
            >
              <Download color={colors.badgeDefaultText} size={13} />
              <Text style={{ color: colors.badgeDefaultText, fontSize: 12, fontWeight: '800' }}>
                {toolsOpen ? '收起导入/导出' : '导入/导出'}
              </Text>
            </Pressable>

            {toolsOpen ? (
              <View style={{ backgroundColor: colors.mutedCard, borderColor: colors.border, borderRadius: 16, borderWidth: 1, gap: 10, marginTop: 10, padding: 10 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    disabled={filteredItems.length === 0 || exportDataMutation.isPending}
                    onPress={() => {
                      setToolsMessage(null);
                      exportDataMutation.mutate();
                    }}
                    style={{ alignItems: 'center', backgroundColor: colors.primary, borderRadius: 12, flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', opacity: filteredItems.length === 0 ? 0.6 : 1, paddingVertical: 11 }}
                  >
                    <Download color={colors.primaryText} size={13} />
                    <Text style={{ color: colors.primaryText, fontSize: 12, fontWeight: '800' }}>{exportDataMutation.isPending ? '导出中...' : '导出文件'}</Text>
                  </Pressable>
                  <Pressable
                    disabled={importDataMutation.isPending}
                    onPress={() => {
                      setToolsMessage(null);
                      importDataMutation.mutate();
                    }}
                    style={{ alignItems: 'center', backgroundColor: colors.dark, borderRadius: 12, flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', paddingVertical: 11 }}
                  >
                    <Upload color={colors.primaryText} size={13} />
                    <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: colors.primaryText, fontSize: 12, fontWeight: '800' }}>{importDataMutation.isPending ? '导入中...' : '选择文件导入'}</Text>
                  </Pressable>
                </View>
                {toolsMessage ? (
                  <View style={{ backgroundColor: toolsMessage.includes('失败') || toolsMessage.includes('必须') || toolsMessage.includes('不能为空') ? colors.errorBg : colors.successBg, borderRadius: 12, padding: 10 }}>
                    <Text style={{ color: toolsMessage.includes('失败') || toolsMessage.includes('必须') || toolsMessage.includes('不能为空') ? colors.errorText : colors.success, fontSize: 12 }}>{toolsMessage}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </View>
    ),
    [batchClearErrorMutation.isPending, batchRefreshMutation.isPending, colors, exportDataMutation.isPending, filter, filteredItems, importDataMutation.isPending, summary.active, summary.errors, summary.limited, summary.paused, summary.total, toolsMessage, toolsOpen, usageSort]
  );

  const renderItem = useCallback(
    ({ item: account }: { item: (typeof filteredItems)[number] }) => {
      const isError = getAccountError(account);
      const errorDetail = isError ? getAccountErrorDetail(account) : undefined;
      const visualStatus = getAccountVisualStatus(account);
      const statusText = visualStatus.label;
      const todayStats = todayByAccountId.get(account.id) ?? { requests: 0, tokens: 0, cost: 0, standardCost: 0, userCost: 0 };
      const totalStats = totalByAccountId.get(account.id) ?? { requests: 0, tokens: 0, cost: 0 };
      const nextSchedulable = visualStatus.filterKey === 'paused' || (visualStatus.filterKey === 'limited' && account.schedulable === false);
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
      const selectedModel = selectedModelByAccountId[account.id];
      const modelOptions = modelsByAccountId[account.id] ?? getAccountInlineModelOptions(account);
      const isModelPickerOpen = expandedModelAccountId === account.id;
      const isModelLoading = loadingModelAccountId === account.id;
      const selectedModelLabel = modelOptions.find((option) => option.value === selectedModel)?.label ?? selectedModel;

      return (
        <Pressable onPress={() => router.push(`/accounts/${account.id}`)}>
          <ListCard
            title={account.name}
            meta={`#${account.id} · ${account.platform} · ${account.type}`}
            badge={statusText}
            badgeTone={visualStatus.badgeTone}
            compact
            icon={KeyRound}
            metaInline
          >
            <View style={{ gap: 6 }}>
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  {account.schedulable && !isError ? <ShieldCheck color={colors.subtext} size={12} /> : <ShieldOff color={colors.subtext} size={12} />}
                  <Text style={{ color: colors.subtext, fontSize: 12 }}>状态：{statusText}</Text>
                </View>
                <Text style={{ color: colors.subtext, fontSize: 10 }}>最近使用 {formatTime(account.last_used_at || account.updated_at)}</Text>
              </View>

              {errorDetail ? (
                <View style={{ alignItems: 'flex-start', backgroundColor: colors.errorBg, borderRadius: 12, flexDirection: 'row', gap: 8, padding: 9 }}>
                  <AlertCircle color={colors.errorText} size={15} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.errorText, fontSize: 11, fontWeight: '800' }}>异常原因</Text>
                    <Text numberOfLines={3} style={{ color: colors.errorText, fontSize: 11, lineHeight: 16, marginTop: 3 }}>{errorDetail}</Text>
                  </View>
                </View>
              ) : null}

              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <AccountStatTile colors={colors} icon={Activity} label="今日请求" tone="todayRequests" value={formatReqValue(todayStats.requests)} />
                  <AccountStatTile colors={colors} icon={Cpu} label="今日 Token" tone="todayTokens" value={formatTokenValue(todayStats.tokens)} />
                  <AccountStatTile colors={colors} detail={`U ${formatMoneyValue(todayStats.userCost)}`} icon={DollarSign} label="今日额度" tone="todayQuota" value={`A ${formatMoneyValue(todayStats.cost)}`} />
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <AccountStatTile colors={colors} icon={Hash} label="总请求" tone="totalRequests" value={formatReqValue(totalStats.requests)} />
                  <AccountStatTile colors={colors} icon={Cpu} label="总 Token" tone="totalTokens" value={formatTokenValue(totalStats.tokens)} />
                  <AccountStatTile colors={colors} icon={Wallet} label="总额度" tone="totalQuota" value={formatMoneyValue(totalStats.cost)} />
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
                <View style={{ backgroundColor: colors.mutedCard, borderRadius: 14, padding: 8 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    <Field label="名称" value={editName} onChangeText={setEditName} placeholder="账号名称" />
                    <Field label="优先级" value={editPriority} onChangeText={setEditPriority} placeholder="0" keyboardType="number-pad" />
                    <Field label="并发" value={editConcurrency} onChangeText={setEditConcurrency} placeholder="留空不改" keyboardType="number-pad" />
                    <Field label="权重" value={editLoadFactor} onChangeText={setEditLoadFactor} placeholder="load_factor" keyboardType="decimal-pad" />
                    <Field label="倍率" value={editRateMultiplier} onChangeText={setEditRateMultiplier} placeholder="1" keyboardType="decimal-pad" />
                    <Field label="代理 ID" value={editProxyId} onChangeText={setEditProxyId} placeholder="null 可清空" />
                    <Field label="分组 ID" value={editGroupIds} onChangeText={setEditGroupIds} placeholder="1,2,5" />
                    <Field label="隐私模式" value={editPrivacyMode} onChangeText={setEditPrivacyMode} placeholder="privacy/default" />
                    <Field label="过期时间" value={editExpiresAt} onChangeText={setEditExpiresAt} placeholder="2026-12-31T23:59:59+08:00" />
                    <Field label="备注" value={editNotes} onChangeText={setEditNotes} placeholder="备注" />
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
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

              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Pressable
                    style={{ alignItems: 'center', backgroundColor: colors.mutedCard, borderRadius: 999, flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', minWidth: 0, paddingHorizontal: 8, paddingVertical: 6 }}
                    onPress={(event) => {
                      event.stopPropagation();
                      startEditAccount(account);
                    }}
                  >
                    <Pencil color={colors.badgeDefaultText} size={13} />
                    <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: colors.badgeDefaultText, fontSize: 12, fontWeight: '800' }}>编辑</Text>
                  </Pressable>
                  <Pressable
                    disabled={accountStatusMutation.isPending}
                    style={{ alignItems: 'center', backgroundColor: colors.mutedCard, borderRadius: 999, flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', minWidth: 0, paddingHorizontal: 8, paddingVertical: 6 }}
                    onPress={(event) => {
                      event.stopPropagation();
                      accountStatusMutation.mutate({ account, enabled: nextEnabled });
                    }}
                  >
                    <Power color={nextEnabled ? colors.success : colors.badgeDefaultText} size={13} />
                    <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: nextEnabled ? colors.success : colors.badgeDefaultText, fontSize: 12, fontWeight: '800' }}>{nextEnabled ? '启用' : '禁用'}</Text>
                  </Pressable>
                  <Pressable
                    style={{ alignItems: 'center', backgroundColor: colors.mutedCard, borderRadius: 999, flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', minWidth: 0, paddingHorizontal: 8, paddingVertical: 6 }}
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
                    {nextSchedulable ? <CircleCheck color={colors.success} size={13} /> : <Clock3 color={colors.badgeDefaultText} size={13} />}
                    <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: nextSchedulable ? colors.success : colors.badgeDefaultText, fontSize: 12, fontWeight: '800' }}>{isTogglingCurrent ? '处理中...' : toggleLabel}</Text>
                  </Pressable>
                  <Pressable
                    disabled={accountDeleteMutation.isPending}
                    style={{ alignItems: 'center', backgroundColor: colors.errorBg, borderRadius: 999, flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', minWidth: 0, paddingHorizontal: 8, paddingVertical: 6 }}
                    onPress={(event) => {
                      event.stopPropagation();
                      confirmDeleteAccount(account);
                    }}
                  >
                    <Trash2 color={colors.errorText} size={13} />
                    <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: colors.errorText, fontSize: 12, fontWeight: '800' }}>删除</Text>
                  </Pressable>
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Pressable
                    style={{ alignItems: 'center', backgroundColor: colors.dark, borderRadius: 999, flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', minWidth: 0, paddingHorizontal: 8, paddingVertical: 6 }}
                    disabled={isTestingCurrent}
                    onPress={(event) => {
                      event.stopPropagation();
                      setTestingAccountId(account.id);
                      testMutation.mutate({ accountId: account.id, modelId: selectedModel }, {
                        onSuccess: () => {
                          setTestFeedbackByAccountId((current) => ({ ...current, [account.id]: selectedModelLabel ? `测试成功：${selectedModelLabel}` : '测试成功' }));
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
                    <Activity color={colors.primaryText} size={13} />
                    <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: colors.primaryText, fontSize: 12, fontWeight: '800' }}>{isTestingCurrent ? '测试中...' : '测试'}</Text>
                  </Pressable>
                  <Pressable
                    style={{
                      alignItems: 'center',
                      backgroundColor: selectedModel ? colors.successBg : colors.mutedCard,
                      borderRadius: 999,
                      flex: 3,
                      flexDirection: 'row',
                      gap: 6,
                      minWidth: 0,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                    }}
                    onPress={(event) => {
                      event.stopPropagation();
                      void toggleAccountModelPicker(account);
                    }}
                  >
                    <Cpu color={selectedModel ? colors.success : colors.badgeDefaultText} size={13} />
                    <Text numberOfLines={1} style={{ color: selectedModel ? colors.success : colors.badgeDefaultText, flex: 1, fontSize: 12, fontWeight: '800' }}>
                      {isModelLoading ? '模型加载中' : selectedModelLabel ? `模型 ${selectedModelLabel}` : '选择模型'}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {isModelPickerOpen ? (
                <View style={{ backgroundColor: colors.mutedCard, borderColor: colors.border, borderRadius: 14, borderWidth: 1, gap: 6, padding: 8 }}>
                  <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={{ color: colors.text, fontSize: 12, fontWeight: '800' }}>测试模型</Text>
                    <Text style={{ color: colors.subtext, fontSize: 11 }}>{isModelLoading ? '加载中...' : `${modelOptions.length} 个可选`}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        selectAccountTestModel(account.id);
                      }}
                      style={{
                        backgroundColor: !selectedModel ? colors.primary : colors.surface,
                        borderColor: !selectedModel ? colors.primary : colors.border,
                        borderRadius: 999,
                        borderWidth: 1,
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                      }}
                    >
                      <Text style={{ color: !selectedModel ? colors.primaryText : colors.badgeDefaultText, fontSize: 11, fontWeight: '800' }}>默认模型</Text>
                    </Pressable>
                    {modelOptions.map((option) => {
                      const active = selectedModel === option.value;
                      return (
                        <Pressable
                          key={option.value}
                          disabled={option.disabled}
                          onPress={(event) => {
                            event.stopPropagation();
                            selectAccountTestModel(account.id, option.value);
                          }}
                          style={{
                            backgroundColor: active ? colors.primary : colors.surface,
                            borderColor: active ? colors.primary : colors.border,
                            borderRadius: 999,
                            borderWidth: 1,
                            opacity: option.disabled ? 0.48 : 1,
                            paddingHorizontal: 10,
                            paddingVertical: 7,
                          }}
                        >
                          <Text numberOfLines={1} style={{ color: active ? colors.primaryText : colors.badgeDefaultText, fontSize: 11, fontWeight: '800', maxWidth: 168 }}>
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                    {!isModelLoading && modelOptions.length === 0 ? (
                      <Text style={{ color: colors.subtext, fontSize: 12 }}>暂无可选模型，可先同步模型后再试。</Text>
                    ) : null}
                  </View>
                </View>
              ) : null}

              {testFeedback ? <Text style={{ color: colors.success, fontSize: 12 }}>测试结果：{testFeedback}</Text> : null}
            </View>
          </ListCard>
        </Pressable>
      );
    },
    [accountDeleteMutation, accountEditMutation, accountStatusMutation, colors, confirmQuotaReset, editConcurrency, editExpiresAt, editGroupIds, editLoadFactor, editName, editNotes, editPriority, editPrivacyMode, editProxyId, editRateMultiplier, editingAccountId, expandedModelAccountId, handleQuotaCount, handleQuotaQuery, loadingModelAccountId, modelsByAccountId, quotaInfoByAccountId, quotaQueryingAccountId, quotaResettingAccountId, selectedModelByAccountId, testFeedbackByAccountId, testMutation, testingAccountId, todayByAccountId, toggleMutation, togglingAccountId, totalByAccountId]
  );

  const emptyState = useMemo(
    () => (
      <ListCard
        title={accountsQuery.isLoading ? '正在加载账号' : '暂无账号'}
        meta={accountsQuery.isLoading ? '正在读取账号清单，请稍候。' : errorMessage || '连上后这里会展示账号列表。'}
        icon={KeyRound}
      />
    ),
    [accountsQuery.isLoading, errorMessage]
  );

  return (
    <ScreenShell
      title="账号清单"
      subtitle="查看名称、平台&类型、请求次数、消费金额、token消耗，并支持筛选与排序。"
      icon={KeyRound}
      titleAside={(
        <Text style={{ color: colors.subtext, fontSize: 11 }}>更接近网页后台的账号视图。</Text>
      )}
      subtitleLines={2}
      variant="minimal"
      scroll={false}
      safeAreaEdges={safeAreaEdges}
      bottomInsetClassName="pb-6"
      contentGapClassName="mt-2 gap-2"
    >
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 6, flexGrow: 1 }}
        data={filteredItems}
        renderItem={renderItem}
        keyExtractor={(item) => `${item.id}`}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={accountsQuery.isRefetching || todayStatsQuery.isRefetching} onRefresh={() => {
          void accountsQuery.refetch();
          void todayStatsQuery.refetch();
          void totalStatsQuery.refetch();
        }} tintColor={colors.primary} />}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyState}
        ItemSeparatorComponent={() => <View className="h-2" />}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
      />
    </ScreenShell>
  );
}
