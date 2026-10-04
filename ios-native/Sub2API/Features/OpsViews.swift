import Charts
import SwiftUI

struct OpsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var section = OpsSection.overview
    @State private var timeRange = "24h"
    @State private var platform = ""
    @State private var groupID = ""
    @State private var groups: [AdminGroup] = []
    @State private var showsFilters = false

    var body: some View {
        VStack(spacing: 0) {
            Picker("视图", selection: $section) { ForEach(OpsSection.allCases) { Text($0.title).tag($0) } }.pickerStyle(.segmented).padding(.horizontal, 16).padding(.top, 10)
            Group {
                switch section {
                case .overview: OpsOverviewView(filters: filters)
                case .records: OpsRecordsView(filters: filters)
                case .alerts: OpsAlertsView(filters: filters)
                }
            }
        }
        .navigationTitle("运维监控")
        .toolbar { ToolbarItem(placement: .primaryAction) { Button { showsFilters = true } label: { Image(systemName: (platform.isEmpty && groupID.isEmpty && timeRange == "24h") ? "line.3.horizontal.decrease.circle" : "line.3.horizontal.decrease.circle.fill") } } }
        .sheet(isPresented: $showsFilters) { NavigationStack { Form { Section("时间") { Picker("范围", selection: $timeRange) { Text("近1小时").tag("1h"); Text("近24小时").tag("24h"); Text("近7天").tag("7d"); Text("近30天").tag("30d") } }; Section("范围") { Picker("平台", selection: $platform) { Text("全部平台").tag(""); ForEach(["openai", "anthropic", "gemini", "antigravity", "grok"], id: \.self) { Text($0).tag($0) } }; Picker("分组", selection: $groupID) { Text("全部分组").tag(""); ForEach(groups) { Text($0.name).tag(String($0.id)) } } } }.navigationTitle("运维筛选").toolbar { ToolbarItem(placement: .cancellationAction) { Button("重置") { timeRange = "24h"; platform = ""; groupID = "" } }; ToolbarItem(placement: .confirmationAction) { Button("完成") { showsFilters = false } } } } }
        .appPage().task { guard let service = try? store.adminService() else { return }; groups = (try? await service.allGroups()) ?? [] }
    }

    private var filters: [String: String] { ["time_range": timeRange, "window": timeRange, "platform": platform, "group_id": groupID] }
}

private enum OpsSection: String, CaseIterable, Identifiable { case overview, records, alerts; var id: Self { self }; var title: String { switch self { case .overview: "总览"; case .records: "记录"; case .alerts: "告警" } } }

