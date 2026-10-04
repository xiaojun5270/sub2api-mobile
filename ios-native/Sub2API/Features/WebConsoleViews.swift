import SwiftUI
import UniformTypeIdentifiers

enum WebConsoleModule: String, CaseIterable, Identifiable, Hashable {
    case subscriptions, announcements, proxies, redeemCodes, promoCodes, auditLogs, channels, channelMonitors
    var id: String { rawValue }
    var title: String { switch self { case .subscriptions: "订阅管理"; case .announcements: "公告"; case .proxies: "IP / 代理管理"; case .redeemCodes: "兑换码"; case .promoCodes: "优惠码"; case .auditLogs: "操作日志"; case .channels: "渠道管理"; case .channelMonitors: "渠道监控" } }
    var subtitle: String { switch self { case .subscriptions: "分配、延期、撤销、恢复与配额"; case .announcements: "发布、编辑与阅读状态"; case .proxies: "代理测试、质量、统计与账号关联"; case .redeemCodes: "生成、批量管理、过期与导出"; case .promoCodes: "优惠规则、状态与使用明细"; case .auditLogs: "操作审计、详情与清理"; case .channels: "渠道、模型价格和路由配置"; case .channelMonitors: "监控任务、模板、运行与历史" } }
    var symbol: String { switch self { case .subscriptions: "creditcard"; case .announcements: "megaphone"; case .proxies: "network"; case .redeemCodes: "ticket"; case .promoCodes: "tag"; case .auditLogs: "list.clipboard"; case .channels: "point.3.connected.trianglepath.dotted"; case .channelMonitors: "waveform.path.ecg.rectangle" } }
    var color: Color { switch self { case .subscriptions: .indigo; case .announcements: .orange; case .proxies: .cyan; case .redeemCodes: .green; case .promoCodes: .pink; case .auditLogs: .gray; case .channels: AppPalette.blue; case .channelMonitors: AppPalette.purple } }
    var path: String { switch self { case .subscriptions: "/api/v1/admin/subscriptions"; case .announcements: "/api/v1/admin/announcements"; case .proxies: "/api/v1/admin/proxies"; case .redeemCodes: "/api/v1/admin/redeem-codes"; case .promoCodes: "/api/v1/admin/promo-codes"; case .auditLogs: "/api/v1/admin/audit-logs"; case .channels: "/api/v1/admin/channels"; case .channelMonitors: "/api/v1/admin/channel-monitors" } }
    var itemKeys: [String] { switch self { case .subscriptions: ["items", "subscriptions"]; case .announcements: ["items", "announcements"]; case .proxies: ["items", "proxies"]; case .redeemCodes: ["items", "codes", "redeem_codes"]; case .promoCodes: ["items", "promo_codes", "codes"]; case .auditLogs: ["items", "logs", "audit_logs"]; case .channels: ["items", "channels"]; case .channelMonitors: ["items", "monitors", "channel_monitors"] } }
    var canCreate: Bool { self != .auditLogs }
    var canEdit: Bool { ![.subscriptions, .redeemCodes, .auditLogs].contains(self) }
    var canDelete: Bool { self != .subscriptions }
    var createPath: String { switch self { case .subscriptions: "/api/v1/admin/subscriptions/assign"; case .redeemCodes: "/api/v1/admin/redeem-codes/generate"; default: path } }
    var createTemplate: [String: JSONValue] { switch self {
        case .subscriptions: ["user_id": .number(0), "group_id": .number(0), "validity_days": .number(30)]
        case .announcements: ["title": .string(""), "content": .string(""), "status": .string("active")]
        case .proxies: ["name": .string(""), "protocol": .string("http"), "host": .string(""), "port": .number(0), "username": .string(""), "password": .string(""), "status": .string("active")]
        case .redeemCodes: ["count": .number(1), "type": .string("balance"), "value": .number(0), "expires_in_days": .number(30)]
        case .promoCodes: ["code": .string(""), "bonus_amount": .number(0), "max_uses": .number(0), "expires_at": .null, "notes": .string(""), "status": .string("active")]
        case .channels: ["name": .string(""), "type": .string("openai"), "base_url": .string(""), "api_key": .string(""), "status": .string("active")]
        case .channelMonitors: ["name": .string(""), "channel_id": .number(0), "interval_seconds": .number(60), "enabled": .bool(true)]
        case .auditLogs: [:]
    } }
}

