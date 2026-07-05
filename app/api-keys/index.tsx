import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Stack } from 'expo-router';
import { KeyRound, Pencil, Plus, Power, RefreshCw, Search, Trash2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

import { ListCard } from '@/src/components/list-card';
import { ScreenShell } from '@/src/components/screen-shell';
import { useDebouncedValue } from '@/src/hooks/use-debounced-value';
import { formatDisplayTime } from '@/src/lib/formatters';
import { useAppTheme } from '@/src/lib/theme';
import { createAdminApiKey, deleteAdminApiKey, getApiKeysUsageDashboard, searchAdminApiKeys, updateAdminApiKey } from '@/src/services/admin';
import type { AdminApiKey, PaginatedData } from '@/src/types/admin';

type ApiKeySearchResult = PaginatedData<AdminApiKey> | AdminApiKey[] | { items?: AdminApiKey[]; api_keys?: AdminApiKey[]; keys?: AdminApiKey[]; data?: ApiKeySearchResult };
type ApiKeyFormMode = 'create' | 'edit' | null;

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return '操作失败，请稍后重试。';
}

function toNullableNumber(raw: string) {
  if (!raw.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function getApiKeyItems(result?: ApiKeySearchResult) {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  if (Array.isArray(result.items)) return result.items;
  const shaped = result as { api_keys?: AdminApiKey[] };
  if (Array.isArray(shaped.api_keys)) return shaped.api_keys;
  const withKeys = result as { keys?: AdminApiKey[] };
  if (Array.isArray(withKeys.keys)) return withKeys.keys;
  const withData = result as { data?: ApiKeySearchResult };
  if (withData.data) return getApiKeyItems(withData.data);
  return [];
}

function maskKey(value?: string) {
  if (!value) return '--';
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function formatNumber(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  return new Intl.NumberFormat('en-US').format(value);
}

function firstNumberValue(source: unknown, keys: string[]) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return undefined;
  const record = source as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }

  return undefined;
}

function firstTextValue(source: unknown, keys: string[]) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return undefined;
  const record = source as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }

  return undefined;
}

function formatLimit(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '不限';
  return formatNumber(value);
}

function formatCost(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return value.toFixed(value >= 100 ? 1 : 3).replace(/\.?0+$/, '');
}

function formatQuota(item: AdminApiKey) {
  const used = Number(item.quota_used ?? 0);
  const quota = Number(item.quota ?? 0);

  if (!Number.isFinite(quota) || quota <= 0) {
    return `${formatNumber(used)} / 不限`;
  }

  return `${formatNumber(used)} / ${formatNumber(quota)}`;
}

function formatQuotaRemaining(item: AdminApiKey) {
  const used = Number(item.quota_used ?? 0);
  const quota = Number(item.quota ?? 0);

  if (!Number.isFinite(quota) || quota <= 0) return '不限';
  return formatNumber(Math.max(quota - used, 0));
}

function isExpired(value?: string | null) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return !Number.isNaN(time) && time < Date.now();
}

function isDisabledStatus(status?: string) {
  return ['disabled', 'inactive', 'revoked'].includes(`${status || ''}`.toLowerCase());
}

function getUserLabel(item: AdminApiKey) {
  return item.user?.email || item.user_email || item.user?.username || `${item.user_id || '--'}`;
}

function getGroupLabel(item: AdminApiKey) {
  return item.group?.name || item.group_name || (item.group_id ? `#${item.group_id}` : '未分组');
}

function StatusPill({ status }: { status?: string }) {
  const colors = useAppTheme();
  const normalized = `${status || 'active'}`.toLowerCase();
  const disabled = ['disabled', 'inactive', 'revoked'].includes(normalized);
  const backgroundColor = disabled ? colors.badgeMutedBg : colors.successBg;
  const textColor = disabled ? colors.badgeMutedText : colors.success;

  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
      <Text style={{ color: textColor, fontSize: 11, fontWeight: '800' }}>{status || 'active'}</Text>
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
    <View style={{ flex: 1, minWidth: 136 }}>
      <Text style={{ color: colors.subtext, fontSize: 12, marginBottom: 6 }}>{label}</Text>
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
          paddingVertical: 11,
        }}
      />
    </View>
  );
}

