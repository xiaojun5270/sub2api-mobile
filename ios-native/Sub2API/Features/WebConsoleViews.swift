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
        case .proxies: ["name": .string(""), "proxy_url": .string("http://user:pass@host:port"), "status": .string("active")]
        case .redeemCodes: ["count": .number(1), "type": .string("balance"), "value": .number(0), "expires_in_days": .number(30)]
        case .promoCodes: ["code": .string(""), "discount_type": .string("percentage"), "discount_value": .number(0), "status": .string("active")]
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
        .toolbar { ToolbarItemGroup(placement: .primaryAction) { if module == .auditLogs { Button(role: .destructive) { clearsAudit = true } label: { Image(systemName: "trash") } }; if module.canCreate { Button { editor = ConsoleEditorState(title: "创建\(module.title)", path: module.createPath, method: .post, object: module.createTemplate) } label: { Image(systemName: "plus") } } } }
        .sheet(item: $editor, onDismiss: { Task { await load() } }) { ConsoleJSONEditor(state: $0) }
        .sheet(item: $detail) { ConsoleDetailView(state: $0) }
        .confirmationDialog("确认删除？", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) { Button("删除", role: .destructive) { if let deleting { Task { await delete(deleting) } } } }
        .alert("清理操作日志", isPresented: $clearsAudit) { SecureField("TOTP 验证码", text: Binding(get: { auditCode }, set: { auditCode = $0 })); Button("取消", role: .cancel) {}; Button("清理", role: .destructive) { Task { await clearAudit() } } } message: { Text("此操作需要管理员 TOTP 验证码。") }
        .appPage().task(id: "\(store.activeServerID?.uuidString ?? "")-\(module.rawValue)") { await load() }
    }

    @State private var auditCode = ""

    @ViewBuilder private func recordMenu(_ record: DynamicRecord) -> some View {
        Button { showDetail(record) } label: { Label("详情", systemImage: "info.circle") }
        if module.canEdit { Button { editor = ConsoleEditorState(title: "编辑\(module.title)", path: "\(module.path)/\(record.id)", method: .put, object: record.object) } label: { Label("编辑", systemImage: "pencil") } }
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
private struct ConsoleDetailState: Identifiable { let id = UUID(); let title: String; let value: JSONValue }

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

struct SystemSettingsView: View {
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
