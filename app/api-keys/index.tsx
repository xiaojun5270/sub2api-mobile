import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { Stack } from 'expo-router';
import { ChevronDown, Copy, FileCode2, KeyRound, Pencil, Plus, Power, RefreshCw, Search, Trash2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

import { ListCard } from '@/src/components/list-card';
import { ScreenShell } from '@/src/components/screen-shell';
import { useDebouncedValue } from '@/src/hooks/use-debounced-value';
import { formatDisplayTime } from '@/src/lib/formatters';
import { useAppTheme } from '@/src/lib/theme';
import { createAdminApiKey, deleteAdminApiKey, getApiKeyDailyUsage, getApiKeysUsageDashboard, searchAdminApiKeys, updateAdminApiKey } from '@/src/services/admin';
import { adminConfigState } from '@/src/store/admin-config';
import type { AdminApiKey, PaginatedData } from '@/src/types/admin';

type ApiKeySearchResult = PaginatedData<AdminApiKey> | AdminApiKey[] | { items?: AdminApiKey[]; api_keys?: AdminApiKey[]; keys?: AdminApiKey[]; data?: ApiKeySearchResult };
type ApiKeyFormMode = 'create' | 'edit' | null;
type FilterMenu = 'group' | 'status' | null;
type CcSwitchClientType = 'claude' | 'gemini';

const OPENAI_CC_SWITCH_CODEX_MODEL = 'gpt-5.5';

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

function removeApiKeyFromResult(result: ApiKeySearchResult | undefined, deletedId: number): ApiKeySearchResult | undefined {
  if (!result) return result;

  if (Array.isArray(result)) {
    return result.filter((item) => item.id !== deletedId);
  }

  if (Array.isArray(result.items)) {
    const items = result.items.filter((item) => item.id !== deletedId);
    const removedCount = result.items.length - items.length;
    const currentTotal = 'total' in result && typeof result.total === 'number' ? result.total : result.items.length;

    return {
      ...result,
      items,
      total: Math.max(currentTotal - removedCount, 0),
    };
  }

  const shaped = result as { api_keys?: AdminApiKey[]; keys?: AdminApiKey[]; data?: ApiKeySearchResult };

  if (Array.isArray(shaped.api_keys)) {
    return {
      ...result,
      api_keys: shaped.api_keys.filter((item) => item.id !== deletedId),
    };
  }

  if (Array.isArray(shaped.keys)) {
    return {
      ...result,
      keys: shaped.keys.filter((item) => item.id !== deletedId),
    };
  }

  if (shaped.data) {
    return {
      ...result,
      data: removeApiKeyFromResult(shaped.data, deletedId),
    };
  }

  return result;
}

function updateApiKeyInResult(
  result: ApiKeySearchResult | undefined,
  apiKeyId: number,
  updates: Partial<AdminApiKey>
): ApiKeySearchResult | undefined {
  if (!result) return result;

  const updateItems = (items: AdminApiKey[]) => items.map((item) => (
    item.id === apiKeyId ? { ...item, ...updates } : item
  ));

  if (Array.isArray(result)) {
    return updateItems(result);
  }

  if (Array.isArray(result.items)) {
    return {
      ...result,
      items: updateItems(result.items),
    };
  }

  const shaped = result as { api_keys?: AdminApiKey[]; keys?: AdminApiKey[]; data?: ApiKeySearchResult };

  if (Array.isArray(shaped.api_keys)) {
    return {
      ...result,
      api_keys: updateItems(shaped.api_keys),
    };
  }

  if (Array.isArray(shaped.keys)) {
    return {
      ...result,
      keys: updateItems(shaped.keys),
    };
  }

  if (shaped.data) {
    return {
      ...result,
      data: updateApiKeyInResult(shaped.data, apiKeyId, updates),
    };
  }

  return result;
}

function maskKey(value?: string) {
  if (!value) return '--';
  if (value.length <= 12) return `${value.slice(0, 4)}***`;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
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

function formatMoney(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '$0.0000';
  return `$${value.toFixed(4)}`;
}

function isExpired(value?: string | null) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return !Number.isNaN(time) && time < Date.now();
}

function isDisabledStatus(status?: string) {
  return ['disabled', 'inactive', 'revoked'].includes(`${status || ''}`.toLowerCase());
}

function getNextStatus(status?: string) {
  return isDisabledStatus(status) ? 'active' : 'inactive';
}

function getApiKeyOwnerId(item?: AdminApiKey | null) {
  return item?.user_id || item?.user?.id || undefined;
}

function getLocalDateKey(value = new Date()) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDateKey(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value.slice(0, 10);
}

function sumUsageCost(rows: Record<string, unknown>[], predicate: (dateKey?: string) => boolean) {
  return rows.reduce((sum, row) => {
    const dateKey = getDateKey(firstTextValue(row, ['date', 'day', 'created_at', 'createdAt']));
    if (!predicate(dateKey)) return sum;
    return sum + (firstNumberValue(row, ['total_actual_cost', 'totalActualCost', 'actual_cost', 'actualCost', 'total_cost', 'totalCost', 'cost']) ?? 0);
  }, 0);
}

function getLast30DayStartKey() {
  const value = new Date();
  value.setDate(value.getDate() - 29);
  return getLocalDateKey(value);
}

function getGroupFilterKey(item: AdminApiKey) {
  return item.group_id ? `id:${item.group_id}` : `name:${getGroupLabel(item)}`;
}

function getStatusFilterKey(status?: string) {
  return isDisabledStatus(status) ? 'disabled' : 'active';
}

function formatStatusLabel(status?: string) {
  return isDisabledStatus(status) ? '禁用' : '活跃';
}

function formatExpiry(value?: string | null) {
  return value ? formatDisplayTime(value) : '永久有效';
}

function formatRateLimit(item: AdminApiKey) {
  const entries = [
    ['5H', item.rate_limit_5h],
    ['1D', item.rate_limit_1d],
    ['7D', item.rate_limit_7d],
  ].filter(([, value]) => typeof value === 'number' && Number.isFinite(value) && value > 0);

  if (entries.length === 0) return '-';

  return entries.map(([label, value]) => `${label} ${formatNumber(value as number)}`).join(' · ');
}

function base64EncodeAscii(value: string) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  let index = 0;

  while (index < value.length) {
    const first = value.charCodeAt(index++) & 0xff;
    const second = index < value.length ? value.charCodeAt(index++) & 0xff : Number.NaN;
    const third = index < value.length ? value.charCodeAt(index++) & 0xff : Number.NaN;
    const triplet = (first << 16) | ((Number.isNaN(second) ? 0 : second) << 8) | (Number.isNaN(third) ? 0 : third);

    output += chars[(triplet >> 18) & 63];
    output += chars[(triplet >> 12) & 63];
    output += Number.isNaN(second) ? '=' : chars[(triplet >> 6) & 63];
    output += Number.isNaN(third) ? '=' : chars[triplet & 63];
  }

  return output;
}