struct WebConsoleListView: View {
    @EnvironmentObject private var store: AppStore
    let module: WebConsoleModule
    @State private var records: [DynamicRecord] = []
    @State private var page = 1
    @State private var pages = 1
    @State private var total = 0
    @State private var search = ""
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var message: String?
    @State private var editor: ConsoleEditorState?
    @State private var proxyEditor: ProxyEditorState?
    @State private var detail: ConsoleDetailState?
    @State private var deleting: DynamicRecord?
    @State private var clearsAudit = false

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                HStack { Label(module.subtitle, systemImage: module.symbol).font(.footnote).foregroundStyle(module.color); Spacer(); Text("\(total)").font(.headline.monospacedDigit()) }.padding(12).glassPanel(cornerRadius: 16)
                if let message { Text(message).font(.footnote).foregroundStyle(.secondary).padding(12).frame(maxWidth: .infinity, alignment: .leading).glassPanel(cornerRadius: 14) }
                if isLoading && records.isEmpty { LoadingView() }
                else if let errorMessage, records.isEmpty { InlineErrorView(message: errorMessage) { Task { await load() } } }
                else if records.isEmpty { EmptyContentView(symbol: module.symbol, title: "暂无\(module.title)", message: "当前条件下没有数据。") }
                else { ForEach(records) { record in ConsoleRecordCard(module: module, record: record).onTapGesture { showDetail(record) }.contextMenu { recordMenu(record) } } }
                HStack { Button("上一页") { page -= 1; Task { await load() } }.disabled(page <= 1); Spacer(); Text("第 \(page) / \(pages) 页").font(.caption).foregroundStyle(.secondary); Spacer(); Button("下一页") { page += 1; Task { await load() } }.disabled(page >= pages) }.padding(12).glassPanel(cornerRadius: 16)
            }.padding(16)
        }
        .searchable(text: $search, prompt: "搜索\(module.title)")
        .onSubmit(of: .search) { page = 1; Task { await load() } }
        .refreshable { await load() }
        .navigationTitle(module.title)
        .toolbar { ToolbarItemGroup(placement: .primaryAction) { if module == .auditLogs { Button(role: .destructive) { clearsAudit = true } label: { Image(systemName: "trash") } }; if module.canCreate { Button { if module == .proxies { proxyEditor = ProxyEditorState(record: nil) } else { editor = ConsoleEditorState(title: "创建\(module.title)", path: module.createPath, method: .post, object: module.createTemplate) } } label: { Image(systemName: "plus") } } } }
        .sheet(item: $editor, onDismiss: { Task { await load() } }) { ConsoleJSONEditor(state: $0) }
        .sheet(item: $proxyEditor, onDismiss: { Task { await load() } }) { ProxyEditorView(state: $0) }
        .sheet(item: $detail) { ConsoleDetailView(state: $0) }
        .confirmationDialog("确认删除？", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) { Button("删除", role: .destructive) { if let deleting { Task { await delete(deleting) } } } }
        .alert("清理操作日志", isPresented: $clearsAudit) { SecureField("TOTP 验证码", text: Binding(get: { auditCode }, set: { auditCode = $0 })); Button("取消", role: .cancel) {}; Button("清理", role: .destructive) { Task { await clearAudit() } } } message: { Text("此操作需要管理员 TOTP 验证码。") }
        .appPage().task(id: "\(store.activeServerID?.uuidString ?? "")-\(module.rawValue)") { await load() }
    }

    @State private var auditCode = ""

    @ViewBuilder private func recordMenu(_ record: DynamicRecord) -> some View {
        Button { showDetail(record) } label: { Label("详情", systemImage: "info.circle") }
        if module.canEdit { Button { if module == .proxies { proxyEditor = ProxyEditorState(record: record) } else { editor = ConsoleEditorState(title: "编辑\(module.title)", path: "\(module.path)/\(record.id)", method: .put, object: record.object) } } label: { Label("编辑", systemImage: "pencil") } }
        ForEach(actions(for: record)) { action in Button(role: action.destructive ? .destructive : nil) { Task { await perform(action, record: record) } } label: { Label(action.title, systemImage: action.symbol) } }
        if module.canDelete { Divider(); Button(role: .destructive) { deleting = record } label: { Label("删除", systemImage: "trash") } }
    }

    private func actions(for record: DynamicRecord) -> [ConsoleAction] {
        switch module {
        case .subscriptions: return [ConsoleAction(title: "延期", symbol: "calendar.badge.plus", suffix: "extend", body: ["days": .number(30)]), ConsoleAction(title: "重置配额", symbol: "arrow.counterclockwise", suffix: "reset-quota"), ConsoleAction(title: "撤销", symbol: "xmark.circle", suffix: "revoke", destructive: true), ConsoleAction(title: "恢复", symbol: "arrow.uturn.backward.circle", suffix: "restore")]
        case .announcements: return [ConsoleAction(title: "阅读状态", symbol: "eye", suffix: "read-status", method: .get, showsResult: true)]
        case .proxies: return [ConsoleAction(title: "测试代理", symbol: "checkmark.circle", suffix: "test"), ConsoleAction(title: "质量检测", symbol: "waveform.path.ecg", suffix: "quality-check", showsResult: true), ConsoleAction(title: "统计", symbol: "chart.bar", suffix: "stats", method: .get, showsResult: true), ConsoleAction(title: "关联账号", symbol: "server.rack", suffix: "accounts", method: .get, showsResult: true)]
        case .redeemCodes: return [ConsoleAction(title: "立即过期", symbol: "clock.badge.xmark", suffix: "expire", destructive: true)]
        case .promoCodes: return [ConsoleAction(title: "使用明细", symbol: "list.bullet", suffix: "usages", method: .get, showsResult: true)]
        case .channels: return [ConsoleAction(title: "模型价格", symbol: "dollarsign.circle", suffix: "model-pricing", method: .get, showsResult: true)]
        case .channelMonitors: return [ConsoleAction(title: "立即运行", symbol: "play.fill", suffix: "run"), ConsoleAction(title: "复制", symbol: "doc.on.doc", suffix: "duplicate"), ConsoleAction(title: "历史", symbol: "clock.arrow.circlepath", suffix: "history", method: .get, showsResult: true)]
        case .auditLogs: return []
        }
    }

    private func load() async { guard let service = try? store.adminService() else { return }; isLoading = true; do { let result = try await service.dynamicPage(module.path, page: page, search: search, itemKeys: module.itemKeys); records = result.items; total = result.total; pages = max(result.pages, Int(ceil(Double(total) / 20))); errorMessage = nil } catch { errorMessage = error.localizedDescription }; isLoading = false }
    private func showDetail(_ record: DynamicRecord) { detail = ConsoleDetailState(title: record.text("name", "title", "code", "email") ?? "\(module.title)详情", value: .object(record.object)) }
    private func delete(_ record: DynamicRecord) async { guard let service = try? store.adminService() else { return }; deleting = nil; do { try await service.dynamicDelete("\(module.path)/\(record.id)"); await load() } catch { message = error.localizedDescription } }
    private func perform(_ action: ConsoleAction, record: DynamicRecord) async { guard let service = try? store.adminService() else { return }; let path = "\(module.path)/\(record.id)/\(action.suffix)"; do { if action.method == .get { let value = try await service.dynamicGet(path, query: action.suffix == "usages" ? ["page": "1", "page_size": "100"] : [:]); if action.showsResult { detail = ConsoleDetailState(title: action.title, value: value) } } else if action.showsResult { let value = try await service.dynamicCreate(path, body: action.body); detail = ConsoleDetailState(title: action.title, value: value) } else { try await service.dynamicAction(path, method: action.method, body: action.body); message = "\(action.title)已完成"; await load() } } catch { message = error.localizedDescription } }
    private func clearAudit() async { guard let service = try? store.adminService() else { return }; do { try await service.dynamicAction("/api/v1/admin/audit-logs/clear", body: ["totp_code": .string(auditCode)]); auditCode = ""; await load() } catch { message = error.localizedDescription } }
}

