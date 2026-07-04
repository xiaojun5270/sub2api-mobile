import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BarChartCard } from '@/src/components/bar-chart-card';
import { formatTokenValue } from '@/src/lib/formatters';
import { DonutChartCard } from '@/src/components/donut-chart-card';
import { LineTrendChart } from '@/src/components/line-trend-chart';
import { useAppTheme } from '@/src/lib/theme';
import { getAdminSettings, getDashboardModels, getDashboardStats, getDashboardTrend, listAccounts } from '@/src/services/admin';
import { adminConfigState, hasAuthenticatedAdminSession } from '@/src/store/admin-config';

const { useSnapshot } = require('valtio/react');

type RangeKey = '24h' | '7d' | '30d';

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
  { key: '24h', label: '24H' },
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
];

const RANGE_TITLE_MAP: Record<RangeKey, string> = {
  '24h': '24H',
  '7d': '7D',
  '30d': '30D',
};

function hasAccountError(account: { status?: string; error_message?: string | null }) {
  return Boolean(account.status === 'error' || account.error_message);
}

function hasAccountRateLimited(account: {
  rate_limit_reset_at?: string | null;
  extra?: Record<string, unknown>;
}) {
  if (account.rate_limit_reset_at) {
    const resetTime = new Date(account.rate_limit_reset_at).getTime();
    if (!Number.isNaN(resetTime) && resetTime > Date.now()) {
      return true;
    }
  }

  const modelLimits = account.extra?.model_rate_limits;
  if (!modelLimits || typeof modelLimits !== 'object' || Array.isArray(modelLimits)) {
    return false;
  }

  const now = Date.now();
  return Object.values(modelLimits as Record<string, unknown>).some((info) => {
    if (!info || typeof info !== 'object' || Array.isArray(info)) return false;

    const resetAt = (info as { rate_limit_reset_at?: unknown }).rate_limit_reset_at;
    if (typeof resetAt !== 'string' || !resetAt.trim()) return false;

    const resetTime = new Date(resetAt).getTime();
    return !Number.isNaN(resetTime) && resetTime > now;
  });
}

