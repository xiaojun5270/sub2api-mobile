import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderKanban, Gauge, Layers3, Pencil, Plus, Power, RefreshCw, Search, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

import { ListCard } from '@/src/components/list-card';
import { ScreenShell } from '@/src/components/screen-shell';
import { useDebouncedValue } from '@/src/hooks/use-debounced-value';
import { formatCompactNumber } from '@/src/lib/formatters';
import { useAppTheme } from '@/src/lib/theme';
import {
  createGroup,
  deleteGroup,
  getGroupCapacitySummary,
  getGroupUsageSummary,
  listGroups,
  updateGroup,
} from '@/src/services/admin';
import type { AdminGroup, GroupCapacitySummary, GroupRequest, GroupUsageSummary } from '@/src/types/admin';

type GroupFormMode = 'create' | 'edit' | null;
type ExclusiveFilter = 'all' | 'public' | 'exclusive';

const PLATFORM_OPTIONS = ['all', 'anthropic', 'openai', 'gemini', 'antigravity', 'grok'];
const STATUS_OPTIONS = [
  { label: '全部状态', value: 'all' },
  { label: '启用', value: 'active' },
  { label: '停用', value: 'inactive' },
];
const EXCLUSIVE_OPTIONS: Array<{ label: string; value: ExclusiveFilter }> = [
  { label: '全部类型', value: 'all' },
  { label: '共享', value: 'public' },
  { label: '独占', value: 'exclusive' },
];

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return '操作失败，请稍后重试。';
}