private struct ConsoleRecordCard: View {
    let module: WebConsoleModule; let record: DynamicRecord
    var body: some View { VStack(alignment: .leading, spacing: 9) { HStack { Image(systemName: module.symbol).foregroundStyle(module.color); VStack(alignment: .leading, spacing: 3) { Text(record.text("name", "title", "code", "email", "action") ?? "#\(record.id)").font(.subheadline.bold()).lineLimit(2); Text(record.text("description", "content", "url", "proxy_url", "created_at", "createdAt") ?? "ID \(record.id)").font(.caption).foregroundStyle(.secondary).lineLimit(2) }; Spacer(); if let status = record.text("status", "state") { StatusPill(text: status, color: statusColor(status)) } }; LazyVGrid(columns: [GridItem(.adaptive(minimum: 110), spacing: 7)], spacing: 7) { ForEach(summaryFields, id: \.0) { label, value in VStack(alignment: .leading, spacing: 2) { Text(label).font(.caption2).foregroundStyle(.secondary); Text(value).font(.caption.weight(.semibold)).lineLimit(1) }.frame(maxWidth: .infinity, alignment: .leading).padding(8).background(.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 8)) } } }.padding(14).contentShape(Rectangle()).glassPanel(cornerRadius: 18, interactive: true) }
    private var summaryFields: [(String, String)] { let skip = Set(["id", "name", "title", "description", "content", "status", "state", "created_at", "updated_at"]); return record.object.keys.sorted().filter { !skip.contains($0) && record.object[$0]?.objectValue == nil && record.object[$0]?.arrayValue == nil }.prefix(6).map { ($0.replacingOccurrences(of: "_", with: " "), record.object[$0]?.displayText ?? "--") } }
    private func statusColor(_ value: String) -> Color { ["active", "enabled", "success", "completed", "valid"].contains(value.lowercased()) ? .green : ["failed", "error", "revoked", "expired", "disabled"].contains(value.lowercased()) ? .red : .secondary }
}

private struct ConsoleAction: Identifiable {
    let id = UUID(); let title: String; let symbol: String; let suffix: String; var method: HTTPMethod = .post; var body: [String: JSONValue] = [:]; var destructive = false; var showsResult = false
}

private struct ConsoleEditorState: Identifiable { let id = UUID(); let title: String; let path: String; let method: HTTPMethod; let object: [String: JSONValue] }
private struct ProxyEditorState: Identifiable { let id = UUID(); let record: DynamicRecord? }
private struct ConsoleDetailState: Identifiable { let id = UUID(); let title: String; let value: JSONValue }

