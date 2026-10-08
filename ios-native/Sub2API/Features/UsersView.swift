import Charts
import SwiftUI
import UIKit

struct UsersView: View {
    @EnvironmentObject private var store: AppStore
    @State private var users: [AdminUser] = []
    @State private var usageByUser: [Int: UsageSummary] = [:]
    @State private var sortAscending = false
    @State private var searchText = ""
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var showsCreateUser = false

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                PageHeader(
                    title: "用户",
                    subtitle: "搜索用户，查看余额、密钥和活跃状态",
                    symbol: "person.2.fill",
                    tint: AppPalette.blue,
                    action: { showsCreateUser = true }
                )
                HStack { Text("按最近使用时间排序").font(.caption).foregroundStyle(.secondary); Spacer(); Button { sortAscending.toggle(); sortUsers() } label: { Label(sortAscending ? "最早优先" : "最近优先", systemImage: "arrow.up.arrow.down") }.font(.caption).buttonStyle(.bordered) }

                if isLoading && users.isEmpty {
                    LoadingView(label: "正在加载用户")
                } else if let errorMessage, users.isEmpty {
                    InlineErrorView(message: errorMessage) { Task { await load() } }
                } else if users.isEmpty {
                    EmptyContentView(symbol: "person.crop.circle.badge.questionmark", title: "暂无用户", message: "当前搜索条件下没有匹配结果。")
                } else {
                    ForEach(users) { user in
                        NavigationLink(value: user) {
                            UserRow(user: user, usage: usageByUser[user.id])
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .searchable(text: $searchText, prompt: "邮箱、用户名或备注")
        .refreshable { await load() }
        .navigationBarHidden(true)
        .navigationDestination(for: AdminUser.self) { user in UserDetailView(user: user) }
        .sheet(isPresented: $showsCreateUser, onDismiss: { Task { await load() } }) {
            CreateUserView()
        }
        .appPage()
        .task(id: "\(store.activeServerID?.uuidString ?? "")-\(searchText)") {
            restoreCache()
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            await load()
        }
    }

    private func load() async {
        guard let service = try? store.adminService() else { return }
        isLoading = users.isEmpty
        errorMessage = nil
        do {
            let refreshedUsers = try await service.users(search: searchText, pageSize: 50).items
            users = refreshedUsers
            sortUsers()
            let dates = TimeRange.week.startEnd
            let refreshedUsage = await withTaskGroup(of: (Int, UsageSummary?).self) { group in
                for user in users { group.addTask { (user.id, try? await service.usageStats(start: dates.0, end: dates.1, filters: ["user_id": String(user.id)])) } }
                var result: [Int: UsageSummary] = [:]; for await (id, usage) in group { result[id] = usage }; return result
            }
            let userIDs = Set(users.map(\.id))
            var merged = usageByUser.filter { userIDs.contains($0.key) }
            for (id, usage) in refreshedUsage { merged[id] = usage }
            usageByUser = merged
            persistCache()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func restoreCache() {
        guard let serverID = store.activeServerID,
              let cached = UsersCacheStore.value(serverID: serverID, search: searchText) else {
            users = []
            usageByUser = [:]
            isLoading = true
            return
        }
        users = cached.users
        usageByUser = cached.usageByUser
        sortUsers()
        isLoading = users.isEmpty
    }

    private func persistCache() {
        guard let serverID = store.activeServerID else { return }
        UsersCacheStore.save(
            UsersPersistedCache(users: users, usageByUser: usageByUser),
            serverID: serverID,
            search: searchText
        )
    }

    private func sortUsers() { users.sort { left, right in let a = left.lastUsedAt ?? left.updatedAt ?? left.createdAt ?? ""; let b = right.lastUsedAt ?? right.updatedAt ?? right.createdAt ?? ""; return sortAscending ? a < b : a > b } }
}

private struct UsersPersistedCache: Codable {
    let users: [AdminUser]
    let usageByUser: [Int: UsageSummary]
}

@MainActor
private enum UsersCacheStore {
    private static let keyPrefix = "native.usersCache.v1."
    private static var memory: [String: UsersPersistedCache] = [:]

    static func value(serverID: UUID, search: String) -> UsersPersistedCache? {
        let key = cacheKey(serverID: serverID, search: search)
        if let cached = memory[key] { return cached }
        guard let data = UserDefaults.standard.data(forKey: key),
              let cached = try? JSONDecoder().decode(UsersPersistedCache.self, from: data) else { return nil }
        memory[key] = cached
        return cached
    }

    static func save(_ value: UsersPersistedCache, serverID: UUID, search: String) {
        let key = cacheKey(serverID: serverID, search: search)
        memory[key] = value
        guard let data = try? JSONEncoder().encode(value) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }

    private static func cacheKey(serverID: UUID, search: String) -> String {
        let normalized = search.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let queryKey = Data(normalized.utf8).base64EncodedString()
        return keyPrefix + serverID.uuidString + "." + queryKey
    }
}

private struct UserRow: View {
    let user: AdminUser
    let usage: UsageSummary?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 11) {
                Image(systemName: user.role?.lowercased() == "admin" ? "person.badge.shield.checkmark.fill" : "person.crop.circle.fill")
                    .font(.title2)
                    .foregroundStyle(user.role?.lowercased() == "admin" ? AppPalette.purple : AppPalette.blue)
                    .frame(width: 42, height: 42)
                    .background(.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 13))
                VStack(alignment: .leading, spacing: 3) {
                    Text(user.email)
                        .font(.subheadline.weight(.bold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                    Text(user.username?.isEmpty == false ? user.username! : (user.notes?.isEmpty == false ? user.notes! : "用户 #\(user.id)"))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 6)
                let style = StatusStyle.generic(user.status)
                StatusPill(text: style.0, color: style.1)
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }

            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                metric(label: "余额", value: NumberFormatters.currency(user.balance), symbol: "creditcard.fill", color: AppPalette.orange)
                metric(label: "近 7 天成本", value: NumberFormatters.currency(usage?.totalAccountCost ?? usage?.totalActualCost ?? usage?.totalCost), symbol: "dollarsign.circle.fill", color: .green)
                metric(label: "Token", value: NumberFormatters.compact(usage?.totalTokens), symbol: "cpu.fill", color: AppPalette.purple)
                metric(label: "请求", value: NumberFormatters.compact(usage?.totalRequests ?? usage?.requestCount), symbol: "arrow.up.arrow.down.circle.fill", color: AppPalette.blue)
            }

            if user.concurrency != nil || user.currentConcurrency != nil {
                HStack(spacing: 5) {
                    Image(systemName: "bolt.horizontal.fill")
                        .foregroundStyle(AppPalette.teal)
                    Text("当前并发 \(user.currentConcurrency ?? 0) / \(user.concurrency ?? 0)")
                    Spacer()
                }
                .font(.caption2.weight(.medium))
                .foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .contentShape(Rectangle())
        .glassPanel(cornerRadius: 18, interactive: true)
    }

    private func metric(label: String, value: String, symbol: String, color: Color) -> some View {
        HStack(spacing: 8) {
            Image(systemName: symbol)
                .font(.caption)
                .foregroundStyle(color)
                .frame(width: 24, height: 24)
                .background(color.opacity(0.1), in: RoundedRectangle(cornerRadius: 7))
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text(value)
                    .font(.caption.weight(.semibold))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.65)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, minHeight: 42, alignment: .leading)
        .padding(.horizontal, 9)
        .padding(.vertical, 7)
        .background(.primary.opacity(0.035), in: RoundedRectangle(cornerRadius: 10))
    }
}

private struct UserDetailView: View {
    @EnvironmentObject private var store: AppStore
    @State var user: AdminUser
    @State private var usage: UsageSummary?
    @State private var keys: [AdminAPIKey] = []
    @State private var trend: [TrendPoint] = []
    @State private var range: TimeRange = .month
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var showsBalance = false

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(user.email).font(.title3.bold()).textSelection(.enabled)
                            Text(user.username ?? user.notes ?? "用户 #\(user.id)")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                        Spacer()
                        let style = StatusStyle.generic(user.status)
                        StatusPill(text: style.0, color: style.1)
                    }
                    HStack(spacing: 10) {
                        Button("调整余额") { showsBalance = true }
                            .buttonStyle(.borderedProminent)
                            .tint(AppPalette.blue)
                        Button(user.status == "disabled" ? "启用" : "停用", role: user.status == "disabled" ? nil : .destructive) {
                            Task { await toggleStatus() }
                        }
                        .buttonStyle(.bordered)
                    }
                }
                .padding(16)
                .glassPanel()

