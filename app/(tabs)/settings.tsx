import { router } from 'expo-router';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { CheckCircle2, Eye, EyeOff, KeyRound, Link2, Plus, Server, ServerCog, Trash2 } from 'lucide-react-native';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { z } from 'zod';

import { getAdminSettings, getDashboardStats } from '@/src/services/admin';
import { IconBadge } from '@/src/components/icon-badge';
import { queryClient } from '@/src/lib/query-client';
import { useAppTheme } from '@/src/lib/theme';
import { adminConfigState, removeAdminAccount, saveAdminConfig, switchAdminAccount, type AdminAccountProfile } from '@/src/store/admin-config';

const { useSnapshot } = require('valtio/react');

const schema = z
  .object({
    baseUrl: z.string().min(1, '请输入服务器地址'),
    adminApiKey: z.string(),
  })
  .refine((values) => values.adminApiKey.trim().length > 0, {
    path: ['adminApiKey'],
    message: '请输入 Admin Key',
  });

type FormValues = z.infer<typeof schema>;
type ConnectionState = 'idle' | 'checking' | 'success' | 'error';

function getConnectionErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    switch (error.message) {
      case 'BASE_URL_REQUIRED':
        return '请先填写服务器地址。';
      case 'ADMIN_API_KEY_REQUIRED':
        return '请先填写 Admin Key。';
      case 'INVALID_SERVER_RESPONSE':
        return '当前地址返回的数据不正确，请确认它是可用的管理接口。';
      default:
        return error.message;
    }
  }

  return '连接失败，请检查服务器地址、Admin Key 和网络连通性。';
}

