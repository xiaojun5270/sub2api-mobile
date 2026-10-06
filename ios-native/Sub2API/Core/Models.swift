import Foundation

struct ServerProfile: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    var label: String
    var baseURL: String
    var username: String?
    var authMode: String?
    var updatedAt: Date
}

struct AdminSettings: Decodable, Sendable {
    let siteName: String?

    enum CodingKeys: String, CodingKey {
        case siteName = "site_name"
    }
}

struct Page<Item: Decodable & Sendable>: Decodable, Sendable {
    let items: [Item]
    let total: Int
    let page: Int
    let pageSize: Int
    let pages: Int

    enum CodingKeys: String, CodingKey {
        case items, total, page, pages
        case pageSize = "page_size"
    }

    init(items: [Item], total: Int? = nil, page: Int = 1, pageSize: Int? = nil, pages: Int = 1) {
        self.items = items
        self.total = total ?? items.count
        self.page = page
        self.pageSize = pageSize ?? max(items.count, 1)
        self.pages = pages
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        items = try container.decodeIfPresent([Item].self, forKey: .items) ?? []
        total = try container.decodeIfPresent(Int.self, forKey: .total) ?? items.count
        page = try container.decodeIfPresent(Int.self, forKey: .page) ?? 1
        pageSize = try container.decodeIfPresent(Int.self, forKey: .pageSize) ?? max(items.count, 1)
        pages = try container.decodeIfPresent(Int.self, forKey: .pages) ?? 1
    }
}

struct DashboardStats: Decodable, Sendable {
    let totalUsers: Double?
    let todayNewUsers: Double?
    let activeUsers: Double?
    let totalAPIKeys: Double?
    let activeAPIKeys: Double?
    let totalAccounts: Double?
    let normalAccounts: Double?
    let errorAccounts: Double?
    let totalRequests: Double?
    let totalCost: Double?
    let totalTokens: Double?
    let todayRequests: Double?
    let todayCost: Double?
    let todayTokens: Double?
    let todayInputTokens: Double?
    let todayOutputTokens: Double?
    let todayCacheReadTokens: Double?
    let rpm: Double?
    let tpm: Double?
    let avgResponseSeconds: Double?
    let avgResponseTimeMs: Double?
    let averageDurationMs: Double?

    enum CodingKeys: String, CodingKey {
        case totalUsers = "total_users"
        case todayNewUsers = "today_new_users"
        case activeUsers = "active_users"
        case totalAPIKeys = "total_api_keys"
        case activeAPIKeys = "active_api_keys"
        case totalAccounts = "total_accounts"
        case normalAccounts = "normal_accounts"
        case errorAccounts = "error_accounts"
        case totalRequests = "total_requests"
        case totalCost = "total_cost"
        case totalTokens = "total_tokens"
        case todayRequests = "today_requests"
        case todayCost = "today_cost"
        case todayTokens = "today_tokens"
        case todayInputTokens = "today_input_tokens"
        case todayOutputTokens = "today_output_tokens"
        case todayCacheReadTokens = "today_cache_read_tokens"
        case rpm, tpm
        case avgResponseSeconds = "avg_response_seconds"
        case avgResponseTimeMs = "avg_response_time_ms"
        case averageDurationMs = "average_duration_ms"
    }
}

struct TrendPoint: Decodable, Identifiable, Sendable {
    var id: String { date }
    let date: String
    let requests: Double?
    let inputTokens: Double?
    let outputTokens: Double?
    let cacheCreationTokens: Double?
    let cacheReadTokens: Double?
    let totalTokens: Double?
    let cost: Double?
    let actualCost: Double?
    let avgDurationMs: Double?
    let averageDurationMs: Double?
    let avgLatencyMs: Double?

    enum CodingKeys: String, CodingKey {
        case date, requests, cost
        case inputTokens = "input_tokens"
        case outputTokens = "output_tokens"
        case cacheCreationTokens = "cache_creation_tokens"
        case cacheReadTokens = "cache_read_tokens"
        case totalTokens = "total_tokens"
        case actualCost = "actual_cost"
        case avgDurationMs = "avg_duration_ms"
        case averageDurationMs = "average_duration_ms"
        case avgLatencyMs = "avg_latency_ms"
    }
}

