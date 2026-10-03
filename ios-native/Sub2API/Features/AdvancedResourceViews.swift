import SwiftUI

struct AccountAdvancedView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    let account: AdminAccount
    @State private var results: [String: JSONValue] = [:]
    @State private var message: String?
    @State private var editor: AdvancedActionState?
    @State private var isLoading = true

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 125), spacing: 8)], spacing: 8) {
                        action("复制账号", "doc.on.doc") { await run("duplicate") }
                        action("上游计费探测", "dollarsign.arrow.circlepath") { await run("upstream-billing-probe") }
                        action("定时测试计划", "calendar.badge.clock", get: true) { await run("scheduled-test-plans", get: true) }
                        action("临时暂停状态", "timer", get: true) { await run("temp-unschedulable", get: true) }
                        if account.platform == "openai" {
                            action("刷新配额", "arrow.clockwise") { await platformAction("/api/v1/admin/openai/accounts/\(account.id)/quota/refresh") }
                            action("邀请推荐", "person.badge.plus") { await platformAction("/api/v1/admin/openai/accounts/\(account.id)/referrals/invite") }
                            action("刷新推荐", "person.2.circle") { await platformAction("/api/v1/admin/openai/accounts/\(account.id)/referrals/refresh") }
                        }
                        if account.platform == "anthropic" {
                            action("查询 Claude Credits", "creditcard", get: true) { await run("claude/reset-credits", get: true) }
                            Button { editor = AdvancedActionState(title: "兑换 Claude Credits", path: "/api/v1/admin/accounts/\(account.id)/claude/reset-credits/redeem", method: .post, template: ["code": .string("")]) } label: { advancedLabel("兑换 Credits", "giftcard") }.buttonStyle(.bordered)
                        }
                        if account.platform == "grok" { action("媒体资格", "photo.badge.checkmark", get: true) { await run("grok-media-eligibility", get: true) } }
                        action("Ollama Cloud 用量", "cloud", get: true) { await run("ollama-cloud-usage", get: true) }
                        action("OpenCode 用量", "terminal", get: true) { await run("opencode-go-usage", get: true) }
                    }
                    if isLoading { LoadingView() }
                    if let message { Text(message).font(.footnote).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading).padding(12).glassPanel(cornerRadius: 14) }
                    ForEach(results.keys.sorted(), id: \.self) { key in VStack(alignment: .leading, spacing: 9) { Text(key).font(.headline); DynamicJSONView(value: results[key] ?? .null) }.padding(16).glassPanel() }
                }.padding(16)
            }
            .navigationTitle("\(account.name) · 高级")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("完成") { dismiss() } } }
            .sheet(item: $editor) { AdvancedJSONActionEditor(state: $0) }
            .appPage().task { await load() }
        }
    }

    private func action(_ title: String, _ symbol: String, get: Bool = false, operation: @escaping () async -> Void) -> some View { Button { Task { await operation() } } label: { advancedLabel(title, symbol) }.buttonStyle(.bordered) }
    private func advancedLabel(_ title: String, _ symbol: String) -> some View { VStack(spacing: 6) { Image(systemName: symbol).font(.title3); Text(title).font(.caption.weight(.semibold)).multilineTextAlignment(.center) }.frame(maxWidth: .infinity, minHeight: 58) }
    private func load() async { guard let service = try? store.adminService() else { return }; isLoading = true; async let plans: JSONValue? = try? await service.dynamicGet("/api/v1/admin/accounts/\(account.id)/scheduled-test-plans"); async let temporary: JSONValue? = try? await service.dynamicGet("/api/v1/admin/accounts/\(account.id)/temp-unschedulable"); let values = await (plans, temporary); if let value = values.0 { results["定时测试计划"] = value }; if let value = values.1 { results["临时暂停状态"] = value }; isLoading = false }
    private func run(_ suffix: String, get: Bool = false) async { guard let service = try? store.adminService() else { return }; let path = "/api/v1/admin/accounts/\(account.id)/\(suffix)"; do { let value: JSONValue = get ? try await service.dynamicGet(path) : try await service.dynamicCreate(path, body: [:]); results[suffix] = value } catch { message = error.localizedDescription } }
    private func platformAction(_ path: String) async { guard let service = try? store.adminService() else { return }; do { let value = try await service.dynamicCreate(path, body: [:]); results[path.components(separatedBy: "/").last ?? path] = value } catch { message = error.localizedDescription } }
}

