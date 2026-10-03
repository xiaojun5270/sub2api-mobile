import Foundation

struct AdminService: Sendable {
    let api: APIClient

    // MARK: Dashboard

    func dashboardStats() async throws -> DashboardStats {
        try await api.get("/api/v1/admin/dashboard/stats")
    }

    func adminSettings() async throws -> AdminSettings { try await api.get("/api/v1/admin/settings") }

    func dashboardTrend(start: String, end: String, granularity: String, filters: [String: String] = [:]) async throws -> DashboardTrend {
        try await api.get("/api/v1/admin/dashboard/trend", query: query([
            "start_date": start, "end_date": end, "granularity": granularity
        ].merging(filters) { _, new in new }))
    }

    func dashboardModels(start: String, end: String) async throws -> DashboardModelStats {
        try await api.get("/api/v1/admin/dashboard/models", query: query(["start_date": start, "end_date": end]))
    }

    func dashboardSnapshot(start: String, end: String, granularity: String, filters: [String: String] = [:]) async throws -> DashboardSnapshot {
        var values = ["start_date": start, "end_date": end, "granularity": granularity]
        values.merge(filters) { _, new in new }
        return try await api.get("/api/v1/admin/dashboard/snapshot-v2", query: query(values))
    }

    func dashboardDynamic(_ endpoint: String, start: String, end: String, granularity: String) async throws -> JSONValue {
        try await api.get("/api/v1/admin/dashboard/\(endpoint)", query: query(["start_date": start, "end_date": end, "granularity": granularity]))
    }

    func currentProfile() async throws -> JSONValue { try await api.get("/api/v1/auth/me") }

    func usageStats(start: String, end: String, filters: [String: String] = [:]) async throws -> UsageSummary {
        var values = ["start_date": start, "end_date": end]
        values.merge(filters) { _, new in new }
        return try await api.get("/api/v1/admin/usage/stats", query: query(values))
    }

    // MARK: Users

    func users(search: String = "", pageSize: Int = 100) async throws -> Page<AdminUser> {
        try await api.get("/api/v1/admin/users", query: query([
            "page": "1", "page_size": String(pageSize), "search": search
        ]))
    }

    func user(_ id: Int) async throws -> AdminUser { try await api.get("/api/v1/admin/users/\(id)") }

    func createUser(_ body: [String: JSONValue]) async throws -> AdminUser {
        try await api.send("/api/v1/admin/users", method: .post, body: body)
    }

    func userAPIKeys(_ id: Int) async throws -> Page<AdminAPIKey> {
        try await api.listPage("/api/v1/admin/users/\(id)/api-keys", itemKeys: ["api_keys", "apiKeys", "keys", "items"])
    }

    func updateUserStatus(_ id: Int, status: String) async throws -> AdminUser {
        try await api.send("/api/v1/admin/users/\(id)", method: .put, body: ["status": JSONValue.string(status)])
    }

    func updateUserBalance(_ id: Int, amount: Double, operation: String, notes: String?) async throws -> AdminUser {
        var body: [String: JSONValue] = ["balance": .number(amount), "operation": .string(operation)]
        if let notes, !notes.isEmpty { body["notes"] = .string(notes) }
        return try await api.send(
            "/api/v1/admin/users/\(id)/balance",
            method: .post,
            body: body,
            idempotencyKey: "user-balance-\(id)-\(UUID().uuidString)"
        )
    }

    // MARK: Accounts

    func accounts(search: String = "", filters: [String: String] = [:]) async throws -> Page<AdminAccount> {
        let firstPage = try await accountsPage(page: 1, search: search, filters: filters)
        let pageCount = max(firstPage.pages, Int(ceil(Double(firstPage.total) / Double(max(firstPage.pageSize, 1)))))
        guard pageCount > 1 else { return firstPage }

        var allItems = firstPage.items
        try await withThrowingTaskGroup(of: Page<AdminAccount>.self) { group in
            for page in 2...pageCount {
                group.addTask { try await self.accountsPage(page: page, search: search, filters: filters) }
            }
            for try await result in group { allItems.append(contentsOf: result.items) }
        }
        var seenIDs: Set<Int> = []
        let uniqueItems = allItems.filter { seenIDs.insert($0.id).inserted }
        return Page(items: uniqueItems, total: max(firstPage.total, uniqueItems.count), page: 1, pageSize: max(uniqueItems.count, 1), pages: 1)
    }

