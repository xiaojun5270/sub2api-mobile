import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Linking from 'expo-linking';
import { Stack, router } from 'expo-router';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  Cloud,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  FileJson,
  Gem,
  KeyRound,
  Link2,
  Plus,
  RefreshCw,
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
import {
  createAccount,
  createAccountFromCodexPat,
  exchangeAccountAuthCode,
  exchangeAccountCookieAuth,
  exchangeOpenAiAuthCode,
  generateAccountAuthUrl,
  generateOpenAiAuthUrl,
  importCodexSessionAccount,
  listAllGroups,
  refreshOpenAiToken,
  type AccountAuthMethod,
} from '@/src/services/admin';
import type { AccountType, CreateAccountRequest } from '@/src/types/admin';

type PlatformId = 'openai' | 'gemini' | 'anthropic' | 'antigravity' | 'grok';
type FormAccountType = Extract<AccountType, 'apikey' | 'oauth' | 'setup-token' | 'service_account' | 'bedrock' | 'upstream'>;
type OAuthInputMethod = 'manual' | 'authorization' | 'session-key' | 'refresh-token' | 'mobile-refresh-token' | 'codex-session' | 'agent-identity' | 'codex-pat';

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
    { value: 'setup-token', label: 'Setup Token', subtitle: 'Claude Code', icon: Link2 },
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

const OAUTH_METHOD_META: Record<OAuthInputMethod, { label: string; icon: LucideIcon }> = {
  manual: { label: '手动凭证', icon: KeyRound },
  authorization: { label: '手动授权', icon: ExternalLink },
  'session-key': { label: 'Session Key', icon: ShieldCheck },
  'refresh-token': { label: '手动输入 RT', icon: RefreshCw },
  'mobile-refresh-token': { label: '手动输入 Mobile RT', icon: RefreshCw },
  'codex-session': { label: 'Codex OAuth auth.json / AT 导入', icon: FileJson },
  'agent-identity': { label: 'Agent Identity auth.json', icon: FileJson },
  'codex-pat': { label: 'Codex Personal Access Token', icon: KeyRound },
};

function getOAuthInputMethods(platform: PlatformId): OAuthInputMethod[] {
  if (platform === 'anthropic') return ['authorization', 'session-key', 'manual'];
  if (platform === 'openai') return ['authorization', 'refresh-token', 'mobile-refresh-token', 'codex-session', 'agent-identity', 'codex-pat'];
  return ['manual'];
}

function getDefaultOAuthInputMethod(platform: PlatformId) {
  return platform === 'openai' || platform === 'anthropic' ? 'authorization' : 'manual';
}

const OPENAI_MOBILE_RT_CLIENT_ID = 'app_LlGpXReQgckcGGUo2JrYvtJK';

async function pickTextDocument() {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: ['application/json', 'text/json', 'text/plain', 'application/octet-stream'],
  });
  if (result.canceled || !result.assets[0]) return undefined;

  const asset = result.assets[0];
  const content = Platform.OS === 'web' && asset.file
    ? await asset.file.text()
    : Platform.OS === 'web'
      ? await (await fetch(asset.uri)).text()
      : await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });

  return { content, name: asset.name };
}

function getUrlParameter(value: string, key: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const url = trimmed.includes('?')
      ? new URL(trimmed)
      : new URL(`http://localhost/callback?${trimmed.replace(/^\?/, '')}`);
    return url.searchParams.get(key)?.trim() ?? '';
  } catch {
    const match = trimmed.match(new RegExp(`[?&]${key}=([^&#]+)`));
    if (!match?.[1]) return '';
    try {
      return decodeURIComponent(match[1]).trim();
    } catch {
      return match[1].trim();
    }
  }
}

function parseAuthorizationInput(value: string, fallbackState: string) {
  const trimmed = value.trim();
  const parsedCode = trimmed.includes('code=') ? getUrlParameter(trimmed, 'code') : '';
  return {
    code: parsedCode || trimmed,
    state: getUrlParameter(trimmed, 'state') || fallbackState.trim(),
  };
}

function isAgentIdentityImportContent(content: string) {
  const isAgentIdentityValue = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.length > 0 && value.every(isAgentIdentityValue);
    if (!value || typeof value !== 'object') return false;
    const record = value as Record<string, unknown>;
    const authMode = record.auth_mode ?? record.authMode;
    const agentIdentity = record.agent_identity ?? record.agentIdentity;
    return (typeof authMode === 'string' && authMode.toLowerCase() === 'agentidentity')
      || Boolean(agentIdentity && typeof agentIdentity === 'object');
  };

  try {
    return isAgentIdentityValue(JSON.parse(content));
  } catch {
    const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) return false;
    try {
      return lines.every((line) => isAgentIdentityValue(JSON.parse(line)));
    } catch {
      return false;
    }
  }
}

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

