import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { Activity, AlertTriangle, BellRing, Gauge, ListChecks, ServerCog, TerminalSquare, TimerReset } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { BarChartCard } from '@/src/components/bar-chart-card';
import { IconBadge } from '@/src/components/icon-badge';
import { LineTrendChart } from '@/src/components/line-trend-chart';
import { ListCard } from '@/src/components/list-card';
import { ScreenShell } from '@/src/components/screen-shell';
import { formatCompactNumber, formatDisplayTime } from '@/src/lib/formatters';
import { useAppTheme } from '@/src/lib/theme';
import {
  getOpsAlertEvents,
  getOpsAccountAvailability,
  getOpsConcurrency,
  getOpsDashboardOverview,
  getOpsDashboardSnapshot,
  getOpsErrors,
  getOpsErrorDistribution,
  getOpsErrorTrend,
  getOpsLatencyHistogram,
  getOpsOpenAiTokenStats,
  getOpsRequestErrors,
  getOpsRequests,
  getOpsRealtimeTraffic,
  getOpsRuntimeAlert,
  getOpsSystemLogs,
  getOpsSystemLogsHealth,
  getOpsThroughputTrend,
  getOpsUpstreamErrors,
  getOpsUserConcurrency,
  getSystemVersion,
  resolveOpsError,
  resolveOpsRequestError,
  resolveOpsUpstreamError,
  updateOpsAlertEventStatus,
} from '@/src/services/admin';
import type { OpsDashboardSnapshot, OpsMetricPoint, OpsRecord } from '@/src/types/admin';

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return '加载失败，请稍后重试。';
}

function hasReturnedData(value: unknown) {
  if (!value) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
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

function pointLabel(point: OpsMetricPoint, index: number) {
  const value = point.label || point.time || point.date || firstText(point, ['bucket_start', 'bucketStart', 'bucket', 'name', 'type', 'timestamp']) || `${index + 1}`;
  return getShortTimeLabel(value);
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

function isHealthyAccount(item: OpsRecord) {
  const status = `${item.status ?? ''}`.toLowerCase();
  const schedulable = isRecord(item) ? item.schedulable : undefined;
  const statusHealthy = !['error', 'disabled', 'inactive', 'failed', 'revoked'].includes(status);

  if (schedulable !== undefined && schedulable !== null) {
    return isTruthyValue(schedulable) && statusHealthy;
  }

  return statusHealthy && ['active', 'ok', 'normal', 'healthy'].includes(status);
}

function MetricCard({ title, value, detail, icon }: { title: string; value: string; detail?: string; icon: LucideIcon }) {
  const colors = useAppTheme();

  return (
    <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16, borderWidth: 1, flex: 1, minWidth: 146, padding: 14 }}>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}>
        <IconBadge icon={icon} containerSize={30} size={15} />
        <Text style={{ color: colors.subtext, flex: 1, fontSize: 12 }}>{title}</Text>
      </View>
      <Text numberOfLines={1} style={{ color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 8 }}>{value}</Text>
      {detail ? <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 11, marginTop: 6 }}>{detail}</Text> : null}
    </View>
  );
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