                Grid(horizontalSpacing: 10, verticalSpacing: 10) {
                    GridRow {
                        MetricTile(label: "余额", value: NumberFormatters.currency(user.balance), symbol: "creditcard", tint: AppPalette.orange)
                        MetricTile(label: "请求", value: NumberFormatters.compact(usage?.totalRequests ?? usage?.requestCount), symbol: "arrow.up.arrow.down", tint: AppPalette.blue)
                    }
                    GridRow {
                        MetricTile(label: "Token", value: NumberFormatters.compact(usage?.totalTokens), symbol: "cpu", tint: AppPalette.teal)
                        MetricTile(label: "成本", value: NumberFormatters.currency(usage?.actualCost ?? usage?.totalCost), symbol: "dollarsign.circle", tint: AppPalette.purple)
                    }
                }

                Picker("范围", selection: $range) { ForEach(TimeRange.allCases) { Text($0.label).tag($0) } }.pickerStyle(.segmented)
                VStack(alignment: .leading, spacing: 12) {
                    Text("Token 趋势").font(.headline)
                    if trend.isEmpty { Text("暂无趋势数据").font(.footnote).foregroundStyle(.secondary).frame(maxWidth: .infinity, minHeight: 130) }
                    else { Chart(trend) { LineMark(x: .value("时间", $0.date), y: .value("Token", $0.totalTokens ?? 0)).foregroundStyle(AppPalette.blue).interpolationMethod(.catmullRom) }.chartYAxis(.hidden).frame(height: 170) }
                }.padding(16).glassPanel()

