import SwiftUI
import UIKit

struct ManagementHubView: View {
    @EnvironmentObject private var store: AppStore
    @State private var stats: DashboardStats?

    private let modules = [
        ManagementModule(title: "账号管理", subtitle: "账号状态、调度与异常处理", symbol: "shield.checkered", tint: AppPalette.teal, destination: .accounts),
        ManagementModule(title: "API 密钥", subtitle: "搜索、复制与额度状态", symbol: "key.fill", tint: AppPalette.blue, destination: .apiKeys),
        ManagementModule(title: "分组管理", subtitle: "分组容量、倍率与启停", symbol: "folder.fill", tint: Color.cyan, destination: .groups),
        ManagementModule(title: "使用记录", subtitle: "请求、Token、成本与延迟", symbol: "clock.arrow.circlepath", tint: AppPalette.orange, destination: .usage),
        ManagementModule(title: "运维监控", subtitle: "实时流量、错误率和告警", symbol: "waveform.path.ecg", tint: AppPalette.purple, destination: .ops)
    ]

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                PageHeader(title: "管理", subtitle: "Sub2API 资源与运维工具", symbol: "square.grid.2x2.fill", tint: AppPalette.teal)

                Grid(horizontalSpacing: 9, verticalSpacing: 9) {
                    GridRow {
                        MetricTile(label: "账号", value: NumberFormatters.compact(stats?.totalAccounts), symbol: "shield", tint: AppPalette.teal)
                        MetricTile(label: "API Key", value: NumberFormatters.compact(stats?.totalAPIKeys), symbol: "key", tint: AppPalette.blue)
                    }
                    GridRow {
                        MetricTile(label: "今日请求", value: NumberFormatters.compact(stats?.todayRequests), symbol: "arrow.up.arrow.down", tint: AppPalette.purple)
                        MetricTile(label: "异常账号", value: NumberFormatters.compact(stats?.errorAccounts), symbol: "exclamationmark.triangle", tint: AppPalette.orange)
                    }
                }

                ForEach(modules) { module in
                    NavigationLink(value: module.destination) {
                        HStack(spacing: 13) {
                            Image(systemName: module.symbol)
                                .font(.system(size: 19, weight: .semibold))
                                .foregroundStyle(module.tint)
                                .frame(width: 42, height: 42)
                                .background(module.tint.opacity(0.1), in: RoundedRectangle(cornerRadius: 13))
                            VStack(alignment: .leading, spacing: 4) {
                                Text(module.title).font(.headline)
                                Text(module.subtitle).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
                        }
                        .padding(15)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .glassPanel(cornerRadius: 18, interactive: true)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .navigationBarHidden(true)
        .navigationDestination(for: ManagementDestination.self) { destination in
            switch destination {
            case .accounts: AccountsView()
            case .apiKeys: APIKeysView()
            case .groups: GroupsView()
            case .usage: UsageRecordsView()
            case .ops: OpsView()
            }
        }
        .appPage()
        .task(id: store.activeServerID) {
            guard let client = try? store.client() else { return }
            stats = try? await client.get("/api/v1/admin/dashboard/stats")
        }
    }
}

private struct ManagementModule: Identifiable {
    var id: ManagementDestination { destination }
    let title: String
    let subtitle: String
    let symbol: String
    let tint: Color
    let destination: ManagementDestination
}

private enum ManagementDestination: Hashable {
    case accounts, apiKeys, groups, usage, ops
}

struct AccountsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var accounts: [AdminAccount] = []
    @State private var searchText = ""
    @State private var statusFilter = "all"
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var showsCreate = false

    var filteredAccounts: [AdminAccount] {
        accounts.filter { account in
            let matchesSearch = searchText.isEmpty || account.name.localizedCaseInsensitiveContains(searchText) || account.platform.localizedCaseInsensitiveContains(searchText)
            let style = StatusStyle.account(account).0
            let matchesStatus = statusFilter == "all" || style == statusFilter
            return matchesSearch && matchesStatus
        }
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                Picker("状态", selection: $statusFilter) {
                    Text("全部").tag("all")
                    Text("正常").tag("正常")
                    Text("暂停").tag("暂停")
                    Text("异常").tag("异常")
                    Text("限流").tag("限流")
                }
                .pickerStyle(.segmented)

                if isLoading && accounts.isEmpty { LoadingView(label: "正在加载账号") }
                else if let errorMessage, accounts.isEmpty { InlineErrorView(message: errorMessage) { Task { await load() } } }
                else if filteredAccounts.isEmpty { EmptyContentView(symbol: "shield.slash", title: "暂无账号", message: "当前筛选条件下没有匹配账号。") }
                else {
                    ForEach(filteredAccounts) { account in
                        NavigationLink {
                            AccountDetailView(account: account)
                        } label: {
                            AccountRow(account: account)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(16)
        }
        .searchable(text: $searchText, prompt: "账号名称或平台")
        .refreshable { await load() }
        .navigationTitle("账号管理")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showsCreate = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel("添加账号")
            }
        }
        .sheet(isPresented: $showsCreate, onDismiss: { Task { await load() } }) { CreateAccountView() }
        .appPage()
        .task(id: store.activeServerID) { await load() }
    }

    private func load() async {
        guard let client = try? store.client() else { return }
        isLoading = true
        do {
            let page: Page<AdminAccount> = try await client.listPage(
                "/api/v1/admin/accounts",
                query: [URLQueryItem(name: "page", value: "1"), URLQueryItem(name: "page_size", value: "100")],
                itemKeys: ["accounts", "items", "data"]
            )
            accounts = page.items
            errorMessage = nil
        } catch { errorMessage = error.localizedDescription }
        isLoading = false
    }
}

private struct AccountRow: View {
    let account: AdminAccount

