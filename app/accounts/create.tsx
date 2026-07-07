import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '@/src/lib/theme';
import { createAccount } from '@/src/services/admin';
import type { AccountType, CreateAccountRequest } from '@/src/types/admin';

const PLATFORM_OPTIONS = ['openai', 'gemini', 'anthropic', 'antigravity', 'grok'];
const ACCOUNT_TYPE_OPTIONS: AccountType[] = ['apikey', 'oauth', 'service_account', 'bedrock'];
type JsonRecord = Record<string, unknown>;

function toNumber(raw: string) {
  if (!raw.trim()) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function toGroupIds(raw: string) {
  const values = raw
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);

  return values.length > 0 ? values : undefined;
}

function parseObjectInput(raw: string, fieldLabel: string): JsonRecord | undefined {
  if (!raw.trim()) return undefined;
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${fieldLabel} 必须是 JSON 对象。`);
  }

  return parsed as JsonRecord;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    switch (error.message) {
      case 'BASE_URL_REQUIRED':
        return '请先到服务器页填写服务地址。';
      case 'ADMIN_API_KEY_REQUIRED':
        return '请先到服务器页填写 Admin Token。';
      case 'INVALID_SERVER_RESPONSE':
        return '服务返回格式异常，请确认后端接口可用并检查网关日志。';
      case 'REQUEST_FAILED':
        return '请求失败，请检查服务地址、Token 和网络连通性。';
      default:
        return error.message;
    }
  }

  return '创建账号失败，请稍后重试。';
}

export default function CreateAdminAccountScreen() {
  const colors = useAppTheme();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('anthropic');
  const [type, setType] = useState<AccountType>('apikey');
  const [notes, setNotes] = useState('');
  const [credentialsJson, setCredentialsJson] = useState('{\n  "base_url": "",\n  "api_key": ""\n}');
  const [extraJson, setExtraJson] = useState('');
  const [proxyId, setProxyId] = useState('');
  const [concurrency, setConcurrency] = useState('');
  const [loadFactor, setLoadFactor] = useState('');
  const [priority, setPriority] = useState('');
  const [rateMultiplier, setRateMultiplier] = useState('');
  const [groupIds, setGroupIds] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [autoPauseOnExpired, setAutoPauseOnExpired] = useState(true);
  const [confirmMixedChannelRisk, setConfirmMixedChannelRisk] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const canSubmit = useMemo(() => Boolean(name.trim() && credentialsJson.trim()), [credentialsJson, name]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const credentials = parseObjectInput(credentialsJson, 'credentials');
      if (!credentials) {
        throw new Error('credentials 不能为空。');
      }

      const extra = parseObjectInput(extraJson, 'extra');

      const payload: CreateAccountRequest = {
        name: name.trim(),
        platform,
        type,
        credentials,
        notes: notes.trim() || undefined,
        proxy_id: toNumber(proxyId),
        concurrency: toNumber(concurrency),
        load_factor: toNumber(loadFactor) ?? null,
        priority: toNumber(priority),
        rate_multiplier: toNumber(rateMultiplier),
        group_ids: toGroupIds(groupIds),
        expires_at: expiresAt.trim() || null,
        auto_pause_on_expired: autoPauseOnExpired,
        confirm_mixed_channel_risk: confirmMixedChannelRisk || undefined,
        extra,
      };

      return createAccount(payload);
    },
    onSuccess: () => {
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      router.replace('/accounts/overview');
    },
    onError: (error) => {
      setFormError(getErrorMessage(error));
    },
  });

  return (
    <>
      <Stack.Screen options={{ title: '添加账号 (/admin/accounts)' }} />
      <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.page }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 16,
              padding: 16,
              marginBottom: 12,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>基础信息</Text>

            <Text style={{ marginTop: 12, marginBottom: 6, fontSize: 12, color: colors.subtext }}>账号名称</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="例如：openai-main"
              placeholderTextColor={colors.placeholder}
              style={{
                backgroundColor: colors.muted,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 12,
                color: colors.text,
                marginBottom: 10,
              }}
            />

            <Text style={{ marginBottom: 6, fontSize: 12, color: colors.subtext }}>平台</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              {PLATFORM_OPTIONS.map((item) => {
                const active = platform === item;
                return (
                  <Pressable
                    key={item}
                    onPress={() => setPlatform(item)}
                    style={{
                      borderRadius: 999,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderWidth: 1,
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primary : colors.muted,
                    }}
                  >
                    <Text style={{ color: active ? colors.primaryText : colors.text, fontSize: 12, fontWeight: '700' }}>{item}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={{ marginBottom: 6, fontSize: 12, color: colors.subtext }}>类型</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              {ACCOUNT_TYPE_OPTIONS.map((item) => {
                const active = type === item;
                return (
                  <Pressable
                    key={item}
                    onPress={() => setType(item)}
                    style={{
                      borderRadius: 999,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderWidth: 1,
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primary : colors.muted,
                    }}
                  >
                    <Text style={{ color: active ? colors.primaryText : colors.text, fontSize: 12, fontWeight: '700' }}>{item}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={{ marginBottom: 6, fontSize: 12, color: colors.subtext }}>备注（可选）</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="例如：主线路账号"
              placeholderTextColor={colors.placeholder}
              style={{
                backgroundColor: colors.muted,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 12,
                color: colors.text,
              }}
            />
          </View>

          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 16,
              padding: 16,
              marginBottom: 12,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>请求体字段</Text>
            <Text style={{ marginTop: 6, fontSize: 12, color: colors.subtext }}>
              该页面直接创建 /admin/accounts，credentials 必填，extra 可选。
            </Text>

            <Text style={{ marginTop: 12, marginBottom: 6, fontSize: 12, color: colors.subtext }}>credentials（JSON 对象）</Text>
            <TextInput
              value={credentialsJson}
              onChangeText={setCredentialsJson}
              multiline
              textAlignVertical="top"
              placeholder='例如：{"base_url":"https://api.example.com","api_key":"sk-..."}'
              placeholderTextColor={colors.placeholder}
              style={{
                minHeight: 120,
                backgroundColor: colors.muted,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 12,
                color: colors.text,
                marginBottom: 10,
              }}
            />

            <Text style={{ marginBottom: 6, fontSize: 12, color: colors.subtext }}>extra（可选，JSON 对象）</Text>
            <TextInput
              value={extraJson}
              onChangeText={setExtraJson}
              multiline
              textAlignVertical="top"
              placeholder='例如：{"window_cost_limit":50}'
              placeholderTextColor={colors.placeholder}
              style={{
                minHeight: 96,
                backgroundColor: colors.muted,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 12,
                color: colors.text,
              }}
            />
          </View>

          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 16,
              padding: 16,
              marginBottom: 12,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>可选参数</Text>

            <Text style={{ marginTop: 12, marginBottom: 6, fontSize: 12, color: colors.subtext }}>proxy_id</Text>
            <TextInput
              value={proxyId}
              onChangeText={setProxyId}
              keyboardType="number-pad"
              placeholder="例如：3"
              placeholderTextColor={colors.placeholder}
              style={{
                backgroundColor: colors.muted,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 12,
                color: colors.text,
                marginBottom: 10,
              }}
            />

            <Text style={{ marginBottom: 6, fontSize: 12, color: colors.subtext }}>concurrency</Text>
            <TextInput
              value={concurrency}
              onChangeText={setConcurrency}
              keyboardType="number-pad"
              placeholder="例如：10"
              placeholderTextColor={colors.placeholder}
              style={{
                backgroundColor: colors.muted,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 12,
                color: colors.text,
                marginBottom: 10,
              }}
            />

            <Text style={{ marginBottom: 6, fontSize: 12, color: colors.subtext }}>load_factor</Text>
            <TextInput
              value={loadFactor}
              onChangeText={setLoadFactor}
              keyboardType="decimal-pad"
              placeholder="例如：1，留空则按后端默认"
              placeholderTextColor={colors.placeholder}
              style={{
                backgroundColor: colors.muted,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 12,
                color: colors.text,
                marginBottom: 10,
              }}
            />

            <Text style={{ marginBottom: 6, fontSize: 12, color: colors.subtext }}>priority</Text>
            <TextInput
              value={priority}
              onChangeText={setPriority}
              keyboardType="number-pad"
              placeholder="例如：0"
              placeholderTextColor={colors.placeholder}
              style={{
                backgroundColor: colors.muted,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 12,
                color: colors.text,
                marginBottom: 10,
              }}
            />

            <Text style={{ marginBottom: 6, fontSize: 12, color: colors.subtext }}>rate_multiplier</Text>
            <TextInput
              value={rateMultiplier}
              onChangeText={setRateMultiplier}
              keyboardType="decimal-pad"
              placeholder="例如：1"
              placeholderTextColor={colors.placeholder}
              style={{
                backgroundColor: colors.muted,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 12,
                color: colors.text,
                marginBottom: 10,
              }}
            />

            <Text style={{ marginBottom: 6, fontSize: 12, color: colors.subtext }}>expires_at</Text>
            <TextInput
              value={expiresAt}
              onChangeText={setExpiresAt}
              placeholder="例如：2026-12-31T23:59:59+08:00"
              placeholderTextColor={colors.placeholder}
              style={{
                backgroundColor: colors.muted,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 12,
                color: colors.text,
                marginBottom: 10,
              }}
            />

            <Text style={{ marginBottom: 6, fontSize: 12, color: colors.subtext }}>group_ids（逗号分隔）</Text>
            <TextInput
              value={groupIds}
              onChangeText={setGroupIds}
              placeholder="例如：1,2,5"
              placeholderTextColor={colors.placeholder}
              style={{
                backgroundColor: colors.muted,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 12,
                color: colors.text,
              }}
            />

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              <Pressable
                onPress={() => setAutoPauseOnExpired((value) => !value)}
                style={{
                  alignItems: 'center',
                  backgroundColor: autoPauseOnExpired ? colors.primary : colors.muted,
                  borderColor: autoPauseOnExpired ? colors.primary : colors.border,
                  borderRadius: 999,
                  borderWidth: 1,
                  flexDirection: 'row',
                  justifyContent: 'center',
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                }}
              >
                <Text style={{ color: autoPauseOnExpired ? colors.primaryText : colors.text, fontSize: 12, fontWeight: '800' }}>
                  过期自动暂停
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setConfirmMixedChannelRisk((value) => !value)}
                style={{
                  alignItems: 'center',
                  backgroundColor: confirmMixedChannelRisk ? colors.primary : colors.muted,
                  borderColor: confirmMixedChannelRisk ? colors.primary : colors.border,
                  borderRadius: 999,
                  borderWidth: 1,
                  flexDirection: 'row',
                  justifyContent: 'center',
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                }}
              >
                <Text style={{ color: confirmMixedChannelRisk ? colors.primaryText : colors.text, fontSize: 12, fontWeight: '800' }}>
                  确认混合渠道风险
                </Text>
              </Pressable>
            </View>
          </View>

          {formError ? (
            <View style={{ backgroundColor: colors.errorBg, borderRadius: 12, padding: 12, marginBottom: 12 }}>
              <Text style={{ color: colors.errorText }}>{formError}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={() => {
              setFormError(null);
              createMutation.mutate();
            }}
            disabled={!canSubmit || createMutation.isPending}
            style={{
              backgroundColor: !canSubmit || createMutation.isPending ? colors.disabled : colors.dark,
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: colors.primaryText, fontWeight: '700' }}>{createMutation.isPending ? '提交中...' : '创建账号'}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
