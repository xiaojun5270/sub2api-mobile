import Charts
import SwiftUI
import UIKit

struct APIKeysView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.openURL) private var openURL
    @State private var keys: [AdminAPIKey] = []
    @State private var searchText = ""
    @State private var groupFilter = "all"
    @State private var statusFilter = "all"
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var message: String?
    @State private var editingKey: AdminAPIKey?
    @State private var showsCreate = false
    @State private var usageKey: AdminAPIKey?
    @State private var deletingKey: AdminAPIKey?

    private var groups: [String] { ["all"] + Array(Set(keys.map { $0.groupName ?? $0.groupID.map { "#\($0)" } ?? "未分组" })).sorted() }
    private var filtered: [AdminAPIKey] {
        keys.filter { key in
            let group = key.groupName ?? key.groupID.map { "#\($0)" } ?? "未分组"
            let searchOK = searchText.isEmpty || "\(key.name ?? "") \(key.userEmail ?? "") \(key.customKey ?? key.key ?? "") \(group)".localizedCaseInsensitiveContains(searchText)
            let disabled = ["inactive", "disabled", "revoked"].contains((key.status ?? "active").lowercased())
            let statusOK = statusFilter == "all" || (statusFilter == "active" ? !disabled : disabled)
            return searchOK && statusOK && (groupFilter == "all" || group == groupFilter)
        }
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ScrollView(.horizontal) { HStack(spacing: 8) {
                    Menu { ForEach(groups, id: \.self) { group in Button(group == "all" ? "全部分组" : group) { groupFilter = group } } } label: { filterLabel(groupFilter == "all" ? "全部分组" : groupFilter, active: groupFilter != "all") }
                    Menu { Button("全部状态") { statusFilter = "all" }; Button("活跃") { statusFilter = "active" }; Button("禁用") { statusFilter = "disabled" } } label: { filterLabel(statusFilter == "all" ? "全部状态" : statusFilter == "active" ? "活跃" : "禁用", active: statusFilter != "all") }
                    Text("\(filtered.count) 个密钥").font(.caption).foregroundStyle(.secondary)
                } }.scrollIndicators(.hidden)
                if let message { Text(message).font(.footnote).foregroundStyle(.secondary).padding(12).frame(maxWidth: .infinity, alignment: .leading).glassPanel(cornerRadius: 14) }
                if isLoading && keys.isEmpty { LoadingView(label: "正在加载 API 密钥") }
                else if let errorMessage, keys.isEmpty { InlineErrorView(message: errorMessage) { Task { await load() } } }
                else if filtered.isEmpty { EmptyContentView(symbol: "key.slash", title: "暂无密钥", message: "当前筛选条件下没有 API 密钥。") }
                else {
                    ForEach(filtered) { key in
                        APIKeyCard(
                            key: key,
                            copy: { UIPasteboard.general.string = key.customKey ?? key.key; message = "密钥已复制" },
                            showUsage: { usageKey = key },
                            edit: { editingKey = key },
                            toggle: { Task { await toggle(key) } },
                            delete: { deletingKey = key }
                        )
                        .contextMenu { keyMenu(key) }
                    }
                }
            }.padding(16)
        }
        .searchable(text: $searchText, prompt: "名称、用户、密钥或分组")
        .refreshable { await load() }
        .navigationTitle("API 密钥")
        .toolbar { ToolbarItem(placement: .primaryAction) { Button { showsCreate = true } label: { Image(systemName: "plus") } } }
        .sheet(isPresented: $showsCreate, onDismiss: { Task { await load() } }) { APIKeyEditorView(key: nil) }
        .sheet(item: $editingKey, onDismiss: { Task { await load() } }) { APIKeyEditorView(key: $0) }
        .sheet(item: $usageKey) { APIKeyUsageView(key: $0) }
        .confirmationDialog("删除 API Key？", isPresented: Binding(get: { deletingKey != nil }, set: { if !$0 { deletingKey = nil } }), titleVisibility: .visible) { Button("删除", role: .destructive) { if let key = deletingKey { Task { await delete(key) } } } } message: { Text(deletingKey?.name ?? "") }
        .appPage().task(id: store.activeServerID) { await load() }
    }

    private func filterLabel(_ text: String, active: Bool) -> some View { HStack(spacing: 5) { Text(text); Image(systemName: "chevron.down").font(.caption2) }.font(.caption.weight(.semibold)).foregroundStyle(active ? Color.white : Color.primary).padding(.horizontal, 11).padding(.vertical, 8).background(active ? AppPalette.blue : Color.primary.opacity(0.06), in: Capsule()) }

    @ViewBuilder private func keyMenu(_ key: AdminAPIKey) -> some View {
        Button { UIPasteboard.general.string = key.customKey ?? key.key } label: { Label("复制密钥", systemImage: "doc.on.doc") }
        Button { usageKey = key } label: { Label("使用趋势", systemImage: "chart.xyaxis.line") }
        Button { editingKey = key } label: { Label("编辑", systemImage: "pencil") }
        Button { Task { await toggle(key) } } label: { Label(isDisabled(key) ? "启用" : "禁用", systemImage: "power") }
        Button { importCCSwitch(key) } label: { Label("导入 CCS", systemImage: "square.and.arrow.down") }
        Divider(); Button(role: .destructive) { deletingKey = key } label: { Label("删除", systemImage: "trash") }
    }

    private func load() async { guard let service = try? store.adminService() else { return }; isLoading = true; do { keys = try await service.apiKeys(search: searchText).items.filter { $0.deletedAt == nil && !($0.key ?? "").hasPrefix("__deleted") }; errorMessage = nil } catch { errorMessage = error.localizedDescription }; isLoading = false }
    private func isDisabled(_ key: AdminAPIKey) -> Bool { ["inactive", "disabled", "revoked"].contains((key.status ?? "active").lowercased()) }
    private func toggle(_ key: AdminAPIKey) async { guard let service = try? store.adminService() else { return }; do { _ = try await service.updateAPIKey(key, body: ["status": .string(isDisabled(key) ? "active" : "inactive")]); await load() } catch { message = error.localizedDescription } }
    private func delete(_ key: AdminAPIKey) async { guard let service = try? store.adminService() else { return }; deletingKey = nil; do { try await service.deleteAPIKey(key); await load() } catch { message = error.localizedDescription } }

    private func importCCSwitch(_ key: AdminAPIKey) {
        guard let rawKey = key.customKey ?? key.key, !rawKey.isEmpty, let server = store.activeServer else { return }
        let base = server.baseURL.replacingOccurrences(of: "/api/v1", with: "").replacingOccurrences(of: "/api", with: "")
        let platform = key.groupName?.lowercased() ?? "anthropic"
        let app = platform.contains("gemini") ? "gemini" : platform.contains("openai") ? "codex" : "claude"
        var components = URLComponents(); components.scheme = "ccswitch"; components.host = "v1"; components.path = "/import"
        components.queryItems = [URLQueryItem(name: "resource", value: "provider"), URLQueryItem(name: "app", value: app), URLQueryItem(name: "name", value: "Sub2API"), URLQueryItem(name: "homepage", value: base), URLQueryItem(name: "endpoint", value: base), URLQueryItem(name: "apiKey", value: rawKey), URLQueryItem(name: "configFormat", value: "json")]
        if let url = components.url { openURL(url) { accepted in if !accepted { UIPasteboard.general.string = url.absoluteString; message = "未找到 CCS，导入链接已复制" } } }
    }
}