    private func accountsPage(page: Int, search: String, filters: [String: String]) async throws -> Page<AdminAccount> {
        var values = ["page": String(page), "page_size": "100", "search": search, "timezone": TimeZone.current.identifier]
        values.merge(filters) { _, new in new }
        return try await api.listPage("/api/v1/admin/accounts", query: query(values), itemKeys: ["accounts", "items", "data"])
    }

    func account(_ id: Int) async throws -> AdminAccount { try await api.get("/api/v1/admin/accounts/\(id)") }
    func createAccount(_ body: [String: JSONValue]) async throws -> AdminAccount { try await api.send("/api/v1/admin/accounts", method: .post, body: body) }
    func updateAccount(_ id: Int, body: [String: JSONValue]) async throws -> AdminAccount { try await api.send("/api/v1/admin/accounts/\(id)", method: .put, body: body) }
    func deleteAccount(_ id: Int) async throws { let _: EmptyResponse = try await api.send("/api/v1/admin/accounts/\(id)", method: .delete) }

    func accountToday(_ id: Int) async throws -> AccountTodayStats { try await api.get("/api/v1/admin/accounts/\(id)/today-stats") }
    func accountTodayBatch(_ ids: [Int]) async throws -> JSONValue {
        let body: [String: JSONValue] = ["account_ids": .array(ids.map { .number(Double($0)) })]
        return try await api.send("/api/v1/admin/accounts/today-stats/batch", method: .post, body: body)
    }
    func accountStats(_ id: Int, days: Int) async throws -> UsageSummary {
        let raw: JSONValue = try await api.get("/api/v1/admin/accounts/\(id)/stats", query: query(["days": String(days)]))
        let payload = raw.objectValue?["summary"] ?? raw
        return UsageSummary(json: payload)
    }
    func accountUsage(_ id: Int) async throws -> Page<OpsRecord> { try await api.listPage("/api/v1/admin/accounts/\(id)/usage", itemKeys: ["items", "usage", "records"] ) }
    func accountModels(_ id: Int) async throws -> [AccountModel] {
        let page: Page<AccountModel> = try await api.listPage("/api/v1/admin/accounts/\(id)/models", itemKeys: ["models", "items", "data"])
        return page.items
    }

    func accountAction(_ id: Int, action: AccountActionRequest) async throws -> JSONValue? {
        switch action {
        case let .test(model, prompt):
            var body: [String: JSONValue] = [:]
            if let model, !model.isEmpty { body["model_id"] = .string(model); body["prompt"] = .string(prompt ?? "") }
            let _: EmptyResponse = try await api.send("/api/v1/admin/accounts/\(id)/test", method: .post, body: body)
        case .refresh:
            let _: EmptyResponse = try await api.send("/api/v1/admin/accounts/\(id)/refresh", method: .post)
        case .clearError:
            let _: EmptyResponse = try await api.send("/api/v1/admin/accounts/\(id)/clear-error", method: .post)
        case .clearRateLimit:
            let _: EmptyResponse = try await api.send("/api/v1/admin/accounts/\(id)/clear-rate-limit", method: .post)
        case .clearTemporaryPause:
            let _: EmptyResponse = try await api.send("/api/v1/admin/accounts/\(id)/temp-unschedulable", method: .delete)
        case .recover:
            let _: EmptyResponse = try await api.send("/api/v1/admin/accounts/\(id)/recover-state", method: .post)
        case .resetQuota:
            let _: EmptyResponse = try await api.send("/api/v1/admin/accounts/\(id)/reset-quota", method: .post)
        case .syncModels:
            let _: EmptyResponse = try await api.send("/api/v1/admin/accounts/\(id)/models/sync-upstream", method: .post)
        case let .schedulable(enabled):
            let _: AdminAccount = try await api.send("/api/v1/admin/accounts/\(id)/schedulable", method: .put, body: ["schedulable": JSONValue.bool(enabled)])
        case .togglePrivacy:
            let _: AdminAccount = try await api.send("/api/v1/admin/accounts/\(id)/set-privacy", method: .post, body: [String: JSONValue]())
        case .revertProxy:
            let _: EmptyResponse = try await api.send("/api/v1/admin/accounts/\(id)/revert-proxy-fallback", method: .post)
        case .createShadow:
            let _: AdminAccount = try await api.send("/api/v1/admin/accounts/\(id)/shadow", method: .post, body: [String: JSONValue]())
        }
        return nil
    }

