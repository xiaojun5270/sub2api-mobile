import SwiftUI

struct GroupsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var groups: [AdminGroup] = []
    @State private var usage: [Int: GroupUsageSummary] = [:]
    @State private var capacity: [Int: GroupCapacitySummary] = [:]
    @State private var searchText = ""
    @State private var platform = "all"
    @State private var status = "all"
    @State private var exclusive = "all"
    @State private var ascending = true
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var message: String?
    @State private var editingGroup: AdminGroup?
    @State private var showsCreate = false
    @State private var deletingGroup: AdminGroup?
    @State private var advancedGroup: AdminGroup?

    private var filtered: [AdminGroup] {
        groups.filter { group in
            (searchText.isEmpty || group.name.localizedCaseInsensitiveContains(searchText)) &&
            (platform == "all" || group.platform == platform) &&
            (status == "all" || (status == "active" ? !inactive(group) : inactive(group))) &&
            (exclusive == "all" || (exclusive == "exclusive") == (group.isExclusive == true))
        }.sorted { ascending ? ($0.sortOrder ?? 0) < ($1.sortOrder ?? 0) : ($0.sortOrder ?? 0) > ($1.sortOrder ?? 0) }
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                HStack(spacing: 8) {
                    MetricTile(label: "分组", value: "\(groups.count)", symbol: "folder", tint: .cyan)
                    MetricTile(label: "启用", value: "\(groups.filter { !inactive($0) }.count)", symbol: "checkmark.shield", tint: .green)
                    MetricTile(label: "停用", value: "\(groups.filter(inactive).count)", symbol: "shield.slash", tint: .secondary)
                }
                filterBar
                if let message { Text(message).font(.footnote).foregroundStyle(.secondary).padding(12).frame(maxWidth: .infinity, alignment: .leading).glassPanel(cornerRadius: 14) }
                if isLoading && groups.isEmpty { LoadingView(label: "正在加载分组") }
                else if let errorMessage, groups.isEmpty { InlineErrorView(message: errorMessage) { Task { await load() } } }
                else if filtered.isEmpty { EmptyContentView(symbol: "folder.badge.questionmark", title: "暂无分组", message: "当前筛选条件下没有分组。") }
                else {
                    ForEach(filtered) { group in
                        GroupCard(
                            group: group,
                            usage: usage[group.id],
                            capacity: capacity[group.id],
                            isInactive: inactive(group),
                            onEdit: { editingGroup = group },
                            onAdvanced: { advancedGroup = group },
                            onToggle: { Task { await toggle(group) } },
                            onDelete: { deletingGroup = group }
                        )
                        .contextMenu {
                            Button { editingGroup = group } label: { Label("编辑", systemImage: "pencil") }
                            Button { advancedGroup = group } label: { Label("高级管理", systemImage: "wrench.and.screwdriver") }
                            Button { Task { await toggle(group) } } label: { Label(inactive(group) ? "启用" : "停用", systemImage: "power") }
                            Divider()
                            Button(role: .destructive) { deletingGroup = group } label: { Label("删除", systemImage: "trash") }
                        }
                    }
                }
            }.padding(16)
        }
        .searchable(text: $searchText, prompt: "搜索分组名称")
        .refreshable { await load() }
        .navigationTitle("分组管理")
        .toolbar { ToolbarItemGroup(placement: .primaryAction) { Button { ascending.toggle() } label: { Image(systemName: ascending ? "arrow.up" : "arrow.down") }; Button { showsCreate = true } label: { Image(systemName: "plus") } } }
        .sheet(isPresented: $showsCreate, onDismiss: { Task { await load() } }) { GroupEditorView(group: nil) }
        .sheet(item: $editingGroup, onDismiss: { Task { await load() } }) { GroupEditorView(group: $0) }
        .sheet(item: $advancedGroup, onDismiss: { Task { await load() } }) { GroupAdvancedView(group: $0) }
        .confirmationDialog("删除分组？", isPresented: Binding(get: { deletingGroup != nil }, set: { if !$0 { deletingGroup = nil } }), titleVisibility: .visible) { Button("删除", role: .destructive) { if let group = deletingGroup { Task { await delete(group) } } } } message: { Text("删除后，关联账号和 API Key 可能失去分组归属。") }
        .appPage().task(id: store.activeServerID) { await load() }
    }

    private var filterBar: some View { ScrollView(.horizontal) { HStack(spacing: 8) {
        Menu { ForEach(["all", "anthropic", "openai", "gemini", "antigravity", "grok", "kimi", "zhipu", "deepseek", "minimax", "opencode_go", "typesafe", "composite"], id: \.self) { item in Button(item == "all" ? "全部平台" : item) { platform = item } } } label: { filterLabel(platform == "all" ? "全部平台" : platform, platform != "all") }
        Menu { Button("全部状态") { status = "all" }; Button("启用") { status = "active" }; Button("停用") { status = "inactive" } } label: { filterLabel(status == "all" ? "全部状态" : status == "active" ? "启用" : "停用", status != "all") }
        Menu { Button("全部类型") { exclusive = "all" }; Button("共享") { exclusive = "public" }; Button("独占") { exclusive = "exclusive" } } label: { filterLabel(exclusive == "all" ? "全部类型" : exclusive == "public" ? "共享" : "独占", exclusive != "all") }
    } }.scrollIndicators(.hidden) }
    private func filterLabel(_ value: String, _ selected: Bool) -> some View { HStack { Text(value); Image(systemName: "chevron.down").font(.caption2) }.font(.caption.weight(.semibold)).foregroundStyle(selected ? .white : .primary).padding(.horizontal, 11).padding(.vertical, 8).background(selected ? Color.cyan : Color.primary.opacity(0.06), in: Capsule()) }
    private func inactive(_ group: AdminGroup) -> Bool { ["inactive", "disabled"].contains((group.status ?? "active").lowercased()) }
    private func load() async { guard let service = try? store.adminService() else { return }; isLoading = true; do { async let nextGroups = service.groups(); async let nextUsage = service.groupUsage(); async let nextCapacity = service.groupCapacity(); let result = try await (nextGroups, nextUsage, nextCapacity); groups = result.0.items; usage = Dictionary(uniqueKeysWithValues: result.1.map { ($0.groupID, $0) }); capacity = Dictionary(uniqueKeysWithValues: result.2.map { ($0.groupID, $0) }); errorMessage = nil } catch { errorMessage = error.localizedDescription }; isLoading = false }
    private func toggle(_ group: AdminGroup) async { guard let service = try? store.adminService() else { return }; do { _ = try await service.updateGroup(group.id, body: ["status": .string(inactive(group) ? "active" : "inactive")]); await load() } catch { message = error.localizedDescription } }
    private func delete(_ group: AdminGroup) async { guard let service = try? store.adminService() else { return }; deletingGroup = nil; do { try await service.deleteGroup(group.id); await load() } catch { message = error.localizedDescription } }
}