private struct ProxyEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    let state: ProxyEditorState
    @State private var name: String
    @State private var proxyProtocol: String
    @State private var host: String
    @State private var port: String
    @State private var username: String
    @State private var password = ""
    @State private var passwordDirty = false
    @State private var status: String
    @State private var hasExpiry: Bool
    @State private var expiryDate: Date
    @State private var expiryWarnDays: String
    @State private var fallbackMode: String
    @State private var backupProxyID: String
    @State private var backupProxies: [DynamicRecord] = []
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(state: ProxyEditorState) {
        self.state = state
        let object = state.record?.object ?? [:]
        let expiresAt = object.text("expires_at")
        _name = State(initialValue: object.text("name") ?? "")
        _proxyProtocol = State(initialValue: object.text("protocol") ?? "http")
        _host = State(initialValue: object.text("host") ?? "")
        _port = State(initialValue: object.number("port").map { String(Int($0)) } ?? "8080")
        _username = State(initialValue: object.text("username") ?? "")
        _status = State(initialValue: object.text("status") == "inactive" ? "inactive" : "active")
        _hasExpiry = State(initialValue: expiresAt != nil)
        _expiryDate = State(initialValue: Self.parseDate(expiresAt) ?? Calendar.current.date(byAdding: .day, value: 30, to: Date()) ?? Date())
        _expiryWarnDays = State(initialValue: object.number("expiry_warn_days").map { String(Int($0)) } ?? "7")
        _fallbackMode = State(initialValue: object.text("fallback_mode") ?? "none")
        _backupProxyID = State(initialValue: object.number("backup_proxy_id").map { String(Int($0)) } ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("代理信息") {
                    TextField("名称", text: $name)
                    Picker("协议", selection: $proxyProtocol) {
                        Text("HTTP").tag("http")
                        Text("HTTPS").tag("https")
                        Text("SOCKS5").tag("socks5")
                        Text("SOCKS5H").tag("socks5h")
                    }
                    TextField("主机 / IP", text: $host)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    TextField("端口", text: $port)
                        .keyboardType(.numberPad)
                    if state.record != nil {
                        Picker("状态", selection: $status) {
                            Text("启用").tag("active")
                            Text("停用").tag("inactive")
                        }
                    }
                }

                Section("身份验证") {
                    TextField("用户名（可选）", text: $username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField(state.record == nil ? "密码（可选）" : "新密码（留空不修改）", text: $password)
                        .textContentType(.password)
                        .onChange(of: password) { _, _ in passwordDirty = true }
                }

                Section("有效期") {
                    Toggle("设置到期日", isOn: $hasExpiry)
                    if hasExpiry {
                        DatePicker("到期日期", selection: $expiryDate, displayedComponents: .date)
                    }
                    TextField("提前提醒天数", text: $expiryWarnDays)
                        .keyboardType(.numberPad)
                }

                Section("到期后连接方式") {
                    Picker("Fallback 模式", selection: $fallbackMode) {
                        Text("无").tag("none")
                        Text("备用代理").tag("proxy")
                        Text("直连").tag("direct")
                    }
                    if fallbackMode == "proxy" {
                        Picker("备用代理", selection: $backupProxyID) {
                            Text("请选择").tag("")
                            ForEach(backupProxies) { proxy in
                                Text(proxyLabel(proxy)).tag(proxy.id)
                            }
                        }
                    }
                }

                if let errorMessage {
                    Section { Text(errorMessage).foregroundStyle(.red) }
                }
            }
            .navigationTitle(state.record == nil ? "添加代理" : "编辑代理")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "保存中" : "保存") { save() }
                        .disabled(isSaving || name.nilIfBlank == nil || host.nilIfBlank == nil || !(1...65535).contains(Int(port) ?? 0) || (fallbackMode == "proxy" && backupProxyID.isEmpty))
                }
            }
            .task { await loadBackupProxies() }
        }
    }

    private func save() {
        guard let service = try? store.adminService(), let portValue = Int(port) else { return }
        isSaving = true
        errorMessage = nil
        Task {
            do {
                var body: [String: JSONValue] = [
                    "name": .string(name.trimmingCharacters(in: .whitespacesAndNewlines)),
                    "protocol": .string(proxyProtocol),
                    "host": .string(host.trimmingCharacters(in: .whitespacesAndNewlines)),
                    "port": .number(Double(portValue)),
                    "username": .string(username.trimmingCharacters(in: .whitespacesAndNewlines)),
                    "fallback_mode": .string(fallbackMode),
                    "backup_proxy_id": fallbackMode == "proxy" ? .number(Double(Int(backupProxyID) ?? 0)) : .null,
                    "expiry_warn_days": .number(Double(Int(expiryWarnDays) ?? 7))
                ]
                body["expires_at"] = hasExpiry ? .number(expiryTimestamp) : .null
                if state.record == nil || passwordDirty { body["password"] = .string(password.trimmingCharacters(in: .whitespacesAndNewlines)) }
                if let record = state.record {
                    body["status"] = .string(status)
                    _ = try await service.dynamicUpdate("/api/v1/admin/proxies/\(record.id)", body: body)
                } else {
                    _ = try await service.dynamicCreate("/api/v1/admin/proxies", body: body)
                }
                dismiss()
            } catch {
                errorMessage = error.localizedDescription
            }
            isSaving = false
        }
    }

    private func loadBackupProxies() async {
        guard let service = try? store.adminService() else { return }
        guard let value = try? await service.dynamicGet("/api/v1/admin/proxies/all", query: ["with_count": "true"]) else { return }
        var rows = value.arrayValue ?? []
        if rows.isEmpty, let object = value.objectValue {
            rows = object.rows("items", "proxies", "data").map { .object($0) }
        }
        backupProxies = rows.enumerated().map { DynamicRecord(value: $0.element, index: $0.offset) }.filter { $0.id != state.record?.id }
    }

    private var expiryTimestamp: Double {
        Calendar.current.startOfDay(for: expiryDate).timeIntervalSince1970
    }

    private func proxyLabel(_ proxy: DynamicRecord) -> String {
        let name = proxy.text("name") ?? "代理 #\(proxy.id)"
        let address = "\(proxy.text("host") ?? "--"):\(Int(proxy.number("port") ?? 0))"
        return "\(name)（\(address)）"
    }

    private static func parseDate(_ value: String?) -> Date? {
        guard let value else { return nil }
        let prefix = String(value.prefix(10))
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: prefix)
    }
}

private struct ConsoleJSONEditor: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    let state: ConsoleEditorState
    @State private var json = ""; @State private var errorMessage: String?; @State private var isSaving = false
    var body: some View { NavigationStack { VStack(spacing: 10) { TextEditor(text: $json).font(.body.monospaced()).autocorrectionDisabled().textInputAutocapitalization(.never).padding(8).background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 12)); if let errorMessage { Text(errorMessage).font(.footnote).foregroundStyle(.red).frame(maxWidth: .infinity, alignment: .leading) } }.padding().navigationTitle(state.title).navigationBarTitleDisplayMode(.inline).toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }; ToolbarItem(placement: .confirmationAction) { Button(isSaving ? "保存中" : "保存") { save() }.disabled(isSaving) } }.onAppear { let value = JSONValue.object(state.object); json = String(data: (try? FormParsing.jsonData(value)) ?? Data("{}".utf8), encoding: .utf8) ?? "{}" } } }
    private func save() { guard let service = try? store.adminService() else { return }; isSaving = true; Task { do { let body = try FormParsing.jsonObject(json); if state.method == .put { _ = try await service.dynamicUpdate(state.path, body: body) } else { _ = try await service.dynamicCreate(state.path, body: body) }; dismiss() } catch { errorMessage = error.localizedDescription }; isSaving = false } }
}

private struct ConsoleDetailView: View {
    @Environment(\.dismiss) private var dismiss
    let state: ConsoleDetailState
    var body: some View { NavigationStack { ScrollView { DynamicJSONView(value: state.value).padding(16).textSelection(.enabled) }.navigationTitle(state.title).navigationBarTitleDisplayMode(.inline).toolbar { ToolbarItem(placement: .confirmationAction) { Button("完成") { dismiss() } } }.appPage() } }
}