function OAuthMethodSelector({
  methods,
  value,
  onChange,
}: {
  methods: OAuthInputMethod[];
  value: OAuthInputMethod;
  onChange: (value: OAuthInputMethod) => void;
}) {
  const colors = useAppTheme();

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
      {methods.map((method) => {
        const selected = value === method;
        const meta = OAUTH_METHOD_META[method];
        const Icon = meta.icon;
        return (
          <Pressable
            key={method}
            onPress={() => onChange(method)}
            style={{
              alignItems: 'center',
              backgroundColor: selected ? colors.primary : colors.mutedCard,
              borderColor: selected ? colors.primary : colors.border,
              borderRadius: 999,
              borderWidth: 1,
              flexDirection: 'row',
              maxWidth: '100%',
              gap: 6,
              paddingHorizontal: 11,
              paddingVertical: 8,
            }}
          >
            <Icon color={selected ? colors.primaryText : colors.badgeDefaultText} size={13} />
            <Text adjustsFontSizeToFit minimumFontScale={0.75} numberOfLines={1} style={{ color: selected ? colors.primaryText : colors.text, flexShrink: 1, fontSize: 11, fontWeight: '700' }}>{meta.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SegmentedOptions<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  const colors = useAppTheme();

  return (
    <View style={{ backgroundColor: colors.mutedCard, borderColor: colors.border, borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 4, marginBottom: 12, padding: 4 }}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={{ alignItems: 'center', backgroundColor: selected ? colors.primary : 'transparent', borderRadius: 6, flex: 1, justifyContent: 'center', minHeight: 36, paddingHorizontal: 6 }}
          >
            <Text adjustsFontSizeToFit numberOfLines={1} style={{ color: selected ? colors.primaryText : colors.text, fontSize: 11, fontWeight: '700' }}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function CreationSteps({ step }: { step: 1 | 2 }) {
  const colors = useAppTheme();

  return (
    <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginBottom: 14, minHeight: 42 }}>
      {[
        { value: 1 as const, label: '授权方式' },
        { value: 2 as const, label: 'OpenAI 账户授权' },
      ].map((item, index) => {
        const active = step >= item.value;
        return (
          <View key={item.value} style={{ alignItems: 'center', flexDirection: 'row' }}>
            {index > 0 ? <View style={{ backgroundColor: step >= 2 ? colors.primary : colors.border, height: 1, marginHorizontal: 10, width: 28 }} /> : null}
            <View style={{ alignItems: 'center', flexDirection: 'row', gap: 7 }}>
              <View style={{ alignItems: 'center', backgroundColor: active ? colors.primary : colors.mutedCard, borderColor: active ? colors.primary : colors.border, borderRadius: 999, borderWidth: 1, height: 27, justifyContent: 'center', width: 27 }}>
                <Text style={{ color: active ? colors.primaryText : colors.subtext, fontSize: 12, fontWeight: '800' }}>{item.value}</Text>
              </View>
              <Text numberOfLines={1} style={{ color: active ? colors.text : colors.subtext, fontSize: 12, fontWeight: active ? '700' : '500' }}>{item.label}</Text>
            </View>
          </View>
        );
      })}
    </View>
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

function optionalNumberList(raw: string, label: string) {
  if (!raw.trim()) return undefined;
  const parts = raw.split(',').map((item) => item.trim()).filter(Boolean);
  const values = parts.map(Number);
  if (values.length === 0 || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`${label}格式不正确。`);
  }
  return Array.from(new Set(values));
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
  const [formStep, setFormStep] = useState<1 | 2>(1);

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
  const [oauthInputMethod, setOauthInputMethod] = useState<OAuthInputMethod>('manual');
  const [authUrl, setAuthUrl] = useState('');
  const [authSessionId, setAuthSessionId] = useState('');
  const [authState, setAuthState] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [sessionKey, setSessionKey] = useState('');
  const [codexSessionContent, setCodexSessionContent] = useState('');
  const [codexSessionFileName, setCodexSessionFileName] = useState('');
  const [codexSessionLoading, setCodexSessionLoading] = useState(false);
  const [codexPat, setCodexPat] = useState('');

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
  const [quotaLimit, setQuotaLimit] = useState('');
  const [quotaDailyLimit, setQuotaDailyLimit] = useState('');
  const [quotaWeeklyLimit, setQuotaWeeklyLimit] = useState('');
  const [poolMode, setPoolMode] = useState(false);
  const [poolRetryCount, setPoolRetryCount] = useState('');
  const [poolRetryStatusCodes, setPoolRetryStatusCodes] = useState('401,403,429');
  const [customErrorCodesEnabled, setCustomErrorCodesEnabled] = useState(false);
  const [customErrorCodes, setCustomErrorCodes] = useState('');
  const [openAiPassthrough, setOpenAiPassthrough] = useState(false);
  const [openAiLongContextBilling, setOpenAiLongContextBilling] = useState(false);
  const [codexCliOnly, setCodexCliOnly] = useState(false);
  const [codexCliAppServer, setCodexCliAppServer] = useState(false);
  const [openAiWebSocketMode, setOpenAiWebSocketMode] = useState<'none' | 'ctx_pool' | 'passthrough'>('none');
  const [openAiCompactMode, setOpenAiCompactMode] = useState<'auto' | 'force_on' | 'force_off'>('auto');
  const [openAiResponsesMode, setOpenAiResponsesMode] = useState<'auto' | 'force_responses' | 'force_chat_completions'>('auto');
  const [anthropicPassthrough, setAnthropicPassthrough] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const groupsQuery = useQuery({
    queryKey: ['groups', 'all', platform],
    queryFn: () => listAllGroups({ platform, include_inactive: false }),
    staleTime: 120_000,
  });

  const availableTypes = TYPE_OPTIONS[platform];
  const isOAuthType = accountType === 'oauth' || accountType === 'setup-token';
  const usesGuidedOpenAiOAuth = platform === 'openai' && accountType === 'oauth';
  const availableOAuthMethods = getOAuthInputMethods(platform);
  const canSubmit = useMemo(() => {
    if (!name.trim()) return false;
    if (accountType === 'apikey' || accountType === 'upstream') return Boolean(apiKey.trim() && baseUrl.trim());
    if (accountType === 'oauth' || accountType === 'setup-token') {
      if (oauthInputMethod === 'authorization') return Boolean(authSessionId && authCode.trim());
      if (oauthInputMethod === 'session-key') return Boolean(sessionKey.trim());
      if (oauthInputMethod === 'refresh-token' || oauthInputMethod === 'mobile-refresh-token') return Boolean(refreshToken.trim());
      if (oauthInputMethod === 'codex-session' || oauthInputMethod === 'agent-identity') return Boolean(codexSessionContent.trim());
      if (oauthInputMethod === 'codex-pat') return Boolean(codexPat.trim());
      return Boolean(accessToken.trim());
    }
    if (accountType === 'service_account') return Boolean(serviceAccountJson.trim());
    if (accountType === 'bedrock') {
      return Boolean(bedrockRegion.trim() && bedrockAccessKeyId.trim() && bedrockSecretAccessKey.trim());
    }
    return false;
  }, [accessToken, accountType, apiKey, authCode, authSessionId, baseUrl, bedrockAccessKeyId, bedrockRegion, bedrockSecretAccessKey, codexPat, codexSessionContent, name, oauthInputMethod, refreshToken, serviceAccountJson, sessionKey]);

  function resetAuthorizationState() {
    setAuthUrl('');
    setAuthSessionId('');
    setAuthState('');
    setAuthCode('');
    setSessionKey('');
  }

  function selectPlatform(nextPlatform: PlatformId) {
    const nextTypes = TYPE_OPTIONS[nextPlatform];
    const nextAccountType = nextTypes.some((option) => option.value === accountType)
      ? accountType
      : nextTypes[0].value;
    setPlatform(nextPlatform);
    setAccountType(nextAccountType);
    setBaseUrl(DEFAULT_BASE_URL[nextPlatform]);
    setSelectedGroupIds([]);
    setFormError(null);
    setFormStep(1);
    setOauthInputMethod(nextAccountType === 'oauth' || nextAccountType === 'setup-token' ? getDefaultOAuthInputMethod(nextPlatform) : 'manual');
    resetAuthorizationState();
  }

  function selectAccountType(nextAccountType: FormAccountType) {
    setAccountType(nextAccountType);
    setFormStep(1);
    setOauthInputMethod(nextAccountType === 'oauth' || nextAccountType === 'setup-token' ? getDefaultOAuthInputMethod(platform) : 'manual');
    setFormError(null);
    resetAuthorizationState();
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
      const selected = await pickTextDocument();
      if (!selected) return;
      const parsed = JSON.parse(selected.content) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Service Account 文件格式不正确。');
      }

      const record = parsed as Record<string, unknown>;
      const detectedProjectId = firstText(record, ['project_id', 'projectId']);
      const detectedClientEmail = firstText(record, ['client_email', 'clientEmail']);
      setServiceAccountJson(selected.content);
      setServiceAccountFileName(selected.name);
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

  async function pickCodexSessionFile() {
    setCodexSessionLoading(true);
    setFormError(null);
    try {
      const selected = await pickTextDocument();
      if (!selected) return;
      if (!selected.content.trim()) throw new Error('Codex Session 文件为空。');
      setCodexSessionContent(selected.content);
      setCodexSessionFileName(selected.name);
      if (!name.trim()) setName(selected.name.replace(/\.[^.]+$/, ''));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '无法读取 Codex Session 文件。');
    } finally {
      setCodexSessionLoading(false);
    }
  }

  const authUrlMutation = useMutation({
    mutationFn: async () => {
      const resolvedProxyId = optionalNumber(proxyId, '代理 ID');
      const result = platform === 'openai'
        ? await generateOpenAiAuthUrl(resolvedProxyId)
        : await generateAccountAuthUrl(accountType === 'setup-token' ? 'setup-token' : 'oauth', resolvedProxyId);
      const nextAuthUrl = firstText(result, ['auth_url', 'authUrl']);
      const nextSessionId = firstText(result, ['session_id', 'sessionId']);
      if (!nextAuthUrl || !nextSessionId) throw new Error('后端未返回有效的授权链接。');
      return {
        authUrl: nextAuthUrl,
        sessionId: nextSessionId,
        state: platform === 'openai' ? getUrlParameter(nextAuthUrl, 'state') : '',
      };
    },
    onSuccess: ({ authUrl: nextAuthUrl, sessionId, state }) => {
      setAuthUrl(nextAuthUrl);
      setAuthSessionId(sessionId);
      setAuthState(state);
      setAuthCode('');
      void Linking.openURL(nextAuthUrl).catch(() => undefined);
    },
    onError: (error) => setFormError(getErrorMessage(error)),
  });

  function buildCredentials(): Record<string, unknown> {
    if (accountType === 'apikey' || accountType === 'upstream') {
      return {
        base_url: baseUrl.trim(),
        api_key: apiKey.trim(),
        ...(platform === 'gemini' ? { tier_id: geminiTier } : {}),
        quota_limit: optionalNumber(quotaLimit, '总额度'),
        quota_daily_limit: optionalNumber(quotaDailyLimit, '每日额度'),
        quota_weekly_limit: optionalNumber(quotaWeeklyLimit, '每周额度'),
        pool_mode: poolMode || undefined,
        pool_mode_retry_count: poolMode ? optionalNumber(poolRetryCount, '池模式重试次数') : undefined,
        pool_mode_retry_status_codes: poolMode ? optionalNumberList(poolRetryStatusCodes, '重试状态码') : undefined,
        custom_error_codes_enabled: customErrorCodesEnabled || undefined,
        custom_error_codes: customErrorCodesEnabled ? optionalNumberList(customErrorCodes, '自定义错误码') : undefined,
      };
    }

    if (accountType === 'oauth' || accountType === 'setup-token') {
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

  function buildPlatformExtra() {
    const extra: Record<string, unknown> = {};

    if (platform === 'openai') {
      const oauthAccount = accountType === 'oauth' || accountType === 'setup-token';
      const modeKey = oauthAccount
        ? 'openai_oauth_responses_websockets_v2_mode'
        : 'openai_apikey_responses_websockets_v2_mode';
      const enabledKey = oauthAccount
        ? 'openai_oauth_responses_websockets_v2_enabled'
        : 'openai_apikey_responses_websockets_v2_enabled';
      extra[modeKey] = openAiWebSocketMode;
      extra[enabledKey] = openAiWebSocketMode !== 'none';
      extra.openai_long_context_billing_enabled = openAiLongContextBilling;
      if (openAiPassthrough) extra.openai_passthrough = true;
      if (oauthAccount && codexCliOnly) {
        extra.codex_cli_only = true;
        if (codexCliAppServer) extra.codex_cli_only_allow_app_server = true;
      }
      if (openAiCompactMode !== 'auto') extra.openai_compact_mode = openAiCompactMode;
      if (!oauthAccount && openAiResponsesMode !== 'auto') extra.openai_responses_mode = openAiResponsesMode;
    }

    if (platform === 'anthropic' && accountType === 'apikey' && anthropicPassthrough) {
      extra.anthropic_passthrough = true;
    }

    return Object.keys(extra).length > 0 ? extra : undefined;
  }

  function buildCommonAccountFields() {
    return {
      name: name.trim(),
      notes: notes.trim() || undefined,
      proxy_id: optionalNumber(proxyId, '代理 ID') ?? null,
      concurrency: optionalNumber(concurrency, '并发数'),
      load_factor: optionalNumber(loadFactor, '负载系数') ?? null,
      priority: optionalNumber(priority, '优先级'),
      rate_multiplier: optionalNumber(rateMultiplier, '倍率'),
      group_ids: selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
      expires_at: expiresAt.trim() || null,
      auto_pause_on_expired: autoPauseOnExpired,
    };
  }

  function buildOAuthResponseExtra(credentials: Record<string, unknown>) {
    const extra: Record<string, unknown> = {};
    const orgUuid = firstText(credentials, ['org_uuid', 'orgUuid']);
    const accountUuid = firstText(credentials, ['account_uuid', 'accountUuid']);
    const emailAddress = firstText(credentials, ['email_address', 'emailAddress']);
    const email = firstText(credentials, ['email']);
    const displayName = firstText(credentials, ['name']);
    const privacyMode = firstText(credentials, ['privacy_mode', 'privacyMode']);
    if (orgUuid) extra.org_uuid = orgUuid;
    if (accountUuid) extra.account_uuid = accountUuid;
    if (emailAddress) extra.email_address = emailAddress;
    if (email) extra.email = email;
    if (displayName) extra.name = displayName;
    if (privacyMode) extra.privacy_mode = privacyMode;
    return Object.keys(extra).length > 0 ? extra : undefined;
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const common = buildCommonAccountFields();
      const platformExtra = buildPlatformExtra();

      if (isOAuthType && platform === 'openai' && (oauthInputMethod === 'codex-session' || oauthInputMethod === 'agent-identity')) {
        if (oauthInputMethod === 'agent-identity' && !isAgentIdentityImportContent(codexSessionContent.trim())) {
          throw new Error('Agent Identity auth.json 格式不正确。');
        }
        return importCodexSessionAccount({
          ...common,
          content: codexSessionContent.trim(),
          extra: platformExtra,
          update_existing: true,
        });
      }

      if (isOAuthType && platform === 'openai' && oauthInputMethod === 'codex-pat') {
        return createAccountFromCodexPat({
          ...common,
          access_token: codexPat.trim(),
          extra: platformExtra,
        });
      }

      let credentials = buildCredentials();
      let oauthResponseExtra: Record<string, unknown> | undefined;

      if (isOAuthType && (oauthInputMethod === 'refresh-token' || oauthInputMethod === 'mobile-refresh-token')) {
        if (platform !== 'openai') throw new Error('当前平台不支持 Refresh Token 创建。');
        credentials = await refreshOpenAiToken({
          refresh_token: refreshToken.trim(),
          proxy_id: common.proxy_id ?? undefined,
          client_id: oauthInputMethod === 'mobile-refresh-token'
            ? OPENAI_MOBILE_RT_CLIENT_ID
            : clientId.trim() || undefined,
        });
        if (oauthInputMethod === 'mobile-refresh-token') credentials.client_id = OPENAI_MOBILE_RT_CLIENT_ID;
        oauthResponseExtra = buildOAuthResponseExtra(credentials);
      } else if (isOAuthType && oauthInputMethod === 'authorization') {
        if (platform === 'openai') {
          const parsed = parseAuthorizationInput(authCode, authState);
          if (!parsed.code || !parsed.state) throw new Error('授权回调中缺少 code 或 state。');
          credentials = await exchangeOpenAiAuthCode({
            session_id: authSessionId,
            code: parsed.code,
            state: parsed.state,
            proxy_id: common.proxy_id,
          });
        } else {
          const method: AccountAuthMethod = accountType === 'setup-token' ? 'setup-token' : 'oauth';
          credentials = await exchangeAccountAuthCode(method, {
            session_id: authSessionId,
            code: authCode.trim(),
            proxy_id: common.proxy_id,
          });
        }
        oauthResponseExtra = buildOAuthResponseExtra(credentials);
      } else if (isOAuthType && oauthInputMethod === 'session-key') {
        const method: AccountAuthMethod = accountType === 'setup-token' ? 'setup-token' : 'oauth';
        credentials = await exchangeAccountCookieAuth(method, sessionKey.trim(), common.proxy_id);
        oauthResponseExtra = buildOAuthResponseExtra(credentials);
      }

      const payload: CreateAccountRequest = {
        ...common,
        platform,
        type: accountType,
        credentials,
        extra: platformExtra || oauthResponseExtra
          ? { ...platformExtra, ...oauthResponseExtra }
          : undefined,
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
          {usesGuidedOpenAiOAuth ? <CreationSteps step={formStep} /> : null}

          {!usesGuidedOpenAiOAuth || formStep === 1 ? (
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
                  onPress={() => selectAccountType(option.value)}
                  option={option}
                  selected={accountType === option.value}
                />
              ))}
            </View>
            </FormSection>
          ) : null}

          {!usesGuidedOpenAiOAuth || formStep === 2 ? (
            <FormSection icon={KeyRound} title={usesGuidedOpenAiOAuth ? 'OpenAI 账户授权' : '凭证信息'}>
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

            {isOAuthType ? (
              <>
                <Text style={{ color: colors.subtext, fontSize: 12, fontWeight: '600', marginBottom: 7 }}>
                  {usesGuidedOpenAiOAuth ? 'Authorization Method' : '添加方式'}
                </Text>
                <OAuthMethodSelector
                  methods={availableOAuthMethods}
                  onChange={(method) => {
                    setOauthInputMethod(method);
                    setFormError(null);
                  }}
                  value={oauthInputMethod}
                />

                {oauthInputMethod === 'manual' ? (
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

                {oauthInputMethod === 'authorization' ? (
                  <>
                    <View style={{ alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 9 }}>
                      <View style={{ alignItems: 'center', backgroundColor: colors.primary, borderRadius: 999, height: 23, justifyContent: 'center', width: 23 }}>
                        <Text style={{ color: colors.primaryText, fontSize: 11, fontWeight: '800' }}>1</Text>
                      </View>
                      <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>生成授权链接</Text>
                    </View>
                    <Pressable
                      disabled={authUrlMutation.isPending}
                      onPress={() => {
                        setFormError(null);
                        authUrlMutation.mutate();
                      }}
                      style={{
                        alignItems: 'center',
                        backgroundColor: colors.primary,
                        borderRadius: 8,
                        flexDirection: 'row',
                        gap: 7,
                        justifyContent: 'center',
                        marginBottom: 12,
                        minHeight: 46,
                        opacity: authUrlMutation.isPending ? 0.7 : 1,
                        paddingHorizontal: 12,
                      }}
                    >
                      <Link2 color={colors.primaryText} size={16} />
                      <Text style={{ color: colors.primaryText, fontSize: 13, fontWeight: '800' }}>
                        {authUrlMutation.isPending ? '生成中...' : authUrl ? '重新生成授权链接' : '生成并打开授权链接'}
                      </Text>
                    </Pressable>

                    {authUrl ? (
                      <View
                        style={{
                          alignItems: 'center',
                          backgroundColor: colors.mutedCard,
                          borderColor: colors.border,
                          borderRadius: 8,
                          borderWidth: 1,
                          flexDirection: 'row',
                          gap: 7,
                          marginBottom: 12,
                          minHeight: 48,
                          paddingHorizontal: 11,
                        }}
                      >
                        <Text numberOfLines={1} style={{ color: colors.subtext, flex: 1, fontSize: 11 }}>{authUrl}</Text>
                        <Pressable
                          accessibilityLabel="复制授权链接"
                          hitSlop={8}
                          onPress={() => void Clipboard.setStringAsync(authUrl)}
                          style={{ alignItems: 'center', height: 34, justifyContent: 'center', width: 34 }}
                        >
                          <Copy color={colors.primary} size={16} />
                        </Pressable>
                        <Pressable
                          accessibilityLabel="打开授权链接"
                          hitSlop={8}
                          onPress={() => void Linking.openURL(authUrl)}
                          style={{ alignItems: 'center', height: 34, justifyContent: 'center', width: 34 }}
                        >
                          <ExternalLink color={colors.primary} size={16} />
                        </Pressable>
                      </View>
                    ) : null}

                    <View style={{ borderTopColor: colors.border, borderTopWidth: 1, marginTop: 2, paddingTop: 12 }}>
                      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 7 }}>
                        <View style={{ alignItems: 'center', backgroundColor: colors.primary, borderRadius: 999, height: 23, justifyContent: 'center', width: 23 }}>
                          <Text style={{ color: colors.primaryText, fontSize: 11, fontWeight: '800' }}>2</Text>
                        </View>
                        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>在浏览器中完成授权</Text>
                      </View>
                      <Text style={{ color: colors.subtext, fontSize: 11, lineHeight: 17, marginBottom: 12, marginLeft: 31 }}>
                        浏览器跳转到 localhost 回调页后，复制完整地址或 code 参数。
                      </Text>
                    </View>

                    <View style={{ borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 12 }}>
                      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                        <View style={{ alignItems: 'center', backgroundColor: colors.primary, borderRadius: 999, height: 23, justifyContent: 'center', width: 23 }}>
                          <Text style={{ color: colors.primaryText, fontSize: 11, fontWeight: '800' }}>3</Text>
                        </View>
                        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>输入授权链接或 Code</Text>
                      </View>
                      <FormField
                        label="授权链接或 Code"
                        multiline
                        onChangeText={setAuthCode}
                        placeholder="粘贴完整回调链接，或仅粘贴 code 参数"
                        required
                        value={authCode}
                      />
                    </View>
                  </>
                ) : null}

                {oauthInputMethod === 'session-key' ? (
                  <FormField label="Session Key" onChangeText={setSessionKey} placeholder="输入 Session Key" required secure value={sessionKey} />
                ) : null}

                {oauthInputMethod === 'refresh-token' || oauthInputMethod === 'mobile-refresh-token' ? (
                  <>
                    <FormField
                      label={oauthInputMethod === 'mobile-refresh-token' ? 'Mobile Refresh Token' : 'Refresh Token'}
                      onChangeText={setRefreshToken}
                      placeholder={oauthInputMethod === 'mobile-refresh-token' ? '输入 Mobile RT' : '输入 RT'}
                      required
                      secure
                      value={refreshToken}
                    />
                    {oauthInputMethod === 'refresh-token' ? (
                      <FormField label="Client ID" onChangeText={setClientId} placeholder="默认使用 Codex CLI Client ID" value={clientId} />
                    ) : null}
                  </>
                ) : null}

                {oauthInputMethod === 'codex-session' || oauthInputMethod === 'agent-identity' ? (
                  <>
                    <Pressable
                      disabled={codexSessionLoading}
                      onPress={() => void pickCodexSessionFile()}
                      style={{
                        alignItems: 'center',
                        backgroundColor: codexSessionContent ? colors.successBg : colors.mutedCard,
                        borderColor: codexSessionContent ? colors.success : colors.border,
                        borderRadius: 8,
                        borderStyle: 'dashed',
                        borderWidth: 1.5,
                        flexDirection: 'row',
                        gap: 11,
                        marginBottom: 12,
                        minHeight: 62,
                        paddingHorizontal: 13,
                      }}
                    >
                      <FileJson color={codexSessionContent ? colors.success : colors.primary} size={21} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>
                          {codexSessionLoading
                            ? '读取中...'
                            : codexSessionFileName
                              || (oauthInputMethod === 'agent-identity' ? '选择 Agent Identity auth.json' : '选择 Codex OAuth auth.json')}
                        </Text>
                        <Text style={{ color: colors.subtext, fontSize: 11, marginTop: 3 }}>
                          {codexSessionContent ? '文件已读取' : oauthInputMethod === 'agent-identity' ? 'Agent Identity JSON' : 'auth.json 或 Access Token'}
                        </Text>
                      </View>
                      {codexSessionContent ? <Check color={colors.success} size={18} /> : null}
                    </Pressable>
                    <FormField
                      label={oauthInputMethod === 'agent-identity' ? 'Agent Identity 内容' : 'auth.json / Access Token'}
                      multiline
                      onChangeText={setCodexSessionContent}
                      placeholder={oauthInputMethod === 'agent-identity' ? '也可以直接粘贴 Agent Identity JSON' : '也可以直接粘贴 auth.json 或 Access Token'}
                      required
                      value={codexSessionContent}
                    />
                  </>
                ) : null}

                {oauthInputMethod === 'codex-pat' ? (
                  <FormField label="Codex PAT" onChangeText={setCodexPat} placeholder="输入 Codex PAT" required secure value={codexPat} />
                ) : null}
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
          ) : null}

          {!usesGuidedOpenAiOAuth || formStep === 1 ? (
            <>
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

              {accountType === 'apikey' || accountType === 'upstream' ? (
                <View style={{ borderTopColor: colors.border, borderTopWidth: 1, marginTop: 2, paddingTop: 14 }}>
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', marginBottom: 12 }}>额度与重试</Text>
                  <FormField keyboardType="decimal-pad" label="总额度" onChangeText={setQuotaLimit} placeholder="可选" value={quotaLimit} />
                  <FormField keyboardType="decimal-pad" label="每日额度" onChangeText={setQuotaDailyLimit} placeholder="可选" value={quotaDailyLimit} />
                  <FormField keyboardType="decimal-pad" label="每周额度" onChangeText={setQuotaWeeklyLimit} placeholder="可选" value={quotaWeeklyLimit} />
                  <ToggleRow label="池模式" onValueChange={setPoolMode} value={poolMode} />
                  {poolMode ? (
                    <>
                      <FormField keyboardType="number-pad" label="重试次数" onChangeText={setPoolRetryCount} placeholder="使用后端默认值" value={poolRetryCount} />
                      <FormField label="重试状态码" onChangeText={setPoolRetryStatusCodes} placeholder="401,403,429" value={poolRetryStatusCodes} />
                    </>
                  ) : null}
                  <ToggleRow label="自定义错误码" onValueChange={setCustomErrorCodesEnabled} value={customErrorCodesEnabled} />
                  {customErrorCodesEnabled ? (
                    <FormField label="错误码" onChangeText={setCustomErrorCodes} placeholder="例如：400,401,403" required value={customErrorCodes} />
                  ) : null}
                </View>
              ) : null}

              {platform === 'openai' ? (
                <View style={{ borderTopColor: colors.border, borderTopWidth: 1, marginTop: 2, paddingTop: 14 }}>
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', marginBottom: 12 }}>OpenAI 配置</Text>
                  <ToggleRow label="上游透传" onValueChange={setOpenAiPassthrough} value={openAiPassthrough} />
                  <ToggleRow label="长上下文计费" onValueChange={setOpenAiLongContextBilling} value={openAiLongContextBilling} />
                  {isOAuthType ? (
                    <>
                      <ToggleRow label="仅 Codex CLI" onValueChange={setCodexCliOnly} value={codexCliOnly} />
                      {codexCliOnly ? (
                        <ToggleRow label="允许 App Server" onValueChange={setCodexCliAppServer} value={codexCliAppServer} />
                      ) : null}
                    </>
                  ) : null}

                  <Text style={{ color: colors.subtext, fontSize: 12, fontWeight: '600', marginBottom: 7 }}>WebSocket 模式</Text>
                  <SegmentedOptions
                    onChange={setOpenAiWebSocketMode}
                    options={[
                      { value: 'none', label: '关闭' },
                      { value: 'ctx_pool', label: '上下文池' },
                      { value: 'passthrough', label: '透传' },
                    ]}
                    value={openAiWebSocketMode}
                  />

                  <Text style={{ color: colors.subtext, fontSize: 12, fontWeight: '600', marginBottom: 7 }}>Compact 模式</Text>
                  <SegmentedOptions
                    onChange={setOpenAiCompactMode}
                    options={[
                      { value: 'auto', label: '自动' },
                      { value: 'force_on', label: '强制开启' },
                      { value: 'force_off', label: '强制关闭' },
                    ]}
                    value={openAiCompactMode}
                  />

                  {!isOAuthType ? (
                    <>
                      <Text style={{ color: colors.subtext, fontSize: 12, fontWeight: '600', marginBottom: 7 }}>Responses 模式</Text>
                      <SegmentedOptions
                        onChange={setOpenAiResponsesMode}
                        options={[
                          { value: 'auto', label: '自动' },
                          { value: 'force_responses', label: 'Responses' },
                          { value: 'force_chat_completions', label: 'Chat Completions' },
                        ]}
                        value={openAiResponsesMode}
                      />
                    </>
                  ) : null}
                </View>
              ) : null}

              {platform === 'anthropic' && accountType === 'apikey' ? (
                <View style={{ borderTopColor: colors.border, borderTopWidth: 1, marginTop: 2, paddingTop: 14 }}>
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', marginBottom: 12 }}>Anthropic 配置</Text>
                  <ToggleRow label="上游透传" onValueChange={setAnthropicPassthrough} value={anthropicPassthrough} />
                </View>
              ) : null}

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
            </>
          ) : null}

          {formError ? (
            <View style={{ backgroundColor: colors.errorBg, borderColor: colors.danger, borderRadius: 8, borderWidth: 1, marginBottom: 12, padding: 12 }}>
              <Text style={{ color: colors.errorText, fontSize: 13, lineHeight: 19 }}>{formError}</Text>
            </View>
          ) : null}

          {usesGuidedOpenAiOAuth && formStep === 1 ? (
            <Pressable
              disabled={!name.trim()}
              onPress={() => {
                setFormError(null);
                setAdvancedOpen(false);
                setFormStep(2);
              }}
              style={{
                alignItems: 'center',
                backgroundColor: name.trim() ? colors.primary : colors.disabled,
                borderRadius: 8,
                flexDirection: 'row',
                gap: 8,
                justifyContent: 'center',
                minHeight: 50,
                opacity: name.trim() ? 1 : 0.7,
                paddingHorizontal: 16,
              }}
            >
              <Text style={{ color: colors.primaryText, fontSize: 14, fontWeight: '800' }}>下一步</Text>
              <ArrowRight color={colors.primaryText} size={18} />
            </Pressable>
          ) : usesGuidedOpenAiOAuth ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                disabled={createMutation.isPending}
                onPress={() => {
                  setFormError(null);
                  setFormStep(1);
                }}
                style={{
                  alignItems: 'center',
                  backgroundColor: colors.mutedCard,
                  borderColor: colors.border,
                  borderRadius: 8,
                  borderWidth: 1,
                  flex: 1,
                  flexDirection: 'row',
                  gap: 7,
                  justifyContent: 'center',
                  minHeight: 50,
                }}
              >
                <ArrowLeft color={colors.text} size={17} />
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>返回</Text>
              </Pressable>
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
                  flex: 1.4,
                  flexDirection: 'row',
                  gap: 8,
                  justifyContent: 'center',
                  minHeight: 50,
                  opacity: !canSubmit || createMutation.isPending ? 0.7 : 1,
                  paddingHorizontal: 12,
                }}
              >
                <ShieldCheck color={colors.primaryText} size={18} />
                <Text style={{ color: colors.primaryText, fontSize: 14, fontWeight: '800' }}>
                  {createMutation.isPending ? '授权中...' : '完成授权'}
                </Text>
              </Pressable>
            </View>
          ) : (
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
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
