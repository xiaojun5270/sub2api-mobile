export type ApiEnvelope<T> = {
  code: number;
  message: string;
  reason?: string;
  metadata?: Record<string, string>;
  data?: T;
};

export type PaginatedData<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
};

export type DashboardStats = {
  total_users: number;
  today_new_users: number;
  active_users: number;
  total_api_keys: number;
  active_api_keys: number;
  total_accounts: number;
  normal_accounts: number;
  error_accounts: number;
  total_requests: number;
  total_cost: number;
  total_tokens: number;
  today_requests: number;
  today_cost: number;
  today_tokens: number;
  today_input_tokens?: number;
  today_output_tokens?: number;
  today_cache_read_tokens?: number;
  rpm: number;
  tpm: number;
};

export type TrendPoint = {
  date: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  total_tokens: number;
  cost: number;
  actual_cost: number;
};

export type DashboardTrend = {
  start_date: string;
  end_date: string;
  granularity: 'day' | 'hour' | string;
  trend: TrendPoint[];
};

export type ModelStat = {
  model: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  total_tokens: number;
  cost: number;
  actual_cost: number;
};

export type DashboardModelStats = {
  start_date: string;
  end_date: string;
  models: ModelStat[];
};

export type UsageStats = {
  total_requests?: number;
  request_count?: number;
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_tokens?: number;
  cache_read_tokens?: number;
  total_tokens?: number;
  total_input_tokens?: number;
  total_output_tokens?: number;
  total_cost?: number;
  total_actual_cost?: number;
  total_account_cost?: number;
  actual_cost?: number;
  account_cost?: number;
  duration_ms?: number;
  avg_duration_ms?: number;
  first_token_ms?: number;
  avg_first_token_ms?: number;
  models?: Array<Record<string, unknown>>;
  endpoints?: unknown[];
  upstream_endpoints?: unknown[];
  endpoint_paths?: unknown[];
  average_duration_ms?: number;
};

export type AdminUsageListParams = {
  page?: number;
  page_size?: number;
  exact_total?: boolean;
  start_date?: string;
  end_date?: string;
  user_id?: number;
  api_key_id?: number;
  account_id?: number;
  group_id?: number;
  model?: string;
  request_type?: string | number;
  stream?: boolean;
  billing_type?: string | number;
  billing_mode?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  timezone?: string;
  nocache?: number;
};

export type AdminUsageRecord = {
  id: number | string;
  user_id?: number;
  api_key_id?: number;
  account_id?: number;
  group_id?: number | null;
  subscription_id?: number | null;
  request_id?: string | null;
  model?: string;
  requested_model?: string | null;
  upstream_model?: string | null;
  model_mapping_chain?: string | null;
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_tokens?: number;
  cache_read_tokens?: number;
  cache_creation_5m_tokens?: number;
  cache_creation_1h_tokens?: number;
  image_output_tokens?: number;
  input_cost?: number;
  output_cost?: number;
  cache_creation_cost?: number;
  cache_read_cost?: number;
  image_output_cost?: number;
  total_cost?: number;
  actual_cost?: number;
  account_stats_cost?: number | null;
  rate_multiplier?: number;
  account_rate_multiplier?: number | null;
  stream?: boolean;
  request_type?: string | number;
  billing_type?: string | number;
  billing_mode?: string | null;
  billing_tier?: string | null;
  duration_ms?: number | null;
  first_token_ms?: number | null;
  created_at?: string;
  user_agent?: string | null;
  ip_address?: string | null;
  reasoning_effort?: string | null;
  service_tier?: string | null;
  inbound_endpoint?: string | null;
  upstream_endpoint?: string | null;
  channel_id?: number | null;
  user?: {
    id?: number;
    email?: string;
    username?: string | null;
    deleted?: boolean;
    status?: string;
    role?: string;
  };
  api_key?: {
    id?: number;
    name?: string;
    key?: string;
    status?: string;
  };
  account?: {
    id?: number;
    name?: string;
    platform?: string;
    type?: string;
  };
  group?: {
    id?: number;
    name?: string;
    group_name?: string;
  };
  [key: string]: unknown;
};

export type UsageCleanupTask = {
  id: number | string;
  status?: string;
  filters?: Record<string, unknown>;
  created_by?: number;
  deleted_rows?: number;
  error_message?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at?: string;
  updated_at?: string;
  canceled_by?: number | null;
  canceled_at?: string | null;
};

export type CreateUsageCleanupTaskRequest = {
  start_date: string;
  end_date: string;
  timezone: string;
  user_id?: number;
  api_key_id?: number;
  account_id?: number;
  group_id?: number;
  model?: string;
  request_type?: string | number;
  stream?: boolean;
  billing_type?: string | number;
};

export type DashboardSnapshot = {
  trend?: TrendPoint[];
  models?: ModelStat[];
  groups?: Array<{
    group_id?: number;
    groupId?: number;
    group_name?: string;
    groupName?: string;
    name?: string;
    requests?: number;
    total_requests?: number;
    tokens?: number;
    total_tokens?: number;
    cost?: number;
    total_cost?: number;
    actual_cost?: number;
    total_actual_cost?: number;
    standard_cost?: number;
  }>;
};