private struct LegacySystemSettingsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var settingsText = "{}"
    @State private var systemInfo: JSONValue?
    @State private var updateInfo: JSONValue?
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var pendingAction: String?

    var body: some View { ScrollView { VStack(spacing: 14) {
        VStack(alignment: .leading, spacing: 10) { Text("系统设置 JSON").font(.headline); Text("覆盖网页端全部设置字段；未修改字段会原样保留。").font(.caption).foregroundStyle(.secondary); TextEditor(text: $settingsText).font(.caption.monospaced()).frame(minHeight: 360).autocorrectionDisabled().textInputAutocapitalization(.never).padding(8).background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 12)); Button(isSaving ? "保存中" : "保存设置") { save() }.buttonStyle(.borderedProminent).disabled(isSaving) }.padding(16).glassPanel()
        if let systemInfo { VStack(alignment: .leading, spacing: 10) { Text("系统版本").font(.headline); DynamicJSONView(value: systemInfo); HStack { Button("检查更新") { Task { await checkUpdates() } }.buttonStyle(.bordered); Button("执行更新", role: .destructive) { pendingAction = "update" }.buttonStyle(.bordered); Button("重启", role: .destructive) { pendingAction = "restart" }.buttonStyle(.bordered) } }.padding(16).glassPanel() }
        if let updateInfo { VStack(alignment: .leading, spacing: 8) { Text("更新信息").font(.headline); DynamicJSONView(value: updateInfo) }.padding(16).glassPanel() }
        if let errorMessage { InlineErrorView(message: errorMessage) }
    }.padding(16) }.navigationTitle("系统设置").confirmationDialog("确认系统操作？", isPresented: Binding(get: { pendingAction != nil }, set: { if !$0 { pendingAction = nil } }), titleVisibility: .visible) { Button(pendingAction == "restart" ? "重启服务" : "执行更新", role: .destructive) { if let action = pendingAction { Task { await systemAction(action) } } } }.appPage().task { await load() } }
    private func load() async { guard let service = try? store.adminService() else { return }; do { let settings = try await service.dynamicGet("/api/v1/admin/settings"); settingsText = String(data: try FormParsing.jsonData(settings), encoding: .utf8) ?? "{}"; systemInfo = try? await service.dynamicGet("/api/v1/admin/system/version") } catch { errorMessage = error.localizedDescription } }
    private func save() { guard let service = try? store.adminService() else { return }; isSaving = true; Task { do { let body = try FormParsing.jsonObject(settingsText); _ = try await service.dynamicUpdate("/api/v1/admin/settings", body: body); await load() } catch { errorMessage = error.localizedDescription }; isSaving = false } }
    private func checkUpdates() async { guard let service = try? store.adminService() else { return }; do { updateInfo = try await service.dynamicGet("/api/v1/admin/system/check-updates") } catch { errorMessage = error.localizedDescription } }
    private func systemAction(_ action: String) async { guard let service = try? store.adminService() else { return }; pendingAction = nil; do { try await service.dynamicAction("/api/v1/admin/system/\(action)"); await load() } catch { errorMessage = error.localizedDescription } }
}

private struct LegacyPersonalConsoleView: View {
    @EnvironmentObject private var store: AppStore
    @State private var data: [String: JSONValue] = [:]
    @State private var editor: AdvancedActionState?
    @State private var errorMessage: String?
    @State private var isLoading = true

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                HStack(spacing: 8) {
                    Button { let object = data["个人资料"]?.objectValue ?? [:]; editor = AdvancedActionState(title: "编辑个人资料", path: "/api/v1/user", method: .put, template: object) } label: { Label("编辑资料", systemImage: "person.crop.circle.badge.checkmark").frame(maxWidth: .infinity) }.buttonStyle(.bordered)
                    Button { editor = AdvancedActionState(title: "兑换", path: "/api/v1/redeem", method: .post, template: ["code": .string("")]) } label: { Label("兑换", systemImage: "giftcard").frame(maxWidth: .infinity) }.buttonStyle(.borderedProminent)
                }
                if isLoading { LoadingView(label: "正在加载个人中心") }
                if let errorMessage { InlineErrorView(message: errorMessage) }
                ForEach(data.keys.sorted(), id: \.self) { key in VStack(alignment: .leading, spacing: 9) { Text(key).font(.headline); DynamicJSONView(value: data[key] ?? .null) }.padding(16).glassPanel() }
            }.padding(16)
        }
        .navigationTitle("我的账户")
        .sheet(item: $editor, onDismiss: { Task { await load() } }) { AdvancedJSONActionEditor(state: $0) }
        .refreshable { await load() }
        .appPage().task { await load() }
    }

    private func load() async {
        guard let service = try? store.adminService() else { return }
        isLoading = true; errorMessage = nil
        async let me: JSONValue? = try? await service.dynamicGet("/api/v1/auth/me")
        async let user: JSONValue? = try? await service.dynamicGet("/api/v1/user")
        async let keys: JSONValue? = try? await service.dynamicGet("/api/v1/keys", query: ["page": "1", "page_size": "100"])
        async let subscriptions: JSONValue? = try? await service.dynamicGet("/api/v1/subscriptions")
        async let channels: JSONValue? = try? await service.dynamicGet("/api/v1/channels/available")
        async let monitors: JSONValue? = try? await service.dynamicGet("/api/v1/channel-monitors")
        let values = await (me, user, keys, subscriptions, channels, monitors)
        if let value = values.0 { data["我的账户"] = value }
        if let value = values.1 { data["个人资料"] = value }
        if let value = values.2 { data["API 密钥"] = value }
        if let value = values.3 { data["我的订阅"] = value }
        if let value = values.4 { data["渠道状态"] = value }
        if let value = values.5 { data["渠道监控"] = value }
        if data.isEmpty { errorMessage = "个人中心需要网页登录 JWT；当前 Admin API Key 只能访问管理员接口。" }
        isLoading = false
    }
}

