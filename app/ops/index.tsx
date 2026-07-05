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
  getOpsDashboardOverview,
  getOpsErrorDistribution,
  getOpsErrorTrend,
  getOpsLatencyHistogram,
  getOpsRequestErrors,
  getOpsRealtimeTraffic,
  getOpsSystemLogs,
  getOpsSystemLogsHealth,
  getOpsThroughputTrend,
  getSystemVersion,
  resolveOpsRequestError,
  updateOpsAlertEventStatus,
} from '@/src/services/admin';
import type { OpsMetricPoint, OpsRecord } from '@/src/types/admin';

type TrendPayload = { trend?: OpsMetricPoint[]; items?: OpsMetricPoint[]; histogram?: OpsMetricPoint[]; distribution?: OpsMetricPoint[] };

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return '加载失败，请稍后重试。';
}

function firstNumber(source: Record<string, unknown> | undefined, keys: string[]) {
  if (!source) return 0;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}

function firstText(source: Record<string, unknown> | undefined, keys: string[]) {
  if (!source) return '--';
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '--';
}

function getItems(data?: { items?: OpsRecord[] } | OpsRecord[]) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return Array.isArray(data.items) ? data.items : [];
}

function getTrendItems(data?: TrendPayload) {
  if (!data) return [];
  if (Array.isArray(data.trend)) return data.trend;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.histogram)) return data.histogram;
  if (Array.isArray(data.distribution)) return data.distribution;
  return [];
}

function pointLabel(point: OpsMetricPoint, index: number) {
  const value = point.label || point.time || point.date || `${index + 1}`;
  if (value.length > 12) return value.slice(5, 16);
  return value;
}

