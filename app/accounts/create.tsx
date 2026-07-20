import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Stack, router } from 'expo-router';
import {
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Cloud,
  Eye,
  EyeOff,
  FileJson,
  Gem,
  KeyRound,
  Plus,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRound,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import { useMemo, useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '@/src/lib/theme';
import { createAccount, listAllGroups } from '@/src/services/admin';
import type { AccountType, CreateAccountRequest } from '@/src/types/admin';

type PlatformId = 'openai' | 'gemini' | 'anthropic' | 'antigravity' | 'grok';
type FormAccountType = Extract<AccountType, 'apikey' | 'oauth' | 'service_account' | 'bedrock' | 'upstream'>;

type ChoiceOption<T extends string> = {
  value: T;
  label: string;
  subtitle?: string;
  icon: LucideIcon;
};

const PLATFORM_OPTIONS: Array<ChoiceOption<PlatformId>> = [
  { value: 'openai', label: 'OpenAI', subtitle: 'API / OAuth', icon: Bot },
  { value: 'anthropic', label: 'Anthropic', subtitle: 'Claude', icon: Sparkles },
  { value: 'gemini', label: 'Gemini', subtitle: 'Google AI', icon: Gem },
  { value: 'antigravity', label: 'Antigravity', subtitle: 'Cloud Code', icon: Cloud },
  { value: 'grok', label: 'Grok', subtitle: 'xAI', icon: Zap },
];

const TYPE_OPTIONS: Record<PlatformId, Array<ChoiceOption<FormAccountType>>> = {
  openai: [
    { value: 'apikey', label: 'API Key', subtitle: 'Responses API', icon: KeyRound },
    { value: 'oauth', label: 'OAuth', subtitle: 'Access Token', icon: ShieldCheck },
  ],
  anthropic: [
    { value: 'apikey', label: 'API Key', subtitle: 'Claude Console', icon: KeyRound },
    { value: 'oauth', label: 'OAuth', subtitle: 'Claude Code', icon: ShieldCheck },
    { value: 'service_account', label: 'Vertex', subtitle: 'Service Account', icon: Cloud },
    { value: 'bedrock', label: 'Bedrock', subtitle: 'AWS', icon: Server },
  ],
  gemini: [
    { value: 'apikey', label: 'API Key', subtitle: 'AI Studio', icon: KeyRound },
    { value: 'oauth', label: 'OAuth', subtitle: 'Google Account', icon: ShieldCheck },
    { value: 'service_account', label: 'Vertex', subtitle: 'Service Account', icon: Cloud },
  ],
  antigravity: [
    { value: 'oauth', label: 'OAuth', subtitle: 'Google Account', icon: ShieldCheck },
    { value: 'upstream', label: 'API Key', subtitle: 'Upstream', icon: Cloud },
  ],
  grok: [
    { value: 'apikey', label: 'API Key', subtitle: 'Responses API', icon: KeyRound },
    { value: 'oauth', label: 'OAuth', subtitle: 'Access Token', icon: ShieldCheck },
  ],
};

const DEFAULT_BASE_URL: Record<PlatformId, string> = {
  openai: 'https://api.openai.com',
  anthropic: 'https://api.anthropic.com',
  gemini: 'https://generativelanguage.googleapis.com',
  antigravity: 'https://cloudcode-pa.googleapis.com',
  grok: 'https://api.x.ai',
};

const GEMINI_TIERS = [
  { value: 'aistudio_free', label: 'AI Studio Free' },
  { value: 'google_one_free', label: 'Google One Free' },
  { value: 'gcp_standard', label: 'GCP Standard' },
];

function FormSection({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
  const colors = useAppTheme();

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        marginBottom: 12,
        padding: 14,
      }}
    >
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 9 }}>
        <View
          style={{
            alignItems: 'center',
            backgroundColor: colors.accentBg,
            borderRadius: 8,
            height: 32,
            justifyContent: 'center',
            width: 32,
          }}
        >
          <Icon color={colors.accentText} size={17} />
        </View>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{title}</Text>
      </View>
      <View style={{ marginTop: 14 }}>{children}</View>
    </View>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  required = false,
  secure = false,
  multiline = false,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  secure?: boolean;
  multiline?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
}) {
  const colors = useAppTheme();
  const [visible, setVisible] = useState(false);

  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: colors.subtext, fontSize: 12, fontWeight: '600', marginBottom: 6 }}>
        {label}{required ? <Text style={{ color: colors.danger }}> *</Text> : null}
      </Text>
      <View
        style={{
          alignItems: multiline ? 'flex-start' : 'center',
          backgroundColor: colors.mutedCard,
          borderColor: colors.border,
          borderRadius: 8,
          borderWidth: 1,
          flexDirection: 'row',
          minHeight: multiline ? 88 : 46,
          paddingHorizontal: 12,
        }}
      >
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={keyboardType}
          multiline={multiline}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          secureTextEntry={secure && !visible}
          style={{
            color: colors.text,
            flex: 1,
            fontSize: 14,
            minHeight: multiline ? 86 : 44,
            paddingVertical: multiline ? 11 : 8,
            textAlignVertical: multiline ? 'top' : 'center',
          }}
          value={value}
        />
        {secure ? (
          <Pressable
            accessibilityLabel={visible ? '隐藏内容' : '显示内容'}
            hitSlop={10}
            onPress={() => setVisible((current) => !current)}
            style={{ alignItems: 'center', height: 36, justifyContent: 'center', marginLeft: 8, width: 32 }}
          >
            {visible ? <EyeOff color={colors.subtext} size={17} /> : <Eye color={colors.subtext} size={17} />}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function ChoiceCard<T extends string>({ option, selected, onPress }: { option: ChoiceOption<T>; selected: boolean; onPress: () => void }) {
  const colors = useAppTheme();
  const Icon = option.icon;

  return (
    <Pressable
      onPress={onPress}
      style={{
        alignItems: 'center',
        backgroundColor: selected ? colors.accentBg : colors.mutedCard,
        borderColor: selected ? colors.primary : colors.border,
        borderRadius: 8,
        borderWidth: selected ? 1.5 : 1,
        flexBasis: '47%',
        flexDirection: 'row',
        flexGrow: 1,
        gap: 9,
        minHeight: 58,
        minWidth: 138,
        paddingHorizontal: 11,
        paddingVertical: 9,
      }}
    >
      <View
        style={{
          alignItems: 'center',
          backgroundColor: selected ? colors.primary : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
          borderRadius: 8,
          borderWidth: 1,
          height: 32,
          justifyContent: 'center',
          width: 32,
        }}
      >
        <Icon color={selected ? colors.primaryText : colors.badgeDefaultText} size={16} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: selected ? colors.accentText : colors.text, fontSize: 13, fontWeight: '700' }}>
          {option.label}
        </Text>
        {option.subtitle ? (
          <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 10, marginTop: 2 }}>{option.subtitle}</Text>
        ) : null}
      </View>
      {selected ? <Check color={colors.primary} size={15} /> : null}
    </Pressable>
  );
}

