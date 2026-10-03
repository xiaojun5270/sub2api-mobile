import SwiftUI

struct UsageRecordsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var records: [UsageRecord] = []
    @State private var summary: UsageSummary?
    @State private var tasks: [UsageCleanupTask] = []
    @State private var page = 1
    @State private var total = 0
    @State private var startDate = Calendar.current.date(byAdding: .day, value: -29, to: Date()) ?? Date()
    @State private var endDate = Date()
    @State private var userID = ""; @State private var apiKeyID = ""; @State private var accountID = ""; @State private var groupID = ""; @State private var model = ""; @State private var requestType = ""; @State private var billingType = ""; @State private var billingMode = ""
    @State private var showsFilters = false
    @State private var cleanupConfirmation = false
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var message: String?
    private let pageSize = 20

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                Grid(horizontalSpacing: 9, verticalSpacing: 9) {
                    GridRow { MetricTile(label: "请求数", value: NumberFormatters.compact(summary?.totalRequests ?? summary?.requestCount), symbol: "gauge", tint: AppPalette.blue); MetricTile(label: "Token", value: NumberFormatters.compact(summary?.totalTokens), symbol: "cpu", tint: AppPalette.teal) }
                    GridRow { MetricTile(label: "用户计费", value: NumberFormatters.currency(summary?.totalCost), symbol: "person.crop.circle.badge.dollar", tint: .green); MetricTile(label: "实际成本", value: NumberFormatters.currency(summary?.actualCost ?? summary?.totalActualCost), symbol: "dollarsign.circle", tint: AppPalette.orange) }
                }
                cleanupPanel
                if let message { Text(message).font(.footnote).foregroundStyle(.secondary).padding(12).frame(maxWidth: .infinity, alignment: .leading).glassPanel(cornerRadius: 14) }
                if isLoading && records.isEmpty { LoadingView(label: "正在加载使用记录") }
                else if let errorMessage, records.isEmpty { InlineErrorView(message: errorMessage) { Task { await load() } } }
                else if records.isEmpty { EmptyContentView(symbol: "clock.badge.questionmark", title: "暂无记录", message: "当前查询条件下没有使用记录。") }
                else { ForEach(records) { UsageRecordCard(record: $0) } }
                pagination
            }.padding(16)
        }
        .refreshable { await load() }
        .navigationTitle("使用记录")
        .toolbar { ToolbarItem(placement: .primaryAction) { Button { showsFilters = true } label: { Image(systemName: hasFilters ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle") } } }
        .sheet(isPresented: $showsFilters) { NavigationStack { Form { Section("时间范围") { DatePicker("开始", selection: $startDate, displayedComponents: .date); DatePicker("结束", selection: $endDate, displayedComponents: .date) }; Section("资源 ID") { TextField("用户 ID", text: $userID).keyboardType(.numberPad); TextField("API Key ID", text: $apiKeyID).keyboardType(.numberPad); TextField("账号 ID", text: $accountID).keyboardType(.numberPad); TextField("分组 ID", text: $groupID).keyboardType(.numberPad) }; Section("请求") { TextField("模型", text: $model); TextField("请求类型", text: $requestType); TextField("计费类型", text: $billingType); TextField("计费模式", text: $billingMode) } }.navigationTitle("筛选").toolbar { ToolbarItem(placement: .cancellationAction) { Button("重置") { resetFilters() } }; ToolbarItem(placement: .confirmationAction) { Button("应用") { page = 1; showsFilters = false; Task { await load() } } } } } }
        .confirmationDialog("创建清理任务？", isPresented: $cleanupConfirmation, titleVisibility: .visible) { Button("创建清理", role: .destructive) { Task { await createCleanup() } } } message: { Text("将异步删除当前筛选时间范围内的历史使用记录。") }
        .appPage().task(id: store.activeServerID) { await load() }
    }

    private var hasFilters: Bool { ![userID, apiKeyID, accountID, groupID, model, requestType, billingType, billingMode].allSatisfy(\.isEmpty) }
    private var filters: [String: String] { let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "yyyy-MM-dd"; return ["page": String(page), "page_size": String(pageSize), "start_date": formatter.string(from: startDate), "end_date": formatter.string(from: endDate), "user_id": userID, "api_key_id": apiKeyID, "account_id": accountID, "group_id": groupID, "model": model, "request_type": requestType, "billing_type": billingType, "billing_mode": billingMode] }

    private var cleanupPanel: some View { VStack(alignment: .leading, spacing: 10) { HStack { Label("清理任务", systemImage: "trash").font(.headline).foregroundStyle(.red); Spacer(); Button("创建清理", role: .destructive) { cleanupConfirmation = true }.buttonStyle(.bordered) }; if tasks.isEmpty { Text("暂无清理任务").font(.caption).foregroundStyle(.secondary) }; ForEach(tasks) { task in VStack(alignment: .leading, spacing: 5) { HStack { Text("任务 #\(task.id)").font(.subheadline.bold()); Spacer(); StatusPill(text: task.status ?? "--", color: task.status == "failed" ? .red : .secondary) }; Text("删除 \(task.deletedRows ?? 0) 行 · \(task.createdAt ?? "")").font(.caption).foregroundStyle(.secondary); if let error = task.errorMessage { Text(error).font(.caption).foregroundStyle(.red) }; if ["pending", "running", "queued"].contains(task.status ?? "") { Button("取消任务") { Task { await cancel(task) } }.font(.caption) } }; Divider() } }.padding(16).glassPanel() }

    private var pagination: some View { let pages = max(1, Int(ceil(Double(total) / Double(pageSize)))); return HStack { Button("上一页") { page = max(1, page - 1); Task { await load() } }.disabled(page <= 1); Spacer(); Text("第 \(page) / \(pages) 页，共 \(total) 条").font(.caption).foregroundStyle(.secondary); Spacer(); Button("下一页") { page = min(pages, page + 1); Task { await load() } }.disabled(page >= pages) }.padding(12).glassPanel(cornerRadius: 16) }

    private func load() async { guard let service = try? store.adminService() else { return }; isLoading = true; do { async let nextRecords = service.usageRecords(filters: filters, pageSize: pageSize); async let nextStats = service.usageStats(start: filters["start_date"] ?? "", end: filters["end_date"] ?? "", filters: filters); async let nextTasks = service.cleanupTasks(); let result = try await (nextRecords, nextStats, nextTasks); records = result.0.items; total = result.0.total; summary = result.1; tasks = result.2.items; errorMessage = nil } catch { errorMessage = error.localizedDescription }; isLoading = false }
    private func createCleanup() async { guard let service = try? store.adminService() else { return }; do { var body: [String: JSONValue] = ["start_date": .string(filters["start_date"] ?? ""), "end_date": .string(filters["end_date"] ?? ""), "timezone": .string(TimeZone.current.identifier)]; for key in ["user_id", "api_key_id", "account_id", "group_id"] { if let raw = filters[key], let value = Int(raw) { body[key] = .number(Double(value)) } }; if let value = model.nilIfBlank { body["model"] = .string(value) }; if let value = requestType.nilIfBlank { body["request_type"] = .string(value) }; if let value = billingType.nilIfBlank { body["billing_type"] = .string(value) }; _ = try await service.createCleanupTask(body); message = "清理任务已创建"; await load() } catch { message = error.localizedDescription } }
    private func cancel(_ task: UsageCleanupTask) async { guard let service = try? store.adminService() else { return }; do { _ = try await service.cancelCleanupTask(task.id); await load() } catch { message = error.localizedDescription } }
    private func resetFilters() { userID = ""; apiKeyID = ""; accountID = ""; groupID = ""; model = ""; requestType = ""; billingType = ""; billingMode = ""; startDate = Calendar.current.date(byAdding: .day, value: -29, to: Date()) ?? Date(); endDate = Date() }
}

private struct UsageRecordCard: View {
    let record: UsageRecord
    private var tokens: Double { (record.inputTokens ?? 0) + (record.outputTokens ?? 0) + (record.cacheReadTokens ?? 0) + (record.cacheCreationTokens ?? 0) + (record.imageOutputTokens ?? 0) }
    var body: some View { VStack(alignment: .leading, spacing: 10) {
        HStack { VStack(alignment: .leading, spacing: 3) { Text(record.model ?? record.requestedModel ?? "未知模型").font(.subheadline.bold()); Text("#\(record.id) · \(record.createdAt ?? "")").font(.caption2).foregroundStyle(.secondary) }; Spacer(); StatusPill(text: record.stream == true ? "Stream" : record.requestType?.displayText ?? "请求", color: record.stream == true ? .green : .secondary) }
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 95), spacing: 8)], spacing: 8) { info("用户", record.user?.email ?? record.userID.map(String.init) ?? "--"); info("API Key", record.apiKey?.name ?? record.apiKeyID.map(String.init) ?? "--"); info("账号", record.account?.name ?? record.accountID.map(String.init) ?? "--"); info("分组", record.group?.name ?? record.group?.groupName ?? record.groupID.map(String.init) ?? "--"); info("Token", NumberFormatters.compact(tokens)); info("用户计费", NumberFormatters.currency(record.totalCost)); info("实际成本", NumberFormatters.currency(record.actualCost)); info("账号计费", NumberFormatters.currency(record.accountStatsCost)); info("首 Token", String(format: "%.0fms", record.firstTokenMs ?? 0)); info("耗时", String(format: "%.0fms", record.durationMs ?? 0)) }
        VStack(alignment: .leading, spacing: 3) { Text("Request ID").font(.caption2).foregroundStyle(.secondary); Text(record.requestID ?? "--").font(.caption.monospaced()).textSelection(.enabled); Text(record.inboundEndpoint ?? record.upstreamEndpoint ?? "--").font(.caption2).foregroundStyle(.secondary).textSelection(.enabled) }
    }.padding(14).glassPanel(cornerRadius: 18) }
    private func info(_ label: String, _ value: String) -> some View { VStack(alignment: .leading, spacing: 3) { Text(label).font(.caption2).foregroundStyle(.secondary); Text(value).font(.caption.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.7) }.frame(maxWidth: .infinity, alignment: .leading).padding(8).background(.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 9)) }
}