struct GroupAdvancedView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    let group: AdminGroup
    @State private var data: [String: JSONValue] = [:]
    @State private var message: String?
    @State private var editor: AdvancedActionState?
    @State private var isLoading = true

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 125), spacing: 8)], spacing: 8) {
                        Button { editor = AdvancedActionState(title: "复制分组", path: "/api/v1/admin/groups/\(group.id)/duplicate", method: .post, template: ["name": .string("\(group.name) Copy"), "copy_accounts": .bool(true)]) } label: { label("复制分组", "doc.on.doc") }.buttonStyle(.bordered)
                        Button { editor = AdvancedActionState(title: "新增复合路由", path: "/api/v1/admin/groups/\(group.id)/composite-routes", method: .post, template: ["public_model": .string(""), "target_platform": .string(""), "upstream_model": .string(""), "match_type": .string("exact"), "priority": .number(0), "enabled": .bool(true)]) } label: { label("新增复合路由", "point.3.connected.trianglepath.dotted") }.buttonStyle(.bordered)
                        Button { editor = AdvancedActionState(title: "批量用户倍率", path: "/api/v1/admin/groups/\(group.id)/rate-multipliers", method: .put, template: ["entries": .array([])]) } label: { label("用户倍率", "multiply.circle") }.buttonStyle(.bordered)
                        Button { editor = AdvancedActionState(title: "批量 RPM 覆盖", path: "/api/v1/admin/groups/\(group.id)/rpm-overrides", method: .put, template: ["entries": .array([])]) } label: { label("RPM 覆盖", "speedometer") }.buttonStyle(.bordered)
                        Button(role: .destructive) { Task { await clear("rate-multipliers") } } label: { label("清空用户倍率", "trash") }.buttonStyle(.bordered)
                        Button(role: .destructive) { Task { await clear("rpm-overrides") } } label: { label("清空 RPM 覆盖", "trash") }.buttonStyle(.bordered)
                    }
                    if isLoading { LoadingView() }
                    if let message { Text(message).font(.footnote).foregroundStyle(.secondary).padding(12).frame(maxWidth: .infinity, alignment: .leading).glassPanel(cornerRadius: 14) }
                    ForEach(data.keys.sorted(), id: \.self) { key in VStack(alignment: .leading, spacing: 9) { Text(key).font(.headline); DynamicJSONView(value: data[key] ?? .null) }.padding(16).glassPanel() }
                }.padding(16)
            }
            .navigationTitle("\(group.name) · 高级")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("完成") { dismiss() } } }
            .sheet(item: $editor, onDismiss: { Task { await load() } }) { AdvancedJSONActionEditor(state: $0) }
            .appPage().task { await load() }
        }
    }

    private func label(_ title: String, _ symbol: String) -> some View { VStack(spacing: 6) { Image(systemName: symbol).font(.title3); Text(title).font(.caption.weight(.semibold)).multilineTextAlignment(.center) }.frame(maxWidth: .infinity, minHeight: 58) }
    private func load() async { guard let service = try? store.adminService() else { return }; isLoading = true; let base = "/api/v1/admin/groups/\(group.id)"; async let stats: JSONValue? = try? await service.dynamicGet("\(base)/stats"); async let keys: JSONValue? = try? await service.dynamicGet("\(base)/api-keys", query: ["page": "1", "page_size": "100"]); async let rates: JSONValue? = try? await service.dynamicGet("\(base)/rate-multipliers"); async let rpm: JSONValue? = try? await service.dynamicGet("\(base)/rpm-overrides"); async let routes: JSONValue? = try? await service.dynamicGet("\(base)/composite-routes"); async let models: JSONValue? = try? await service.dynamicGet("\(base)/model-allowlist-candidates", query: ["platform": group.platform]); let values = await (stats, keys, rates, rpm, routes, models); if let v = values.0 { data["统计"] = v }; if let v = values.1 { data["API Keys"] = v }; if let v = values.2 { data["用户倍率"] = v }; if let v = values.3 { data["RPM 覆盖"] = v }; if let v = values.4 { data["复合路由"] = v }; if let v = values.5 { data["模型允许列表候选"] = v }; isLoading = false }
    private func clear(_ suffix: String) async { guard let service = try? store.adminService() else { return }; do { try await service.dynamicDelete("/api/v1/admin/groups/\(group.id)/\(suffix)"); message = "已清空"; await load() } catch { message = error.localizedDescription } }
}

