import { useQuery } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import {
  Activity,
  BarChart3,
  CircleDollarSign,
  Clock3,
  DatabaseZap,
  Gauge,
  LayoutDashboard,
  PieChart,
  ShieldCheck,
  TrendingUp,
  Zap,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { BarChartCard } from '@/src/components/bar-chart-card';
import { DonutChartCard } from '@/src/components/donut-chart-card';
import { IconBadge } from '@/src/components/icon-badge';
import { LineTrendChart } from '@/src/components/line-trend-chart';
import { useAutoRefresh } from '@/src/hooks/use-auto-refresh';
import { isAccountRateLimited } from '@/src/lib/account-status';
import { formatTokenValue } from '@/src/lib/formatters';
import { useAppTheme } from '@/src/lib/theme';
import { getAdminSettings, getDashboardModels, getDashboardSnapshot, getDashboardStats, getDashboardTrend, getOpsDashboardOverview, listAllAccounts } from '@/src/services/admin';
import { adminConfigState, hasAuthenticatedAdminSession } from '@/src/store/admin-config';
import type { AdminAccount } from '@/src/types/admin';

const { useSnapshot } = require('valtio/react');

type RangeKey = 'today' | '24h' | '7d' | '30d';
type GroupUsageMode = 'tokens' | 'actualCost';

type GroupUsageRow = {
  id: string;
  name: string;
  requests: number;
  tokens: number;
  actualCost: number;
  standardCost: number;
};

const MONITOR_RANGE_STORAGE_KEY = 'sub2api_monitor_range_key';
const DEFAULT_RANGE_KEY: RangeKey = '7d';
let cachedMonitorRangeKey: RangeKey = DEFAULT_RANGE_KEY;
const GROUP_USAGE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#f97316'];

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
  { key: 'today', label: '今日' },
  { key: '24h', label: '24H' },
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
];

const RANGE_TITLE_MAP: Record<RangeKey, string> = {
  today: '今日',
  '24h': '24H',
  '7d': '7D',
  '30d': '30D',
};

function isRangeKey(value?: string | null): value is RangeKey {
  return value === 'today' || value === '24h' || value === '7d' || value === '30d';
}

async function readStoredMonitorRangeKey() {
  try {
    const value = Platform.OS === 'web'
      ? typeof localStorage === 'undefined'
        ? null
        : localStorage.getItem(MONITOR_RANGE_STORAGE_KEY)
      : await SecureStore.getItemAsync(MONITOR_RANGE_STORAGE_KEY);

    return isRangeKey(value) ? value : null;
  } catch {
    return null;
  }
}

async function writeStoredMonitorRangeKey(value: RangeKey) {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(MONITOR_RANGE_STORAGE_KEY, value);
      }

      return;
    }

    await SecureStore.setItemAsync(MONITOR_RANGE_STORAGE_KEY, value);
  } catch {
    return;
  }
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