private struct OpsOverviewView: View {
    @EnvironmentObject private var store: AppStore
    let filters: [String: String]
    @State private var overview: OpsOverview?
    @State private var snapshot: JSONValue?
    @State private var realtime: JSONValue?
    @State private var concurrency: JSONValue?
    @State private var userConcurrency: JSONValue?
    @State private var availability: JSONValue?
    @State private var tokenStats: JSONValue?
    @State private var runtime: JSONValue?
    @State private var thresholds: JSONValue?
    @State private var errorTrend: JSONValue?
    @State private var throughput: JSONValue?
    @State private var distribution: JSONValue?
    @State private var histogram: JSONValue?
    @State private var logsHealth: JSONValue?
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                Grid(horizontalSpacing: 9, verticalSpacing: 9) {
                    GridRow { MetricTile(label: "请求", value: NumberFormatters.compact(overview?.totalRequests ?? overview?.requests), symbol: "waveform.path", tint: AppPalette.blue); MetricTile(label: "错误率", value: NumberFormatters.percent(overview?.errorRate), symbol: "exclamationmark.triangle", tint: AppPalette.orange) }
                    GridRow { MetricTile(label: "平均延迟", value: String(format: "%.0fms", overview?.avgLatencyMs ?? 0), symbol: "timer", tint: AppPalette.purple); MetricTile(label: "P95", value: String(format: "%.0fms", overview?.p95LatencyMs ?? 0), symbol: "gauge", tint: AppPalette.teal) }
                    GridRow { MetricTile(label: "RPM", value: NumberFormatters.compact(overview?.rpm), symbol: "speedometer", tint: AppPalette.blue); MetricTile(label: "告警", value: NumberFormatters.compact(overview?.alertCount), symbol: "bell", tint: AppPalette.orange) }
                }
                if isLoading && overview == nil { LoadingView(label: "正在加载全部运维指标") }
                if let errorMessage { InlineErrorView(message: errorMessage) { Task { await load() } } }
                chartPanel("吞吐趋势", value: throughput, keys: ["trend", "items"], color: AppPalette.blue)
                chartPanel("错误趋势", value: errorTrend, keys: ["trend", "items"], color: AppPalette.orange)
                dynamicPanel("实时流量", symbol: "dot.radiowaves.left.and.right", value: realtime)
                dynamicPanel("资源与运行时", symbol: "cpu", value: resourceMetrics)
                dynamicPanel("运行时告警", symbol: "exclamationmark.shield", value: runtime)
                dynamicPanel("账号可用性", symbol: "checkmark.shield", value: availability)
                dynamicPanel("平台并发 / 排队", symbol: "server.rack", value: concurrency)
                dynamicPanel("用户并发", symbol: "person.2", value: userConcurrency)
                dynamicPanel("OpenAI Token 状态", symbol: "key.horizontal", value: tokenStats)
                dynamicPanel("错误分布", symbol: "chart.bar", value: distribution)
                dynamicPanel("延迟直方图", symbol: "chart.bar.xaxis", value: histogram)
                dynamicPanel("系统日志健康", symbol: "terminal", value: logsHealth)
                dynamicPanel("指标阈值", symbol: "slider.horizontal.3", value: thresholds)
            }.padding(16)
        }.scrollIndicators(.hidden).refreshable { await load() }.task(id: filterKey) { await load() }
    }

    private var filterKey: String { filters.sorted { $0.key < $1.key }.map { "\($0.key)=\($0.value)" }.joined(separator: "&") }

    private var resourceMetrics: JSONValue? {
        guard let snapshot else { return nil }
        let snapshotObject = snapshot.objectValue
        let overviewValue = snapshotObject?["overview"] ?? snapshot
        let overviewObject = overviewValue.objectValue
        return overviewObject?["system_metrics"] ?? overviewObject?["systemMetrics"]
            ?? snapshotObject?["system_metrics"] ?? snapshotObject?["systemMetrics"]
            ?? overviewValue
    }

    @ViewBuilder private func chartPanel(_ title: String, value: JSONValue?, keys: [String], color: Color) -> some View {
        let rows = extractRows(value, keys: keys)
        if rows.count > 1 { VStack(alignment: .leading, spacing: 12) { Text(title).font(.headline); Chart(Array(rows.enumerated()), id: \.offset) { index, row in LineMark(x: .value("点", row.text("date", "time", "label") ?? String(index)), y: .value("值", row.number("requests", "errors", "count", "value") ?? 0)).foregroundStyle(color).interpolationMethod(.catmullRom) }.chartYAxis(.hidden).frame(height: 170) }.padding(16).glassPanel() }
    }

    @ViewBuilder private func dynamicPanel(_ title: String, symbol: String, value: JSONValue?) -> some View {
        if let value, value != .null { VStack(alignment: .leading, spacing: 10) { Label(title, systemImage: symbol).font(.headline); DynamicJSONView(value: value) }.padding(16).glassPanel() }
    }

    private func extractRows(_ value: JSONValue?, keys: [String]) -> [[String: JSONValue]] {
        guard let value else { return [] }
        if let array = value.arrayValue { return array.compactMap(\.objectValue) }
        guard let object = value.objectValue else { return [] }
        for key in keys { let rows = object.rows(key); if !rows.isEmpty { return rows } }
        return []
    }

    private func load() async {
        guard let service = try? store.adminService() else { return }; isLoading = true; errorMessage = nil
        async let a: OpsOverview? = try? await service.opsOverview(filters: filters)
        async let b: JSONValue? = try? await service.opsDynamic("/api/v1/admin/ops/dashboard/snapshot-v2", filters: filters)
        async let c: JSONValue? = try? await service.opsDynamic("/api/v1/admin/ops/realtime-traffic", filters: filters)
        async let d: JSONValue? = try? await service.opsDynamic("/api/v1/admin/ops/concurrency", filters: filters)
        async let e: JSONValue? = try? await service.opsDynamic("/api/v1/admin/ops/user-concurrency", filters: filters)
        async let f: JSONValue? = try? await service.opsDynamic("/api/v1/admin/ops/account-availability", filters: filters)
        async let g: JSONValue? = try? await service.opsDynamic("/api/v1/admin/ops/dashboard/openai-token-stats", filters: filters)
        async let h: JSONValue? = try? await service.opsDynamic("/api/v1/admin/ops/runtime/alert")
        async let i: JSONValue? = try? await service.opsDynamic("/api/v1/admin/ops/settings/metric-thresholds")
        async let j: JSONValue? = try? await service.opsDynamic("/api/v1/admin/ops/dashboard/error-trend", filters: filters)
        async let k: JSONValue? = try? await service.opsDynamic("/api/v1/admin/ops/dashboard/throughput-trend", filters: filters)
        async let l: JSONValue? = try? await service.opsDynamic("/api/v1/admin/ops/dashboard/error-distribution", filters: filters)
        async let m: JSONValue? = try? await service.opsDynamic("/api/v1/admin/ops/dashboard/latency-histogram", filters: filters)
        async let n: JSONValue? = try? await service.opsDynamic("/api/v1/admin/ops/system-logs/health")
        let values = await (a,b,c,d,e,f,g,h,i,j,k,l,m,n)
        let snapshotValue = values.1
        let snapshotObject = snapshotValue?.objectValue
        let snapshotOverview = snapshotObject?["overview"] ?? snapshotValue
        overview = values.0 ?? snapshotOverview.map { OpsOverview(json: $0) }
        snapshot = snapshotValue
        realtime = values.2 ?? snapshotObject?["realtime"] ?? snapshotOverview
        concurrency = values.3
        userConcurrency = values.4
        availability = values.5
        tokenStats = values.6 ?? snapshotObject?["openai_token_stats"] ?? snapshotObject?["openaiTokenStats"]
        runtime = values.7
        thresholds = values.8
        errorTrend = values.9 ?? snapshotObject?["error_trend"] ?? snapshotObject?["errorTrend"]
        throughput = values.10 ?? snapshotObject?["throughput_trend"] ?? snapshotObject?["throughputTrend"]
        distribution = values.11 ?? snapshotObject?["error_distribution"] ?? snapshotObject?["errorDistribution"]
        histogram = values.12 ?? snapshotObject?["latency_histogram"] ?? snapshotObject?["latencyHistogram"]
        logsHealth = values.13
        if overview == nil && snapshotValue == nil {
            errorMessage = "运维总览与快照均加载失败，请检查服务端运维接口。"
        }
        isLoading = false
    }
}