struct DashboardTrend: Decodable, Sendable {
    let startDate: String?
    let endDate: String?
    let granularity: String?
    let trend: [TrendPoint]

    enum CodingKeys: String, CodingKey {
        case startDate = "start_date"
        case endDate = "end_date"
        case granularity, trend
    }
}

struct AdminUser: Decodable, Identifiable, Hashable, Sendable {
    let id: Int
    let email: String
    let username: String?
    let balance: Double?
    let concurrency: Int?
    let status: String?
    let role: String?
    let currentConcurrency: Int?
    let notes: String?
    let lastUsedAt: String?
    let createdAt: String?
    let updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, email, username, balance, concurrency, status, role, notes
        case currentConcurrency = "current_concurrency"
        case lastUsedAt = "last_used_at"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

struct UsageSummary: Decodable, Sendable {
    let totalRequests: Double?
    let requestCount: Double?
    let inputTokens: Double?
    let outputTokens: Double?
    let totalTokens: Double?
    let totalCost: Double?
    let actualCost: Double?
    let avgDurationMs: Double?
    let avgFirstTokenMs: Double?
    let totalActualCost: Double?
    let totalAccountCost: Double?
    let averageDurationMs: Double?

    enum CodingKeys: String, CodingKey {
        case totalRequests = "total_requests"
        case requestCount = "request_count"
        case inputTokens = "input_tokens"
        case outputTokens = "output_tokens"
        case totalTokens = "total_tokens"
        case totalCost = "total_cost"
        case actualCost = "actual_cost"
        case avgDurationMs = "avg_duration_ms"
        case avgFirstTokenMs = "avg_first_token_ms"
        case totalActualCost = "total_actual_cost"
        case totalAccountCost = "total_account_cost"
        case averageDurationMs = "average_duration_ms"
    }
}

struct AdminAccount: Decodable, Identifiable, Hashable, Sendable {
    let id: Int
    let name: String
    let notes: String?
    let platform: String
    let type: String
    let status: String?
    let schedulable: Bool?
    let priority: Int?
    let concurrency: Int?
    let currentConcurrency: Int?
    let loadFactor: Double?
    let rateMultiplier: Double?
    let error: String?
    let errorCode: Int?
    let errorMessage: String?
    let isRateLimited: Bool?
    let rateLimitedAt: String?
    let rateLimitResetAt: String?
    let proxyID: Int?
    let privacy: Bool?
    let privacyMode: String?
    let shadow: Bool?
    let tempUnschedulableUntil: String?
    let quota: JSONValue?
    let usage: JSONValue?
    let extra: JSONValue?
    let credentials: JSONValue?
    let expiresAt: String?
    let updatedAt: String?
    let lastUsedAt: String?
    let createdAt: String?
    let groupIDs: [Int]?
    let groups: [AdminGroup]?
    let groupName: String?

    enum CodingKeys: String, CodingKey {
        case id, name, notes, platform, type, status, schedulable, priority, concurrency, error, privacy
        case currentConcurrency = "current_concurrency"
        case loadFactor = "load_factor"
        case rateMultiplier = "rate_multiplier"
        case errorMessage = "error_message"
        case errorCode = "error_code"
        case isRateLimited = "is_rate_limited"
        case rateLimitedAt = "rate_limited_at"
        case rateLimitResetAt = "rate_limit_reset_at"
        case proxyID = "proxy_id"
        case privacyMode = "privacy_mode"
        case shadow
        case tempUnschedulableUntil = "temp_unschedulable_until"
        case quota, usage, extra, credentials
        case expiresAt = "expires_at"
        case updatedAt = "updated_at"
        case lastUsedAt = "last_used_at"
        case createdAt = "created_at"
        case groupIDs = "group_ids"
        case groups
        case groupName = "group_name"
    }
}

struct AdminAPIKey: Decodable, Identifiable, Hashable, Sendable {
    let id: Int
    let userID: Int?
    let userEmail: String?
    let key: String?
    let customKey: String?
    let name: String?
    let groupID: Int?
    let groupName: String?
    let status: String?
    let quota: Double?
    let quotaUsed: Double?
    let ipWhitelist: JSONValue?
    let ipBlacklist: JSONValue?
    let rateLimit5h: Double?
    let rateLimit1d: Double?
    let rateLimit7d: Double?
    let usage5h: Double?
    let usage1d: Double?
    let usage7d: Double?
    let lastUsedAt: String?
    let expiresAt: String?
    let createdAt: String?
    let updatedAt: String?
    let deletedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, key, name, status, quota
        case userID = "user_id"
        case userEmail = "user_email"
        case customKey = "custom_key"
        case groupID = "group_id"
        case groupName = "group_name"
        case quotaUsed = "quota_used"
        case ipWhitelist = "ip_whitelist"
        case ipBlacklist = "ip_blacklist"
        case rateLimit5h = "rate_limit_5h"
        case rateLimit1d = "rate_limit_1d"
        case rateLimit7d = "rate_limit_7d"
        case usage5h = "usage_5h"
        case usage1d = "usage_1d"
        case usage7d = "usage_7d"
        case lastUsedAt = "last_used_at"
        case expiresAt = "expires_at"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case deletedAt = "deleted_at"
    }
}