export default function ApiKeysScreen() {
  const colors = useAppTheme();
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState('');
  const keyword = useDebouncedValue(searchText, 300);
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<ApiKeyFormMode>(null);
  const [editingItem, setEditingItem] = useState<AdminApiKey | null>(null);
  const [formUserId, setFormUserId] = useState('');
  const [formName, setFormName] = useState('');
  const [formKey, setFormKey] = useState('');
  const [formGroupId, setFormGroupId] = useState('');
  const [formQuota, setFormQuota] = useState('');
  const [formExpiresAt, setFormExpiresAt] = useState('');
  const [formRateLimit5h, setFormRateLimit5h] = useState('');
  const [formRateLimit1d, setFormRateLimit1d] = useState('');
  const [formRateLimit7d, setFormRateLimit7d] = useState('');

  const apiKeysQuery = useQuery({
    queryKey: ['admin-api-keys', keyword],
    queryFn: () => searchAdminApiKeys(keyword),
  });

  const usageQuery = useQuery({
    queryKey: ['api-keys-usage-dashboard'],
    queryFn: getApiKeysUsageDashboard,
    staleTime: 30_000,
  });

  const allApiKeys = useMemo(
    () => getApiKeyItems(apiKeysQuery.data as ApiKeySearchResult | undefined),
    [apiKeysQuery.data]
  );
  const usageByKey = useMemo(() => {
    const entries = new Map<number, Record<string, unknown>>();

    (usageQuery.data ?? []).forEach((row) => {
      const id = firstNumberValue(row, ['api_key_id', 'apiKeyId', 'id']);
      if (id !== undefined) {
        entries.set(id, row);
      }
    });

    return entries;
  }, [usageQuery.data]);
  const apiKeys = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) return allApiKeys;

    return allApiKeys.filter((item) => {
      const haystack = [
        item.name,
        item.key,
        item.status,
        item.group_name,
        item.group?.name,
        item.group_id,
        item.user_email,
        item.user?.email,
        item.user?.username,
        item.user_id,
      ].filter(Boolean).join(' ').toLowerCase();

      return haystack.includes(normalized);
    });
  }, [allApiKeys, keyword]);
  const summary = useMemo(() => {
    const disabled = apiKeys.filter((item) => isDisabledStatus(item.status)).length;
    const expired = apiKeys.filter((item) => isExpired(item.expires_at)).length;
    const quotaUsed = apiKeys.reduce((sum, item) => sum + Number(item.quota_used ?? 0), 0);
    const requestCount = apiKeys.reduce((sum, item) => sum + (firstNumberValue(usageByKey.get(item.id), ['request_count', 'requestCount']) ?? 0), 0);
    const totalCost = apiKeys.reduce((sum, item) => sum + (firstNumberValue(usageByKey.get(item.id), ['total_cost', 'totalCost', 'actual_cost', 'actualCost']) ?? 0), 0);

    return {
      total: apiKeys.length,
      active: Math.max(apiKeys.length - disabled - expired, 0),
      disabled,
      expired,
      quotaUsed,
      requestCount,
      totalCost,
    };
  }, [apiKeys, usageByKey]);

  function resetForm() {
    setFormMode(null);
    setEditingItem(null);
    setFormUserId('');
    setFormName('');
    setFormKey('');
    setFormGroupId('');
    setFormQuota('');
    setFormExpiresAt('');
    setFormRateLimit5h('');
    setFormRateLimit1d('');
    setFormRateLimit7d('');
    setFormError(null);
  }

  function getFormPayload(includeUserId: boolean) {
    const userId = toNullableNumber(formUserId);
    const groupId = toNullableNumber(formGroupId);
    const quota = toNullableNumber(formQuota);
    const rateLimit5h = toNullableNumber(formRateLimit5h);
    const rateLimit1d = toNullableNumber(formRateLimit1d);
    const rateLimit7d = toNullableNumber(formRateLimit7d);

    return {
      ...(includeUserId && userId ? { user_id: userId } : {}),
      ...(formName.trim() ? { name: formName.trim() } : {}),
      ...(formKey.trim() ? { key: formKey.trim() } : {}),
      group_id: groupId,
      quota,
      expires_at: formExpiresAt.trim() || null,
      rate_limit_5h: rateLimit5h,
      rate_limit_1d: rateLimit1d,
      rate_limit_7d: rateLimit7d,
    };
  }

  function openCreateForm() {
    setFormMode('create');
    setEditingItem(null);
    setFormUserId('');
    setFormName('');
    setFormKey('');
    setFormGroupId('');
    setFormQuota('');
    setFormExpiresAt('');
    setFormRateLimit5h('');
    setFormRateLimit1d('');
    setFormRateLimit7d('');
    setFormError(null);
  }

  function openEditForm(item: AdminApiKey) {
    setFormMode('edit');
    setEditingItem(item);
    setFormUserId(item.user_id ? String(item.user_id) : '');
    setFormName(item.name || '');
    setFormKey('');
    setFormGroupId(item.group_id ? String(item.group_id) : '');
    setFormQuota(item.quota ? String(item.quota) : '');
    setFormExpiresAt(item.expires_at || '');
    setFormRateLimit5h(item.rate_limit_5h ? String(item.rate_limit_5h) : '');
    setFormRateLimit1d(item.rate_limit_1d ? String(item.rate_limit_1d) : '');
    setFormRateLimit7d(item.rate_limit_7d ? String(item.rate_limit_7d) : '');
    setFormError(null);
  }

  const createMutation = useMutation({
    mutationFn: () => {
      const userId = toNullableNumber(formUserId);
      if (!userId) {
        throw new Error('请输入用户 ID');
      }

      return createAdminApiKey(getFormPayload(true));
    },
    onSuccess: () => {
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['admin-api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['user-api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['api-keys-usage-dashboard'] });
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id }: { id: number }) => updateAdminApiKey(id, getFormPayload(false)),
    onSuccess: () => {
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['admin-api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['user-api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['api-keys-usage-dashboard'] });
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const toggleMutation = useMutation({
    mutationFn: (item: AdminApiKey) => updateAdminApiKey(item.id, { status: isDisabledStatus(item.status) ? 'active' : 'disabled' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['user-api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['api-keys-usage-dashboard'] });
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAdminApiKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['user-api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['api-keys-usage-dashboard'] });
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  async function copyKey(item: AdminApiKey) {
    await Clipboard.setStringAsync(item.key || '');
    const copyId = String(item.id || item.key);
    setCopiedKey(copyId);
    setTimeout(() => setCopiedKey((current) => (current === copyId ? null : current)), 1400);
  }

  function confirmDelete(item: AdminApiKey) {
    Alert.alert('删除 API Key', `确认删除 ${item.name || `Key #${item.id}`} 吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(item.id),
      },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ title: 'API 密钥管理' }} />
      <ScreenShell
        title="API 密钥"
        subtitle="查看、创建、编辑、启停和删除 API Key。"
        icon={KeyRound}
        variant="minimal"
        refreshing={apiKeysQuery.isRefetching || usageQuery.isRefetching}
        onRefresh={() => {
          void apiKeysQuery.refetch();
          void usageQuery.refetch();
        }}
        right={(
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={openCreateForm}
              style={{ alignItems: 'center', backgroundColor: colors.primary, borderRadius: 999, flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 8 }}
            >
              <Plus color={colors.primaryText} size={14} />
              <Text style={{ color: colors.primaryText, fontSize: 12, fontWeight: '800' }}>新建</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                void apiKeysQuery.refetch();
                void usageQuery.refetch();
              }}
              style={{ alignItems: 'center', backgroundColor: colors.mutedCard, borderRadius: 999, flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 8 }}
            >
              <RefreshCw color={colors.badgeDefaultText} size={14} />
              <Text style={{ color: colors.badgeDefaultText, fontSize: 12, fontWeight: '800' }}>刷新</Text>
            </Pressable>
          </View>
        )}
        safeAreaEdges={['bottom']}
        bottomInsetClassName="pb-8"
        contentGapClassName="mt-3 gap-3"
      >
        <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 14 }}>
          <View style={{ alignItems: 'center', backgroundColor: colors.mutedCard, borderRadius: 16, flexDirection: 'row', paddingHorizontal: 14 }}>
            <Search color={colors.subtext} size={18} />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="搜索名称 / Key / 用户 / 分组"
              placeholderTextColor={colors.placeholder}
              style={{ color: colors.text, flex: 1, fontSize: 15, paddingHorizontal: 10, paddingVertical: 12 }}
            />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <InfoTile label="密钥总数" value={formatNumber(summary.total)} />
            <InfoTile label="正常可用" value={formatNumber(summary.active)} tone="success" />
            <InfoTile label="禁用/撤销" value={formatNumber(summary.disabled)} />
            <InfoTile label="已过期" value={formatNumber(summary.expired)} tone={summary.expired > 0 ? 'danger' : 'default'} />
            <InfoTile label="已用额度" value={formatNumber(summary.quotaUsed)} />
            <InfoTile label="请求总数" value={formatNumber(summary.requestCount)} />
            <InfoTile label="总费用" value={formatCost(summary.totalCost)} />
          </View>
          {usageQuery.error ? (
            <Text style={{ color: colors.subtext, fontSize: 12, lineHeight: 18, marginTop: 10 }}>
              用量统计未返回：{getErrorMessage(usageQuery.error)}
            </Text>
          ) : null}
        </View>

        {formMode ? (
          <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 14 }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>{formMode === 'create' ? '创建 API Key' : '编辑 API Key'}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
              {formMode === 'create' ? <Field label="用户 ID" value={formUserId} onChangeText={setFormUserId} placeholder="必填" keyboardType="number-pad" /> : null}
              <Field label="名称" value={formName} onChangeText={setFormName} placeholder="例如：生产 Key" />
              <Field label="Key" value={formKey} onChangeText={setFormKey} placeholder={formMode === 'create' ? '留空则由后端生成' : '留空不修改'} />
              <Field label="分组 ID" value={formGroupId} onChangeText={setFormGroupId} placeholder="留空表示不绑定" keyboardType="number-pad" />
              <Field label="额度" value={formQuota} onChangeText={setFormQuota} placeholder="留空表示不限" keyboardType="decimal-pad" />
              <Field label="过期时间" value={formExpiresAt} onChangeText={setFormExpiresAt} placeholder="2026-12-31T23:59:59Z" />
              <Field label="5H 限流" value={formRateLimit5h} onChangeText={setFormRateLimit5h} placeholder="留空表示不限" keyboardType="decimal-pad" />
              <Field label="1D 限流" value={formRateLimit1d} onChangeText={setFormRateLimit1d} placeholder="留空表示不限" keyboardType="decimal-pad" />
              <Field label="7D 限流" value={formRateLimit7d} onChangeText={setFormRateLimit7d} placeholder="留空表示不限" keyboardType="decimal-pad" />
            </View>
            {formError ? (
              <View style={{ backgroundColor: colors.errorBg, borderRadius: 12, marginTop: 12, padding: 12 }}>
                <Text style={{ color: colors.errorText, fontSize: 13 }}>{formError}</Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Pressable
                disabled={createMutation.isPending || updateMutation.isPending}
                style={{ alignItems: 'center', backgroundColor: colors.primary, borderRadius: 12, flex: 1, paddingVertical: 12 }}
                onPress={() => {
                  if (formMode === 'create') {
                    createMutation.mutate();
                    return;
                  }

                  if (editingItem?.id) {
                    updateMutation.mutate({ id: editingItem.id });
                  }
                }}
              >
                <Text style={{ color: colors.primaryText, fontWeight: '800' }}>{createMutation.isPending || updateMutation.isPending ? '保存中...' : '保存'}</Text>
              </Pressable>
              <Pressable
                style={{ alignItems: 'center', backgroundColor: colors.mutedCard, borderRadius: 12, flex: 1, paddingVertical: 12 }}
                onPress={resetForm}
              >
                <Text style={{ color: colors.badgeDefaultText, fontWeight: '800' }}>取消</Text>
              </Pressable>
            </View>
          </View>
        ) : formError ? (
            <View style={{ backgroundColor: colors.errorBg, borderRadius: 12, marginTop: 12, padding: 12 }}>
              <Text style={{ color: colors.errorText, fontSize: 13 }}>{formError}</Text>
            </View>
        ) : null}

        {apiKeysQuery.isLoading ? <ListCard title="正在加载 API Keys" meta="请稍等..." icon={KeyRound} /> : null}

        {apiKeysQuery.error ? (
          <View style={{ backgroundColor: colors.errorBg, borderRadius: 14, padding: 14 }}>
            <Text style={{ color: colors.errorText, fontWeight: '800' }}>API Keys 加载失败</Text>
            <Text style={{ color: colors.errorText, fontSize: 13, lineHeight: 20, marginTop: 6 }}>{getErrorMessage(apiKeysQuery.error)}</Text>
          </View>
        ) : null}

        {!apiKeysQuery.isLoading && !apiKeysQuery.error && apiKeys.length === 0 ? (
          <ListCard title="暂无 API Key" meta="换个关键词搜索，或确认后端已有密钥数据。" icon={KeyRound} />
        ) : null}

        {apiKeys.map((item: AdminApiKey) => {
          const copyId = String(item.id || item.key);
          const disabled = isDisabledStatus(item.status);
          const usage = usageByKey.get(item.id);
          const requestCount = firstNumberValue(usage, ['request_count', 'requestCount']);
          const totalCost = firstNumberValue(usage, ['total_cost', 'totalCost']);
          const actualCost = firstNumberValue(usage, ['actual_cost', 'actualCost']);
          const usageLastUsedAt = firstTextValue(usage, ['last_used_at', 'lastUsedAt']);
          const lastUsedAt = item.last_used_at || usageLastUsedAt;

          return (
            <ListCard
              key={item.id || item.key}
              title={item.name || `Key #${item.id || '--'}`}
              meta={`用户 ${getUserLabel(item)} · 分组 ${getGroupLabel(item)}`}
              icon={KeyRound}
            >
              <View style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 13, lineHeight: 20 }}>{maskKey(item.key)}</Text>
                    <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 4 }}>
                      最后使用 {formatDisplayTime(lastUsedAt)} · 更新 {formatDisplayTime(item.updated_at)}
                    </Text>
                  </View>
                  <StatusPill status={item.status} />
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <InfoTile label="Key ID" value={`#${item.id}`} />
                  <InfoTile label="用户" value={getUserLabel(item)} />
                  <InfoTile label="分组" value={getGroupLabel(item)} />
                  <InfoTile label="额度" value={formatQuota(item)} />
                  <InfoTile label="剩余额度" value={formatQuotaRemaining(item)} />
                  <InfoTile label="请求数" value={requestCount === undefined ? '--' : formatNumber(requestCount)} />
                  <InfoTile label="总费用" value={formatCost(totalCost)} />
                  <InfoTile label="实际费用" value={formatCost(actualCost)} />
                  <InfoTile label="5H 用量" value={formatNumber(item.usage_5h)} />
                  <InfoTile label="1D 用量" value={formatNumber(item.usage_1d)} />
                  <InfoTile label="7D 用量" value={formatNumber(item.usage_7d)} />
                  <InfoTile label="5H 限流" value={formatLimit(item.rate_limit_5h)} />
                  <InfoTile label="1D 限流" value={formatLimit(item.rate_limit_1d)} />
                  <InfoTile label="7D 限流" value={formatLimit(item.rate_limit_7d)} />
                  <InfoTile label="过期时间" value={formatDisplayTime(item.expires_at)} tone={isExpired(item.expires_at) ? 'danger' : 'default'} />
                  <InfoTile label="5H 窗口" value={formatDisplayTime(item.window_5h_start)} />
                  <InfoTile label="1D 窗口" value={formatDisplayTime(item.window_1d_start)} />
                  <InfoTile label="7D 窗口" value={formatDisplayTime(item.window_7d_start)} />
                  <InfoTile label="创建时间" value={formatDisplayTime(item.created_at)} />
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Pressable
                    style={{ backgroundColor: colors.mutedCard, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 }}
                    onPress={() => copyKey(item)}
                  >
                    <Text style={{ color: copiedKey === copyId ? colors.success : colors.badgeDefaultText, fontSize: 12, fontWeight: '800' }}>
                      {copiedKey === copyId ? '已复制' : '复制'}
                    </Text>
                  </Pressable>
                  {item.id ? (
                    <>
                      <Pressable
                        style={{ backgroundColor: colors.mutedCard, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', gap: 6 }}
                        onPress={() => openEditForm(item)}
                      >
                        <Pencil color={colors.badgeDefaultText} size={13} />
                        <Text style={{ color: colors.badgeDefaultText, fontSize: 12, fontWeight: '800' }}>编辑</Text>
                      </Pressable>
                      <Pressable
                        disabled={toggleMutation.isPending}
                        style={{ backgroundColor: colors.mutedCard, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', gap: 6 }}
                        onPress={() => toggleMutation.mutate(item)}
                      >
                        <Power color={disabled ? colors.success : colors.badgeDefaultText} size={13} />
                        <Text style={{ color: disabled ? colors.success : colors.badgeDefaultText, fontSize: 12, fontWeight: '800' }}>{disabled ? '启用' : '禁用'}</Text>
                      </Pressable>
                      <Pressable
                        disabled={deleteMutation.isPending}
                        style={{ backgroundColor: colors.errorBg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', gap: 6 }}
                        onPress={() => confirmDelete(item)}
                      >
                        <Trash2 color={colors.errorText} size={13} />
                        <Text style={{ color: colors.errorText, fontSize: 12, fontWeight: '800' }}>删除</Text>
                      </Pressable>
                    </>
                  ) : null}
                </View>
              </View>
            </ListCard>
          );
        })}
      </ScreenShell>
    </>
  );
}