struct UserAdvancedView: View {
    @EnvironmentObject private var store: AppStore
    let user: AdminUser
    @State private var data: [String: JSONValue] = [:]
    @State private var editor: AdvancedActionState?
    @State private var message: String?
    @State private var confirmsDelete = false
    @State private var isLoading = true

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 125), spacing: 8)], spacing: 8) {
                    Button { editor = AdvancedActionState(title: "替换分组", path: "/api/v1/admin/users/\(user.id)/replace-group", method: .post, template: ["group_id": .number(0)]) } label: { label("替换分组", "folder") }.buttonStyle(.bordered)
                    Button { editor = AdvancedActionState(title: "绑定认证身份", path: "/api/v1/admin/users/\(user.id)/auth-identities", method: .post, template: ["provider": .string(""), "provider_user_id": .string("")]) } label: { label("绑定身份", "person.badge.key") }.buttonStyle(.bordered)
                    Button { editor = AdvancedActionState(title: "更新平台配额", path: "/api/v1/admin/users/\(user.id)/platform-quotas", method: .put, template: ["platform": .string("openai"), "quota": .number(0)]) } label: { label("平台配额", "gauge") }.buttonStyle(.bordered)
                    Button(role: .destructive) { Task { await resetQuotas() } } label: { label("重置配额窗口", "arrow.counterclockwise") }.buttonStyle(.bordered)
                    Button(role: .destructive) { confirmsDelete = true } label: { label("删除用户", "trash") }.buttonStyle(.bordered)
                }
                if isLoading { LoadingView() }
                if let message { Text(message).font(.footnote).foregroundStyle(.secondary).padding(12).frame(maxWidth: .infinity, alignment: .leading).glassPanel(cornerRadius: 14) }
                ForEach(data.keys.sorted(), id: \.self) { key in VStack(alignment: .leading, spacing: 9) { Text(key).font(.headline); DynamicJSONView(value: data[key] ?? .null) }.padding(16).glassPanel() }
            }.padding(16)
        }
        .navigationTitle("用户高级管理")
        .sheet(item: $editor, onDismiss: { Task { await load() } }) { AdvancedJSONActionEditor(state: $0) }
        .confirmationDialog("删除用户？", isPresented: $confirmsDelete, titleVisibility: .visible) { Button("删除", role: .destructive) { Task { await deleteUser() } } } message: { Text("将删除 \(user.email)，该操作可能无法恢复。") }
        .appPage().task { await load() }
    }

    private func label(_ title: String, _ symbol: String) -> some View { VStack(spacing: 6) { Image(systemName: symbol).font(.title3); Text(title).font(.caption.weight(.semibold)).multilineTextAlignment(.center) }.frame(maxWidth: .infinity, minHeight: 58) }
    private func load() async { guard let service = try? store.adminService() else { return }; isLoading = true; let base = "/api/v1/admin/users/\(user.id)"; async let balance: JSONValue? = try? await service.dynamicGet("\(base)/balance-history", query: ["page": "1", "page_size": "100"]); async let subscriptions: JSONValue? = try? await service.dynamicGet("\(base)/subscriptions"); async let attributes: JSONValue? = try? await service.dynamicGet("\(base)/attributes"); async let identities: JSONValue? = try? await service.dynamicGet("\(base)/auth-identities"); async let quotas: JSONValue? = try? await service.dynamicGet("\(base)/platform-quotas"); let values = await (balance, subscriptions, attributes, identities, quotas); if let v = values.0 { data["余额历史"] = v }; if let v = values.1 { data["订阅"] = v }; if let v = values.2 { data["用户属性"] = v }; if let v = values.3 { data["认证身份"] = v }; if let v = values.4 { data["平台配额"] = v }; isLoading = false }
    private func resetQuotas() async { guard let service = try? store.adminService() else { return }; do { try await service.dynamicAction("/api/v1/admin/users/\(user.id)/platform-quotas/reset"); message = "平台配额窗口已重置"; await load() } catch { message = error.localizedDescription } }
    private func deleteUser() async { guard let service = try? store.adminService() else { return }; do { try await service.dynamicDelete("/api/v1/admin/users/\(user.id)"); message = "用户已删除" } catch { message = error.localizedDescription } }
}

struct AdvancedActionState: Identifiable {
    let id = UUID(); let title: String; let path: String; let method: HTTPMethod; let template: [String: JSONValue]
}

struct AdvancedJSONActionEditor: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    let state: AdvancedActionState
    @State private var json = ""; @State private var errorMessage: String?; @State private var isSaving = false
    var body: some View { NavigationStack { VStack(spacing: 10) { TextEditor(text: $json).font(.body.monospaced()).autocorrectionDisabled().textInputAutocapitalization(.never).padding(8).background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 12)); if let errorMessage { Text(errorMessage).font(.footnote).foregroundStyle(.red).frame(maxWidth: .infinity, alignment: .leading) } }.padding().navigationTitle(state.title).navigationBarTitleDisplayMode(.inline).toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }; ToolbarItem(placement: .confirmationAction) { Button(isSaving ? "执行中" : "执行") { execute() }.disabled(isSaving) } }.onAppear { json = String(data: (try? FormParsing.jsonData(.object(state.template))) ?? Data("{}".utf8), encoding: .utf8) ?? "{}" } } }
    private func execute() { guard let service = try? store.adminService() else { return }; isSaving = true; Task { do { let body = try FormParsing.jsonObject(json); if state.method == .put { _ = try await service.dynamicUpdate(state.path, body: body) } else { _ = try await service.dynamicCreate(state.path, body: body) }; dismiss() } catch { errorMessage = error.localizedDescription }; isSaving = false } }
}