private struct GroupCard: View {
    let group: AdminGroup
    let usage: GroupUsageSummary?
    let capacity: GroupCapacitySummary?
    let isInactive: Bool
    let onEdit: () -> Void
    let onAdvanced: () -> Void
    let onToggle: () -> Void
    let onDelete: () -> Void

    var body: some View { VStack(alignment: .leading, spacing: 12) {
        HStack { Image(systemName: group.isExclusive == true ? "lock.folder.fill" : "folder.fill").foregroundStyle(.cyan); VStack(alignment: .leading, spacing: 3) { Text(group.name).font(.subheadline.bold()); Text("\(group.platform) · \(group.subscriptionType ?? "standard") · \(group.isExclusive == true ? "独占" : "共享")").font(.caption).foregroundStyle(.secondary) }; Spacer(); let style = StatusStyle.generic(group.status); StatusPill(text: style.0, color: style.1) }
        HStack(spacing: 8) { small("账号", "\(group.activeAccountCount ?? group.accountCount ?? 0)"); small("今日", NumberFormatters.currency(usage?.todayCost)); small("累计", NumberFormatters.currency(usage?.totalCost)); small("倍率", String(format: "%.2fx", group.rateMultiplier ?? 1)) }
        if let capacity { VStack(spacing: 5) { capacityBar("并发", capacity.concurrencyUsed, capacity.concurrencyMax, .cyan); capacityBar("RPM", capacity.rpmUsed, capacity.rpmMax, AppPalette.blue) } }
        if let description = group.description, !description.isEmpty { Text(description).font(.caption).foregroundStyle(.secondary).lineLimit(2) }
        Divider()
        HStack(spacing: 8) {
            Button(action: onEdit) { Label("编辑", systemImage: "pencil") }
                .buttonStyle(.borderedProminent)
                .tint(AppPalette.blue)
            Button(action: onAdvanced) { Label("高级", systemImage: "wrench.and.screwdriver") }
                .buttonStyle(.bordered)
            Spacer(minLength: 0)
            Button(action: onToggle) { Image(systemName: "power") }
                .buttonStyle(.bordered)
                .tint(isInactive ? .green : AppPalette.orange)
                .accessibilityLabel(isInactive ? "启用分组" : "停用分组")
            Button(role: .destructive, action: onDelete) { Image(systemName: "trash") }
                .buttonStyle(.bordered)
                .accessibilityLabel("删除分组")
        }
        .controlSize(.small)
    }.padding(14).glassPanel(cornerRadius: 18) }
    private func small(_ label: String, _ value: String) -> some View { VStack(alignment: .leading, spacing: 3) { Text(label).font(.caption2).foregroundStyle(.secondary); Text(value).font(.caption.weight(.bold)).lineLimit(1).minimumScaleFactor(0.7) }.frame(maxWidth: .infinity, alignment: .leading) }
    private func capacityBar(_ label: String, _ used: Double?, _ max: Double?, _ color: Color) -> some View { HStack { Text(label).font(.caption2).frame(width: 34, alignment: .leading); ProgressView(value: (max ?? 0) > 0 ? (used ?? 0) / (max ?? 1) : 0).tint(color); Text("\(NumberFormatters.compact(used))/\(NumberFormatters.compact(max))").font(.caption2.monospacedDigit()).foregroundStyle(.secondary) } }
}

