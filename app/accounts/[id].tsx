import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  DatabaseZap,
  KeyRound,
  PauseCircle,
  Shield,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BarChartCard } from '@/src/components/bar-chart-card';
import { IconBadge } from '@/src/components/icon-badge';
import { LineTrendChart } from '@/src/components/line-trend-chart';
import { formatCompactNumber, formatDisplayTime, formatTokenValue } from '@/src/lib/formatters';
import { useAppTheme } from '@/src/lib/theme';
import {
  applyAccountOAuthCredentials,
  clearAccountError,
  clearAccountRateLimit,
  clearAccountTempUnschedulable,
  createShadowAccount,
  getAccount,
  getAccountModels,
  getAccountStats,
  getAccountTodayStats,
  getAccountUsage,
  getDashboardSnapshot,
  recoverAccountState,
  refreshAccount,
  revertAccountProxyFallback,
  resetAccountQuota,
  setAccountSchedulable,
  setAccountPrivacy,
  syncAccountModels,
  testAccount,
  updateAccount,
} from '@/src/services/admin';
import type { AdminAccount } from '@/src/types/admin';

type RangeKey = '24h' | '7d' | '30d';
type AccountAction =
  | 'test'
  | 'refresh'
  | 'clear-error'
  | 'clear-rate-limit'
  | 'clear-temp-unschedulable'
  | 'recover'
  | 'reset-quota'
  | 'sync-models'
  | 'toggle-schedulable'
  | 'toggle-privacy'
  | 'revert-proxy-fallback'
  | 'create-shadow';

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
  { key: '24h', label: '24H' },
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
];

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

  const toDate = (value: Date) =>
    `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

  return {
    start_date: toDate(start),
    end_date: toDate(end),
    granularity: rangeKey === '24h' ? ('hour' as const) : ('day' as const),
  };
}

function getStatsDays(rangeKey: RangeKey) {
  if (rangeKey === '30d') return 30;
  if (rangeKey === '7d') return 7;
  return 1;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return '操作失败，请稍后重试。';
}

function getAccountErrorDetail(account: AdminAccount) {
  const message = account.error_message?.trim() || account.error?.trim();
  if (message) return message;
  if (account.error_code !== undefined && account.error_code !== null) return `错误代码 ${account.error_code}`;
  return '后端未返回具体异常信息';
}

function formatMoney(value?: number | null) {
  return `$${Number(value ?? 0).toFixed(4)}`;
}

function formatDuration(value?: number | null) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number <= 0) return '--';
  return `${number.toFixed(0)}ms`;
}

function toNumber(raw: string) {
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

function modelName(value: string | { id?: string; display_name?: string; model?: string; name?: string; enabled?: boolean }) {
  if (typeof value === 'string') return value;
  return value.display_name || value.id || value.model || value.name || '--';
}

function recordNumber(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}

function recordText(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '--';
}

function Section({ title, icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  const colors = useAppTheme();

  return (
    <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 16 }}>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 10 }}>
        <IconBadge icon={icon} containerSize={34} size={16} />
        <Text style={{ color: colors.text, flex: 1, fontSize: 18, fontWeight: '800' }}>{title}</Text>
      </View>
      <View style={{ marginTop: 14 }}>{children}</View>
    </View>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  const colors = useAppTheme();

  return (
    <View style={{ backgroundColor: colors.mutedCard, borderRadius: 14, flex: 1, minWidth: 92, padding: 12 }}>
      <Text style={{ color: colors.subtext, fontSize: 11 }}>{label}</Text>
      <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 6 }}>{value}</Text>
    </View>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
  multiline?: boolean;
}) {
  const colors = useAppTheme();

  return (
    <View style={{ flex: 1, minWidth: 140 }}>
      <Text style={{ color: colors.subtext, fontSize: 12, marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        keyboardType={keyboardType}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={{
          backgroundColor: colors.muted,
          borderColor: colors.border,
          borderRadius: 12,
          borderWidth: 1,
          color: colors.text,
          minHeight: multiline ? 78 : undefined,
          paddingHorizontal: 12,
          paddingVertical: 11,
        }}
      />
    </View>
  );
}

function ActionButton({
  label,
  icon: Icon,
  danger,
  onPress,
  disabled,
}: {
  label: string;
  icon: LucideIcon;
  danger?: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const colors = useAppTheme();
  const backgroundColor = danger ? colors.dangerBg : colors.mutedCard;
  const textColor = danger ? colors.danger : colors.badgeDefaultText;

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={{
        alignItems: 'center',
        backgroundColor,
        borderRadius: 14,
        flexDirection: 'row',
        gap: 8,
        opacity: disabled ? 0.6 : 1,
        paddingHorizontal: 12,
        paddingVertical: 11,
      }}
    >
      <Icon color={textColor} size={15} />
      <Text style={{ color: textColor, fontSize: 12, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
}

export default function AccountDetailScreen() {
  const colors = useAppTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const accountId = Number(id);
  const queryClient = useQueryClient();
  const [rangeKey, setRangeKey] = useState<RangeKey>('7d');
  const range = useMemo(() => getDateRange(rangeKey), [rangeKey]);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const accountQuery = useQuery({
    queryKey: ['account', accountId],
    queryFn: () => getAccount(accountId),
    enabled: Number.isFinite(accountId),
  });
  const todayQuery = useQuery({
    queryKey: ['account-today-stats', accountId],
    queryFn: () => getAccountTodayStats(accountId),
    enabled: Number.isFinite(accountId),
  });
  const statsQuery = useQuery({
    queryKey: ['account-stats', accountId, rangeKey, getStatsDays(rangeKey)],
    queryFn: () => getAccountStats(accountId, { days: getStatsDays(rangeKey) }),
    enabled: Number.isFinite(accountId),
  });
  const snapshotQuery = useQuery({
    queryKey: ['account-snapshot', accountId, rangeKey, range.start_date, range.end_date, range.granularity],
    queryFn: () =>
      getDashboardSnapshot({
        ...range,
        account_id: accountId,
        include_stats: false,
        include_trend: true,
        include_model_stats: false,
        include_group_stats: false,
        include_users_trend: false,
      }),
    enabled: Number.isFinite(accountId),
  });
  const modelsQuery = useQuery({
    queryKey: ['account-models', accountId],
    queryFn: () => getAccountModels(accountId),
    enabled: Number.isFinite(accountId),
  });
  const usageQuery = useQuery({
    queryKey: ['account-usage', accountId],
    queryFn: () => getAccountUsage(accountId),
    enabled: Number.isFinite(accountId),
  });

  const account = accountQuery.data;
  const [name, setName] = useState('');
  const [concurrency, setConcurrency] = useState('');
  const [loadFactor, setLoadFactor] = useState('');
  const [priority, setPriority] = useState('');
  const [rateMultiplier, setRateMultiplier] = useState('');
  const [proxyId, setProxyId] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [privacyMode, setPrivacyMode] = useState('');
  const [groupIds, setGroupIds] = useState('');
  const [notes, setNotes] = useState('');
  const [oauthAccessToken, setOauthAccessToken] = useState('');
  const [oauthRefreshToken, setOauthRefreshToken] = useState('');
  const [oauthExpiresAt, setOauthExpiresAt] = useState('');
  const [oauthClientId, setOauthClientId] = useState('');
  const [oauthAccountId, setOauthAccountId] = useState('');
  const [oauthEmail, setOauthEmail] = useState('');
  const [oauthMessage, setOauthMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return;
    setName(account.name || '');
    setConcurrency(account.concurrency ? String(account.concurrency) : '');
    setLoadFactor(account.load_factor !== undefined && account.load_factor !== null ? String(account.load_factor) : '');
    setPriority(account.priority ? String(account.priority) : '');
    setRateMultiplier(account.rate_multiplier ? String(account.rate_multiplier) : '');
    setProxyId(account.proxy_id !== undefined && account.proxy_id !== null ? String(account.proxy_id) : '');
    setExpiresAt(account.expires_at || '');
    setPrivacyMode(account.privacy_mode || '');
    setGroupIds(account.group_ids?.join(',') || account.groups?.map((group) => group.id).join(',') || '');
    setNotes(account.notes || '');
  }, [account]);

  const updateMutation = useMutation({
    mutationFn: () =>
      updateAccount(accountId, {
        name: name.trim() || undefined,
        concurrency: toNumber(concurrency),
        load_factor: toNumber(loadFactor) ?? null,
        priority: toNumber(priority),
        rate_multiplier: toNumber(rateMultiplier),
        proxy_id: toNullableNumber(proxyId),
        expires_at: expiresAt.trim() || null,
        privacy_mode: privacyMode.trim() || undefined,
        group_ids: toGroupIds(groupIds),
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ['account', accountId] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const actionMutation = useMutation({
    mutationFn: async (action: AccountAction) => {
      if (action === 'test') return testAccount(accountId);
      if (action === 'refresh') return refreshAccount(accountId);
      if (action === 'clear-error') return clearAccountError(accountId);
      if (action === 'clear-rate-limit') return clearAccountRateLimit(accountId);
      if (action === 'clear-temp-unschedulable') return clearAccountTempUnschedulable(accountId);
      if (action === 'recover') return recoverAccountState(accountId);
      if (action === 'reset-quota') return resetAccountQuota(accountId);
      if (action === 'sync-models') return syncAccountModels(accountId);
      if (action === 'toggle-privacy') return setAccountPrivacy(accountId);
      if (action === 'revert-proxy-fallback') return revertAccountProxyFallback(accountId);
      if (action === 'create-shadow') return createShadowAccount(accountId);
      return setAccountSchedulable(accountId, !(account?.schedulable ?? true));
    },
    onSuccess: (_, action) => {
      const labels: Record<AccountAction, string> = {
        test: '测试已完成',
        refresh: '刷新已提交',
        'clear-error': '错误已清除',
        'clear-rate-limit': '限流已清除',
        'clear-temp-unschedulable': '临时不可调度已清除',
        recover: '状态已恢复',
        'reset-quota': '额度已重置',
        'sync-models': '模型同步已提交',
        'toggle-schedulable': '调度状态已更新',
        'toggle-privacy': '隐私模式已切换',
        'revert-proxy-fallback': '代理 fallback 已恢复',
        'create-shadow': 'Shadow 账号已创建',
      };
      setActionMessage(labels[action]);
      queryClient.invalidateQueries({ queryKey: ['account', accountId] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['account-models', accountId] });
      queryClient.invalidateQueries({ queryKey: ['account-today-stats', accountId] });
    },
    onError: (error) => setActionMessage(getErrorMessage(error)),
  });

  const oauthMutation = useMutation({
    mutationFn: () => {
      if (!oauthAccessToken.trim()) {
        throw new Error('access_token 不能为空');
      }

      return applyAccountOAuthCredentials(accountId, {
        access_token: oauthAccessToken.trim(),
        refresh_token: oauthRefreshToken.trim() || undefined,
        expires_at: oauthExpiresAt.trim() || undefined,
        client_id: oauthClientId.trim() || undefined,
        account_id: oauthAccountId.trim() || undefined,
        email: oauthEmail.trim() || undefined,
      });
    },
    onSuccess: () => {
      setOauthMessage('OAuth 凭证已应用');
      setOauthAccessToken('');
      setOauthRefreshToken('');
      queryClient.invalidateQueries({ queryKey: ['account', accountId] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (error) => setOauthMessage(getErrorMessage(error)),
  });

  const trendPoints = (snapshotQuery.data?.trend ?? []).map((item) => ({
    label: rangeKey === '24h' ? item.date.slice(11, 13) : item.date.slice(5, 10),
    value: item.total_tokens,
  }));
  const usageItems = usageQuery.data?.items ?? usageQuery.data?.usage ?? [];
  const models = modelsQuery.data?.models ?? [];
  const modelChartItems = models.slice(0, 8).map((item) => ({
    label: modelName(item),
    value: typeof item === 'object' && item.enabled === false ? 0 : 1,
    color: typeof item === 'object' && item.enabled === false ? colors.disabled : colors.success,
    meta: typeof item === 'object' && item.enabled === false ? 'disabled' : 'enabled',
  }));

  function confirmAction(action: AccountAction, title: string, message: string) {
    Alert.alert(title, message, [
      { text: '取消', style: 'cancel' },
      {
        text: '确认',
        style: action === 'reset-quota' ? 'destructive' : 'default',
        onPress: () => {
          setActionMessage(null);
          actionMutation.mutate(action);
        },
      },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ title: account?.name || '账号详情' }} />
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: colors.page, flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 12, padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {accountQuery.isLoading ? (
            <Section title="账号详情" icon={KeyRound}>
              <Text style={{ color: colors.subtext }}>正在加载账号...</Text>
            </Section>
          ) : null}

          {accountQuery.error ? (
            <View style={{ backgroundColor: colors.errorBg, borderRadius: 14, padding: 14 }}>
              <Text style={{ color: colors.errorText, fontWeight: '800' }}>账号加载失败</Text>
              <Text style={{ color: colors.errorText, fontSize: 13, lineHeight: 20, marginTop: 6 }}>{getErrorMessage(accountQuery.error)}</Text>
            </View>
          ) : null}

          {account ? (
            <>
              {(account.status === 'error' || account.error_message || account.error) ? (
                <View style={{ alignItems: 'flex-start', backgroundColor: colors.errorBg, borderColor: colors.danger, borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 13 }}>
                  <AlertTriangle color={colors.errorText} size={19} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.errorText, fontSize: 14, fontWeight: '800' }}>异常原因</Text>
                    <Text selectable style={{ color: colors.errorText, fontSize: 13, lineHeight: 20, marginTop: 5 }}>{getAccountErrorDetail(account)}</Text>
                  </View>
                </View>
              ) : null}

              <Section title="今日用量" icon={Activity}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <MetricTile label="请求" value={formatCompactNumber(todayQuery.data?.requests ?? 0)} />
                  <MetricTile label="Token" value={formatTokenValue(todayQuery.data?.tokens ?? 0)} />
                  <MetricTile label="成本" value={formatMoney(todayQuery.data?.cost)} />
                  <MetricTile label="标准成本" value={formatMoney(todayQuery.data?.standard_cost)} />
                  <MetricTile label="用户成本" value={formatMoney(todayQuery.data?.user_cost)} />
                </View>
              </Section>

              <Section title="快捷操作" icon={RefreshCw}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <ActionButton label="测试" icon={CheckCircle2} disabled={actionMutation.isPending} onPress={() => actionMutation.mutate('test')} />
                  <ActionButton label="刷新" icon={RefreshCw} disabled={actionMutation.isPending} onPress={() => actionMutation.mutate('refresh')} />
                  <ActionButton label={(account.schedulable ?? true) ? '暂停调度' : '恢复调度'} icon={PauseCircle} disabled={actionMutation.isPending} onPress={() => actionMutation.mutate('toggle-schedulable')} />
                  <ActionButton label="清除错误" icon={AlertTriangle} disabled={actionMutation.isPending} onPress={() => actionMutation.mutate('clear-error')} />
                  <ActionButton label="清除限流" icon={RotateCcw} disabled={actionMutation.isPending} onPress={() => actionMutation.mutate('clear-rate-limit')} />
                  <ActionButton label="清临时暂停" icon={RotateCcw} disabled={actionMutation.isPending} onPress={() => actionMutation.mutate('clear-temp-unschedulable')} />
                  <ActionButton label="恢复状态" icon={ShieldCheck} disabled={actionMutation.isPending} onPress={() => actionMutation.mutate('recover')} />
                  <ActionButton label="同步模型" icon={DatabaseZap} disabled={actionMutation.isPending} onPress={() => actionMutation.mutate('sync-models')} />
                  <ActionButton label="切换隐私" icon={Shield} disabled={actionMutation.isPending} onPress={() => actionMutation.mutate('toggle-privacy')} />
                  <ActionButton label="恢复代理" icon={RefreshCw} disabled={actionMutation.isPending} onPress={() => actionMutation.mutate('revert-proxy-fallback')} />
                  <ActionButton label="创建 Shadow" icon={DatabaseZap} disabled={actionMutation.isPending} onPress={() => confirmAction('create-shadow', '创建 Shadow 账号', '确认按后端默认配置创建 Shadow 账号吗？')} />
                  <ActionButton label="重置额度" icon={RotateCcw} danger disabled={actionMutation.isPending} onPress={() => confirmAction('reset-quota', '重置额度', '确认重置该账号额度吗？')} />
                </View>
                {actionMessage ? (
                  <View style={{ backgroundColor: actionMessage.includes('失败') ? colors.errorBg : colors.successBg, borderRadius: 12, marginTop: 12, padding: 12 }}>
                    <Text style={{ color: actionMessage.includes('失败') ? colors.errorText : colors.success, fontSize: 13 }}>{actionMessage}</Text>
                  </View>
                ) : null}
              </Section>

              <Section title="编辑账号" icon={Save}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  <FormField label="名称" value={name} onChangeText={setName} />
                  <FormField label="并发" value={concurrency} onChangeText={setConcurrency} keyboardType="number-pad" />
                  <FormField label="权重" value={loadFactor} onChangeText={setLoadFactor} keyboardType="decimal-pad" />
                  <FormField label="优先级" value={priority} onChangeText={setPriority} keyboardType="number-pad" />
                  <FormField label="倍率" value={rateMultiplier} onChangeText={setRateMultiplier} keyboardType="decimal-pad" />
                  <FormField label="代理 ID" value={proxyId} onChangeText={setProxyId} placeholder="留空不改，null 清空" />
                  <FormField label="隐私模式" value={privacyMode} onChangeText={setPrivacyMode} placeholder="例如 privacy/default" />
                  <FormField label="过期时间" value={expiresAt} onChangeText={setExpiresAt} placeholder="2026-12-31T23:59:59+08:00" />
                  <FormField label="分组 ID" value={groupIds} onChangeText={setGroupIds} placeholder="1,2,5" />
                  <FormField label="备注" value={notes} onChangeText={setNotes} multiline />
                </View>
                {formError ? (
                  <View style={{ backgroundColor: colors.errorBg, borderRadius: 12, marginTop: 12, padding: 12 }}>
                    <Text style={{ color: colors.errorText, fontSize: 13 }}>{formError}</Text>
                  </View>
                ) : null}
                <Pressable
                  disabled={updateMutation.isPending}
                  onPress={() => {
                    setFormError(null);
                    updateMutation.mutate();
                  }}
                  style={{
                    alignItems: 'center',
                    backgroundColor: updateMutation.isPending ? colors.disabled : colors.primary,
                    borderRadius: 14,
                    marginTop: 14,
                    paddingVertical: 13,
                  }}
                >
                  <Text style={{ color: colors.primaryText, fontSize: 14, fontWeight: '800' }}>{updateMutation.isPending ? '保存中...' : '保存修改'}</Text>
                </Pressable>
              </Section>

              {`${account.type || ''}`.toLowerCase() === 'oauth' ? (
                <Section title="OAuth 凭证" icon={KeyRound}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    <FormField label="access_token" value={oauthAccessToken} onChangeText={setOauthAccessToken} multiline />
                    <FormField label="refresh_token" value={oauthRefreshToken} onChangeText={setOauthRefreshToken} multiline />
                    <FormField label="expires_at" value={oauthExpiresAt} onChangeText={setOauthExpiresAt} placeholder="时间戳或 ISO 时间" />
                    <FormField label="client_id" value={oauthClientId} onChangeText={setOauthClientId} />
                    <FormField label="account_id" value={oauthAccountId} onChangeText={setOauthAccountId} />
                    <FormField label="email" value={oauthEmail} onChangeText={setOauthEmail} />
                  </View>
                  {oauthMessage ? (
                    <View style={{ backgroundColor: oauthMessage === 'OAuth 凭证已应用' ? colors.successBg : colors.errorBg, borderRadius: 12, marginTop: 12, padding: 12 }}>
                      <Text style={{ color: oauthMessage === 'OAuth 凭证已应用' ? colors.success : colors.errorText, fontSize: 13 }}>{oauthMessage}</Text>
                    </View>
                  ) : null}
                  <Pressable
                    disabled={oauthMutation.isPending}
                    onPress={() => {
                      setOauthMessage(null);
                      oauthMutation.mutate();
                    }}
                    style={{
                      alignItems: 'center',
                      backgroundColor: oauthMutation.isPending ? colors.disabled : colors.primary,
                      borderRadius: 14,
                      marginTop: 14,
                      paddingVertical: 13,
                    }}
                  >
                    <Text style={{ color: colors.primaryText, fontSize: 14, fontWeight: '800' }}>{oauthMutation.isPending ? '应用中...' : '应用 OAuth 凭证'}</Text>
                  </Pressable>
                </Section>
              ) : null}

              <Section title="用量分析" icon={BarChart3}>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  {RANGE_OPTIONS.map((item) => {
                    const active = item.key === rangeKey;
                    return (
                      <Pressable
                        key={item.key}
                        onPress={() => setRangeKey(item.key)}
                        style={{ backgroundColor: active ? colors.primary : colors.mutedCard, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}
                      >
                        <Text style={{ color: active ? colors.primaryText : colors.badgeDefaultText, fontSize: 12, fontWeight: '800' }}>{item.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <MetricTile label="请求" value={formatCompactNumber(statsQuery.data?.total_requests ?? 0)} />
                  <MetricTile label="Token" value={formatTokenValue(statsQuery.data?.total_tokens ?? 0)} />
                  <MetricTile label="成本" value={formatMoney(statsQuery.data?.total_account_cost ?? statsQuery.data?.total_actual_cost ?? statsQuery.data?.total_cost)} />
                  <MetricTile label="输入" value={formatTokenValue(statsQuery.data?.total_input_tokens ?? 0)} />
                  <MetricTile label="输出" value={formatTokenValue(statsQuery.data?.total_output_tokens ?? 0)} />
                  <MetricTile label="平均耗时" value={formatDuration(statsQuery.data?.average_duration_ms)} />
                </View>
                {trendPoints.length > 1 ? (
                  <View style={{ marginTop: 14 }}>
                    <LineTrendChart title="账号 Token 趋势" subtitle={`${range.start_date} 到 ${range.end_date}`} points={trendPoints} color={colors.primary} compact formatValue={formatTokenValue} />
                  </View>
                ) : null}
              </Section>

              {modelChartItems.length > 0 ? (
                <BarChartCard title="账号模型" subtitle="该账号可用或同步到的模型" items={modelChartItems} icon={DatabaseZap} formatValue={(value) => (value > 0 ? '可用' : '关闭')} />
              ) : null}

              <Section title="最近用量" icon={Activity}>
                <View style={{ gap: 10 }}>
                  {usageQuery.isLoading ? <Text style={{ color: colors.subtext }}>正在加载最近用量...</Text> : null}
                  {usageItems.slice(0, 8).map((item, index) => (
                    <View key={`${item.id ?? index}`} style={{ backgroundColor: colors.mutedCard, borderRadius: 14, padding: 12 }}>
                      <Text style={{ color: colors.text, fontSize: 13, fontWeight: '800' }}>{recordText(item as Record<string, unknown>, ['model', 'path', 'status', 'request_type'])}</Text>
                      <Text style={{ color: colors.subtext, fontSize: 12, lineHeight: 18, marginTop: 5 }}>
                        {item.method || '--'} · {formatDisplayTime(item.created_at || item.updated_at)}
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                        <MetricTile label="请求" value={formatCompactNumber(recordNumber(item as Record<string, unknown>, ['requests', 'request_count']))} />
                        <MetricTile label="Token" value={formatTokenValue(recordNumber(item as Record<string, unknown>, ['total_tokens', 'tokens']))} />
                        <MetricTile label="成本" value={formatMoney(recordNumber(item as Record<string, unknown>, ['total_cost', 'cost', 'actual_cost']))} />
                        <MetricTile label="耗时" value={formatDuration(recordNumber(item as Record<string, unknown>, ['duration_ms', 'latency_ms', 'average_duration_ms']))} />
                      </View>
                    </View>
                  ))}
                  {!usageQuery.isLoading && usageItems.length === 0 ? <Text style={{ color: colors.subtext }}>当前范围暂无账号用量明细。</Text> : null}
                </View>
              </Section>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
