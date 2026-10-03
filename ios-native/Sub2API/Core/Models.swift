import Foundation

struct ServerProfile: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    var label: String
    var baseURL: String
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

    enum CodingKeys: String, CodingKey {
        case date, requests, cost
        case inputTokens = "input_tokens"
        case outputTokens = "output_tokens"
        case cacheCreationTokens = "cache_creation_tokens"
        case cacheReadTokens = "cache_read_tokens"
        case totalTokens = "total_tokens"
        case actualCost = "actual_cost"
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
    let rateMultiplier: Double?
    let error: String?
    let errorMessage: String?
    let isRateLimited: Bool?
    let rateLimitResetAt: String?
    let privacy: Bool?
    let privacyMode: String?
    let expiresAt: String?
    let updatedAt: String?
    let lastUsedAt: String?
    let createdAt: String?
    let groupIDs: [Int]?
    let groupName: String?

    enum CodingKeys: String, CodingKey {
        case id, name, notes, platform, type, status, schedulable, priority, concurrency, error, privacy
        case currentConcurrency = "current_concurrency"
        case rateMultiplier = "rate_multiplier"
        case errorMessage = "error_message"
        case isRateLimited = "is_rate_limited"
        case rateLimitResetAt = "rate_limit_reset_at"
        case privacyMode = "privacy_mode"
        case expiresAt = "expires_at"
        case updatedAt = "updated_at"
        case lastUsedAt = "last_used_at"
        case createdAt = "created_at"
        case groupIDs = "group_ids"
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
    let lastUsedAt: String?
    let expiresAt: String?
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, key, name, status, quota
        case userID = "user_id"
        case userEmail = "user_email"
        case customKey = "custom_key"
        case groupID = "group_id"
        case groupName = "group_name"
        case quotaUsed = "quota_used"
        case lastUsedAt = "last_used_at"
        case expiresAt = "expires_at"
        case createdAt = "created_at"
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
    }
}

struct UsageRecord: Decodable, Identifiable, Sendable {
    let id: String
    let model: String?
    let requestedModel: String?
    let inputTokens: Double?
    let outputTokens: Double?
    let totalCost: Double?
    let actualCost: Double?
    let durationMs: Double?
    let firstTokenMs: Double?
    let createdAt: String?
    let inboundEndpoint: String?
    let user: UsageUser?
    let apiKey: UsageAPIKey?
    let account: UsageAccount?
    let group: UsageGroup?

    enum CodingKeys: String, CodingKey {
        case id, model, user, account, group
        case requestedModel = "requested_model"
        case inputTokens = "input_tokens"
        case outputTokens = "output_tokens"
        case totalCost = "total_cost"
        case actualCost = "actual_cost"
        case durationMs = "duration_ms"
        case firstTokenMs = "first_token_ms"
        case createdAt = "created_at"
        case inboundEndpoint = "inbound_endpoint"
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
        requestedModel = try container.decodeIfPresent(String.self, forKey: .requestedModel)
        inputTokens = try container.decodeIfPresent(Double.self, forKey: .inputTokens)
        outputTokens = try container.decodeIfPresent(Double.self, forKey: .outputTokens)
        totalCost = try container.decodeIfPresent(Double.self, forKey: .totalCost)
        actualCost = try container.decodeIfPresent(Double.self, forKey: .actualCost)
        durationMs = try container.decodeIfPresent(Double.self, forKey: .durationMs)
        firstTokenMs = try container.decodeIfPresent(Double.self, forKey: .firstTokenMs)
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt)
        inboundEndpoint = try container.decodeIfPresent(String.self, forKey: .inboundEndpoint)
        user = try container.decodeIfPresent(UsageUser.self, forKey: .user)
        apiKey = try container.decodeIfPresent(UsageAPIKey.self, forKey: .apiKey)
        account = try container.decodeIfPresent(UsageAccount.self, forKey: .account)
        group = try container.decodeIfPresent(UsageGroup.self, forKey: .group)
    }
}

struct UsageUser: Decodable, Sendable { let id: Int?; let email: String? }
struct UsageAPIKey: Decodable, Sendable { let id: Int?; let name: String? }
struct UsageAccount: Decodable, Sendable { let id: Int?; let name: String?; let platform: String? }
struct UsageGroup: Decodable, Sendable { let id: Int?; let name: String? }

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

    enum CodingKeys: String, CodingKey {
        case requests, errors, qps, rpm
        case totalRequests = "total_requests"
        case errorCount = "error_count"
        case errorRate = "error_rate"
        case avgLatencyMs = "avg_latency_ms"
        case p95LatencyMs = "p95_latency_ms"
        case activeAccounts = "active_accounts"
        case alertCount = "alert_count"
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