    var body: some View {
        let style = StatusStyle.account(account)
        HStack(spacing: 12) {
            Image(systemName: platformSymbol(account.platform))
                .font(.title3)
                .foregroundStyle(platformColor(account.platform))
                .frame(width: 42, height: 42)
                .background(platformColor(account.platform).opacity(0.1), in: RoundedRectangle(cornerRadius: 13))
            VStack(alignment: .leading, spacing: 4) {
                Text(account.name).font(.subheadline.bold()).lineLimit(1)
                Text("\(account.platform) · \(account.type)").font(.caption).foregroundStyle(.secondary)
                HStack(spacing: 10) {
                    Label("\(account.currentConcurrency ?? 0)/\(account.concurrency ?? 0)", systemImage: "bolt.horizontal")
                    if let group = account.groupName { Label(group, systemImage: "folder") }
                }
                .font(.caption2).foregroundStyle(.secondary)
            }
            Spacer(minLength: 4)
            StatusPill(text: style.0, color: style.1)
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
        }
        .padding(14)
        .contentShape(Rectangle())
        .glassPanel(cornerRadius: 18, interactive: true)
    }

    private func platformSymbol(_ platform: String) -> String {
        switch platform.lowercased() {
        case "openai": "brain.head.profile"
        case "anthropic": "sparkles"
        case "gemini", "antigravity": "diamond.fill"
        case "grok": "bolt.fill"
        default: "server.rack"
        }
    }