function getServiceBaseUrl() {
  return adminConfigState.baseUrl
    .trim()
    .replace(/\/api\/v1\/?$/, '')
    .replace(/\/api\/?$/, '')
    .replace(/\/$/, '');
}

function resolveCcSwitchImportConfig(platform: string | undefined, clientType: CcSwitchClientType, baseUrl: string) {
  switch (platform || 'anthropic') {
    case 'antigravity':
      return {
        app: clientType === 'gemini' ? 'gemini' : 'claude',
        endpoint: `${baseUrl}/antigravity`,
      };
    case 'openai':
      return {
        app: 'codex',
        endpoint: baseUrl,
        model: OPENAI_CC_SWITCH_CODEX_MODEL,
      };
    case 'gemini':
      return {
        app: 'gemini',
        endpoint: baseUrl,
      };
    default:
      return {
        app: 'claude',
        endpoint: baseUrl,
      };
  }
}

function toQueryString(entries: [string, string][]) {
  return entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
}

function buildCcSwitchImportDeeplink({
  apiKey,
  baseUrl,
  clientType,
  platform,
  providerName,
}: {
  apiKey: string;
  baseUrl: string;
  clientType: CcSwitchClientType;
  platform?: string;
  providerName: string;
}) {
  const config = resolveCcSwitchImportConfig(platform, clientType, baseUrl);
  const usageScript = `({
    request: {
      url: "{{baseUrl}}/v1/usage",
      method: "GET",
      headers: { "Authorization": "Bearer {{apiKey}}" }
    },
    extractor: function(response) {
      const remaining = response?.remaining ?? response?.quota?.remaining ?? response?.balance;
      const unit = response?.unit ?? response?.quota?.unit ?? "USD";
      return {
        isValid: response?.is_active ?? response?.isValid ?? true,
        remaining,
        unit
      };
    }
  })`;
  const entries: [string, string][] = [
    ['resource', 'provider'],
    ['app', config.app],
    ['name', providerName],
    ['homepage', baseUrl],
    ['endpoint', config.endpoint],
    ['apiKey', apiKey],
    ['configFormat', 'json'],
    ['usageEnabled', 'true'],
    ['usageScript', base64EncodeAscii(usageScript)],
    ['usageAutoInterval', '30'],
  ];

  if (config.model) {
    entries.splice(2, 0, ['model', config.model]);
  }

  return `ccswitch://v1/import?${toQueryString(entries)}`;
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

function FilterButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const colors = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      style={{
        alignItems: 'center',
        backgroundColor: active ? colors.successBg : colors.mutedCard,
        borderColor: active ? colors.success : colors.border,
        borderRadius: 12,
        borderWidth: 1,
        flexDirection: 'row',
        gap: 6,
        minHeight: 38,
        paddingHorizontal: 12,
      }}
    >
      <Text numberOfLines={1} style={{ color: active ? colors.success : colors.badgeDefaultText, fontSize: 12, fontWeight: '800' }}>{label}</Text>
      <ChevronDown color={active ? colors.success : colors.subtext} size={14} />
    </Pressable>
  );
}