function getDateRange(rangeKey: RangeKey) {
  const end = new Date();
  const start = new Date();

  if (rangeKey === 'today') {
    start.setHours(0, 0, 0, 0);
  } else if (rangeKey === '24h') {
    start.setHours(end.getHours() - 23, 0, 0, 0);
  } else if (rangeKey === '30d') {
    start.setDate(end.getDate() - 29);
  } else {
    start.setDate(end.getDate() - 6);
  }

  const toDate = (value: Date) =>
    `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

  return {
    start_date: toDate(start),
    end_date: toDate(end),
    granularity: rangeKey === 'today' || rangeKey === '24h' ? ('hour' as const) : ('day' as const),
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

function formatTokenDisplay(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  return formatTokenValue(value);
}

function getPointLabel(value: string, rangeKey: RangeKey) {
  if (rangeKey === 'today' || rangeKey === '24h') {
    return value.slice(11, 13);
  }

  return value.slice(5, 10);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    switch (error.message) {
      case 'BASE_URL_REQUIRED':
        return '请先去服务器页填写服务地址。';
      case 'ADMIN_API_KEY_REQUIRED':
        return '请先去服务器页填写 Admin Token。';
      case 'INVALID_SERVER_RESPONSE':
        return '当前服务返回的数据格式不正确，请确认它是可用的 Sub2API 管理接口。';
      default:
        return error.message;
    }
  }

  return '当前无法加载概览数据，请检查服务地址、Token 和网络。';
}

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

function optionalNumberFrom(source: Record<string, unknown> | undefined, keys: string[]) {
  if (!source) return undefined;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const number = Number(value.replace(/,/g, ''));
      if (Number.isFinite(number)) return number;
    }
  }

  return undefined;
}

function nestedRecordFrom(source: Record<string, unknown> | undefined, keys: string[]) {
  if (!source) return undefined;

  for (const key of keys) {
    if (isRecord(source[key])) return source[key];
  }

  return undefined;
}

const AVERAGE_DURATION_MS_KEYS = [
  'avg_response_time_ms',
  'avgResponseTimeMs',
  'average_response_time_ms',
  'averageResponseTimeMs',
  'avg_response_ms',
  'avgResponseMs',
  'avg_latency_ms',
  'avgLatencyMs',
  'average_latency_ms',
  'averageLatencyMs',
  'duration_avg_ms',
  'durationAvgMs',
  'avg_duration_ms',
  'avgDurationMs',
  'average_duration_ms',
  'averageDurationMs',
];

function averageDurationFromTrend(trend: unknown[]) {
  let weightedDuration = 0;
  let requestCount = 0;
  let durationTotal = 0;
  let durationCount = 0;

  for (const item of trend) {
    if (!isRecord(item)) continue;

    const duration = optionalNumberFrom(item, AVERAGE_DURATION_MS_KEYS);
    if (duration === undefined || duration < 0) continue;

    const requests = optionalNumberFrom(item, [
      'requests',
      'total_requests',
      'totalRequests',
      'request_count',
      'requestCount',
      'success_count',
      'successCount',
    ]) ?? 0;

    durationTotal += duration;
    durationCount += 1;
    if (requests > 0) {
      weightedDuration += duration * requests;
      requestCount += requests;
    }
  }

  if (requestCount > 0) return weightedDuration / requestCount;
  return durationCount > 0 ? durationTotal / durationCount : undefined;
}

function formatAverageResponse(
  stats?: Record<string, unknown>,
  opsOverview?: Record<string, unknown>,
  trend: unknown[] = []
) {
  const seconds = optionalNumberFrom(stats, [
    'avg_response_seconds',
    'avgResponseSeconds',
    'average_response_seconds',
    'averageResponseSeconds',
  ]);
  if (seconds !== undefined) return `${seconds.toFixed(2)}s`;

  const durationMetrics = nestedRecordFrom(opsOverview, ['duration', 'latency']);
  const milliseconds = optionalNumberFrom(stats, AVERAGE_DURATION_MS_KEYS)
    ?? optionalNumberFrom(opsOverview, AVERAGE_DURATION_MS_KEYS)
    ?? optionalNumberFrom(durationMetrics, ['avg_ms', 'avgMs', 'average_ms', 'averageMs', 'avg', 'average'])
    ?? averageDurationFromTrend(trend);
  if (milliseconds !== undefined) return `${(milliseconds / 1000).toFixed(2)}s`;

  const generic = optionalNumberFrom(stats, ['avg_response_time', 'avgResponseTime', 'average_response_time', 'averageResponseTime'])
    ?? optionalNumberFrom(opsOverview, ['avg_response_time', 'avgResponseTime', 'average_response_time', 'averageResponseTime']);
  if (generic !== undefined) return `${(generic >= 1000 ? generic / 1000 : generic).toFixed(2)}s`;

  return '--';
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
      const actualCost = numberFrom(item, ['total_actual_cost', 'actual_cost', 'actualCost', 'actual', 'cost']);
      const standardCost = numberFrom(item, ['total_cost', 'standard_cost', 'standardCost', 'cost']) || actualCost;

      return {
        id: groupId ?? `${name}-${index}`,
        name,
        requests: numberFrom(item, ['requests', 'total_requests', 'totalRequests', 'request_count', 'requestCount']),
        tokens: numberFrom(item, ['total_tokens', 'totalTokens', 'tokens', 'token_consumed', 'tokenConsumed']),
        actualCost,
        standardCost,
      };
    })
    .filter((item): item is GroupUsageRow => Boolean(item))
    .sort((left, right) => right.tokens - left.tokens || right.actualCost - left.actualCost || right.requests - left.requests);
}

function Section({
  title,
  subtitle,
  children,
  right,
  icon,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  icon?: LucideIcon;
}) {
  const colors = useAppTheme();

  return (
    <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, flexDirection: 'row', gap: 10 }}>
          {icon ? <IconBadge icon={icon} containerSize={36} size={17} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{title}</Text>
            {subtitle ? <Text style={{ marginTop: 6, fontSize: 12, color: colors.subtext }}>{subtitle}</Text> : null}
          </View>
        </View>
        {right}
      </View>
      <View style={{ marginTop: 14 }}>{children}</View>
    </View>
  );
}

type StatCardTone = 'primary' | 'success' | 'danger' | 'accent' | 'muted';

function StatCard({
  title,
  value,
  detail,
  icon,
  tone = 'primary',
}: {
  title: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
  tone?: StatCardTone;
}) {
  const colors = useAppTheme();
  const palette = {
    primary: { border: colors.mode === 'dark' ? '#294a7d' : '#d9e7ff', detail: colors.primary },
    success: { border: colors.mode === 'dark' ? '#14584b' : '#ccefe0', detail: colors.success },
    danger: { border: colors.mode === 'dark' ? '#7f1d2f' : '#ffd9e2', detail: colors.danger },
    accent: { border: colors.mode === 'dark' ? '#6b4b14' : '#fde7bd', detail: colors.accentText },
    muted: { border: colors.border, detail: colors.subtext },
  }[tone];

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderColor: palette.border,
        borderRadius: 16,
        borderWidth: 1,
        elevation: 2,
        flex: 1,
        minHeight: 80,
        paddingHorizontal: 10,
        paddingVertical: 8,
        shadowColor: colors.mode === 'dark' ? '#000000' : '#64748b',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: colors.mode === 'dark' ? 0.2 : 0.08,
        shadowRadius: 7,
      }}
    >
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 7, minHeight: 28 }}>
        <IconBadge icon={icon} tone={tone} containerSize={28} size={14} />
        <Text adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={1} style={{ color: colors.subtext, flex: 1, fontSize: 11, fontWeight: '600' }}>{title}</Text>
      </View>
      <Text adjustsFontSizeToFit minimumFontScale={0.78} numberOfLines={1} style={{ color: colors.text, fontSize: 17, fontWeight: '800', lineHeight: 21, marginTop: 2 }}>{value}</Text>
      {detail ? (
        <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={{ color: palette.detail, fontSize: 10, fontWeight: '600', lineHeight: 12, marginTop: 1 }}>
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

function GroupUsageDistribution({
  rows,
  loading,
  error,
  rangeTitle,
}: {
  rows: GroupUsageRow[];
  loading: boolean;
  error?: unknown;
  rangeTitle: string;
}) {
  const colors = useAppTheme();
  const [mode, setMode] = useState<GroupUsageMode>('tokens');
  const metricValue = (row: GroupUsageRow) => (mode === 'tokens' ? row.tokens : row.actualCost);
  const sortedRows = useMemo(
    () => [...rows].sort((left, right) => metricValue(right) - metricValue(left)),
    [mode, rows]
  );
  const visibleRows = sortedRows.slice(0, 6);
  const chartRows = sortedRows.slice(0, 5);
  const otherValue = sortedRows.slice(5).reduce((sum, row) => sum + metricValue(row), 0);
  const chartSegments = [
    ...chartRows.map((row, index) => ({ label: row.name, value: metricValue(row), color: GROUP_USAGE_COLORS[index % GROUP_USAGE_COLORS.length] })),
    ...(otherValue > 0 ? [{ label: '其它', value: otherValue, color: colors.chartTrack }] : []),
  ].filter((item) => item.value > 0);
  const total = Math.max(chartSegments.reduce((sum, segment) => sum + segment.value, 0), 1);
  const size = 148;
  const strokeWidth = 18;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 16 }}>
      <View style={{ alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' }}>
        <View style={{ flex: 1, flexDirection: 'row', gap: 10, minWidth: 170 }}>
          <IconBadge icon={PieChart} tone="primary" containerSize={36} size={17} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>分组使用分布</Text>
            <Text style={{ color: colors.subtext, fontSize: 12, lineHeight: 17, marginTop: 4 }}>{rangeTitle} 分组请求、Token 与费用分布</Text>
          </View>
        </View>
        <View style={{ backgroundColor: colors.mutedCard, borderColor: colors.border, borderRadius: 999, borderWidth: 1, flexDirection: 'row', padding: 2 }}>
          {([
            { key: 'tokens', label: '按 Token' },
            { key: 'actualCost', label: '按实际消耗' },
          ] as Array<{ key: GroupUsageMode; label: string }>).map((item) => {
            const active = mode === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setMode(item.key)}
                style={{ backgroundColor: active ? colors.surface : 'transparent', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}
              >
                <Text style={{ color: active ? colors.text : colors.subtext, fontSize: 12, fontWeight: '700' }}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {loading ? (
        <Text style={{ color: colors.subtext, fontSize: 13, marginTop: 18 }}>正在加载分组使用数据...</Text>
      ) : error ? (
        <Text style={{ color: colors.danger, fontSize: 13, lineHeight: 20, marginTop: 18 }}>{getErrorMessage(error)}</Text>
      ) : visibleRows.length === 0 ? (
        <Text style={{ color: colors.subtext, fontSize: 13, marginTop: 18 }}>当前时间范围暂无分组使用数据。</Text>
      ) : (
        <View style={{ gap: 16, marginTop: 16 }}>
          <View style={{ alignItems: 'center', gap: 14 }}>
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.chartTrack} strokeWidth={strokeWidth} fill="none" />
                {chartSegments.map((segment) => {
                  const length = (segment.value / total) * circumference;
                  const circleOffset = circumference - offset;
                  offset += length;

                  return (
                    <Circle
                      key={segment.label}
                      cx={size / 2}
                      cy={size / 2}
                      r={radius}
                      stroke={segment.color}
                      strokeWidth={strokeWidth}
                      fill="none"
                      strokeDasharray={`${length} ${circumference - length}`}
                      strokeDashoffset={circleOffset}
                      strokeLinecap="butt"
                      transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    />
                  );
                })}
              </Svg>
              <View style={{ alignItems: 'center', position: 'absolute' }}>
                <Text style={{ color: colors.subtext, fontSize: 11 }}>{mode === 'tokens' ? 'Token' : '实际'}</Text>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 3 }}>
                  {mode === 'tokens' ? formatTokenDisplay(total) : formatMoney(total)}
                </Text>
              </View>
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 2 }}>
              <Text style={{ color: colors.subtext, flex: 1.15, fontSize: 11, fontWeight: '800' }}>分组</Text>
              <Text style={{ color: colors.subtext, flex: 0.8, fontSize: 11, fontWeight: '800', textAlign: 'right' }}>请求</Text>
              <Text style={{ color: colors.subtext, flex: 1, fontSize: 11, fontWeight: '800', textAlign: 'right' }}>Token</Text>
              <Text style={{ color: colors.subtext, flex: 0.85, fontSize: 11, fontWeight: '800', textAlign: 'right' }}>实际</Text>
              <Text style={{ color: colors.subtext, flex: 0.85, fontSize: 11, fontWeight: '800', textAlign: 'right' }}>标准</Text>
            </View>
            {visibleRows.map((row, index) => (
              <View key={row.id} style={{ alignItems: 'center', borderTopColor: colors.border, borderTopWidth: index === 0 ? 0 : 1, flexDirection: 'row', gap: 6, paddingVertical: 8 }}>
                <View style={{ alignItems: 'center', flex: 1.15, flexDirection: 'row', gap: 7 }}>
                  <View style={{ backgroundColor: GROUP_USAGE_COLORS[index % GROUP_USAGE_COLORS.length], borderRadius: 999, height: 8, width: 8 }} />
                  <Text numberOfLines={1} style={{ color: colors.text, flex: 1, fontSize: 12, fontWeight: '700' }}>{row.name}</Text>
                </View>
                <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: colors.subtext, flex: 0.8, fontSize: 12, textAlign: 'right' }}>{formatCompactNumber(row.requests)}</Text>
                <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: colors.subtext, flex: 1, fontSize: 12, textAlign: 'right' }}>{formatTokenDisplay(row.tokens)}</Text>
                <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: colors.success, flex: 0.85, fontSize: 12, fontWeight: '800', textAlign: 'right' }}>{formatMoney(row.actualCost)}</Text>
                <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: colors.subtext, flex: 0.85, fontSize: 12, textAlign: 'right' }}>{formatMoney(row.standardCost)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

export default function MonitorScreen() {
  const colors = useAppTheme();
  const config = useSnapshot(adminConfigState);
  const hasAccount = hasAuthenticatedAdminSession(config);
  const [rangeKey, setRangeKey] = useState<RangeKey>(cachedMonitorRangeKey);
  const [rangeKeyReady, setRangeKeyReady] = useState(false);
  const rangeKeyTouchedRef = useRef(false);
  const range = useMemo(() => getDateRange(rangeKey), [rangeKey]);

  useEffect(() => {
    let mounted = true;

    readStoredMonitorRangeKey().then((storedRangeKey) => {
      if (!mounted) return;

      if (storedRangeKey && !rangeKeyTouchedRef.current) {
        cachedMonitorRangeKey = storedRangeKey;
        setRangeKey(storedRangeKey);
      }

      setRangeKeyReady(true);
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!rangeKeyReady) return;

    cachedMonitorRangeKey = rangeKey;
    void writeStoredMonitorRangeKey(rangeKey);
  }, [rangeKey, rangeKeyReady]);

  function selectRangeKey(nextRangeKey: RangeKey) {
    rangeKeyTouchedRef.current = true;
    cachedMonitorRangeKey = nextRangeKey;
    setRangeKey(nextRangeKey);

    if (!rangeKeyReady) {
      void writeStoredMonitorRangeKey(nextRangeKey);
    }
  }

  const statsQuery = useQuery({
    queryKey: ['monitor-stats'],
    queryFn: getDashboardStats,
    enabled: hasAccount,
    staleTime: 60_000,
  });
  const coreStatsReady = Boolean(statsQuery.data);
  const opsOverviewQuery = useQuery({
    queryKey: ['monitor-ops-overview'],
    queryFn: () => getOpsDashboardOverview({ window: '24h' }),
    enabled: hasAccount && coreStatsReady,
    staleTime: 60_000,
  });
  const settingsQuery = useQuery({
    queryKey: ['admin-settings'],
    queryFn: getAdminSettings,
    enabled: hasAccount,
    staleTime: 120_000,
  });
  const accountsQuery = useQuery({
    queryKey: ['accounts', 'all'],
    queryFn: () => listAllAccounts({ page_size: 100 }),
    enabled: hasAccount && coreStatsReady,
    staleTime: 120_000,
  });
  const trendQuery = useQuery({
    queryKey: ['monitor-trend', rangeKey, range.start_date, range.end_date, range.granularity],
    queryFn: () => getDashboardTrend(range),
    enabled: hasAccount && coreStatsReady && rangeKeyReady,
    staleTime: 60_000,
    placeholderData: (previousData) => previousData,
  });
  const modelsQuery = useQuery({
    queryKey: ['monitor-models', rangeKey, range.start_date, range.end_date],
    queryFn: () => getDashboardModels(range),
    enabled: hasAccount && coreStatsReady && rangeKeyReady,
    staleTime: 60_000,
    placeholderData: (previousData) => previousData,
  });
  const snapshotQuery = useQuery({
    queryKey: ['monitor-snapshot-groups', rangeKey, range.start_date, range.end_date, range.granularity],
    queryFn: () => getDashboardSnapshot({
      ...range,
      include_stats: false,
      include_trend: false,
      include_model_stats: false,
      include_group_stats: true,
    }),
    enabled: hasAccount && coreStatsReady && rangeKeyReady,
    staleTime: 60_000,
    placeholderData: (previousData) => previousData,
  });

  function refetchAll() {
    statsQuery.refetch();
    opsOverviewQuery.refetch();
    settingsQuery.refetch();
    accountsQuery.refetch();
    trendQuery.refetch();
    modelsQuery.refetch();
    snapshotQuery.refetch();
  }

  const stats = statsQuery.data;
  const statsRecord = isRecord(stats) ? stats : undefined;
  const opsOverviewRecord = isRecord(opsOverviewQuery.data) ? opsOverviewQuery.data : undefined;
  const siteName = settingsQuery.data?.site_name?.trim() || '管理控制台';
  const accounts = accountsQuery.data?.items ?? [];
  const trend = trendQuery.data?.trend ?? [];
  const topModels = (modelsQuery.data?.models ?? []).slice(0, 5);
  const groupUsageRows = useMemo(() => normalizeGroupUsageRows(snapshotQuery.data?.groups), [snapshotQuery.data?.groups]);
  const errorMessage = getErrorMessage(statsQuery.error);
  const currentPageErrorAccounts = accounts.filter(hasAccountError).length;
  const currentPageLimitedAccounts = accounts.filter((item) => isAccountRateLimited(item)).length;
  const currentPageBusyAccounts = accounts.filter((item) => {
    if (hasAccountError(item) || isAccountRateLimited(item)) return false;
    return (item.current_concurrency ?? 0) > 0;
  }).length;
  const totalAccounts = stats?.total_accounts ?? accountsQuery.data?.total ?? accounts.length;
  const aggregatedErrorAccounts = stats?.error_accounts ?? 0;
  const errorAccounts = Math.max(aggregatedErrorAccounts, currentPageErrorAccounts);
  const currentPageNormalAccounts = accounts.filter(isAccountNormal).length;
  const normalAccounts = stats?.normal_accounts ?? currentPageNormalAccounts;
  const latestTrendPoints = trend.slice(-6).reverse();
  const selectedTokenTotal = trend.reduce((sum, item) => sum + item.total_tokens, 0);
  const selectedCostTotal = trend.reduce((sum, item) => sum + item.cost, 0);
  const selectedOutputTotal = trend.reduce((sum, item) => sum + item.output_tokens, 0);
  const averageResponse = formatAverageResponse(statsRecord, opsOverviewRecord, trend);
  const currentRpm = stats?.rpm ?? optionalNumberFrom(opsOverviewRecord, ['rpm', 'requests_per_minute', 'requestsPerMinute']);
  const currentTpm = stats?.tpm ?? optionalNumberFrom(opsOverviewRecord, ['tpm', 'tokens_per_minute', 'tokensPerMinute']);
  const rangeTitle = RANGE_TITLE_MAP[rangeKey];
  const usesTodayFallback = rangeKey === 'today' || rangeKey === '24h';
  const isLoading = statsQuery.isLoading;
  const hasError = Boolean(statsQuery.error && !statsQuery.data);

  const throughputPoints = useMemo(
    () => trend.map((item) => ({ label: getPointLabel(item.date, rangeKey), value: item.total_tokens })),
    [rangeKey, trend]
  );
  const requestPoints = useMemo(
    () => trend.map((item) => ({ label: getPointLabel(item.date, rangeKey), value: item.requests })),
    [rangeKey, trend]
  );
  const costPoints = useMemo(
    () => trend.map((item) => ({ label: getPointLabel(item.date, rangeKey), value: item.cost })),
    [rangeKey, trend]
  );
  const totalInputTokens = useMemo(() => trend.reduce((sum, item) => sum + item.input_tokens, 0), [trend]);
  const totalOutputTokens = useMemo(() => trend.reduce((sum, item) => sum + item.output_tokens, 0), [trend]);
  const totalCacheReadTokens = useMemo(() => trend.reduce((sum, item) => sum + item.cache_read_tokens, 0), [trend]);
  const isRefreshing = statsQuery.isRefetching || opsOverviewQuery.isRefetching || settingsQuery.isRefetching || accountsQuery.isRefetching || trendQuery.isRefetching || modelsQuery.isRefetching || snapshotQuery.isRefetching;
  const { isAutoRefreshing } = useAutoRefresh(refetchAll, { refreshing: isRefreshing });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.page }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing && !isAutoRefreshing} onRefresh={() => void refetchAll()} tintColor={colors.primary} />}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <View style={{ flex: 1, flexDirection: 'row', gap: 12 }}>
            <IconBadge icon={LayoutDashboard} containerSize={44} size={21} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>概览</Text>
              <Text style={{ marginTop: 6, fontSize: 13, color: colors.subtext }}>{siteName} 的当前运行状态。</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {RANGE_OPTIONS.map((option) => {
                const active = option.key === rangeKey;
                return (
                  <Pressable
                    key={option.key}
                    style={{ backgroundColor: active ? colors.primary : colors.mutedCard, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}
                    onPress={() => selectRangeKey(option.key)}
                  >
                    <Text style={{ color: active ? colors.primaryText : colors.badgeDefaultText, fontSize: 12, fontWeight: '700' }}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ marginTop: 8, fontSize: 12, color: colors.subtext }}>{range.start_date} 到 {range.end_date}</Text>
          </View>
        </View>

        {!hasAccount ? (
          <Section title="未连接服务器" subtitle="需要先配置连接" icon={DatabaseZap}>
            <Text style={{ fontSize: 14, lineHeight: 22, color: colors.subtext }}>请先前往“服务器”页填写服务地址和 Admin Token，再返回查看概览数据。</Text>
            <Pressable style={{ marginTop: 14, alignSelf: 'flex-start', backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 }} onPress={() => router.push('/settings')}>
              <Text style={{ color: colors.primaryText, fontSize: 13, fontWeight: '700' }}>去配置服务器</Text>
            </Pressable>
          </Section>
        ) : isLoading ? (
          <Section title="正在加载概览" subtitle="请稍候" icon={Activity}>
            <Text style={{ fontSize: 14, lineHeight: 22, color: colors.subtext }}>已连接服务器，正在拉取概览、模型和账号状态数据。</Text>
          </Section>
        ) : hasError ? (
          <Section title="加载失败" subtitle="请检查连接配置" icon={Activity}>
            <View style={{ borderRadius: 14, backgroundColor: colors.dangerBg, paddingHorizontal: 14, paddingVertical: 12 }}>
              <Text style={{ color: colors.danger, fontSize: 14, lineHeight: 20 }}>{errorMessage}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
              <Pressable style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 12, alignItems: 'center' }} onPress={refetchAll}>
                <Text style={{ color: colors.primaryText, fontSize: 13, fontWeight: '700' }}>重试</Text>
              </Pressable>
              <Pressable style={{ flex: 1, backgroundColor: colors.mutedCard, borderRadius: 14, paddingVertical: 12, alignItems: 'center' }} onPress={() => router.push('/settings')}>
                <Text style={{ color: colors.badgeDefaultText, fontSize: 13, fontWeight: '700' }}>检查服务器</Text>
              </Pressable>
            </View>
          </Section>
        ) : (
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <StatCard
                title={`${rangeTitle} Token`}
                value={formatTokenDisplay(usesTodayFallback ? selectedTokenTotal || stats?.today_tokens : selectedTokenTotal)}
                detail={`输出 ${formatTokenDisplay(usesTodayFallback ? selectedOutputTotal || stats?.today_output_tokens : selectedOutputTotal)}`}
                icon={Zap}
                tone="accent"
              />
              <StatCard
                title={`${rangeTitle} 成本`}
                value={formatMoney(usesTodayFallback ? selectedCostTotal || stats?.today_cost : selectedCostTotal)}
                detail={`TPM ${formatNumber(stats?.tpm)}`}
                icon={CircleDollarSign}
                tone="success"
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <StatCard
                title="今日请求"
                value={formatNumber(stats?.today_requests)}
                detail={`累计 ${formatNumber(stats?.total_requests)}`}
                icon={Activity}
                tone="success"
              />
              <StatCard
                title="总 Token"
                value={formatTokenDisplay(stats?.total_tokens)}
                detail={`累计成本 ${formatMoney(stats?.total_cost)}`}
                icon={DatabaseZap}
                tone="primary"
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <StatCard
                title="性能指标"
                value={`${formatCompactNumber(currentRpm)} RPM`}
                detail={`${formatCompactNumber(currentTpm)} TPM`}
                icon={Gauge}
                tone="accent"
              />
              <StatCard
                title="平均响应"
                value={averageResponse}
                detail={`${formatNumber(stats?.active_users)} 活跃用户`}
                icon={Clock3}
                tone="danger"
              />
            </View>

            <GroupUsageDistribution
              rows={groupUsageRows}
              loading={snapshotQuery.isLoading}
              error={snapshotQuery.error}
              rangeTitle={rangeTitle}
            />

            <Section
              title="账号概览"
              subtitle="总数、正常、异常和限流状态一览"
              icon={ShieldCheck}
              right={(
                <Pressable
                  style={{ alignSelf: 'flex-start', backgroundColor: colors.mutedCard, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}
                  onPress={() => router.push('/accounts/overview')}
                >
                  <Text style={{ color: colors.badgeDefaultText, fontSize: 12, fontWeight: '700' }}>账号清单</Text>
                </Pressable>
              )}
            >
              <Pressable onPress={() => router.push('/accounts/overview')}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1, backgroundColor: colors.mutedCard, borderRadius: 14, padding: 12 }}>
                    <Text style={{ fontSize: 11, color: colors.subtext }}>总数</Text>
                    <Text style={{ marginTop: 6, fontSize: 18, fontWeight: '700', color: colors.text }}>{formatNumber(totalAccounts)}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: colors.mutedCard, borderRadius: 14, padding: 12 }}>
                    <Text style={{ fontSize: 11, color: colors.subtext }}>正常</Text>
                    <Text style={{ marginTop: 6, fontSize: 18, fontWeight: '700', color: colors.text }}>{formatNumber(normalAccounts)}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: colors.dangerBg, borderRadius: 14, padding: 12 }}>
                    <Text style={{ fontSize: 11, color: colors.danger }}>异常</Text>
                    <Text style={{ marginTop: 6, fontSize: 18, fontWeight: '700', color: colors.danger }}>{formatNumber(errorAccounts)}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: colors.mutedCard, borderRadius: 14, padding: 12 }}>
                    <Text style={{ fontSize: 11, color: colors.subtext }}>限流</Text>
                    <Text style={{ marginTop: 6, fontSize: 18, fontWeight: '700', color: colors.text }}>{accountsQuery.isPending ? '--' : formatNumber(currentPageLimitedAccounts)}</Text>
                  </View>
                </View>
                <Text style={{ marginTop: 10, fontSize: 12, color: colors.subtext }}>总数 / 正常 / 异常优先使用后端聚合字段；限流与繁忙基于当前页账号列表。点击进入账号清单。</Text>
              </Pressable>
            </Section>

            {throughputPoints.length > 1 ? (
              <LineTrendChart title="Token 吞吐" subtitle="当前时间范围内的 Token 变化趋势" points={throughputPoints} color="#f97316" icon={TrendingUp} formatValue={formatTokenDisplay} />
            ) : null}

            {requestPoints.length > 1 ? (
              <LineTrendChart title="请求趋势" subtitle="当前时间范围内的请求变化趋势" points={requestPoints} color={colors.primary} icon={Activity} formatValue={formatCompactNumber} />
            ) : null}

            {costPoints.length > 1 ? (
              <LineTrendChart title="成本趋势" subtitle="当前时间范围内的成本变化趋势" points={costPoints} color="#7c3aed" icon={CircleDollarSign} formatValue={formatMoney} />
            ) : null}

            <BarChartCard
              title="Token 结构"
              subtitle="输入、输出、缓存读取占比"
              icon={BarChart3}
              items={[
                { label: '输入 Token', value: totalInputTokens, color: colors.primary, hint: '请求进入模型前消耗的 token。' },
                { label: '输出 Token', value: totalOutputTokens, color: '#f59e0b', hint: '模型返回内容消耗的 token。' },
                { label: '缓存读取 Token', value: totalCacheReadTokens, color: '#64748b', hint: '命中缓存后复用的 token。' },
              ]}
              formatValue={formatTokenDisplay}
            />

            <DonutChartCard
              title="账号状态"
              subtitle="正常、繁忙、限流、异常分布"
              centerLabel="总账号"
              centerValue={formatNumber(totalAccounts)}
              icon={PieChart}
              segments={[
                { label: '正常', value: normalAccounts, color: colors.success },
                { label: '繁忙', value: currentPageBusyAccounts, color: '#f59e0b' },
                { label: '限流', value: currentPageLimitedAccounts, color: '#64748b' },
                { label: '异常', value: errorAccounts, color: '#f97316' },
              ]}
            />

            <BarChartCard
              title="热点模型"
              subtitle="当前时间范围内最活跃的模型"
              icon={DatabaseZap}
              items={topModels.map((model) => ({
                label: model.model,
                value: model.total_tokens,
                color: '#f97316',
                meta: `请求 ${formatNumber(model.requests)} · 成本 ${formatMoney(model.cost)}`,
              }))}
              formatValue={formatCompactNumber}
            />

            <Section title="趋势摘要" subtitle="最近几个统计点的请求、Token 和成本变化" icon={TrendingUp}>
              {latestTrendPoints.length === 0 ? (
                <Text style={{ fontSize: 14, color: colors.subtext }}>当前时间范围没有趋势数据。</Text>
              ) : (
                <View style={{ gap: 12 }}>
                  <View style={{ gap: 10 }}>
                    {latestTrendPoints.map((point) => (
                      <View key={point.date} style={{ backgroundColor: colors.mutedCard, borderRadius: 14, padding: 12 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>{point.date}</Text>
                        <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 11, color: colors.subtext }}>请求</Text>
                            <Text style={{ marginTop: 4, fontSize: 15, fontWeight: '700', color: colors.text }}>{formatCompactNumber(point.requests)}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 11, color: colors.subtext }}>Token</Text>
                            <Text style={{ marginTop: 4, fontSize: 15, fontWeight: '700', color: colors.text }}>{formatTokenDisplay(point.total_tokens)}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 11, color: colors.subtext }}>成本</Text>
                            <Text style={{ marginTop: 4, fontSize: 15, fontWeight: '700', color: colors.text }}>{formatMoney(point.cost)}</Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </Section>

          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