                VStack(alignment: .leading, spacing: 12) {
                    Text("API 密钥").font(.headline)
                    if isLoading { ProgressView() }
                    else if keys.isEmpty { Text("暂无密钥").font(.footnote).foregroundStyle(.secondary) }
                    ForEach(keys) { key in
                        HStack {
                            Image(systemName: "key.fill").foregroundStyle(AppPalette.blue)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(key.name ?? "未命名密钥").font(.subheadline.weight(.semibold))
                                Text(masked(key.customKey ?? key.key)).font(.caption.monospaced()).foregroundStyle(.secondary)
                            }
                            Spacer()
                            StatusPill(text: StatusStyle.generic(key.status).0, color: StatusStyle.generic(key.status).1)
                            Button { UIPasteboard.general.string = key.customKey ?? key.key } label: { Image(systemName: "doc.on.doc") }.buttonStyle(.plain)
                        }
                        HStack { Text("额度 \(NumberFormatters.compact(key.quotaUsed)) / \(NumberFormatters.compact(key.quota))"); Spacer(); Text("最后使用 \(key.lastUsedAt ?? "--")") }.font(.caption2).foregroundStyle(.secondary)
                        if key.id != keys.last?.id { Divider() }
                    }
                }
                .padding(16)
                .glassPanel()

                NavigationLink { APIKeysView() } label: { Label("打开 API 密钥管理", systemImage: "key.horizontal").frame(maxWidth: .infinity) }.buttonStyle(.borderedProminent).tint(AppPalette.blue)
                NavigationLink { UserAdvancedView(user: user) } label: { HStack { Label("网页高级功能", systemImage: "wrench.and.screwdriver"); Spacer(); Text("订阅、属性、身份与平台配额").font(.caption).foregroundStyle(.secondary); Image(systemName: "chevron.right").font(.caption) }.padding(14).glassPanel(cornerRadius: 16, interactive: true) }.buttonStyle(.plain)

                if let errorMessage { InlineErrorView(message: errorMessage) { Task { await load() } } }
            }
            .padding(16)
        }
        .navigationTitle("用户详情")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .sheet(isPresented: $showsBalance, onDismiss: { Task { await load() } }) {
            BalanceEditorView(user: user)
        }
        .appPage()
        .task(id: range) { await load() }
    }

    private func load() async {
        guard let service = try? store.adminService() else { return }
        isLoading = true
        do {
            let dates = range.startEnd
            async let nextUser = service.user(user.id)
            async let nextUsage = service.usageStats(start: dates.0, end: dates.1, filters: ["user_id": String(user.id)])
            async let nextSnapshot = service.dashboardSnapshot(start: dates.0, end: dates.1, granularity: range.granularity, filters: ["user_id": String(user.id), "include_stats": "false", "include_trend": "true"])
            async let nextKeys = service.userAPIKeys(user.id)
            let result = try await (nextUser, nextUsage, nextSnapshot, nextKeys)
            user = result.0
            usage = result.1
            trend = result.2.trend ?? []
            keys = result.3.items
            errorMessage = nil
        } catch { errorMessage = error.localizedDescription }
        isLoading = false
    }

    private func toggleStatus() async {
        guard let service = try? store.adminService() else { return }
        if user.role?.lowercased() == "admin" { errorMessage = "管理员用户不支持禁用。"; return }
        do {
            user = try await service.updateUserStatus(user.id, status: user.status == "disabled" ? "active" : "disabled")
        } catch { errorMessage = error.localizedDescription }
    }

    private func masked(_ value: String?) -> String {
        guard let value, value.count > 8 else { return "••••••••" }
        return "\(value.prefix(4))••••\(value.suffix(4))"
    }
}