struct AdminGroup: Decodable, Identifiable, Hashable, Sendable {
    let id: Int
    let name: String
    let description: String?
    let platform: String
    let rateMultiplier: Double?
    let isExclusive: Bool?
    let status: String?
    let subscriptionType: String?
    let dailyLimitUSD: Double?
    let weeklyLimitUSD: Double?
    let monthlyLimitUSD: Double?
    let activeAccountCount: Int?
    let rateLimitedAccountCount: Int?
    let accountCount: Int?
    let rpmLimit: Int?
    let allowImageGeneration: Bool?
    let imageRateIndependent: Bool?
    let imageRateMultiplier: Double?
    let peakRateEnabled: Bool?
    let peakStart: String?
    let peakEnd: String?
    let peakRateMultiplier: Double?
    let requireOAuthOnly: Bool?
    let requirePrivacySet: Bool?
    let modelRoutingEnabled: Bool?
    let sortOrder: Int?
    let claudeCodeOnly: Bool?
    let fallbackGroupID: Int?
    let fallbackInvalidGroupID: Int?
    let allowMessagesDispatch: Bool?
    let mcpXMLInject: Bool?
    let supportedModelScopes: [String]?

    enum CodingKeys: String, CodingKey {
        case id, name, description, platform, status
        case rateMultiplier = "rate_multiplier"
        case isExclusive = "is_exclusive"
        case subscriptionType = "subscription_type"
        case dailyLimitUSD = "daily_limit_usd"
        case weeklyLimitUSD = "weekly_limit_usd"
        case monthlyLimitUSD = "monthly_limit_usd"
        case activeAccountCount = "active_account_count"
        case rateLimitedAccountCount = "rate_limited_account_count"
        case accountCount = "account_count"
        case rpmLimit = "rpm_limit"
        case allowImageGeneration = "allow_image_generation"
        case imageRateIndependent = "image_rate_independent"
        case imageRateMultiplier = "image_rate_multiplier"
        case peakRateEnabled = "peak_rate_enabled"
        case peakStart = "peak_start"
        case peakEnd = "peak_end"
        case peakRateMultiplier = "peak_rate_multiplier"
        case requireOAuthOnly = "require_oauth_only"
        case requirePrivacySet = "require_privacy_set"
        case modelRoutingEnabled = "model_routing_enabled"
        case sortOrder = "sort_order"
        case claudeCodeOnly = "claude_code_only"
        case fallbackGroupID = "fallback_group_id"
        case fallbackInvalidGroupID = "fallback_group_id_on_invalid_request"
        case allowMessagesDispatch = "allow_messages_dispatch"
        case mcpXMLInject = "mcp_xml_inject"
        case supportedModelScopes = "supported_model_scopes"
    }
}