    private func platformColor(_ platform: String) -> Color {
        switch platform.lowercased() {
        case "openai": AppPalette.teal
        case "anthropic": AppPalette.orange
        case "gemini", "antigravity": AppPalette.blue
        case "grok": AppPalette.purple
        default: .secondary
        }
    }
}

private struct AccountDetailView: View {
    @EnvironmentObject private var store: AppStore
    @State var account: AdminAccount
    @State private var isWorking = false
    @State private var message: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(account.name).font(.title3.bold())
                            Text("\(account.platform) · \(account.type) · ID \(account.id)").font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        let style = StatusStyle.account(account)
                        StatusPill(text: style.0, color: style.1)
                    }
                    if let note = account.notes, !note.isEmpty { Text(note).font(.footnote).foregroundStyle(.secondary) }
                }
                .padding(16)
                .glassPanel()

                Grid(horizontalSpacing: 10, verticalSpacing: 10) {
                    GridRow {
                        MetricTile(label: "并发", value: "\(account.currentConcurrency ?? 0)/\(account.concurrency ?? 0)", symbol: "bolt.horizontal", tint: AppPalette.blue)
                        MetricTile(label: "优先级", value: "\(account.priority ?? 0)", symbol: "arrow.up.circle", tint: AppPalette.purple)
                    }
                    GridRow {
                        MetricTile(label: "倍率", value: String(format: "%.2fx", account.rateMultiplier ?? 1), symbol: "multiply.circle", tint: AppPalette.orange)
                        MetricTile(label: "隐私", value: account.privacy == true ? "已开启" : (account.privacyMode ?? "默认"), symbol: "hand.raised", tint: AppPalette.teal)
                    }
                }

                VStack(alignment: .leading, spacing: 12) {
                    Text("账号操作").font(.headline)
                    HStack {
                        actionButton("刷新凭证", symbol: "arrow.clockwise", tint: AppPalette.blue) { await action("refresh", method: .post) }
                        actionButton("清除错误", symbol: "xmark.circle", tint: AppPalette.orange) { await action("clear-error", method: .post) }
                    }
                    HStack {
                        actionButton("清除限流", symbol: "gauge.open.with.lines.needle.33percent", tint: AppPalette.purple) { await action("clear-rate-limit", method: .post) }
                        actionButton(account.schedulable == false ? "恢复调度" : "暂停调度", symbol: "pause.circle", tint: AppPalette.teal) { await toggleSchedulable() }
                    }
                    if let message { Text(message).font(.footnote).foregroundStyle(.secondary) }
                }
                .padding(16)
                .glassPanel()

                if let error = account.errorMessage ?? account.error, !error.isEmpty {
                    InlineErrorView(message: error)
                }
            }
            .padding(16)
        }
        .navigationTitle("账号详情")
        .navigationBarTitleDisplayMode(.inline)
        .disabled(isWorking)
        .overlay { if isWorking { ProgressView().padding(20).glassPanel(cornerRadius: 14) } }
        .appPage()
    }

    private func actionButton(_ title: String, symbol: String, tint: Color, operation: @escaping () async -> Void) -> some View {
        Button { Task { await operation() } } label: {
            Label(title, systemImage: symbol).font(.caption.weight(.semibold)).frame(maxWidth: .infinity).padding(.vertical, 9)
        }
        .buttonStyle(.bordered)
        .tint(tint)
    }

    private func action(_ suffix: String, method: HTTPMethod) async {
        guard let client = try? store.client() else { return }
        isWorking = true
        do {
            let _: EmptyResponse = try await client.send("/api/v1/admin/accounts/\(account.id)/\(suffix)", method: method)
            account = try await client.get("/api/v1/admin/accounts/\(account.id)")
            message = "操作已完成。"
        } catch { message = error.localizedDescription }
        isWorking = false
    }

    private func toggleSchedulable() async {
        guard let client = try? store.client() else { return }
        struct Body: Encodable, Sendable { let schedulable: Bool }
        isWorking = true
        do {
            account = try await client.send("/api/v1/admin/accounts/\(account.id)/schedulable", method: .put, body: Body(schedulable: account.schedulable == false))
            message = "调度状态已更新。"
        } catch { message = error.localizedDescription }
        isWorking = false
    }
}

