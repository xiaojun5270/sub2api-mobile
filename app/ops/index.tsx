import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { Activity, AlertTriangle, BarChart3, BellRing, ChevronDown, Clock, Gauge, ListChecks, ServerCog, ShieldCheck, ShieldOff, TerminalSquare, Users } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { LineTrendChart } from '@/src/components/line-trend-chart';
import { ScreenShell } from '@/src/components/screen-shell';
import { formatCompactNumber, formatDisplayTime } from '@/src/lib/formatters';
import { useAppTheme } from '@/src/lib/theme';
import {
  getOpsAccountAvailability,
  getOpsAlertEvents,
  getOpsConcurrency,
  getOpsDashboardOverview,
  getOpsDashboardSnapshot,
  getOpsErrorDistribution,
  getOpsErrors,
  getOpsErrorTrend,
  getOpsLatencyHistogram,
  getOpsOpenAiTokenStats,
  getOpsRealtimeTraffic,
  getOpsRequests,
  getOpsRequestErrors,
  getOpsRuntimeAlert,
  getOpsSystemLogs,
  getOpsSystemLogsHealth,
  getOpsThroughputTrend,
  getOpsUpstreamErrors,
  getOpsUserConcurrency,
  updateOpsAlertEventStatus,
} from '@/src/services/admin';
import type { OpsDashboardSnapshot, OpsMetricPoint, OpsRecord } from '@/src/types/admin';

type OpsTimeRange = '1h' | '24h' | '7d' | '30d';
type OpsFilterMenu = 'platform' | 'group' | 'time' | null;

type FilterOption = {
  value: string;
  label: string;
};

const OPS_TIME_RANGE_OPTIONS: Array<FilterOption & { value: OpsTimeRange }> = [
  { label: '近1小时', value: '1h' },
  { label: '近24小时', value: '24h' },
  { label: '近7天', value: '7d' },
  { label: '近30天', value: '30d' },
];

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return '加载失败，请稍后重试。';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function firstNumberValue(source: unknown, keys: string[]): number | undefined {
  if (!isRecord(source)) return undefined;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }

  for (const key of ['data', 'overview', 'metrics', 'stats', 'realtime']) {
    const nested = firstNumberValue(source[key], keys);
    if (nested !== undefined) return nested;
  }

  return undefined;
}

function firstNumber(source: unknown, keys: string[]) {
  return firstNumberValue(source, keys) ?? 0;
}

function firstTextValue(source: unknown, keys: string[]): string | undefined {
  if (!isRecord(source)) return undefined;

  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }

  for (const key of ['data', 'overview', 'metrics', 'stats', 'realtime']) {
    const nested = firstTextValue(source[key], keys);
    if (nested) return nested;
  }

  return undefined;
}

function firstText(source: unknown, keys: string[]) {
  return firstTextValue(source, keys) ?? '--';
}

function isTruthyValue(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'active', 'ok'].includes(value.toLowerCase());
  }
  return false;
}

function isEmptyDimension(value: unknown) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') {
    return ['', 'all', 'overall', 'null'].includes(value.trim().toLowerCase());
  }
  return false;
}

function textOrDash(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() && value !== '--') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'boolean') return value ? '是' : '否';
  }

  return '--';
}

function nestedRecord(source: unknown, key: string) {
  if (!isRecord(source)) return undefined;
  const value = source[key];
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(value);
      return isRecord(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  return isRecord(value) ? value : undefined;
}

function formatKnownTime(...values: unknown[]) {
  const value = textOrDash(...values);
  return value === '--' ? '--' : formatDisplayTime(value);
}

function firstArray<T>(source: unknown, keys: string[]): T[] {
  if (Array.isArray(source)) return source as T[];
  if (!isRecord(source)) return [];

  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) return value as T[];
    if (isRecord(value)) {
      const nested = firstArray<T>(value, keys);
      if (nested.length > 0) return nested;
    }
  }

  for (const value of Object.values(source)) {
    if (Array.isArray(value)) return value as T[];
    if (isRecord(value)) {
      const nested = firstArray<T>(value, keys);
      if (nested.length > 0) return nested;
    }
  }

  return [];
}

function getItems(data?: unknown) {
  return firstArray<OpsRecord>(data, [
    'items',
    'data',
    'list',
    'records',
    'results',
    'rows',
    'errors',
    'request_errors',
    'requestErrors',
    'upstream_errors',
    'upstreamErrors',
    'logs',
    'system_logs',
    'systemLogs',
    'events',
    'alert_events',
    'alertEvents',
    'accounts',
    'users',
  ]);
}

function getTrendItems(data?: unknown) {
  return firstArray<OpsMetricPoint>(data, [
    'trend',
    'items',
    'data',
    'points',
    'buckets',
    'histogram',
    'distribution',
    'throughput_trend',
    'throughputTrend',
    'error_trend',
    'errorTrend',
    'latency_histogram',
    'latencyHistogram',
    'error_distribution',
    'errorDistribution',
  ]);
}

function firstNonEmptyTrend(...sources: unknown[]) {
  for (const source of sources) {
    const items = getTrendItems(source);
    if (items.length > 0) return items;
  }

  return [];
}

function getOverallTrendPoints(points: OpsMetricPoint[]) {
  const overallPoints = points.filter((point) => (
    isEmptyDimension(point.platform) &&
    isEmptyDimension(point.group_id) &&
    isEmptyDimension(point.groupId)
  ));

  return overallPoints.length > 0 ? overallPoints : points;
}

function summarizeTrendByBucket(points: OpsMetricPoint[], valueKeys: string[], mode: 'sum' | 'average' = 'sum') {
  const summaries = new Map<string, { label: string; total: number; count: number }>();

  points.forEach((point, index) => {
    const bucket = firstText(point, ['bucket_start', 'bucketStart', 'date', 'time', 'created_at', 'createdAt']);
    const label = bucket !== '--' ? bucket : `${index + 1}`;
    const current = summaries.get(label);
    summaries.set(label, {
      label: getShortTimeLabel(label),
      total: (current?.total ?? 0) + pointValue(point, valueKeys),
      count: (current?.count ?? 0) + 1,
    });
  });

  return Array.from(summaries.values()).map((item) => ({
    label: item.label,
    value: mode === 'average' ? item.total / Math.max(item.count, 1) : item.total,
  })).reverse();
}

function getShortTimeLabel(value: string) {
  if (!value || value === '--') return '--';
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return `${String(date.getHours()).padStart(2, '0')}:00`;
  }
  if (value.length > 12) return value.slice(5, 16);
  return value;
}

function snapshotArray(snapshot: OpsDashboardSnapshot | undefined, keys: string[]) {
  if (!snapshot) return [];
  return firstArray<OpsMetricPoint>(snapshot, keys);
}

function pointValue(point: OpsMetricPoint, keys: string[]) {
  return firstNumber(point as Record<string, unknown>, keys);
}

function formatLatency(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '--';
  return `${value.toFixed(0)}ms`;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '--';
  return `${value.toFixed(value >= 10 ? 1 : 2)}%`;
}

function formatHealth(value: unknown) {
  if (value === null || value === undefined || value === '--') return '--';
  return isTruthyValue(value) ? '正常' : '异常';
}

function formatAlertStatus(status: string, resolvedAt?: unknown) {
  const normalized = status.toLowerCase();
  if (normalized === 'resolved' || resolvedAt) return '已恢复';
  if (normalized === 'ignored' || normalized === 'muted') return '已忽略';
  if (normalized === 'open' || normalized === 'firing') return '触发中';
  return textOrDash(status);
}

function formatDurationBetween(start?: unknown, end?: unknown) {
  const startText = typeof start === 'string' ? start : undefined;
  const endText = typeof end === 'string' ? end : undefined;
  if (!startText || !endText) return '-';

  const startTime = new Date(startText).getTime();
  const endTime = new Date(endText).getTime();
  if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime < startTime) return '-';

  const minutes = Math.max(Math.round((endTime - startTime) / 60000), 1);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatDimensions(value: unknown) {
  if (!value) return '-';
  if (typeof value === 'string') return value.trim() || '-';
  if (isRecord(value)) {
    const text = Object.entries(value)
      .filter(([, entryValue]) => entryValue !== null && entryValue !== undefined && `${entryValue}`.trim())
      .map(([key, entryValue]) => `${key}:${entryValue}`)
      .join(' · ');
    return text || '-';
  }

  return '-';
}

function getTimeRangeLabel(value: OpsTimeRange) {
  return OPS_TIME_RANGE_OPTIONS.find((option) => option.value === value)?.label ?? '近1小时';
}

function getTokenStatsTimeRange(value: OpsTimeRange) {
  if (value === '24h') return '1d';
  if (value === '30d') return '30d';
  return value === '1h' ? '1h' : undefined;
}

