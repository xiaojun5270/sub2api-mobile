import Charts
import SwiftUI
import UniformTypeIdentifiers

struct AccountsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var accounts: [AdminAccount] = []
    @State private var searchText = ""
    @State private var statusFilter = "all"
    @State private var platformFilter = "all"
    @State private var typeFilter = "all"
    @State private var isLoading = true
    @State private var isWorking = false
    @State private var errorMessage: String?
    @State private var message: String?
    @State private var showsCreate = false
    @State private var editingAccount: AdminAccount?
    @State private var quotaAccount: AdminAccount?
    @State private var advancedAccount: AdminAccount?
    @State private var deletingAccount: AdminAccount?
    @State private var showsImporter = false
    @State private var showsExporter = false
    @State private var exportDocument = JSONFileDocument()
    @State private var metricsByAccount: [Int: AccountCardMetrics] = [:]
    @State private var quotaByAccount: [Int: JSONValue] = [:]
    @State private var modelPickerAccount: AdminAccount?
    @State private var selectedModelByAccount: [Int: String] = [:]
    @State private var detailAccount: AdminAccount?

    private var filtered: [AdminAccount] {
        accounts.filter { account in
            let haystack = "\(account.id) \(account.name) \(account.platform) \(account.type) \(account.groupName ?? "")"
            let searchOK = searchText.isEmpty || haystack.localizedCaseInsensitiveContains(searchText)
            let statusOK = statusFilter == "all" || StatusStyle.account(account).0 == statusFilter
            return searchOK && statusOK && (platformFilter == "all" || account.platform == platformFilter) && (typeFilter == "all" || account.type == typeFilter)
        }
    }

    private var platforms: [String] { ["all"] + Array(Set(accounts.map(\.platform))).sorted() }
    private var types: [String] { ["all"] + Array(Set(accounts.map(\.type))).sorted() }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                summary
                filterBar
                if let message {
                    Text(message).font(.footnote).foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 4)
                }
                if isLoading && accounts.isEmpty {
                    HStack { Spacer(); ProgressView(); Text("正在加载账号").font(.footnote).foregroundStyle(.secondary); Spacer() }
                        .padding(.vertical, 28)
                } else if let errorMessage, accounts.isEmpty {
                    InlineErrorView(message: errorMessage) { Task { await load() } }
                } else if filtered.isEmpty {
                    ContentUnavailableView("暂无账号", systemImage: "shield.slash", description: Text("当前筛选条件下没有匹配账号。"))
                } else {
                    ForEach(filtered) { account in
                        AccountSummaryCard(
                            account: account,
                            metrics: metricsByAccount[account.id] ?? .empty,
                            quota: quotaByAccount[account.id] ?? account.quota ?? account.usage,
                            selectedModel: selectedModelByAccount[account.id],
                            onOpen: { detailAccount = account },
                            onQueryQuota: { Task { await queryQuota(account) } },
                            onCountQuota: { Task { await showQuotaCount(account) } },
                            onResetQuota: { Task { await resetQuota(account) } },
                            onEdit: { editingAccount = account },
                            onToggleEnabled: { Task { await toggleEnabled(account) } },
                            onToggleScheduling: { Task { await toggle(account) } },
                            onDelete: { deletingAccount = account },
                            onTest: { Task { await test(account) } },
                            onSelectModel: { modelPickerAccount = account }
                        )
                        .contextMenu { accountMenu(account) }
                    }
                }
            }
            .padding(12)
        }
        .scrollIndicators(.hidden)
        .searchable(text: $searchText, prompt: "名称、ID、平台或分组")
        .refreshable { await load() }
        .navigationTitle("账号管理")
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Menu {
                    Button { Task { await batchRefresh() } } label: { Label("刷新当前结果", systemImage: "arrow.clockwise") }
                    Button { exportAccounts() } label: { Label("导出当前结果", systemImage: "square.and.arrow.up") }
                    Button { showsImporter = true } label: { Label("导入账号 JSON", systemImage: "square.and.arrow.down") }
                    Divider()
                    Button(role: .destructive) { Task { await deleteErrors() } } label: { Label("删除全部异常账号", systemImage: "trash") }
                } label: { Image(systemName: "ellipsis.circle") }
                Button { showsCreate = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $showsCreate, onDismiss: { Task { await load() } }) { AccountCreationView() }
        .sheet(item: $editingAccount, onDismiss: { Task { await load() } }) { AccountEditorView(account: $0) }
        .sheet(item: $quotaAccount) { AccountQuotaView(account: $0) }
        .sheet(item: $advancedAccount) { AccountAdvancedView(account: $0) }
        .sheet(item: $modelPickerAccount) { account in
            AccountModelPickerView(account: account, selected: selectedModelByAccount[account.id]) { model in
                selectedModelByAccount[account.id] = model
                modelPickerAccount = nil
            }
        }
        .navigationDestination(item: $detailAccount) { AccountDetailView(initialAccount: $0) }
        .confirmationDialog("删除账号？", isPresented: Binding(get: { deletingAccount != nil }, set: { if !$0 { deletingAccount = nil } }), titleVisibility: .visible) {
            Button("删除", role: .destructive) { if let account = deletingAccount { Task { await delete(account) } } }
        } message: { Text(deletingAccount?.name ?? "") }
        .fileImporter(isPresented: $showsImporter, allowedContentTypes: [.json, .plainText]) { result in importAccounts(result) }
        .fileExporter(isPresented: $showsExporter, document: exportDocument, contentType: .json, defaultFilename: "sub2api-accounts") { result in
            if case let .failure(error) = result { message = error.localizedDescription }
        }
        .overlay { if isWorking { ProgressView().padding(20).glassPanel(cornerRadius: 14) } }
        .appPage()
        .task(id: store.activeServerID) { await load() }
    }

    private var summary: some View {
        let active = accounts.filter { StatusStyle.account($0).0 == "正常" }.count
        let paused = accounts.filter { StatusStyle.account($0).0 == "暂停" }.count
        let errors = accounts.filter { StatusStyle.account($0).0 == "异常" }.count
        let limited = accounts.filter { StatusStyle.account($0).0 == "限流" }.count
        return HStack(spacing: 0) {
            compactMetric("全部", accounts.count, .primary)
            compactMetric("正常", active, .green)
            compactMetric("暂停", paused, .secondary)
            compactMetric("异常", errors, AppPalette.orange)
            compactMetric("限流", limited, AppPalette.purple)
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 4)
    }

    private func compactMetric(_ label: String, _ value: Int, _ color: Color) -> some View {
        VStack(spacing: 3) { Text("\(value)").font(.headline.monospacedDigit()).foregroundStyle(color); Text(label).font(.caption2).foregroundStyle(.secondary) }.frame(maxWidth: .infinity)
    }

    private var filterBar: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                Menu { ForEach(["all", "正常", "暂停", "异常", "限流"], id: \.self) { value in Button(value == "all" ? "全部状态" : value) { statusFilter = value } } } label: { filterLabel(statusFilter == "all" ? "全部状态" : statusFilter, active: statusFilter != "all") }
                Menu { ForEach(platforms, id: \.self) { value in Button(value == "all" ? "全部平台" : value) { platformFilter = value } } } label: { filterLabel(platformFilter == "all" ? "全部平台" : platformFilter, active: platformFilter != "all") }
                Menu { ForEach(types, id: \.self) { value in Button(value == "all" ? "全部类型" : value) { typeFilter = value } } } label: { filterLabel(typeFilter == "all" ? "全部类型" : typeFilter, active: typeFilter != "all") }
                if statusFilter != "all" || platformFilter != "all" || typeFilter != "all" { Button("清除") { statusFilter = "all"; platformFilter = "all"; typeFilter = "all" }.font(.caption) }
            }
        }.scrollIndicators(.hidden)
    }

    private func filterLabel(_ text: String, active: Bool) -> some View {
        HStack(spacing: 5) { Text(text); Image(systemName: "chevron.down").font(.caption2) }.font(.caption.weight(.semibold)).foregroundStyle(active ? Color.white : Color.primary).padding(.horizontal, 11).padding(.vertical, 8).background(active ? AppPalette.teal : Color.primary.opacity(0.06), in: Capsule())
    }

    @ViewBuilder private func accountMenu(_ account: AdminAccount) -> some View {
        Button { Task { await test(account) } } label: { Label("测试", systemImage: "checkmark.circle") }
        Button { editingAccount = account } label: { Label("编辑", systemImage: "pencil") }
        Button { Task { await toggle(account) } } label: { Label(account.schedulable == false ? "恢复调度" : "暂停调度", systemImage: "pause.circle") }
        Button { quotaAccount = account } label: { Label("查询额度", systemImage: "gauge") }
        Button { advancedAccount = account } label: { Label("网页高级功能", systemImage: "wrench.and.screwdriver") }
        Divider()
        Button(role: .destructive) { deletingAccount = account } label: { Label("删除", systemImage: "trash") }
    }

    private func load() async {
        guard let service = try? store.adminService() else { return }
        isLoading = true
        do {
            accounts = try await service.accounts().items
            let ids = accounts.map(\.id)
            async let today: JSONValue? = try? await service.accountTodayBatch(ids)
            async let totals: JSONValue? = try? await service.accountUsageBatch(ids)
            let batch = await (today, totals)
            metricsByAccount = mergeMetrics(today: batch.0, totals: batch.1)
            errorMessage = nil
        } catch { errorMessage = error.localizedDescription }
        isLoading = false
    }

    private func test(_ account: AdminAccount) async {
        guard let service = try? store.adminService() else { return }; isWorking = true
        do { _ = try await service.accountAction(account.id, action: .test(model: selectedModelByAccount[account.id], prompt: nil)); message = "\(account.name) 测试成功" } catch { message = "测试失败：\(error.localizedDescription)" }
        isWorking = false
    }

    private func toggle(_ account: AdminAccount) async {
        guard let service = try? store.adminService() else { return }; isWorking = true
        do { _ = try await service.accountAction(account.id, action: .schedulable(account.schedulable == false)); await load() } catch { message = error.localizedDescription }
        isWorking = false
    }

    private func toggleEnabled(_ account: AdminAccount) async {
        guard let service = try? store.adminService() else { return }; isWorking = true
        let disabled = ["inactive", "disabled"].contains((account.status ?? "active").lowercased())
        do { _ = try await service.updateAccount(account.id, body: ["status": .string(disabled ? "active" : "disabled"), "schedulable": .bool(disabled)]); await load() } catch { message = error.localizedDescription }
        isWorking = false
    }

    private func queryQuota(_ account: AdminAccount) async {
        guard let service = try? store.adminService() else { return }; isWorking = true
        do { quotaByAccount[account.id] = try await service.quota(account); message = "\(account.name) 额度已更新" } catch { message = "额度查询失败：\(error.localizedDescription)" }
        isWorking = false
    }

    private func showQuotaCount(_ account: AdminAccount) async {
        if quotaByAccount[account.id] == nil { await queryQuota(account) }
        let value = quotaByAccount[account.id] ?? account.quota ?? account.usage
        message = value.map { "\(account.name) 次数/额度：\($0.displayText)" } ?? "未获取到次数信息"
    }

    private func resetQuota(_ account: AdminAccount) async {
        guard let service = try? store.adminService() else { return }; isWorking = true
        do {
            if account.platform.lowercased() == "openai" { quotaByAccount[account.id] = try await service.resetOpenAIQuota(account.id) }
            else { _ = try await service.accountAction(account.id, action: .resetQuota) }
            message = "\(account.name) 额度已重置"
            await queryQuota(account)
        } catch { message = "重置失败：\(error.localizedDescription)" }
        isWorking = false
    }

    private func mergeMetrics(today: JSONValue?, totals: JSONValue?) -> [Int: AccountCardMetrics] {
        var result: [Int: AccountCardMetrics] = [:]
        for (id, row) in metricRows(today) { result[id, default: .empty].applyToday(row) }
        for (id, row) in metricRows(totals) { result[id, default: .empty].applyTotal(row) }
        return result
    }

    private func metricRows(_ value: JSONValue?) -> [(Int, [String: JSONValue])] {
        guard let value else { return [] }
        if let array = value.arrayValue { return array.compactMap(\.objectValue).compactMap { row in let id = Int(row.number("account_id", "accountId", "id") ?? 0); return id > 0 ? (id, row) : nil } }
        guard let object = value.objectValue else { return [] }
        for key in ["items", "stats", "accounts", "records", "rows", "data"] {
            let rows = object.rows(key)
            if !rows.isEmpty { return rows.compactMap { row in let id = Int(row.number("account_id", "accountId", "id") ?? 0); return id > 0 ? (id, row) : nil } }
        }
        return object.compactMap { key, child in guard let id = Int(key), let row = child.objectValue else { return nil }; return (id, row) }
    }

    private func delete(_ account: AdminAccount) async {
        guard let service = try? store.adminService() else { return }; deletingAccount = nil; isWorking = true
        do { try await service.deleteAccount(account.id); await load() } catch { message = error.localizedDescription }
        isWorking = false
    }

    private func batchRefresh() async {
        guard let service = try? store.adminService(), !filtered.isEmpty else { return }; isWorking = true
        do { try await service.batchRefresh(filtered.map(\.id)); message = "已提交 \(filtered.count) 个账号刷新"; await load() } catch { message = error.localizedDescription }
        isWorking = false
    }

    private func deleteErrors() async {
        guard let service = try? store.adminService() else { return }
        let targets = accounts.filter { StatusStyle.account($0).0 == "异常" }; guard !targets.isEmpty else { message = "没有异常账号"; return }
        isWorking = true; var deleted = 0
        for account in targets { if (try? await service.deleteAccount(account.id)) != nil { deleted += 1 } }
        message = "已删除 \(deleted)/\(targets.count) 个异常账号"; await load(); isWorking = false
    }

    private func exportAccounts() {
        guard let service = try? store.adminService() else { return }; isWorking = true
        Task { do { let value = try await service.exportAccounts(ids: filtered.map(\.id)); exportDocument = JSONFileDocument(data: try FormParsing.jsonData(value)); showsExporter = true } catch { message = error.localizedDescription }; isWorking = false }
    }

    private func importAccounts(_ result: Result<URL, Error>) {
        guard case let .success(url) = result, let service = try? store.adminService() else { if case let .failure(error) = result { message = error.localizedDescription }; return }
        isWorking = true
        Task { do { let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }; let value = try FormParsing.jsonValue(Data(contentsOf: url)); let response = try await service.importAccounts(value); message = "导入完成：\(response.displayText)"; await load() } catch { message = error.localizedDescription }; isWorking = false }
    }
}