private struct CreateAccountView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    @State private var name = ""
    @State private var platform = "openai"
    @State private var type = "apikey"
    @State private var apiKey = ""
    @State private var concurrency = "1"
    @State private var notes = ""
    @State private var errorMessage: String?
    @State private var isSaving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("账号") {
                    TextField("名称", text: $name)
                    Picker("平台", selection: $platform) {
                        ForEach(["openai", "anthropic", "gemini", "antigravity", "grok"], id: \.self) { Text($0.capitalized).tag($0) }
                    }
                    Picker("类型", selection: $type) {
                        Text("API Key").tag("apikey")
                        Text("OAuth").tag("oauth")
                        Text("Service Account").tag("service_account")
                    }
                }
                Section("凭证") {
                    SecureField(type == "oauth" ? "Access Token" : "API Key", text: $apiKey)
                    TextField("并发数", text: $concurrency).keyboardType(.numberPad)
                    TextField("备注（可选）", text: $notes)
                }
                if let errorMessage { Section { Text(errorMessage).foregroundStyle(.red) } }
            }
            .navigationTitle("添加账号")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button(isSaving ? "保存中" : "保存") { save() }.disabled(isSaving || name.isEmpty || apiKey.isEmpty) }
            }
        }
    }

    private func save() {
        guard let client = try? store.client() else { return }
        struct Body: Encodable, Sendable {
            let name: String
            let notes: String?
            let platform: String
            let type: String
            let credentials: [String: String]
            let concurrency: Int
            let priority: Int
            let rateMultiplier: Double
            enum CodingKeys: String, CodingKey { case name, notes, platform, type, credentials, concurrency, priority; case rateMultiplier = "rate_multiplier" }
        }
        let credentialName = type == "oauth" ? "access_token" : "api_key"
        isSaving = true
        Task {
            do {
                let _: AdminAccount = try await client.send("/api/v1/admin/accounts", method: .post, body: Body(name: name, notes: notes.isEmpty ? nil : notes, platform: platform, type: type, credentials: [credentialName: apiKey], concurrency: Int(concurrency) ?? 1, priority: 0, rateMultiplier: 1))
                dismiss()
            } catch { errorMessage = error.localizedDescription }
            isSaving = false
        }
    }
}

struct APIKeysView: View {
    @EnvironmentObject private var store: AppStore
    @State private var keys: [AdminAPIKey] = []
    @State private var searchText = ""
    @State private var isLoading = true
    @State private var errorMessage: String?

    var filteredKeys: [AdminAPIKey] {
        guard !searchText.isEmpty else { return keys }
        return keys.filter { ($0.name ?? "").localizedCaseInsensitiveContains(searchText) || ($0.userEmail ?? "").localizedCaseInsensitiveContains(searchText) || ($0.groupName ?? "").localizedCaseInsensitiveContains(searchText) }
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                if isLoading && keys.isEmpty { LoadingView(label: "正在加载 API 密钥") }
                else if let errorMessage, keys.isEmpty { InlineErrorView(message: errorMessage) { Task { await load() } } }
                else if filteredKeys.isEmpty { EmptyContentView(symbol: "key.slash", title: "暂无密钥", message: "没有找到符合条件的 API 密钥。") }
                else {
                    ForEach(filteredKeys) { key in
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Image(systemName: "key.fill").foregroundStyle(AppPalette.blue)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(key.name ?? "未命名密钥").font(.subheadline.bold())
                                    Text(key.userEmail ?? "用户 #\(key.userID ?? 0)").font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                let style = StatusStyle.generic(key.status)
                                StatusPill(text: style.0, color: style.1)
                            }
                            HStack {
                                Text(masked(key.customKey ?? key.key)).font(.caption.monospaced()).foregroundStyle(.secondary).textSelection(.enabled)
                                Spacer()
                                if let group = key.groupName { Label(group, systemImage: "folder").font(.caption2).foregroundStyle(.secondary) }
                            }
                            if let quota = key.quota, quota > 0 {
                                ProgressView(value: min((key.quotaUsed ?? 0) / quota, 1)).tint(AppPalette.blue)
                                Text("额度 \(NumberFormatters.compact(key.quotaUsed)) / \(NumberFormatters.compact(quota))").font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                        .padding(14)
                        .glassPanel(cornerRadius: 18)
                        .contextMenu {
                            if let rawKey = key.customKey ?? key.key {
                                Button { UIPasteboard.general.string = rawKey } label: { Label("复制密钥", systemImage: "doc.on.doc") }
                            }
                        }
                    }
                }
            }
            .padding(16)
        }
        .searchable(text: $searchText, prompt: "名称、用户或分组")
        .refreshable { await load() }
        .navigationTitle("API 密钥")
        .appPage()
        .task(id: store.activeServerID) { await load() }
    }

    private func load() async {
        guard let client = try? store.client() else { return }
        isLoading = true
        do {
            do {
                let page: Page<AdminAPIKey> = try await client.listPage("/api/v1/keys", query: [URLQueryItem(name: "page", value: "1"), URLQueryItem(name: "page_size", value: "100")], itemKeys: ["api_keys", "apiKeys", "keys", "items"])
                keys = page.items
            } catch {
                let page: Page<AdminAPIKey> = try await client.listPage("/api/v1/admin/api-keys", query: [URLQueryItem(name: "page", value: "1"), URLQueryItem(name: "page_size", value: "100")], itemKeys: ["api_keys", "apiKeys", "keys", "items"])
                keys = page.items
            }
            errorMessage = nil
        } catch { errorMessage = error.localizedDescription }
        isLoading = false
    }

    private func masked(_ value: String?) -> String {
        guard let value, value.count > 10 else { return "••••••••" }
        return "\(value.prefix(5))••••••\(value.suffix(4))"
    }
}