struct DynamicJSONView: View {
    let value: JSONValue
    var body: some View {
        switch value {
        case let .object(object): LazyVGrid(columns: [GridItem(.adaptive(minimum: 130), spacing: 8)], spacing: 8) { ForEach(object.keys.sorted().prefix(30), id: \.self) { key in let child = object[key] ?? .null; if child.objectValue == nil && child.arrayValue == nil { VStack(alignment: .leading, spacing: 3) { Text(readable(key)).font(.caption2).foregroundStyle(.secondary); Text(child.displayText).font(.caption.weight(.semibold)).lineLimit(3).minimumScaleFactor(0.7) }.frame(maxWidth: .infinity, alignment: .leading).padding(9).background(.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 9)) } } }
        case let .array(array): VStack(alignment: .leading, spacing: 8) { ForEach(Array(array.prefix(12).enumerated()), id: \.offset) { _, child in Text(child.displayText).font(.caption).lineLimit(4).frame(maxWidth: .infinity, alignment: .leading).padding(9).background(.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 9)) } }
        default: Text(value.displayText).font(.caption.monospaced()).textSelection(.enabled)
        }
    }
    private func readable(_ value: String) -> String { value.replacingOccurrences(of: "_", with: " ").capitalized }
}

private struct OpsRecordsView: View {
    @EnvironmentObject private var store: AppStore
    let filters: [String: String]
    @State private var kind = OpsRecordKind.errors
    @State private var records: [OpsRecord] = []
    @State private var level = ""
    @State private var search = ""
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var message: String?