private struct AccountCardMetrics: Sendable {
    var todayRequests = 0.0
    var todayTokens = 0.0
    var todayActualCost = 0.0
    var todayUserCost = 0.0
    var totalRequests = 0.0
    var totalTokens = 0.0
    var totalCost = 0.0
    static let empty = AccountCardMetrics()

    mutating func applyToday(_ row: [String: JSONValue]) {
        todayRequests = row.number("requests", "request_count", "total_requests") ?? 0
        todayTokens = row.number("tokens", "total_tokens") ?? 0
        todayActualCost = row.number("cost", "actual_cost", "account_cost") ?? 0
        todayUserCost = row.number("user_cost", "userCost") ?? todayActualCost
    }

    mutating func applyTotal(_ row: [String: JSONValue]) {
        totalRequests = row.number("total_requests", "requests", "request_count") ?? 0
        totalTokens = row.number("total_tokens", "tokens") ?? 0
        totalCost = row.number("total_account_cost", "total_actual_cost", "total_cost", "actual_cost", "cost") ?? 0
    }
}

private struct AccountSummaryCard: View {
    let account: AdminAccount
    let metrics: AccountCardMetrics
    let quota: JSONValue?
    let selectedModel: String?
    let onOpen: () -> Void
    let onQueryQuota: () -> Void
    let onCountQuota: () -> Void
    let onResetQuota: () -> Void
    let onEdit: () -> Void
    let onToggleEnabled: () -> Void
    let onToggleScheduling: () -> Void
    let onDelete: () -> Void
    let onTest: () -> Void
    let onSelectModel: () -> Void