struct GroupsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var groups: [AdminGroup] = []
    @State private var searchText = ""
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var showsCreate = false

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                if isLoading && groups.isEmpty { LoadingView(label: "正在加载分组") }
                else if let errorMessage, groups.isEmpty { InlineErrorView(message: errorMessage) { Task { await load() } } }
                else {
                    ForEach(groups.filter { searchText.isEmpty || $0.name.localizedCaseInsensitiveContains(searchText) || $0.platform.localizedCaseInsensitiveContains(searchText) }) { group in
                        VStack(alignment: .leading, spacing: 12) {
                            HStack {
                                Image(systemName: group.isExclusive == true ? "lock.folder.fill" : "folder.fill")
                                    .foregroundStyle(Color.cyan)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(group.name).font(.subheadline.bold())
                                    Text("\(group.platform) · \(group.isExclusive == true ? "独占" : "共享")").font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                let style = StatusStyle.generic(group.status)
                                StatusPill(text: style.0, color: style.1)
                            }
                            HStack(spacing: 16) {
                                Label("账号 \(group.activeAccountCount ?? group.accountCount ?? 0)", systemImage: "shield")
                                Label(String(format: "%.2fx", group.rateMultiplier ?? 1), systemImage: "multiply.circle")
                                if let rpm = group.rpmLimit { Label("\(rpm) RPM", systemImage: "speedometer") }
                            }
                            .font(.caption).foregroundStyle(.secondary)
                            if let description = group.description, !description.isEmpty { Text(description).font(.caption).foregroundStyle(.secondary).lineLimit(2) }
                        }
                        .padding(14)
                        .glassPanel(cornerRadius: 18)
                    }
                    if groups.isEmpty { EmptyContentView(symbol: "folder.badge.questionmark", title: "暂无分组", message: "添加分组后可绑定账号与密钥。") }
                }
            }
            .padding(16)
        }
        .searchable(text: $searchText, prompt: "分组名称或平台")
        .refreshable { await load() }
        .navigationTitle("分组管理")
        .toolbar { ToolbarItem(placement: .primaryAction) { Button { showsCreate = true } label: { Image(systemName: "plus") } } }
        .sheet(isPresented: $showsCreate, onDismiss: { Task { await load() } }) { CreateGroupView() }
        .appPage()
        .task(id: store.activeServerID) { await load() }
    }

    private func load() async {
        guard let client = try? store.client() else { return }
        isLoading = true
        do {
            let page: Page<AdminGroup> = try await client.get("/api/v1/admin/groups", query: [URLQueryItem(name: "page", value: "1"), URLQueryItem(name: "page_size", value: "50"), URLQueryItem(name: "sort_by", value: "sort_order"), URLQueryItem(name: "sort_order", value: "asc")])
            groups = page.items
            errorMessage = nil
        } catch { errorMessage = error.localizedDescription }
        isLoading = false
    }
}