struct SystemSettingsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var values: [String: JSONValue] = [:]
    @State private var systemInfo: JSONValue?
    @State private var updateInfo: JSONValue?
    @State private var isLoading = true
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var pendingAction: String?

    var body: some View {
        Form {
            if isLoading { Section { HStack { Spacer(); ProgressView(); Text("正在加载设置").foregroundStyle(.secondary); Spacer() } } }
            Section("站点") {
                TextField("站点名称", text: textBinding("site_name"))
                TextField("站点副标题", text: textBinding("site_subtitle"))
                TextField("Logo URL", text: textBinding("site_logo")).textInputAutocapitalization(.never)
                TextField("API Base URL", text: textBinding("api_base_url")).textInputAutocapitalization(.never)
                TextField("联系方式", text: textBinding("contact_info"))
                TextField("文档地址", text: textBinding("doc_url")).textInputAutocapitalization(.never)
                Toggle("紧凑首页", isOn: boolBinding("compact_home_enabled"))
            }
            Section("注册与认证") {
                Toggle("允许注册", isOn: boolBinding("registration_enabled"))
                Toggle("邮箱验证", isOn: boolBinding("email_verify_enabled"))
                Toggle("启用优惠码", isOn: boolBinding("promo_code_enabled"))
                Toggle("密码重置", isOn: boolBinding("password_reset_enabled"))
                Toggle("邀请码", isOn: boolBinding("invitation_code_enabled"))
                Toggle("TOTP", isOn: boolBinding("totp_enabled"))
                Toggle("Passkey", isOn: boolBinding("passkey_enabled"))
                Toggle("登录条款确认", isOn: boolBinding("login_agreement_enabled"))
            }
            Section("OAuth 登录") {
                Toggle("GitHub OAuth", isOn: boolBinding("github_oauth_enabled"))
                Toggle("Google OAuth", isOn: boolBinding("google_oauth_enabled"))
                Toggle("LinuxDo OAuth", isOn: boolBinding("linuxdo_oauth_enabled"))
                Toggle("钉钉 OAuth", isOn: boolBinding("dingtalk_oauth_enabled"))
                Toggle("微信 OAuth", isOn: boolBinding("wechat_oauth_enabled"))
                Toggle("OIDC", isOn: boolBinding("oidc_oauth_enabled"))
                TextField("OIDC 提供方名称", text: textBinding("oidc_oauth_provider_name"))
            }
            Section("订阅与计费") {
                Toggle("启用订阅", isOn: boolBinding("subscription_enabled"))
                Toggle("允许购买订阅", isOn: boolBinding("purchase_subscription_enabled"))
                TextField("购买订阅地址", text: textBinding("purchase_subscription_url")).textInputAutocapitalization(.never)
                Toggle("启用支付", isOn: boolBinding("payment_enabled"))
                Toggle("禁用余额支付", isOn: boolBinding("payment_balance_disabled"))
                Toggle("推广返佣", isOn: boolBinding("affiliate_enabled"))
            }
            Section("通知") {
                Toggle("余额不足提醒", isOn: boolBinding("balance_low_notify_enabled"))
                TextField("余额提醒阈值", text: numberBinding("balance_low_notify_threshold")).keyboardType(.decimalPad)
                TextField("充值地址", text: textBinding("balance_low_notify_recharge_url")).textInputAutocapitalization(.never)
                Toggle("账号额度提醒", isOn: boolBinding("account_quota_notify_enabled"))
            }
            Section("渠道监控") {
                Toggle("启用渠道监控", isOn: boolBinding("channel_monitor_enabled"))
                TextField("默认间隔（秒）", text: numberBinding("channel_monitor_default_interval_seconds")).keyboardType(.numberPad)
                Toggle("隐藏吞吐", isOn: boolBinding("channel_monitor_hide_throughput"))
                Toggle("隐藏用户排行", isOn: boolBinding("channel_monitor_hide_user_ranking"))
                Toggle("显示额度", isOn: boolBinding("channel_monitor_show_quota"))
                Toggle("可用渠道页面", isOn: boolBinding("available_channels_enabled"))
            }
            Section("后台能力") {
                Toggle("后台模式", isOn: boolBinding("backend_mode_enabled"))
                Toggle("插件管理", isOn: boolBinding("plugin_management_enabled"))
                Toggle("风控", isOn: boolBinding("risk_control_enabled"))
                Toggle("允许用户查看错误请求", isOn: boolBinding("allow_user_view_error_requests"))
                TextField("服务器时区", text: textBinding("server_timezone"))
                TextField("默认分页数量", text: numberBinding("table_default_page_size")).keyboardType(.numberPad)
            }
            if let info = systemInfo?.objectValue {
                Section("系统版本") {
                    LabeledValueRow(label: "版本", value: info.text("version", "current_version") ?? "--")
                    LabeledValueRow(label: "提交", value: info.text("commit", "git_commit") ?? "--")
                    LabeledValueRow(label: "构建时间", value: info.text("build_time", "buildTime") ?? "--")
                    Button("检查更新") { Task { await checkUpdates() } }
                    Button("执行更新", role: .destructive) { pendingAction = "update" }
                    Button("重启服务", role: .destructive) { pendingAction = "restart" }
                }
            }
            if let updateInfo { Section("更新信息") { Text(updateInfo.displayText).font(.footnote).textSelection(.enabled) } }
            if let errorMessage { Section { Text(errorMessage).foregroundStyle(.red) } }
        }
        .scrollContentBackground(.hidden)
        .navigationTitle("系统设置")
        .toolbar { ToolbarItem(placement: .primaryAction) { Button(isSaving ? "保存中" : "保存") { save() }.disabled(isSaving || isLoading) } }
        .confirmationDialog("确认系统操作？", isPresented: Binding(get: { pendingAction != nil }, set: { if !$0 { pendingAction = nil } }), titleVisibility: .visible) {
            Button(pendingAction == "restart" ? "重启服务" : "执行更新", role: .destructive) { if let action = pendingAction { Task { await systemAction(action) } } }
        }
        .appPage().task { await load() }
    }

    private func textBinding(_ key: String) -> Binding<String> {
        Binding(get: { values[key]?.stringValue ?? "" }, set: { values[key] = .string($0) })
    }
    private func numberBinding(_ key: String) -> Binding<String> {
        Binding(get: { values[key]?.displayText == "--" ? "" : values[key]?.displayText ?? "" }, set: { raw in values[key] = Double(raw).map(JSONValue.number) ?? .null })
    }
    private func boolBinding(_ key: String) -> Binding<Bool> {
        Binding(get: { values[key]?.boolValue ?? false }, set: { values[key] = .bool($0) })
    }
    private func load() async {
        guard let service = try? store.adminService() else { return }
        isLoading = true
        do {
            let settings = try await service.dynamicGet("/api/v1/admin/settings")
            values = settings.objectValue ?? [:]
            systemInfo = try? await service.dynamicGet("/api/v1/admin/system/version")
            errorMessage = nil
        } catch { errorMessage = error.localizedDescription }
        isLoading = false
    }
    private func save() {
        guard let service = try? store.adminService() else { return }
        isSaving = true
        Task { do { _ = try await service.dynamicUpdate("/api/v1/admin/settings", body: values); await load() } catch { errorMessage = error.localizedDescription }; isSaving = false }
    }
    private func checkUpdates() async { guard let service = try? store.adminService() else { return }; do { updateInfo = try await service.dynamicGet("/api/v1/admin/system/check-updates") } catch { errorMessage = error.localizedDescription } }
    private func systemAction(_ action: String) async { guard let service = try? store.adminService() else { return }; pendingAction = nil; do { try await service.dynamicAction("/api/v1/admin/system/\(action)"); await load() } catch { errorMessage = error.localizedDescription } }
}

