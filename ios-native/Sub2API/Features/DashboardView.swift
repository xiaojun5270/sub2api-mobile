import Charts
import SwiftUI

struct DashboardView: View {
    @EnvironmentObject private var store: AppStore
    @State private var range: DashboardRange = .day
    @State private var stats: DashboardStats?
    @State private var usage: UsageSummary?
    @State private var trend: [TrendPoint] = []
    @State private var accounts: [AdminAccount] = []
    @State private var models: [ModelStat] = []
    @State private var groups: [SnapshotGroup] = []
    @State private var ops: OpsOverview?
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 14) {
                header
                Picker("时间范围", selection: $range) {
                    ForEach(DashboardRange.allCases) { item in
                        Text(item.label).tag(item)
                    }
                }
                .pickerStyle(.segmented)

                if isLoading && stats == nil {
                    LoadingView(label: "正在同步运行数据")
                } else if let errorMessage, stats == nil {
                    InlineErrorView(message: errorMessage) { Task { await load() } }
                } else {
                    summaryGrid
                    accountOverview
                    trendCard
                    throughputCard
                    modelCard
                    groupCard
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .refreshable { await load() }
        .navigationBarHidden(true)
        .appPage()
        .task(id: "\(store.activeServerID?.uuidString ?? "")-\(range.rawValue)") { await load() }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("概览")
                    .font(.largeTitle.bold())
                Text("\(store.activeServer?.label ?? "Sub2API") 的当前运行状态")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            Spacer()
            Button { Task { await load() } } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 17, weight: .semibold))
                    .frame(width: 40, height: 40)
            }
            .buttonStyle(GlassIconButtonStyle())
            .accessibilityLabel("刷新")
        }
    }

    private var summaryGrid: some View {
        Grid(horizontalSpacing: 10, verticalSpacing: 10) {
            GridRow {
                MetricTile(label: "\(range.label) Token", value: NumberFormatters.compact(usage?.totalTokens ?? stats?.todayTokens), symbol: "cpu", tint: AppPalette.teal)
                MetricTile(label: "\(range.label) 成本", value: NumberFormatters.currency(usage?.actualCost ?? usage?.totalCost ?? stats?.todayCost), symbol: "dollarsign.circle", tint: AppPalette.orange)
            }
            GridRow {
                MetricTile(label: "请求", value: NumberFormatters.compact(usage?.totalRequests ?? usage?.requestCount ?? stats?.todayRequests), symbol: "arrow.up.arrow.down", tint: AppPalette.blue)
                MetricTile(label: "实时吞吐", value: "\(NumberFormatters.compact(stats?.rpm)) RPM", symbol: "speedometer", tint: AppPalette.purple)
            }
        }
    }

    private var accountOverview: some View {
        let normal = accounts.filter { StatusStyle.account($0).0 == "正常" }.count
        let errors = accounts.filter { StatusStyle.account($0).0 == "异常" }.count
        let limited = accounts.filter { StatusStyle.account($0).0 == "限流" }.count

        return VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 3) {
                Text("账号概览").font(.headline)
                Text("健康、异常和限流状态一览").font(.caption).foregroundStyle(.secondary)
            }
            HStack(spacing: 8) {
                accountCount(label: "总数", value: accounts.count, tint: .primary)
                accountCount(label: "健康", value: normal, tint: .green)
                accountCount(label: "异常", value: errors, tint: AppPalette.orange)
                accountCount(label: "限流", value: limited, tint: .secondary)
            }
        }
        .padding(16)
        .glassPanel()
    }

    private func accountCount(label: String, value: Int, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label).font(.caption2).foregroundStyle(.secondary)
            Text("\(value)")
                .font(.system(.title3, design: .rounded, weight: .bold))
                .foregroundStyle(tint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(.primary.opacity(0.045), in: RoundedRectangle(cornerRadius: 12))
    }

    private var trendCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Token 吞吐").font(.headline)
                    Text("当前时间范围内的 Token 变化")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text(NumberFormatters.compact(trend.reduce(0) { $0 + ($1.totalTokens ?? 0) }))
                    .font(.title3.monospacedDigit().bold())
            }

            if trend.isEmpty {
                Text("暂无趋势数据")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, minHeight: 170)
            } else {
                Chart(trend) { point in
                    LineMark(
                        x: .value("时间", point.date),
                        y: .value("Token", point.totalTokens ?? 0)
                    )
                    .interpolationMethod(.catmullRom)
                    .foregroundStyle(AppPalette.orange)
                    .lineStyle(StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
                }
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: 5)) { _ in
                        AxisValueLabel().font(.caption2)
                        AxisGridLine().foregroundStyle(.secondary.opacity(0.12))
                    }
                }
                .chartYAxis(.hidden)
                .frame(height: 190)
            }
        }
        .padding(16)
        .glassPanel()
    }

    private var throughputCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("请求与 Token").font(.headline)
            HStack(spacing: 10) {
                Label("输入 \(NumberFormatters.compact(usage?.inputTokens ?? stats?.todayInputTokens))", systemImage: "arrow.down.circle.fill")
                    .foregroundStyle(AppPalette.blue)
                Spacer()
                Label("输出 \(NumberFormatters.compact(usage?.outputTokens ?? stats?.todayOutputTokens))", systemImage: "arrow.up.circle.fill")
                    .foregroundStyle(AppPalette.orange)
            }
            .font(.caption.weight(.semibold))
            HStack(spacing: 10) {
                Label("缓存 \(NumberFormatters.compact(stats?.todayCacheReadTokens))", systemImage: "externaldrive.fill")
                Spacer()
                Label("\(NumberFormatters.compact(stats?.tpm)) TPM", systemImage: "gauge.with.dots.needle.67percent")
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            Divider()
            HStack {
                Label("错误率 \(NumberFormatters.percent(ops?.errorRate))", systemImage: "exclamationmark.triangle")
                Spacer()
                Label("P95 \(String(format: "%.0fms", ops?.p95LatencyMs ?? 0))", systemImage: "timer")
                Spacer()
                Label("告警 \(NumberFormatters.compact(ops?.alertCount))", systemImage: "bell")
            }.font(.caption).foregroundStyle(.secondary)
        }
        .padding(16)
        .glassPanel()
    }

    private var modelCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("模型使用分布").font(.headline)
            if models.isEmpty { Text("暂无模型数据").font(.footnote).foregroundStyle(.secondary) }
            else { Chart(models.prefix(8)) { model in BarMark(x: .value("请求", model.requests ?? 0), y: .value("模型", model.model)).foregroundStyle(AppPalette.blue) }.frame(height: CGFloat(max(180, min(models.count, 8) * 32))).chartXAxis(.hidden) }
            ForEach(models.prefix(8)) { model in HStack { Text(model.model).font(.caption).lineLimit(1); Spacer(); Text("\(NumberFormatters.compact(model.requests)) 请求 · \(NumberFormatters.compact(model.totalTokens)) Token · \(NumberFormatters.currency(model.actualCost ?? model.cost))").font(.caption2).foregroundStyle(.secondary) } }
        }.padding(16).glassPanel()
    }

    private var groupCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("分组使用分布").font(.headline)
            if groups.isEmpty { Text("暂无分组使用数据").font(.footnote).foregroundStyle(.secondary) }
            ForEach(Array(groups.prefix(12).enumerated()), id: \.offset) { _, group in
                HStack(spacing: 8) {
                    Text(group.groupName ?? group.name ?? "未分组").font(.caption.weight(.semibold)).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
                    Text(NumberFormatters.compact(group.totalRequests ?? group.requests)).font(.caption2.monospacedDigit()).frame(width: 48, alignment: .trailing)
                    Text(NumberFormatters.compact(group.totalTokens ?? group.tokens)).font(.caption2.monospacedDigit()).frame(width: 54, alignment: .trailing)
                    Text(NumberFormatters.currency(group.totalActualCost ?? group.actualCost ?? group.totalCost ?? group.cost)).font(.caption2.monospacedDigit()).frame(width: 60, alignment: .trailing)
                }
                if group.id != groups.prefix(12).last?.id { Divider() }
            }
        }.padding(16).glassPanel()
    }

    private func load() async {
        guard let service = try? store.adminService() else { return }
        isLoading = true
        errorMessage = nil
        do {
            let dateRange = range.queryRange
            async let nextStats = service.dashboardStats()
            async let nextUsage = service.usageStats(start: dateRange.start, end: dateRange.end)
            async let nextTrend = service.dashboardTrend(start: dateRange.start, end: dateRange.end, granularity: range == .day ? "hour" : "day")
            async let nextModels = service.dashboardModels(start: dateRange.start, end: dateRange.end)
            async let nextSnapshot = service.dashboardSnapshot(start: dateRange.start, end: dateRange.end, granularity: range == .day ? "hour" : "day", filters: ["include_stats": "false", "include_trend": "false", "include_model_stats": "false", "include_group_stats": "true"])
            async let nextAccounts = service.accounts()
            async let nextOps: OpsOverview? = try? await service.opsOverview(filters: ["window": "24h"])
            let result = try await (nextStats, nextUsage, nextTrend, nextModels, nextSnapshot, nextAccounts, nextOps)
            stats = result.0
            usage = result.1
            trend = result.2.trend
            models = result.3.models
            groups = result.4.groups ?? []
            accounts = result.5.items
            ops = result.6
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

private enum DashboardRange: String, CaseIterable, Identifiable {
    case day, week, month
    var id: Self { self }
    var label: String { switch self { case .day: "24H"; case .week: "7D"; case .month: "30D" } }

    var queryRange: (start: String, end: String) {
        let calendar = Calendar.current
        let now = Date()
        let component: DateComponents = switch self {
        case .day: DateComponents(hour: -23)
        case .week: DateComponents(day: -6)
        case .month: DateComponents(day: -29)
        }
        let start = calendar.date(byAdding: component, to: now) ?? now
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return (formatter.string(from: start), formatter.string(from: now))
    }
}