export type AdminSettings = {
  site_name?: string;
  [key: string]: string | number | boolean | null | string[] | undefined;
};

export type AdminUser = {
  id: number;
  email: string;
  username?: string | null;
  balance?: number;
  concurrency?: number;
  status?: string;
  role?: string;
  current_concurrency?: number;
  notes?: string | null;
  last_used_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type UserUsageSummary = {
  total_requests?: number;
  total_tokens?: number;
  total_cost?: number;
  requests?: number;
  tokens?: number;
  cost?: number;
  [key: string]: string | number | boolean | null | undefined;
};

export type AdminApiKey = {
  id: number;
  user_id: number;
  user_email?: string;
  key: string;
  custom_key?: string;
  name: string;
  group_id?: number | null;
  group_name?: string | null;
  status: string;
  quota: number;
  quota_used: number;
  ip_whitelist?: string | string[] | null;
  ip_blacklist?: string | string[] | null;
  rate_limit_5h?: number;
  rate_limit_1d?: number;
  rate_limit_7d?: number;
  last_used_at?: string | null;
  expires_at?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  usage_5h?: number;
  usage_1d?: number;
  usage_7d?: number;
  window_5h_start?: string | null;
  window_1d_start?: string | null;
  window_7d_start?: string | null;
  group?: AdminGroup;
  user?: {
    id: number;
    email?: string;
    username?: string | null;
  };
};

export type CreateApiKeyRequest = {
  user_id?: number;
  name?: string;
  key?: string;
  custom_key?: string;
  group_id?: number | null;
  quota?: number | null;
  expires_at?: string | null;
  expires_in_days?: number | null;
  ip_whitelist?: string | string[] | null;
  ip_blacklist?: string | string[] | null;
  rate_limit_5h?: number | null;
  rate_limit_1d?: number | null;
  rate_limit_7d?: number | null;
  status?: string;
};

export type UpdateApiKeyRequest = {
  name?: string;
  key?: string;
  custom_key?: string;
  group_id?: number | null;
  quota?: number | null;
  expires_at?: string | null;
  ip_whitelist?: string | string[] | null;
  ip_blacklist?: string | string[] | null;
  rate_limit_5h?: number | null;
  rate_limit_1d?: number | null;
  rate_limit_7d?: number | null;
  status?: string;
  reset_quota?: boolean;
  reset_rate_limit_usage?: boolean;
};

export type BalanceOperation = 'set' | 'add' | 'subtract';

export type AdminGroup = {
  id: number;
  name: string;
  description?: string | null;
  platform: string;
  rate_multiplier?: number;
  is_exclusive?: boolean;
  status?: string;
  subscription_type?: string;
  daily_limit_usd?: number | null;
  weekly_limit_usd?: number | null;
  monthly_limit_usd?: number | null;
  default_validity_days?: number | null;
  active_account_count?: number;
  rate_limited_account_count?: number;
  account_count?: number;
  rpm_limit?: number | null;
  allow_image_generation?: boolean;
  image_rate_independent?: boolean;
  image_rate_multiplier?: number | null;
  image_price_1k?: number | null;
  image_price_2k?: number | null;
  image_price_4k?: number | null;
  peak_rate_enabled?: boolean;
  peak_start?: string | null;
  peak_end?: string | null;
  peak_rate_multiplier?: number | null;
  claude_code_only?: boolean;
  fallback_group_id?: number | null;
  fallback_group_id_on_invalid_request?: number | null;
  allow_messages_dispatch?: boolean;
  require_oauth_only?: boolean;
  require_privacy_set?: boolean;
  model_routing_enabled?: boolean;
  mcp_xml_inject?: boolean;
  supported_model_scopes?: string[];
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
};

export type GroupListParams = {
  page?: number;
  page_size?: number;
  platform?: string;
  status?: string;
  is_exclusive?: boolean | null;
  search?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
};

export type GroupRequest = {
  name: string;
  description?: string | null;
  platform: string;
  rate_multiplier?: number;
  is_exclusive?: boolean;
  status?: string;
  subscription_type?: string;
  daily_limit_usd?: number | null;
  weekly_limit_usd?: number | null;
  monthly_limit_usd?: number | null;
  allow_image_generation?: boolean;
  image_rate_independent?: boolean;
  image_rate_multiplier?: number;
  image_price_1k?: number | null;
  image_price_2k?: number | null;
  image_price_4k?: number | null;
  peak_rate_enabled?: boolean;
  peak_start?: string;
  peak_end?: string;
  peak_rate_multiplier?: number;
  claude_code_only?: boolean;
  fallback_group_id?: number | null;
  fallback_group_id_on_invalid_request?: number | null;
  allow_messages_dispatch?: boolean;
  require_oauth_only?: boolean;
  require_privacy_set?: boolean;
  model_routing_enabled?: boolean;
  mcp_xml_inject?: boolean;
  supported_model_scopes?: string[];
  rpm_limit?: number;
};

export type GroupUsageSummary = {
  group_id: number;
  today_cost?: number;
  total_cost?: number;
};

export type GroupCapacitySummary = {
  group_id: number;
  concurrency_used?: number;
  concurrency_max?: number;
  sessions_used?: number;
  sessions_max?: number;
  rpm_used?: number;
  rpm_max?: number;
};

export type AccountTodayStats = {
  requests: number;
  tokens: number;
  cost: number;
  standard_cost: number;
  user_cost: number;
};

export type AccountListParams = {
  page?: number;
  page_size?: number;
  platform?: string;
  type?: string;
  status?: string;
  group?: string | number;
  privacy_mode?: string;
  search?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  timezone?: string;
};

export type AdminAccountModel = {
  id?: string;
  display_name?: string;
  model?: string;
  name?: string;
  owned_by?: string;
  context_window?: number;
  available?: boolean;
  enabled?: boolean;
  source?: string;
  status?: string;
  [key: string]: string | number | boolean | null | undefined;
};

export type AdminAccount = {
  id: number;
  name: string;
  notes?: string | null;
  platform: string;
  type: string;
  status?: string;
  schedulable?: boolean;
  priority?: number;
  concurrency?: number;
  current_concurrency?: number;
  load_factor?: number | null;
  rate_multiplier?: number;
  credentials?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  error?: string | null;
  error_code?: number | null;
  error_message?: string;
  rate_limit_reset_at?: string | null;
  proxy_id?: number | null;
  proxy?: Record<string, unknown> | null;
  privacy?: boolean;
  privacy_mode?: string | null;
  shadow?: boolean;
  temp_unschedulable_until?: string | null;
  expires_at?: string | null;
  auto_pause_on_expired?: boolean;
  quota?: Record<string, unknown>;
  usage?: Record<string, unknown>;
  updated_at?: string;
  last_used_at?: string | null;
  created_at?: string;
  group_ids?: number[];
  groups?: AdminGroup[];
  group_name?: string | null;
  [key: string]: unknown;
};

export type AccountType = 'apikey' | 'oauth' | 'service_account' | 'bedrock' | 'setup-token' | 'upstream';

export type AccountRequestObject = Record<string, unknown>;

export type CreateAccountRequest = {
  name: string;
  notes?: string | null;
  platform: string;
  type: AccountType;
  credentials: AccountRequestObject;
  extra?: AccountRequestObject;
  proxy_id?: number | null;
  concurrency?: number;
  load_factor?: number | null;
  priority?: number;
  rate_multiplier?: number;
  group_ids?: number[];
  expires_at?: string | null;
  auto_pause_on_expired?: boolean;
  confirm_mixed_channel_risk?: boolean;
};

export type UpdateAccountRequest = Partial<CreateAccountRequest> & {
  status?: string;
  schedulable?: boolean;
  privacy_mode?: string;
};

export type AccountBulkUpdateRequest = {
  account_ids: number[];
  status?: string;
  proxy_id?: number | null;
  group_ids?: number[];
  concurrency?: number;
  priority?: number;
  rate_multiplier?: number;
  privacy_mode?: string;
};

export type AccountDataImportResult = {
  account_created?: number;
  account_failed?: number;
  proxy_created?: number;
  proxy_reused?: number;
  proxy_failed?: number;
  errors?: unknown[];
  [key: string]: unknown;
};

export type CreateUserRequest = {
  email: string;
  password: string;
  username?: string;
  notes?: string;
  role?: 'user' | 'admin';
  status?: 'active' | 'disabled';
  balance?: number;
  concurrency?: number;
  [key: string]: string | number | boolean | null | undefined;
};

export type OpsMetricPoint = {
  date?: string;
  time?: string;
  label?: string;
  value?: number;
  count?: number;
  requests?: number;
  errors?: number;
  latency_ms?: number;
  [key: string]: string | number | boolean | null | undefined;
};

export type OpsRecord = {
  id?: number | string;
  status?: string;
  level?: string;
  method?: string;
  path?: string;
  model?: string;
  account_name?: string;
  user_email?: string;
  message?: string;
  error_message?: string;
  upstream_error?: string;
  latency_ms?: number;
  duration_ms?: number;
  created_at?: string;
  updated_at?: string;
  resolved_at?: string | null;
  [key: string]: string | number | boolean | null | undefined;
};

export type OpsDashboardOverview = {
  requests?: number;
  total_requests?: number;
  errors?: number;
  error_count?: number;
  error_rate?: number;
  avg_latency_ms?: number;
  p95_latency_ms?: number;
  qps?: number;
  rpm?: number;
  active_accounts?: number;
  alert_count?: number;
  [key: string]: string | number | boolean | null | undefined;
};

export type OpsDashboardSnapshot = {
  overview?: OpsDashboardOverview;
  realtime?: Record<string, unknown>;
  error_trend?: OpsMetricPoint[];
  throughput_trend?: OpsMetricPoint[];
  latency_histogram?: OpsMetricPoint[];
  error_distribution?: OpsMetricPoint[];
  openai_token_stats?: Record<string, unknown>;
  [key: string]: unknown;
};