struct UsageRecord: Decodable, Identifiable, Sendable {
    let id: String
    let userID: Int?
    let apiKeyID: Int?
    let accountID: Int?
    let groupID: Int?
    let requestID: String?
    let model: String?
    let requestedModel: String?
    let inputTokens: Double?
    let outputTokens: Double?
    let cacheCreationTokens: Double?
    let cacheReadTokens: Double?
    let imageOutputTokens: Double?
    let totalCost: Double?
    let actualCost: Double?
    let accountStatsCost: Double?
    let stream: Bool?
    let requestType: JSONValue?
    let billingType: JSONValue?
    let billingMode: String?
    let durationMs: Double?
    let firstTokenMs: Double?
    let createdAt: String?
    let inboundEndpoint: String?
    let upstreamEndpoint: String?
    let user: UsageUser?
    let apiKey: UsageAPIKey?
    let account: UsageAccount?
    let group: UsageGroup?

    enum CodingKeys: String, CodingKey {
        case id, model, user, account, group
        case userID = "user_id"
        case apiKeyID = "api_key_id"
        case accountID = "account_id"
        case groupID = "group_id"
        case requestID = "request_id"
        case requestedModel = "requested_model"
        case inputTokens = "input_tokens"
        case outputTokens = "output_tokens"
        case cacheCreationTokens = "cache_creation_tokens"
        case cacheReadTokens = "cache_read_tokens"
        case imageOutputTokens = "image_output_tokens"
        case totalCost = "total_cost"
        case actualCost = "actual_cost"
        case accountStatsCost = "account_stats_cost"
        case stream, requestType = "request_type", billingType = "billing_type", billingMode = "billing_mode"
        case durationMs = "duration_ms"
        case firstTokenMs = "first_token_ms"
        case createdAt = "created_at"
        case inboundEndpoint = "inbound_endpoint"
        case upstreamEndpoint = "upstream_endpoint"
        case apiKey = "api_key"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if let stringID = try? container.decode(String.self, forKey: .id) {
            id = stringID
        } else if let intID = try? container.decode(Int.self, forKey: .id) {
            id = String(intID)
        } else {
            id = UUID().uuidString
        }
        model = try container.decodeIfPresent(String.self, forKey: .model)
        userID = try container.decodeIfPresent(Int.self, forKey: .userID)
        apiKeyID = try container.decodeIfPresent(Int.self, forKey: .apiKeyID)
        accountID = try container.decodeIfPresent(Int.self, forKey: .accountID)
        groupID = try container.decodeIfPresent(Int.self, forKey: .groupID)
        requestID = try container.decodeIfPresent(String.self, forKey: .requestID)
        requestedModel = try container.decodeIfPresent(String.self, forKey: .requestedModel)
        inputTokens = try container.decodeIfPresent(Double.self, forKey: .inputTokens)
        outputTokens = try container.decodeIfPresent(Double.self, forKey: .outputTokens)
        cacheCreationTokens = try container.decodeIfPresent(Double.self, forKey: .cacheCreationTokens)
        cacheReadTokens = try container.decodeIfPresent(Double.self, forKey: .cacheReadTokens)
        imageOutputTokens = try container.decodeIfPresent(Double.self, forKey: .imageOutputTokens)
        totalCost = try container.decodeIfPresent(Double.self, forKey: .totalCost)
        actualCost = try container.decodeIfPresent(Double.self, forKey: .actualCost)
        accountStatsCost = try container.decodeIfPresent(Double.self, forKey: .accountStatsCost)
        stream = try container.decodeIfPresent(Bool.self, forKey: .stream)
        requestType = try container.decodeIfPresent(JSONValue.self, forKey: .requestType)
        billingType = try container.decodeIfPresent(JSONValue.self, forKey: .billingType)
        billingMode = try container.decodeIfPresent(String.self, forKey: .billingMode)
        durationMs = try container.decodeIfPresent(Double.self, forKey: .durationMs)
        firstTokenMs = try container.decodeIfPresent(Double.self, forKey: .firstTokenMs)
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt)
        inboundEndpoint = try container.decodeIfPresent(String.self, forKey: .inboundEndpoint)
        upstreamEndpoint = try container.decodeIfPresent(String.self, forKey: .upstreamEndpoint)
        user = try container.decodeIfPresent(UsageUser.self, forKey: .user)
        apiKey = try container.decodeIfPresent(UsageAPIKey.self, forKey: .apiKey)
        account = try container.decodeIfPresent(UsageAccount.self, forKey: .account)
        group = try container.decodeIfPresent(UsageGroup.self, forKey: .group)
    }
}