private struct CreateUserView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    @State private var email = ""
    @State private var password = ""
    @State private var username = ""
    @State private var notes = ""
    @State private var role = "user"
    @State private var status = "active"
    @State private var balance = "0"
    @State private var concurrency = ""
    @State private var extraJSON = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("基本信息") {
                    TextField("邮箱", text: $email).keyboardType(.emailAddress).textInputAutocapitalization(.never)
                    SecureField("初始密码", text: $password)
                    TextField("用户名（可选）", text: $username)
                    TextField("备注（可选）", text: $notes)
                }
                Section("权限与余额") {
                    Picker("角色", selection: $role) { Text("用户").tag("user"); Text("管理员").tag("admin") }
                    Picker("状态", selection: $status) { Text("启用").tag("active"); Text("禁用").tag("disabled") }
                    TextField("初始余额", text: $balance).keyboardType(.decimalPad)
                    TextField("并发", text: $concurrency).keyboardType(.numberPad)
                }
                Section("高级参数") { TextEditor(text: $extraJSON).frame(minHeight: 100).font(.caption.monospaced()); Text("可选 JSON 对象，会与表单字段合并。").font(.caption).foregroundStyle(.secondary) }
                if let errorMessage { Section { Text(errorMessage).foregroundStyle(.red) } }
            }
            .navigationTitle("添加用户")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button(isSaving ? "保存中" : "保存") { save() }.disabled(isSaving || email.isEmpty || password.isEmpty) }
            }
        }
    }

    private func save() {
        guard let service = try? store.adminService() else { return }
        isSaving = true
        Task {
            do {
                var body = try FormParsing.jsonObject(extraJSON)
                body["email"] = .string(email); body["password"] = .string(password); body["role"] = .string(role); body["status"] = .string(status); body["balance"] = .number(Double(balance) ?? 0)
                if let value = username.nilIfBlank { body["username"] = .string(value) }; if let value = notes.nilIfBlank { body["notes"] = .string(value) }; if let value = Int(concurrency) { body["concurrency"] = .number(Double(value)) }
                let _: AdminUser = try await service.createUser(body)
                dismiss()
            } catch { errorMessage = error.localizedDescription }
            isSaving = false
        }
    }
}

private struct BalanceEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    let user: AdminUser
    @State private var operation = "add"
    @State private var amount = ""
    @State private var notes = ""
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section { Picker("操作", selection: $operation) { Text("充值").tag("add"); Text("扣减").tag("subtract"); Text("设为").tag("set") }.pickerStyle(.segmented) }
                Section("金额") {
                    TextField("0.00", text: $amount).keyboardType(.decimalPad)
                    TextField("备注（可选）", text: $notes)
                }
                if let errorMessage { Section { Text(errorMessage).foregroundStyle(.red) } }
            }
            .navigationTitle("调整余额")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("确认") { save() }.disabled(Double(amount) == nil) }
            }
        }
    }

    private func save() {
        guard let service = try? store.adminService(), let value = Double(amount) else { return }
        Task {
            do {
                let _: AdminUser = try await service.updateUserBalance(user.id, amount: value, operation: operation, notes: notes.nilIfBlank)
                dismiss()
            } catch { errorMessage = error.localizedDescription }
        }
    }
}