function pointValue(point: OpsMetricPoint, keys: string[]) {
  return firstNumber(point as Record<string, unknown>, keys);
}

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`;
}

function formatLatency(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '--';
  return `${value.toFixed(0)}ms`;
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
  const realtimeQuery = useQuery({ queryKey: ['ops-realtime'], queryFn: getOpsRealtimeTraffic, staleTime: 15_000 });
  const throughputQuery = useQuery({ queryKey: ['ops-throughput-trend'], queryFn: getOpsThroughputTrend, staleTime: 60_000 });
  const errorTrendQuery = useQuery({ queryKey: ['ops-error-trend'], queryFn: getOpsErrorTrend, staleTime: 60_000 });
  const latencyQuery = useQuery({ queryKey: ['ops-latency-histogram'], queryFn: getOpsLatencyHistogram, staleTime: 60_000 });
  const errorDistributionQuery = useQuery({ queryKey: ['ops-error-distribution'], queryFn: getOpsErrorDistribution, staleTime: 60_000 });
  const requestErrorsQuery = useQuery({ queryKey: ['ops-request-errors'], queryFn: () => getOpsRequestErrors({ page_size: 8 }), staleTime: 30_000 });
  const systemLogsQuery = useQuery({ queryKey: ['ops-system-logs'], queryFn: () => getOpsSystemLogs({ page_size: 8 }), staleTime: 30_000 });
  const logsHealthQuery = useQuery({ queryKey: ['ops-logs-health'], queryFn: getOpsSystemLogsHealth, staleTime: 60_000 });
  const alertEventsQuery = useQuery({ queryKey: ['ops-alert-events'], queryFn: () => getOpsAlertEvents({ page_size: 8 }), staleTime: 30_000 });
  const versionQuery = useQuery({ queryKey: ['system-version'], queryFn: getSystemVersion, staleTime: 120_000 });

  const resolveErrorMutation = useMutation({
    mutationFn: (id: number | string) => resolveOpsRequestError(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ops-request-errors'] }),
  });

  const resolveAlertMutation = useMutation({
    mutationFn: (id: number | string) => updateOpsAlertEventStatus(id, 'resolved'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ops-alert-events'] }),
  });

  const overview = overviewQuery.data;
  const realtime = realtimeQuery.data;
  const requestErrors = getItems(requestErrorsQuery.data);
  const systemLogs = getItems(systemLogsQuery.data);
  const alertEvents = getItems(alertEventsQuery.data);

  const totalRequests = firstNumber(overview, ['total_requests', 'requests', 'request_count']) || firstNumber(realtime, ['total_requests', 'requests']);
  const errors = firstNumber(overview, ['errors', 'error_count', 'request_errors']);
  const errorRate = firstNumber(overview, ['error_rate']);
  const qps = firstNumber(overview, ['qps']) || firstNumber(realtime, ['qps']);
  const rpm = firstNumber(overview, ['rpm']) || firstNumber(realtime, ['rpm']);
  const avgLatency = firstNumber(overview, ['avg_latency_ms', 'average_latency_ms', 'latency_ms']) || firstNumber(realtime, ['avg_latency_ms']);
  const p95Latency = firstNumber(overview, ['p95_latency_ms', 'p95', 'latency_p95_ms']);
  const activeAccounts = firstNumber(overview, ['active_accounts', 'normal_accounts', 'healthy_accounts']);
  const alertCount = firstNumber(overview, ['alert_count', 'alerts', 'open_alerts']);
  const currentConcurrency = firstNumber(realtime, ['current_concurrency', 'active_requests', 'inflight_requests', 'concurrency']);
  const queueSize = firstNumber(realtime, ['queue_size', 'queued_requests', 'pending_requests']);
  const tokenPerSecond = firstNumber(realtime, ['tps', 'tokens_per_second', 'token_per_second']);

  const throughputPoints = getTrendItems(throughputQuery.data).map((point, index) => ({
    label: pointLabel(point, index),
    value: pointValue(point, ['requests', 'count', 'value']),
  }));
  const errorPoints = getTrendItems(errorTrendQuery.data).map((point, index) => ({
    label: pointLabel(point, index),
    value: pointValue(point, ['errors', 'count', 'value']),
  }));
  const latencyItems = getTrendItems(latencyQuery.data).map((point, index) => ({
    label: pointLabel(point, index),
    value: pointValue(point, ['count', 'requests', 'value']),
    color: '#0f766e',
    meta: `${pointValue(point, ['latency_ms', 'duration_ms']) || point.label || ''}`,
  }));
  const distributionItems = getTrendItems(errorDistributionQuery.data).map((point, index) => ({
    label: pointLabel(point, index),
    value: pointValue(point, ['count', 'errors', 'value']),
    color: '#f97316',
  }));

  const firstError = overviewQuery.error || realtimeQuery.error;

  function refetchAll() {
    overviewQuery.refetch();
    realtimeQuery.refetch();
    throughputQuery.refetch();
    errorTrendQuery.refetch();
    latencyQuery.refetch();
    errorDistributionQuery.refetch();
    requestErrorsQuery.refetch();
    systemLogsQuery.refetch();
    logsHealthQuery.refetch();
    alertEventsQuery.refetch();
    versionQuery.refetch();
  }

  const refreshing = overviewQuery.isRefetching || realtimeQuery.isRefetching || requestErrorsQuery.isRefetching || systemLogsQuery.isRefetching;

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
        bottomInsetClassName="pb-8"
      >
        {firstError ? (
          <View style={{ backgroundColor: colors.errorBg, borderRadius: 14, padding: 14 }}>
            <Text style={{ color: colors.errorText, fontWeight: '800' }}>运维概览加载失败</Text>
            <Text style={{ color: colors.errorText, fontSize: 13, lineHeight: 20, marginTop: 6 }}>{getErrorMessage(firstError)}</Text>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <MetricCard title="实时 QPS" value={qps.toFixed(qps >= 10 ? 0 : 2)} detail={`RPM ${formatCompactNumber(rpm)}`} icon={Gauge} />
          <MetricCard title="请求总量" value={formatCompactNumber(totalRequests)} detail="当前运维窗口" icon={Activity} />
          <MetricCard title="错误数量" value={formatCompactNumber(errors)} detail={`错误率 ${(errorRate * 100).toFixed(2)}%`} icon={AlertTriangle} />
          <MetricCard title="平均延迟" value={`${avgLatency.toFixed(0)}ms`} detail={p95Latency ? `P95 ${p95Latency.toFixed(0)}ms` : 'P95 --'} icon={TimerReset} />
          <MetricCard title="活跃账号" value={formatCompactNumber(activeAccounts)} detail={`告警 ${formatCompactNumber(alertCount)}`} icon={ServerCog} />
          <MetricCard title="实时并发" value={formatCompactNumber(currentConcurrency)} detail={`排队 ${formatCompactNumber(queueSize)}`} icon={Gauge} />
        </View>

        <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 14 }}>
          <SectionTitle title="实时状态" icon={Gauge} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <InfoTile label="QPS" value={qps.toFixed(qps >= 10 ? 0 : 2)} tone={qps > 0 ? 'success' : 'default'} />
            <InfoTile label="RPM" value={formatCompactNumber(rpm)} />
            <InfoTile label="并发中" value={formatCompactNumber(currentConcurrency)} />
            <InfoTile label="队列" value={formatCompactNumber(queueSize)} tone={queueSize > 0 ? 'danger' : 'default'} />
            <InfoTile label="Token/s" value={formatCompactNumber(tokenPerSecond)} />
            <InfoTile label="平均延迟" value={formatLatency(avgLatency)} />
            <InfoTile label="P95 延迟" value={formatLatency(p95Latency)} />
            <InfoTile label="日志状态" value={firstText(logsHealthQuery.data, ['status', 'state', 'health'])} />
          </View>
        </View>

        {throughputPoints.length > 1 ? (
          <LineTrendChart title="吞吐趋势" subtitle="请求量随时间变化" points={throughputPoints} color="#0f766e" icon={Activity} formatValue={formatCompactNumber} />
        ) : null}

        {errorPoints.length > 1 ? (
          <LineTrendChart title="错误趋势" subtitle="请求错误随时间变化" points={errorPoints} color="#f97316" icon={AlertTriangle} formatValue={formatCompactNumber} />
        ) : null}

        {latencyItems.length > 0 ? (
          <BarChartCard title="延迟分布" subtitle="不同延迟区间的请求数量" items={latencyItems} icon={TimerReset} formatValue={formatCompactNumber} />
        ) : null}

        {distributionItems.length > 0 ? (
          <BarChartCard title="错误分布" subtitle="错误类型或来源分布" items={distributionItems} icon={AlertTriangle} formatValue={formatCompactNumber} />
        ) : null}

        <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 14 }}>
          <SectionTitle title="请求错误" icon={AlertTriangle} />
          <View style={{ gap: 10, marginTop: 12 }}>
            {requestErrorsQuery.isLoading ? <Text style={{ color: colors.subtext }}>正在加载请求错误...</Text> : null}
            {requestErrors.map((item, index) => {
              const id = item.id ?? index;
              const message = item.error_message || item.message || firstText(item, ['reason', 'type']);

              return (
                <View key={`${id}`} style={{ backgroundColor: colors.mutedCard, borderRadius: 14, padding: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>{message}</Text>
                      <Text style={{ color: colors.subtext, fontSize: 12, lineHeight: 18, marginTop: 5 }}>
                        {item.method || '--'} {item.path || item.model || '--'} · {formatDisplayTime(item.created_at || item.updated_at)}
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                        <InfoTile label="错误 ID" value={`${item.id ?? '--'}`} />
                        <InfoTile label="状态" value={item.status || '--'} />
                        <InfoTile label="账号" value={item.account_name || '--'} />
                        <InfoTile label="用户" value={item.user_email || '--'} />
                        <InfoTile label="模型" value={item.model || '--'} />
                        <InfoTile label="延迟" value={formatLatency(firstNumber(item as Record<string, unknown>, ['latency_ms', 'duration_ms']))} />
                      </View>
                    </View>
                    {item.id ? (
                      <Pressable
                        style={{ alignSelf: 'flex-start', backgroundColor: colors.successBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 }}
                        onPress={() => resolveErrorMutation.mutate(item.id as number | string)}
                      >
                        <Text style={{ color: colors.success, fontSize: 11, fontWeight: '800' }}>处理</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })}
            {!requestErrorsQuery.isLoading && requestErrors.length === 0 ? <Text style={{ color: colors.subtext }}>暂无请求错误。</Text> : null}
          </View>
        </View>

        <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 14 }}>
          <SectionTitle title="系统日志" icon={TerminalSquare} />
          <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 8 }}>
            日志健康：{firstText(logsHealthQuery.data, ['status', 'state', 'health'])} · 版本 {firstText(versionQuery.data, ['version', 'tag', 'build'])}
          </Text>
          <View style={{ gap: 10, marginTop: 12 }}>
            {systemLogsQuery.isLoading ? <Text style={{ color: colors.subtext }}>正在加载系统日志...</Text> : null}
            {systemLogs.map((item, index) => (
              <View key={`${item.id ?? index}`} style={{ backgroundColor: colors.mutedCard, borderRadius: 14, padding: 12 }}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '800' }}>{item.level || item.status || 'log'}</Text>
                <Text style={{ color: colors.subtext, fontSize: 12, lineHeight: 18, marginTop: 5 }}>{item.message || item.error_message || '--'}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  <InfoTile label="日志 ID" value={`${item.id ?? '--'}`} />
                  <InfoTile label="级别" value={item.level || '--'} />
                  <InfoTile label="状态" value={item.status || '--'} />
                  <InfoTile label="时间" value={formatDisplayTime(item.created_at || item.updated_at)} />
                </View>
              </View>
            ))}
            {!systemLogsQuery.isLoading && systemLogs.length === 0 ? <Text style={{ color: colors.subtext }}>暂无系统日志。</Text> : null}
          </View>
        </View>

        <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 14 }}>
          <SectionTitle title="告警事件" icon={BellRing} />
          <View style={{ gap: 10, marginTop: 12 }}>
            {alertEventsQuery.isLoading ? <Text style={{ color: colors.subtext }}>正在加载告警...</Text> : null}
            {alertEvents.map((item, index) => (
              <View key={`${item.id ?? index}`} style={{ backgroundColor: colors.mutedCard, borderRadius: 14, padding: 12 }}>
                <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>{item.message || item.error_message || item.status || '告警事件'}</Text>
                    <Text style={{ color: colors.subtext, fontSize: 12, lineHeight: 18, marginTop: 5 }}>
                      {item.level || 'alert'} · {formatDisplayTime(item.created_at || item.updated_at)}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                      <InfoTile label="告警 ID" value={`${item.id ?? '--'}`} />
                      <InfoTile label="级别" value={item.level || '--'} tone={`${item.level || ''}`.toLowerCase().includes('error') ? 'danger' : 'default'} />
                      <InfoTile label="状态" value={item.status || '--'} />
                      <InfoTile label="更新时间" value={formatDisplayTime(item.updated_at || item.created_at)} />
                    </View>
                  </View>
                  {item.id ? (
                    <Pressable
                      style={{ alignSelf: 'flex-start', backgroundColor: colors.successBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 }}
                      onPress={() => resolveAlertMutation.mutate(item.id as number | string)}
                    >
                      <Text style={{ color: colors.success, fontSize: 11, fontWeight: '800' }}>解决</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
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