function ServerCard({
  account,
  active,
  onSelect,
  onDelete,
}: {
  account: AdminAccountProfile;
  active: boolean;
  onSelect: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const colors = useAppTheme();

  return (
    <Pressable
      onPress={onSelect}
      style={{
        backgroundColor: active ? colors.successBg : colors.card,
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: active ? colors.success : colors.border,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <IconBadge icon={Server} tone={active ? 'success' : 'muted'} containerSize={36} size={17} />
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: colors.text }}>{account.label}</Text>
          </View>
          <Text style={{ marginTop: 6, fontSize: 13, lineHeight: 20, color: colors.subtext }}>{account.baseUrl}</Text>
          <Text style={{ marginTop: 8, fontSize: 11, color: colors.subtext }}>更新时间 {new Date(account.updatedAt).toLocaleString()}</Text>
        </View>
        {active ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.success, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
            <CheckCircle2 color={colors.primaryText} size={12} />
            <Text style={{ color: colors.primaryText, fontSize: 11, fontWeight: '700' }}>当前使用</Text>
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Pressable onPress={onSelect} style={{ flex: 1, backgroundColor: active ? colors.iconSoftBg : colors.primary, borderRadius: 14, paddingVertical: 11, alignItems: 'center' }}>
          <Text style={{ color: active ? colors.success : colors.primaryText, fontSize: 13, fontWeight: '700' }}>{active ? '已选中' : '切换到此服务器'}</Text>
        </Pressable>
        <Pressable onPress={onDelete} style={{ backgroundColor: colors.dangerBg, borderRadius: 14, paddingHorizontal: 14, justifyContent: 'center' }}>
          <Trash2 color={colors.danger} size={17} />
        </Pressable>
      </View>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const colors = useAppTheme();
  const config = useSnapshot(adminConfigState);
  const [showForm, setShowForm] = useState(config.accounts.length === 0);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAdminKey, setShowAdminKey] = useState(false);
  const { control, handleSubmit, formState, reset } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      baseUrl: '',
      adminApiKey: '',
    },
  });

  async function verifyAndEnter(successMessage: string) {
    setConnectionState('checking');
    setConnectionMessage('正在检测当前服务是否可用...');

    try {
      queryClient.clear();
      await queryClient.fetchQuery({ queryKey: ['admin-settings'], queryFn: getAdminSettings });
      await queryClient.prefetchQuery({ queryKey: ['monitor-stats'], queryFn: getDashboardStats });
      setConnectionState('success');
      setConnectionMessage(successMessage);
      router.replace('/monitor');
    } catch (error) {
      setConnectionState('error');
      setConnectionMessage(getConnectionErrorMessage(error));
    }
  }

  async function handleAdd(values: FormValues) {
    await saveAdminConfig(values);
    reset({ baseUrl: '', adminApiKey: '' });
    setShowForm(false);
    await verifyAndEnter('服务器已添加并切换成功。');
  }

  async function handleSelect(account: AdminAccountProfile) {
    await switchAdminAccount(account.id);
    await verifyAndEnter(`已切换到 ${account.label}。`);
  }

  async function handleDelete(account: AdminAccountProfile) {
    await removeAdminAccount(account.id);
    queryClient.clear();
  }

  async function handleRefresh() {
    if (!config.baseUrl.trim()) {
      return;
    }

    setIsRefreshing(true);
    setConnectionState('idle');
    setConnectionMessage('');

    try {
      await Promise.all([
        queryClient.fetchQuery({ queryKey: ['admin-settings'], queryFn: getAdminSettings }),
        queryClient.prefetchQuery({ queryKey: ['monitor-stats'], queryFn: getDashboardStats }),
      ]);
    } catch (error) {
      setConnectionState('error');
      setConnectionMessage(getConnectionErrorMessage(error));
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.page }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 110, gap: 14 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void handleRefresh()} tintColor={colors.primary} />}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, flexDirection: 'row', gap: 12 }}>
            <IconBadge icon={ServerCog} containerSize={44} size={21} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>服务器</Text>
              <Text style={{ marginTop: 6, fontSize: 13, color: colors.subtext }}>选择当前管理的服务器，或添加新的服务器。</Text>
            </View>
          </View>
          <Pressable
            onPress={() => {
              setShowForm((value) => !value);
              setConnectionState('idle');
              setConnectionMessage('');
            }}
            style={{ backgroundColor: colors.primary, borderRadius: 999, width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}
          >
            <Plus color={colors.primaryText} size={22} strokeWidth={2.4} />
          </Pressable>
        </View>

        {showForm ? (
          <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 16, gap: 14 }}>
            <View style={{ alignItems: 'center', flexDirection: 'row', gap: 10 }}>
              <IconBadge icon={ServerCog} containerSize={36} size={17} />
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>添加服务器</Text>
            </View>

            <View>
              <View style={{ alignItems: 'center', flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                <Link2 color={colors.subtext} size={14} />
                <Text style={{ fontSize: 12, color: colors.subtext }}>服务器地址</Text>
              </View>
              <Controller
                control={control}
                name="baseUrl"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    value={value}
                    onChangeText={onChange}
                    placeholder="例如：https://api.example.com"
                    placeholderTextColor={colors.placeholder}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={{ backgroundColor: colors.mutedCard, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: colors.text }}
                  />
                )}
              />
            </View>

            <View>
              <View style={{ alignItems: 'center', flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                <KeyRound color={colors.subtext} size={14} />
                <Text style={{ fontSize: 12, color: colors.subtext }}>Admin Key / JWT</Text>
              </View>
              <Controller
                control={control}
                name="adminApiKey"
                render={({ field: { onChange, value } }) => (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TextInput
                      value={value}
                      onChangeText={onChange}
                      placeholder="admin-xxxxxxxx 或网页登录 JWT"
                      placeholderTextColor={colors.placeholder}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry={!showAdminKey}
                      style={{
                        flex: 1,
                        backgroundColor: colors.mutedCard,
                        borderRadius: 16,
                        paddingHorizontal: 16,
                        paddingVertical: 14,
                        fontSize: 16,
                        color: colors.text,
                      }}
                    />
                    <Pressable
                      onPress={() => setShowAdminKey((value) => !value)}
                      style={{ backgroundColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}
                    >
                      {showAdminKey ? <EyeOff color={colors.badgeDefaultText} size={17} /> : <Eye color={colors.badgeDefaultText} size={17} />}
                    </Pressable>
                  </View>
                )}
              />
            </View>

            {formState.errors.baseUrl || formState.errors.adminApiKey ? (
              <View style={{ borderRadius: 14, backgroundColor: colors.dangerBg, paddingHorizontal: 14, paddingVertical: 12 }}>
                <Text style={{ color: colors.danger, fontSize: 14 }}>{formState.errors.baseUrl?.message || formState.errors.adminApiKey?.message}</Text>
              </View>
            ) : null}

            {connectionMessage ? (
              <View style={{ borderRadius: 14, backgroundColor: connectionState === 'success' ? colors.successBg : colors.dangerBg, paddingHorizontal: 14, paddingVertical: 12 }}>
                <Text style={{ color: connectionState === 'success' ? colors.success : colors.danger, fontSize: 14 }}>{connectionMessage}</Text>
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                onPress={handleSubmit(handleAdd)}
                disabled={connectionState === 'checking'}
                style={{ flex: 1, backgroundColor: connectionState === 'checking' ? colors.disabled : colors.primary, borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}
              >
                <Text style={{ color: colors.primaryText, fontSize: 14, fontWeight: '700' }}>{connectionState === 'checking' ? '检测中...' : '保存并使用'}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setShowForm(false);
                  setConnectionState('idle');
                  setConnectionMessage('');
                  reset({ baseUrl: '', adminApiKey: '' });
                }}
                style={{ flex: 1, backgroundColor: colors.mutedCard, borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}
              >
                <Text style={{ color: colors.badgeDefaultText, fontSize: 14, fontWeight: '700' }}>取消</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={{ gap: 12 }}>
          {config.accounts.map((account: AdminAccountProfile) => (
            <ServerCard
              key={account.id}
              account={account}
              active={account.id === config.activeAccountId}
              onSelect={() => handleSelect(account)}
              onDelete={() => handleDelete(account)}
            />
          ))}

          {config.accounts.length === 0 ? (
            <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 18 }}>
              <View style={{ alignItems: 'center', flexDirection: 'row', gap: 10 }}>
                <IconBadge icon={Server} tone="muted" containerSize={36} size={17} />
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: colors.text }}>还没有服务器</Text>
              </View>
              <Text style={{ marginTop: 8, fontSize: 13, lineHeight: 21, color: colors.subtext }}>点击右上角 + 添加服务器，保存成功后会自动切换并进入概览。</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
