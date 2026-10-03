import Foundation

enum JSONValue: Codable, Hashable, Sendable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null }
        else if let value = try? container.decode(Bool.self) { self = .bool(value) }
        else if let value = try? container.decode(Double.self) { self = .number(value) }
        else if let value = try? container.decode(String.self) { self = .string(value) }
        else if let value = try? container.decode([String: JSONValue].self) { self = .object(value) }
        else if let value = try? container.decode([JSONValue].self) { self = .array(value) }
        else { throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported JSON value") }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case let .string(value): try container.encode(value)
        case let .number(value): try container.encode(value)
        case let .bool(value): try container.encode(value)
        case let .object(value): try container.encode(value)
        case let .array(value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }

    var objectValue: [String: JSONValue]? { if case let .object(value) = self { value } else { nil } }
    var arrayValue: [JSONValue]? { if case let .array(value) = self { value } else { nil } }
    var stringValue: String? {
        switch self { case let .string(value): value; case let .number(value): String(value); default: nil }
    }
    var doubleValue: Double? {
        switch self { case let .number(value): value; case let .string(value): Double(value); default: nil }
    }
    var boolValue: Bool? {
        switch self { case let .bool(value): value; case let .number(value): value != 0; case let .string(value): ["true", "1", "yes"].contains(value.lowercased()); default: nil }
    }

    subscript(key: String) -> JSONValue? { objectValue?[key] }

    var displayText: String {
        switch self {
        case let .string(value): value
        case let .number(value): value.rounded() == value ? String(Int(value)) : String(value)
        case let .bool(value): value ? "true" : "false"
        case .null: "--"
        case let .array(value): value.map(\.displayText).joined(separator: ", ")
        case let .object(value): value.map { "\($0.key): \($0.value.displayText)" }.sorted().joined(separator: " · ")
        }
    }
}

extension Dictionary where Key == String, Value == JSONValue {
    func text(_ keys: String...) -> String? {
        keys.lazy.compactMap { self[$0]?.stringValue }.first { !$0.isEmpty }
    }
    func number(_ keys: String...) -> Double? {
        keys.lazy.compactMap { self[$0]?.doubleValue }.first
    }
    func flag(_ keys: String...) -> Bool? {
        keys.lazy.compactMap { self[$0]?.boolValue }.first
    }
    func rows(_ keys: String...) -> [[String: JSONValue]] {
        for key in keys {
            if let values = self[key]?.arrayValue {
                return values.compactMap(\.objectValue)
            }
        }
        return []
    }
}

struct DashboardModelStats: Decodable, Sendable {
    let models: [ModelStat]
}

struct ModelStat: Decodable, Identifiable, Sendable {
    var id: String { model }
    let model: String
    let requests: Double?
    let inputTokens: Double?
    let outputTokens: Double?
    let totalTokens: Double?
    let cost: Double?
    let actualCost: Double?

    enum CodingKeys: String, CodingKey {
        case model, requests, cost
        case inputTokens = "input_tokens"
        case outputTokens = "output_tokens"
        case totalTokens = "total_tokens"
        case actualCost = "actual_cost"
    }
}

struct DashboardSnapshot: Decodable, Sendable {
    let trend: [TrendPoint]?
    let models: [ModelStat]?
    let groups: [SnapshotGroup]?
}

struct SnapshotGroup: Decodable, Identifiable, Sendable {
    var id: Int { groupID ?? 0 }
    let groupID: Int?
    let groupName: String?
    let name: String?
    let requests: Double?
    let totalRequests: Double?
    let tokens: Double?
    let totalTokens: Double?
    let cost: Double?
    let totalCost: Double?
    let actualCost: Double?
    let totalActualCost: Double?
    let standardCost: Double?

    enum CodingKeys: String, CodingKey {
        case name, requests, tokens, cost
        case groupID = "group_id"
        case groupName = "group_name"
        case totalRequests = "total_requests"
        case totalTokens = "total_tokens"
        case totalCost = "total_cost"
        case actualCost = "actual_cost"
        case totalActualCost = "total_actual_cost"
        case standardCost = "standard_cost"
    }
}

struct AccountTodayStats: Decodable, Sendable {
    let requests: Double?
    let tokens: Double?
    let cost: Double?
    let standardCost: Double?
    let userCost: Double?
    enum CodingKeys: String, CodingKey { case requests, tokens, cost; case standardCost = "standard_cost"; case userCost = "user_cost" }
}

struct AccountModel: Decodable, Identifiable, Hashable, Sendable {
    var id: String { modelID ?? model ?? name ?? displayName ?? "unknown-model" }
    let modelID: String?
    let displayName: String?
    let model: String?
    let name: String?
    let ownedBy: String?
    let contextWindow: Int?
    let available: Bool?
    let enabled: Bool?
    let source: String?
    let status: String?
    enum CodingKeys: String, CodingKey { case model, name, available, enabled, source, status; case modelID = "id"; case displayName = "display_name"; case ownedBy = "owned_by"; case contextWindow = "context_window" }
}

struct AccountModelsResponse: Decodable, Sendable { let models: [AccountModel] }

struct GroupUsageSummary: Decodable, Sendable {
    let groupID: Int
    let todayCost: Double?
    let totalCost: Double?
    enum CodingKeys: String, CodingKey { case groupID = "group_id"; case todayCost = "today_cost"; case totalCost = "total_cost" }
}