    var body: some View { VStack(spacing: 0) {
        HStack { Picker("类型", selection: $kind) { ForEach(OpsRecordKind.allCases) { Text($0.title).tag($0) } }.pickerStyle(.menu); Picker("级别", selection: $level) { Text("全部级别").tag(""); ForEach(["error", "warning", "info", "debug"], id: \.self) { Text($0).tag($0) } }.pickerStyle(.menu); Spacer(); if kind == .systemLogs { Button(role: .destructive) { Task { await cleanupLogs() } } label: { Image(systemName: "trash") } } }.padding(.horizontal, 16).padding(.top, 10)
        ScrollView { LazyVStack(spacing: 12) { if let message { Text(message).font(.footnote).foregroundStyle(.secondary) }; if isLoading && records.isEmpty { LoadingView() }; if let errorMessage, records.isEmpty { InlineErrorView(message: errorMessage) { Task { await load() } } }; if !isLoading && records.isEmpty { EmptyContentView(symbol: "doc.text.magnifyingglass", title: "暂无记录", message: "当前条件下没有运维记录。") }; ForEach(records) { record in VStack(alignment: .leading, spacing: 8) { HStack { Text(record.message ?? record.errorMessage ?? record.upstreamError ?? record.path ?? "记录").font(.subheadline.bold()).lineLimit(3); Spacer(); StatusPill(text: record.level ?? record.status ?? "--", color: tone(record)) }; HStack { Text(record.method ?? ""); Text(record.model ?? ""); Text(record.accountName ?? ""); Spacer(); Text(record.createdAt ?? "") }.font(.caption2).foregroundStyle(.secondary); if kind != .systemLogs && record.resolvedAt == nil { Button("标记已解决") { Task { await resolve(record) } }.font(.caption) } }.padding(14).glassPanel(cornerRadius: 18) } }.padding(16) }.searchable(text: $search, prompt: "搜索消息或路径").refreshable { await load() }
    }.task(id: taskKey) { await load() } }

    private var taskKey: String { "\(kind.rawValue)-\(level)-\(filters.description)" }
    private var path: String { "/api/v1/admin/ops/\(kind.rawValue)" }
    private func tone(_ row: OpsRecord) -> Color { ["error", "critical", "fatal"].contains((row.level ?? row.status ?? "").lowercased()) ? .red : AppPalette.orange }
    private func load() async { guard let service = try? store.adminService() else { return }; isLoading = true; do { var next = filters; next["page"] = "1"; next["page_size"] = "100"; next["sort_by"] = "created_at"; next["sort_order"] = "desc"; next["level"] = level; next["search"] = search; records = try await service.opsRecords(path, filters: next).items; errorMessage = nil } catch { errorMessage = error.localizedDescription }; isLoading = false }
    private func resolve(_ row: OpsRecord) async { guard let service = try? store.adminService() else { return }; do { try await service.resolveOpsRecord(row.id, kind: kind); await load() } catch { message = error.localizedDescription } }
    private func cleanupLogs() async { guard let service = try? store.adminService() else { return }; do { try await service.cleanupSystemLogs(); message = "系统日志清理已提交"; await load() } catch { message = error.localizedDescription } }
}