    func applyOAuthCredentials(_ id: Int, body: [String: JSONValue]) async throws -> AdminAccount {
        try await api.send("/api/v1/admin/accounts/\(id)/apply-oauth-credentials", method: .post, body: body)
    }

    func generateAuthURL(platform: String, type: String, proxyID: Int?) async throws -> JSONValue {
        let path: String
        if platform == "openai" { path = "/api/v1/admin/openai/generate-auth-url" }
        else if type == "setup-token" { path = "/api/v1/admin/accounts/generate-setup-token-url" }
        else { path = "/api/v1/admin/accounts/generate-auth-url" }
        var body: [String: JSONValue] = [:]
        if let proxyID { body["proxy_id"] = .number(Double(proxyID)) }
        return try await api.send(path, method: .post, body: body)
    }

    func exchangeAuth(platform: String, type: String, body: [String: JSONValue], sessionKey: Bool = false) async throws -> JSONValue {
        let path: String
        if platform == "openai" { path = "/api/v1/admin/openai/exchange-code" }
        else if sessionKey { path = type == "setup-token" ? "/api/v1/admin/accounts/setup-token-cookie-auth" : "/api/v1/admin/accounts/cookie-auth" }
        else { path = type == "setup-token" ? "/api/v1/admin/accounts/exchange-setup-token-code" : "/api/v1/admin/accounts/exchange-code" }
        return try await api.send(path, method: .post, body: body)
    }

    func refreshOpenAIToken(_ refreshToken: String, proxyID: Int?, clientID: String?) async throws -> JSONValue {
        var body: [String: JSONValue] = ["refresh_token": .string(refreshToken)]
        if let proxyID { body["proxy_id"] = .number(Double(proxyID)) }
        if let clientID, !clientID.isEmpty { body["client_id"] = .string(clientID) }
        return try await api.send("/api/v1/admin/openai/refresh-token", method: .post, body: body)
    }

    func importCodexSession(_ body: [String: JSONValue]) async throws -> JSONValue { try await api.send("/api/v1/admin/accounts/import/codex-session", method: .post, body: body) }
    func createFromCodexPAT(_ body: [String: JSONValue]) async throws -> JSONValue { try await api.send("/api/v1/admin/openai/create-from-codex-pat", method: .post, body: body) }

    func quota(_ account: AdminAccount) async throws -> JSONValue {
        if account.platform.lowercased() == "grok" { return try await api.get("/api/v1/admin/grok/accounts/\(account.id)/quota") }
        return try await api.get("/api/v1/admin/openai/accounts/\(account.id)/quota")
    }

    func resetOpenAIQuota(_ id: Int) async throws -> JSONValue { try await api.send("/api/v1/admin/openai/accounts/\(id)/reset-quota", method: .post) }
    func batchRefresh(_ ids: [Int]) async throws { let body: [String: JSONValue] = ["account_ids": .array(ids.map { .number(Double($0)) })]; let _: EmptyResponse = try await api.send("/api/v1/admin/accounts/batch-refresh", method: .post, body: body) }
    func bulkUpdate(_ body: [String: JSONValue]) async throws { let _: EmptyResponse = try await api.send("/api/v1/admin/accounts/bulk-update", method: .post, body: body) }
    func exportAccounts(ids: [Int], includeProxies: Bool = false) async throws -> JSONValue {
        try await api.get("/api/v1/admin/accounts/data", query: query(["ids": ids.map { String($0) }.joined(separator: ","), "include_proxies": includeProxies ? "true" : "false"]))
    }
    func importAccounts(_ data: JSONValue) async throws -> JSONValue {
        try await api.send("/api/v1/admin/accounts/data", method: .post, body: ["data": data, "skip_default_group_bind": .bool(false)])
    }

    // MARK: API keys

    func apiKeys(search: String = "") async throws -> Page<AdminAPIKey> {
        do {
            return try await api.listPage("/api/v1/keys", query: query(["page": "1", "page_size": "100", "search": search]), itemKeys: ["api_keys", "apiKeys", "keys", "items"])
        } catch {
            do {
                return try await api.listPage("/api/v1/admin/api-keys", query: query(["page": "1", "page_size": "100", "search": search]), itemKeys: ["api_keys", "apiKeys", "keys", "items"])
            } catch {
                return try await api.listPage("/api/v1/admin/usage/search-api-keys", query: query(["q": search]), itemKeys: ["api_keys", "apiKeys", "keys", "items"])
            }
        }
    }