export default function OpsScreen() {
  const colors = useAppTheme();
  const queryClient = useQueryClient();

  const overviewQuery = useQuery({ queryKey: ['ops-overview'], queryFn: getOpsDashboardOverview, staleTime: 30_000 });
  const snapshotQuery = useQuery({ queryKey: ['ops-dashboard-snapshot'], queryFn: getOpsDashboardSnapshot, staleTime: 30_000 });
  const realtimeQuery = useQuery({ queryKey: ['ops-realtime'], queryFn: getOpsRealtimeTraffic, staleTime: 15_000 });
  const concurrencyQuery = useQuery({ queryKey: ['ops-concurrency'], queryFn: getOpsConcurrency, staleTime: 15_000 });
  const userConcurrencyQuery = useQuery({ queryKey: ['ops-user-concurrency'], queryFn: getOpsUserConcurrency, staleTime: 15_000 });
  const accountAvailabilityQuery = useQuery({ queryKey: ['ops-account-availability'], queryFn: getOpsAccountAvailability, staleTime: 30_000 });
  const tokenStatsQuery = useQuery({ queryKey: ['ops-openai-token-stats'], queryFn: getOpsOpenAiTokenStats, staleTime: 30_000 });
  const throughputQuery = useQuery({ queryKey: ['ops-throughput-trend'], queryFn: getOpsThroughputTrend, staleTime: 60_000 });
  const errorTrendQuery = useQuery({ queryKey: ['ops-error-trend'], queryFn: getOpsErrorTrend, staleTime: 60_000 });
  const latencyQuery = useQuery({ queryKey: ['ops-latency-histogram'], queryFn: getOpsLatencyHistogram, staleTime: 60_000 });
  const errorDistributionQuery = useQuery({ queryKey: ['ops-error-distribution'], queryFn: getOpsErrorDistribution, staleTime: 60_000 });
  const requestsQuery = useQuery({ queryKey: ['ops-requests'], queryFn: () => getOpsRequests(), staleTime: 30_000 });
  const requestErrorsQuery = useQuery({ queryKey: ['ops-request-errors'], queryFn: () => getOpsRequestErrors(), staleTime: 30_000 });
  const genericErrorsQuery = useQuery({ queryKey: ['ops-errors'], queryFn: () => getOpsErrors(), staleTime: 30_000 });
  const upstreamErrorsQuery = useQuery({ queryKey: ['ops-upstream-errors'], queryFn: () => getOpsUpstreamErrors(), staleTime: 30_000 });
  const systemLogsQuery = useQuery({ queryKey: ['ops-system-logs'], queryFn: () => getOpsSystemLogs(), staleTime: 30_000 });
  const logsHealthQuery = useQuery({ queryKey: ['ops-logs-health'], queryFn: getOpsSystemLogsHealth, staleTime: 60_000 });
  const runtimeAlertQuery = useQuery({ queryKey: ['ops-runtime-alert'], queryFn: getOpsRuntimeAlert, staleTime: 30_000 });
  const alertEventsQuery = useQuery({ queryKey: ['ops-alert-events'], queryFn: () => getOpsAlertEvents(), staleTime: 30_000 });
  const versionQuery = useQuery({ queryKey: ['system-version'], queryFn: getSystemVersion, staleTime: 120_000 });

  const resolveErrorMutation = useMutation({
    mutationFn: ({ id, source }: { id: number | string; source: 'request' | 'generic' | 'upstream' }) => {
      if (source === 'upstream') return resolveOpsUpstreamError(id);
      if (source === 'generic') return resolveOpsError(id);
      return resolveOpsRequestError(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ops-request-errors'] });
      queryClient.invalidateQueries({ queryKey: ['ops-errors'] });
      queryClient.invalidateQueries({ queryKey: ['ops-upstream-errors'] });
    },
  });

  const resolveAlertMutation = useMutation({
    mutationFn: (id: number | string) => updateOpsAlertEventStatus(id, 'resolved'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ops-alert-events'] }),
  });

  const snapshot = snapshotQuery.data;
  const overview = overviewQuery.data || snapshot?.overview || snapshot;
  const realtime = realtimeQuery.data || snapshot?.realtime || snapshot?.overview || snapshot;
  const concurrency = concurrencyQuery.data;
  const userConcurrency = userConcurrencyQuery.data;
  const accountAvailability = accountAvailabilityQuery.data;
  const accountAvailabilityItems = getItems(accountAvailability);
  const tokenStats = tokenStatsQuery.data || snapshot?.openai_token_stats;
  const runtimeAlert = runtimeAlertQuery.data;
  const logsHealth = logsHealthQuery.data;
  const recentRequests = getItems(requestsQuery.data).slice(0, 8);
  const requestErrorItems = getItems(requestErrorsQuery.data).slice(0, 8);
  const genericErrorItems = getItems(genericErrorsQuery.data).slice(0, 8);
  const upstreamErrorItems = getItems(upstreamErrorsQuery.data).slice(0, 8);
  const requestErrorSource: 'request' | 'generic' | 'upstream' = requestErrorItems.length > 0 ? 'request' : genericErrorItems.length > 0 ? 'generic' : 'upstream';
  const requestErrors = requestErrorItems.length > 0 ? requestErrorItems : genericErrorItems.length > 0 ? genericErrorItems : upstreamErrorItems;
  const systemLogs = getItems(systemLogsQuery.data).slice(0, 8);
  const alertEvents = getItems(alertEventsQuery.data).slice(0, 8);

  const successCount = firstNumber(overview, ['success_count', 'successCount', 'successes', 'success']);
  const errors = firstNumber(overview, ['error_count_total', 'errorCountTotal', 'errors', 'error_count', 'errorCount', 'request_errors', 'requestErrors', 'total_errors', 'totalErrors']);
  const realtimeRequests = firstNumber(realtime, ['total_requests', 'totalRequests', 'requests']);
  const totalRequests = firstNumber(overview, ['total_requests', 'totalRequests', 'requests', 'request_count', 'requestCount']) || realtimeRequests || successCount + errors;
  const rawErrorRate = firstNumberValue(overview, ['error_rate', 'errorRate', 'errors_rate']);
  const errorRate = rawErrorRate !== undefined ? (rawErrorRate > 1 ? rawErrorRate / 100 : rawErrorRate) : totalRequests > 0 ? errors / totalRequests : 0;
  const qps = firstNumber(overview, ['qps', 'queries_per_second', 'requests_per_second', 'requestsPerSecond']) || firstNumber(realtime, ['qps', 'queries_per_second', 'requests_per_second', 'requestsPerSecond']);
  const rpm = firstNumber(overview, ['rpm', 'requests_per_minute', 'requestsPerMinute']) || firstNumber(realtime, ['rpm', 'requests_per_minute', 'requestsPerMinute']) || qps * 60;
  const avgLatency = firstNumber(overview, ['duration_avg_ms', 'durationAvgMs', 'avg_latency_ms', 'avgLatencyMs', 'average_latency_ms', 'averageLatencyMs', 'latency_ms', 'latencyMs', 'avg_duration_ms', 'avgDurationMs']) || firstNumber(realtime, ['duration_avg_ms', 'durationAvgMs', 'avg_latency_ms', 'avgLatencyMs', 'average_latency_ms', 'averageLatencyMs']);
  const p95Latency = firstNumber(overview, ['duration_p95_ms', 'durationP95Ms', 'p95_latency_ms', 'p95LatencyMs', 'p95', 'latency_p95_ms', 'latencyP95Ms']);
  const p99Latency = firstNumber(overview, ['duration_p99_ms', 'durationP99Ms', 'p99_latency_ms', 'p99LatencyMs', 'p99', 'latency_p99_ms', 'latencyP99Ms']);
  const ttftAvg = firstNumber(overview, ['ttft_avg_ms', 'ttftAvgMs', 'time_to_first_token_avg_ms', 'timeToFirstTokenAvgMs']);
  const healthyAccountCount = accountAvailabilityItems.filter(isHealthyAccount).length;
  const activeAccountCount = accountAvailabilityItems.filter((item) => `${item.status ?? ''}`.toLowerCase() === 'active').length;
  const unavailableAccountCount = accountAvailabilityItems.length > 0 ? accountAvailabilityItems.length - healthyAccountCount : 0;
  const availableAccounts = firstNumberValue(accountAvailability, ['available_accounts', 'availableAccounts', 'normal_accounts', 'normalAccounts', 'healthy_accounts', 'healthyAccounts']) ?? healthyAccountCount;
  const unavailableAccounts = firstNumberValue(accountAvailability, ['unavailable_accounts', 'unavailableAccounts', 'error_accounts', 'errorAccounts', 'failed_accounts', 'failedAccounts']) ?? unavailableAccountCount;
  const activeAccounts = firstNumber(overview, ['active_accounts', 'activeAccounts', 'normal_accounts', 'normalAccounts', 'healthy_accounts', 'healthyAccounts']) || activeAccountCount || availableAccounts;
  const alertCount = firstNumberValue(runtimeAlert, ['events_open', 'eventsOpen', 'open_alerts', 'openAlerts']) ?? firstNumber(overview, ['alert_count', 'alertCount', 'alerts', 'open_alerts', 'openAlerts']);
  const totalAlertEvents = firstNumberValue(runtimeAlert, ['events_total', 'eventsTotal', 'total']) ?? firstNumber(alertEventsQuery.data, ['total']);
  const enabledAlertRules = firstNumber(runtimeAlert, ['rules_enabled', 'rulesEnabled']);
  const currentConcurrency = firstNumber(realtime, ['current_concurrency', 'currentConcurrency', 'active_requests', 'activeRequests', 'inflight_requests', 'inflightRequests', 'concurrency']) || firstNumber(concurrency, ['current_concurrency', 'currentConcurrency', 'active_requests', 'activeRequests', 'total']);
  const queueSize = firstNumber(overview, ['concurrency_queue_depth', 'concurrencyQueueDepth']) || firstNumber(realtime, ['queue_size', 'queueSize', 'queued_requests', 'queuedRequests', 'pending_requests', 'pendingRequests']) || firstNumber(concurrency, ['queue_size', 'queueSize', 'pending_requests', 'pendingRequests']);
  const tokenPerSecond = firstNumber(overview, ['tps', 'tokens_per_second', 'tokensPerSecond', 'token_per_second']) || firstNumber(realtime, ['tps', 'tokens_per_second', 'tokensPerSecond', 'token_per_second']) || firstNumber(tokenStats, ['tps', 'tokens_per_second', 'tokensPerSecond']);
  const tokenConsumed = firstNumber(overview, ['token_consumed', 'tokenConsumed', 'tokens', 'total_tokens', 'totalTokens']) || firstNumber(tokenStats, ['token_consumed', 'tokenConsumed', 'tokens', 'total_tokens', 'totalTokens']);
  const businessLimited = firstNumber(overview, ['business_limited_count', 'businessLimitedCount']);
  const cpuUsage = firstNumber(overview, ['cpu_usage_percent', 'cpuUsagePercent']);
  const memoryUsage = firstNumber(overview, ['memory_usage_percent', 'memoryUsagePercent']);
  const memoryUsed = firstNumber(overview, ['memory_used_mb', 'memoryUsedMb']);
  const overviewRecord = isRecord(overview) ? overview : undefined;
  const dbStatus = formatHealth(overviewRecord?.db_ok ?? overviewRecord?.dbOk);
  const redisStatus = formatHealth(overviewRecord?.redis_ok ?? overviewRecord?.redisOk);
  const activeUsers = firstNumber(userConcurrency, ['active_users', 'activeUsers', 'users', 'total']);
  const logsTotal = firstNumber(logsHealth, ['total_logs', 'totalLogs', 'total']);
  const logsErrorCount = firstNumber(nestedRecord(logsHealth, 'levels'), ['error', 'errors']);
  const logsHealthStatus = logsTotal > 0 ? '正常' : firstText(logsHealth, ['status', 'state', 'health']);

  const throughputSource = firstNonEmptyTrend(
    throughputQuery.data,
    snapshotArray(snapshot, ['throughput_trend', 'throughputTrend']),
    snapshot
  );
  const errorSource = firstNonEmptyTrend(
    errorTrendQuery.data,
    snapshotArray(snapshot, ['error_trend', 'errorTrend']),
    snapshot
  );
  const latencySource = firstNonEmptyTrend(
    latencyQuery.data,
    snapshotArray(snapshot, ['latency_histogram', 'latencyHistogram']),
    snapshot
  );
  const distributionSource = firstNonEmptyTrend(
    errorDistributionQuery.data,
    snapshotArray(snapshot, ['error_distribution', 'errorDistribution']),
    snapshot
  );
  const throughputOverallSource = getOverallTrendPoints(throughputSource);
  const errorOverallSource = getOverallTrendPoints(errorSource);

  const throughputPoints = summarizeTrendByBucket(throughputOverallSource, ['success_count', 'successCount', 'requests', 'request_count', 'requestCount', 'total_requests', 'totalRequests', 'count', 'value']);
  const errorPoints = summarizeTrendByBucket(errorOverallSource, ['error_count_total', 'errorCountTotal', 'errors', 'error_count', 'errorCount', 'total_errors', 'totalErrors', 'count', 'value']);
  const latencyTrendPoints = summarizeTrendByBucket(throughputOverallSource, ['duration_avg_ms', 'durationAvgMs', 'avg_latency_ms', 'avgLatencyMs', 'latency_ms', 'latencyMs', 'value'], 'average');
  const latencyItems = latencySource.map((point, index) => ({
    label: pointLabel(point, index),
    value: pointValue(point, ['count', 'requests', 'request_count', 'requestCount', 'value']),
    color: '#0f766e',
    meta: textOrDash(formatLatency(pointValue(point, ['latency_ms', 'latencyMs', 'duration_ms', 'durationMs'])), point.label),
  }));
  const distributionItems = distributionSource.map((point, index) => {
    const type = firstTextValue(point, ['error_type', 'errorType', 'type', 'name', 'label']) ?? `${index + 1}`;
    const severity = firstTextValue(point, ['severity', 'level']);
    const phase = firstTextValue(point, ['error_phase', 'errorPhase', 'phase', 'source']);

    return {
      label: textOrDash(severity ? `${type} · ${severity}` : type),
      value: pointValue(point, ['count', 'errors', 'error_count', 'errorCount', 'value']),
      color: '#f97316',
      meta: phase ? `阶段 ${phase}` : undefined,
    };
  });

  const hasOverviewFallback = Boolean(snapshot);
  const firstError = hasOverviewFallback ? null : overviewQuery.error || realtimeQuery.error || snapshotQuery.error;
  const dataSources = [
    { label: 'overview', ok: hasReturnedData(overviewQuery.data), error: overviewQuery.error },
    { label: 'snapshot-v2', ok: hasReturnedData(snapshotQuery.data), error: snapshotQuery.error },
    { label: 'realtime', ok: hasReturnedData(realtimeQuery.data), error: realtimeQuery.error },
    { label: 'requests', ok: recentRequests.length > 0, error: requestsQuery.error },
    { label: 'request-errors', ok: requestErrorItems.length > 0, error: requestErrorsQuery.error },
    { label: 'concurrency', ok: hasReturnedData(concurrencyQuery.data), error: concurrencyQuery.error },
    { label: 'account-availability', ok: accountAvailabilityItems.length > 0, error: accountAvailabilityQuery.error },
    { label: 'runtime-alert', ok: hasReturnedData(runtimeAlert), error: runtimeAlertQuery.error },
    { label: 'throughput-trend', ok: throughputPoints.length > 0, error: throughputQuery.error },
    { label: 'error-trend', ok: errorPoints.length > 0, error: errorTrendQuery.error },
    { label: 'system-logs', ok: systemLogs.length > 0, error: systemLogsQuery.error },
    { label: 'logs-health', ok: hasReturnedData(logsHealth), error: logsHealthQuery.error },
    { label: 'alert-events', ok: alertEvents.length > 0, error: alertEventsQuery.error },
  ];
  const hasSourceError = dataSources.some((source) => Boolean(source.error));
  const hasVisibleOpsData = totalRequests > 0 || successCount > 0 || tokenConsumed > 0 || qps > 0 || rpm > 0 || currentConcurrency > 0 || availableAccounts > 0 || totalAlertEvents > 0 || throughputPoints.length > 0 || recentRequests.length > 0 || requestErrors.length > 0 || systemLogs.length > 0 || alertEvents.length > 0;
  const showDataSourceStatus = hasSourceError || (!overviewQuery.isLoading && !snapshotQuery.isLoading && !realtimeQuery.isLoading && !hasVisibleOpsData);

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
    latencyQuery.refetch();
    errorDistributionQuery.refetch();
    requestsQuery.refetch();
    requestErrorsQuery.refetch();
    genericErrorsQuery.refetch();
    upstreamErrorsQuery.refetch();
    systemLogsQuery.refetch();
    logsHealthQuery.refetch();
    runtimeAlertQuery.refetch();
    alertEventsQuery.refetch();
    versionQuery.refetch();
  }

  const refreshing = overviewQuery.isRefetching || snapshotQuery.isRefetching || realtimeQuery.isRefetching || requestsQuery.isRefetching || requestErrorsQuery.isRefetching || systemLogsQuery.isRefetching || runtimeAlertQuery.isRefetching;

  return (
    <>
      <Stack.Screen options={{ title: '运维监控' }} />
      <ScreenShell
        title="运维监控"
        subtitle="实时流量、错误、延迟、日志、告警和系统版本。"
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

        {showDataSourceStatus ? (
          <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 14 }}>
            <SectionTitle title="数据源状态" icon={AlertTriangle} />
            <Text style={{ color: colors.subtext, fontSize: 12, lineHeight: 18, marginTop: 8 }}>
              当前接口已连接，但主要运维指标没有可展示数据；下面可以定位是接口空返回、字段不匹配，还是接口报错。
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {dataSources.map((source) => {
                const failed = Boolean(source.error);
                const status = failed ? getErrorMessage(source.error) : source.ok ? '已返回' : '空';
                return (
                  <InfoTile
                    key={source.label}
                    label={source.label}
                    value={status}
                    tone={failed ? 'danger' : source.ok ? 'success' : 'default'}
                  />
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <MetricCard title="实时 QPS" value={qps.toFixed(qps >= 10 ? 0 : 2)} detail={`TPS ${formatCompactNumber(tokenPerSecond)}`} icon={Gauge} />
          <MetricCard title="请求总量" value={formatCompactNumber(totalRequests)} detail={`成功 ${formatCompactNumber(successCount)}`} icon={Activity} />
          <MetricCard title="错误数量" value={formatCompactNumber(errors)} detail={`错误率 ${formatPercent(errorRate * 100)}`} icon={AlertTriangle} />
          <MetricCard title="平均延迟" value={`${avgLatency.toFixed(0)}ms`} detail={p95Latency ? `P95 ${p95Latency.toFixed(0)}ms` : 'P95 --'} icon={TimerReset} />
          <MetricCard title="Token 消耗" value={formatCompactNumber(tokenConsumed)} detail={`RPM ${formatCompactNumber(rpm)}`} icon={Activity} />
          <MetricCard title="可用账号" value={formatCompactNumber(availableAccounts || activeAccounts)} detail={`打开告警 ${formatCompactNumber(alertCount)}`} icon={ServerCog} />
        </View>

        <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 14 }}>
          <SectionTitle title="实时状态" icon={Gauge} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <InfoTile label="QPS" value={qps.toFixed(qps >= 10 ? 0 : 2)} tone={qps > 0 ? 'success' : 'default'} />
            <InfoTile label="RPM" value={formatCompactNumber(rpm)} />
            <InfoTile label="成功请求" value={formatCompactNumber(successCount)} tone={successCount > 0 ? 'success' : 'default'} />
            <InfoTile label="错误率" value={formatPercent(errorRate * 100)} tone={errorRate > 0 ? 'danger' : 'success'} />
            <InfoTile label="业务限流" value={formatCompactNumber(businessLimited)} tone={businessLimited > 0 ? 'danger' : 'default'} />
            <InfoTile label="并发中" value={formatCompactNumber(currentConcurrency)} />
            <InfoTile label="队列" value={formatCompactNumber(queueSize)} tone={queueSize > 0 ? 'danger' : 'default'} />
            <InfoTile label="Token/s" value={formatCompactNumber(tokenPerSecond)} />
            <InfoTile label="Token 消耗" value={formatCompactNumber(tokenConsumed)} />
            <InfoTile label="平均延迟" value={formatLatency(avgLatency)} />
            <InfoTile label="P95 延迟" value={formatLatency(p95Latency)} />
            <InfoTile label="P99 延迟" value={formatLatency(p99Latency)} />
            <InfoTile label="TTFT" value={formatLatency(ttftAvg)} />
            <InfoTile label="CPU" value={formatPercent(cpuUsage)} tone={cpuUsage > 85 ? 'danger' : 'default'} />
            <InfoTile label="内存" value={memoryUsage ? formatPercent(memoryUsage) : `${formatCompactNumber(memoryUsed)}MB`} />
            <InfoTile label="DB" value={dbStatus} tone={dbStatus === '正常' ? 'success' : dbStatus === '异常' ? 'danger' : 'default'} />
            <InfoTile label="Redis" value={redisStatus} tone={redisStatus === '正常' ? 'success' : redisStatus === '异常' ? 'danger' : 'default'} />
            <InfoTile label="活跃用户" value={formatCompactNumber(activeUsers)} />
            <InfoTile label="可用账号" value={formatCompactNumber(availableAccounts || activeAccounts)} tone={(availableAccounts || activeAccounts) > 0 ? 'success' : 'default'} />
            <InfoTile label="不可用账号" value={formatCompactNumber(unavailableAccounts)} tone={unavailableAccounts > 0 ? 'danger' : 'default'} />
            <InfoTile label="告警规则" value={formatCompactNumber(enabledAlertRules)} />
            <InfoTile label="告警事件" value={formatCompactNumber(totalAlertEvents)} tone={alertCount > 0 ? 'danger' : 'default'} />
            <InfoTile label="日志状态" value={logsHealthStatus} tone={logsHealthStatus === '正常' ? 'success' : 'default'} />
            <InfoTile label="日志总量" value={formatCompactNumber(logsTotal)} />
            <InfoTile label="错误日志" value={formatCompactNumber(logsErrorCount)} tone={logsErrorCount > 0 ? 'danger' : 'default'} />
          </View>
        </View>

        {accountAvailabilityItems.length > 0 ? (
          <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 14 }}>
            <SectionTitle title="账号可用性" icon={ServerCog} />
            <View style={{ gap: 10, marginTop: 12 }}>
              {accountAvailabilityItems.slice(0, 8).map((item, index) => {
                const healthy = isHealthyAccount(item);
                const name = textOrDash(firstTextValue(item, ['account_name', 'accountName', 'name']), firstTextValue(item, ['account_id', 'accountId']), `#${index + 1}`);
                const status = textOrDash(item.status);
                const platform = textOrDash(item.platform);
                const type = textOrDash(firstTextValue(item, ['type', 'account_type', 'accountType']));
                const schedulable = textOrDash(item.schedulable);
                const errorMessage = textOrDash(firstTextValue(item, ['error_message', 'errorMessage', 'temp_unschedulable_reason', 'tempUnschedulableReason']));

                return (
                  <View key={`${item.account_id ?? item.id ?? index}`} style={{ backgroundColor: colors.mutedCard, borderRadius: 14, padding: 12 }}>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>{name} · {platform}</Text>
                    {errorMessage !== '--' ? (
                      <Text numberOfLines={2} style={{ color: colors.errorText, fontSize: 12, lineHeight: 18, marginTop: 5 }}>{errorMessage}</Text>
                    ) : (
                      <Text style={{ color: colors.subtext, fontSize: 12, lineHeight: 18, marginTop: 5 }}>
                        最近使用 {formatKnownTime(firstTextValue(item, ['last_used_at', 'lastUsedAt']))}
                      </Text>
                    )}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                      <InfoTile label="状态" value={status} tone={healthy ? 'success' : 'danger'} />
                      <InfoTile label="可调度" value={schedulable} tone={healthy ? 'success' : 'danger'} />
                      <InfoTile label="类型" value={type} />
                      <InfoTile label="账号 ID" value={textOrDash(firstTextValue(item, ['account_id', 'accountId']), item.id)} />
                      <InfoTile label="限流恢复" value={formatKnownTime(firstTextValue(item, ['rate_limit_reset_at', 'rateLimitResetAt']))} />
                      <InfoTile label="最近使用" value={formatKnownTime(firstTextValue(item, ['last_used_at', 'lastUsedAt']))} />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {throughputPoints.length > 1 ? (
          <LineTrendChart title="吞吐趋势" subtitle="请求量随时间变化" points={throughputPoints} color="#0f766e" icon={Activity} formatValue={formatCompactNumber} />
        ) : null}

        {errorPoints.length > 1 ? (
          <LineTrendChart title="错误趋势" subtitle="请求错误随时间变化" points={errorPoints} color="#f97316" icon={AlertTriangle} formatValue={formatCompactNumber} />
        ) : null}

        {latencyTrendPoints.length > 1 && latencyTrendPoints.some((point) => point.value > 0) ? (
          <LineTrendChart title="延迟趋势" subtitle="平均响应耗时随时间变化" points={latencyTrendPoints} color="#2563eb" icon={TimerReset} formatValue={formatLatency} />
        ) : null}

        {latencyItems.length > 0 ? (
          <BarChartCard title="延迟分布" subtitle="不同延迟区间的请求数量" items={latencyItems} icon={TimerReset} formatValue={formatCompactNumber} />
        ) : null}

        {distributionItems.length > 0 ? (
          <BarChartCard title="错误分布" subtitle="错误类型或来源分布" items={distributionItems} icon={AlertTriangle} formatValue={formatCompactNumber} />
        ) : null}

        <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 14 }}>
          <SectionTitle title="最近请求" icon={Activity} />
          <View style={{ gap: 10, marginTop: 12 }}>
            {requestsQuery.isLoading ? <Text style={{ color: colors.subtext }}>正在加载最近请求...</Text> : null}
            {recentRequests.map((item, index) => {
              const id = item.id ?? index;
              const extra = nestedRecord(item, 'extra');
              const method = textOrDash(item.method, firstTextValue(item, ['request_method', 'requestMethod', 'http_method', 'httpMethod']), firstTextValue(extra, ['method', 'http_method', 'httpMethod']));
              const path = textOrDash(item.path, firstTextValue(item, ['request_path', 'requestPath', 'inbound_endpoint', 'inboundEndpoint', 'url', 'endpoint', 'route']), firstTextValue(extra, ['path', 'endpoint', 'route']));
              const status = textOrDash(item.status, firstTextValue(item, ['status_code', 'statusCode', 'code']), firstTextValue(extra, ['status_code', 'statusCode']));
              const createdAt = textOrDash(item.created_at, firstTextValue(item, ['createdAt', 'completed_at', 'completedAt', 'timestamp', 'time']), firstTextValue(extra, ['completed_at', 'completedAt']));
              const latency = firstNumber(item, ['latency_ms', 'latencyMs', 'duration_ms', 'durationMs', 'elapsed_ms', 'elapsedMs']) || firstNumber(extra, ['latency_ms', 'latencyMs', 'duration_ms', 'durationMs']);

              return (
                <View key={`${id}`} style={{ backgroundColor: colors.mutedCard, borderRadius: 14, padding: 12 }}>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>{method} {path}</Text>
                  <Text style={{ color: colors.subtext, fontSize: 12, lineHeight: 18, marginTop: 5 }}>
                    {textOrDash(firstTextValue(item, ['model', 'model_name', 'modelName']), firstTextValue(extra, ['model']))} · {formatKnownTime(createdAt)} · {formatLatency(latency)}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                    <InfoTile label="请求 ID" value={`${item.id ?? '--'}`} />
                    <InfoTile label="状态" value={status} />
                    <InfoTile label="平台" value={textOrDash(item.platform, firstTextValue(extra, ['platform']))} />
                    <InfoTile label="用户" value={textOrDash(item.user_email, firstTextValue(item, ['userEmail', 'email', 'user_id', 'userId']))} />
                    <InfoTile label="账号" value={textOrDash(item.account_name, firstTextValue(item, ['accountName', 'account_id', 'accountId']), firstTextValue(extra, ['account_id', 'accountId']))} />
                  </View>
                </View>
              );
            })}
            {!requestsQuery.isLoading && recentRequests.length === 0 ? <Text style={{ color: colors.subtext }}>暂无最近请求。</Text> : null}
          </View>
        </View>

        <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 14 }}>
          <SectionTitle title="请求错误" icon={AlertTriangle} />
          <View style={{ gap: 10, marginTop: 12 }}>
            {requestErrorsQuery.isLoading || genericErrorsQuery.isLoading || upstreamErrorsQuery.isLoading ? <Text style={{ color: colors.subtext }}>正在加载请求错误...</Text> : null}
            {requestErrors.map((item, index) => {
              const id = item.id ?? index;
              const message = textOrDash(item.error_message, item.message, firstTextValue(item, ['reason', 'error_type', 'errorType', 'type']));
              const path = textOrDash(firstTextValue(item, ['request_path', 'requestPath', 'inbound_endpoint', 'inboundEndpoint']), item.path, item.model);
              const upstreamPath = textOrDash(firstTextValue(item, ['upstream_endpoint', 'upstreamEndpoint']));
              const status = textOrDash(item.status, firstTextValue(item, ['status_code', 'statusCode', 'code']));
              const upstreamStatus = textOrDash(firstTextValue(item, ['upstream_status_code', 'upstreamStatusCode']));
              const severity = textOrDash(firstTextValue(item, ['severity', 'level']));
              const phase = textOrDash(firstTextValue(item, ['error_phase', 'errorPhase', 'phase']));
              const resolvedValue = isRecord(item) ? item.resolved : undefined;
              const resolvedText = resolvedValue === undefined || resolvedValue === null ? '--' : isTruthyValue(resolvedValue) ? '已解决' : '未解决';
              const duration = firstNumber(item, ['duration_ms', 'durationMs', 'response_latency_ms', 'responseLatencyMs', 'latency_ms', 'latencyMs']);
              const ttft = firstNumber(item, ['time_to_first_token_ms', 'timeToFirstTokenMs', 'ttft_ms', 'ttftMs']);

              return (
                <View key={`${id}`} style={{ backgroundColor: colors.mutedCard, borderRadius: 14, padding: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>{message}</Text>
                      <Text style={{ color: colors.subtext, fontSize: 12, lineHeight: 18, marginTop: 5 }}>
                        {path} · {formatKnownTime(item.created_at, item.updated_at)} {upstreamPath !== '--' ? `· 上游 ${upstreamPath}` : ''}
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                        <InfoTile label="错误 ID" value={`${item.id ?? '--'}`} />
                        <InfoTile label="状态码" value={status} tone={status.startsWith('5') || status.startsWith('4') ? 'danger' : 'default'} />
                        <InfoTile label="上游状态" value={upstreamStatus} tone={upstreamStatus.startsWith('5') || upstreamStatus.startsWith('4') ? 'danger' : 'default'} />
                        <InfoTile label="严重级别" value={severity} tone={['P0', 'P1'].includes(severity) ? 'danger' : 'default'} />
                        <InfoTile label="阶段" value={phase} />
                        <InfoTile label="处理状态" value={resolvedText} tone={resolvedText === '已解决' ? 'success' : resolvedText === '未解决' ? 'danger' : 'default'} />
                        <InfoTile label="Key 前缀" value={textOrDash(firstTextValue(item, ['api_key_prefix', 'apiKeyPrefix']))} />
                        <InfoTile label="账号" value={textOrDash(item.account_name, firstTextValue(item, ['accountName', 'account_id', 'accountId']))} />
                        <InfoTile label="用户" value={textOrDash(item.user_email, firstTextValue(item, ['userEmail', 'email', 'user_id', 'userId']))} />
                        <InfoTile label="模型" value={textOrDash(item.model, firstTextValue(item, ['requested_model', 'requestedModel', 'upstream_model', 'upstreamModel']))} />
                        <InfoTile label="响应耗时" value={formatLatency(duration)} />
                        <InfoTile label="TTFT" value={formatLatency(ttft)} />
                      </View>
                    </View>
                    {item.id && resolvedText !== '已解决' ? (
                      <Pressable
                        style={{ alignSelf: 'flex-start', backgroundColor: colors.successBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 }}
                        onPress={() => resolveErrorMutation.mutate({ id: item.id as number | string, source: requestErrorSource })}
                      >
                        <Text style={{ color: colors.success, fontSize: 11, fontWeight: '800' }}>处理</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })}
            {!requestErrorsQuery.isLoading && !genericErrorsQuery.isLoading && !upstreamErrorsQuery.isLoading && requestErrors.length === 0 ? <Text style={{ color: colors.subtext }}>暂无请求错误。</Text> : null}
          </View>
        </View>

        <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 14 }}>
          <SectionTitle title="系统日志" icon={TerminalSquare} />
          <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 8 }}>
            日志健康：{logsHealthStatus} · 总量 {formatCompactNumber(logsTotal)} · 版本 {firstText(versionQuery.data, ['version', 'tag', 'build'])}
          </Text>
          <View style={{ gap: 10, marginTop: 12 }}>
            {systemLogsQuery.isLoading ? <Text style={{ color: colors.subtext }}>正在加载系统日志...</Text> : null}
            {systemLogs.map((item, index) => {
              const extra = nestedRecord(item, 'extra');
              const level = textOrDash(item.level, item.status);
              const component = textOrDash(firstTextValue(item, ['component']), firstTextValue(extra, ['component', 'service']));
              const method = textOrDash(firstTextValue(extra, ['method']));
              const path = textOrDash(firstTextValue(extra, ['path', 'endpoint']));
              const status = textOrDash(firstTextValue(extra, ['status_code', 'statusCode']), item.status);
              const latency = firstNumber(extra, ['latency_ms', 'latencyMs']);

              return (
                <View key={`${item.id ?? index}`} style={{ backgroundColor: colors.mutedCard, borderRadius: 14, padding: 12 }}>
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: '800' }}>{component} · {level}</Text>
                  <Text style={{ color: colors.subtext, fontSize: 12, lineHeight: 18, marginTop: 5 }}>{item.message || item.error_message || '--'}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                    <InfoTile label="日志 ID" value={`${item.id ?? '--'}`} />
                    <InfoTile label="级别" value={level} tone={level === 'error' ? 'danger' : level === 'warn' ? 'default' : 'success'} />
                    <InfoTile label="请求" value={method === '--' && path === '--' ? '--' : `${method} ${path}`} />
                    <InfoTile label="状态码" value={status} tone={status.startsWith('5') || status.startsWith('4') ? 'danger' : 'default'} />
                    <InfoTile label="平台" value={textOrDash(item.platform, firstTextValue(extra, ['platform']))} />
                    <InfoTile label="模型" value={textOrDash(item.model, firstTextValue(extra, ['model']))} />
                    <InfoTile label="耗时" value={formatLatency(latency)} />
                    <InfoTile label="时间" value={formatKnownTime(item.created_at, item.updated_at)} />
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
              const metricValue = firstNumberValue(item, ['metric_value', 'metricValue', 'value']);
              const thresholdValue = firstNumberValue(item, ['threshold_value', 'thresholdValue', 'threshold']);
              const isResolved = status.toLowerCase() === 'resolved' || Boolean(item.resolved_at);

              return (
                <View key={`${item.id ?? index}`} style={{ backgroundColor: colors.mutedCard, borderRadius: 14, padding: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>{title}</Text>
                      <Text style={{ color: colors.subtext, fontSize: 12, lineHeight: 18, marginTop: 5 }}>
                        {severity} · {formatKnownTime(firstTextValue(item, ['fired_at', 'firedAt']), item.created_at, item.updated_at)}
                      </Text>
                      {description !== '--' ? (
                        <Text style={{ color: colors.subtext, fontSize: 12, lineHeight: 18, marginTop: 5 }}>{description}</Text>
                      ) : null}
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                        <InfoTile label="告警 ID" value={`${item.id ?? '--'}`} />
                        <InfoTile label="级别" value={severity} tone={['P0', 'P1'].includes(severity) ? 'danger' : 'default'} />
                        <InfoTile label="状态" value={status} tone={isResolved ? 'success' : 'danger'} />
                        <InfoTile label="当前值" value={metricValue === undefined ? '--' : formatCompactNumber(metricValue)} />
                        <InfoTile label="阈值" value={thresholdValue === undefined ? '--' : formatCompactNumber(thresholdValue)} />
                        <InfoTile label="触发时间" value={formatKnownTime(firstTextValue(item, ['fired_at', 'firedAt']), item.created_at)} />
                        <InfoTile label="恢复时间" value={formatKnownTime(firstTextValue(item, ['resolved_at', 'resolvedAt']))} />
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

        <ListCard title="系统版本" meta={`版本 ${firstText(versionQuery.data, ['version', 'tag', 'build'])} · 镜像 ${firstText(versionQuery.data, ['image', 'container'])}`} icon={ListChecks}>
          <Text style={{ color: colors.subtext, fontSize: 12, lineHeight: 20 }}>
            更新、回滚、重启接口已存在，但属于高风险操作，当前先展示版本信息，避免误触生产服务。
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <InfoTile label="版本" value={firstText(versionQuery.data, ['version', 'tag', 'build'])} />
            <InfoTile label="提交" value={firstText(versionQuery.data, ['commit', 'git_commit', 'sha'])} />
            <InfoTile label="构建时间" value={firstText(versionQuery.data, ['build_time', 'built_at', 'created_at'])} />
            <InfoTile label="镜像" value={firstText(versionQuery.data, ['image', 'container'])} />
          </View>
        </ListCard>
      </ScreenShell>
    </>
  );
}