    private var style: (String, Color) { StatusStyle.account(account) }
    private var disabled: Bool { ["inactive", "disabled"].contains((account.status ?? "active").lowercased()) }
    private var fiveHour: QuotaWindow { quotaWindow(label: "5H", token: "5h") }
    private var sevenDay: QuotaWindow { quotaWindow(label: "7D", token: "7d") }

    var body: some View {
        VStack(spacing: 6) {
            Button(action: onOpen) {
                HStack(spacing: 7) {
                    Image(systemName: "key.fill").font(.caption2).foregroundStyle(AppPalette.blue)
                        .frame(width: 24, height: 24).background(AppPalette.blue.opacity(0.09), in: Circle())
                    Text(account.name).font(.headline).foregroundStyle(.primary).lineLimit(1)
                    Text("\(account.platform) · \(account.type)")
                        .font(.caption2.monospaced()).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.7)
                    Spacer(minLength: 4)
                    StatusPill(text: style.0, color: style.1)
                }
            }
            .buttonStyle(.plain)

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 5), count: 3), spacing: 5) {
                metric("今日请求", NumberFormatters.compact(metrics.todayRequests) + " req", "waveform.path.ecg", AppPalette.blue)
                metric("今日 Token", NumberFormatters.compact(metrics.todayTokens), "cpu", .cyan)
                metric("今日额度", "A \(NumberFormatters.currency(metrics.todayActualCost))\nU \(NumberFormatters.currency(metrics.todayUserCost))", "dollarsign", .orange)
                metric("总请求", NumberFormatters.compact(metrics.totalRequests) + " req", nil, .indigo)
                metric("总 Token", NumberFormatters.compact(metrics.totalTokens), "cpu.fill", .mint)
                metric("总额度", NumberFormatters.currency(metrics.totalCost), "wallet.pass", AppPalette.teal)
            }

            VStack(spacing: 5) {
                HStack {
                    Label("额度窗口", systemImage: "gauge.with.dots.needle.50percent").font(.subheadline.weight(.bold))
                    Spacer()
                    Text("更新 \(shortTime(quotaUpdatedAt))").font(.caption2).foregroundStyle(.secondary)
                }
                quotaRow(fiveHour)
                quotaRow(sevenDay)
                HStack(spacing: 5) {
                    cardButton("查询", "magnifyingglass", .primary, onQueryQuota)
                    cardButton("次数", nil, .primary, onCountQuota)
                    cardButton("重置", "arrow.counterclockwise", AppPalette.orange, onResetQuota)
                }
            }
            .padding(8)
            .background(AppPalette.blue.opacity(0.045), in: RoundedRectangle(cornerRadius: 11))

            HStack(spacing: 5) {
                cardButton("编辑", "pencil", .primary, onEdit)
                cardButton(disabled ? "启用" : "禁用", "power", .primary, onToggleEnabled)
                cardButton(account.schedulable == false ? "恢复" : "暂停", "pause.circle", .primary, onToggleScheduling)
                cardButton("删除", "trash", .red, onDelete)
            }
            HStack(spacing: 5) {
                cardButton("测试", "waveform.path.ecg", .white, onTest, fill: Color(red: 0.02, green: 0.08, blue: 0.13))
                cardButton(selectedModel ?? "选择模型", "cpu", .primary, onSelectModel, fill: .primary.opacity(0.045))
            }
        }
        .padding(8)
        .glassPanel(cornerRadius: 18)
    }

    private func metric(_ label: String, _ value: String, _ symbol: String?, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Group {
                if let symbol { Label(label, systemImage: symbol) }
                else { Text(label) }
            }
            .font(.caption2).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.75)
            Text(value).font(.system(.headline, design: .rounded, weight: .bold)).foregroundStyle(.primary)
                .lineLimit(2).minimumScaleFactor(0.68)
        }
        .padding(7)
        .frame(maxWidth: .infinity, minHeight: 62, alignment: .leading)
        .background(color.opacity(0.075), in: RoundedRectangle(cornerRadius: 11))
        .overlay(RoundedRectangle(cornerRadius: 11).stroke(color.opacity(0.18), lineWidth: 0.7))
    }

    private func quotaRow(_ window: QuotaWindow) -> some View {
        VStack(spacing: 2) {
            HStack { Text(window.label).font(.caption.weight(.bold)); Spacer(); Text("\(Int(window.percent.rounded()))% · \(window.remaining)").font(.caption2).foregroundStyle(.secondary) }
            ProgressView(value: min(max(window.percent / 100, 0), 1)).tint(window.percent >= 90 ? .red : AppPalette.teal)
        }
    }

    private func cardButton(_ title: String, _ symbol: String?, _ color: Color, _ action: @escaping () -> Void, fill: Color = .primary.opacity(0.035)) -> some View {
        Button(action: action) {
            Group {
                if let symbol { Label(title, systemImage: symbol) }
                else { Text(title) }
            }
            .font(.caption.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.7)
            .frame(maxWidth: .infinity, minHeight: 30)
        }
            .buttonStyle(.plain).foregroundStyle(color).background(fill, in: Capsule())
    }

    private var quotaUpdatedAt: String? { findString(in: quota, matching: ["updated_at", "updatedAt", "queried_at", "queriedAt"]) ?? account.updatedAt }

    private func quotaWindow(label: String, token: String) -> QuotaWindow {
        let percent = findNumber(in: quota, keyContains: [token, "percent"])
            ?? findNumber(in: quota, keyContains: [token, "usage"])
            ?? 0
        let remaining = findString(in: quota, matching: ["\(token)_remaining", "remaining_\(token)", "\(token)_reset_at", "reset_at"])
            ?? (token == "5h" ? "剩余 5h" : "剩余 --")
        return QuotaWindow(label: label, percent: percent <= 1 ? percent * 100 : percent, remaining: remaining)
    }

    private func findNumber(in value: JSONValue?, keyContains tokens: [String]) -> Double? {
        guard let value else { return nil }
        if let object = value.objectValue {
            for (key, child) in object where tokens.allSatisfy({ key.lowercased().contains($0.lowercased()) }) { if let number = child.doubleValue { return number } }
            for child in object.values { if let number = findNumber(in: child, keyContains: tokens) { return number } }
        }
        if let array = value.arrayValue { for child in array { if let number = findNumber(in: child, keyContains: tokens) { return number } } }
        return nil
    }

    private func findString(in value: JSONValue?, matching keys: [String]) -> String? {
        guard let value else { return nil }
        if let object = value.objectValue {
            for key in keys { if let text = object[key]?.stringValue, !text.isEmpty { return text } }
            for child in object.values { if let text = findString(in: child, matching: keys) { return text } }
        }
        return nil
    }

    private func shortTime(_ value: String?) -> String {
        guard let value, !value.isEmpty else { return "--" }
        return value.replacingOccurrences(of: "T", with: " ").prefix(16).description
    }
}