struct PersonalConsoleView: View {
    @EnvironmentObject private var store: AppStore
    @State private var profile: [String: JSONValue] = [:]
    @State private var subscriptions: JSONValue?
    @State private var channels: JSONValue?
    @State private var monitors: JSONValue?
    @State private var showsProfile = false
    @State private var showsPassword = false
    @State private var showsRedeem = false
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 12) {
                        Image(systemName: "person.crop.circle.fill").font(.largeTitle).foregroundStyle(AppPalette.teal)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(profile.text("username", "display_name", "email") ?? "我的账户").font(.title3.bold())
                            Text(profile.text("email") ?? "--").font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        if profile.text("role") == "admin" { StatusPill(text: "管理员", color: AppPalette.purple) }
                    }
                    HStack { accountMetric("余额", NumberFormatters.currency(profile.number("balance")), "creditcard", .green); accountMetric("并发", "\(Int(profile.number("current_concurrency") ?? 0))/\(Int(profile.number("concurrency") ?? 0))", "bolt.horizontal", AppPalette.blue); accountMetric("加入时间", shortDate(profile.text("created_at")), "calendar", AppPalette.orange) }
                    HStack { Button("编辑资料") { showsProfile = true }.buttonStyle(.borderedProminent); Button("修改密码") { showsPassword = true }.buttonStyle(.bordered); Button("兑换") { showsRedeem = true }.buttonStyle(.bordered) }
                }.padding(16).glassPanel()

                NavigationLink { APIKeysView() } label: { personalLink("API 密钥", "创建、额度、限流、期限与使用配置", "key.fill", AppPalette.blue) }.buttonStyle(.plain)
                personalSection("我的订阅", symbol: "creditcard", color: .indigo, value: subscriptions)
                personalSection("渠道状态", symbol: "point.3.connected.trianglepath.dotted", color: .cyan, value: channels)
                personalSection("渠道监控", symbol: "waveform.path.ecg.rectangle", color: AppPalette.purple, value: monitors)
                if isLoading { LoadingView(label: "正在加载个人中心") }
                if let errorMessage { InlineErrorView(message: errorMessage) }
            }.padding(16)
        }
        .navigationTitle("我的账户")
        .sheet(isPresented: $showsProfile, onDismiss: { Task { await load() } }) { ProfileEditorView(profile: profile) }
        .sheet(isPresented: $showsPassword) { PasswordEditorView() }
        .sheet(isPresented: $showsRedeem, onDismiss: { Task { await load() } }) { RedeemCodeView() }
        .refreshable { await load() }
        .appPage().task { await load() }
    }

    private func accountMetric(_ label: String, _ value: String, _ symbol: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 5) { Image(systemName: symbol).foregroundStyle(color); Text(value).font(.subheadline.bold()).lineLimit(1).minimumScaleFactor(0.7); Text(label).font(.caption2).foregroundStyle(.secondary) }.frame(maxWidth: .infinity, alignment: .leading).padding(9).background(.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 10))
    }
    private func personalLink(_ title: String, _ subtitle: String, _ symbol: String, _ color: Color) -> some View { HStack(spacing: 12) { Image(systemName: symbol).foregroundStyle(color).frame(width: 38, height: 38).background(color.opacity(0.1), in: RoundedRectangle(cornerRadius: 11)); VStack(alignment: .leading, spacing: 3) { Text(title).font(.headline); Text(subtitle).font(.caption).foregroundStyle(.secondary) }; Spacer(); Image(systemName: "chevron.right").foregroundStyle(.tertiary) }.padding(14).glassPanel(cornerRadius: 18, interactive: true) }
    @ViewBuilder private func personalSection(_ title: String, symbol: String, color: Color, value: JSONValue?) -> some View {
        VStack(alignment: .leading, spacing: 10) { Label(title, systemImage: symbol).font(.headline).foregroundStyle(color); let rows = personalRows(value); if rows.isEmpty { Text("暂无数据").font(.caption).foregroundStyle(.secondary) }; ForEach(rows) { row in HStack { VStack(alignment: .leading, spacing: 3) { Text(row.text("name", "title", "group_name", "platform") ?? "#\(row.id)").font(.subheadline.weight(.semibold)); Text(row.text("description", "status", "expires_at", "updated_at") ?? "").font(.caption).foregroundStyle(.secondary) }; Spacer(); if let status = row.text("status") { StatusPill(text: status, color: status == "active" ? .green : .secondary) } }; Divider() } }.padding(14).glassPanel()
    }
    private func personalRows(_ value: JSONValue?) -> [DynamicRecord] { guard let value else { return [] }; if let array = value.arrayValue { return array.enumerated().map { DynamicRecord(value: $0.element, index: $0.offset) } }; if let object = value.objectValue { for key in ["items", "subscriptions", "channels", "monitors", "data"] { if let array = object[key]?.arrayValue { return array.enumerated().map { DynamicRecord(value: $0.element, index: $0.offset) } } } }; return [] }
    private func shortDate(_ value: String?) -> String { value.map { String($0.replacingOccurrences(of: "T", with: " ").prefix(10)) } ?? "--" }
    private func load() async { guard let service = try? store.adminService() else { return }; isLoading = true; errorMessage = nil; async let nextProfile: JSONValue? = try? await service.dynamicGet("/api/v1/user/profile"); async let nextSubscriptions: JSONValue? = try? await service.dynamicGet("/api/v1/subscriptions"); async let nextChannels: JSONValue? = try? await service.dynamicGet("/api/v1/channels/available"); async let nextMonitors: JSONValue? = try? await service.dynamicGet("/api/v1/channel-monitors"); let result = await (nextProfile, nextSubscriptions, nextChannels, nextMonitors); profile = result.0?.objectValue ?? [:]; subscriptions = result.1; channels = result.2; monitors = result.3; if profile.isEmpty { errorMessage = "个人中心需要网页登录 JWT；Admin API Key 只能访问管理员接口。" }; isLoading = false }
}