    func createAPIKey(_ body: [String: JSONValue], userID: Int?) async throws -> AdminAPIKey {
        var primary = body; primary.removeValue(forKey: "user_id"); primary.removeValue(forKey: "key")
        if primary["custom_key"] == nil, let key = body["key"] { primary["custom_key"] = key }
        do { return try await api.send("/api/v1/keys", method: .post, body: primary) }
        catch {
            do { return try await api.send("/api/v1/api-keys", method: .post, body: primary) }
            catch {
                do { return try await api.send("/api/v1/admin/api-keys", method: .post, body: body) }
                catch {
                    guard let userID else { throw error }
                    return try await api.send("/api/v1/admin/users/\(userID)/api-keys", method: .post, body: body)
                }
            }
        }
    }

    func updateAPIKey(_ key: AdminAPIKey, body: [String: JSONValue]) async throws -> AdminAPIKey {
        let paths = [
            "/api/v1/keys/\(key.id)" + (key.userID.map { "?user_id=\($0)" } ?? ""),
            key.userID.map { "/api/v1/admin/users/\($0)/api-keys/\(key.id)" },
            "/api/v1/api-keys/\(key.id)",
            "/api/v1/admin/api-keys/\(key.id)"
        ].compactMap { $0 }
        var savedError: Error?
        for path in paths {
            do { return try await api.send(path, method: .put, body: body) } catch { savedError = error }
        }
        throw savedError ?? APIError.invalidResponse
    }

    func deleteAPIKey(_ key: AdminAPIKey) async throws {
        let paths = [
            "/api/v1/keys/\(key.id)" + (key.userID.map { "?user_id=\($0)" } ?? ""),
            key.userID.map { "/api/v1/admin/users/\($0)/api-keys/\(key.id)" },
            "/api/v1/api-keys/\(key.id)", "/api/v1/admin/api-keys/\(key.id)"
        ].compactMap { $0 }
        var savedError: Error?
        for path in paths {
            do { let _: EmptyResponse = try await api.send(path, method: .delete); return } catch { savedError = error }
        }
        throw savedError ?? APIError.invalidResponse
    }

    func apiKeyUsage(_ id: Int) async throws -> [JSONValue] {
        let response: JSONValue = try await api.get("/api/v1/user/api-keys/\(id)/usage/daily", query: query(["days": "30", "timezone": TimeZone.current.identifier]))
        if let values = response.arrayValue { return values }
        return (response.objectValue?.rows("trend", "items", "usage", "records") ?? []).map { .object($0) }
    }

    // MARK: Groups

    func groups(search: String = "", filters: [String: String] = [:]) async throws -> Page<AdminGroup> {
        var values = ["page": "1", "page_size": "100", "search": search, "sort_by": "sort_order", "sort_order": "asc"]
        values.merge(filters) { _, new in new }
        return try await api.get("/api/v1/admin/groups", query: query(values))
    }
    func allGroups(platform: String? = nil) async throws -> [AdminGroup] {
        try await api.get("/api/v1/admin/groups/all", query: query(["platform": platform ?? "", "include_inactive": "true"]))
    }
    func createGroup(_ body: [String: JSONValue]) async throws -> AdminGroup { try await api.send("/api/v1/admin/groups", method: .post, body: body) }
    func updateGroup(_ id: Int, body: [String: JSONValue]) async throws -> AdminGroup { try await api.send("/api/v1/admin/groups/\(id)", method: .put, body: body) }
    func deleteGroup(_ id: Int) async throws { let _: EmptyResponse = try await api.send("/api/v1/admin/groups/\(id)", method: .delete) }
    func groupUsage() async throws -> [GroupUsageSummary] { try await api.get("/api/v1/admin/groups/usage-summary", query: query(["timezone": TimeZone.current.identifier])) }
    func groupCapacity() async throws -> [GroupCapacitySummary] { try await api.get("/api/v1/admin/groups/capacity-summary") }

    // MARK: Usage records

