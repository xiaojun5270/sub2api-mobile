import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Stack } from 'expo-router';
import { KeyRound, Pencil, Plus, Search, Trash2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

import { ListCard } from '@/src/components/list-card';
import { ScreenShell } from '@/src/components/screen-shell';
import { useDebouncedValue } from '@/src/hooks/use-debounced-value';
import { formatDisplayTime } from '@/src/lib/formatters';
import { useAppTheme } from '@/src/lib/theme';
import { createUserApiKey, deleteAdminApiKey, searchAdminApiKeys, updateAdminApiKey } from '@/src/services/admin';
import type { AdminApiKey, PaginatedData } from '@/src/types/admin';

type ApiKeySearchResult = PaginatedData<AdminApiKey> | AdminApiKey[] | { items?: AdminApiKey[]; api_keys?: AdminApiKey[] };

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return '操作失败，请稍后重试。';
}

function toNumber(raw: string) {
  if (!raw.trim()) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
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
  return [];
}

function maskKey(value?: string) {
  if (!value) return '--';
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
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
  const [userId, setUserId] = useState('');
  const [name, setName] = useState('');
  const [quota, setQuota] = useState('');
  const [groupId, setGroupId] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editQuota, setEditQuota] = useState('');
  const [editGroupId, setEditGroupId] = useState('');
  const [editExpiresAt, setEditExpiresAt] = useState('');

  const apiKeysQuery = useQuery({
    queryKey: ['admin-api-keys', keyword],
    queryFn: () => searchAdminApiKeys(keyword),
  });

  const apiKeys = useMemo(
    () => getApiKeyItems(apiKeysQuery.data as ApiKeySearchResult | undefined),
    [apiKeysQuery.data]
  );

  const createMutation = useMutation({
    mutationFn: () => {
      const numericUserId = Number(userId);
      if (!Number.isFinite(numericUserId) || numericUserId <= 0) {
        throw new Error('请填写正确的用户 ID。');
      }
      if (!name.trim()) {
        throw new Error('请填写密钥名称。');
      }

      return createUserApiKey(numericUserId, {
        name: name.trim(),
        quota: toNumber(quota),
        group_id: toNullableNumber(groupId),
        expires_at: expiresAt.trim() || null,
        status: 'active',
      });
    },
    onSuccess: () => {
      setFormError(null);
      setName('');
      setQuota('');
      setGroupId('');
      setExpiresAt('');
      queryClient.invalidateQueries({ queryKey: ['admin-api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['user-api-keys'] });
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status?: string }) =>
      updateAdminApiKey(id, {
        name: editName.trim() || undefined,
        quota: toNumber(editQuota),
        group_id: toNullableNumber(editGroupId),
        expires_at: editExpiresAt.trim() || null,
        status,
      }),
    onSuccess: () => {
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ['admin-api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['user-api-keys'] });
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAdminApiKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-api-keys'] });
      queryClient.invalidateQueries({ queryKey: ['user-api-keys'] });
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  async function copyKey(item: AdminApiKey) {
    await Clipboard.setStringAsync(item.key || '');
    setCopiedId(item.id);
    setTimeout(() => setCopiedId((current) => (current === item.id ? null : current)), 1400);
  }

  function startEdit(item: AdminApiKey) {
    setEditingId(item.id);
    setEditName(item.name || '');
    setEditQuota(item.quota ? String(item.quota) : '');
    setEditGroupId(item.group_id ? String(item.group_id) : '');
    setEditExpiresAt(item.expires_at || '');
  }

  function confirmDelete(item: AdminApiKey) {
    Alert.alert('删除 API 密钥', `确认删除 ${item.name || `Key #${item.id}`} 吗？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => deleteMutation.mutate(item.id) },
    ]);
  }

  return (
    <>
      <Stack.Screen options={{ title: 'API 密钥管理' }} />
      <ScreenShell
        title="API 密钥"
        subtitle="搜索、创建、编辑、启停和删除用户 API Key。"
        icon={KeyRound}
        variant="minimal"
        refreshing={apiKeysQuery.isRefetching}
        onRefresh={() => {
          void apiKeysQuery.refetch();
        }}
        bottomInsetClassName="pb-8"
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
        </View>

        <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 14 }}>
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: 10 }}>
            <Plus color={colors.primary} size={18} />
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>新建 API Key</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
            <Field label="用户 ID" value={userId} onChangeText={setUserId} placeholder="例如 1001" keyboardType="number-pad" />
            <Field label="名称" value={name} onChangeText={setName} placeholder="例如 mobile-key" />
            <Field label="额度" value={quota} onChangeText={setQuota} placeholder="留空为默认" keyboardType="decimal-pad" />
            <Field label="分组 ID" value={groupId} onChangeText={setGroupId} placeholder="留空不绑定" keyboardType="number-pad" />
            <Field label="过期时间" value={expiresAt} onChangeText={setExpiresAt} placeholder="YYYY-MM-DD 或 ISO 时间" />
          </View>
          {formError ? (
            <View style={{ backgroundColor: colors.errorBg, borderRadius: 12, marginTop: 12, padding: 12 }}>
              <Text style={{ color: colors.errorText, fontSize: 13 }}>{formError}</Text>
            </View>
          ) : null}
          <Pressable
            disabled={createMutation.isPending}
            onPress={() => {
              setFormError(null);
              createMutation.mutate();
            }}
            style={{
              alignItems: 'center',
              backgroundColor: createMutation.isPending ? colors.disabled : colors.primary,
              borderRadius: 14,
              marginTop: 14,
              paddingVertical: 13,
            }}
          >
            <Text style={{ color: colors.primaryText, fontSize: 14, fontWeight: '800' }}>{createMutation.isPending ? '创建中...' : '创建密钥'}</Text>
          </Pressable>
        </View>

        {apiKeysQuery.isLoading ? <ListCard title="正在加载 API Keys" meta="请稍等..." icon={KeyRound} /> : null}

        {apiKeysQuery.error ? (
          <View style={{ backgroundColor: colors.errorBg, borderRadius: 14, padding: 14 }}>
            <Text style={{ color: colors.errorText, fontWeight: '800' }}>API Keys 加载失败</Text>
            <Text style={{ color: colors.errorText, fontSize: 13, lineHeight: 20, marginTop: 6 }}>{getErrorMessage(apiKeysQuery.error)}</Text>
          </View>
        ) : null}

        {!apiKeysQuery.isLoading && !apiKeysQuery.error && apiKeys.length === 0 ? (
          <ListCard title="暂无 API Key" meta="换个关键词搜索，或先创建一个新的用户密钥。" icon={KeyRound} />
        ) : null}

        {apiKeys.map((item: AdminApiKey) => {
          const editing = editingId === item.id;
          const disabled = ['disabled', 'inactive', 'revoked'].includes(`${item.status || ''}`.toLowerCase());
          const nextStatus = disabled ? 'active' : 'disabled';

          return (
            <ListCard
              key={item.id}
              title={item.name || `Key #${item.id}`}
              meta={`用户 ${item.user?.email || item.user_id || '--'} · 分组 ${item.group?.name || item.group_id || '未分组'}`}
              icon={KeyRound}
            >
              <View style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 13, lineHeight: 20 }}>{maskKey(item.key)}</Text>
                    <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 4 }}>
                      已用 {item.quota_used ?? 0} / {item.quota && item.quota > 0 ? item.quota : '不限'} · 最后使用 {formatDisplayTime(item.last_used_at || item.updated_at || item.created_at)}
                    </Text>
                  </View>
                  <StatusPill status={item.status} />
                </View>

                {editing ? (
                  <View style={{ backgroundColor: colors.mutedCard, borderRadius: 14, padding: 12 }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                      <Field label="名称" value={editName} onChangeText={setEditName} />
                      <Field label="额度" value={editQuota} onChangeText={setEditQuota} keyboardType="decimal-pad" />
                      <Field label="分组 ID" value={editGroupId} onChangeText={setEditGroupId} keyboardType="number-pad" />
                      <Field label="过期时间" value={editExpiresAt} onChangeText={setEditExpiresAt} />
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                      <Pressable
                        style={{ backgroundColor: colors.primary, borderRadius: 12, flex: 1, paddingVertical: 11, alignItems: 'center' }}
                        onPress={() => updateMutation.mutate({ id: item.id })}
                      >
                        <Text style={{ color: colors.primaryText, fontWeight: '800' }}>保存</Text>
                      </Pressable>
                      <Pressable
                        style={{ backgroundColor: colors.muted, borderRadius: 12, flex: 1, paddingVertical: 11, alignItems: 'center' }}
                        onPress={() => setEditingId(null)}
                      >
                        <Text style={{ color: colors.badgeDefaultText, fontWeight: '800' }}>取消</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Pressable
                    style={{ backgroundColor: colors.mutedCard, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 }}
                    onPress={() => copyKey(item)}
                  >
                    <Text style={{ color: copiedId === item.id ? colors.success : colors.badgeDefaultText, fontSize: 12, fontWeight: '800' }}>
                      {copiedId === item.id ? '已复制' : '复制'}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={{ backgroundColor: colors.mutedCard, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', gap: 6 }}
                    onPress={() => startEdit(item)}
                  >
                    <Pencil color={colors.badgeDefaultText} size={13} />
                    <Text style={{ color: colors.badgeDefaultText, fontSize: 12, fontWeight: '800' }}>编辑</Text>
                  </Pressable>
                  <Pressable
                    style={{ backgroundColor: disabled ? colors.successBg : colors.accentBg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 }}
                    onPress={() => updateMutation.mutate({ id: item.id, status: nextStatus })}
                  >
                    <Text style={{ color: disabled ? colors.success : colors.accentText, fontSize: 12, fontWeight: '800' }}>
                      {disabled ? '启用' : '禁用'}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={{ backgroundColor: colors.dangerBg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', gap: 6 }}
                    onPress={() => confirmDelete(item)}
                  >
                    <Trash2 color={colors.danger} size={13} />
                    <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '800' }}>删除</Text>
                  </Pressable>
                </View>
              </View>
            </ListCard>
          );
        })}
      </ScreenShell>
    </>
  );
}