private struct GroupEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    let group: AdminGroup?
    @State private var name: String; @State private var description: String; @State private var platform: String; @State private var rate: String; @State private var status: String; @State private var subscription: String
    @State private var daily: String; @State private var weekly: String; @State private var monthly: String; @State private var rpm: String
    @State private var imageRate: String; @State private var peakStart: String; @State private var peakEnd: String; @State private var peakRate: String; @State private var fallback: String; @State private var invalidFallback: String; @State private var scopes: String
    @State private var exclusive: Bool; @State private var allowImage: Bool; @State private var imageIndependent: Bool; @State private var peakEnabled: Bool; @State private var claudeOnly: Bool; @State private var allowMessages: Bool; @State private var oauthOnly: Bool; @State private var privacyRequired: Bool; @State private var modelRouting: Bool; @State private var mcpXML: Bool
    @State private var errorMessage: String?; @State private var isSaving = false
    @State private var advancedJSON = ""

    init(group: AdminGroup?) { self.group = group; _name = State(initialValue: group?.name ?? ""); _description = State(initialValue: group?.description ?? ""); _platform = State(initialValue: group?.platform ?? "anthropic"); _rate = State(initialValue: group?.rateMultiplier.map { String($0) } ?? "1"); _status = State(initialValue: group?.status ?? "active"); _subscription = State(initialValue: group?.subscriptionType ?? "standard"); _daily = State(initialValue: group?.dailyLimitUSD.map { String($0) } ?? ""); _weekly = State(initialValue: group?.weeklyLimitUSD.map { String($0) } ?? ""); _monthly = State(initialValue: group?.monthlyLimitUSD.map { String($0) } ?? ""); _rpm = State(initialValue: group?.rpmLimit.map { String($0) } ?? "0"); _imageRate = State(initialValue: group?.imageRateMultiplier.map { String($0) } ?? "1"); _peakStart = State(initialValue: group?.peakStart ?? ""); _peakEnd = State(initialValue: group?.peakEnd ?? ""); _peakRate = State(initialValue: group?.peakRateMultiplier.map { String($0) } ?? "1"); _fallback = State(initialValue: group?.fallbackGroupID.map { String($0) } ?? ""); _invalidFallback = State(initialValue: group?.fallbackInvalidGroupID.map { String($0) } ?? ""); _scopes = State(initialValue: group?.supportedModelScopes?.joined(separator: ",") ?? "claude,gemini_text,gemini_image"); _exclusive = State(initialValue: group?.isExclusive ?? false); _allowImage = State(initialValue: group?.allowImageGeneration ?? false); _imageIndependent = State(initialValue: group?.imageRateIndependent ?? false); _peakEnabled = State(initialValue: group?.peakRateEnabled ?? false); _claudeOnly = State(initialValue: group?.claudeCodeOnly ?? false); _allowMessages = State(initialValue: group?.allowMessagesDispatch ?? false); _oauthOnly = State(initialValue: group?.requireOAuthOnly ?? false); _privacyRequired = State(initialValue: group?.requirePrivacySet ?? false); _modelRouting = State(initialValue: group?.modelRoutingEnabled ?? false); _mcpXML = State(initialValue: group?.mcpXMLInject ?? true) }

    var body: some View { NavigationStack { Form {
        Section("基本信息") { TextField("名称", text: $name); TextField("描述", text: $description, axis: .vertical); Picker("平台", selection: $platform) { ForEach(["anthropic", "openai", "gemini", "antigravity", "grok", "kimi", "zhipu", "deepseek", "minimax", "opencode_go", "typesafe", "composite"], id: \.self) { Text($0).tag($0) } }; Picker("状态", selection: $status) { Text("启用").tag("active"); Text("停用").tag("inactive") }; Picker("订阅类型", selection: $subscription) { Text("标准").tag("standard"); Text("订阅").tag("subscription") }; Toggle("独占分组", isOn: $exclusive) }
        Section("费率与限额") { TextField("费率倍率", text: $rate).keyboardType(.decimalPad); TextField("每日 USD", text: $daily).keyboardType(.decimalPad); TextField("每周 USD", text: $weekly).keyboardType(.decimalPad); TextField("每月 USD", text: $monthly).keyboardType(.decimalPad); TextField("RPM 限制", text: $rpm).keyboardType(.numberPad) }
        Section("图片与峰值") { Toggle("允许图片生成", isOn: $allowImage); Toggle("图片费率独立", isOn: $imageIndependent); TextField("图片倍率", text: $imageRate).keyboardType(.decimalPad); Toggle("启用峰值费率", isOn: $peakEnabled); if peakEnabled { TextField("开始时间", text: $peakStart); TextField("结束时间", text: $peakEnd); TextField("峰值倍率", text: $peakRate).keyboardType(.decimalPad) } }
        Section("路由策略") { TextField("Fallback 分组 ID", text: $fallback).keyboardType(.numberPad); TextField("无效请求 Fallback ID", text: $invalidFallback).keyboardType(.numberPad); TextField("支持模型域，逗号分隔", text: $scopes); Toggle("仅 Claude Code", isOn: $claudeOnly); Toggle("允许 Messages Dispatch", isOn: $allowMessages); Toggle("仅 OAuth", isOn: $oauthOnly); Toggle("要求隐私设置", isOn: $privacyRequired); Toggle("模型路由", isOn: $modelRouting); Toggle("注入 MCP XML", isOn: $mcpXML) }
        Section("网页高级字段 JSON") { TextEditor(text: $advancedJSON).frame(minHeight: 110).font(.caption.monospaced()); Text("模型允许列表、推理强度映射、显式价格和图片批量策略可在此按网页 API 字段提交。").font(.caption).foregroundStyle(.secondary) }
        if let errorMessage { Section { Text(errorMessage).foregroundStyle(.red) } }
    }.navigationTitle(group == nil ? "创建分组" : "编辑分组").navigationBarTitleDisplayMode(.inline).toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }; ToolbarItem(placement: .confirmationAction) { Button(isSaving ? "保存中" : "保存") { save() }.disabled(name.isEmpty || isSaving) } } } }

    private func save() { guard let service = try? store.adminService() else { return }; isSaving = true; Task { do { var body: [String: JSONValue] = ["name": .string(name), "description": description.nilIfBlank.map { JSONValue.string($0) } ?? .null, "platform": .string(platform), "status": .string(status), "subscription_type": .string(subscription), "is_exclusive": .bool(exclusive), "allow_image_generation": .bool(allowImage), "image_rate_independent": .bool(imageIndependent), "peak_rate_enabled": .bool(peakEnabled), "claude_code_only": .bool(claudeOnly), "allow_messages_dispatch": .bool(allowMessages), "require_oauth_only": .bool(oauthOnly), "require_privacy_set": .bool(privacyRequired), "model_routing_enabled": .bool(modelRouting), "mcp_xml_inject": .bool(mcpXML), "supported_model_scopes": .array(scopes.split(separator: ",").map { .string($0.trimmingCharacters(in: .whitespaces)) })]; if let v = try FormParsing.number(rate) { body["rate_multiplier"] = .number(v) }; body["daily_limit_usd"] = try FormParsing.number(daily).map { JSONValue.number($0) } ?? .null; body["weekly_limit_usd"] = try FormParsing.number(weekly).map { JSONValue.number($0) } ?? .null; body["monthly_limit_usd"] = try FormParsing.number(monthly).map { JSONValue.number($0) } ?? .null; if let v = try FormParsing.integer(rpm) { body["rpm_limit"] = .number(Double(v)) }; if let v = try FormParsing.number(imageRate) { body["image_rate_multiplier"] = .number(v) }; body["peak_start"] = .string(peakStart); body["peak_end"] = .string(peakEnd); if let v = try FormParsing.number(peakRate) { body["peak_rate_multiplier"] = .number(v) }; let emptyFallback: JSONValue = group == nil ? .null : .number(0); body["fallback_group_id"] = try FormParsing.integer(fallback).map { .number(Double($0)) } ?? emptyFallback; body["fallback_group_id_on_invalid_request"] = try FormParsing.integer(invalidFallback).map { .number(Double($0)) } ?? emptyFallback; body.merge(try FormParsing.jsonObject(advancedJSON)) { _, new in new }; if let group { _ = try await service.updateGroup(group.id, body: body) } else { body.removeValue(forKey: "status"); _ = try await service.createGroup(body) }; dismiss() } catch { errorMessage = error.localizedDescription }; isSaving = false } }
}