private struct QuotaWindow { let label: String; let percent: Double; let remaining: String }

private struct AccountModelPickerView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    let account: AdminAccount
    let selected: String?
    let onSelect: (String) -> Void
    @State private var models: [AccountModel] = []
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            List {
                if let errorMessage { Text(errorMessage).foregroundStyle(.red) }
                ForEach(models) { model in
                    let name = model.modelID ?? model.model ?? model.name ?? model.displayName ?? model.id
                    Button { onSelect(name) } label: { HStack { Text(model.displayName ?? name); Spacer(); if selected == name { Image(systemName: "checkmark").foregroundStyle(AppPalette.teal) } } }
                }
            }
            .navigationTitle("选择测试模型")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } } }
            .task { guard let service = try? store.adminService() else { return }; do { models = try await service.accountModels(account.id) } catch { errorMessage = error.localizedDescription } }
        }
    }
}

struct AccountDetailView: View {
    @EnvironmentObject private var store: AppStore
    @State private var account: AdminAccount
    @State private var today: AccountTodayStats?
    @State private var stats: UsageSummary?
    @State private var trend: [TrendPoint] = []
    @State private var models: [AccountModel] = []
    @State private var usage: [OpsRecord] = []
    @State private var range: TimeRange = .week
    @State private var isLoading = true
    @State private var isWorking = false
    @State private var message: String?
    @State private var showsEdit = false
    @State private var showsOAuth = false

    init(initialAccount: AdminAccount) { _account = State(initialValue: initialAccount) }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                header
                Picker("范围", selection: $range) { ForEach(TimeRange.allCases) { Text($0.label).tag($0) } }.pickerStyle(.segmented)
                Grid(horizontalSpacing: 9, verticalSpacing: 9) {
                    GridRow { MetricTile(label: "今日请求", value: NumberFormatters.compact(today?.requests), symbol: "arrow.up.arrow.down", tint: AppPalette.blue); MetricTile(label: "今日 Token", value: NumberFormatters.compact(today?.tokens), symbol: "cpu", tint: AppPalette.teal) }
                    GridRow { MetricTile(label: "今日成本", value: NumberFormatters.currency(today?.cost), symbol: "dollarsign.circle", tint: AppPalette.orange); MetricTile(label: "范围成本", value: NumberFormatters.currency(stats?.totalAccountCost ?? stats?.totalActualCost ?? stats?.totalCost), symbol: "calendar", tint: AppPalette.purple) }
                }
                actionPanel
                trendPanel
                settingsPanel
                NavigationLink { AccountAdvancedView(account: account) } label: { HStack { Label("网页高级功能", systemImage: "wrench.and.screwdriver"); Spacer(); Text("计费探测、定时测试与平台用量").font(.caption).foregroundStyle(.secondary); Image(systemName: "chevron.right").font(.caption) }.padding(14).glassPanel(cornerRadius: 16, interactive: true) }.buttonStyle(.plain)
                modelsPanel
                usagePanel
                if let message { Text(message).font(.footnote).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading).padding(12).glassPanel(cornerRadius: 14) }
            }.padding(16)
        }
        .navigationTitle(account.name).navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .primaryAction) { Menu { Button("编辑账号") { showsEdit = true }; if account.type == "oauth" || account.type == "setup-token" { Button("应用 OAuth 凭证") { showsOAuth = true } } } label: { Image(systemName: "ellipsis.circle") } } }
        .sheet(isPresented: $showsEdit, onDismiss: { Task { await load() } }) { AccountEditorView(account: account) }
        .sheet(isPresented: $showsOAuth, onDismiss: { Task { await load() } }) { OAuthCredentialsView(account: account) }
        .overlay { if isLoading || isWorking { ProgressView().padding(20).glassPanel(cornerRadius: 14) } }
        .refreshable { await load() }.appPage().task(id: range) { await load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 11) {
            HStack { VStack(alignment: .leading, spacing: 4) { Text(account.name).font(.title3.bold()); Text("\(account.platform) · \(account.type) · ID \(account.id)").font(.caption).foregroundStyle(.secondary) }; Spacer(); let style = StatusStyle.account(account); StatusPill(text: style.0, color: style.1) }
            if let error = account.errorMessage ?? account.error, !error.isEmpty { Label(error, systemImage: "exclamationmark.triangle.fill").font(.footnote).foregroundStyle(.red) }
            if let notes = account.notes, !notes.isEmpty { Text(notes).font(.footnote).foregroundStyle(.secondary) }
        }.padding(16).glassPanel()
    }

    private var actionPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("账号操作").font(.headline)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 92), spacing: 8)], spacing: 8) {
                action("测试", "checkmark.circle", .blue, .test(model: models.first?.id, prompt: "")); action("刷新", "arrow.clockwise", .blue, .refresh)
                action(account.schedulable == false ? "恢复调度" : "暂停调度", "pause.circle", .teal, .schedulable(account.schedulable == false))
                action("清除错误", "xmark.circle", .orange, .clearError); action("清除限流", "gauge.open.with.lines.needle.33percent", .purple, .clearRateLimit)
                action("清临时暂停", "timer", .orange, .clearTemporaryPause); action("恢复状态", "cross.circle", .green, .recover)
                action("同步模型", "arrow.triangle.2.circlepath", .blue, .syncModels); action("切换隐私", "hand.raised", .teal, .togglePrivacy)
                action("恢复代理", "network", .purple, .revertProxy); action("创建 Shadow", "square.on.square", .blue, .createShadow); action("重置额度", "arrow.counterclockwise", .red, .resetQuota)
            }
        }.padding(16).glassPanel()
    }

    private func action(_ title: String, _ symbol: String, _ color: Color, _ request: AccountActionRequest) -> some View {
        ActionGridButton(title: title, symbol: symbol, tint: color, destructive: title == "重置额度") { Task { await run(request, title: title) } }
    }

    private var trendPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Token 趋势").font(.headline)
            if trend.isEmpty { Text("暂无趋势数据").font(.footnote).foregroundStyle(.secondary).frame(maxWidth: .infinity, minHeight: 130) }
            else { Chart(trend) { LineMark(x: .value("时间", $0.date), y: .value("Token", $0.totalTokens ?? 0)).foregroundStyle(AppPalette.orange).interpolationMethod(.catmullRom) }.chartYAxis(.hidden).frame(height: 170) }
        }.padding(16).glassPanel()
    }

    private var settingsPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("配置").font(.headline)
            LabeledValueRow(label: "并发", value: "\(account.currentConcurrency ?? 0) / \(account.concurrency ?? 0)")
            LabeledValueRow(label: "优先级", value: "\(account.priority ?? 0)")
            LabeledValueRow(label: "负载系数", value: String(format: "%.2f", account.loadFactor ?? 0))
            LabeledValueRow(label: "费率倍率", value: String(format: "%.2fx", account.rateMultiplier ?? 1))
            LabeledValueRow(label: "隐私模式", value: account.privacyMode ?? (account.privacy == true ? "开启" : "默认"))
            LabeledValueRow(label: "分组", value: account.groups?.map(\.name).joined(separator: ", ") ?? account.groupName ?? "--")
            LabeledValueRow(label: "到期", value: account.expiresAt ?? "--")
            LabeledValueRow(label: "最近使用", value: account.lastUsedAt ?? "--")
        }.padding(16).glassPanel()
    }

    private var modelsPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("模型（\(models.count)）").font(.headline)
            if models.isEmpty { Text("暂无模型").font(.footnote).foregroundStyle(.secondary) }
            ForEach(models.prefix(20)) { model in HStack { Image(systemName: model.enabled == false ? "circle" : "checkmark.circle.fill").foregroundStyle(model.enabled == false ? Color.secondary : Color.green); Text(model.displayName ?? model.model ?? model.name ?? model.id).font(.subheadline); Spacer(); Text(model.source ?? "").font(.caption2).foregroundStyle(.secondary) } }
        }.padding(16).glassPanel()
    }

    private var usagePanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("最近使用（\(usage.count)）").font(.headline)
            if usage.isEmpty { Text("暂无使用记录").font(.footnote).foregroundStyle(.secondary) }
            ForEach(usage.prefix(20)) { row in VStack(alignment: .leading, spacing: 3) { Text(row.model ?? row.path ?? "请求").font(.subheadline.weight(.semibold)); HStack { Text(row.userEmail ?? ""); Spacer(); Text(row.createdAt ?? "") }.font(.caption2).foregroundStyle(.secondary) }; Divider() }
        }.padding(16).glassPanel()
    }

    private func load() async {
        guard let service = try? store.adminService() else { return }; isLoading = true
        let dates = range.startEnd
        do {
            async let nextAccount = service.account(account.id); async let nextToday = service.accountToday(account.id); async let nextStats = service.accountStats(account.id, days: range.rawValue)
            async let nextSnapshot = service.dashboardSnapshot(start: dates.0, end: dates.1, granularity: range.granularity, filters: ["account_id": String(account.id), "include_stats": "false", "include_trend": "true"])
            async let nextModels = service.accountModels(account.id); async let nextUsage = service.accountUsage(account.id)
            let result = try await (nextAccount, nextToday, nextStats, nextSnapshot, nextModels, nextUsage)
            account = result.0; today = result.1; stats = result.2; trend = result.3.trend ?? []; models = result.4; usage = result.5.items; message = nil
        } catch { message = error.localizedDescription }
        isLoading = false
    }

    private func run(_ request: AccountActionRequest, title: String) async {
        guard let service = try? store.adminService() else { return }; isWorking = true
        do { _ = try await service.accountAction(account.id, action: request); message = "\(title)已完成"; account = try await service.account(account.id) } catch { message = error.localizedDescription }
        isWorking = false
    }
}