private struct OpsAlertsView: View {
    @EnvironmentObject private var store: AppStore
    let filters: [String: String]
    @State private var alerts: [OpsAlertEvent] = []
    @State private var severity = ""
    @State private var status = ""
    @State private var email = ""
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View { VStack(spacing: 0) {
        ScrollView(.horizontal) { HStack(spacing: 8) { Menu { Button("全部级别") { severity = "" }; ForEach(["P0", "P1", "P2", "P3"], id: \.self) { value in Button(value) { severity = value } } } label: { chip(severity.isEmpty ? "全部级别" : severity, !severity.isEmpty) }; Menu { Button("全部状态") { status = "" }; Button("触发中") { status = "firing" }; Button("已恢复") { status = "resolved" }; Button("手动恢复") { status = "manual_resolved" } } label: { chip(status.isEmpty ? "全部状态" : status, !status.isEmpty) }; Menu { Button("全部邮件") { email = "" }; Button("已发送") { email = "true" }; Button("已忽略") { email = "false" } } label: { chip(email.isEmpty ? "全部邮件" : email == "true" ? "已发送" : "已忽略", !email.isEmpty) } }.padding(.horizontal, 16).padding(.top, 10) }.scrollIndicators(.hidden)
        ScrollView { LazyVStack(spacing: 12) { if isLoading && alerts.isEmpty { LoadingView() }; if let errorMessage, alerts.isEmpty { InlineErrorView(message: errorMessage) { Task { await load() } } }; if !isLoading && alerts.isEmpty { EmptyContentView(symbol: "bell.slash", title: "暂无告警", message: "当前筛选条件下没有告警事件。") }; ForEach(alerts) { alert in VStack(alignment: .leading, spacing: 9) { HStack { VStack(alignment: .leading, spacing: 3) { Text(alert.title ?? "告警事件").font(.subheadline.bold()); Text("规则 #\(alert.ruleID ?? 0) · \(alert.firedAt)").font(.caption2).foregroundStyle(.secondary) }; Spacer(); StatusPill(text: alert.severity, color: severityColor(alert.severity)) }; if let description = alert.description { Text(description).font(.footnote).foregroundStyle(.secondary) }; HStack { Text("指标 \(NumberFormatters.compact(alert.metricValue)) / 阈值 \(NumberFormatters.compact(alert.thresholdValue))").font(.caption); Spacer(); Label(alert.emailSent == true ? "已发送" : "未发送", systemImage: alert.emailSent == true ? "envelope.badge.fill" : "envelope") .font(.caption2) }; if !["resolved", "manual_resolved"].contains(alert.status.lowercased()) { Button("手动恢复") { Task { await resolve(alert) } }.buttonStyle(.bordered).font(.caption) } }.padding(14).glassPanel(cornerRadius: 18) } }.padding(16) }.refreshable { await load() }
    }.task(id: taskKey) { await load() } }
    private var taskKey: String { "\(severity)-\(status)-\(email)-\(filters.description)" }
    private func chip(_ text: String, _ selected: Bool) -> some View { HStack { Text(text); Image(systemName: "chevron.down").font(.caption2) }.font(.caption.weight(.semibold)).foregroundStyle(selected ? .white : .primary).padding(.horizontal, 11).padding(.vertical, 8).background(selected ? AppPalette.purple : Color.primary.opacity(0.06), in: Capsule()) }
    private func severityColor(_ value: String) -> Color { switch value.uppercased() { case "P0", "CRITICAL": .red; case "P1", "HIGH": AppPalette.orange; case "P2", "MEDIUM": .yellow; default: .secondary } }
    private func load() async { guard let service = try? store.adminService() else { return }; isLoading = true; do { var next = filters; next["limit"] = "100"; next["severity"] = severity; next["status"] = status; next["email_sent"] = email; alerts = try await service.alertEvents(filters: next).items; errorMessage = nil } catch { errorMessage = error.localizedDescription }; isLoading = false }
    private func resolve(_ alert: OpsAlertEvent) async { guard let service = try? store.adminService() else { return }; do { try await service.resolveAlert(alert.id); await load() } catch { errorMessage = error.localizedDescription } }
}
