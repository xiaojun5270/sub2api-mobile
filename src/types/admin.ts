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
  total_tokens?: number;
  total_input_tokens?: number;
  total_output_tokens?: number;
  total_cost?: number;
  total_actual_cost?: number;
  total_account_cost?: number;
  average_duration_ms?: number;
};

export type DashboardSnapshot = {
  trend?: TrendPoint[];
  models?: ModelStat[];
  groups?: Array<{
    group_id?: number;
    group_name?: string;
    requests?: number;
    total_tokens?: number;
    total_cost?: number;
    total_actual_cost?: number;
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
  key: string;
  name: string;
  group_id?: number | null;
  status: string;
  quota: number;
  quota_used: number;
  last_used_at?: string | null;
  expires_at?: string | null;
  created_at?: string;
  updated_at?: string;
  usage_5h?: number;
  usage_1d?: number;
  usage_7d?: number;
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
  group_id?: number | null;
  quota?: number | null;
  expires_at?: string | null;
  status?: string;
};

export type UpdateApiKeyRequest = {
  name?: string;
  key?: string;
  group_id?: number | null;
  quota?: number | null;
  expires_at?: string | null;
  status?: string;
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
  account_count?: number;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
};

export type AccountTodayStats = {
  requests: number;
  tokens: number;
  cost: number;
  standard_cost?: number;
  user_cost?: number;
};

export type AdminAccount = {
  id: number;
  name: string;
  platform: string;
  type: string;
  status?: string;
  schedulable?: boolean;
  priority?: number;
  concurrency?: number;
  current_concurrency?: number;
  rate_multiplier?: number;
  error_message?: string;
  rate_limit_reset_at?: string | null;
  proxy_id?: number | null;
  privacy?: boolean;
  shadow?: boolean;
  temp_unschedulable_until?: string | null;
  updated_at?: string;
  last_used_at?: string | null;
  created_at?: string;
  group_ids?: number[];
  groups?: AdminGroup[];
  extra?: Record<string, string | number | boolean | null>;
  notes?: string | null;
};

export type AccountType = 'apikey' | 'oauth' | 'setup-token' | 'upstream';

export type CreateAccountRequest = {
  name: string;
  platform: string;
  type: AccountType;
  credentials: Record<string, string | number | boolean | null | undefined>;
  extra?: Record<string, string | number | boolean | null | undefined>;
  notes?: string;
  proxy_id?: number;
  concurrency?: number;
  priority?: number;
  rate_multiplier?: number;
  group_ids?: number[];
};

export type UpdateAccountRequest = Partial<CreateAccountRequest> & {
  status?: string;
  schedulable?: boolean;
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