function getDateRange(rangeKey: RangeKey) {
  const end = new Date();
  const start = new Date();

  if (rangeKey === '24h') {
    start.setHours(end.getHours() - 23, 0, 0, 0);
  } else if (rangeKey === '30d') {
    start.setDate(end.getDate() - 29);
  } else {
    start.setDate(end.getDate() - 6);
  }

  const toDate = (value: Date) => value.toISOString().slice(0, 10);

  return {
    start_date: toDate(start),
    end_date: toDate(end),
    granularity: rangeKey === '24h' ? ('hour' as const) : ('day' as const),
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
  if (rangeKey === '24h') {
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

function Section({ title, subtitle, children, right }: { title: string; subtitle?: string; children: React.ReactNode; right?: React.ReactNode }) {
  const colors = useAppTheme();

  return (
    <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{title}</Text>
          {subtitle ? <Text style={{ marginTop: 6, fontSize: 12, color: colors.subtext }}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      <View style={{ marginTop: 14 }}>{children}</View>
    </View>
  );
}

function StatCard({ title, value, detail }: { title: string; value: string; detail?: string }) {
  const colors = useAppTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16, borderWidth: 1, padding: 14 }}>
      <Text style={{ fontSize: 12, color: colors.subtext }}>{title}</Text>
      <Text style={{ marginTop: 8, fontSize: 24, fontWeight: '700', color: colors.text }}>{value}</Text>
      {detail ? <Text style={{ marginTop: 6, fontSize: 12, color: colors.subtext }}>{detail}</Text> : null}
    </View>
  );
}

export default function MonitorScreen() {
  const colors = useAppTheme();
  const config = useSnapshot(adminConfigState);
  const hasAccount = hasAuthenticatedAdminSession(config);
  const [rangeKey, setRangeKey] = useState<RangeKey>('7d');
  const range = useMemo(() => getDateRange(rangeKey), [rangeKey]);

  const statsQuery = useQuery({
    queryKey: ['monitor-stats'],
    queryFn: getDashboardStats,
    enabled: hasAccount,
    staleTime: 60_000,
  });
  const settingsQuery = useQuery({
    queryKey: ['admin-settings'],
    queryFn: getAdminSettings,
    enabled: hasAccount,
    staleTime: 120_000,
  });
  const accountsQuery = useQuery({
    queryKey: ['monitor-accounts'],
    queryFn: () => listAccounts(''),
    enabled: hasAccount,
    staleTime: 60_000,
  });
  const trendQuery = useQuery({
    queryKey: ['monitor-trend', rangeKey, range.start_date, range.end_date, range.granularity],
    queryFn: () => getDashboardTrend(range),
    enabled: hasAccount,
    staleTime: 60_000,
    placeholderData: (previousData) => previousData,
  });
  const modelsQuery = useQuery({
    queryKey: ['monitor-models', rangeKey, range.start_date, range.end_date],
    queryFn: () => getDashboardModels(range),
    enabled: hasAccount,
    staleTime: 60_000,
    placeholderData: (previousData) => previousData,
  });

  function refetchAll() {
    statsQuery.refetch();
    settingsQuery.refetch();
    accountsQuery.refetch();
    trendQuery.refetch();
    modelsQuery.refetch();
  }

  const stats = statsQuery.data;
  const siteName = settingsQuery.data?.site_name?.trim() || '管理控制台';
  const accounts = accountsQuery.data?.items ?? [];
  const trend = trendQuery.data?.trend ?? [];
  const topModels = (modelsQuery.data?.models ?? []).slice(0, 5);
  const errorMessage = getErrorMessage(statsQuery.error ?? settingsQuery.error ?? accountsQuery.error ?? trendQuery.error ?? modelsQuery.error);
  const currentPageErrorAccounts = accounts.filter(hasAccountError).length;
  const currentPageLimitedAccounts = accounts.filter((item) => hasAccountRateLimited(item)).length;
  const currentPageBusyAccounts = accounts.filter((item) => {
    if (hasAccountError(item) || hasAccountRateLimited(item)) return false;
    return (item.current_concurrency ?? 0) > 0;
  }).length;
  const totalAccounts = stats?.total_accounts ?? accountsQuery.data?.total ?? accounts.length;
  const aggregatedErrorAccounts = stats?.error_accounts ?? 0;
  const errorAccounts = Math.max(aggregatedErrorAccounts, currentPageErrorAccounts);
  const healthyAccounts = stats?.normal_accounts ?? Math.max(totalAccounts - errorAccounts, 0);
  const latestTrendPoints = trend.slice(-6).reverse();
  const selectedTokenTotal = trend.reduce((sum, item) => sum + item.total_tokens, 0);
  const selectedCostTotal = trend.reduce((sum, item) => sum + item.cost, 0);
  const selectedOutputTotal = trend.reduce((sum, item) => sum + item.output_tokens, 0);
  const rangeTitle = RANGE_TITLE_MAP[rangeKey];
  const isLoading = statsQuery.isLoading || settingsQuery.isLoading || accountsQuery.isLoading;
  const hasError = Boolean(statsQuery.error || settingsQuery.error || accountsQuery.error || trendQuery.error || modelsQuery.error);

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
  const isRefreshing = statsQuery.isRefetching || settingsQuery.isRefetching || accountsQuery.isRefetching || trendQuery.isRefetching || modelsQuery.isRefetching;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.page }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void refetchAll()} tintColor={colors.primary} />}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>概览</Text>
            <Text style={{ marginTop: 6, fontSize: 13, color: colors.subtext }}>{siteName} 的当前运行状态。</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {RANGE_OPTIONS.map((option) => {
                const active = option.key === rangeKey;
                return (
                  <Pressable
                    key={option.key}
                    style={{ backgroundColor: active ? colors.primary : colors.mutedCard, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}
                    onPress={() => setRangeKey(option.key)}
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
          <Section title="未连接服务器" subtitle="需要先配置连接">
            <Text style={{ fontSize: 14, lineHeight: 22, color: colors.subtext }}>请先前往“服务器”页填写服务地址和 Admin Token，再返回查看概览数据。</Text>
            <Pressable style={{ marginTop: 14, alignSelf: 'flex-start', backgroundColor: colors.primary, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 }} onPress={() => router.push('/settings')}>
              <Text style={{ color: colors.primaryText, fontSize: 13, fontWeight: '700' }}>去配置服务器</Text>
            </Pressable>
          </Section>
        ) : isLoading ? (
          <Section title="正在加载概览" subtitle="请稍候">
            <Text style={{ fontSize: 14, lineHeight: 22, color: colors.subtext }}>已连接服务器，正在拉取概览、模型和账号状态数据。</Text>
          </Section>
        ) : hasError ? (
          <Section title="加载失败" subtitle="请检查连接配置">
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
                value={formatTokenDisplay(rangeKey === '24h' ? selectedTokenTotal || stats?.today_tokens : selectedTokenTotal)}
                detail={`输出 ${formatTokenDisplay(rangeKey === '24h' ? selectedOutputTotal || stats?.today_output_tokens : selectedOutputTotal)}`}
              />
              <StatCard
                title={`${rangeTitle} 成本`}
                value={formatMoney(rangeKey === '24h' ? selectedCostTotal || stats?.today_cost : selectedCostTotal)}
                detail={`TPM ${formatNumber(stats?.tpm)}`}
              />
            </View>
            <Section
              title="账号概览"
              subtitle="总数、健康、异常和限流状态一览"
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
                    <Text style={{ fontSize: 11, color: colors.subtext }}>健康</Text>
                    <Text style={{ marginTop: 6, fontSize: 18, fontWeight: '700', color: colors.text }}>{formatNumber(healthyAccounts)}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: colors.dangerBg, borderRadius: 14, padding: 12 }}>
                    <Text style={{ fontSize: 11, color: colors.danger }}>异常</Text>
                    <Text style={{ marginTop: 6, fontSize: 18, fontWeight: '700', color: colors.danger }}>{formatNumber(errorAccounts)}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: colors.mutedCard, borderRadius: 14, padding: 12 }}>
                    <Text style={{ fontSize: 11, color: colors.subtext }}>限流</Text>
                    <Text style={{ marginTop: 6, fontSize: 18, fontWeight: '700', color: colors.text }}>{formatNumber(currentPageLimitedAccounts)}</Text>
                  </View>
                </View>
                <Text style={{ marginTop: 10, fontSize: 12, color: colors.subtext }}>总数 / 健康 / 异常优先使用后端聚合字段；限流与繁忙基于当前页账号列表。点击进入账号清单。</Text>
              </Pressable>
            </Section>

            {throughputPoints.length > 1 ? (
              <LineTrendChart title="Token 吞吐" subtitle="当前时间范围内的 Token 变化趋势" points={throughputPoints} color="#f97316" formatValue={formatTokenDisplay} />
            ) : null}

            {requestPoints.length > 1 ? (
              <LineTrendChart title="请求趋势" subtitle="当前时间范围内的请求变化趋势" points={requestPoints} color="#0f766e" formatValue={formatCompactNumber} />
            ) : null}

            {costPoints.length > 1 ? (
              <LineTrendChart title="成本趋势" subtitle="当前时间范围内的成本变化趋势" points={costPoints} color="#7c3aed" formatValue={formatMoney} />
            ) : null}

            <BarChartCard
              title="Token 结构"
              subtitle="输入、输出、缓存读取占比"
              items={[
                { label: '输入 Token', value: totalInputTokens, color: '#0f766e', hint: '请求进入模型前消耗的 token。' },
                { label: '输出 Token', value: totalOutputTokens, color: '#f59e0b', hint: '模型返回内容消耗的 token。' },
                { label: '缓存读取 Token', value: totalCacheReadTokens, color: '#64748b', hint: '命中缓存后复用的 token。' },
              ]}
              formatValue={formatTokenDisplay}
            />

            <DonutChartCard
              title="账号健康"
              subtitle="健康、繁忙、限流、异常分布"
              centerLabel="总账号"
              centerValue={formatNumber(totalAccounts)}
              segments={[
                { label: '健康', value: healthyAccounts, color: '#0f766e' },
                { label: '繁忙', value: currentPageBusyAccounts, color: '#f59e0b' },
                { label: '限流', value: currentPageLimitedAccounts, color: '#64748b' },
                { label: '异常', value: errorAccounts, color: '#f97316' },
              ]}
            />

            <BarChartCard
              title="热点模型"
              subtitle="当前时间范围内最活跃的模型"
              items={topModels.map((model) => ({
                label: model.model,
                value: model.total_tokens,
                color: '#f97316',
                meta: `请求 ${formatNumber(model.requests)} · 成本 ${formatMoney(model.cost)}`,
              }))}
              formatValue={formatCompactNumber}
            />

            <Section title="趋势摘要" subtitle="最近几个统计点的请求、Token 和成本变化">
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