struct AccountEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    let account: AdminAccount
    @State private var name: String; @State private var notes: String; @State private var concurrency: String; @State private var loadFactor: String
    @State private var priority: String; @State private var multiplier: String; @State private var proxyID: String; @State private var groupIDs: String
    @State private var expiresAt: String; @State private var privacyMode: String; @State private var status: String; @State private var schedulable: Bool
    @State private var advancedJSON = ""
    @State private var errorMessage: String?

    init(account: AdminAccount) {
        self.account = account; _name = State(initialValue: account.name); _notes = State(initialValue: account.notes ?? "")
        _concurrency = State(initialValue: account.concurrency.map { String($0) } ?? ""); _loadFactor = State(initialValue: account.loadFactor.map { String($0) } ?? "")
        _priority = State(initialValue: account.priority.map { String($0) } ?? ""); _multiplier = State(initialValue: account.rateMultiplier.map { String($0) } ?? "")
        _proxyID = State(initialValue: account.proxyID.map { String($0) } ?? ""); _groupIDs = State(initialValue: account.groupIDs?.map { String($0) }.joined(separator: ",") ?? account.groups?.map { String($0.id) }.joined(separator: ",") ?? "")
        _expiresAt = State(initialValue: account.expiresAt ?? ""); _privacyMode = State(initialValue: account.privacyMode ?? "")
        _status = State(initialValue: account.status ?? "active"); _schedulable = State(initialValue: account.schedulable ?? true)
    }

    var body: some View {
        NavigationStack { Form {
            Section("基本信息") { TextField("名称", text: $name); TextField("备注", text: $notes, axis: .vertical); Picker("状态", selection: $status) { Text("启用").tag("active"); Text("禁用").tag("disabled") }; Toggle("允许调度", isOn: $schedulable) }
            Section("调度") { TextField("并发", text: $concurrency).keyboardType(.numberPad); TextField("负载系数", text: $loadFactor).keyboardType(.decimalPad); TextField("优先级", text: $priority).keyboardType(.numberPad); TextField("费率倍率", text: $multiplier).keyboardType(.decimalPad) }
            Section("关联") { TextField("代理 ID（空=不修改，null=清除）", text: $proxyID); TextField("分组 ID，逗号分隔", text: $groupIDs); TextField("隐私模式", text: $privacyMode); TextField("到期时间 ISO8601", text: $expiresAt) }
            Section("网页高级字段 JSON") { TextEditor(text: $advancedJSON).frame(minHeight: 100).font(.caption.monospaced()); Text("可填写网页端新增字段，将覆盖上方同名值。").font(.caption).foregroundStyle(.secondary) }
            if let errorMessage { Section { Text(errorMessage).foregroundStyle(.red) } }
        }.navigationTitle("编辑账号").navigationBarTitleDisplayMode(.inline).toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }; ToolbarItem(placement: .confirmationAction) { Button("保存") { save() } } } }
    }

    private func save() {
        guard let service = try? store.adminService() else { return }
        Task { do {
            var body: [String: JSONValue] = ["name": .string(name), "notes": .string(notes), "status": .string(status), "schedulable": .bool(schedulable)]
            if let value = try FormParsing.integer(concurrency) { body["concurrency"] = .number(Double(value)) }; if let value = try FormParsing.number(loadFactor) { body["load_factor"] = .number(value) }
            if let value = try FormParsing.integer(priority) { body["priority"] = .number(Double(value)) }; if let value = try FormParsing.number(multiplier) { body["rate_multiplier"] = .number(value) }
            if proxyID.lowercased() == "null" { body["proxy_id"] = .null } else if let value = try FormParsing.integer(proxyID) { body["proxy_id"] = .number(Double(value)) }
            if let values = try FormParsing.integerList(groupIDs) { body["group_ids"] = .array(values.map { .number(Double($0)) }) }
            if let value = privacyMode.nilIfBlank { body["privacy_mode"] = .string(value) }; body["expires_at"] = expiresAt.nilIfBlank.map { JSONValue.string($0) } ?? .null
            body.merge(try FormParsing.jsonObject(advancedJSON)) { _, new in new }
            _ = try await service.updateAccount(account.id, body: body); dismiss()
        } catch { errorMessage = error.localizedDescription } }
    }
}

