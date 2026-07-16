import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Calendar, Clock3, DatabaseZap, DollarSign, Gauge, KeyRound, Layers, RefreshCw, Trash2, UserRound, Zap } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { ListCard } from '@/src/components/list-card';
import { ScreenShell } from '@/src/components/screen-shell';
import { formatCompactNumber, formatDisplayTime, formatTokenValue } from '@/src/lib/formatters';
import { useAppTheme } from '@/src/lib/theme';
import {
  cancelUsageCleanupTask,
  createUsageCleanupTask,
  getAdminUsageStats,
  listAdminUsage,
  listUsageCleanupTasks,
} from '@/src/services/admin';
import type { AdminUsageListParams, AdminUsageRecord, CreateUsageCleanupTaskRequest, UsageCleanupTask } from '@/src/types/admin';

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function defaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);
  return { start: dateKey(start), end: dateKey(end) };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return '操作失败，请稍后重试。';
}

function numberValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value.replace(/,/g, ''));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

function textValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '--';
}

function formatMoney(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '$0.00';
  return `$${value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`;
}

function formatMs(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
  return `${Math.round(value)}ms`;
}

function requestTypeLabel(record: AdminUsageRecord) {
  if (record.stream === true) return 'stream';
  if (record.stream === false) return 'sync';
  const raw = `${record.request_type ?? ''}`.toLowerCase();
  if (raw === '1' || raw === 'stream') return 'stream';
  if (raw === '2' || raw === 'ws' || raw === 'websocket') return 'ws';
  if (raw === '3' || raw === 'cyber') return 'cyber';
  if (raw === '0' || raw === 'sync') return 'sync';
  return raw || 'unknown';
}

function accountBilled(record: AdminUsageRecord) {
  const base = numberValue(record.account_stats_cost, record.total_cost);
  const multiplier = numberValue(record.account_rate_multiplier) || 1;
  return base * multiplier;
}

function taskCancelable(task: UsageCleanupTask) {
  return ['pending', 'running'].includes(`${task.status || ''}`.toLowerCase());
}

function StatTile({ label, value, icon: Icon, tone = 'default' }: { label: string; value: string; icon: LucideIcon; tone?: 'default' | 'success' | 'danger' }) {
  const colors = useAppTheme();
  const foreground = tone === 'success' ? colors.success : tone === 'danger' ? colors.danger : colors.primary;

  return (
    <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16, borderWidth: 1, flex: 1, minWidth: 126, padding: 12 }}>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 7 }}>
        <Icon color={foreground} size={15} />
        <Text numberOfLines={1} style={{ color: colors.subtext, flex: 1, fontSize: 11 }}>{label}</Text>
      </View>
      <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 8 }}>{value}</Text>
    </View>
  );
}

function InfoTile({ label, value, icon: Icon, tone = 'default' }: { label: string; value: string; icon: LucideIcon; tone?: 'default' | 'success' | 'danger' }) {
  const colors = useAppTheme();
  const foreground = tone === 'success' ? colors.success : tone === 'danger' ? colors.danger : colors.badgeDefaultText;

  return (
    <View style={{ backgroundColor: colors.mutedCard, borderColor: colors.border, borderRadius: 14, borderWidth: 1, flex: 1, minWidth: 118, padding: 10 }}>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 7 }}>
        <Icon color={foreground} size={13} />
        <Text numberOfLines={1} style={{ color: colors.subtext, flex: 1, fontSize: 11, fontWeight: '700' }}>{label}</Text>
      </View>
      <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: foreground === colors.badgeDefaultText ? colors.text : foreground, fontSize: 14, fontWeight: '800', marginTop: 6 }}>{value}</Text>
    </View>
  );
}