function Field({
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
    <View style={{ flex: 1, minWidth: 136 }}>
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
          minHeight: multiline ? 86 : undefined,
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
  const [groupFilter, setGroupFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [openFilterMenu, setOpenFilterMenu] = useState<FilterMenu>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<ApiKeyFormMode>(null);
  const [editingItem, setEditingItem] = useState<AdminApiKey | null>(null);
  const [formUserId, setFormUserId] = useState('');
  const [formName, setFormName] = useState('');
  const [formKey, setFormKey] = useState('');
  const [formStatus, setFormStatus] = useState('active');
  const [formGroupId, setFormGroupId] = useState('');
  const [formExpiresAt, setFormExpiresAt] = useState('');
  const [formExpiresInDays, setFormExpiresInDays] = useState('');

  const apiKeysQuery = useQuery({
    queryKey: ['admin-api-keys', keyword],
    queryFn: () => searchAdminApiKeys(keyword),
  });

  const allApiKeys = useMemo(
    () => getApiKeyItems(apiKeysQuery.data as ApiKeySearchResult | undefined),
    [apiKeysQuery.data]
  );
  const apiKeyIds = useMemo(
    () => allApiKeys.map((item) => item.id).filter((id) => Number.isFinite(id) && id > 0),
    [allApiKeys]
  );
  const usageQuery = useQuery({
    queryKey: ['api-keys-usage-dashboard', apiKeyIds.join(',')],
    queryFn: () => getApiKeysUsageDashboard(apiKeyIds),
    enabled: apiKeyIds.length > 0,
    staleTime: 30_000,
  });
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
  const dailyUsageQuery = useQuery({
    queryKey: ['api-key-daily-usage', apiKeyIds.join(',')],
    queryFn: async () => {
      const results = await Promise.all(
        apiKeyIds.map(async (id) => ({
          id,
          rows: await getApiKeyDailyUsage(id).catch(() => [] as Record<string, unknown>[]),
        }))
      );

      return results;
    },
    enabled: apiKeyIds.length > 0,
    staleTime: 30_000,
  });
  const dailyUsageByKey = useMemo(() => {
    const entries = new Map<number, Record<string, unknown>[]>();

    (dailyUsageQuery.data ?? []).forEach((item) => {
      entries.set(item.id, item.rows);
    });

    return entries;
  }, [dailyUsageQuery.data]);
  const groupOptions = useMemo(() => {
    const entries = new Map<string, string>();

    allApiKeys.forEach((item) => {
      entries.set(getGroupFilterKey(item), getGroupLabel(item));
    });

    return [{ key: 'all', label: '全部分组' }, ...Array.from(entries, ([key, label]) => ({ key, label }))];
  }, [allApiKeys]);
  const statusOptions = useMemo(() => {
    const entries = new Map<string, string>([
      ['all', '全部状态'],
      ['active', '活跃'],
      ['disabled', '禁用'],
    ]);

    allApiKeys.forEach((item) => {
      entries.set(getStatusFilterKey(item.status), formatStatusLabel(item.status));
    });

    return Array.from(entries, ([key, label]) => ({ key, label }));
  }, [allApiKeys]);
  const selectedGroupLabel = groupOptions.find((item) => item.key === groupFilter)?.label ?? '全部分组';
  const selectedStatusLabel = statusOptions.find((item) => item.key === statusFilter)?.label ?? '全部状态';
  const apiKeys = useMemo(() => allApiKeys.filter((item) => {
    const matchesGroup = groupFilter === 'all' || getGroupFilterKey(item) === groupFilter;
    const matchesStatus = statusFilter === 'all' || getStatusFilterKey(item.status) === statusFilter;
    return matchesGroup && matchesStatus;
  }), [allApiKeys, groupFilter, statusFilter]);

  function resetForm() {
    setFormMode(null);
    setEditingItem(null);
    setFormUserId('');
    setFormName('');
    setFormKey('');
    setFormStatus('active');
    setFormGroupId('');
    setFormExpiresAt('');
    setFormExpiresInDays('');
    setFormError(null);
  }

  function getFormPayload(includeUserId: boolean, mode: 'create' | 'edit') {
    const userId = toNullableNumber(formUserId);
    const groupId = toNullableNumber(formGroupId);
    const expiresInDays = toNullableNumber(formExpiresInDays);

    return {
      ...(includeUserId && userId ? { user_id: userId } : {}),
      ...(formName.trim() ? { name: formName.trim() } : {}),
      ...(formKey.trim() ? { custom_key: formKey.trim(), key: formKey.trim() } : {}),
      ...(mode === 'edit' ? { status: formStatus } : {}),
      ...(mode === 'edit' || groupId !== null ? { group_id: groupId } : {}),
      ...(mode === 'create' && expiresInDays !== null ? { expires_in_days: expiresInDays } : {}),
      ...(mode === 'edit' ? { expires_at: formExpiresAt.trim() || null } : {}),
    };
  }

  function openCreateForm() {
    setFormMode('create');
    setEditingItem(null);
    setFormUserId('');
    setFormName('');
    setFormKey('');
    setFormStatus('active');
    setFormGroupId('');
    setFormExpiresAt('');
    setFormExpiresInDays('');
    setFormError(null);
  }

  function openEditForm(item: AdminApiKey) {
    setFormMode('edit');
    setEditingItem(item);
    const ownerId = getApiKeyOwnerId(item);
    setFormUserId(ownerId ? String(ownerId) : '');
    setFormName(item.name || '');
    setFormKey('');
    setFormStatus(isDisabledStatus(item.status) ? 'inactive' : 'active');
    setFormGroupId(item.group_id ? String(item.group_id) : '');
    setFormExpiresAt(item.expires_at || '');
    setFormExpiresInDays('');
    setFormError(null);
  }

  const createMutation = useMutation({
    mutationFn: () => {
      if (!formName.trim()) {
        throw new Error('请输入名称');
      }

      return createAdminApiKey(getFormPayload(true, 'create'));
    },
    onSuccess: () => {
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['admin-api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['user-api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['api-keys-usage-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['api-key-daily-usage'] });
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, userId }: { id: number; userId?: number }) => updateAdminApiKey(id, getFormPayload(false, 'edit'), userId),
    onSuccess: () => {
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['admin-api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['user-api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['api-keys-usage-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['api-key-daily-usage'] });
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const toggleMutation = useMutation({
    mutationFn: (item: AdminApiKey) => updateAdminApiKey(item.id, { status: getNextStatus(item.status) }, getApiKeyOwnerId(item)),
    onMutate: () => setFormError(null),
    onSuccess: (_data, item) => {
      const status = getNextStatus(item.status);
      queryClient.setQueriesData<ApiKeySearchResult>(
        { queryKey: ['admin-api-keys'] },
        (current) => updateApiKeyInResult(current, item.id, { status })
      );
      queryClient.setQueriesData<ApiKeySearchResult>(
        { queryKey: ['user-api-keys'] },
        (current) => updateApiKeyInResult(current, item.id, { status })
      );
      queryClient.invalidateQueries({ queryKey: ['admin-api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['user-api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['api-keys-usage-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['api-key-daily-usage'] });
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (item: AdminApiKey) => deleteAdminApiKey(item.id, getApiKeyOwnerId(item)),
    onMutate: () => setFormError(null),
    onSuccess: (_data, item) => {
      queryClient.setQueriesData<ApiKeySearchResult>(
        { queryKey: ['admin-api-keys'] },
        (current) => removeApiKeyFromResult(current, item.id)
      );
      queryClient.setQueriesData<ApiKeySearchResult>(
        { queryKey: ['user-api-keys'] },
        (current) => removeApiKeyFromResult(current, item.id)
      );
      queryClient.invalidateQueries({ queryKey: ['admin-api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['user-api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['api-keys-usage-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['api-key-daily-usage'] });
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  async function copyKey(item: AdminApiKey) {
    setFormError(null);
    await Clipboard.setStringAsync(item.key || '');
    const copyId = String(item.id || item.key);
    setCopiedKey(copyId);
    setTimeout(() => setCopiedKey((current) => (current === copyId ? null : current)), 1400);
  }

  async function executeCcsImport(item: AdminApiKey, clientType: CcSwitchClientType) {
    setFormError(null);
    const serviceBaseUrl = getServiceBaseUrl();
    const platform = item.group?.platform || 'anthropic';
    const deeplink = buildCcSwitchImportDeeplink({
      apiKey: item.key || '',
      baseUrl: serviceBaseUrl,
      clientType,
      platform,
      providerName: 'Sub2API',
    });
    const copyId = `ccs-${item.id || item.key}`;

    try {
      await Linking.openURL(deeplink);
      setCopiedKey(copyId);
      setTimeout(() => setCopiedKey((current) => (current === copyId ? null : current)), 1400);
    } catch {
      await Clipboard.setStringAsync(deeplink);
      setCopiedKey(copyId);
      Alert.alert('导入 CCS', '未能直接打开 CCS，已复制导入链接。');
      setTimeout(() => setCopiedKey((current) => (current === copyId ? null : current)), 1800);
    }
  }

  function importCcsConfig(item: AdminApiKey) {
    const platform = item.group?.platform || 'anthropic';

    if (platform === 'antigravity') {
      Alert.alert('导入 CCS', '请选择要导入的客户端。', [
        { text: '取消', style: 'cancel' },
        { text: 'Claude Code', onPress: () => void executeCcsImport(item, 'claude') },
        { text: 'Gemini CLI', onPress: () => void executeCcsImport(item, 'gemini') },
      ]);
      return;
    }

    void executeCcsImport(item, platform === 'gemini' ? 'gemini' : 'claude');
  }

  function confirmDelete(item: AdminApiKey) {
    Alert.alert('删除 API Key', `确认删除 ${item.name || `Key #${item.id}`} 吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(item),
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
        refreshing={apiKeysQuery.isRefetching || usageQuery.isRefetching || dailyUsageQuery.isRefetching}
        onRefresh={() => {
          void apiKeysQuery.refetch();
          void usageQuery.refetch();
          void dailyUsageQuery.refetch();
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
                void dailyUsageQuery.refetch();
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
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
            <FilterButton
              label={selectedGroupLabel}
              active={groupFilter !== 'all'}
              onPress={() => setOpenFilterMenu((current) => (current === 'group' ? null : 'group'))}
            />
            <FilterButton
              label={selectedStatusLabel}
              active={statusFilter !== 'all'}
              onPress={() => setOpenFilterMenu((current) => (current === 'status' ? null : 'status'))}
            />
          </View>
          {openFilterMenu ? (
            <View style={{ backgroundColor: colors.mutedCard, borderColor: colors.border, borderRadius: 14, borderWidth: 1, gap: 8, marginTop: 10, padding: 8 }}>
              {(openFilterMenu === 'group' ? groupOptions : statusOptions).map((option) => {
                const selected = openFilterMenu === 'group' ? option.key === groupFilter : option.key === statusFilter;

                return (
                  <Pressable
                    key={option.key}
                    onPress={() => {
                      if (openFilterMenu === 'group') {
                        setGroupFilter(option.key);
                      } else {
                        setStatusFilter(option.key);
                      }
                      setOpenFilterMenu(null);
                    }}
                    style={{ backgroundColor: selected ? colors.successBg : 'transparent', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9 }}
                  >
                    <Text style={{ color: selected ? colors.success : colors.text, fontSize: 13, fontWeight: selected ? '800' : '600' }}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>

        {formMode ? (
          <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 14 }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>{formMode === 'create' ? '创建 API Key' : '编辑 API Key'}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
              {formMode === 'create' ? <Field label="用户 ID" value={formUserId} onChangeText={setFormUserId} placeholder="旧接口回退时可选" keyboardType="number-pad" /> : null}
              <Field label="名称" value={formName} onChangeText={setFormName} placeholder="例如：生产 Key" />
              <Field label="自定义 Key" value={formKey} onChangeText={setFormKey} placeholder={formMode === 'create' ? '留空则由后端生成' : '留空不修改'} />
              <Field label="分组 ID" value={formGroupId} onChangeText={setFormGroupId} placeholder="留空表示不绑定" keyboardType="number-pad" />
              {formMode === 'create' ? (
                <Field label="有效天数" value={formExpiresInDays} onChangeText={setFormExpiresInDays} placeholder="例如 30，留空不过期" keyboardType="number-pad" />
              ) : (
                <Field label="过期时间" value={formExpiresAt} onChangeText={setFormExpiresAt} placeholder="2026-12-31T23:59:59Z" />
              )}
            </View>
            {formMode === 'edit' ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                {[
                  { label: '启用', value: 'active' },
                  { label: '禁用', value: 'inactive' },
                ].map((option) => {
                  const selected = formStatus === option.value;

                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => setFormStatus(option.value)}
                      style={{
                        alignItems: 'center',
                        backgroundColor: selected ? colors.primary : colors.mutedCard,
                        borderColor: selected ? colors.primary : colors.border,
                        borderRadius: 12,
                        borderWidth: 1,
                        flex: 1,
                        paddingVertical: 10,
                      }}
                    >
                      <Text style={{ color: selected ? colors.primaryText : colors.badgeDefaultText, fontSize: 13, fontWeight: '800' }}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
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
                    updateMutation.mutate({ id: editingItem.id, userId: getApiKeyOwnerId(editingItem) });
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
          const ccsCopyId = `ccs-${item.id || item.key}`;
          const disabled = isDisabledStatus(item.status);
          const usage = usageByKey.get(item.id);
          const usageLastUsedAt = firstTextValue(usage, ['last_used_at', 'lastUsedAt']);
          const lastUsedAt = item.last_used_at || usageLastUsedAt;
          const dailyRows = dailyUsageByKey.get(item.id) ?? [];
          const todayKey = getLocalDateKey();
          const last30StartKey = getLast30DayStartKey();
          const dailyTodayCost = sumUsageCost(dailyRows, (dateKey) => dateKey === todayKey);
          const dailyLast30Cost = sumUsageCost(dailyRows, (dateKey) => Boolean(dateKey && dateKey >= last30StartKey && dateKey <= todayKey));
          const dashboardTodayCost = firstNumberValue(usage, ['today_actual_cost', 'todayActualCost', 'today_cost', 'todayCost']) ?? 0;
          const dashboardCost = firstNumberValue(usage, ['total_actual_cost', 'totalActualCost', 'total_cost', 'totalCost', 'actual_cost', 'actualCost']) ?? 0;
          const todayCost = dailyTodayCost > 0 ? dailyTodayCost : dashboardTodayCost;
          const last30Cost = dailyLast30Cost > 0 ? dailyLast30Cost : dashboardCost;

          return (
            <ListCard
              key={item.id || item.key}
              title={item.name || `Key #${item.id || '--'}`}
              meta={`分组 ${getGroupLabel(item)} · 创建 ${formatDisplayTime(item.created_at)}`}
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
                  <InfoTile label="API 密钥" value={maskKey(item.key)} />
                  <InfoTile label="分组" value={getGroupLabel(item)} />
                  <InfoTile label="今日用量" value={formatMoney(todayCost)} />
                  <InfoTile label="近30天用量" value={formatMoney(last30Cost)} />
                  <InfoTile label="速率限制" value={formatRateLimit(item)} />
                  <InfoTile label="过期时间" value={formatExpiry(item.expires_at)} tone={isExpired(item.expires_at) ? 'danger' : 'default'} />
                  <InfoTile label="状态" value={formatStatusLabel(item.status)} tone={disabled ? 'danger' : 'success'} />
                  <InfoTile label="上次使用时间" value={formatDisplayTime(lastUsedAt)} />
                  <InfoTile label="创建时间" value={formatDisplayTime(item.created_at)} />
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Pressable
                    style={{ backgroundColor: colors.mutedCard, borderRadius: 999, flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 9 }}
                    onPress={() => copyKey(item)}
                  >
                    <Copy color={copiedKey === copyId ? colors.success : colors.badgeDefaultText} size={13} />
                    <Text style={{ color: copiedKey === copyId ? colors.success : colors.badgeDefaultText, fontSize: 12, fontWeight: '800' }}>
                      {copiedKey === copyId ? '已复制' : '使用密钥'}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={{ backgroundColor: colors.mutedCard, borderRadius: 999, flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 9 }}
                    onPress={() => importCcsConfig(item)}
                  >
                    <FileCode2 color={copiedKey === ccsCopyId ? colors.success : colors.badgeDefaultText} size={13} />
                    <Text style={{ color: copiedKey === ccsCopyId ? colors.success : colors.badgeDefaultText, fontSize: 12, fontWeight: '800' }}>
                      {copiedKey === ccsCopyId ? '已复制' : '导入 CCS'}
                    </Text>
                  </Pressable>
                  {item.id ? (
                    <>
                      <Pressable
                        disabled={toggleMutation.isPending}
                        style={{ backgroundColor: colors.mutedCard, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', gap: 6 }}
                        onPress={() => toggleMutation.mutate(item)}
                      >
                        <Power color={disabled ? colors.success : colors.badgeDefaultText} size={13} />
                        <Text style={{ color: disabled ? colors.success : colors.badgeDefaultText, fontSize: 12, fontWeight: '800' }}>{disabled ? '启用' : '禁用'}</Text>
                      </Pressable>
                      <Pressable
                        style={{ backgroundColor: colors.mutedCard, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', gap: 6 }}
                        onPress={() => openEditForm(item)}
                      >
                        <Pencil color={colors.badgeDefaultText} size={13} />
                        <Text style={{ color: colors.badgeDefaultText, fontSize: 12, fontWeight: '800' }}>编辑</Text>
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
