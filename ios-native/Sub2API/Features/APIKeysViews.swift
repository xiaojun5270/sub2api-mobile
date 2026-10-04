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
    @State private var userID = ""; @State private var name: String; @State private var rawKey = ""; @State private var status: String
    @State private var groupID: String; @State private var quota: String; @State private var expiresAt: String; @State private var expiresInDays = ""
    @State private var ipWhitelist = ""; @State private var ipBlacklist = ""; @State private var limit5h: String; @State private var limit1d: String; @State private var limit7d: String
    @State private var resetQuota = false; @State private var resetUsage = false; @State private var isSaving = false; @State private var errorMessage: String?
    @State private var availableGroups: [AdminGroup] = []
    @State private var isLoadingGroups = false
    @State private var groupLoadError: String?

    init(key: AdminAPIKey?) { self.key = key; _name = State(initialValue: key?.name ?? ""); _status = State(initialValue: key?.status ?? "active"); _groupID = State(initialValue: key?.groupID.map { String($0) } ?? ""); _quota = State(initialValue: key?.quota.map { String($0) } ?? ""); _expiresAt = State(initialValue: key?.expiresAt ?? ""); _ipWhitelist = State(initialValue: key?.ipWhitelist?.displayText ?? ""); _ipBlacklist = State(initialValue: key?.ipBlacklist?.displayText ?? ""); _limit5h = State(initialValue: key?.rateLimit5h.map { String($0) } ?? ""); _limit1d = State(initialValue: key?.rateLimit1d.map { String($0) } ?? ""); _limit7d = State(initialValue: key?.rateLimit7d.map { String($0) } ?? "") }

    var body: some View { NavigationStack { Form {
        Section("基本信息") {
            if key == nil { TextField("用户 ID（兼容旧接口，可选）", text: $userID).keyboardType(.numberPad) }
            TextField("名称", text: $name)
            SecureField(key == nil ? "自定义 Key（可选）" : "新 Key（留空不修改）", text: $rawKey)
            if key != nil { Picker("状态", selection: $status) { Text("启用").tag("active"); Text("禁用").tag("inactive") } }
            Picker("分组", selection: $groupID) {
                Text("未分组").tag("")
                if let currentID = key?.groupID, !availableGroups.contains(where: { $0.id == currentID }) {
                    let currentName = key?.groupName ?? "分组 #\(currentID)"
                    Text("\(currentName)（当前）").tag(String(currentID))
                }
                ForEach(availableGroups.sorted(by: groupSort)) { group in
                    Text("\(group.name) · \(group.platform)").tag(String(group.id))
                }
            }
            if isLoadingGroups {
                HStack { ProgressView(); Text("正在加载分组").foregroundStyle(.secondary) }
                    .font(.caption)
            } else if let groupLoadError {
                HStack {
                    Text(groupLoadError).font(.caption).foregroundStyle(.red).lineLimit(2)
                    Spacer()
                    Button("重试") { Task { await loadGroups() } }
                }
            }
        }
        Section("额度与期限") { TextField("额度", text: $quota).keyboardType(.decimalPad); if key == nil { TextField("有效天数", text: $expiresInDays).keyboardType(.numberPad) } else { TextField("到期时间 ISO8601", text: $expiresAt); Toggle("重置额度", isOn: $resetQuota); Toggle("重置限流用量", isOn: $resetUsage) } }
        Section("访问限制") { TextField("IP 白名单，逗号分隔", text: $ipWhitelist); TextField("IP 黑名单，逗号分隔", text: $ipBlacklist); TextField("5H 限额", text: $limit5h).keyboardType(.decimalPad); TextField("1D 限额", text: $limit1d).keyboardType(.decimalPad); TextField("7D 限额", text: $limit7d).keyboardType(.decimalPad) }
        if let errorMessage { Section { Text(errorMessage).foregroundStyle(.red) } }
    }.navigationTitle(key == nil ? "创建 API Key" : "编辑 API Key").navigationBarTitleDisplayMode(.inline).toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }; ToolbarItem(placement: .confirmationAction) { Button(isSaving ? "保存中" : "保存") { save() }.disabled(isSaving || name.isEmpty) } }.task { await loadGroups() } } }

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
            availableGroups = try await service.allGroups()
        } catch {
            groupLoadError = error.localizedDescription
        }
        isLoadingGroups = false
    }

    private func save() { guard let service = try? store.adminService() else { return }; isSaving = true; Task { do { var body: [String: JSONValue] = ["name": .string(name)]; if let value = rawKey.nilIfBlank { body["custom_key"] = .string(value); body["key"] = .string(value) }; body["group_id"] = try FormParsing.integer(groupID).map { .number(Double($0)) } ?? .null; if let value = try FormParsing.number(quota) { body["quota"] = .number(value) }; if key == nil { if let value = try FormParsing.integer(userID) { body["user_id"] = .number(Double(value)) }; if let value = try FormParsing.integer(expiresInDays) { body["expires_in_days"] = .number(Double(value)) } } else { body["status"] = .string(status); body["expires_at"] = expiresAt.nilIfBlank.map { JSONValue.string($0) } ?? .null; if resetQuota { body["reset_quota"] = .bool(true) }; if resetUsage { body["reset_rate_limit_usage"] = .bool(true) } }; if let value = ipWhitelist.nilIfBlank { body["ip_whitelist"] = .array(value.split(separator: ",").map { .string($0.trimmingCharacters(in: .whitespaces)) }) }; if let value = ipBlacklist.nilIfBlank { body["ip_blacklist"] = .array(value.split(separator: ",").map { .string($0.trimmingCharacters(in: .whitespaces)) }) }; if let value = try FormParsing.number(limit5h) { body["rate_limit_5h"] = .number(value) }; if let value = try FormParsing.number(limit1d) { body["rate_limit_1d"] = .number(value) }; if let value = try FormParsing.number(limit7d) { body["rate_limit_7d"] = .number(value) }; if let key { _ = try await service.updateAPIKey(key, body: body) } else { _ = try await service.createAPIKey(body) }; dismiss() } catch { errorMessage = error.localizedDescription }; isSaving = false } }
}

private struct APIKeyUsageView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    let key: AdminAPIKey
    @State private var rows: [JSONValue] = []; @State private var errorMessage: String?
    var points: [(String, Double)] { rows.enumerated().map { index, value in let row = value.objectValue ?? [:]; return (row.text("date", "time", "label") ?? "\(index + 1)", row.number("total_tokens", "tokens", "value", "usage") ?? 0) } }
    var body: some View { NavigationStack { ScrollView { VStack(alignment: .leading, spacing: 14) { MetricTile(label: "配额已用", value: NumberFormatters.compact(key.quotaUsed), symbol: "gauge", tint: AppPalette.blue); if points.isEmpty { EmptyContentView(symbol: "chart.xyaxis.line", title: "暂无趋势", message: "此密钥没有可用的日用量数据。") } else { Chart(Array(points.enumerated()), id: \.offset) { _, point in LineMark(x: .value("日期", point.0), y: .value("用量", point.1)).foregroundStyle(AppPalette.blue) }.frame(height: 220).padding(16).glassPanel() }; if let errorMessage { InlineErrorView(message: errorMessage) } }.padding(16) }.navigationTitle(key.name ?? "密钥用量").toolbar { ToolbarItem(placement: .confirmationAction) { Button("完成") { dismiss() } } }.appPage().task { guard let service = try? store.adminService() else { return }; do { rows = try await service.apiKeyUsage(key.id) } catch { errorMessage = error.localizedDescription } } } }
}