export default function UsageRecordsScreen() {
  const colors = useAppTheme();
  const queryClient = useQueryClient();
  const range = useMemo(defaultDateRange, []);
  const [page, setPage] = useState(1);
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const pageSize = 20;

  const filters = useMemo<AdminUsageListParams>(() => ({
    page,
    page_size: pageSize,
    start_date: range.start,
    end_date: range.end,
    sort_by: 'created_at',
    sort_order: 'desc',
    timezone,
  }), [page, range.end, range.start, timezone]);

  const usageQuery = useQuery({
    queryKey: ['admin-usage-records', filters],
    queryFn: () => listAdminUsage(filters),
    staleTime: 30_000,
    placeholderData: (previousData) => previousData,
  });
  const statsQuery = useQuery({
    queryKey: ['admin-usage-records-stats', { ...filters, page: undefined, page_size: undefined }],
    queryFn: () => getAdminUsageStats({ ...filters, page: undefined, page_size: undefined, nocache: 1 }),
    staleTime: 30_000,
    placeholderData: (previousData) => previousData,
  });
  const cleanupQuery = useQuery({
    queryKey: ['admin-usage-cleanup-tasks'],
    queryFn: () => listUsageCleanupTasks({ page: 1, page_size: 5, timezone }),
    staleTime: 20_000,
  });

  const createCleanupMutation = useMutation({
    mutationFn: (body: CreateUsageCleanupTaskRequest) => createUsageCleanupTask(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-usage-cleanup-tasks'] }),
  });
  const cancelCleanupMutation = useMutation({
    mutationFn: (taskId: number | string) => cancelUsageCleanupTask(taskId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-usage-cleanup-tasks'] }),
  });

  const records = usageQuery.data?.items ?? [];
  const total = usageQuery.data?.total ?? records.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const stats = statsQuery.data;
  const totalRequests = numberValue(stats?.total_requests, stats?.request_count);
  const inputTokens = numberValue(stats?.input_tokens, stats?.total_input_tokens);
  const outputTokens = numberValue(stats?.output_tokens, stats?.total_output_tokens);
  const totalTokens = numberValue(stats?.total_tokens, inputTokens + outputTokens + numberValue(stats?.cache_creation_tokens) + numberValue(stats?.cache_read_tokens));
  const userCost = numberValue(stats?.total_cost);
  const actualCost = numberValue(stats?.actual_cost, stats?.total_actual_cost);

  function refreshAll() {
    void usageQuery.refetch();
    void statsQuery.refetch();
    void cleanupQuery.refetch();
  }

  function confirmCreateCleanupTask() {
    const body: CreateUsageCleanupTaskRequest = {
      start_date: range.start,
      end_date: range.end,
      timezone,
    };

    Alert.alert('创建清理任务', `将清理当前时间范围（${range.start} 至 ${range.end}）内的使用记录。该操作会异步删除历史记录，请确认。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '创建',
        style: 'destructive',
        onPress: () => createCleanupMutation.mutate(body),
      },
    ]);
  }

  return (
    <ScreenShell
      title="使用记录"
      subtitle="管理端全站使用记录、统计与清理任务。"
      icon={DatabaseZap}
      titleAside={<Text style={{ color: colors.subtext, fontSize: 11 }}>管理员视图</Text>}
      variant="minimal"
      refreshing={usageQuery.isRefetching || statsQuery.isRefetching || cleanupQuery.isRefetching}
      onRefresh={refreshAll}
      safeAreaEdges={['bottom']}
      bottomInsetClassName="pb-28"
      contentGapClassName="mt-2 gap-3"
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <StatTile label="请求数" value={formatCompactNumber(totalRequests)} icon={Gauge} />
        <StatTile label="Token" value={formatTokenValue(totalTokens)} icon={Zap} />
        <StatTile label="用户计费" value={formatMoney(userCost)} icon={DollarSign} tone="success" />
        <StatTile label="实际成本" value={formatMoney(actualCost)} icon={DollarSign} />
      </View>

      <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, gap: 10, padding: 12 }}>
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}>
          <Trash2 color={colors.danger} size={16} />
          <Text style={{ color: colors.text, flex: 1, fontSize: 15, fontWeight: '800' }}>清理任务</Text>
          <Pressable
            disabled={createCleanupMutation.isPending}
            onPress={confirmCreateCleanupTask}
            style={{ backgroundColor: colors.errorBg, borderRadius: 999, opacity: createCleanupMutation.isPending ? 0.55 : 1, paddingHorizontal: 10, paddingVertical: 7 }}
          >
            <Text style={{ color: colors.errorText, fontSize: 12, fontWeight: '800' }}>{createCleanupMutation.isPending ? '创建中' : '创建清理'}</Text>
          </Pressable>
        </View>
        {createCleanupMutation.error ? <Text style={{ color: colors.errorText, fontSize: 12 }}>{getErrorMessage(createCleanupMutation.error)}</Text> : null}
        {(cleanupQuery.data?.items ?? []).length === 0 ? (
          <Text style={{ color: colors.subtext, fontSize: 12 }}>暂无清理任务。</Text>
        ) : (
          <View style={{ gap: 8 }}>
            {(cleanupQuery.data?.items ?? []).map((task) => (
              <View key={`${task.id}`} style={{ backgroundColor: colors.mutedCard, borderColor: colors.border, borderRadius: 14, borderWidth: 1, padding: 10 }}>
                <View style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}>
                  <Text style={{ color: colors.text, flex: 1, fontSize: 13, fontWeight: '800' }}>任务 #{task.id}</Text>
                  <Text style={{ color: task.status === 'failed' ? colors.errorText : colors.badgeDefaultText, fontSize: 12, fontWeight: '800' }}>{task.status || '--'}</Text>
                </View>
                <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 6 }}>删除 {formatCompactNumber(numberValue(task.deleted_rows))} 行 · {formatDisplayTime(task.created_at)}</Text>
                {task.error_message ? <Text style={{ color: colors.errorText, fontSize: 12, marginTop: 6 }}>{task.error_message}</Text> : null}
                {taskCancelable(task) ? (
                  <Pressable
                    disabled={cancelCleanupMutation.isPending}
                    onPress={() => cancelCleanupMutation.mutate(task.id)}
                    style={{ alignSelf: 'flex-start', backgroundColor: colors.muted, borderRadius: 999, marginTop: 8, paddingHorizontal: 10, paddingVertical: 7 }}
                  >
                    <Text style={{ color: colors.badgeDefaultText, fontSize: 12, fontWeight: '800' }}>取消任务</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </View>

      {usageQuery.error ? (
        <View style={{ backgroundColor: colors.errorBg, borderRadius: 14, padding: 14 }}>
          <Text style={{ color: colors.errorText, fontWeight: '800' }}>使用记录加载失败</Text>
          <Text style={{ color: colors.errorText, fontSize: 13, lineHeight: 20, marginTop: 6 }}>{getErrorMessage(usageQuery.error)}</Text>
        </View>
      ) : null}

      {usageQuery.isLoading ? <ListCard title="正在加载使用记录" meta="请稍候..." icon={DatabaseZap} /> : null}
      {!usageQuery.isLoading && !usageQuery.error && records.length === 0 ? (
        <ListCard title="暂无使用记录" meta="当前时间范围内没有记录。" icon={DatabaseZap} />
      ) : null}

      <View style={{ gap: 10 }}>
        {records.map((record) => {
          const userLabel = textValue(record.user?.email, record.user?.username, record.user_id);
          const apiKeyLabel = textValue(record.api_key?.name, record.api_key_id);
          const accountLabel = textValue(record.account?.name, record.account_id);
          const groupLabel = textValue(record.group?.name, record.group?.group_name, record.group_id);
          const modelLabel = textValue(record.model, record.requested_model, record.upstream_model);
          const totalRecordTokens = numberValue(record.input_tokens) + numberValue(record.output_tokens) + numberValue(record.cache_read_tokens) + numberValue(record.cache_creation_tokens) + numberValue(record.image_output_tokens);

          return (
            <ListCard
              key={`${record.id}`}
              title={`${modelLabel}`}
              meta={`#${record.id} · ${formatDisplayTime(record.created_at)}`}
              badge={requestTypeLabel(record)}
              badgeTone={record.stream ? 'success' : 'default'}
              icon={DatabaseZap}
            >
              <View style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <InfoTile label="用户" value={userLabel} icon={UserRound} />
                  <InfoTile label="API Key" value={apiKeyLabel} icon={KeyRound} />
                  <InfoTile label="账号" value={accountLabel} icon={DatabaseZap} />
                  <InfoTile label="分组" value={groupLabel} icon={Layers} />
                  <InfoTile label="Token" value={formatTokenValue(totalRecordTokens)} icon={Zap} />
                  <InfoTile label="用户计费" value={formatMoney(numberValue(record.total_cost))} icon={DollarSign} tone="success" />
                  <InfoTile label="实际成本" value={formatMoney(numberValue(record.actual_cost))} icon={DollarSign} />
                  <InfoTile label="账号计费" value={formatMoney(accountBilled(record))} icon={DollarSign} />
                  <InfoTile label="首 Token" value={formatMs(record.first_token_ms)} icon={Clock3} />
                  <InfoTile label="耗时" value={formatMs(record.duration_ms)} icon={Clock3} />
                </View>
                <View style={{ backgroundColor: colors.mutedCard, borderRadius: 12, padding: 10 }}>
                  <Text style={{ color: colors.subtext, fontSize: 11 }}>Request ID</Text>
                  <Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, fontWeight: '700', marginTop: 4 }}>{record.request_id || '--'}</Text>
                  <Text style={{ color: colors.subtext, fontSize: 11, marginTop: 8 }}>Endpoint</Text>
                  <Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, fontWeight: '700', marginTop: 4 }}>{textValue(record.inbound_endpoint, record.upstream_endpoint)}</Text>
                </View>
              </View>
            </ListCard>
          );
        })}
      </View>

      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'center' }}>
        <Pressable
          disabled={page <= 1}
          onPress={() => setPage((current) => Math.max(1, current - 1))}
          style={{ backgroundColor: colors.mutedCard, borderRadius: 999, opacity: page <= 1 ? 0.5 : 1, paddingHorizontal: 16, paddingVertical: 10 }}
        >
          <Text style={{ color: colors.badgeDefaultText, fontWeight: '800' }}>上一页</Text>
        </Pressable>
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 6 }}>
          <Calendar color={colors.subtext} size={14} />
          <Text style={{ color: colors.subtext, fontSize: 12 }}>第 {page} / {totalPages} 页，共 {formatCompactNumber(total)} 条</Text>
        </View>
        <Pressable
          disabled={page >= totalPages}
          onPress={() => setPage((current) => Math.min(totalPages, current + 1))}
          style={{ backgroundColor: colors.mutedCard, borderRadius: 999, opacity: page >= totalPages ? 0.5 : 1, paddingHorizontal: 16, paddingVertical: 10 }}
        >
          <Text style={{ color: colors.badgeDefaultText, fontWeight: '800' }}>下一页</Text>
        </Pressable>
      </View>

      {statsQuery.error ? (
        <View style={{ alignItems: 'center', backgroundColor: colors.errorBg, borderRadius: 14, flexDirection: 'row', gap: 8, padding: 12 }}>
          <AlertTriangle color={colors.errorText} size={15} />
          <Text style={{ color: colors.errorText, flex: 1, fontSize: 12 }}>{getErrorMessage(statsQuery.error)}</Text>
          <Pressable onPress={() => void statsQuery.refetch()} style={{ backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 }}>
            <RefreshCw color={colors.errorText} size={13} />
          </Pressable>
        </View>
      ) : null}
    </ScreenShell>
  );
}