function toOptionalNumber(raw: string, fallback?: number) {
  if (!raw.trim()) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function toNullableNumber(raw: string) {
  if (!raw.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function toScopeList(raw: string) {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatMoney(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '$0.00';
  return `$${value.toFixed(2)}`;
}

function formatNumber(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '0';
  return formatCompactNumber(value);
}

function isInactiveStatus(status?: string) {
  return ['inactive', 'disabled', 'paused'].includes(`${status || ''}`.toLowerCase());
}

function usageMap(rows?: GroupUsageSummary[]) {
  const map = new Map<number, GroupUsageSummary>();
  rows?.forEach((item) => {
    if (typeof item.group_id === 'number') map.set(item.group_id, item);
  });
  return map;
}

function capacityMap(rows?: GroupCapacitySummary[]) {
  const map = new Map<number, GroupCapacitySummary>();
  rows?.forEach((item) => {
    if (typeof item.group_id === 'number') map.set(item.group_id, item);
  });
  return map;
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
      <Text style={{ color: colors.subtext, fontSize: 11, marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        keyboardType={keyboardType}
        multiline={multiline}
        style={{
          backgroundColor: colors.muted,
          borderColor: colors.border,
          borderRadius: 12,
          borderWidth: 1,
          color: colors.text,
          minHeight: multiline ? 76 : undefined,
          paddingHorizontal: 12,
          paddingVertical: 10,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}

function ToggleChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const colors = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      style={{
        alignItems: 'center',
        backgroundColor: active ? colors.primary : colors.mutedCard,
        borderColor: active ? colors.primary : colors.border,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: 'row',
        justifyContent: 'center',
        minWidth: 76,
        paddingHorizontal: 12,
        paddingVertical: 8,
      }}
    >
      <Text style={{ color: active ? colors.primaryText : colors.badgeDefaultText, fontSize: 12, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
}

function MetricTile({ label, value, icon: Icon, tone = 'default' }: { label: string; value: string; icon: LucideIcon; tone?: 'default' | 'success' | 'danger' }) {
  const colors = useAppTheme();
  const toneColor = tone === 'success' ? colors.success : tone === 'danger' ? colors.danger : colors.primary;

  return (
    <View style={{ backgroundColor: colors.mutedCard, borderColor: colors.border, borderRadius: 14, borderWidth: 1, flex: 1, minWidth: 118, padding: 10 }}>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 7 }}>
        <Icon color={toneColor} size={13} />
        <Text numberOfLines={1} style={{ color: colors.subtext, flex: 1, fontSize: 11, fontWeight: '700' }}>{label}</Text>
      </View>
      <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 6 }}>{value}</Text>
    </View>
  );
}

function ActionChip({
  label,
  icon: Icon,
  tone = 'default',
  disabled,
  onPress,
}: {
  label: string;
  icon: LucideIcon;
  tone?: 'default' | 'success' | 'danger';
  disabled?: boolean;
  onPress: () => void;
}) {
  const colors = useAppTheme();
  const background = tone === 'danger' ? colors.errorBg : tone === 'success' ? colors.successBg : colors.mutedCard;
  const foreground = tone === 'danger' ? colors.errorText : tone === 'success' ? colors.success : colors.badgeDefaultText;

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={{
        alignItems: 'center',
        backgroundColor: background,
        borderRadius: 999,
        flexDirection: 'row',
        gap: 6,
        opacity: disabled ? 0.55 : 1,
        paddingHorizontal: 12,
        paddingVertical: 8,
      }}
    >
      <Icon color={foreground} size={13} />
      <Text style={{ color: foreground, fontSize: 12, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
}

export default function GroupsScreen() {
  const colors = useAppTheme();
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState('');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [exclusiveFilter, setExclusiveFilter] = useState<ExclusiveFilter>('all');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [formMode, setFormMode] = useState<GroupFormMode>(null);
  const [editingGroup, setEditingGroup] = useState<AdminGroup | null>(null);
  const [formError, setFormError] = useState('');
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPlatform, setFormPlatform] = useState('anthropic');
  const [formRateMultiplier, setFormRateMultiplier] = useState('1');
  const [formStatus, setFormStatus] = useState('active');
  const [formSubscriptionType, setFormSubscriptionType] = useState('standard');
  const [formDailyLimit, setFormDailyLimit] = useState('');
  const [formWeeklyLimit, setFormWeeklyLimit] = useState('');
  const [formMonthlyLimit, setFormMonthlyLimit] = useState('');
  const [formRpmLimit, setFormRpmLimit] = useState('0');
  const [formImageRateMultiplier, setFormImageRateMultiplier] = useState('1');
  const [formPeakStart, setFormPeakStart] = useState('');
  const [formPeakEnd, setFormPeakEnd] = useState('');
  const [formPeakRateMultiplier, setFormPeakRateMultiplier] = useState('1');
  const [formFallbackGroupId, setFormFallbackGroupId] = useState('');
  const [formFallbackInvalidGroupId, setFormFallbackInvalidGroupId] = useState('');
  const [formSupportedScopes, setFormSupportedScopes] = useState('claude,gemini_text,gemini_image');
  const [formExclusive, setFormExclusive] = useState(false);
  const [formAllowImage, setFormAllowImage] = useState(false);
  const [formImageIndependent, setFormImageIndependent] = useState(false);
  const [formPeakEnabled, setFormPeakEnabled] = useState(false);
  const [formClaudeOnly, setFormClaudeOnly] = useState(false);
  const [formAllowMessagesDispatch, setFormAllowMessagesDispatch] = useState(false);
  const [formRequireOauthOnly, setFormRequireOauthOnly] = useState(false);
  const [formRequirePrivacySet, setFormRequirePrivacySet] = useState(false);
  const [formModelRoutingEnabled, setFormModelRoutingEnabled] = useState(false);
  const [formMcpXmlInject, setFormMcpXmlInject] = useState(true);
  const keyword = useDebouncedValue(searchText.trim(), 300);

  const groupsQuery = useQuery({
    queryKey: ['groups', keyword, platformFilter, statusFilter, exclusiveFilter, sortOrder],
    queryFn: () => listGroups({
      page: 1,
      page_size: 50,
      search: keyword,
      platform: platformFilter === 'all' ? undefined : platformFilter,
      status: statusFilter === 'all' ? undefined : statusFilter,
      is_exclusive: exclusiveFilter === 'all' ? null : exclusiveFilter === 'exclusive',
      sort_by: 'sort_order',
      sort_order: sortOrder,
    }),
  });
  const usageQuery = useQuery({
    queryKey: ['groups-usage-summary'],
    queryFn: () => getGroupUsageSummary(),
    staleTime: 60_000,
  });
  const capacityQuery = useQuery({
    queryKey: ['groups-capacity-summary'],
    queryFn: getGroupCapacitySummary,
    staleTime: 30_000,
  });

  const items = groupsQuery.data?.items ?? [];
  const usageByGroupId = useMemo(() => usageMap(usageQuery.data), [usageQuery.data]);
  const capacityByGroupId = useMemo(() => capacityMap(capacityQuery.data), [capacityQuery.data]);
  const activeCount = items.filter((item) => !isInactiveStatus(item.status)).length;
  const inactiveCount = items.length - activeCount;

  function resetForm() {
    setFormMode(null);
    setEditingGroup(null);
    setFormError('');
    setFormName('');
    setFormDescription('');
    setFormPlatform('anthropic');
    setFormRateMultiplier('1');
    setFormStatus('active');
    setFormSubscriptionType('standard');
    setFormDailyLimit('');
    setFormWeeklyLimit('');
    setFormMonthlyLimit('');
    setFormRpmLimit('0');
    setFormImageRateMultiplier('1');
    setFormPeakStart('');
    setFormPeakEnd('');
    setFormPeakRateMultiplier('1');
    setFormFallbackGroupId('');
    setFormFallbackInvalidGroupId('');
    setFormSupportedScopes('claude,gemini_text,gemini_image');
    setFormExclusive(false);
    setFormAllowImage(false);
    setFormImageIndependent(false);
    setFormPeakEnabled(false);
    setFormClaudeOnly(false);
    setFormAllowMessagesDispatch(false);
    setFormRequireOauthOnly(false);
    setFormRequirePrivacySet(false);
    setFormModelRoutingEnabled(false);
    setFormMcpXmlInject(true);
  }

  function openCreateForm() {
    resetForm();
    setFormMode('create');
  }

  function openEditForm(group: AdminGroup) {
    setEditingGroup(group);
    setFormMode('edit');
    setFormError('');
    setFormName(group.name || '');
    setFormDescription(group.description || '');
    setFormPlatform(group.platform || 'anthropic');
    setFormRateMultiplier(group.rate_multiplier !== undefined ? String(group.rate_multiplier) : '1');
    setFormStatus(group.status || 'active');
    setFormSubscriptionType(group.subscription_type || 'standard');
    setFormDailyLimit(group.daily_limit_usd !== undefined && group.daily_limit_usd !== null ? String(group.daily_limit_usd) : '');
    setFormWeeklyLimit(group.weekly_limit_usd !== undefined && group.weekly_limit_usd !== null ? String(group.weekly_limit_usd) : '');
    setFormMonthlyLimit(group.monthly_limit_usd !== undefined && group.monthly_limit_usd !== null ? String(group.monthly_limit_usd) : '');
    setFormRpmLimit(group.rpm_limit !== undefined && group.rpm_limit !== null ? String(group.rpm_limit) : '0');
    setFormImageRateMultiplier(group.image_rate_multiplier !== undefined && group.image_rate_multiplier !== null ? String(group.image_rate_multiplier) : '1');
    setFormPeakStart(group.peak_start || '');
    setFormPeakEnd(group.peak_end || '');
    setFormPeakRateMultiplier(group.peak_rate_multiplier !== undefined && group.peak_rate_multiplier !== null ? String(group.peak_rate_multiplier) : '1');
    setFormFallbackGroupId(group.fallback_group_id ? String(group.fallback_group_id) : '');
    setFormFallbackInvalidGroupId(group.fallback_group_id_on_invalid_request ? String(group.fallback_group_id_on_invalid_request) : '');
    setFormSupportedScopes(Array.isArray(group.supported_model_scopes) ? group.supported_model_scopes.join(',') : 'claude,gemini_text,gemini_image');
    setFormExclusive(Boolean(group.is_exclusive));
    setFormAllowImage(Boolean(group.allow_image_generation));
    setFormImageIndependent(Boolean(group.image_rate_independent));
    setFormPeakEnabled(Boolean(group.peak_rate_enabled));
    setFormClaudeOnly(Boolean(group.claude_code_only));
    setFormAllowMessagesDispatch(Boolean(group.allow_messages_dispatch));
    setFormRequireOauthOnly(Boolean(group.require_oauth_only));
    setFormRequirePrivacySet(Boolean(group.require_privacy_set));
    setFormModelRoutingEnabled(Boolean(group.model_routing_enabled));
    setFormMcpXmlInject(group.mcp_xml_inject !== false);
  }

  function buildPayload(includeStatus: boolean): GroupRequest {
    const name = formName.trim();
    if (!name) throw new Error('请填写分组名称');

    return {
      name,
      description: formDescription.trim() || null,
      platform: formPlatform,
      rate_multiplier: toOptionalNumber(formRateMultiplier, 1),
      is_exclusive: formExclusive,
      ...(includeStatus ? { status: formStatus || 'active' } : {}),
      subscription_type: formSubscriptionType || 'standard',
      daily_limit_usd: toNullableNumber(formDailyLimit),
      weekly_limit_usd: toNullableNumber(formWeeklyLimit),
      monthly_limit_usd: toNullableNumber(formMonthlyLimit),
      allow_image_generation: formAllowImage,
      image_rate_independent: formImageIndependent,
      image_rate_multiplier: toOptionalNumber(formImageRateMultiplier, 1),
      peak_rate_enabled: formPeakEnabled,
      peak_start: formPeakStart.trim(),
      peak_end: formPeakEnd.trim(),
      peak_rate_multiplier: toOptionalNumber(formPeakRateMultiplier, 1),
      claude_code_only: formClaudeOnly,
      fallback_group_id: formMode === 'edit' ? toNullableNumber(formFallbackGroupId) ?? 0 : toNullableNumber(formFallbackGroupId),
      fallback_group_id_on_invalid_request: formMode === 'edit' ? toNullableNumber(formFallbackInvalidGroupId) ?? 0 : toNullableNumber(formFallbackInvalidGroupId),
      allow_messages_dispatch: formAllowMessagesDispatch,
      require_oauth_only: formRequireOauthOnly,
      require_privacy_set: formRequirePrivacySet,
      model_routing_enabled: formModelRoutingEnabled,
      mcp_xml_inject: formMcpXmlInject,
      supported_model_scopes: toScopeList(formSupportedScopes),
      rpm_limit: toOptionalNumber(formRpmLimit, 0),
    };
  }

  const invalidateGroups = () => {
    queryClient.invalidateQueries({ queryKey: ['groups'] });
    queryClient.invalidateQueries({ queryKey: ['groups-usage-summary'] });
    queryClient.invalidateQueries({ queryKey: ['groups-capacity-summary'] });
  };

  const createMutation = useMutation({
    mutationFn: () => createGroup(buildPayload(false)),
    onSuccess: () => {
      resetForm();
      invalidateGroups();
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: (groupId: number) => updateGroup(groupId, buildPayload(true)),
    onSuccess: () => {
      resetForm();
      invalidateGroups();
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const toggleMutation = useMutation({
    mutationFn: (group: AdminGroup) => updateGroup(group.id, { status: isInactiveStatus(group.status) ? 'active' : 'inactive' }),
    onSuccess: invalidateGroups,
  });

  const deleteMutation = useMutation({
    mutationFn: (groupId: number) => deleteGroup(groupId),
    onSuccess: invalidateGroups,
  });

  function confirmDelete(group: AdminGroup) {
    const subscriptionHint = group.subscription_type === 'subscription' ? '该分组关联订阅限制，删除前请确认订阅影响。' : '删除后关联 API Key / 账号可能会失去分组归属。';
    Alert.alert('删除分组', `确认删除 ${group.name} 吗？\n${subscriptionHint}`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(group.id),
      },
    ]);
  }

  return (
    <ScreenShell
      title="分组管理"
      subtitle="分组列表、用量容量、创建编辑、启停和删除。"
      icon={FolderKanban}
      titleAside={<Text style={{ color: colors.subtext, fontSize: 11 }}>按文档接口接入</Text>}
      variant="minimal"
      refreshing={groupsQuery.isRefetching || usageQuery.isRefetching || capacityQuery.isRefetching}
      onRefresh={() => {
        void groupsQuery.refetch();
        void usageQuery.refetch();
        void capacityQuery.refetch();
      }}
      bottomInsetClassName="pb-28"
      contentGapClassName="mt-2 gap-3"
    >
      <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, gap: 10, padding: 12 }}>
        <View style={{ alignItems: 'center', backgroundColor: colors.mutedCard, borderColor: colors.border, borderRadius: 16, borderWidth: 1, flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10 }}>
          <Search color={colors.primary} size={17} />
          <TextInput
            defaultValue=""
            onChangeText={setSearchText}
            placeholder="搜索分组名称"
            placeholderTextColor={colors.placeholder}
            style={{ color: colors.text, flex: 1, fontSize: 15, marginLeft: 10 }}
          />
          <Pressable onPress={openCreateForm} style={{ alignItems: 'center', backgroundColor: colors.primary, borderRadius: 999, flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 7 }}>
            <Plus color={colors.primaryText} size={13} />
            <Text style={{ color: colors.primaryText, fontSize: 12, fontWeight: '800' }}>新建</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {PLATFORM_OPTIONS.map((item) => (
            <ToggleChip key={item} label={item === 'all' ? '全部平台' : item} active={platformFilter === item} onPress={() => setPlatformFilter(item)} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {STATUS_OPTIONS.map((item) => (
            <ToggleChip key={item.value} label={item.label} active={statusFilter === item.value} onPress={() => setStatusFilter(item.value)} />
          ))}
          {EXCLUSIVE_OPTIONS.map((item) => (
            <ToggleChip key={item.value} label={item.label} active={exclusiveFilter === item.value} onPress={() => setExclusiveFilter(item.value)} />
          ))}
          <ToggleChip label={sortOrder === 'asc' ? '排序升序' : '排序降序'} active onPress={() => setSortOrder((current) => current === 'asc' ? 'desc' : 'asc')} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <MetricTile label="当前分组" value={formatNumber(groupsQuery.data?.total ?? items.length)} icon={FolderKanban} />
        <MetricTile label="启用" value={formatNumber(activeCount)} icon={ShieldCheck} tone="success" />
        <MetricTile label="停用" value={formatNumber(inactiveCount)} icon={ShieldOff} tone={inactiveCount > 0 ? 'danger' : 'default'} />
      </View>

      {formMode ? (
        <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 14 }}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>{formMode === 'create' ? '新建分组' : `编辑 ${editingGroup?.name ?? ''}`}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
            <Field label="名称" value={formName} onChangeText={setFormName} placeholder="例如：生产 Anthropic" />
            <Field label="描述" value={formDescription} onChangeText={setFormDescription} placeholder="分组说明" />
            <Field label="平台" value={formPlatform} onChangeText={setFormPlatform} placeholder="anthropic/openai/gemini" />
            <Field label="倍率" value={formRateMultiplier} onChangeText={setFormRateMultiplier} placeholder="1" keyboardType="decimal-pad" />
            <Field label="订阅类型" value={formSubscriptionType} onChangeText={setFormSubscriptionType} placeholder="standard/subscription" />
            <Field label="RPM 上限" value={formRpmLimit} onChangeText={setFormRpmLimit} placeholder="0 表示不限" keyboardType="number-pad" />
            <Field label="日限额 USD" value={formDailyLimit} onChangeText={setFormDailyLimit} placeholder="留空不限" keyboardType="decimal-pad" />
            <Field label="周限额 USD" value={formWeeklyLimit} onChangeText={setFormWeeklyLimit} placeholder="留空不限" keyboardType="decimal-pad" />
            <Field label="月限额 USD" value={formMonthlyLimit} onChangeText={setFormMonthlyLimit} placeholder="留空不限" keyboardType="decimal-pad" />
            <Field label="图片倍率" value={formImageRateMultiplier} onChangeText={setFormImageRateMultiplier} placeholder="1" keyboardType="decimal-pad" />
            <Field label="高峰开始" value={formPeakStart} onChangeText={setFormPeakStart} placeholder="HH:mm" />
            <Field label="高峰结束" value={formPeakEnd} onChangeText={setFormPeakEnd} placeholder="HH:mm" />
            <Field label="高峰倍率" value={formPeakRateMultiplier} onChangeText={setFormPeakRateMultiplier} placeholder="1" keyboardType="decimal-pad" />
            <Field label="兜底分组 ID" value={formFallbackGroupId} onChangeText={setFormFallbackGroupId} placeholder="留空清除" keyboardType="number-pad" />
            <Field label="无效请求兜底 ID" value={formFallbackInvalidGroupId} onChangeText={setFormFallbackInvalidGroupId} placeholder="留空清除" keyboardType="number-pad" />
            <Field label="模型范围" value={formSupportedScopes} onChangeText={setFormSupportedScopes} placeholder="claude,gemini_text" />
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {formMode === 'edit' ? (
              <>
                <ToggleChip label="启用" active={formStatus === 'active'} onPress={() => setFormStatus('active')} />
                <ToggleChip label="停用" active={formStatus === 'inactive'} onPress={() => setFormStatus('inactive')} />
              </>
            ) : null}
            <ToggleChip label="独占分组" active={formExclusive} onPress={() => setFormExclusive((value) => !value)} />
            <ToggleChip label="图片生成" active={formAllowImage} onPress={() => setFormAllowImage((value) => !value)} />
            <ToggleChip label="图片独立倍率" active={formImageIndependent} onPress={() => setFormImageIndependent((value) => !value)} />
            <ToggleChip label="高峰倍率" active={formPeakEnabled} onPress={() => setFormPeakEnabled((value) => !value)} />
            <ToggleChip label="仅 Claude Code" active={formClaudeOnly} onPress={() => setFormClaudeOnly((value) => !value)} />
            <ToggleChip label="Messages Dispatch" active={formAllowMessagesDispatch} onPress={() => setFormAllowMessagesDispatch((value) => !value)} />
            <ToggleChip label="仅 OAuth" active={formRequireOauthOnly} onPress={() => setFormRequireOauthOnly((value) => !value)} />
            <ToggleChip label="要求隐私" active={formRequirePrivacySet} onPress={() => setFormRequirePrivacySet((value) => !value)} />
            <ToggleChip label="模型路由" active={formModelRoutingEnabled} onPress={() => setFormModelRoutingEnabled((value) => !value)} />
            <ToggleChip label="MCP XML" active={formMcpXmlInject} onPress={() => setFormMcpXmlInject((value) => !value)} />
          </View>

          {formError ? (
            <View style={{ backgroundColor: colors.errorBg, borderRadius: 12, marginTop: 12, padding: 12 }}>
              <Text style={{ color: colors.errorText, fontSize: 13 }}>{formError}</Text>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Pressable
              disabled={createMutation.isPending || updateMutation.isPending}
              onPress={() => {
                setFormError('');
                if (formMode === 'create') {
                  createMutation.mutate();
                  return;
                }
                if (editingGroup) updateMutation.mutate(editingGroup.id);
              }}
              style={{ alignItems: 'center', backgroundColor: colors.primary, borderRadius: 12, flex: 1, paddingVertical: 12 }}
            >
              <Text style={{ color: colors.primaryText, fontWeight: '800' }}>{createMutation.isPending || updateMutation.isPending ? '保存中...' : '保存'}</Text>
            </Pressable>
            <Pressable onPress={resetForm} style={{ alignItems: 'center', backgroundColor: colors.mutedCard, borderRadius: 12, flex: 1, paddingVertical: 12 }}>
              <Text style={{ color: colors.badgeDefaultText, fontWeight: '800' }}>取消</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {groupsQuery.error ? (
        <View style={{ backgroundColor: colors.errorBg, borderRadius: 14, padding: 14 }}>
          <Text style={{ color: colors.errorText, fontWeight: '800' }}>分组加载失败</Text>
          <Text style={{ color: colors.errorText, fontSize: 13, lineHeight: 20, marginTop: 6 }}>{getErrorMessage(groupsQuery.error)}</Text>
        </View>
      ) : null}

      {groupsQuery.isLoading ? <ListCard title="正在加载分组" meta="请稍候..." icon={FolderKanban} /> : null}
      {!groupsQuery.isLoading && !groupsQuery.error && items.length === 0 ? (
        <ListCard title="暂无分组" meta="换个筛选条件，或新建第一个分组。" icon={FolderKanban} />
      ) : null}

      <View style={{ gap: 10 }}>
        {items.map((group) => {
          const usage = usageByGroupId.get(group.id);
          const capacity = capacityByGroupId.get(group.id);
          const disabled = isInactiveStatus(group.status);
          const activeAccounts = group.active_account_count ?? group.account_count ?? 0;
          const limitedAccounts = group.rate_limited_account_count ?? 0;

          return (
            <ListCard
              key={group.id}
              title={group.name}
              meta={`#${group.id} · ${group.platform || '--'} · 倍率 ${group.rate_multiplier ?? 1}x`}
              badge={disabled ? 'inactive' : 'active'}
              badgeTone={disabled ? 'muted' : 'success'}
              icon={FolderKanban}
            >
              <View style={{ gap: 10 }}>
                {group.description ? <Text style={{ color: colors.subtext, fontSize: 12, lineHeight: 18 }}>{group.description}</Text> : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <MetricTile label="今日用量" value={formatMoney(usage?.today_cost)} icon={Gauge} tone="success" />
                  <MetricTile label="累计用量" value={formatMoney(usage?.total_cost)} icon={Gauge} />
                  <MetricTile label="账号" value={`${formatNumber(activeAccounts)} / 限流 ${formatNumber(limitedAccounts)}`} icon={Layers3} />
                  <MetricTile label="并发" value={`${formatNumber(capacity?.concurrency_used)} / ${formatNumber(capacity?.concurrency_max)}`} icon={RefreshCw} />
                  <MetricTile label="会话" value={`${formatNumber(capacity?.sessions_used)} / ${formatNumber(capacity?.sessions_max)}`} icon={Layers3} />
                  <MetricTile label="RPM" value={`${formatNumber(capacity?.rpm_used)} / ${formatNumber(capacity?.rpm_max ?? group.rpm_limit ?? 0)}`} icon={Gauge} />
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <ActionChip label="编辑" icon={Pencil} onPress={() => openEditForm(group)} />
                  <ActionChip
                    label={disabled ? '启用' : '停用'}
                    icon={Power}
                    tone={disabled ? 'success' : 'default'}
                    disabled={toggleMutation.isPending}
                    onPress={() => toggleMutation.mutate(group)}
                  />
                  <ActionChip
                    label="删除"
                    icon={Trash2}
                    tone="danger"
                    disabled={deleteMutation.isPending}
                    onPress={() => confirmDelete(group)}
                  />
                </View>
              </View>
            </ListCard>
          );
        })}
      </View>
    </ScreenShell>
  );
}