private struct ProfileEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    let profile: [String: JSONValue]
    @State private var username: String
    @State private var avatarURL: String
    @State private var notifyEnabled: Bool
    @State private var notifyThreshold: String
    @State private var isSaving = false
    @State private var errorMessage: String?
    init(profile: [String: JSONValue]) { self.profile = profile; _username = State(initialValue: profile.text("username") ?? ""); _avatarURL = State(initialValue: profile.text("avatar_url", "avatarUrl") ?? ""); _notifyEnabled = State(initialValue: profile.flag("balance_notify_enabled", "balanceNotifyEnabled") ?? false); _notifyThreshold = State(initialValue: profile.number("balance_notify_threshold", "balanceNotifyThreshold").map { String($0) } ?? "") }
    var body: some View { NavigationStack { Form { Section("基本资料") { TextField("用户名", text: $username); TextField("头像 URL", text: $avatarURL).textInputAutocapitalization(.never) }; Section("余额提醒") { Toggle("启用余额提醒", isOn: $notifyEnabled); TextField("提醒阈值", text: $notifyThreshold).keyboardType(.decimalPad) }; if let errorMessage { Section { Text(errorMessage).foregroundStyle(.red) } } }.navigationTitle("编辑资料").navigationBarTitleDisplayMode(.inline).toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }; ToolbarItem(placement: .confirmationAction) { Button(isSaving ? "保存中" : "保存") { save() }.disabled(username.nilIfBlank == nil || isSaving) } } } }
    private func save() { guard let service = try? store.adminService() else { return }; isSaving = true; Task { do { var body: [String: JSONValue] = ["username": .string(username), "avatar_url": .string(avatarURL), "balance_notify_enabled": .bool(notifyEnabled)]; if let threshold = Double(notifyThreshold) { body["balance_notify_threshold"] = .number(threshold) }; _ = try await service.dynamicUpdate("/api/v1/user", body: body); dismiss() } catch { errorMessage = error.localizedDescription }; isSaving = false } }
}

private struct PasswordEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    @State private var oldPassword = ""
    @State private var newPassword = ""
    @State private var confirmation = ""
    @State private var errorMessage: String?
    var body: some View { NavigationStack { Form { SecureField("当前密码", text: $oldPassword); SecureField("新密码", text: $newPassword); SecureField("确认新密码", text: $confirmation); if let errorMessage { Text(errorMessage).foregroundStyle(.red) } }.navigationTitle("修改密码").toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }; ToolbarItem(placement: .confirmationAction) { Button("修改") { save() }.disabled(newPassword.count < 8 || newPassword != confirmation) } } } }
    private func save() { guard let service = try? store.adminService() else { return }; Task { do { _ = try await service.dynamicUpdate("/api/v1/user/password", body: ["old_password": .string(oldPassword), "new_password": .string(newPassword)]); dismiss() } catch { errorMessage = error.localizedDescription } } }
}

private struct RedeemCodeView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    @State private var code = ""
    @State private var errorMessage: String?
    var body: some View { NavigationStack { Form { TextField("兑换码", text: $code).textInputAutocapitalization(.characters); if let errorMessage { Text(errorMessage).foregroundStyle(.red) } }.navigationTitle("兑换").toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }; ToolbarItem(placement: .confirmationAction) { Button("兑换") { redeem() }.disabled(code.nilIfBlank == nil) } } } }
    private func redeem() { guard let service = try? store.adminService() else { return }; Task { do { _ = try await service.dynamicCreate("/api/v1/redeem", body: ["code": .string(code)]); dismiss() } catch { errorMessage = error.localizedDescription } } }
}