struct GroupCapacitySummary: Decodable, Sendable {
    let groupID: Int
    let concurrencyUsed: Double?
    let concurrencyMax: Double?
    let sessionsUsed: Double?
    let sessionsMax: Double?
    let rpmUsed: Double?
    let rpmMax: Double?
    enum CodingKeys: String, CodingKey { case groupID = "group_id"; case concurrencyUsed = "concurrency_used"; case concurrencyMax = "concurrency_max"; case sessionsUsed = "sessions_used"; case sessionsMax = "sessions_max"; case rpmUsed = "rpm_used"; case rpmMax = "rpm_max" }
}

struct UsageCleanupTask: Decodable, Identifiable, Sendable {
    let id: String
    let status: String?
    let deletedRows: Int?
    let errorMessage: String?
    let startedAt: String?
    let finishedAt: String?
    let createdAt: String?
    let canceledAt: String?
    enum CodingKeys: String, CodingKey { case id, status; case deletedRows = "deleted_rows"; case errorMessage = "error_message"; case startedAt = "started_at"; case finishedAt = "finished_at"; case createdAt = "created_at"; case canceledAt = "canceled_at" }
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if let value = try? container.decode(String.self, forKey: .id) { id = value }
        else { id = String(try container.decode(Int.self, forKey: .id)) }
        status = try container.decodeIfPresent(String.self, forKey: .status)
        deletedRows = try container.decodeIfPresent(Int.self, forKey: .deletedRows)
        errorMessage = try container.decodeIfPresent(String.self, forKey: .errorMessage)
        startedAt = try container.decodeIfPresent(String.self, forKey: .startedAt)
        finishedAt = try container.decodeIfPresent(String.self, forKey: .finishedAt)
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt)
        canceledAt = try container.decodeIfPresent(String.self, forKey: .canceledAt)
    }
}

struct OpsRecord: Decodable, Identifiable, Sendable {
    let id: String
    let status: String?
    let level: String?
    let method: String?
    let path: String?
    let model: String?
    let accountName: String?
    let userEmail: String?
    let message: String?
    let errorMessage: String?
    let upstreamError: String?
    let latencyMs: Double?
    let durationMs: Double?
    let createdAt: String?
    let resolvedAt: String?
    enum CodingKeys: String, CodingKey { case id, status, level, method, path, model, message; case accountName = "account_name"; case userEmail = "user_email"; case errorMessage = "error_message"; case upstreamError = "upstream_error"; case latencyMs = "latency_ms"; case durationMs = "duration_ms"; case createdAt = "created_at"; case resolvedAt = "resolved_at" }
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if let value = try? container.decode(String.self, forKey: .id) { id = value }
        else if let value = try? container.decode(Int.self, forKey: .id) { id = String(value) }
        else { id = UUID().uuidString }
        status = try container.decodeIfPresent(String.self, forKey: .status); level = try container.decodeIfPresent(String.self, forKey: .level)
        method = try container.decodeIfPresent(String.self, forKey: .method); path = try container.decodeIfPresent(String.self, forKey: .path)
        model = try container.decodeIfPresent(String.self, forKey: .model); accountName = try container.decodeIfPresent(String.self, forKey: .accountName)
        userEmail = try container.decodeIfPresent(String.self, forKey: .userEmail); message = try container.decodeIfPresent(String.self, forKey: .message)
        errorMessage = try container.decodeIfPresent(String.self, forKey: .errorMessage); upstreamError = try container.decodeIfPresent(String.self, forKey: .upstreamError)
        latencyMs = try container.decodeIfPresent(Double.self, forKey: .latencyMs); durationMs = try container.decodeIfPresent(Double.self, forKey: .durationMs)
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt); resolvedAt = try container.decodeIfPresent(String.self, forKey: .resolvedAt)
    }
}

struct OpsAlertEvent: Decodable, Identifiable, Sendable {
    let id: String
    let ruleID: Int?
    let severity: String
    let status: String
    let title: String?
    let description: String?
    let metricValue: Double?
    let thresholdValue: Double?
    let firedAt: String
    let resolvedAt: String?
    let emailSent: Bool?
    let createdAt: String?
    enum CodingKeys: String, CodingKey { case id, severity, status, title, description; case ruleID = "rule_id"; case metricValue = "metric_value"; case thresholdValue = "threshold_value"; case firedAt = "fired_at"; case resolvedAt = "resolved_at"; case emailSent = "email_sent"; case createdAt = "created_at" }
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if let value = try? container.decode(String.self, forKey: .id) { id = value } else { id = String(try container.decode(Int.self, forKey: .id)) }
        ruleID = try container.decodeIfPresent(Int.self, forKey: .ruleID)
        severity = try container.decodeIfPresent(String.self, forKey: .severity) ?? "--"
        status = try container.decodeIfPresent(String.self, forKey: .status) ?? "--"
        title = try container.decodeIfPresent(String.self, forKey: .title); description = try container.decodeIfPresent(String.self, forKey: .description)
        metricValue = try container.decodeIfPresent(Double.self, forKey: .metricValue); thresholdValue = try container.decodeIfPresent(Double.self, forKey: .thresholdValue)
        firedAt = try container.decodeIfPresent(String.self, forKey: .firedAt) ?? ""
        resolvedAt = try container.decodeIfPresent(String.self, forKey: .resolvedAt); emailSent = try container.decodeIfPresent(Bool.self, forKey: .emailSent)
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt)
    }
}

struct OpsMetricCollection: Decodable, Sendable {
    let trend: [JSONValue]?
    let items: [JSONValue]?
    let distribution: [JSONValue]?
    let histogram: [JSONValue]?
}