private struct OAuthCredentialsView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    let account: AdminAccount
    @State private var accessToken = ""; @State private var refreshToken = ""; @State private var expiresAt = ""; @State private var clientID = ""; @State private var accountID = ""; @State private var email = ""; @State private var errorMessage: String?
    var body: some View { NavigationStack { Form { Section("OAuth 凭证") { SecureField("Access Token", text: $accessToken); SecureField("Refresh Token", text: $refreshToken); TextField("Expires At", text: $expiresAt); TextField("Client ID", text: $clientID); TextField("Account ID", text: $accountID); TextField("Email", text: $email) }; if let errorMessage { Section { Text(errorMessage).foregroundStyle(.red) } } }.navigationTitle("应用 OAuth 凭证").toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }; ToolbarItem(placement: .confirmationAction) { Button("应用") { apply() }.disabled(accessToken.isEmpty) } } } }
    private func apply() { guard let service = try? store.adminService() else { return }; Task { do { var body: [String: JSONValue] = ["access_token": .string(accessToken)]; if let value = refreshToken.nilIfBlank { body["refresh_token"] = .string(value) }; if let value = expiresAt.nilIfBlank { body["expires_at"] = .string(value) }; if let value = clientID.nilIfBlank { body["client_id"] = .string(value) }; if let value = accountID.nilIfBlank { body["account_id"] = .string(value) }; if let value = email.nilIfBlank { body["email"] = .string(value) }; _ = try await service.applyOAuthCredentials(account.id, body: body); dismiss() } catch { errorMessage = error.localizedDescription } } }
}

private struct AccountQuotaView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    let account: AdminAccount
    @State private var value: JSONValue?; @State private var errorMessage: String?; @State private var isWorking = false
    var body: some View { NavigationStack { ScrollView { VStack(spacing: 14) { if isWorking { LoadingView() }; if let value { Text(value.displayText).font(.body.monospaced()).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading).padding(16).glassPanel() }; if let errorMessage { InlineErrorView(message: errorMessage) }; if account.platform.lowercased() != "grok" { Button("重置额度", role: .destructive) { Task { await reset() } }.buttonStyle(.borderedProminent) } }.padding(16) }.navigationTitle("账号额度").toolbar { ToolbarItem(placement: .confirmationAction) { Button("完成") { dismiss() } } }.appPage().task { await load() } } }
    private func load() async { guard let service = try? store.adminService() else { return }; isWorking = true; do { value = try await service.quota(account); errorMessage = nil } catch { errorMessage = error.localizedDescription }; isWorking = false }
    private func reset() async { guard let service = try? store.adminService() else { return }; isWorking = true; do { if account.platform.lowercased() == "openai" { value = try await service.resetOpenAIQuota(account.id) } else { _ = try await service.accountAction(account.id, action: .resetQuota); await load() } } catch { errorMessage = error.localizedDescription }; isWorking = false }
}