    func usageRecords(filters: [String: String], pageSize: Int = 100) async throws -> Page<UsageRecord> {
        var values = ["page": "1", "page_size": String(pageSize), "sort_by": "created_at", "sort_order": "desc", "timezone": TimeZone.current.identifier]
        values.merge(filters) { _, new in new }
        return try await api.get("/api/v1/admin/usage", query: query(values))
    }
    func cleanupTasks() async throws -> Page<UsageCleanupTask> { try await api.get("/api/v1/admin/usage/cleanup-tasks", query: query(["page": "1", "page_size": "20", "timezone": TimeZone.current.identifier])) }
    func createCleanupTask(_ body: [String: JSONValue]) async throws -> UsageCleanupTask { try await api.send("/api/v1/admin/usage/cleanup-tasks", method: .post, body: body) }
    func cancelCleanupTask(_ id: String) async throws -> UsageCleanupTask { try await api.send("/api/v1/admin/usage/cleanup-tasks/\(id)/cancel", method: .post) }

    // MARK: Operations

    func opsOverview(filters: [String: String]) async throws -> OpsOverview { try await api.get("/api/v1/admin/ops/dashboard/overview", query: query(filters)) }
    func opsDynamic(_ path: String, filters: [String: String] = [:]) async throws -> JSONValue { try await api.get(path, query: query(filters)) }
    func opsRecords(_ path: String, filters: [String: String]) async throws -> Page<OpsRecord> { try await api.get(path, query: query(filters)) }
    func alertEvents(filters: [String: String]) async throws -> Page<OpsAlertEvent> { try await api.listPage("/api/v1/admin/ops/alert-events", query: query(filters), itemKeys: ["items", "events", "alert_events", "alertEvents"] ) }
    func resolveAlert(_ id: String) async throws { let body: [String: JSONValue] = ["status": .string("manual_resolved")]; let _: EmptyResponse = try await api.send("/api/v1/admin/ops/alert-events/\(id)/status", method: .put, body: body) }
    func resolveOpsRecord(_ id: String, kind: OpsRecordKind) async throws {
        let body: [String: JSONValue] = ["resolved": .bool(true)]
        let _: EmptyResponse = try await api.send("/api/v1/admin/ops/\(kind.rawValue)/\(id)/resolve", method: .put, body: body)
    }
    func cleanupSystemLogs() async throws { let _: EmptyResponse = try await api.send("/api/v1/admin/ops/system-logs/cleanup", method: .post) }

    // MARK: Web console modules

    func dynamicPage(_ path: String, page: Int = 1, pageSize: Int = 20, search: String = "", filters: [String: String] = [:], itemKeys: [String] = ["items"]) async throws -> DynamicPage {
        var values = ["page": String(page), "page_size": String(pageSize), "search": search]
        values.merge(filters) { _, new in new }
        let result: Page<JSONValue> = try await api.listPage(path, query: query(values), itemKeys: itemKeys)
        return DynamicPage(items: result.items.enumerated().map { DynamicRecord(value: $0.element, index: $0.offset) }, total: result.total, page: result.page, pages: result.pages)
    }

    func dynamicGet(_ path: String, query values: [String: String] = [:]) async throws -> JSONValue { try await api.get(path, query: query(values)) }
    func dynamicCreate(_ path: String, body: [String: JSONValue]) async throws -> JSONValue { try await api.send(path, method: .post, body: body) }
    func dynamicUpdate(_ path: String, body: [String: JSONValue]) async throws -> JSONValue { try await api.send(path, method: .put, body: body) }
    func dynamicDelete(_ path: String) async throws { let _: EmptyResponse = try await api.send(path, method: .delete) }
    func dynamicAction(_ path: String, method: HTTPMethod = .post, body: [String: JSONValue] = [:]) async throws {
        let _: EmptyResponse = try await api.send(path, method: method, body: body)
    }

    private func query(_ values: [String: String]) -> [URLQueryItem] {
        values.filter { !$0.value.isEmpty }.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
    }
}

enum AccountActionRequest: Sendable {
    case test(model: String?, prompt: String?)
    case refresh
    case clearError
    case clearRateLimit
    case clearTemporaryPause
    case recover
    case resetQuota
    case syncModels
    case schedulable(Bool)
    case togglePrivacy
    case revertProxy
    case createShadow
}

enum OpsRecordKind: String, CaseIterable, Identifiable, Sendable {
    case errors
    case requestErrors = "request-errors"
    case upstreamErrors = "upstream-errors"
    case systemLogs = "system-logs"
    var id: String { rawValue }
    var title: String {
        switch self { case .errors: "错误"; case .requestErrors: "请求错误"; case .upstreamErrors: "上游错误"; case .systemLogs: "系统日志" }
    }
}

extension AppStore {
    func adminService() throws -> AdminService { AdminService(api: try client()) }
}
