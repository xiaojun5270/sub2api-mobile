import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { KeyRound, Pencil, Power, Search, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import type { Edge } from 'react-native-safe-area-context';

import { ListCard } from '@/src/components/list-card';
import { ScreenShell } from '@/src/components/screen-shell';
import { useDebouncedValue } from '@/src/hooks/use-debounced-value';
import { formatTokenValue } from '@/src/lib/formatters';
import { useAppTheme } from '@/src/lib/theme';
import { batchClearAccountErrors, batchRefreshAccounts, deleteAccount, getAccountTodayStats, listAccounts, setAccountSchedulable, testAccount, updateAccount } from '@/src/services/admin';
import type { AdminAccount } from '@/src/types/admin';

type AccountStatusFilter = 'all' | 'active' | 'paused' | 'error';
type UsageSort = 'usage-desc' | 'usage-asc';
type AccountVisualStatus = {
  filterKey: AccountStatusFilter;
  label: '正常' | '暂停' | '异常';
  badgeTone: 'success' | 'muted' | 'danger';
};

type AccountTodaySummary = {
  requests: number;
  tokens: number;
  cost: number;
};

function formatTime(value?: string | null) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function toOptionalNumber(raw: string) {
  if (!raw.trim()) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
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
    <View style={{ flex: 1, minWidth: 128 }}>
      <Text style={{ color: colors.subtext, fontSize: 11, marginBottom: 6 }}>{label}</Text>
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
          paddingVertical: 10,
        }}
      />
    </View>
  );
}

function getAccountError(account: AdminAccount) {
  return Boolean(account.status === 'error' || account.error_message);
}

function getAccountVisualStatus(account: AdminAccount): AccountVisualStatus {
  const normalizedStatus = `${account.status ?? ''}`.toLowerCase();
  const isPausedStatus = ['inactive', 'disabled', 'paused', 'stop', 'stopped'].includes(normalizedStatus);

  if (getAccountError(account)) {
    return { filterKey: 'error', label: '异常', badgeTone: 'danger' };
  }
  if (isPausedStatus || account.schedulable === false) {
    return { filterKey: 'paused', label: '暂停', badgeTone: 'muted' };
  }
  return { filterKey: 'active', label: '正常', badgeTone: 'success' };
}

type AccountsListScreenProps = {
  safeAreaEdges?: Edge[];
};