private struct CreateGroupView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    @State private var name = ""
    @State private var platform = "openai"
    @State private var description = ""
    @State private var rateMultiplier = "1.0"
    @State private var exclusive = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("分组") {
                    TextField("名称", text: $name)
                    Picker("平台", selection: $platform) { ForEach(["openai", "anthropic", "gemini", "antigravity", "grok"], id: \.self) { Text($0.capitalized).tag($0) } }
                    TextField("描述（可选）", text: $description)
                }
                Section("策略") {
                    TextField("费率倍率", text: $rateMultiplier).keyboardType(.decimalPad)
                    Toggle("独占分组", isOn: $exclusive)
                }
                if let errorMessage { Section { Text(errorMessage).foregroundStyle(.red) } }
            }
            .navigationTitle("添加分组")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("保存") { save() }.disabled(name.isEmpty) }
            }
        }
    }

    private func save() {
        guard let client = try? store.client() else { return }
        struct Body: Encodable, Sendable {
            let name: String; let description: String?; let platform: String; let rateMultiplier: Double; let isExclusive: Bool; let status: String
            enum CodingKeys: String, CodingKey { case name, description, platform, status; case rateMultiplier = "rate_multiplier"; case isExclusive = "is_exclusive" }
        }
        Task {
            do {
                let _: AdminGroup = try await client.send("/api/v1/admin/groups", method: .post, body: Body(name: name, description: description.isEmpty ? nil : description, platform: platform, rateMultiplier: Double(rateMultiplier) ?? 1, isExclusive: exclusive, status: "active"))
                dismiss()
            } catch { errorMessage = error.localizedDescription }
        }
    }
}

struct UsageRecordsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var records: [UsageRecord] = []
    @State private var summary: UsageSummary?
    @State private var rangeDays = 7
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                Picker("范围", selection: $rangeDays) { Text("24H").tag(1); Text("7D").tag(7); Text("30D").tag(30) }.pickerStyle(.segmented)
                Grid(horizontalSpacing: 9, verticalSpacing: 9) {
                    GridRow {
                        MetricTile(label: "请求", value: NumberFormatters.compact(summary?.totalRequests ?? summary?.requestCount), symbol: "arrow.up.arrow.down", tint: AppPalette.blue)
                        MetricTile(label: "Token", value: NumberFormatters.compact(summary?.totalTokens), symbol: "cpu", tint: AppPalette.teal)
                    }
                    GridRow {
                        MetricTile(label: "成本", value: NumberFormatters.currency(summary?.actualCost ?? summary?.totalCost), symbol: "dollarsign.circle", tint: AppPalette.orange)
                        MetricTile(label: "平均延迟", value: String(format: "%.0fms", summary?.avgDurationMs ?? 0), symbol: "timer", tint: AppPalette.purple)
                    }
                }
                if isLoading && records.isEmpty { LoadingView(label: "正在加载使用记录") }
                else if let errorMessage, records.isEmpty { InlineErrorView(message: errorMessage) { Task { await load() } } }
                else if records.isEmpty { EmptyContentView(symbol: "clock.badge.questionmark", title: "暂无记录", message: "此时间范围内没有请求记录。") }
                else {
                    ForEach(records) { record in
                        VStack(alignment: .leading, spacing: 9) {
                            HStack {
                                Text(record.model ?? record.requestedModel ?? "未知模型").font(.subheadline.bold()).lineLimit(1)
                                Spacer()
                                Text(NumberFormatters.currency(record.actualCost ?? record.totalCost)).font(.caption.monospacedDigit()).foregroundStyle(AppPalette.orange)
                            }
                            HStack(spacing: 12) {
                                Label(record.user?.email ?? "未知用户", systemImage: "person")
                                Label(record.account?.name ?? "未知账号", systemImage: "server.rack")
                            }.lineLimit(1)
                            HStack(spacing: 12) {
                                Label(NumberFormatters.compact((record.inputTokens ?? 0) + (record.outputTokens ?? 0)), systemImage: "cpu")
                                Label(String(format: "%.0fms", record.durationMs ?? 0), systemImage: "timer")
                                Spacer()
                                Text(record.createdAt ?? "")
                            }
                            .font(.caption2).foregroundStyle(.secondary)
                        }
                        .padding(14)
                        .glassPanel(cornerRadius: 18)
                    }
                }
            }
            .padding(16)
        }
        .refreshable { await load() }
        .navigationTitle("使用记录")
        .appPage()
        .task(id: "\(store.activeServerID?.uuidString ?? "")-\(rangeDays)") { await load() }
    }

    private func load() async {
        guard let client = try? store.client() else { return }
        isLoading = true
        let range = dateRange(days: rangeDays)
        do {
            let query = [URLQueryItem(name: "start_date", value: range.0), URLQueryItem(name: "end_date", value: range.1), URLQueryItem(name: "page", value: "1"), URLQueryItem(name: "page_size", value: "50"), URLQueryItem(name: "sort_by", value: "created_at"), URLQueryItem(name: "sort_order", value: "desc")]
            async let nextRecords: Page<UsageRecord> = client.get("/api/v1/admin/usage", query: query)
            async let nextSummary: UsageSummary = client.get("/api/v1/admin/usage/stats", query: Array(query.prefix(2)))
            let result = try await (nextRecords, nextSummary)
            records = result.0.items
            summary = result.1
            errorMessage = nil
        } catch { errorMessage = error.localizedDescription }
        isLoading = false
    }

    private func dateRange(days: Int) -> (String, String) {
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "yyyy-MM-dd"
        let now = Date(); let start = Calendar.current.date(byAdding: .day, value: -(days - 1), to: now) ?? now
        return (formatter.string(from: start), formatter.string(from: now))
    }
}

