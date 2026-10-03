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
    @State private var profile: JSONValue?
    @State private var userRanking: JSONValue?
    @State private var granularity = "auto"
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
                Picker("粒度", selection: $granularity) {
                    Text("自动").tag("auto")
                    Text("按小时").tag("hour")
                    Text("按天").tag("day")
                }
                .pickerStyle(.segmented)

                if isLoading && stats == nil {
                    LoadingView(label: "正在同步运行数据")
                } else if let errorMessage, stats == nil {
                    InlineErrorView(message: errorMessage) { Task { await load() } }
                } else {
                    summaryGrid
                    webConsoleSummary
                    accountOverview
                    trendCard
                    throughputCard
                    modelCard
                    groupCard
                    rankingCard
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
        .task(id: "\(store.activeServerID?.uuidString ?? "")-\(range.rawValue)-\(granularity)") { await load() }
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

    private var webConsoleSummary: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let object = profile?.objectValue {
                let available = object.number("balance", "available_balance") ?? 0
                let frozen = object.number("frozen_balance", "frozen_amount") ?? 0
                HStack(spacing: 8) {
                    balanceValue("可用余额", available, .green)
                    balanceValue("冻结金额", frozen, AppPalette.orange)
                    balanceValue("总余额", available + frozen, AppPalette.blue)
                }
            }
            Grid(horizontalSpacing: 8, verticalSpacing: 8) {
                GridRow {
                    MetricTile(label: "账号", value: "\(NumberFormatters.compact(stats?.totalAccounts)) · \(NumberFormatters.compact(stats?.normalAccounts)) 启用", symbol: "server.rack", tint: AppPalette.teal)
                    MetricTile(label: "API Key", value: "\(NumberFormatters.compact(stats?.totalAPIKeys)) · \(NumberFormatters.compact(stats?.activeAPIKeys)) 启用", symbol: "key", tint: AppPalette.blue)
                }
                GridRow {
                    MetricTile(label: "用户", value: "\(NumberFormatters.compact(stats?.totalUsers)) · +\(NumberFormatters.compact(stats?.todayNewUsers))", symbol: "person.2", tint: AppPalette.purple)
                    MetricTile(label: "总请求", value: NumberFormatters.compact(stats?.totalRequests), symbol: "sum", tint: AppPalette.orange)
                }
            }
            HStack(spacing: 10) {
                Label("\(NumberFormatters.compact(stats?.rpm)) RPM", systemImage: "speedometer")
                Spacer()
                Label("\(NumberFormatters.compact(stats?.tpm)) TPM", systemImage: "gauge")
                Spacer()
                Label("\(String(format: "%.0fms", usage?.averageDurationMs ?? usage?.avgDurationMs ?? 0)) 平均响应", systemImage: "timer")
                Spacer()
                Label("\(NumberFormatters.compact(stats?.activeUsers)) 活跃", systemImage: "person.crop.circle.badge.checkmark")
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            NavigationLink { GroupsView() } label: {
                HStack {
                    Label("分组定价", systemImage: "tag")
                    Spacer()
                    Text("设置批量折扣和冻结比例").font(.caption).foregroundStyle(.secondary)
                    Image(systemName: "chevron.right").font(.caption)
                }
                .padding(12)
                .background(.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .glassPanel()
    }

    private func balanceValue(_ label: String, _ value: Double, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label).font(.caption2).foregroundStyle(.secondary)
            Text(NumberFormatters.currency(value)).font(.caption.weight(.bold)).foregroundStyle(color).lineLimit(1).minimumScaleFactor(0.65)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(9)
        .background(.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 10))
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

    private var rankingCard: some View {
        let rows = userRanking?.arrayValue?.compactMap(\.objectValue)
            ?? userRanking?.objectValue?.rows("items", "users", "ranking", "data")
            ?? []
        return VStack(alignment: .leading, spacing: 12) {
            Text("用户消费榜 / 最近使用 Top 12").font(.headline)
            if rows.isEmpty { Text("暂无用户排行数据").font(.footnote).foregroundStyle(.secondary) }
            ForEach(Array(rows.prefix(12).enumerated()), id: \.offset) { index, row in
                HStack {
                    Text("\(index + 1)").font(.caption2.monospacedDigit()).foregroundStyle(.secondary).frame(width: 20)
                    Text(row.text("email", "username", "user_name", "name") ?? "用户 #\(row.text("user_id", "id") ?? "--")").font(.caption.weight(.semibold)).lineLimit(1)
                    Spacer()
                    Text("\(NumberFormatters.compact(row.number("total_tokens", "tokens"))) · \(NumberFormatters.currency(row.number("actual_cost", "total_actual_cost", "cost")))").font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
        .padding(16)
        .glassPanel()
    }

    private func load() async {
        guard let service = try? store.adminService() else { return }
        isLoading = true
        errorMessage = nil
        do {
            let dateRange = range.queryRange
            let resolvedGranularity = granularity == "auto" ? (range == .day ? "hour" : "day") : granularity
            async let nextStats = service.dashboardStats()
            async let nextUsage = service.usageStats(start: dateRange.start, end: dateRange.end)
            async let nextTrend = service.dashboardTrend(start: dateRange.start, end: dateRange.end, granularity: resolvedGranularity)
            async let nextModels = service.dashboardModels(start: dateRange.start, end: dateRange.end)
            async let nextSnapshot = service.dashboardSnapshot(start: dateRange.start, end: dateRange.end, granularity: resolvedGranularity, filters: ["include_stats": "false", "include_trend": "false", "include_model_stats": "false", "include_group_stats": "true"])
            async let nextAccounts = service.accounts()
            async let nextOps: OpsOverview? = try? await service.opsOverview(filters: ["window": "24h"])
            async let nextProfile: JSONValue? = try? await service.currentProfile()
            async let nextRanking: JSONValue? = try? await service.dashboardDynamic("users-ranking", start: dateRange.start, end: dateRange.end, granularity: resolvedGranularity)
            let result = try await (nextStats, nextUsage, nextTrend, nextModels, nextSnapshot, nextAccounts, nextOps, nextProfile, nextRanking)
            stats = result.0
            usage = result.1
            trend = result.2.trend
            models = result.3.models
            groups = result.4.groups ?? []
            accounts = result.5.items
            ops = result.6
            profile = result.7
            userRanking = result.8
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