export function AccountsListScreen({ safeAreaEdges }: AccountsListScreenProps) {
  const colors = useAppTheme();
  const [searchText, setSearchText] = useState('');
  const [filter, setFilter] = useState<AccountStatusFilter>('all');
  const [usageSort, setUsageSort] = useState<UsageSort>('usage-desc');
  const [testingAccountId, setTestingAccountId] = useState<number | null>(null);
  const [testFeedbackByAccountId, setTestFeedbackByAccountId] = useState<Record<number, string>>({});
  const [togglingAccountId, setTogglingAccountId] = useState<number | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [editConcurrency, setEditConcurrency] = useState('');
  const [editRateMultiplier, setEditRateMultiplier] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const keyword = useDebouncedValue(searchText.trim(), 300);
  const queryClient = useQueryClient();

  const accountsQuery = useQuery({
    queryKey: ['accounts'],
    queryFn: () => listAccounts(),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ accountId, schedulable }: { accountId: number; schedulable: boolean }) =>
      setAccountSchedulable(accountId, schedulable),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  });

  const testMutation = useMutation({
    mutationFn: (accountId: number) => testAccount(accountId),
  });

  const accountEditMutation = useMutation({
    mutationFn: ({ accountId }: { accountId: number }) =>
      updateAccount(accountId, {
        name: editName.trim() || undefined,
        priority: toOptionalNumber(editPriority),
        concurrency: toOptionalNumber(editConcurrency),
        rate_multiplier: toOptionalNumber(editRateMultiplier),
        notes: editNotes.trim(),
      }),
    onSuccess: () => {
      setEditingAccountId(null);
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  const accountStatusMutation = useMutation({
    mutationFn: ({ account, enabled }: { account: AdminAccount; enabled: boolean }) =>
      updateAccount(account.id, {
        status: enabled ? 'active' : 'disabled',
        schedulable: enabled,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  });

  const accountDeleteMutation = useMutation({
    mutationFn: (accountId: number) => deleteAccount(accountId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  });

  const batchRefreshMutation = useMutation({
    mutationFn: (accountIds: number[]) => batchRefreshAccounts(accountIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  });

  const batchClearErrorMutation = useMutation({
    mutationFn: (accountIds: number[]) => batchClearAccountErrors(accountIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  });

  const items = accountsQuery.data?.items ?? [];
  const accountCostQueries = useQueries({
    queries: items.map((account) => ({
      queryKey: ['account-today-stats', account.id],
      queryFn: () => getAccountTodayStats(account.id),
      staleTime: 60_000,
    })),
  });

  const todayByAccountId = useMemo(() => {
    const next = new Map<number, AccountTodaySummary>();
    items.forEach((account, index) => {
      const result = accountCostQueries[index]?.data;
      const fromStatsCost = typeof result?.cost === 'number' && Number.isFinite(result.cost) ? result.cost : undefined;
      const fromExtra = typeof account.extra?.today_cost === 'number' ? account.extra.today_cost : undefined;
      const cost = fromStatsCost ?? fromExtra ?? 0;
      const requests = typeof result?.requests === 'number' && Number.isFinite(result.requests) ? result.requests : 0;
      const tokens = typeof result?.tokens === 'number' && Number.isFinite(result.tokens) ? result.tokens : 0;
      next.set(account.id, { requests, tokens, cost });
    });
    return next;
  }, [accountCostQueries, items]);

  const filteredItems = useMemo(() => {
    const normalizedKeyword = keyword.toLowerCase();
    const keywordMatched = normalizedKeyword
      ? items.filter((account) => {
          const haystack = [
            account.id,
            account.name,
            account.platform,
            account.type,
            account.status,
            account.groups?.map((group) => group.name).join(' '),
          ].filter(Boolean).join(' ').toLowerCase();

          return haystack.includes(normalizedKeyword);
        })
      : items;

    const statusMatched = keywordMatched.filter((account) => {
      const visualStatus = getAccountVisualStatus(account);
      if (filter === 'all') return true;
      if (filter === 'active') return visualStatus.filterKey === 'active';
      if (filter === 'paused') return visualStatus.filterKey === 'paused';
      if (filter === 'error') return visualStatus.filterKey === 'error';
      return true;
    });

    const sorted = [...statusMatched].sort((left, right) => {
      const requestsLeft = todayByAccountId.get(left.id)?.requests ?? 0;
      const requestsRight = todayByAccountId.get(right.id)?.requests ?? 0;
      if (requestsLeft === requestsRight) {
        const tokensLeft = todayByAccountId.get(left.id)?.tokens ?? 0;
        const tokensRight = todayByAccountId.get(right.id)?.tokens ?? 0;
        return tokensLeft - tokensRight;
      }
      if (usageSort === 'usage-asc') return requestsLeft - requestsRight;
      return requestsRight - requestsLeft;
    });

    return sorted;
  }, [filter, items, keyword, todayByAccountId, usageSort]);
  const errorMessage = accountsQuery.error instanceof Error ? accountsQuery.error.message : '';

  function confirmBatch(action: 'refresh' | 'clear-error') {
    const accountIds = filteredItems.map((item) => item.id);
    if (accountIds.length === 0) return;

    const title = action === 'refresh' ? '批量刷新账号' : '批量清除错误';
    const message = `确认对当前筛选的 ${accountIds.length} 个账号执行该操作吗？`;

    Alert.alert(title, message, [
      { text: '取消', style: 'cancel' },
      {
        text: '确认',
        onPress: () => {
          if (action === 'refresh') {
            batchRefreshMutation.mutate(accountIds);
          } else {
            batchClearErrorMutation.mutate(accountIds);
          }
        },
      },
    ]);
  }

  function startEditAccount(account: AdminAccount) {
    setEditingAccountId(account.id);
    setEditName(account.name || '');
    setEditPriority(account.priority !== undefined ? String(account.priority) : '');
    setEditConcurrency(account.concurrency !== undefined ? String(account.concurrency) : '');
    setEditRateMultiplier(account.rate_multiplier !== undefined ? String(account.rate_multiplier) : '');
    setEditNotes(account.notes || '');
  }

  function confirmDeleteAccount(account: AdminAccount) {
    Alert.alert('删除账号', `确认删除 ${account.name || `账号 #${account.id}`} 吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => accountDeleteMutation.mutate(account.id),
      },
    ]);
  }

  const summary = useMemo(() => {
    const total = items.length;
    const errors = items.filter((item) => getAccountVisualStatus(item).filterKey === 'error').length;
    const paused = items.filter((item) => getAccountVisualStatus(item).filterKey === 'paused').length;
    const active = items.filter((item) => getAccountVisualStatus(item).filterKey === 'active').length;
    return { total, active, paused, errors };
  }, [items]);

  const listHeader = useMemo(
    () => (
      <View className="pb-2">
        <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 10 }}>
          <View style={{ alignItems: 'center', backgroundColor: colors.mutedCard, borderRadius: 18, flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12 }}>
            <Search color={colors.subtext} size={18} />
            <TextInput
              defaultValue=""
              onChangeText={setSearchText}
              placeholder="搜索账号名称 / 平台"
              placeholderTextColor={colors.placeholder}
              style={{ color: colors.text, flex: 1, fontSize: 16, marginLeft: 12 }}
            />
          </View>

          <View className="mt-3 flex-row gap-2">
            {([
              ['all', `全部 ${summary.total}`],
              ['active', `正常 ${summary.active}`],
              ['paused', `暂停 ${summary.paused}`],
              ['error', `异常 ${summary.errors}`],
            ] as const).map(([key, label]) => {
              const active = filter === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setFilter(key)}
                  style={{ backgroundColor: active ? colors.primary : colors.mutedCard, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}
                >
                  <Text style={{ color: active ? colors.primaryText : colors.badgeDefaultText, fontSize: 12, fontWeight: '600' }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View className="mt-3 flex-row gap-2">
            {([
              ['usage-desc', '请求高→低'],
              ['usage-asc', '请求低→高'],
            ] as const).map(([key, label]) => {
              const active = usageSort === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setUsageSort(key)}
                  style={{ backgroundColor: active ? colors.dark : colors.mutedCard, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 12 }}
                >
                  <Text style={{ color: active ? colors.primaryText : colors.badgeDefaultText, fontSize: 12, fontWeight: '600' }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View className="mt-3 flex-row gap-2">
            <Pressable
              disabled={filteredItems.length === 0 || batchRefreshMutation.isPending}
              onPress={() => confirmBatch('refresh')}
              style={{ alignItems: 'center', backgroundColor: colors.primary, borderRadius: 999, flex: 1, opacity: filteredItems.length === 0 ? 0.6 : 1, paddingHorizontal: 12, paddingVertical: 11 }}
            >
              <Text style={{ color: colors.primaryText, fontSize: 12, fontWeight: '800' }}>
                {batchRefreshMutation.isPending ? '刷新中...' : '批量刷新'}
              </Text>
            </Pressable>
            <Pressable
              disabled={filteredItems.length === 0 || batchClearErrorMutation.isPending}
              onPress={() => confirmBatch('clear-error')}
              style={{ alignItems: 'center', backgroundColor: colors.mutedCard, borderRadius: 999, flex: 1, opacity: filteredItems.length === 0 ? 0.6 : 1, paddingHorizontal: 12, paddingVertical: 11 }}
            >
              <Text style={{ color: colors.badgeDefaultText, fontSize: 12, fontWeight: '800' }}>
                {batchClearErrorMutation.isPending ? '清理中...' : '批量清错'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    ),
    [batchClearErrorMutation.isPending, batchRefreshMutation.isPending, colors, filter, filteredItems, summary.active, summary.errors, summary.paused, summary.total, usageSort]
  );

  const renderItem = useCallback(
    ({ item: account }: { item: (typeof filteredItems)[number] }) => {
      const isError = getAccountError(account);
      const visualStatus = getAccountVisualStatus(account);
      const statusText = visualStatus.label;
      const groupsText = account.groups?.map((group) => group.name).filter(Boolean).slice(0, 3).join(' · ');
      const todayStats = todayByAccountId.get(account.id) ?? { requests: 0, tokens: 0, cost: 0 };
      const nextSchedulable = visualStatus.filterKey === 'paused';
      const toggleLabel = nextSchedulable ? '恢复' : '暂停';
      const statusDisabled = ['disabled', 'inactive', 'paused'].includes(`${account.status || ''}`.toLowerCase());
      const nextEnabled = statusDisabled;
      const testFeedback = testFeedbackByAccountId[account.id];
      const isTogglingCurrent = togglingAccountId === account.id && toggleMutation.isPending;
      const isTestingCurrent = testingAccountId === account.id && testMutation.isPending;
      const isEditing = editingAccountId === account.id;

      return (
        <Pressable onPress={() => router.push(`/accounts/${account.id}`)}>
          <ListCard
            title={account.name}
            meta={`#${account.id} · ${account.platform} · ${account.type}`}
            badge={statusText}
            badgeTone={visualStatus.badgeTone}
            icon={KeyRound}
          >
            <View className="gap-3">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  {account.schedulable && !isError ? <ShieldCheck color={colors.subtext} size={14} /> : <ShieldOff color={colors.subtext} size={14} />}
                  <Text style={{ color: colors.subtext, fontSize: 14 }}>状态：{statusText}</Text>
                </View>
                <Text style={{ color: colors.subtext, fontSize: 12 }}>最近使用 {formatTime(account.last_used_at || account.updated_at)}</Text>
              </View>

              <View className="flex-row gap-2">
                <View style={{ backgroundColor: colors.mutedCard, borderRadius: 14, flex: 1, paddingHorizontal: 12, paddingVertical: 12 }}>
                  <Text style={{ color: colors.subtext, fontSize: 11 }}>请求次数</Text>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 4 }}>{todayStats.requests}</Text>
                </View>
                <View style={{ backgroundColor: colors.mutedCard, borderRadius: 14, flex: 1, paddingHorizontal: 12, paddingVertical: 12 }}>
                  <Text style={{ color: colors.subtext, fontSize: 11 }}>消费金额</Text>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 4 }}>${todayStats.cost.toFixed(2)}</Text>
                </View>
                <View style={{ backgroundColor: colors.mutedCard, borderRadius: 14, flex: 1, paddingHorizontal: 12, paddingVertical: 12 }}>
                  <Text style={{ color: colors.subtext, fontSize: 11 }}>token消耗</Text>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 4 }}>{formatTokenValue(todayStats.tokens)}</Text>
                </View>
              </View>

              <Text style={{ color: colors.subtext, fontSize: 12 }}>
                优先级 {account.priority ?? 0} · 倍率 {(account.rate_multiplier ?? 1).toFixed(2)}x · 并发 {account.current_concurrency ?? 0}/{account.concurrency ?? '--'}
              </Text>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>
                调度 {(account.schedulable ?? true) ? '可调度' : '暂停'} · 代理 {account.proxy_id ? `#${account.proxy_id}` : '--'} · 更新 {formatTime(account.updated_at)}
              </Text>

              {groupsText ? <Text style={{ color: colors.subtext, fontSize: 12 }}>分组 {groupsText}</Text> : null}
              {account.rate_limit_reset_at ? <Text style={{ color: colors.subtext, fontSize: 12 }}>限流重置 {formatTime(account.rate_limit_reset_at)}</Text> : null}
              {account.created_at ? <Text style={{ color: colors.subtext, fontSize: 12 }}>创建时间 {formatTime(account.created_at)}</Text> : null}
              {account.error_message ? <Text style={{ color: colors.danger, fontSize: 12 }}>异常信息：{account.error_message}</Text> : null}

              {isEditing ? (
                <View style={{ backgroundColor: colors.mutedCard, borderRadius: 14, padding: 12 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    <Field label="名称" value={editName} onChangeText={setEditName} placeholder="账号名称" />
                    <Field label="优先级" value={editPriority} onChangeText={setEditPriority} placeholder="0" keyboardType="number-pad" />
                    <Field label="并发" value={editConcurrency} onChangeText={setEditConcurrency} placeholder="留空不改" keyboardType="number-pad" />
                    <Field label="倍率" value={editRateMultiplier} onChangeText={setEditRateMultiplier} placeholder="1" keyboardType="decimal-pad" />
                    <Field label="备注" value={editNotes} onChangeText={setEditNotes} placeholder="备注" />
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                    <Pressable
                      disabled={accountEditMutation.isPending}
                      onPress={(event) => {
                        event.stopPropagation();
                        accountEditMutation.mutate({ accountId: account.id });
                      }}
                      style={{ alignItems: 'center', backgroundColor: colors.primary, borderRadius: 12, flex: 1, paddingVertical: 11 }}
                    >
                      <Text style={{ color: colors.primaryText, fontWeight: '800' }}>{accountEditMutation.isPending ? '保存中...' : '保存'}</Text>
                    </Pressable>
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        setEditingAccountId(null);
                      }}
                      style={{ alignItems: 'center', backgroundColor: colors.muted, borderRadius: 12, flex: 1, paddingVertical: 11 }}
                    >
                      <Text style={{ color: colors.badgeDefaultText, fontWeight: '800' }}>取消</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Pressable
                  style={{ backgroundColor: colors.dark, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 }}
                  disabled={isTestingCurrent}
                  onPress={(event) => {
                    event.stopPropagation();
                    setTestingAccountId(account.id);
                    testMutation.mutate(account.id, {
                      onSuccess: () => {
                        setTestFeedbackByAccountId((current) => ({ ...current, [account.id]: '测试成功' }));
                      },
                      onError: (error) => {
                        const message = error instanceof Error && error.message ? error.message : '测试失败';
                        setTestFeedbackByAccountId((current) => ({ ...current, [account.id]: message }));
                      },
                      onSettled: () => {
                        setTestingAccountId((current) => (current === account.id ? null : current));
                      },
                    });
                  }}
                >
                  <Text style={{ color: colors.primaryText, fontSize: 12, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' }}>{isTestingCurrent ? '测试中...' : '测试'}</Text>
                </Pressable>
                <Pressable
                  style={{ backgroundColor: colors.mutedCard, borderRadius: 999, flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingVertical: 8 }}
                  onPress={(event) => {
                    event.stopPropagation();
                    startEditAccount(account);
                  }}
                >
                  <Pencil color={colors.badgeDefaultText} size={13} />
                  <Text style={{ color: colors.badgeDefaultText, fontSize: 12, fontWeight: '800' }}>编辑</Text>
                </Pressable>
                <Pressable
                  disabled={accountStatusMutation.isPending}
                  style={{ backgroundColor: colors.mutedCard, borderRadius: 999, flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingVertical: 8 }}
                  onPress={(event) => {
                    event.stopPropagation();
                    accountStatusMutation.mutate({ account, enabled: nextEnabled });
                  }}
                >
                  <Power color={nextEnabled ? colors.success : colors.badgeDefaultText} size={13} />
                  <Text style={{ color: nextEnabled ? colors.success : colors.badgeDefaultText, fontSize: 12, fontWeight: '800' }}>{nextEnabled ? '启用' : '禁用'}</Text>
                </Pressable>
                <Pressable
                  style={{ backgroundColor: colors.mutedCard, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 }}
                  disabled={isTogglingCurrent}
                  onPress={(event) => {
                    event.stopPropagation();
                    setTogglingAccountId(account.id);
                    toggleMutation.mutate({
                      accountId: account.id,
                      schedulable: nextSchedulable,
                    }, {
                      onSettled: () => {
                        setTogglingAccountId((current) => (current === account.id ? null : current));
                      },
                    });
                  }}
                >
                  <Text style={{ color: colors.badgeDefaultText, fontSize: 12, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' }}>{isTogglingCurrent ? '处理中...' : toggleLabel}</Text>
                </Pressable>
                <Pressable
                  disabled={accountDeleteMutation.isPending}
                  style={{ backgroundColor: colors.errorBg, borderRadius: 999, flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingVertical: 8 }}
                  onPress={(event) => {
                    event.stopPropagation();
                    confirmDeleteAccount(account);
                  }}
                >
                  <Trash2 color={colors.errorText} size={13} />
                  <Text style={{ color: colors.errorText, fontSize: 12, fontWeight: '800' }}>删除</Text>
                </Pressable>
              </View>

              {testFeedback ? <Text style={{ color: colors.success, fontSize: 12 }}>测试结果：{testFeedback}</Text> : null}
            </View>
          </ListCard>
        </Pressable>
      );
    },
    [accountDeleteMutation, accountEditMutation, accountStatusMutation, colors, editConcurrency, editName, editNotes, editPriority, editRateMultiplier, editingAccountId, testFeedbackByAccountId, testMutation, testingAccountId, todayByAccountId, toggleMutation, togglingAccountId]
  );

  const emptyState = useMemo(
    () => <ListCard title="暂无账号" meta={errorMessage || '连上后这里会展示账号列表。'} icon={KeyRound} />,
    [errorMessage]
  );

  return (
    <ScreenShell
      title="账号清单"
      subtitle="查看名称、平台&类型、请求次数、消费金额、token消耗，并支持筛选与排序。"
      icon={KeyRound}
      titleAside={(
        <Text style={{ color: colors.subtext, fontSize: 11 }}>更接近网页后台的账号视图。</Text>
      )}
      variant="minimal"
      scroll={false}
      safeAreaEdges={safeAreaEdges}
      bottomInsetClassName="pb-6"
      contentGapClassName="mt-2 gap-2"
    >
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 12, flexGrow: 1 }}
        data={filteredItems}
        renderItem={renderItem}
        keyExtractor={(item) => `${item.id}`}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={accountsQuery.isRefetching} onRefresh={() => void accountsQuery.refetch()} tintColor={colors.primary} />}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyState}
        ItemSeparatorComponent={() => <View className="h-4" />}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
      />
    </ScreenShell>
  );
}