private struct APIKeyCard: View {
    let key: AdminAPIKey
    let copy: () -> Void
    let showUsage: () -> Void
    let edit: () -> Void
    let toggle: () -> Void
    let delete: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack { Image(systemName: "key.fill").foregroundStyle(AppPalette.blue); VStack(alignment: .leading, spacing: 3) { Text(key.name ?? "未命名密钥").font(.subheadline.bold()); Text(key.userEmail ?? "用户 #\(key.userID ?? 0)").font(.caption).foregroundStyle(.secondary) }; Spacer(); let style = StatusStyle.generic(key.status); StatusPill(text: style.0, color: style.1) }
            Button(action: copy) { HStack { Text(masked).font(.caption.monospaced()).lineLimit(1); Spacer(); Image(systemName: "doc.on.doc") } }.buttonStyle(.plain).foregroundStyle(.secondary)
            HStack(spacing: 12) { Label(key.groupName ?? key.groupID.map { "#\($0)" } ?? "未分组", systemImage: "folder"); Label(key.expiresAt ?? "永久", systemImage: "calendar"); Spacer() }.font(.caption2).foregroundStyle(.secondary)
            if let quota = key.quota, quota > 0 { ProgressView(value: min((key.quotaUsed ?? 0) / quota, 1)).tint(AppPalette.blue); Text("额度 \(NumberFormatters.compact(key.quotaUsed)) / \(NumberFormatters.compact(quota))").font(.caption2).foregroundStyle(.secondary) }
            HStack { Text("5H \(NumberFormatters.compact(key.usage5h))"); Text("1D \(NumberFormatters.compact(key.usage1d))"); Text("7D \(NumberFormatters.compact(key.usage7d))"); Spacer(); Text(key.lastUsedAt ?? "未使用") }.font(.caption2).foregroundStyle(.secondary)
            Divider()
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                actionButton("趋势", symbol: "chart.xyaxis.line", action: showUsage)
                actionButton("编辑", symbol: "pencil", action: edit, prominent: true)
                actionButton(isDisabled ? "启用" : "禁用", symbol: "power", action: toggle)
                actionButton("删除", symbol: "trash", action: delete, destructive: true)
            }
        }.padding(14).glassPanel(cornerRadius: 18)
    }

    private var isDisabled: Bool { ["inactive", "disabled", "revoked"].contains((key.status ?? "active").lowercased()) }

    @ViewBuilder private func actionButton(_ title: String, symbol: String, action: @escaping () -> Void, prominent: Bool = false, destructive: Bool = false) -> some View {
        if prominent {
            Button(action: action) {
                Label(title, systemImage: symbol)
                    .font(.caption.weight(.semibold))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(AppPalette.blue)
            .controlSize(.small)
        } else {
            Button(role: destructive ? .destructive : nil, action: action) {
                Label(title, systemImage: symbol)
                    .font(.caption.weight(.semibold))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
    }

    private var masked: String { let value = key.customKey ?? key.key ?? ""; guard value.count > 10 else { return "••••••••" }; return "\(value.prefix(5))••••••\(value.suffix(4))" }
}

private struct APIKeyEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    let key: AdminAPIKey?

    @State private var name: String
    @State private var status: String
    @State private var provider = "anthropic"
    @State private var groupID: String
    @State private var useCustomKey: Bool
    @State private var rawKey = ""
    @State private var enableIPRestriction: Bool
    @State private var ipWhitelist: String
    @State private var ipBlacklist: String
    @State private var enableQuota: Bool
    @State private var quota: String
    @State private var enableRateLimit: Bool
    @State private var limit5h: String
    @State private var limit1d: String
    @State private var limit7d: String
    @State private var enableExpiration: Bool
    @State private var expirationPreset = "30"
    @State private var expirationDate: Date
    @State private var resetQuota = false
    @State private var resetUsage = false
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var availableGroups: [AdminGroup] = []
    @State private var isLoadingGroups = false
    @State private var groupLoadError: String?

    init(key: AdminAPIKey?) {
        self.key = key
        let quotaValue = key?.quota ?? 0
        let hasIPRestriction = Self.hasValues(key?.ipWhitelist) || Self.hasValues(key?.ipBlacklist)
        let hasRateLimit = (key?.rateLimit5h ?? 0) > 0 || (key?.rateLimit1d ?? 0) > 0 || (key?.rateLimit7d ?? 0) > 0
        let parsedExpiration = key?.expiresAt.flatMap(Self.parseDate)
        _name = State(initialValue: key?.name ?? "")
        _status = State(initialValue: key?.status ?? "active")
        _groupID = State(initialValue: key?.groupID.map { String($0) } ?? "")
        _useCustomKey = State(initialValue: false)
        _enableIPRestriction = State(initialValue: hasIPRestriction)
        _ipWhitelist = State(initialValue: Self.listText(key?.ipWhitelist))
        _ipBlacklist = State(initialValue: Self.listText(key?.ipBlacklist))
        _enableQuota = State(initialValue: quotaValue > 0)
        _quota = State(initialValue: quotaValue > 0 ? String(quotaValue) : "")
        _enableRateLimit = State(initialValue: hasRateLimit)
        _limit5h = State(initialValue: key?.rateLimit5h.map { String($0) } ?? "")
        _limit1d = State(initialValue: key?.rateLimit1d.map { String($0) } ?? "")
        _limit7d = State(initialValue: key?.rateLimit7d.map { String($0) } ?? "")
        _enableExpiration = State(initialValue: parsedExpiration != nil)
        _expirationPreset = State(initialValue: parsedExpiration == nil ? "30" : "custom")
        _expirationDate = State(initialValue: parsedExpiration ?? Calendar.current.date(byAdding: .day, value: 30, to: Date()) ?? Date())
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("基本信息") {
                    TextField("名称", text: $name)
                    if key == nil {
                        Picker("供应商", selection: $provider) {
                            ForEach(providerOptions, id: \.self) { value in Text(ConsoleLocalization.provider(value)).tag(value) }
                        }
                        .onChange(of: provider) { _, _ in groupID = "" }
                    }
                    Picker("分组", selection: $groupID) {
                        Text("请选择分组").tag("")
                        if let currentID = key?.groupID, !filteredGroups.contains(where: { $0.id == currentID }) {
                            Text("\(key?.groupName ?? "分组 #\(currentID)")（当前）").tag(String(currentID))
                        }
                        ForEach(filteredGroups.sorted(by: groupSort)) { group in
                            Text("\(group.name) · \(ConsoleLocalization.provider(group.platform))").tag(String(group.id))
                        }
                    }
                    if isLoadingGroups {
                        HStack { ProgressView(); Text("正在加载分组").foregroundStyle(.secondary) }.font(.caption)
                    } else if let groupLoadError {
                        HStack { Text(groupLoadError).font(.caption).foregroundStyle(.red).lineLimit(2); Spacer(); Button("重试") { Task { await loadGroups() } } }
                    } else if filteredGroups.isEmpty {
                        Text("该供应商暂无可用分组。请先在网页端创建或启用分组。")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    if key != nil {
                        Picker("状态", selection: $status) { Text("启用").tag("active"); Text("禁用").tag("inactive") }
                    }
                }

                if key == nil {
                    Section("自定义 Key") {
                        Toggle("使用自定义 Key", isOn: $useCustomKey)
                        if useCustomKey {
                            TextField("至少 16 位，仅限字母、数字、_ 和 -", text: $rawKey)
                                .textInputAutocapitalization(.never).autocorrectionDisabled()
                            if let customKeyError { Text(customKeyError).font(.caption).foregroundStyle(.red) }
                        }
                    }
                }

                Section("IP 访问限制") {
                    Toggle("启用 IP 限制", isOn: $enableIPRestriction)
                    if enableIPRestriction {
                        TextField("IP 白名单，每行一个", text: $ipWhitelist, axis: .vertical).lineLimit(3...6)
                        TextField("IP 黑名单，每行一个", text: $ipBlacklist, axis: .vertical).lineLimit(3...6)
                    }
                }

                Section("总额度") {
                    Toggle("启用总额度", isOn: $enableQuota)
                    if enableQuota {
                        TextField("额度金额（USD）", text: $quota).keyboardType(.decimalPad)
                    }
                    if key != nil, (key?.quota ?? 0) > 0 { Toggle("重置已用额度", isOn: $resetQuota) }
                }

                Section("限流额度") {
                    Toggle("启用 5H / 1D / 7D 限流", isOn: $enableRateLimit)
                    if enableRateLimit {
                        TextField("5H 限额（USD）", text: $limit5h).keyboardType(.decimalPad)
                        TextField("1D 限额（USD）", text: $limit1d).keyboardType(.decimalPad)
                        TextField("7D 限额（USD）", text: $limit7d).keyboardType(.decimalPad)
                    }
                    if key != nil, hasExistingRateLimit { Toggle("重置限流用量", isOn: $resetUsage) }
                }

                Section("有效期") {
                    Toggle("设置有效期", isOn: $enableExpiration)
                    if enableExpiration {
                        Picker("期限", selection: $expirationPreset) {
                            Text("7 天").tag("7"); Text("30 天").tag("30"); Text("90 天").tag("90"); Text("自定义").tag("custom")
                        }
                        .pickerStyle(.segmented)
                        .onChange(of: expirationPreset) { _, value in applyExpirationPreset(value) }
                        DatePicker("到期时间", selection: $expirationDate, displayedComponents: [.date, .hourAndMinute])
                    }
                }

                if let errorMessage { Section { Text(errorMessage).foregroundStyle(.red) } }
            }
            .navigationTitle(key == nil ? "创建 API Key" : "编辑 API Key")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "保存中" : "保存") { save() }.disabled(!canSave)
                }
            }
            .task { await loadGroups() }
        }
    }

    private let providerOrder = ["anthropic", "openai", "gemini", "antigravity", "grok", "kimi", "zhipu", "deepseek", "minimax", "opencode_go", "typesafe", "composite"]

    private var providerOptions: [String] {
        let values = Set(availableGroups.map { $0.platform.lowercased() })
        guard !values.isEmpty else { return [provider] }
        let ordered = providerOrder.filter(values.contains)
        return ordered + values.filter { !providerOrder.contains($0) }.sorted()
    }

    private var filteredGroups: [AdminGroup] {
        guard key == nil else {
            if let current = availableGroups.first(where: { $0.id == key?.groupID }) { return availableGroups.filter { $0.platform.caseInsensitiveCompare(current.platform) == .orderedSame } }
            return availableGroups
        }
        return availableGroups.filter { $0.platform.caseInsensitiveCompare(provider) == .orderedSame }
    }

    private var customKeyError: String? {
        guard key == nil, useCustomKey else { return nil }
        if rawKey.count < 16 { return "自定义 Key 至少需要 16 位。" }
        if rawKey.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) == nil { return "仅可使用字母、数字、下划线和连字符。" }
        return nil
    }

    private var hasExistingRateLimit: Bool {
        (key?.rateLimit5h ?? 0) > 0 || (key?.rateLimit1d ?? 0) > 0 || (key?.rateLimit7d ?? 0) > 0
    }

    private var canSave: Bool {
        !isSaving && name.nilIfBlank != nil && Int(groupID) != nil && customKeyError == nil && !isLoadingGroups
    }

    private func groupSort(_ left: AdminGroup, _ right: AdminGroup) -> Bool {
        let leftOrder = left.sortOrder ?? Int.max
        let rightOrder = right.sortOrder ?? Int.max
        return leftOrder == rightOrder ? left.name.localizedStandardCompare(right.name) == .orderedAscending : leftOrder < rightOrder
    }

    private func loadGroups() async {
        guard let service = try? store.adminService() else { return }
        isLoadingGroups = true
        groupLoadError = nil
        do {
            availableGroups = try await service.apiKeyGroups()
            if let current = availableGroups.first(where: { $0.id == key?.groupID }) {
                provider = current.platform.lowercased()
            } else if !providerOptions.contains(provider), let first = providerOptions.first {
                provider = first
            }
        } catch {
            groupLoadError = error.localizedDescription
        }
        isLoadingGroups = false
    }

    private func save() {
        guard let service = try? store.adminService(), let selectedGroupID = Int(groupID) else { return }
        isSaving = true
        errorMessage = nil
        Task {
            do {
                var body: [String: JSONValue] = ["name": .string(name.trimmingCharacters(in: .whitespacesAndNewlines)), "group_id": .number(Double(selectedGroupID))]
                if key == nil, useCustomKey, let value = rawKey.nilIfBlank { body["custom_key"] = .string(value); body["key"] = .string(value) }
                if key == nil {
                    if enableIPRestriction {
                        let whitelist = parsedIPList(ipWhitelist), blacklist = parsedIPList(ipBlacklist)
                        if !whitelist.isEmpty { body["ip_whitelist"] = .array(whitelist.map(JSONValue.string)) }
                        if !blacklist.isEmpty { body["ip_blacklist"] = .array(blacklist.map(JSONValue.string)) }
                    }
                    if enableQuota, let value = try FormParsing.number(quota), value > 0 { body["quota"] = .number(value) }
                    if enableRateLimit {
                        if let value = try FormParsing.number(limit5h), value > 0 { body["rate_limit_5h"] = .number(value) }
                        if let value = try FormParsing.number(limit1d), value > 0 { body["rate_limit_1d"] = .number(value) }
                        if let value = try FormParsing.number(limit7d), value > 0 { body["rate_limit_7d"] = .number(value) }
                    }
                    if enableExpiration { body["expires_in_days"] = .number(Double(expirationDays)) }
                } else {
                    body["status"] = .string(status)
                    body["ip_whitelist"] = .array(enableIPRestriction ? parsedIPList(ipWhitelist).map(JSONValue.string) : [])
                    body["ip_blacklist"] = .array(enableIPRestriction ? parsedIPList(ipBlacklist).map(JSONValue.string) : [])
                    body["quota"] = .number(enableQuota ? max(try FormParsing.number(quota) ?? 0, 0) : 0)
                    body["rate_limit_5h"] = .number(enableRateLimit ? max(try FormParsing.number(limit5h) ?? 0, 0) : 0)
                    body["rate_limit_1d"] = .number(enableRateLimit ? max(try FormParsing.number(limit1d) ?? 0, 0) : 0)
                    body["rate_limit_7d"] = .number(enableRateLimit ? max(try FormParsing.number(limit7d) ?? 0, 0) : 0)
                    body["expires_at"] = enableExpiration ? .string(ISO8601DateFormatter().string(from: expirationDate)) : .null
                    if resetQuota { body["reset_quota"] = .bool(true) }
                    if resetUsage { body["reset_rate_limit_usage"] = .bool(true) }
                }
                if let key { _ = try await service.updateAPIKey(key, body: body) }
                else { _ = try await service.createAPIKey(body) }
                dismiss()
            } catch { errorMessage = error.localizedDescription }
            isSaving = false
        }
    }

    private var expirationDays: Int {
        if let preset = Int(expirationPreset) { return preset }
        return max(1, Int(ceil(expirationDate.timeIntervalSince(Date()) / 86_400)))
    }

    private func applyExpirationPreset(_ value: String) {
        guard let days = Int(value) else { return }
        expirationDate = Calendar.current.date(byAdding: .day, value: days, to: Date()) ?? Date()
    }

    private func parsedIPList(_ value: String) -> [String] {
        value.components(separatedBy: CharacterSet(charactersIn: ",\n"))
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    private static func hasValues(_ value: JSONValue?) -> Bool {
        if let values = value?.arrayValue { return !values.isEmpty }
        return value?.stringValue?.nilIfBlank != nil
    }

    private static func listText(_ value: JSONValue?) -> String {
        if let values = value?.arrayValue { return values.compactMap(\.stringValue).joined(separator: "\n") }
        return value?.stringValue ?? ""
    }

    private static func parseDate(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter(); fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
}

private struct APIKeyUsageView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    let key: AdminAPIKey
    @State private var rows: [JSONValue] = []; @State private var errorMessage: String?
    var points: [(String, Double)] { rows.enumerated().map { index, value in let row = value.objectValue ?? [:]; return (row.text("date", "time", "label") ?? "\(index + 1)", row.number("total_tokens", "tokens", "value", "usage") ?? 0) } }
    var body: some View { NavigationStack { ScrollView { VStack(alignment: .leading, spacing: 14) { MetricTile(label: "配额已用", value: NumberFormatters.compact(key.quotaUsed), symbol: "gauge", tint: AppPalette.blue); if points.isEmpty { EmptyContentView(symbol: "chart.xyaxis.line", title: "暂无趋势", message: "此密钥没有可用的日用量数据。") } else { Chart(Array(points.enumerated()), id: \.offset) { _, point in LineMark(x: .value("日期", point.0), y: .value("用量", point.1)).foregroundStyle(AppPalette.blue) }.frame(height: 220).padding(16).glassPanel() }; if let errorMessage { InlineErrorView(message: errorMessage) } }.padding(16) }.navigationTitle(key.name ?? "密钥用量").toolbar { ToolbarItem(placement: .confirmationAction) { Button("完成") { dismiss() } } }.appPage().task { guard let service = try? store.adminService() else { return }; do { rows = try await service.apiKeyUsage(key.id) } catch { errorMessage = error.localizedDescription } } } }
}