struct AccountCreationView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @EnvironmentObject private var store: AppStore
    @State private var name = ""; @State private var notes = ""; @State private var platform = "openai"; @State private var type = "apikey"
    @State private var baseURL = "https://api.openai.com"; @State private var apiKey = ""; @State private var tier = "aistudio_free"
    @State private var oauthMethod = "authorization"; @State private var accessToken = ""; @State private var refreshToken = ""; @State private var clientID = ""; @State private var oauthEmail = ""; @State private var oauthAccountID = ""; @State private var oauthExpiresAt = ""; @State private var oauthProjectID = ""
    @State private var authURL = ""; @State private var authSessionID = ""; @State private var authState = ""; @State private var authCode = ""; @State private var sessionKey = ""; @State private var codexContent = ""; @State private var codexPAT = ""
    @State private var serviceAccountJSON = ""; @State private var projectID = ""; @State private var clientEmail = ""; @State private var location = "us-central1"
    @State private var region = "us-east-1"; @State private var accessKeyID = ""; @State private var secretAccessKey = ""; @State private var sessionToken = ""
    @State private var proxyID = ""; @State private var concurrency = ""; @State private var loadFactor = ""; @State private var priority = ""; @State private var multiplier = ""; @State private var selectedGroups: Set<Int> = []; @State private var expiresAt = ""; @State private var autoPause = true; @State private var confirmMixedRisk = false
    @State private var quotaLimit = ""; @State private var dailyLimit = ""; @State private var weeklyLimit = ""; @State private var poolMode = false; @State private var poolRetries = ""; @State private var poolCodes = "401,403,429"; @State private var customCodesEnabled = false; @State private var customCodes = ""
    @State private var openAIPassthrough = false; @State private var longContextBilling = false; @State private var codexOnly = false; @State private var appServer = false; @State private var websocketMode = "none"; @State private var compactMode = "auto"; @State private var responsesMode = "auto"; @State private var anthropicPassthrough = false
    @State private var credentialOverridesJSON = ""; @State private var extraOverridesJSON = ""
    @State private var groups: [AdminGroup] = []; @State private var showsFileImporter = false; @State private var isWorking = false; @State private var errorMessage: String?

    private let platforms = ["openai", "anthropic", "gemini", "antigravity", "grok", "kimi", "zhipu", "deepseek", "minimax", "opencode_go", "typesafe"]
    private var types: [String] { switch platform { case "openai", "grok": ["apikey", "oauth"]; case "anthropic": ["apikey", "oauth", "setup-token", "service_account", "bedrock"]; case "gemini": ["apikey", "oauth", "service_account"]; case "antigravity": ["oauth", "upstream"]; default: ["apikey", "oauth", "upstream"] } }
    private var oauthMethods: [String] { if platform == "anthropic" { ["authorization", "session-key", "manual"] } else if platform == "openai" { ["authorization", "refresh-token", "mobile-refresh-token", "codex-session", "agent-identity", "codex-pat", "manual"] } else { ["manual"] } }

    var body: some View {
        NavigationStack { Form {
            Section("账号信息") { TextField("账号名称", text: $name); TextField("备注", text: $notes, axis: .vertical); Picker("平台", selection: $platform) { ForEach(platforms, id: \.self) { Text($0.capitalized).tag($0) } }.onChange(of: platform) { _, value in selectPlatform(value) }; Picker("类型", selection: $type) { ForEach(types, id: \.self) { Text($0).tag($0) } } }
            credentialsSection
            Section("关联与调度") { TextField("代理 ID", text: $proxyID).keyboardType(.numberPad); TextField("并发", text: $concurrency).keyboardType(.numberPad); TextField("负载系数", text: $loadFactor).keyboardType(.decimalPad); TextField("优先级", text: $priority).keyboardType(.numberPad); TextField("费率倍率", text: $multiplier).keyboardType(.decimalPad); TextField("到期时间 ISO8601", text: $expiresAt); Toggle("到期自动暂停", isOn: $autoPause); Toggle("确认混合渠道风险", isOn: $confirmMixedRisk) }
            if !groups.isEmpty { Section("分组") { ForEach(groups) { group in Toggle("\(group.name) · \(group.platform)", isOn: Binding(get: { selectedGroups.contains(group.id) }, set: { enabled in if enabled { selectedGroups.insert(group.id) } else { selectedGroups.remove(group.id) } })) } } }
            Section("配额与重试") { TextField("总额度", text: $quotaLimit).keyboardType(.decimalPad); TextField("每日额度", text: $dailyLimit).keyboardType(.decimalPad); TextField("每周额度", text: $weeklyLimit).keyboardType(.decimalPad); Toggle("池模式", isOn: $poolMode); if poolMode { TextField("重试次数", text: $poolRetries).keyboardType(.numberPad); TextField("重试状态码", text: $poolCodes) }; Toggle("自定义错误码", isOn: $customCodesEnabled); if customCodesEnabled { TextField("错误码，逗号分隔", text: $customCodes) } }
            platformOptions
            Section("网页高级字段") { Text("凭证覆盖 JSON").font(.caption).foregroundStyle(.secondary); TextEditor(text: $credentialOverridesJSON).frame(minHeight: 90).font(.caption.monospaced()); Text("Extra 覆盖 JSON").font(.caption).foregroundStyle(.secondary); TextEditor(text: $extraOverridesJSON).frame(minHeight: 90).font(.caption.monospaced()) }
            if let errorMessage { Section { Text(errorMessage).foregroundStyle(.red) } }
        }.navigationTitle("添加账号").navigationBarTitleDisplayMode(.inline).toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }; ToolbarItem(placement: .confirmationAction) { Button(isWorking ? "处理中" : "创建") { create() }.disabled(isWorking || name.isEmpty) } }
        .fileImporter(isPresented: $showsFileImporter, allowedContentTypes: [.json, .plainText]) { result in readCredentialFile(result) }.task(id: platform) { await loadGroups() } }
    }

    @ViewBuilder private var credentialsSection: some View {
        if type == "apikey" || type == "upstream" { Section("API 凭证") { TextField("Base URL", text: $baseURL).textInputAutocapitalization(.never); SecureField("API Key", text: $apiKey); if platform == "gemini" { Picker("Tier", selection: $tier) { Text("AI Studio Free").tag("aistudio_free"); Text("Google One Free").tag("google_one_free"); Text("GCP Standard").tag("gcp_standard") } } } }
        else if type == "oauth" || type == "setup-token" { Section("OAuth") { Picker("输入方式", selection: $oauthMethod) { ForEach(oauthMethods, id: \.self) { Text($0).tag($0) } }; oauthFields } }
        else if type == "service_account" { Section("Service Account") { Button("选择 JSON 文件") { showsFileImporter = true }; TextEditor(text: $serviceAccountJSON).frame(minHeight: 100).font(.caption.monospaced()); TextField("Project ID", text: $projectID); TextField("Client Email", text: $clientEmail); TextField("Location", text: $location) } }
        else { Section("AWS Bedrock") { TextField("Region", text: $region); SecureField("Access Key ID", text: $accessKeyID); SecureField("Secret Access Key", text: $secretAccessKey); SecureField("Session Token（可选）", text: $sessionToken) } }
    }

    @ViewBuilder private var oauthFields: some View {
        switch oauthMethod {
        case "authorization":
            Button(authURL.isEmpty ? "生成并打开授权链接" : "重新生成授权链接") { Task { await generateAuthorization() } }
            if !authURL.isEmpty { Text(authURL).font(.caption2).foregroundStyle(.secondary).textSelection(.enabled) }
            TextField("回调 URL 或授权码", text: $authCode, axis: .vertical)
        case "session-key": SecureField("Session Key", text: $sessionKey)
        case "refresh-token", "mobile-refresh-token": SecureField("Refresh Token", text: $refreshToken); TextField("Client ID（可选）", text: $clientID)
        case "codex-session", "agent-identity": Button("选择 auth.json / 文本文件") { showsFileImporter = true }; TextEditor(text: $codexContent).frame(minHeight: 100).font(.caption.monospaced())
        case "codex-pat": SecureField("Codex Personal Access Token", text: $codexPAT)
        default: SecureField("Access Token", text: $accessToken); SecureField("Refresh Token（可选）", text: $refreshToken); TextField("Client ID", text: $clientID); TextField("Email", text: $oauthEmail); TextField("Account ID", text: $oauthAccountID); TextField("Expires At", text: $oauthExpiresAt); if platform == "antigravity" { TextField("Project ID", text: $oauthProjectID) }
        }
    }

    @ViewBuilder private var platformOptions: some View {
        if platform == "openai" { Section("OpenAI 选项") { Toggle("Passthrough", isOn: $openAIPassthrough); Toggle("长上下文计费", isOn: $longContextBilling); Toggle("仅 Codex CLI", isOn: $codexOnly); if codexOnly { Toggle("允许 App Server", isOn: $appServer) }; Picker("WebSocket", selection: $websocketMode) { Text("关闭").tag("none"); Text("上下文池").tag("ctx_pool"); Text("透传").tag("passthrough") }; Picker("Compact", selection: $compactMode) { Text("自动").tag("auto"); Text("强制开启").tag("force_on"); Text("强制关闭").tag("force_off") }; Picker("Responses", selection: $responsesMode) { Text("自动").tag("auto"); Text("Responses").tag("force_responses"); Text("Chat Completions").tag("force_chat_completions") } } }
        if platform == "anthropic" && type == "apikey" { Section("Anthropic 选项") { Toggle("Passthrough", isOn: $anthropicPassthrough) } }
    }

    private func selectPlatform(_ value: String) { let defaults = ["openai": "https://api.openai.com", "anthropic": "https://api.anthropic.com", "gemini": "https://generativelanguage.googleapis.com", "antigravity": "https://cloudcode-pa.googleapis.com", "grok": "https://api.x.ai"]; baseURL = defaults[value] ?? ""; if !types.contains(type) { type = types.first ?? "apikey" }; oauthMethod = (value == "openai" || value == "anthropic") ? "authorization" : "manual"; selectedGroups = [] }

    private func loadGroups() async { guard let service = try? store.adminService() else { return }; groups = (try? await service.allGroups(platform: platform)) ?? [] }

    private func generateAuthorization() async { guard let service = try? store.adminService() else { return }; isWorking = true; do { let value = try await service.generateAuthURL(platform: platform, type: type, proxyID: try FormParsing.integer(proxyID)); let object = value.objectValue ?? [:]; authURL = object.text("auth_url", "authUrl") ?? ""; authSessionID = object.text("session_id", "sessionId") ?? ""; authState = URLComponents(string: authURL)?.queryItems?.first(where: { $0.name == "state" })?.value ?? ""; if let url = URL(string: authURL) { openURL(url) } } catch { errorMessage = error.localizedDescription }; isWorking = false }

    private func create() { guard let service = try? store.adminService() else { return }; isWorking = true; errorMessage = nil; Task { do { let common = try commonBody(); let extra = try platformExtra(); if (type == "oauth" || type == "setup-token") && platform == "openai" && ["codex-session", "agent-identity"].contains(oauthMethod) { var body = common; body["content"] = .string(codexContent); body["update_existing"] = .bool(true); if !extra.isEmpty { body["extra"] = .object(extra) }; _ = try await service.importCodexSession(body); dismiss(); return }; if (type == "oauth" || type == "setup-token") && platform == "openai" && oauthMethod == "codex-pat" { var body = common; body["access_token"] = .string(codexPAT); if !extra.isEmpty { body["extra"] = .object(extra) }; _ = try await service.createFromCodexPAT(body); dismiss(); return }; var credentials = try await credentials(service: service); credentials.merge(try FormParsing.jsonObject(credentialOverridesJSON)) { _, new in new }; var body = common; body["platform"] = .string(platform); body["type"] = .string(type); body["credentials"] = .object(credentials); if !extra.isEmpty { body["extra"] = .object(extra) }; _ = try await service.createAccount(body); dismiss() } catch { errorMessage = error.localizedDescription }; isWorking = false } }

    private func commonBody() throws -> [String: JSONValue] { var body: [String: JSONValue] = ["name": .string(name), "auto_pause_on_expired": .bool(autoPause)]; if let value = notes.nilIfBlank { body["notes"] = .string(value) }; if let value = try FormParsing.integer(proxyID) { body["proxy_id"] = .number(Double(value)) } else { body["proxy_id"] = .null }; if let value = try FormParsing.integer(concurrency) { body["concurrency"] = .number(Double(value)) }; if let value = try FormParsing.number(loadFactor) { body["load_factor"] = .number(value) }; if let value = try FormParsing.integer(priority) { body["priority"] = .number(Double(value)) }; if let value = try FormParsing.number(multiplier) { body["rate_multiplier"] = .number(value) }; if !selectedGroups.isEmpty { body["group_ids"] = .array(selectedGroups.sorted().map { .number(Double($0)) }) }; body["expires_at"] = expiresAt.nilIfBlank.map { JSONValue.string($0) } ?? .null; if confirmMixedRisk { body["confirm_mixed_channel_risk"] = .bool(true) }; return body }

    private func credentials(service: AdminService) async throws -> [String: JSONValue] {
        if type == "apikey" || type == "upstream" { var result: [String: JSONValue] = ["base_url": .string(baseURL), "api_key": .string(apiKey)]; if platform == "gemini" { result["tier_id"] = .string(tier) }; if let v = try FormParsing.number(quotaLimit) { result["quota_limit"] = .number(v) }; if let v = try FormParsing.number(dailyLimit) { result["quota_daily_limit"] = .number(v) }; if let v = try FormParsing.number(weeklyLimit) { result["quota_weekly_limit"] = .number(v) }; if poolMode { result["pool_mode"] = .bool(true); if let v = try FormParsing.integer(poolRetries) { result["pool_mode_retry_count"] = .number(Double(v)) }; if let list = try FormParsing.integerList(poolCodes) { result["pool_mode_retry_status_codes"] = .array(list.map { .number(Double($0)) }) } }; if customCodesEnabled { result["custom_error_codes_enabled"] = .bool(true); if let list = try FormParsing.integerList(customCodes) { result["custom_error_codes"] = .array(list.map { .number(Double($0)) }) } }; result.merge(try FormParsing.jsonObject(credentialOverridesJSON)) { _, new in new }; return result }
        if type == "service_account" { return ["service_account_json": .string(serviceAccountJSON), "project_id": .string(projectID), "client_email": .string(clientEmail), "location": .string(location), "tier_id": .string("vertex")] }
        if type == "bedrock" { var result: [String: JSONValue] = ["region": .string(region), "access_key_id": .string(accessKeyID), "secret_access_key": .string(secretAccessKey)]; if let token = sessionToken.nilIfBlank { result["session_token"] = .string(token) }; return result }
        if oauthMethod == "authorization" { let parsed = parseCallback(authCode); var body: [String: JSONValue] = ["session_id": .string(authSessionID), "code": .string(parsed.code)]; if platform == "openai" { body["state"] = .string(parsed.state.nilIfBlank ?? authState) }; return try await service.exchangeAuth(platform: platform, type: type, body: body).objectValue ?? [:] }
        if oauthMethod == "session-key" { let body: [String: JSONValue] = ["session_id": .string(""), "code": .string(sessionKey)]; return try await service.exchangeAuth(platform: platform, type: type, body: body, sessionKey: true).objectValue ?? [:] }
        if oauthMethod == "refresh-token" || oauthMethod == "mobile-refresh-token" { let mobileClient = "app_LlGpXReQgckcGGUo2JrYvtJK"; return try await service.refreshOpenAIToken(refreshToken, proxyID: try FormParsing.integer(proxyID), clientID: oauthMethod == "mobile-refresh-token" ? mobileClient : clientID.nilIfBlank).objectValue ?? [:] }
        var result: [String: JSONValue] = ["access_token": .string(accessToken)]; if let v = refreshToken.nilIfBlank { result["refresh_token"] = .string(v) }; if let v = clientID.nilIfBlank { result["client_id"] = .string(v) }; if let v = oauthEmail.nilIfBlank { result["email"] = .string(v) }; if let v = oauthAccountID.nilIfBlank { result["account_id"] = .string(v) }; if let v = oauthExpiresAt.nilIfBlank { result["expires_at"] = .string(v) }; if let v = oauthProjectID.nilIfBlank { result["project_id"] = .string(v) }; result.merge(try FormParsing.jsonObject(credentialOverridesJSON)) { _, new in new }; return result
    }

    private func platformExtra() throws -> [String: JSONValue] { var result: [String: JSONValue] = [:]; if platform == "openai" { let oauth = type == "oauth" || type == "setup-token"; result[oauth ? "openai_oauth_responses_websockets_v2_mode" : "openai_apikey_responses_websockets_v2_mode"] = .string(websocketMode); result[oauth ? "openai_oauth_responses_websockets_v2_enabled" : "openai_apikey_responses_websockets_v2_enabled"] = .bool(websocketMode != "none"); result["openai_long_context_billing_enabled"] = .bool(longContextBilling); if openAIPassthrough { result["openai_passthrough"] = .bool(true) }; if codexOnly { result["codex_cli_only"] = .bool(true); if appServer { result["codex_cli_only_allow_app_server"] = .bool(true) } }; if compactMode != "auto" { result["openai_compact_mode"] = .string(compactMode) }; if !oauth && responsesMode != "auto" { result["openai_responses_mode"] = .string(responsesMode) } }; if platform == "anthropic" && anthropicPassthrough { result["anthropic_passthrough"] = .bool(true) }; result.merge(try FormParsing.jsonObject(extraOverridesJSON)) { _, new in new }; return result }

    private func parseCallback(_ raw: String) -> (code: String, state: String) { guard let components = URLComponents(string: raw), raw.contains("code=") else { return (raw.trimmingCharacters(in: .whitespacesAndNewlines), authState) }; return (components.queryItems?.first { $0.name == "code" }?.value ?? raw, components.queryItems?.first { $0.name == "state" }?.value ?? authState) }

    private func readCredentialFile(_ result: Result<URL, Error>) { do { let url = try result.get(); let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }; let content = try String(contentsOf: url, encoding: .utf8); if type == "service_account" { serviceAccountJSON = content; if let object = try? FormParsing.jsonObject(content) { projectID = object.text("project_id", "projectId") ?? projectID; clientEmail = object.text("client_email", "clientEmail") ?? clientEmail } } else { codexContent = content } } catch { errorMessage = error.localizedDescription } }
}