struct UsageUser: Decodable, Sendable { let id: Int?; let email: String?; let username: String? }
struct UsageAPIKey: Decodable, Sendable { let id: Int?; let name: String? }
struct UsageAccount: Decodable, Sendable { let id: Int?; let name: String?; let platform: String? }
struct UsageGroup: Decodable, Sendable { let id: Int?; let name: String?; let groupName: String?; enum CodingKeys: String, CodingKey { case id, name; case groupName = "group_name" } }

struct OpsOverview: Decodable, Sendable {
    let requests: Double?
    let totalRequests: Double?
    let errors: Double?
    let errorCount: Double?
    let errorRate: Double?
    let avgLatencyMs: Double?
    let p95LatencyMs: Double?
    let qps: Double?
    let rpm: Double?
    let activeAccounts: Double?
    let alertCount: Double?

    init(from decoder: Decoder) throws {
        self.init(json: try JSONValue(from: decoder))
    }

    init(json: JSONValue) {
        let root = json.objectValue ?? [:]
        let object = root["overview"]?.objectValue ?? root
        let qpsMetrics = object["qps"]?.objectValue
        let durationMetrics = object["duration"]?.objectValue ?? object["latency"]?.objectValue
        let directErrors = object.number(
            "error_count_total", "errorCountTotal", "request_error_count", "requestErrorCount",
            "errors", "error_count", "errorCount", "total_errors", "totalErrors"
        )
        let successCount = object.number("success_count", "successCount", "request_count_success", "requestCountSuccess")

        requests = object.number("requests", "request_count", "requestCount")
        let directRequests = object.number(
            "request_count_total", "requestCountTotal", "total_requests", "totalRequests",
            "requests", "request_count", "requestCount"
        )
        if let directRequests {
            totalRequests = directRequests
        } else if let successCount, let directErrors {
            totalRequests = successCount + directErrors
        } else {
            totalRequests = nil
        }
        errors = directErrors
        errorCount = directErrors
        errorRate = object.number("error_rate", "errorRate", "errors_rate")
        avgLatencyMs = durationMetrics?.number("avg_ms", "avgMs", "avg", "average_ms", "averageMs")
            ?? object.number(
                "duration_avg_ms", "durationAvgMs", "avg_latency_ms", "avgLatencyMs",
                "average_latency_ms", "averageLatencyMs", "latency_ms", "latencyMs",
                "avg_duration_ms", "avgDurationMs"
            )
        p95LatencyMs = durationMetrics?.number("p95_ms", "p95Ms", "p95")
            ?? object.number("duration_p95_ms", "durationP95Ms", "p95_latency_ms", "p95LatencyMs", "p95", "latency_p95_ms", "latencyP95Ms")
        qps = qpsMetrics?.number("current", "avg", "value")
            ?? object.number("qps_current", "qpsCurrent", "qps", "queries_per_second", "requests_per_second", "requestsPerSecond")
        rpm = object.number("rpm", "requests_per_minute", "requestsPerMinute") ?? qps.map { $0 * 60 }
        activeAccounts = object.number("active_accounts", "activeAccounts", "available_accounts", "availableAccounts")
        alertCount = object.number("alert_count", "alertCount", "alerts", "open_alerts", "openAlerts")
    }
}

struct EmptyResponse: Decodable, Sendable {}

enum NumberFormatters {
    static func compact(_ value: Double?) -> String {
        guard let value else { return "0" }
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = value >= 1_000 ? 1 : 0
        if value >= 1_000_000_000 { return "\(trim(value / 1_000_000_000))B" }
        if value >= 1_000_000 { return "\(trim(value / 1_000_000))M" }
        if value >= 1_000 { return "\(trim(value / 1_000))K" }
        return formatter.string(from: NSNumber(value: value)) ?? "0"
    }

    static func currency(_ value: Double?) -> String {
        String(format: "$%.2f", value ?? 0)
    }

    static func percent(_ value: Double?) -> String {
        let normalized = (value ?? 0) > 1 ? (value ?? 0) : (value ?? 0) * 100
        return String(format: "%.2f%%", normalized)
    }

    private static func trim(_ value: Double) -> String {
        value >= 100 ? String(format: "%.0f", value) : String(format: "%.1f", value)
    }
}