struct OpsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var overview: OpsOverview?
    @State private var errors: [UsageRecord] = []
    @State private var range = "24h"
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                Picker("范围", selection: $range) { Text("1H").tag("1h"); Text("24H").tag("24h"); Text("7D").tag("7d") }.pickerStyle(.segmented)
                Grid(horizontalSpacing: 9, verticalSpacing: 9) {
                    GridRow {
                        MetricTile(label: "请求", value: NumberFormatters.compact(overview?.totalRequests ?? overview?.requests), symbol: "waveform.path", tint: AppPalette.blue)
                        MetricTile(label: "错误率", value: NumberFormatters.percent(overview?.errorRate), symbol: "exclamationmark.triangle", tint: AppPalette.orange)
                    }
                    GridRow {
                        MetricTile(label: "平均延迟", value: String(format: "%.0fms", overview?.avgLatencyMs ?? 0), symbol: "timer", tint: AppPalette.purple)
                        MetricTile(label: "P95", value: String(format: "%.0fms", overview?.p95LatencyMs ?? 0), symbol: "gauge.with.dots.needle.67percent", tint: AppPalette.teal)
                    }
                }
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Label("实时状态", systemImage: "dot.radiowaves.left.and.right").font(.headline)
                        Spacer()
                        StatusPill(text: (overview?.errorRate ?? 0) < 0.05 ? "稳定" : "需关注", color: (overview?.errorRate ?? 0) < 0.05 ? .green : AppPalette.orange)
                    }
                    HStack {
                        Label("\(NumberFormatters.compact(overview?.rpm)) RPM", systemImage: "speedometer")
                        Spacer()
                        Label("\(NumberFormatters.compact(overview?.activeAccounts)) 活跃账号", systemImage: "server.rack")
                        Spacer()
                        Label("\(NumberFormatters.compact(overview?.alertCount)) 告警", systemImage: "bell")
                    }.font(.caption).foregroundStyle(.secondary)
                }
                .padding(16)
                .glassPanel()

                if isLoading && overview == nil { LoadingView(label: "正在加载运维数据") }
                if let errorMessage { InlineErrorView(message: errorMessage) { Task { await load() } } }
            }
            .padding(16)
        }
        .refreshable { await load() }
        .navigationTitle("运维监控")
        .appPage()
        .task(id: "\(store.activeServerID?.uuidString ?? "")-\(range)") { await load() }
    }

    private func load() async {
        guard let client = try? store.client() else { return }
        isLoading = true
        do {
            overview = try await client.get("/api/v1/admin/ops/dashboard/overview", query: [URLQueryItem(name: "time_range", value: range)])
            errorMessage = nil
        } catch { errorMessage = error.localizedDescription }
        isLoading = false
    }
}