function ToggleRow({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: (value: boolean) => void }) {
  const colors = useAppTheme();

  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: colors.mutedCard,
        borderColor: colors.border,
        borderRadius: 8,
        borderWidth: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
        minHeight: 48,
        paddingHorizontal: 12,
      }}
    >
      <Text style={{ color: colors.text, flex: 1, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <Switch
        ios_backgroundColor={colors.border}
        onValueChange={onValueChange}
        thumbColor={Platform.OS === 'android' ? (value ? colors.primaryText : colors.surface) : undefined}
        trackColor={{ false: colors.border, true: colors.primary }}
        value={value}
      />
    </View>
  );
}

function optionalNumber(raw: string, label: string) {
  if (!raw.trim()) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${label}格式不正确。`);
  return value;
}

function firstText(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    switch (error.message) {
      case 'BASE_URL_REQUIRED':
        return '请先到服务器页填写服务地址。';
      case 'ADMIN_API_KEY_REQUIRED':
        return '请先到服务器页填写 Admin Token。';
      case 'INVALID_SERVER_RESPONSE':
        return '服务返回格式异常，请确认后端接口可用。';
      case 'REQUEST_FAILED':
        return '请求失败，请检查服务地址、Token 和网络。';
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
  const [notes, setNotes] = useState('');
  const [platform, setPlatform] = useState<PlatformId>('openai');
  const [accountType, setAccountType] = useState<FormAccountType>('apikey');

  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL.openai);
  const [apiKey, setApiKey] = useState('');
  const [geminiTier, setGeminiTier] = useState('aistudio_free');

  const [accessToken, setAccessToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [clientId, setClientId] = useState('');
  const [oauthEmail, setOauthEmail] = useState('');
  const [oauthAccountId, setOauthAccountId] = useState('');
  const [oauthExpiresAt, setOauthExpiresAt] = useState('');
  const [oauthProjectId, setOauthProjectId] = useState('');

  const [serviceAccountJson, setServiceAccountJson] = useState('');
  const [serviceAccountFileName, setServiceAccountFileName] = useState('');
  const [serviceAccountLoading, setServiceAccountLoading] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [location, setLocation] = useState('us-central1');

  const [bedrockRegion, setBedrockRegion] = useState('us-east-1');
  const [bedrockAccessKeyId, setBedrockAccessKeyId] = useState('');
  const [bedrockSecretAccessKey, setBedrockSecretAccessKey] = useState('');
  const [bedrockSessionToken, setBedrockSessionToken] = useState('');

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [proxyId, setProxyId] = useState('');
  const [concurrency, setConcurrency] = useState('');
  const [loadFactor, setLoadFactor] = useState('');
  const [priority, setPriority] = useState('');
  const [rateMultiplier, setRateMultiplier] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [expiresAt, setExpiresAt] = useState('');
  const [autoPauseOnExpired, setAutoPauseOnExpired] = useState(true);
  const [confirmMixedChannelRisk, setConfirmMixedChannelRisk] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const groupsQuery = useQuery({
    queryKey: ['groups', 'all', platform],
    queryFn: () => listAllGroups({ platform, include_inactive: false }),
    staleTime: 120_000,
  });

  const availableTypes = TYPE_OPTIONS[platform];
  const canSubmit = useMemo(() => {
    if (!name.trim()) return false;
    if (accountType === 'apikey' || accountType === 'upstream') return Boolean(apiKey.trim() && baseUrl.trim());
    if (accountType === 'oauth') return Boolean(accessToken.trim());
    if (accountType === 'service_account') return Boolean(serviceAccountJson.trim());
    if (accountType === 'bedrock') {
      return Boolean(bedrockRegion.trim() && bedrockAccessKeyId.trim() && bedrockSecretAccessKey.trim());
    }
    return false;
  }, [accessToken, accountType, apiKey, baseUrl, bedrockAccessKeyId, bedrockRegion, bedrockSecretAccessKey, name, serviceAccountJson]);

  function selectPlatform(nextPlatform: PlatformId) {
    const nextTypes = TYPE_OPTIONS[nextPlatform];
    setPlatform(nextPlatform);
    setBaseUrl(DEFAULT_BASE_URL[nextPlatform]);
    setSelectedGroupIds([]);
    setFormError(null);

    if (!nextTypes.some((option) => option.value === accountType)) {
      setAccountType(nextTypes[0].value);
    }
  }

  function toggleGroup(groupId: number) {
    setSelectedGroupIds((current) => current.includes(groupId)
      ? current.filter((id) => id !== groupId)
      : [...current, groupId]);
  }

  async function pickServiceAccountFile() {
    setServiceAccountLoading(true);
    setFormError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: ['application/json', 'text/json', 'text/plain', 'application/octet-stream'],
      });
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      const content = Platform.OS === 'web' && asset.file
        ? await asset.file.text()
        : Platform.OS === 'web'
          ? await (await fetch(asset.uri)).text()
          : await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      const parsed = JSON.parse(content) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Service Account 文件格式不正确。');
      }

      const record = parsed as Record<string, unknown>;
      const detectedProjectId = firstText(record, ['project_id', 'projectId']);
      const detectedClientEmail = firstText(record, ['client_email', 'clientEmail']);
      setServiceAccountJson(content);
      setServiceAccountFileName(asset.name);
      if (detectedProjectId) setProjectId(detectedProjectId);
      if (detectedClientEmail) {
        setClientEmail(detectedClientEmail);
        if (!name.trim()) setName(detectedClientEmail);
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '无法读取 Service Account 文件。');
    } finally {
      setServiceAccountLoading(false);
    }
  }

  function buildCredentials(): Record<string, unknown> {
    if (accountType === 'apikey' || accountType === 'upstream') {
      return {
        base_url: baseUrl.trim(),
        api_key: apiKey.trim(),
        ...(platform === 'gemini' ? { tier_id: geminiTier } : {}),
      };
    }

    if (accountType === 'oauth') {
      return {
        access_token: accessToken.trim(),
        refresh_token: refreshToken.trim() || undefined,
        client_id: clientId.trim() || undefined,
        email: oauthEmail.trim() || undefined,
        account_id: oauthAccountId.trim() || undefined,
        expires_at: oauthExpiresAt.trim() || undefined,
        ...(platform === 'antigravity' && oauthProjectId.trim() ? { project_id: oauthProjectId.trim() } : {}),
      };
    }

    if (accountType === 'service_account') {
      return {
        service_account_json: serviceAccountJson,
        project_id: projectId.trim() || undefined,
        client_email: clientEmail.trim() || undefined,
        location: location.trim() || 'us-central1',
        tier_id: 'vertex',
      };
    }

    return {
      region: bedrockRegion.trim(),
      access_key_id: bedrockAccessKeyId.trim(),
      secret_access_key: bedrockSecretAccessKey.trim(),
      session_token: bedrockSessionToken.trim() || undefined,
    };
  }

  const createMutation = useMutation({
    mutationFn: () => {
      const payload: CreateAccountRequest = {
        name: name.trim(),
        notes: notes.trim() || undefined,
        platform,
        type: accountType,
        credentials: buildCredentials(),
        proxy_id: optionalNumber(proxyId, '代理 ID') ?? null,
        concurrency: optionalNumber(concurrency, '并发数'),
        load_factor: optionalNumber(loadFactor, '负载系数') ?? null,
        priority: optionalNumber(priority, '优先级'),
        rate_multiplier: optionalNumber(rateMultiplier, '倍率'),
        group_ids: selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
        expires_at: expiresAt.trim() || null,
        auto_pause_on_expired: autoPauseOnExpired,
        confirm_mixed_channel_risk: confirmMixedChannelRisk || undefined,
      };

      return createAccount(payload);
    },
    onSuccess: () => {
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      void queryClient.invalidateQueries({ queryKey: ['monitor-stats'] });
      router.replace('/accounts/overview');
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  return (
    <>
      <Stack.Screen options={{ title: '添加账号' }} />
      <SafeAreaView edges={['bottom']} style={{ backgroundColor: colors.page, flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: 14, paddingBottom: 36 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
        >
          <FormSection icon={UserRound} title="账号信息">
            <FormField label="账号名称" onChangeText={setName} placeholder="例如：openai-main" required value={name} />
            <FormField label="备注" multiline onChangeText={setNotes} placeholder="可选" value={notes} />

            <Text style={{ color: colors.subtext, fontSize: 12, fontWeight: '600', marginBottom: 7 }}>平台</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {PLATFORM_OPTIONS.map((option) => (
                <ChoiceCard
                  key={option.value}
                  onPress={() => selectPlatform(option.value)}
                  option={option}
                  selected={platform === option.value}
                />
              ))}
            </View>

            <Text style={{ color: colors.subtext, fontSize: 12, fontWeight: '600', marginBottom: 7 }}>账号类型</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {availableTypes.map((option) => (
                <ChoiceCard
                  key={option.value}
                  onPress={() => {
                    setAccountType(option.value);
                    setFormError(null);
                  }}
                  option={option}
                  selected={accountType === option.value}
                />
              ))}
            </View>
          </FormSection>

          <FormSection icon={KeyRound} title="凭证信息">
            {accountType === 'apikey' || accountType === 'upstream' ? (
              <>
                <FormField label="Base URL" onChangeText={setBaseUrl} placeholder={DEFAULT_BASE_URL[platform]} required value={baseUrl} />
                <FormField label="API Key" onChangeText={setApiKey} placeholder="输入 API Key" required secure value={apiKey} />
                {platform === 'gemini' ? (
                  <>
                    <Text style={{ color: colors.subtext, fontSize: 12, fontWeight: '600', marginBottom: 7 }}>账号层级</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {GEMINI_TIERS.map((tier) => {
                        const selected = geminiTier === tier.value;
                        return (
                          <Pressable
                            key={tier.value}
                            onPress={() => setGeminiTier(tier.value)}
                            style={{
                              backgroundColor: selected ? colors.primary : colors.mutedCard,
                              borderColor: selected ? colors.primary : colors.border,
                              borderRadius: 999,
                              borderWidth: 1,
                              paddingHorizontal: 11,
                              paddingVertical: 8,
                            }}
                          >
                            <Text style={{ color: selected ? colors.primaryText : colors.text, fontSize: 11, fontWeight: '700' }}>{tier.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                ) : null}
              </>
            ) : null}

            {accountType === 'oauth' ? (
              <>
                <FormField label="Access Token" onChangeText={setAccessToken} placeholder="输入 Access Token" required secure value={accessToken} />
                <FormField label="Refresh Token" onChangeText={setRefreshToken} placeholder="可选" secure value={refreshToken} />
                <FormField label="Client ID" onChangeText={setClientId} placeholder="可选" value={clientId} />
                <FormField label="账号邮箱" keyboardType="email-address" onChangeText={setOauthEmail} placeholder="可选" value={oauthEmail} />
                <FormField label="上游账号 ID" onChangeText={setOauthAccountId} placeholder="可选" value={oauthAccountId} />
                {platform === 'antigravity' ? (
                  <FormField label="Project ID" onChangeText={setOauthProjectId} placeholder="可选" value={oauthProjectId} />
                ) : null}
                <FormField label="Token 过期时间" onChangeText={setOauthExpiresAt} placeholder="例如：2026-12-31T23:59:59+08:00" value={oauthExpiresAt} />
              </>
            ) : null}

            {accountType === 'service_account' ? (
              <>
                <Text style={{ color: colors.subtext, fontSize: 12, fontWeight: '600', marginBottom: 7 }}>
                  Service Account JSON <Text style={{ color: colors.danger }}>*</Text>
                </Text>
                <Pressable
                  disabled={serviceAccountLoading}
                  onPress={() => void pickServiceAccountFile()}
                  style={{
                    alignItems: 'center',
                    backgroundColor: serviceAccountJson ? colors.successBg : colors.mutedCard,
                    borderColor: serviceAccountJson ? colors.success : colors.border,
                    borderRadius: 8,
                    borderStyle: 'dashed',
                    borderWidth: 1.5,
                    flexDirection: 'row',
                    gap: 11,
                    marginBottom: 14,
                    minHeight: 64,
                    paddingHorizontal: 13,
                    paddingVertical: 10,
                  }}
                >
                  <FileJson color={serviceAccountJson ? colors.success : colors.primary} size={22} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>
                      {serviceAccountLoading ? '读取中...' : serviceAccountFileName || '选择 JSON 文件'}
                    </Text>
                    <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 11, marginTop: 3 }}>
                      {serviceAccountJson ? '文件已读取' : '未选择文件'}
                    </Text>
                  </View>
                  {serviceAccountJson ? <Check color={colors.success} size={18} /> : null}
                </Pressable>
                <FormField label="Project ID" onChangeText={setProjectId} placeholder="从文件自动读取" value={projectId} />
                <FormField label="Client Email" keyboardType="email-address" onChangeText={setClientEmail} placeholder="从文件自动读取" value={clientEmail} />
                <FormField label="Location" onChangeText={setLocation} placeholder="us-central1" value={location} />
              </>
            ) : null}

            {accountType === 'bedrock' ? (
              <>
                <FormField label="AWS Region" onChangeText={setBedrockRegion} placeholder="us-east-1" required value={bedrockRegion} />
                <FormField label="Access Key ID" onChangeText={setBedrockAccessKeyId} placeholder="AKIA..." required value={bedrockAccessKeyId} />
                <FormField label="Secret Access Key" onChangeText={setBedrockSecretAccessKey} required secure value={bedrockSecretAccessKey} />
                <FormField label="Session Token" onChangeText={setBedrockSessionToken} placeholder="可选" secure value={bedrockSessionToken} />
              </>
            ) : null}
          </FormSection>

          <Pressable
            onPress={() => setAdvancedOpen((current) => !current)}
            style={{
              alignItems: 'center',
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: 8,
              borderWidth: 1,
              flexDirection: 'row',
              gap: 9,
              marginBottom: 12,
              minHeight: 48,
              paddingHorizontal: 14,
            }}
          >
            <Settings2 color={colors.primary} size={18} />
            <Text style={{ color: colors.text, flex: 1, fontSize: 14, fontWeight: '700' }}>高级配置</Text>
            {advancedOpen ? <ChevronUp color={colors.subtext} size={18} /> : <ChevronDown color={colors.subtext} size={18} />}
          </Pressable>

          {advancedOpen ? (
            <FormSection icon={Settings2} title="高级配置">
              <FormField keyboardType="number-pad" label="代理 ID" onChangeText={setProxyId} placeholder="可选" value={proxyId} />
              <FormField keyboardType="number-pad" label="并发数" onChangeText={setConcurrency} placeholder="使用后端默认值" value={concurrency} />
              <FormField keyboardType="decimal-pad" label="负载系数" onChangeText={setLoadFactor} placeholder="使用后端默认值" value={loadFactor} />
              <FormField keyboardType="number-pad" label="优先级" onChangeText={setPriority} placeholder="使用后端默认值" value={priority} />
              <FormField keyboardType="decimal-pad" label="倍率" onChangeText={setRateMultiplier} placeholder="使用后端默认值" value={rateMultiplier} />
              <FormField label="账号过期时间" onChangeText={setExpiresAt} placeholder="例如：2026-12-31T23:59:59+08:00" value={expiresAt} />

              {(groupsQuery.data?.length ?? 0) > 0 ? (
                <>
                  <Text style={{ color: colors.subtext, fontSize: 12, fontWeight: '600', marginBottom: 7 }}>所属分组</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                    {groupsQuery.data?.map((group) => {
                      const selected = selectedGroupIds.includes(group.id);
                      return (
                        <Pressable
                          key={group.id}
                          onPress={() => toggleGroup(group.id)}
                          style={{
                            alignItems: 'center',
                            backgroundColor: selected ? colors.primary : colors.mutedCard,
                            borderColor: selected ? colors.primary : colors.border,
                            borderRadius: 999,
                            borderWidth: 1,
                            flexDirection: 'row',
                            gap: 5,
                            paddingHorizontal: 11,
                            paddingVertical: 8,
                          }}
                        >
                          {selected ? <Check color={colors.primaryText} size={13} /> : null}
                          <Text style={{ color: selected ? colors.primaryText : colors.text, fontSize: 11, fontWeight: '700' }}>{group.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : null}

              <ToggleRow label="过期后自动暂停" onValueChange={setAutoPauseOnExpired} value={autoPauseOnExpired} />
              <ToggleRow label="确认混合渠道风险" onValueChange={setConfirmMixedChannelRisk} value={confirmMixedChannelRisk} />
            </FormSection>
          ) : null}

          {formError ? (
            <View style={{ backgroundColor: colors.errorBg, borderColor: colors.danger, borderRadius: 8, borderWidth: 1, marginBottom: 12, padding: 12 }}>
              <Text style={{ color: colors.errorText, fontSize: 13, lineHeight: 19 }}>{formError}</Text>
            </View>
          ) : null}

          <Pressable
            disabled={!canSubmit || createMutation.isPending}
            onPress={() => {
              setFormError(null);
              createMutation.mutate();
            }}
            style={{
              alignItems: 'center',
              backgroundColor: !canSubmit || createMutation.isPending ? colors.disabled : colors.primary,
              borderRadius: 8,
              flexDirection: 'row',
              gap: 8,
              justifyContent: 'center',
              minHeight: 50,
              opacity: !canSubmit || createMutation.isPending ? 0.7 : 1,
              paddingHorizontal: 16,
            }}
          >
            <Plus color={colors.primaryText} size={18} />
            <Text style={{ color: colors.primaryText, fontSize: 14, fontWeight: '800' }}>
              {createMutation.isPending ? '创建中...' : '创建账号'}
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