function parseGroupId(value: string) {
  const groupId = Number(value);
  return Number.isFinite(groupId) && groupId > 0 ? groupId : undefined;
}

function cleanDimensionValue(value?: string) {
  if (!value || isEmptyDimension(value)) return undefined;
  return value.trim();
}

function dimensionValue(source: unknown, keys: string[]) {
  const direct = cleanDimensionValue(firstTextValue(source, keys));
  if (direct) return direct;

  for (const nestedKey of ['extra', 'dimensions', 'metadata', 'group']) {
    const nested = nestedRecord(source, nestedKey);
    const nestedValue = cleanDimensionValue(firstTextValue(nested, keys));
    if (nestedValue) return nestedValue;
  }

  return undefined;
}

function platformValue(source: unknown) {
  return dimensionValue(source, ['platform', 'provider']);
}

function groupValue(source: unknown) {
  const value = dimensionValue(source, ['group_id', 'groupId']);
  const groupId = value ? Number(value) : Number.NaN;
  return Number.isFinite(groupId) && groupId > 0 ? String(groupId) : undefined;
}

function collectFilterOptions(
  sources: unknown[],
  getValue: (source: unknown) => string | undefined,
  getLabel: (value: string) => string
) {
  const options = new Map<string, string>();

  sources.forEach((source) => {
    const value = getValue(source);
    if (value && !options.has(value)) {
      options.set(value, getLabel(value));
    }
  });

  return Array.from(options, ([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function matchesFilter(source: unknown, platform: string, group: string) {
  const sourcePlatform = platformValue(source);
  const sourceGroup = groupValue(source);

  if (platform && sourcePlatform !== platform) return false;
  if (group && sourceGroup !== group) return false;

  return true;
}

function filterByDimension<T>(items: T[], platform: string, group: string) {
  if (!platform && !group) return items;
  return items.filter((item) => matchesFilter(item, platform, group));
}

function pickTrendDimension(points: OpsMetricPoint[], platform: string, group: string) {
  if (group) {
    const groupPoints = points.filter((point) => groupValue(point) === group);
    return groupPoints.length > 0 ? groupPoints : points;
  }

  if (platform) {
    const platformOnlyPoints = points.filter((point) => platformValue(point) === platform && !groupValue(point));
    if (platformOnlyPoints.length > 0) return platformOnlyPoints;
    return points.filter((point) => platformValue(point) === platform);
  }

  return getOverallTrendPoints(points);
}

function InfoTile({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'danger' | 'success' }) {
  const colors = useAppTheme();
  const backgroundColor = tone === 'danger' ? colors.errorBg : tone === 'success' ? colors.successBg : colors.mutedCard;
  const valueColor = tone === 'danger' ? colors.errorText : tone === 'success' ? colors.success : colors.text;

  return (
    <View style={{ backgroundColor, borderRadius: 12, flex: 1, minWidth: 104, paddingHorizontal: 10, paddingVertical: 10 }}>
      <Text style={{ color: colors.subtext, fontSize: 10 }}>{label}</Text>
      <Text numberOfLines={1} style={{ color: valueColor, fontSize: 13, fontWeight: '800', marginTop: 5 }}>{value}</Text>
    </View>
  );
}

function SectionTitle({ title, icon: Icon }: { title: string; icon: LucideIcon }) {
  const colors = useAppTheme();

  return (
    <View style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}>
      <Icon color={colors.primary} size={17} />
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>{title}</Text>
    </View>
  );
}

function MiniBar({ value, tone = 'default' }: { value: number; tone?: 'default' | 'danger' | 'success' }) {
  const colors = useAppTheme();
  const percent = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const color = tone === 'danger' ? colors.errorText : tone === 'success' ? colors.success : colors.primary;

  return (
    <View style={{ backgroundColor: colors.chartTrack, borderRadius: 999, height: 7, marginTop: 8, overflow: 'hidden' }}>
      <View style={{ backgroundColor: color, borderRadius: 999, height: 7, width: `${percent}%` as `${number}%` }} />
    </View>
  );
}

function RecordCard({
  item,
  title,
  subtitle,
  tone = 'default',
  children,
}: {
  item: OpsRecord;
  title: string;
  subtitle: string;
  tone?: 'default' | 'danger' | 'success';
  children?: ReactNode;
}) {
  const colors = useAppTheme();
  const markerColor = tone === 'danger' ? colors.errorText : tone === 'success' ? colors.success : colors.primary;

  return (
    <View style={{ backgroundColor: colors.mutedCard, borderRadius: 14, padding: 12 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ backgroundColor: markerColor, borderRadius: 999, marginTop: 3, width: 4 }} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={2} style={{ color: colors.text, fontSize: 13, fontWeight: '800', lineHeight: 18 }}>{title}</Text>
          <Text numberOfLines={2} style={{ color: colors.subtext, fontSize: 12, lineHeight: 18, marginTop: 5 }}>{subtitle}</Text>
          {children ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>{children}</View> : null}
        </View>
      </View>
    </View>
  );
}

function EmptyText({ loading, empty }: { loading?: boolean; empty: string }) {
  const colors = useAppTheme();
  return <Text style={{ color: colors.subtext }}>{loading ? '正在加载...' : empty}</Text>;
}

export default function OpsScreen() {
  const colors = useAppTheme();
  const queryClient = useQueryClient();
  const [timeRange, setTimeRange] = useState<OpsTimeRange>('1h');
  const [platformFilter, setPlatformFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [activeFilterMenu, setActiveFilterMenu] = useState<OpsFilterMenu>(null);
  const selectedGroupId = parseGroupId(groupFilter);

  const opsQueryParams = useMemo(() => ({
    group_id: selectedGroupId,
    platform: platformFilter || undefined,
    time_range: timeRange,
  }), [platformFilter, selectedGroupId, timeRange]);

  const opsRealtimeParams = useMemo(() => ({
    group_id: selectedGroupId,
    platform: platformFilter || undefined,
    window: '1h',
  }), [platformFilter, selectedGroupId]);

  const opsDimensionParams = useMemo(() => ({
    group_id: selectedGroupId,
    platform: platformFilter || undefined,
  }), [platformFilter, selectedGroupId]);

  const opsTokenStatsParams = useMemo(() => ({
    group_id: selectedGroupId,
    platform: platformFilter || undefined,
    time_range: getTokenStatsTimeRange(timeRange),
  }), [platformFilter, selectedGroupId, timeRange]);

  const opsListParams = useMemo(() => ({
    group_id: selectedGroupId,
    platform: platformFilter || undefined,
    page: 1,
    page_size: 10,
    time_range: timeRange,
    sort_by: 'created_at',
    sort_order: 'desc',
  }), [platformFilter, selectedGroupId, timeRange]);

  const overviewQuery = useQuery({ queryKey: ['ops-overview', opsQueryParams], queryFn: () => getOpsDashboardOverview(opsQueryParams), staleTime: 30_000 });
  const snapshotQuery = useQuery({ queryKey: ['ops-dashboard-snapshot', opsQueryParams], queryFn: () => getOpsDashboardSnapshot(opsQueryParams), staleTime: 30_000 });
  const realtimeQuery = useQuery({ queryKey: ['ops-realtime', opsRealtimeParams], queryFn: () => getOpsRealtimeTraffic(opsRealtimeParams), staleTime: 15_000 });
  const concurrencyQuery = useQuery({ queryKey: ['ops-concurrency', opsDimensionParams], queryFn: () => getOpsConcurrency(opsDimensionParams), staleTime: 15_000 });
  const userConcurrencyQuery = useQuery({ queryKey: ['ops-user-concurrency', opsDimensionParams], queryFn: () => getOpsUserConcurrency(opsDimensionParams), staleTime: 15_000 });
  const accountAvailabilityQuery = useQuery({ queryKey: ['ops-account-availability', opsDimensionParams], queryFn: () => getOpsAccountAvailability(opsDimensionParams), staleTime: 15_000 });
  const tokenStatsQuery = useQuery({ queryKey: ['ops-openai-token-stats', opsTokenStatsParams], queryFn: () => getOpsOpenAiTokenStats(opsTokenStatsParams), staleTime: 30_000 });
  const throughputQuery = useQuery({ queryKey: ['ops-throughput-trend', opsQueryParams], queryFn: () => getOpsThroughputTrend(opsQueryParams), staleTime: 60_000 });
  const errorTrendQuery = useQuery({ queryKey: ['ops-error-trend', opsQueryParams], queryFn: () => getOpsErrorTrend(opsQueryParams), staleTime: 60_000 });
  const errorDistributionQuery = useQuery({ queryKey: ['ops-error-distribution', opsQueryParams], queryFn: () => getOpsErrorDistribution(opsQueryParams), staleTime: 60_000 });
  const latencyHistogramQuery = useQuery({ queryKey: ['ops-latency-histogram', opsQueryParams], queryFn: () => getOpsLatencyHistogram(opsQueryParams), staleTime: 60_000 });
  const requestsQuery = useQuery({ queryKey: ['ops-requests', opsListParams], queryFn: () => getOpsRequests(opsListParams), staleTime: 30_000 });
  const requestErrorsQuery = useQuery({ queryKey: ['ops-request-errors', opsListParams], queryFn: () => getOpsRequestErrors({ ...opsListParams, view: 'errors' }), staleTime: 30_000 });
  const upstreamErrorsQuery = useQuery({ queryKey: ['ops-upstream-errors', opsListParams], queryFn: () => getOpsUpstreamErrors(opsListParams), staleTime: 30_000 });
  const errorsQuery = useQuery({ queryKey: ['ops-errors', opsListParams], queryFn: () => getOpsErrors(opsListParams), staleTime: 30_000 });
  const systemLogsQuery = useQuery({ queryKey: ['ops-system-logs', opsQueryParams], queryFn: () => getOpsSystemLogs({ ...opsQueryParams, page: 1, page_size: 20 }), staleTime: 30_000 });
  const logsHealthQuery = useQuery({ queryKey: ['ops-logs-health'], queryFn: getOpsSystemLogsHealth, staleTime: 60_000 });
  const runtimeAlertQuery = useQuery({ queryKey: ['ops-runtime-alert'], queryFn: getOpsRuntimeAlert, staleTime: 30_000 });
  const alertEventsQuery = useQuery({ queryKey: ['ops-alert-events', opsQueryParams], queryFn: () => getOpsAlertEvents({ ...opsQueryParams, limit: 20 }), staleTime: 30_000 });

  const resolveAlertMutation = useMutation({
    mutationFn: (id: number | string) => updateOpsAlertEventStatus(id, 'resolved'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ops-alert-events'] }),
  });

  const snapshot = snapshotQuery.data;
  const overview = overviewQuery.data || snapshot?.overview || snapshot;
  const realtime = realtimeQuery.data || snapshot?.realtime || snapshot?.overview || snapshot;
  const concurrency = concurrencyQuery.data;
  const tokenStats = tokenStatsQuery.data || snapshot?.openai_token_stats;
  const runtimeAlert = runtimeAlertQuery.data;
  const logsHealth = logsHealthQuery.data;
  const rawSystemLogs = getItems(systemLogsQuery.data);
  const rawAlertEvents = getItems(alertEventsQuery.data);
  const rawAccountAvailability = getItems(accountAvailabilityQuery.data);
  const rawUserConcurrency = getItems(userConcurrencyQuery.data);
  const rawRequests = getItems(requestsQuery.data);
  const rawRequestErrors = getItems(requestErrorsQuery.data);
  const rawUpstreamErrors = getItems(upstreamErrorsQuery.data);
  const rawErrors = getItems(errorsQuery.data);
  const throughputSource = firstNonEmptyTrend(
    throughputQuery.data,
    snapshotArray(snapshot, ['throughput_trend', 'throughputTrend']),
    snapshot
  );
  const errorTrendSource = firstNonEmptyTrend(
    errorTrendQuery.data,
    snapshotArray(snapshot, ['error_trend', 'errorTrend']),
    snapshot
  );
  const errorDistributionSource = firstNonEmptyTrend(
    errorDistributionQuery.data,
    snapshotArray(snapshot, ['error_distribution', 'errorDistribution'])
  );
  const latencyHistogramSource = firstNonEmptyTrend(
    latencyHistogramQuery.data,
    snapshotArray(snapshot, ['latency_histogram', 'latencyHistogram'])
  );
  const rawConcurrencyItems = getItems(concurrency);
  const filteredSystemLogs = useMemo(
    () => filterByDimension(rawSystemLogs, platformFilter, groupFilter),
    [groupFilter, platformFilter, rawSystemLogs]
  );
  const filteredAlertEvents = useMemo(
    () => filterByDimension(rawAlertEvents, platformFilter, groupFilter),
    [groupFilter, platformFilter, rawAlertEvents]
  );
  const filteredThroughputSource = useMemo(
    () => filterByDimension(throughputSource, platformFilter, groupFilter),
    [groupFilter, platformFilter, throughputSource]
  );
  const filteredErrorTrendSource = useMemo(
    () => filterByDimension(errorTrendSource, platformFilter, groupFilter),
    [errorTrendSource, groupFilter, platformFilter]
  );
  const filteredErrorDistribution = useMemo(
    () => filterByDimension(errorDistributionSource, platformFilter, groupFilter),
    [errorDistributionSource, groupFilter, platformFilter]
  );
  const filteredLatencyHistogram = useMemo(
    () => filterByDimension(latencyHistogramSource, platformFilter, groupFilter),
    [groupFilter, latencyHistogramSource, platformFilter]
  );
  const filteredConcurrencyItems = useMemo(
    () => filterByDimension(rawConcurrencyItems, platformFilter, groupFilter),
    [groupFilter, platformFilter, rawConcurrencyItems]
  );
  const filteredAccountAvailability = useMemo(
    () => filterByDimension(rawAccountAvailability, platformFilter, groupFilter),
    [groupFilter, platformFilter, rawAccountAvailability]
  );
  const filteredUserConcurrency = useMemo(
    () => filterByDimension(rawUserConcurrency, platformFilter, groupFilter),
    [groupFilter, platformFilter, rawUserConcurrency]
  );
  const filteredRequests = useMemo(
    () => filterByDimension(rawRequests, platformFilter, groupFilter),
    [groupFilter, platformFilter, rawRequests]
  );
  const filteredRequestErrors = useMemo(
    () => filterByDimension(rawRequestErrors, platformFilter, groupFilter),
    [groupFilter, platformFilter, rawRequestErrors]
  );
  const filteredUpstreamErrors = useMemo(
    () => filterByDimension(rawUpstreamErrors, platformFilter, groupFilter),
    [groupFilter, platformFilter, rawUpstreamErrors]
  );
  const filteredErrors = useMemo(
    () => filterByDimension(rawErrors, platformFilter, groupFilter),
    [groupFilter, platformFilter, rawErrors]
  );
  const dimensionSources = useMemo(
    () => [
      ...throughputSource,
      ...errorTrendSource,
      ...rawAccountAvailability,
      ...rawConcurrencyItems,
      ...rawUserConcurrency,
      ...rawRequests,
      ...rawRequestErrors,
      ...rawUpstreamErrors,
      ...rawErrors,
      ...rawSystemLogs,
      ...rawAlertEvents,
      overview,
      realtime,
      concurrency,
    ],
    [concurrency, errorTrendSource, overview, rawAccountAvailability, rawAlertEvents, rawConcurrencyItems, rawErrors, rawRequestErrors, rawRequests, rawSystemLogs, rawUpstreamErrors, rawUserConcurrency, realtime, throughputSource]
  );
  const platformOptions = useMemo(
    () => [
      { label: '全部平台', value: '' },
      ...collectFilterOptions(dimensionSources, platformValue, (value) => value.toUpperCase()),
    ],
    [dimensionSources]
  );
  const groupOptions = useMemo(
    () => [
      { label: '全部分组', value: '' },
      ...collectFilterOptions(dimensionSources, groupValue, (value) => `分组 #${value}`),
    ],
    [dimensionSources]
  );
  const timeOptions = OPS_TIME_RANGE_OPTIONS.map(({ label, value }) => ({ label, value }));
  const systemLogs = filteredSystemLogs.slice(0, 8);
  const alertEvents = filteredAlertEvents.slice(0, 8);
  const accountAvailabilityRows = filteredAccountAvailability.slice(0, 8);
  const userConcurrencyRows = filteredUserConcurrency.slice(0, 8);
  const requestRows = filteredRequests.slice(0, 8);
  const requestErrorRows = filteredRequestErrors.slice(0, 6);
  const upstreamErrorRows = filteredUpstreamErrors.slice(0, 6);
  const genericErrorRows = filteredErrors.slice(0, 6);
  const overviewRecord = isRecord(overview) ? overview : undefined;
  const qpsMetrics = nestedRecord(overview, 'qps') ?? nestedRecord(realtime, 'qps');
  const tpsMetrics = nestedRecord(overview, 'tps') ?? nestedRecord(realtime, 'tps');
  const durationMetrics = nestedRecord(overview, 'duration') ?? nestedRecord(overview, 'latency');
  const ttftMetrics = nestedRecord(overview, 'ttft');
  const systemMetrics = nestedRecord(overview, 'system_metrics') ?? nestedRecord(overview, 'systemMetrics') ?? overviewRecord;

  const successCount = firstNumber(overview, ['success_count', 'successCount', 'request_count_success', 'requestCountSuccess', 'successes', 'success']);
  const errors = firstNumber(overview, ['error_count_total', 'errorCountTotal', 'request_error_count', 'requestErrorCount', 'errors', 'error_count', 'errorCount', 'request_errors', 'requestErrors', 'total_errors', 'totalErrors']);
  const realtimeRequests = firstNumber(realtime, ['request_count_total', 'requestCountTotal', 'total_requests', 'totalRequests', 'requests']);
  const totalRequests = firstNumber(overview, ['request_count_total', 'requestCountTotal', 'total_requests', 'totalRequests', 'requests', 'request_count', 'requestCount']) || realtimeRequests || successCount + errors;
  const rawErrorRate = firstNumberValue(overview, ['error_rate', 'errorRate', 'errors_rate']);
  const errorRate = rawErrorRate !== undefined ? (rawErrorRate > 1 ? rawErrorRate / 100 : rawErrorRate) : totalRequests > 0 ? errors / totalRequests : 0;
  const rawUpstreamErrorRate = firstNumberValue(overview, ['upstream_error_rate', 'upstreamErrorRate']);
  const upstreamErrorRate = rawUpstreamErrorRate !== undefined ? (rawUpstreamErrorRate > 1 ? rawUpstreamErrorRate / 100 : rawUpstreamErrorRate) : 0;
  const rawSla = firstNumberValue(overview, ['sla', 'sla_rate', 'slaRate', 'success_rate', 'successRate']);
  const slaPercent = rawSla !== undefined ? (rawSla > 1 ? rawSla : rawSla * 100) : undefined;
  const healthScore = firstNumberValue(overview, ['health_score', 'healthScore']);
  const qps = firstNumber(qpsMetrics, ['current', 'avg', 'value']) || firstNumber(overview, ['qps_current', 'qpsCurrent', 'qps', 'queries_per_second', 'requests_per_second', 'requestsPerSecond']) || firstNumber(realtime, ['qps_current', 'qpsCurrent', 'qps', 'queries_per_second', 'requests_per_second', 'requestsPerSecond']);
  const rpm = firstNumber(overview, ['rpm', 'requests_per_minute', 'requestsPerMinute']) || firstNumber(realtime, ['rpm', 'requests_per_minute', 'requestsPerMinute']) || qps * 60;
  const avgLatency = firstNumber(durationMetrics, ['avg_ms', 'avgMs', 'avg', 'average_ms', 'averageMs']) || firstNumber(overview, ['duration_avg_ms', 'durationAvgMs', 'avg_latency_ms', 'avgLatencyMs', 'average_latency_ms', 'averageLatencyMs', 'latency_ms', 'latencyMs', 'avg_duration_ms', 'avgDurationMs']) || firstNumber(realtime, ['duration_avg_ms', 'durationAvgMs', 'avg_latency_ms', 'avgLatencyMs', 'average_latency_ms', 'averageLatencyMs']);
  const p50Latency = firstNumber(durationMetrics, ['p50_ms', 'p50Ms', 'p50']) || firstNumber(overview, ['duration_p50_ms', 'durationP50Ms', 'p50_latency_ms', 'p50LatencyMs', 'p50', 'latency_p50_ms', 'latencyP50Ms']);
  const p90Latency = firstNumber(durationMetrics, ['p90_ms', 'p90Ms', 'p90']) || firstNumber(overview, ['duration_p90_ms', 'durationP90Ms', 'p90_latency_ms', 'p90LatencyMs', 'p90', 'latency_p90_ms', 'latencyP90Ms']);
  const p95Latency = firstNumber(durationMetrics, ['p95_ms', 'p95Ms', 'p95']) || firstNumber(overview, ['duration_p95_ms', 'durationP95Ms', 'p95_latency_ms', 'p95LatencyMs', 'p95', 'latency_p95_ms', 'latencyP95Ms']);
  const p99Latency = firstNumber(durationMetrics, ['p99_ms', 'p99Ms', 'p99']) || firstNumber(overview, ['duration_p99_ms', 'durationP99Ms', 'p99_latency_ms', 'p99LatencyMs', 'p99', 'latency_p99_ms', 'latencyP99Ms']);
  const maxLatency = firstNumber(durationMetrics, ['max_ms', 'maxMs', 'max']) || firstNumber(overview, ['duration_max_ms', 'durationMaxMs', 'max_latency_ms', 'maxLatencyMs', 'latency_max_ms', 'latencyMaxMs']);
  const ttftP50 = firstNumber(ttftMetrics, ['p50_ms', 'p50Ms', 'p50']) || firstNumber(overview, ['ttft_p50_ms', 'ttftP50Ms']);
  const ttftP90 = firstNumber(ttftMetrics, ['p90_ms', 'p90Ms', 'p90']) || firstNumber(overview, ['ttft_p90_ms', 'ttftP90Ms']);
  const ttftP95 = firstNumber(ttftMetrics, ['p95_ms', 'p95Ms', 'p95']) || firstNumber(overview, ['ttft_p95_ms', 'ttftP95Ms']);
  const ttftP99 = firstNumber(ttftMetrics, ['p99_ms', 'p99Ms', 'p99']) || firstNumber(overview, ['ttft_p99_ms', 'ttftP99Ms']);
  const ttftAvg = firstNumber(ttftMetrics, ['avg_ms', 'avgMs', 'avg']) || firstNumber(overview, ['ttft_avg_ms', 'ttftAvgMs', 'time_to_first_token_avg_ms', 'timeToFirstTokenAvgMs']);
  const ttftMax = firstNumber(ttftMetrics, ['max_ms', 'maxMs', 'max']) || firstNumber(overview, ['ttft_max_ms', 'ttftMaxMs']);
  const alertCount = firstNumberValue(runtimeAlert, ['events_open', 'eventsOpen', 'open_alerts', 'openAlerts']) ?? firstNumber(overview, ['alert_count', 'alertCount', 'alerts', 'open_alerts', 'openAlerts']);
  const totalAlertEvents = firstNumberValue(runtimeAlert, ['events_total', 'eventsTotal', 'total']) ?? firstNumber(alertEventsQuery.data, ['total']);
  const currentConcurrency = firstNumber(realtime, ['current_concurrency', 'currentConcurrency', 'active_requests', 'activeRequests', 'inflight_requests', 'inflightRequests', 'concurrency']) || firstNumber(concurrency, ['current_concurrency', 'currentConcurrency', 'active_requests', 'activeRequests', 'total']);
  const queueSize = firstNumber(systemMetrics, ['concurrency_queue_depth', 'concurrencyQueueDepth']) || firstNumber(overview, ['concurrency_queue_depth', 'concurrencyQueueDepth']) || firstNumber(realtime, ['queue_size', 'queueSize', 'queued_requests', 'queuedRequests', 'pending_requests', 'pendingRequests']) || firstNumber(concurrency, ['queue_size', 'queueSize', 'pending_requests', 'pendingRequests']);
  const tokenPerSecond = firstNumber(tpsMetrics, ['current', 'avg', 'value']) || firstNumber(overview, ['tps_current', 'tpsCurrent', 'tps', 'tokens_per_second', 'tokensPerSecond', 'token_per_second']) || firstNumber(realtime, ['tps_current', 'tpsCurrent', 'tps', 'tokens_per_second', 'tokensPerSecond', 'token_per_second']) || firstNumber(tokenStats, ['tps', 'tokens_per_second', 'tokensPerSecond']);
  const tokenConsumed = firstNumber(overview, ['token_consumed', 'tokenConsumed', 'tokens', 'total_tokens', 'totalTokens']) || firstNumber(tokenStats, ['token_consumed', 'tokenConsumed', 'tokens', 'total_tokens', 'totalTokens']);
  const businessLimited = firstNumber(overview, ['business_limited_count', 'businessLimitedCount']);
  const upstreamErrorCount = firstNumber(overview, ['upstream_error_count_excl_429_529', 'upstreamErrorCountExcl429529', 'upstream_errors_excl_429_529', 'upstreamErrorsExcl429529']);
  const upstream429Count = firstNumber(overview, ['upstream_429_count', 'upstream429Count']);
  const upstream529Count = firstNumber(overview, ['upstream_529_count', 'upstream529Count']);
  const cpuUsage = firstNumber(systemMetrics, ['cpu_usage_percent', 'cpuUsagePercent']) || firstNumber(overview, ['cpu_usage_percent', 'cpuUsagePercent']);
  const memoryUsage = firstNumber(systemMetrics, ['memory_usage_percent', 'memoryUsagePercent']) || firstNumber(overview, ['memory_usage_percent', 'memoryUsagePercent']);
  const memoryUsed = firstNumber(systemMetrics, ['memory_used_mb', 'memoryUsedMb']) || firstNumber(overview, ['memory_used_mb', 'memoryUsedMb']);
  const dbStatus = formatHealth(systemMetrics?.db_ok ?? systemMetrics?.dbOk);
  const redisStatus = formatHealth(systemMetrics?.redis_ok ?? systemMetrics?.redisOk);
  const dbConnActive = firstNumber(systemMetrics, ['db_conn_active', 'dbConnActive']);
  const dbConnIdle = firstNumber(systemMetrics, ['db_conn_idle', 'dbConnIdle']);
  const dbConnWaiting = firstNumber(systemMetrics, ['db_conn_waiting', 'dbConnWaiting']);
  const redisConnTotal = firstNumber(systemMetrics, ['redis_conn_total', 'redisConnTotal']);
  const redisConnIdle = firstNumber(systemMetrics, ['redis_conn_idle', 'redisConnIdle']);
  const lockKeys = firstNumber(systemMetrics, ['lock_keys', 'lockKeys', 'redis_lock_keys', 'redisLockKeys']);
  const backgroundTasks = firstNumber(systemMetrics, ['background_jobs', 'backgroundJobs', 'job_count', 'jobCount', 'goroutine_count', 'goroutineCount']);
  const logsTotal = firstNumber(logsHealth, ['total_logs', 'totalLogs', 'total']);
  const logsErrorCount = firstNumber(nestedRecord(logsHealth, 'levels'), ['error', 'errors']);
  const logsHealthStatus = logsTotal > 0 ? '正常' : firstText(logsHealth, ['status', 'state', 'health']);

  const throughputOverallSource = pickTrendDimension(filteredThroughputSource, platformFilter, groupFilter);
  const errorTrendOverallSource = pickTrendDimension(filteredErrorTrendSource, platformFilter, groupFilter);

  const throughputPoints = summarizeTrendByBucket(throughputOverallSource, ['success_count', 'successCount', 'requests', 'request_count', 'requestCount', 'total_requests', 'totalRequests', 'count', 'value']);
  const accountSwitchPoints = summarizeTrendByBucket(throughputOverallSource, ['account_switch_count', 'accountSwitchCount', 'avg_account_switch_count', 'avgAccountSwitchCount', 'switch_count', 'switchCount'], 'average');
  const errorTrendPoints = summarizeTrendByBucket(errorTrendOverallSource, ['error_count_total', 'errorCountTotal', 'errors', 'error_count', 'errorCount', 'count', 'value']);
  const latencyHistogramPoints = filteredLatencyHistogram.map((item, index) => ({
    label: firstText(item, ['range', 'bucket', 'label']) !== '--' ? firstText(item, ['range', 'bucket', 'label']) : `${index + 1}`,
    value: pointValue(item, ['count', 'request_count', 'requestCount', 'total_requests', 'totalRequests', 'value']),
  }));
  const errorDistributionRows = [...filteredErrorDistribution]
    .sort((left, right) => pointValue(right, ['count', 'value', 'sla']) - pointValue(left, ['count', 'value', 'sla']))
    .slice(0, 8);
  const availableAccounts = filteredAccountAvailability.filter((item) => {
    const explicit = isRecord(item) ? item.is_available ?? item.isAvailable : undefined;
    if (explicit !== undefined) return isTruthyValue(explicit);
    return !isTruthyValue((item as Record<string, unknown>).has_error) && !isTruthyValue((item as Record<string, unknown>).is_rate_limited);
  }).length;
  const unavailableAccounts = Math.max(filteredAccountAvailability.length - availableAccounts, 0);
  const rateLimitedAccounts = filteredAccountAvailability.filter((item) => isTruthyValue((item as Record<string, unknown>).is_rate_limited ?? (item as Record<string, unknown>).isRateLimited)).length;
  const overloadedAccounts = filteredAccountAvailability.filter((item) => isTruthyValue((item as Record<string, unknown>).is_overloaded ?? (item as Record<string, unknown>).isOverloaded)).length;
  const accountAvailabilityPercent = filteredAccountAvailability.length > 0 ? (availableAccounts / filteredAccountAvailability.length) * 100 : 0;
  const concurrencyRows = filteredConcurrencyItems.length > 0 ? filteredConcurrencyItems : (!platformFilter && !groupFilter && (currentConcurrency || queueSize)) ? [{
    platform: firstText(concurrency, ['platform', 'provider']) !== '--' ? firstText(concurrency, ['platform', 'provider']) : 'overall',
    current_concurrency: currentConcurrency,
    queue_size: queueSize,
    max_concurrency: firstNumber(concurrency, ['max_concurrency', 'maxConcurrency', 'limit', 'capacity']),
  }] : [];

  const hasOverviewFallback = Boolean(snapshot);
  const firstError = hasOverviewFallback ? null : overviewQuery.error || realtimeQuery.error || snapshotQuery.error;

  function refetchAll() {
    overviewQuery.refetch();
    snapshotQuery.refetch();
    realtimeQuery.refetch();
    concurrencyQuery.refetch();
    userConcurrencyQuery.refetch();
    accountAvailabilityQuery.refetch();
    tokenStatsQuery.refetch();
    throughputQuery.refetch();
    errorTrendQuery.refetch();
    errorDistributionQuery.refetch();
    latencyHistogramQuery.refetch();
    requestsQuery.refetch();
    requestErrorsQuery.refetch();
    upstreamErrorsQuery.refetch();
    errorsQuery.refetch();
    systemLogsQuery.refetch();
    logsHealthQuery.refetch();
    runtimeAlertQuery.refetch();
    alertEventsQuery.refetch();
  }

  const refreshing = overviewQuery.isRefetching || snapshotQuery.isRefetching || realtimeQuery.isRefetching || concurrencyQuery.isRefetching || userConcurrencyQuery.isRefetching || accountAvailabilityQuery.isRefetching || systemLogsQuery.isRefetching || runtimeAlertQuery.isRefetching || alertEventsQuery.isRefetching || requestsQuery.isRefetching || requestErrorsQuery.isRefetching;
  const lastRefreshText = formatKnownTime(firstTextValue(overview, ['created_at', 'createdAt', 'updated_at', 'updatedAt']), firstTextValue(logsHealth, ['latest_log_at', 'latestLogAt']));
  const activeFilterOptions: FilterOption[] = activeFilterMenu === 'platform'
    ? platformOptions
    : activeFilterMenu === 'group'
      ? groupOptions
      : activeFilterMenu === 'time'
        ? timeOptions
        : [];

  function selectFilterOption(value: string) {
    if (activeFilterMenu === 'platform') {
      setPlatformFilter(value);
    }
    if (activeFilterMenu === 'group') {
      setGroupFilter(value);
    }
    if (activeFilterMenu === 'time') {
      setTimeRange(value as OpsTimeRange);
    }
    setActiveFilterMenu(null);
  }

  function isFilterOptionSelected(value: string) {
    if (activeFilterMenu === 'platform') return value === platformFilter;
    if (activeFilterMenu === 'group') return value === groupFilter;
    if (activeFilterMenu === 'time') return value === timeRange;
    return false;
  }

  function renderFilterChip(menu: Exclude<OpsFilterMenu, null>, label: string, selected: boolean) {
    const active = activeFilterMenu === menu;
    const highlighted = active || selected;

    return (
      <Pressable
        key={menu}
        style={{
          alignItems: 'center',
          backgroundColor: highlighted ? colors.successBg : colors.mutedCard,
          borderColor: highlighted ? colors.primary : colors.border,
          borderRadius: 999,
          borderWidth: 1,
          flexDirection: 'row',
          gap: 5,
          paddingHorizontal: 12,
          paddingVertical: 7,
        }}
        onPress={() => setActiveFilterMenu((current) => (current === menu ? null : menu))}
      >
        <Text style={{ color: highlighted ? colors.primary : colors.badgeDefaultText, fontSize: 12, fontWeight: '800' }}>{label}</Text>
        <ChevronDown color={highlighted ? colors.primary : colors.badgeDefaultText} size={13} />
      </Pressable>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: '运维监控' }} />
      <ScreenShell
        title="运维监控"
        subtitle={`状态：就绪 · 刷新 ${lastRefreshText}`}
        icon={ServerCog}
        variant="minimal"
        refreshing={refreshing}
        onRefresh={refetchAll}
        safeAreaEdges={['bottom']}
        bottomInsetClassName="pb-8"
        contentGapClassName="mt-3 gap-3"
      >
        {firstError ? (
          <View style={{ backgroundColor: colors.errorBg, borderRadius: 14, padding: 14 }}>
            <Text style={{ color: colors.errorText, fontWeight: '800' }}>运维概览加载失败</Text>
            <Text style={{ color: colors.errorText, fontSize: 13, lineHeight: 20, marginTop: 6 }}>{getErrorMessage(firstError)}</Text>
          </View>
        ) : null}

        <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 14 }}>
          <View style={{ alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {renderFilterChip('platform', platformFilter ? platformFilter.toUpperCase() : '全部平台', Boolean(platformFilter))}
            {renderFilterChip('group', groupFilter ? `分组 #${groupFilter}` : '全部分组', Boolean(groupFilter))}
            {renderFilterChip('time', getTimeRangeLabel(timeRange), true)}
            <View style={{ backgroundColor: alertCount > 0 ? colors.errorBg : colors.successBg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
              <Text style={{ color: alertCount > 0 ? colors.errorText : colors.success, fontSize: 12, fontWeight: '800' }}>
                {alertCount > 0 ? `预警 ${formatCompactNumber(alertCount)}` : '预警规则'}
              </Text>
            </View>
          </View>
          {activeFilterMenu ? (
            <View style={{ backgroundColor: colors.mutedCard, borderColor: colors.border, borderRadius: 14, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, padding: 10 }}>
              {activeFilterOptions.map((option) => {
                const selected = isFilterOptionSelected(option.value);

                return (
                  <Pressable
                    key={`${activeFilterMenu}-${option.value || 'all'}`}
                    style={{
                      backgroundColor: selected ? colors.primary : colors.card,
                      borderColor: selected ? colors.primary : colors.border,
                      borderRadius: 999,
                      borderWidth: 1,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                    }}
                    onPress={() => selectFilterOption(option.value)}
                  >
                    <Text style={{ color: selected ? colors.primaryText : colors.badgeDefaultText, fontSize: 12, fontWeight: '800' }}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>

        <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 14 }}>
          <SectionTitle title="实时状态" icon={Gauge} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <InfoTile label="健康分" value={healthScore === undefined ? '--' : formatCompactNumber(healthScore)} tone={healthScore === undefined ? 'default' : healthScore >= 90 ? 'success' : healthScore < 60 ? 'danger' : 'default'} />
            <InfoTile label="QPS" value={qps.toFixed(qps >= 10 ? 0 : 2)} tone={qps > 0 ? 'success' : 'default'} />
            <InfoTile label="TPS" value={formatCompactNumber(tokenPerSecond)} tone={tokenPerSecond > 0 ? 'success' : 'default'} />
            <InfoTile label="请求数" value={formatCompactNumber(totalRequests)} />
            <InfoTile label="Token数" value={formatCompactNumber(tokenConsumed)} />
            <InfoTile label="SLA" value={slaPercent === undefined ? '--' : formatPercent(slaPercent)} tone={slaPercent === undefined ? 'default' : slaPercent >= 99 ? 'success' : 'danger'} />
            <InfoTile label="错误率" value={formatPercent(errorRate * 100)} tone={errorRate > 0 ? 'danger' : 'success'} />
            <InfoTile label="错误数" value={formatCompactNumber(errors)} tone={errors > 0 ? 'danger' : 'default'} />
            <InfoTile label="上游错误率" value={formatPercent(upstreamErrorRate * 100)} tone={upstreamErrorRate > 0 ? 'danger' : 'success'} />
            <InfoTile label="上游错误" value={formatCompactNumber(upstreamErrorCount)} tone={upstreamErrorCount > 0 ? 'danger' : 'default'} />
            <InfoTile label="429/529" value={`${formatCompactNumber(upstream429Count)} / ${formatCompactNumber(upstream529Count)}`} tone={upstream429Count + upstream529Count > 0 ? 'danger' : 'default'} />
            <InfoTile label="业务限流" value={formatCompactNumber(businessLimited)} tone={businessLimited > 0 ? 'danger' : 'default'} />
            <InfoTile label="平均延迟" value={formatLatency(avgLatency)} />
            <InfoTile label="P50 延迟" value={formatLatency(p50Latency)} />
            <InfoTile label="P90 延迟" value={formatLatency(p90Latency)} />
            <InfoTile label="P95 延迟" value={formatLatency(p95Latency)} />
            <InfoTile label="P99 延迟" value={formatLatency(p99Latency)} />
            <InfoTile label="最大延迟" value={formatLatency(maxLatency)} />
            <InfoTile label="TTFT Avg" value={formatLatency(ttftAvg)} />
            <InfoTile label="TTFT P50" value={formatLatency(ttftP50)} />
            <InfoTile label="TTFT P90" value={formatLatency(ttftP90)} />
            <InfoTile label="TTFT P95" value={formatLatency(ttftP95)} />
            <InfoTile label="TTFT P99" value={formatLatency(ttftP99)} />
            <InfoTile label="TTFT Max" value={formatLatency(ttftMax)} />
            <InfoTile label="CPU" value={formatPercent(cpuUsage)} tone={cpuUsage > 85 ? 'danger' : 'default'} />
            <InfoTile label="内存" value={memoryUsage ? formatPercent(memoryUsage) : `${formatCompactNumber(memoryUsed)}MB`} />
            <InfoTile label="DB" value={dbStatus} tone={dbStatus === '正常' ? 'success' : dbStatus === '异常' ? 'danger' : 'default'} />
            <InfoTile label="DB 连接" value={`${formatCompactNumber(dbConnActive)} / ${formatCompactNumber(dbConnIdle)} / ${formatCompactNumber(dbConnWaiting)}`} />
            <InfoTile label="Redis" value={redisStatus} tone={redisStatus === '正常' ? 'success' : redisStatus === '异常' ? 'danger' : 'default'} />
            <InfoTile label="Redis 连接" value={`${formatCompactNumber(redisConnTotal)} / ${formatCompactNumber(redisConnIdle)}`} />
            <InfoTile label="锁键" value={formatCompactNumber(lockKeys)} />
            <InfoTile label="后台任务" value={formatCompactNumber(backgroundTasks)} />
            <InfoTile label="告警事件" value={formatCompactNumber(totalAlertEvents)} tone={alertCount > 0 ? 'danger' : 'default'} />
          </View>
        </View>

        <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 14 }}>
          <SectionTitle title="账号可用性" icon={ShieldCheck} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <InfoTile label="账号总数" value={formatCompactNumber(filteredAccountAvailability.length)} />
            <InfoTile label="可用账号" value={formatCompactNumber(availableAccounts)} tone={availableAccounts > 0 ? 'success' : 'default'} />
            <InfoTile label="不可用" value={formatCompactNumber(unavailableAccounts)} tone={unavailableAccounts > 0 ? 'danger' : 'default'} />
            <InfoTile label="限流中" value={formatCompactNumber(rateLimitedAccounts)} tone={rateLimitedAccounts > 0 ? 'danger' : 'default'} />
            <InfoTile label="过载中" value={formatCompactNumber(overloadedAccounts)} tone={overloadedAccounts > 0 ? 'danger' : 'default'} />
            <InfoTile label="可用率" value={filteredAccountAvailability.length ? formatPercent(accountAvailabilityPercent) : '--'} tone={accountAvailabilityPercent >= 80 ? 'success' : filteredAccountAvailability.length ? 'danger' : 'default'} />
          </View>
          <MiniBar value={accountAvailabilityPercent} tone={accountAvailabilityPercent >= 80 ? 'success' : 'danger'} />
          <View style={{ gap: 10, marginTop: 12 }}>
            {accountAvailabilityRows.map((item, index) => {
              const name = textOrDash(firstTextValue(item, ['account_name', 'accountName', 'name']), `账号 #${firstTextValue(item, ['account_id', 'accountId', 'id']) ?? index + 1}`);
              const platform = textOrDash(firstTextValue(item, ['platform', 'provider']));
              const isAvailable = isTruthyValue((item as Record<string, unknown>).is_available ?? (item as Record<string, unknown>).isAvailable);
              const isRateLimited = isTruthyValue((item as Record<string, unknown>).is_rate_limited ?? (item as Record<string, unknown>).isRateLimited);
              const hasError = isTruthyValue((item as Record<string, unknown>).has_error ?? (item as Record<string, unknown>).hasError) || Boolean(item.error_message);
              const load = firstNumber(item, ['load_percentage', 'loadPercentage', 'concurrency_percentage', 'concurrencyPercentage']);
              const currentUse = firstNumber(item, ['current_in_use', 'currentInUse', 'current_concurrency', 'currentConcurrency']);
              const capacity = firstNumber(item, ['max_capacity', 'maxCapacity', 'total_concurrency', 'totalConcurrency']);

              return (
                <RecordCard
                  key={`${item.id ?? firstTextValue(item, ['account_id', 'accountId']) ?? index}`}
                  item={item}
                  title={name}
                  subtitle={`${platform} · 最近使用 ${formatKnownTime(item.last_used_at, item.updated_at)}`}
                  tone={hasError || isRateLimited || !isAvailable ? 'danger' : 'success'}
                >
                  <InfoTile label="状态" value={hasError ? '异常' : isRateLimited ? '限流' : isAvailable ? '可用' : textOrDash(item.status)} tone={hasError || isRateLimited || !isAvailable ? 'danger' : 'success'} />
                  <InfoTile label="占用" value={capacity > 0 ? `${formatCompactNumber(currentUse)} / ${formatCompactNumber(capacity)}` : formatCompactNumber(currentUse)} />
                  <InfoTile label="负载" value={load ? formatPercent(load) : '--'} tone={load > 85 ? 'danger' : 'default'} />
                  <InfoTile label="恢复" value={formatKnownTime(firstTextValue(item, ['rate_limit_reset_at', 'rateLimitResetAt', 'overload_until', 'overloadUntil']))} />
                </RecordCard>
              );
            })}
            {accountAvailabilityRows.length === 0 ? <EmptyText loading={accountAvailabilityQuery.isLoading} empty="暂无账号可用性数据。" /> : null}
          </View>
        </View>

        {concurrencyRows.length > 0 ? (
          <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 14 }}>
            <SectionTitle title="并发 / 排队" icon={ServerCog} />
            <View style={{ gap: 10, marginTop: 12 }}>
              {concurrencyRows.slice(0, 8).map((item, index) => {
                const platform = textOrDash(firstTextValue(item, ['platform', 'provider', 'name']), `#${index + 1}`).toUpperCase();
                const current = firstNumber(item, ['current_concurrency', 'currentConcurrency', 'current', 'active', 'active_requests', 'activeRequests']);
                const max = firstNumber(item, ['max_concurrency', 'maxConcurrency', 'limit', 'capacity']);
                const queued = firstNumber(item, ['queue_size', 'queueSize', 'queued', 'queued_requests', 'queuedRequests', 'pending_requests', 'pendingRequests']);
                const percent = max > 0 ? `${Math.round((current / max) * 100)}%` : '--';

                return (
                  <View key={`${platform}-${index}`} style={{ backgroundColor: colors.mutedCard, borderRadius: 14, padding: 12 }}>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>{platform}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                      <InfoTile label="并发" value={max > 0 ? `${formatCompactNumber(current)} / ${formatCompactNumber(max)}` : formatCompactNumber(current)} tone={current > 0 ? 'success' : 'default'} />
                      <InfoTile label="占用" value={percent} />
                      <InfoTile label="队列" value={formatCompactNumber(queued)} tone={queued > 0 ? 'danger' : 'default'} />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 14 }}>
          <SectionTitle title="用户并发" icon={Users} />
          <View style={{ gap: 10, marginTop: 12 }}>
            {userConcurrencyRows.map((item, index) => {
              const name = textOrDash(firstTextValue(item, ['username', 'user_name', 'userName', 'user_email', 'userEmail', 'email']), `用户 #${firstTextValue(item, ['user_id', 'userId', 'id']) ?? index + 1}`);
              const current = firstNumber(item, ['current_in_use', 'currentInUse', 'current_concurrency', 'currentConcurrency']);
              const max = firstNumber(item, ['max_capacity', 'maxCapacity', 'max_concurrency', 'maxConcurrency', 'limit']);
              const load = firstNumber(item, ['load_percentage', 'loadPercentage', 'concurrency_percentage', 'concurrencyPercentage']);
              const queued = firstNumber(item, ['waiting_in_queue', 'waitingInQueue', 'queue_size', 'queueSize']);

              return (
                <RecordCard key={`${item.id ?? firstTextValue(item, ['user_id', 'userId']) ?? index}`} item={item} title={name} subtitle={`并发 ${formatCompactNumber(current)} · 排队 ${formatCompactNumber(queued)}`} tone={queued > 0 || load > 85 ? 'danger' : current > 0 ? 'success' : 'default'}>
                  <InfoTile label="并发" value={max > 0 ? `${formatCompactNumber(current)} / ${formatCompactNumber(max)}` : formatCompactNumber(current)} />
                  <InfoTile label="负载" value={load ? formatPercent(load) : '--'} tone={load > 85 ? 'danger' : 'default'} />
                  <InfoTile label="队列" value={formatCompactNumber(queued)} tone={queued > 0 ? 'danger' : 'default'} />
                </RecordCard>
              );
            })}
            {userConcurrencyRows.length === 0 ? <EmptyText loading={userConcurrencyQuery.isLoading} empty="暂无用户并发数据。" /> : null}
          </View>
        </View>

        {accountSwitchPoints.length > 1 ? (
          <LineTrendChart title="平均账号切换趋势" subtitle="账号路由切换随时间变化" points={accountSwitchPoints} color="#14b8a6" icon={Activity} formatValue={formatCompactNumber} />
        ) : null}

        {throughputPoints.length > 1 ? (
          <LineTrendChart title="吞吐趋势" subtitle="请求量随时间变化" points={throughputPoints} color={colors.primary} icon={Activity} formatValue={formatCompactNumber} />
        ) : null}

        {errorTrendPoints.length > 1 ? (
          <LineTrendChart title="错误趋势" subtitle="错误量随时间变化" points={errorTrendPoints} color={colors.errorText} icon={AlertTriangle} formatValue={formatCompactNumber} />
        ) : null}

        <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 14 }}>
          <SectionTitle title="错误分布 / 延迟桶" icon={BarChart3} />
          <View style={{ gap: 12, marginTop: 12 }}>
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.subtext, fontSize: 12, fontWeight: '800' }}>错误分布</Text>
              {errorDistributionRows.map((item, index) => {
                const label = textOrDash(firstTextValue(item, ['error_type', 'errorType', 'error_phase', 'errorPhase', 'status_code', 'statusCode', 'severity']), `错误 #${index + 1}`);
                const count = pointValue(item, ['count', 'value', 'sla']);
                return (
                  <View key={`${label}-${index}`} style={{ backgroundColor: colors.mutedCard, borderRadius: 12, padding: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <Text numberOfLines={1} style={{ color: colors.text, flex: 1, fontSize: 12, fontWeight: '800' }}>{label}</Text>
                      <Text style={{ color: colors.errorText, fontSize: 12, fontWeight: '800' }}>{formatCompactNumber(count)}</Text>
                    </View>
                    <MiniBar value={errors > 0 ? (count / Math.max(errors, 1)) * 100 : 0} tone={count > 0 ? 'danger' : 'default'} />
                  </View>
                );
              })}
              {errorDistributionRows.length === 0 ? <EmptyText loading={errorDistributionQuery.isLoading} empty="暂无错误分布数据。" /> : null}
            </View>
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.subtext, fontSize: 12, fontWeight: '800' }}>延迟直方图</Text>
              {latencyHistogramPoints.slice(0, 8).map((point, index) => (
                <View key={`${point.label}-${index}`} style={{ backgroundColor: colors.mutedCard, borderRadius: 12, padding: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <Text numberOfLines={1} style={{ color: colors.text, flex: 1, fontSize: 12, fontWeight: '800' }}>{point.label}</Text>
                    <Text style={{ color: colors.badgeDefaultText, fontSize: 12, fontWeight: '800' }}>{formatCompactNumber(point.value)}</Text>
                  </View>
                  <MiniBar value={Math.min(point.value, 100)} />
                </View>
              ))}
              {latencyHistogramPoints.length === 0 ? <EmptyText loading={latencyHistogramQuery.isLoading} empty="暂无延迟直方图数据。" /> : null}
            </View>
          </View>
        </View>

        <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 14 }}>
          <SectionTitle title="请求明细" icon={ListChecks} />
          <View style={{ gap: 10, marginTop: 12 }}>
            {requestRows.map((item, index) => {
              const title = textOrDash(firstTextValue(item, ['request_id', 'requestId', 'client_request_id', 'clientRequestId']), `请求 #${item.id ?? index + 1}`);
              const status = textOrDash(item.status, firstTextValue(item, ['status_code', 'statusCode']));
              const model = textOrDash(item.model, firstTextValue(item, ['requested_model', 'requestedModel', 'upstream_model', 'upstreamModel']));
              const tokens = firstNumber(item, ['total_tokens', 'totalTokens', 'tokens']);
              const cost = firstNumber(item, ['actual_cost', 'actualCost', 'total_cost', 'totalCost']);
              const duration = firstNumber(item, ['duration_ms', 'durationMs', 'latency_ms', 'latencyMs']);
              const isError = ['error', 'failed', 'failure'].includes(status.toLowerCase()) || firstNumber(item, ['status_code', 'statusCode']) >= 400;

              return (
                <RecordCard key={`${item.id ?? title}-${index}`} item={item} title={title} subtitle={`${model} · ${formatKnownTime(item.created_at, item.updated_at)}`} tone={isError ? 'danger' : 'success'}>
                  <InfoTile label="状态" value={status} tone={isError ? 'danger' : 'success'} />
                  <InfoTile label="Token" value={formatCompactNumber(tokens)} />
                  <InfoTile label="成本" value={`$${cost.toFixed(4)}`} />
                  <InfoTile label="耗时" value={formatLatency(duration)} />
                </RecordCard>
              );
            })}
            {requestRows.length === 0 ? <EmptyText loading={requestsQuery.isLoading} empty="暂无请求明细。" /> : null}
          </View>
        </View>

        <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 14 }}>
          <SectionTitle title="错误日志" icon={AlertTriangle} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <InfoTile label="请求错误" value={formatCompactNumber(firstNumber(requestErrorsQuery.data, ['total']) || requestErrorRows.length)} tone={requestErrorRows.length > 0 ? 'danger' : 'default'} />
            <InfoTile label="上游错误" value={formatCompactNumber(firstNumber(upstreamErrorsQuery.data, ['total']) || upstreamErrorRows.length)} tone={upstreamErrorRows.length > 0 ? 'danger' : 'default'} />
            <InfoTile label="通用错误" value={formatCompactNumber(firstNumber(errorsQuery.data, ['total']) || genericErrorRows.length)} tone={genericErrorRows.length > 0 ? 'danger' : 'default'} />
          </View>
          <View style={{ gap: 12, marginTop: 12 }}>
            {([
              ['请求错误', requestErrorRows, requestErrorsQuery.isLoading],
              ['上游错误', upstreamErrorRows, upstreamErrorsQuery.isLoading],
              ['通用错误', genericErrorRows, errorsQuery.isLoading],
            ] as const).map(([groupTitle, rows, loading]) => (
              <View key={groupTitle} style={{ gap: 8 }}>
                <Text style={{ color: colors.subtext, fontSize: 12, fontWeight: '800' }}>{groupTitle}</Text>
                {rows.map((item, index) => {
                  const title = textOrDash(item.error_message, item.upstream_error, item.message, firstTextValue(item, ['error_type', 'errorType']), `${groupTitle} #${index + 1}`);
                  const severity = textOrDash(firstTextValue(item, ['severity', 'level']));
                  const phase = textOrDash(firstTextValue(item, ['error_phase', 'errorPhase', 'phase']));
                  const statusCode = textOrDash(firstTextValue(item, ['status_code', 'statusCode', 'upstream_status_code', 'upstreamStatusCode']));
                  const resolved = isTruthyValue((item as Record<string, unknown>).resolved) || Boolean(item.resolved_at);

                  return (
                    <RecordCard key={`${groupTitle}-${item.id ?? index}`} item={item} title={title} subtitle={`${phase} · ${formatKnownTime(item.created_at, item.updated_at)}`} tone={resolved ? 'success' : 'danger'}>
                      <InfoTile label="状态码" value={statusCode} tone={statusCode !== '--' ? 'danger' : 'default'} />
                      <InfoTile label="级别" value={severity} tone={['P0', 'P1'].includes(severity) ? 'danger' : 'default'} />
                      <InfoTile label="模型" value={textOrDash(item.model, firstTextValue(item, ['requested_model', 'requestedModel']))} />
                      <InfoTile label="解决" value={resolved ? '是' : '否'} tone={resolved ? 'success' : 'danger'} />
                    </RecordCard>
                  );
                })}
                {rows.length === 0 ? <EmptyText loading={loading} empty={`暂无${groupTitle}。`} /> : null}
              </View>
            ))}
          </View>
        </View>

        <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 14 }}>
          <SectionTitle title="系统日志" icon={TerminalSquare} />
          <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 8 }}>
            日志状态：{logsHealthStatus} · 总量 {formatCompactNumber(logsTotal)} · 错误 {formatCompactNumber(logsErrorCount)}
          </Text>
          <View style={{ gap: 10, marginTop: 12 }}>
            {systemLogsQuery.isLoading ? <Text style={{ color: colors.subtext }}>正在加载系统日志...</Text> : null}
            {systemLogs.map((item, index) => {
              const extra = nestedRecord(item, 'extra');
              const level = textOrDash(item.level, item.status);
              const method = textOrDash(firstTextValue(extra, ['method']));
              const path = textOrDash(firstTextValue(extra, ['path', 'endpoint']));
              const status = textOrDash(firstTextValue(extra, ['status_code', 'statusCode']), item.status);
              const latency = firstNumber(extra, ['latency_ms', 'latencyMs']);
              const detail = method !== '--' && path !== '--'
                ? `http request completed status=${status} latency_ms=${latency || 0} method=${method} path=${path}`
                : textOrDash(item.message, item.error_message);

              return (
                <View key={`${item.id ?? index}`} style={{ backgroundColor: colors.mutedCard, borderRadius: 14, padding: 12 }}>
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: '800' }}>{formatKnownTime(item.created_at, item.updated_at)}</Text>
                  <Text style={{ color: colors.subtext, fontSize: 12, lineHeight: 18, marginTop: 5 }}>{detail}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                    <InfoTile label="级别" value={level} tone={level === 'error' ? 'danger' : level === 'warn' ? 'default' : 'success'} />
                    <InfoTile label="时间" value={formatKnownTime(item.created_at, item.updated_at)} />
                    <InfoTile label="日志详情" value={detail} />
                  </View>
                </View>
              );
            })}
            {!systemLogsQuery.isLoading && systemLogs.length === 0 ? <Text style={{ color: colors.subtext }}>暂无系统日志。</Text> : null}
          </View>
        </View>

        <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 14 }}>
          <SectionTitle title="告警事件" icon={BellRing} />
          <View style={{ gap: 10, marginTop: 12 }}>
            {alertEventsQuery.isLoading ? <Text style={{ color: colors.subtext }}>正在加载告警...</Text> : null}
            {alertEvents.map((item, index) => {
              const severity = textOrDash(firstTextValue(item, ['severity', 'level']));
              const status = textOrDash(item.status);
              const title = textOrDash(firstTextValue(item, ['title']), item.message, item.error_message, '告警事件');
              const description = textOrDash(firstTextValue(item, ['description', 'reason']));
              const isResolved = status.toLowerCase() === 'resolved' || Boolean(item.resolved_at);
              const firedAt = firstTextValue(item, ['fired_at', 'firedAt']) ?? item.created_at;
              const resolvedAt = firstTextValue(item, ['resolved_at', 'resolvedAt']);
              const displayStatus = formatAlertStatus(status, resolvedAt);
              const dimensions = formatDimensions(isRecord(item) ? item.dimensions : undefined);
              const emailSent = isRecord(item) && item.email_sent !== undefined ? (isTruthyValue(item.email_sent) ? '已发送' : '已忽略') : '-';

              return (
                <View key={`${item.id ?? index}`} style={{ backgroundColor: colors.mutedCard, borderRadius: 14, padding: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>{title}</Text>
                      <Text style={{ color: colors.subtext, fontSize: 12, lineHeight: 18, marginTop: 5 }}>
                        {formatKnownTime(firedAt)} · {severity} · {displayStatus}
                      </Text>
                      {description !== '--' ? (
                        <Text style={{ color: colors.subtext, fontSize: 12, lineHeight: 18, marginTop: 5 }}>{description}</Text>
                      ) : null}
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                        <InfoTile label="时间" value={formatKnownTime(firedAt)} />
                        <InfoTile label="级别" value={severity} tone={['P0', 'P1'].includes(severity) ? 'danger' : 'default'} />
                        <InfoTile label="平台" value={firstTextValue(item, ['platform', 'provider']) ?? '-'} />
                        <InfoTile label="规则 ID" value={textOrDash(firstTextValue(item, ['rule_id', 'ruleId']))} />
                        <InfoTile label="标题" value={title} />
                        <InfoTile label="持续时间" value={formatDurationBetween(firedAt, resolvedAt)} />
                        <InfoTile label="维度" value={dimensions} />
                        <InfoTile label="邮件已发送" value={emailSent} />
                      </View>
                    </View>
                    {item.id && !isResolved ? (
                      <Pressable
                        style={{ alignSelf: 'flex-start', backgroundColor: colors.successBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 }}
                        onPress={() => resolveAlertMutation.mutate(item.id as number | string)}
                      >
                        <Text style={{ color: colors.success, fontSize: 11, fontWeight: '800' }}>解决</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })}
            {!alertEventsQuery.isLoading && alertEvents.length === 0 ? <Text style={{ color: colors.subtext }}>暂无告警事件。</Text> : null}
          </View>
        </View>
      </ScreenShell>
    </>
  );
}
