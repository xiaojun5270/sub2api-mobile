import Charts
import SwiftUI

struct DashboardView: View {
    @EnvironmentObject private var store: AppStore
    @AppStorage("sub2api_monitor_range_key") private var storedRange = DashboardRange.week.rawValue
    @State private var stats: DashboardStats?
    @State private var ops: OpsOverview?
    @State private var settings: AdminSettings?
    @State private var trend: [TrendPoint] = []
    @State private var accounts: [AdminAccount] = []
    @State private var models: [ModelStat] = []
    @State private var groups: [SnapshotGroup] = []
    @State private var groupMetric = "tokens"
    @State private var isLoading = true
    @State private var isRefreshing = false
    @State private var errorMessage: String?

    private var range: DashboardRange { DashboardRange(rawValue: storedRange) ?? .week }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                header
                if isLoading && stats == nil {
                    LoadingView(label: "正在同步概览、模型和账号状态")
                } else if let errorMessage, stats == nil {
                    InlineErrorView(message: errorMessage) { Task { await load() } }
                } else {
                    summaryGrid
                    groupCard
                    accountOverview
                    lineChartCard(title: "Token 吞吐", subtitle: "当前时间范围内的 Token 变化趋势", points: trend.map { DashboardLinePoint(label: pointLabel($0.date), value: $0.totalTokens ?? 0) }, color: Color(red: 0.98, green: 0.36, blue: 0.09), value: formatTokens)
                    lineChartCard(title: "请求趋势", subtitle: "当前时间范围内的请求变化趋势", points: trend.map { DashboardLinePoint(label: pointLabel($0.date), value: $0.requests ?? 0) }, color: AppPalette.blue, value: formatCompact)
                    lineChartCard(title: "成本趋势", subtitle: "当前时间范围内的成本变化趋势", points: trend.map { DashboardLinePoint(label: pointLabel($0.date), value: $0.cost ?? 0) }, color: AppPalette.purple, value: formatCurrency)
                    tokenStructureCard
                    accountStatusCard
                    modelCard
                    trendSummaryCard
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .refreshable { await load(refreshing: true) }
        .navigationBarHidden(true)
        .appPage()
        .onAppear { if DashboardRange(rawValue: storedRange) == nil { storedRange = DashboardRange.week.rawValue } }
        .task(id: "\(store.activeServerID?.uuidString ?? "")-\(storedRange)") { await load() }
        .task(id: store.activeServerID) {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(60))
                guard !Task.isCancelled else { return }
                await load(refreshing: true)
            }
        }
    }

    private var header: some View {
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                Image(systemName: "square.grid.2x2.fill")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(AppPalette.teal)
                    .frame(width: 42, height: 42)
                    .glassPanel(cornerRadius: 14)
                VStack(alignment: .leading, spacing: 3) {
                    Text("概览").font(.title.bold())
                    Text("\(settings?.siteName?.nilIfBlank ?? store.activeServer?.label ?? "管理控制台") 的当前运行状态。")
                        .font(.footnote).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer()
                Button { Task { await load(refreshing: true) } } label: {
                    Image(systemName: "arrow.clockwise").font(.system(size: 16, weight: .semibold)).frame(width: 38, height: 38)
                }
                .buttonStyle(GlassIconButtonStyle())
                .disabled(isRefreshing)
            }
            Picker("时间范围", selection: $storedRange) {
                ForEach(DashboardRange.allCases) { item in Text(item.label).tag(item.rawValue) }
            }
            .pickerStyle(.segmented)
            HStack {
                Text("\(range.queryRange.start) 到 \(range.queryRange.end)")
                Spacer()
                if isRefreshing { ProgressView().controlSize(.small) }
            }
            .font(.caption).foregroundStyle(.secondary)
        }
    }

    private var summaryGrid: some View {
        let selectedTokens = trend.reduce(0) { $0 + ($1.totalTokens ?? 0) }
        let selectedOutput = trend.reduce(0) { $0 + ($1.outputTokens ?? 0) }
        let selectedCost = trend.reduce(0) { $0 + ($1.cost ?? 0) }
        let useFallback = range == .today || range == .day
        let displayedTokens = useFallback && selectedTokens == 0 ? stats?.todayTokens : selectedTokens
        let displayedOutput = useFallback && selectedOutput == 0 ? stats?.todayOutputTokens : selectedOutput
        let displayedCost = useFallback && selectedCost == 0 ? stats?.todayCost : selectedCost

        return Grid(horizontalSpacing: 9, verticalSpacing: 9) {
            GridRow {
                OverviewMetricCard(title: "\(range.label) Token", value: formatTokens(displayedTokens), detail: "输出 \(formatTokens(displayedOutput))", symbol: "bolt.fill", tint: AppPalette.orange)
                OverviewMetricCard(title: "\(range.label) 成本", value: formatCurrency(displayedCost), detail: "TPM \(formatNumber(stats?.tpm))", symbol: "dollarsign.circle.fill", tint: .green)
            }
            GridRow {
                OverviewMetricCard(title: "今日请求", value: formatNumber(stats?.todayRequests), detail: "累计 \(formatNumber(stats?.totalRequests))", symbol: "waveform.path.ecg", tint: .green)
                OverviewMetricCard(title: "总 Token", value: formatTokens(stats?.totalTokens), detail: "累计成本 \(formatCurrency(stats?.totalCost))", symbol: "externaldrive.fill", tint: AppPalette.blue)
            }
            GridRow {
                OverviewMetricCard(title: "性能指标", value: "\(formatCompact(currentRPM)) RPM", detail: "\(formatCompact(currentTPM)) TPM", symbol: "gauge.with.dots.needle.67percent", tint: AppPalette.orange)
                OverviewMetricCard(title: "平均响应", value: averageResponse, detail: "\(formatNumber(stats?.activeUsers)) 活跃用户", symbol: "timer", tint: .red)
            }
        }
    }

    private var groupCard: some View {
        let normalized = groups.map { group in
            DashboardGroupRow(
                name: group.groupName ?? group.name ?? "未分组",
                requests: group.totalRequests ?? group.requests ?? 0,
                tokens: group.totalTokens ?? group.tokens ?? 0,
                actualCost: group.totalActualCost ?? group.actualCost ?? group.cost ?? 0
            )
        }
        let sorted = normalized.sorted { groupMetricValue($0) > groupMetricValue($1) }
        let visible = Array(sorted.prefix(6))
        let chartTop = Array(sorted.prefix(5))
        let other = sorted.dropFirst(5).reduce(0) { $0 + groupMetricValue($1) }
        let segments = chartTop.enumerated().map { DashboardSegment(name: $0.element.name, value: groupMetricValue($0.element), color: groupColor($0.offset)) }
            + (other > 0 ? [DashboardSegment(name: "其它", value: other, color: Color(uiColor: .systemGray4))] : [])
        let total = segments.reduce(0) { $0 + $1.value }

        return VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "chart.pie.fill").font(.system(size: 17, weight: .semibold)).foregroundStyle(AppPalette.blue)
                    .frame(width: 34, height: 34).background(AppPalette.blue.opacity(0.1), in: Circle())
                VStack(alignment: .leading, spacing: 3) {
                    Text("分组使用分布").font(.headline)
                    Text("\(range.label) 分组请求、Token 与费用分布").font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 6)
                Picker("分组指标", selection: $groupMetric) {
                    Text("按 Token").tag("tokens")
                    Text("按实际消耗").tag("cost")
                }
                .pickerStyle(.segmented).frame(width: 150).controlSize(.small)
            }
            if visible.isEmpty || total <= 0 {
                Text("当前时间范围暂无分组使用数据。").font(.footnote).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, minHeight: 120)
            } else {
                ZStack {
                    Chart(segments) { segment in
                        SectorMark(angle: .value("占比", segment.value), innerRadius: .ratio(0.67), angularInset: 1.2)
                            .cornerRadius(2).foregroundStyle(segment.color)
                    }
                    .chartLegend(.hidden)
                    VStack(spacing: 2) {
                        Text(groupMetric == "tokens" ? "Token" : "实际消耗").font(.caption2).foregroundStyle(.secondary)
                        Text(groupMetric == "tokens" ? formatTokens(total) : formatCurrency(total)).font(.title3.bold()).minimumScaleFactor(0.7)
                    }.frame(width: 90)
                }
                .frame(height: 170).padding(.horizontal, 44)
                VStack(spacing: 0) {
                    HStack(spacing: 6) {
                        Text("分组").frame(maxWidth: .infinity, alignment: .leading)
                        Text("请求").frame(width: 48, alignment: .trailing)
                        Text("Token").frame(width: 60, alignment: .trailing)
                        Text("实际").frame(width: 64, alignment: .trailing)
                    }
                    .font(.caption2.weight(.semibold)).foregroundStyle(.secondary).padding(.bottom, 7)
                    ForEach(Array(visible.enumerated()), id: \.offset) { index, row in
                        HStack(spacing: 6) {
                            HStack(spacing: 6) { Circle().fill(groupColor(index)).frame(width: 7, height: 7); Text(row.name).font(.caption.weight(.semibold)).lineLimit(1) }.frame(maxWidth: .infinity, alignment: .leading)
                            Text(formatCompact(row.requests)).frame(width: 48, alignment: .trailing)
                            Text(formatTokens(row.tokens)).frame(width: 60, alignment: .trailing)
                            Text(formatCurrency(row.actualCost)).foregroundStyle(AppPalette.teal).fontWeight(.bold).frame(width: 64, alignment: .trailing)
                        }
                        .font(.caption2.monospacedDigit()).padding(.vertical, 8)
                        if index < visible.count - 1 { Divider() }
                    }
                }
            }
        }
        .padding(14).glassPanel(cornerRadius: 18)
    }

    private var accountOverview: some View {
        VStack(alignment: .leading, spacing: 13) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("账号概览").font(.headline)
                    Text("总数、正常、异常和限流状态一览").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                NavigationLink { AccountsView() } label: { Text("账号清单").font(.caption.weight(.semibold)) }.buttonStyle(.bordered)
            }
            NavigationLink { AccountsView() } label: {
                HStack(spacing: 8) {
                    accountCount("总数", totalAccounts, .primary)
                    accountCount("正常", normalAccounts, .green)
                    accountCount("异常", errorAccounts, AppPalette.orange)
                    accountCount("限流", limitedAccounts, .secondary)
                }
            }.buttonStyle(.plain)
            Text("正常、限流与繁忙基于完整账号清单状态；总数与异常使用后端汇总。点击进入账号清单。")
                .font(.caption2).foregroundStyle(.secondary)
        }
        .padding(14).glassPanel(cornerRadius: 18)
    }

    private func accountCount(_ label: String, _ value: Double, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) { Text(label).font(.caption2).foregroundStyle(.secondary); Text(formatNumber(value)).font(.title3.bold()).foregroundStyle(color) }
            .frame(maxWidth: .infinity, alignment: .leading).padding(9).background(.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 10))
    }

    @ViewBuilder
    private func lineChartCard(title: String, subtitle: String, points: [DashboardLinePoint], color: Color, value: @escaping (Double?) -> String) -> some View {
        if points.count > 1 {
            VStack(alignment: .leading, spacing: 11) {
                HStack { VStack(alignment: .leading, spacing: 3) { Text(title).font(.headline); Text(subtitle).font(.caption).foregroundStyle(.secondary) }; Spacer(); Text(value(points.reduce(0) { $0 + $1.value })).font(.subheadline.monospacedDigit().bold()) }
                Chart(Array(points.enumerated()), id: \.offset) { _, point in
                    LineMark(x: .value("时间", point.label), y: .value("数值", point.value)).interpolationMethod(.catmullRom).foregroundStyle(color).lineStyle(StrokeStyle(lineWidth: 2.4, lineCap: .round))
                }
                .chartXAxis { AxisMarks(values: .automatic(desiredCount: 5)) { _ in AxisValueLabel().font(.caption2); AxisGridLine().foregroundStyle(.secondary.opacity(0.1)) } }
                .chartYAxis(.hidden).frame(height: 170)
            }
            .padding(14).glassPanel(cornerRadius: 18)
        }
    }

    private var tokenStructureCard: some View {
        let items = [
            DashboardBarRow(label: "输入 Token", value: trend.reduce(0) { $0 + ($1.inputTokens ?? 0) }, color: AppPalette.blue),
            DashboardBarRow(label: "输出 Token", value: trend.reduce(0) { $0 + ($1.outputTokens ?? 0) }, color: AppPalette.orange),
            DashboardBarRow(label: "缓存读取 Token", value: trend.reduce(0) { $0 + ($1.cacheReadTokens ?? 0) }, color: .gray)
        ]
        let maximum = items.map(\.value).max() ?? 0
        return VStack(alignment: .leading, spacing: 12) {
            HStack { Image(systemName: "chart.bar.fill").foregroundStyle(AppPalette.blue); VStack(alignment: .leading, spacing: 2) { Text("Token 结构").font(.headline); Text("输入、输出、缓存读取占比").font(.caption).foregroundStyle(.secondary) } }
            ForEach(items) { item in
                VStack(spacing: 5) {
                    HStack { Circle().fill(item.color).frame(width: 7, height: 7); Text(item.label).font(.caption); Spacer(); Text(formatTokens(item.value)).font(.caption.monospacedDigit().weight(.semibold)) }
                    ProgressView(value: maximum > 0 ? item.value / maximum : 0).tint(item.color)
                }
            }
        }
        .padding(14).glassPanel(cornerRadius: 18)
    }

    private var accountStatusCard: some View {
        let segments = [
            DashboardSegment(name: "正常", value: normalAccounts, color: .green),
            DashboardSegment(name: "繁忙", value: busyAccounts, color: .orange),
            DashboardSegment(name: "限流", value: limitedAccounts, color: .gray),
            DashboardSegment(name: "异常", value: errorAccounts, color: Color(red: 0.98, green: 0.36, blue: 0.09))
        ].filter { $0.value > 0 }
        return VStack(alignment: .leading, spacing: 12) {
            HStack { Image(systemName: "chart.pie.fill").foregroundStyle(AppPalette.blue); VStack(alignment: .leading, spacing: 2) { Text("账号状态").font(.headline); Text("正常、繁忙、限流、异常分布").font(.caption).foregroundStyle(.secondary) } }
            ZStack {
                if segments.isEmpty { Circle().stroke(.secondary.opacity(0.12), lineWidth: 15) }
                else { Chart(segments) { item in SectorMark(angle: .value("账号", item.value), innerRadius: .ratio(0.68), angularInset: 1).foregroundStyle(item.color) }.chartLegend(.hidden) }
                VStack(spacing: 2) { Text("总账号").font(.caption2).foregroundStyle(.secondary); Text(formatNumber(totalAccounts)).font(.title3.bold()) }
            }.frame(height: 160).padding(.horizontal, 54)
            HStack { ForEach(segments) { item in HStack(spacing: 4) { Circle().fill(item.color).frame(width: 6, height: 6); Text("\(item.name) \(formatCompact(item.value))").font(.caption2) }.frame(maxWidth: .infinity) } }
        }
        .padding(14).glassPanel(cornerRadius: 18)
    }

    private var modelCard: some View {
        let visible = Array(models.sorted { modelTokens($0) > modelTokens($1) }.prefix(5))
        let maximum = visible.map(modelTokens).max() ?? 0
        return VStack(alignment: .leading, spacing: 13) {
            HStack(spacing: 10) {
                Image(systemName: "externaldrive.badge.bolt.fill").font(.system(size: 16, weight: .semibold)).foregroundStyle(AppPalette.blue)
                    .frame(width: 34, height: 34).background(AppPalette.blue.opacity(0.1), in: Circle())
                VStack(alignment: .leading, spacing: 2) { Text("热点模型").font(.headline); Text("当前时间范围内最活跃的模型").font(.caption).foregroundStyle(.secondary) }
            }
            if visible.isEmpty { Text("暂无模型数据").font(.footnote).foregroundStyle(.secondary).frame(maxWidth: .infinity, minHeight: 80) }
            ForEach(visible) { model in
                VStack(alignment: .leading, spacing: 5) {
                    HStack { Text(model.model).font(.subheadline.bold()).lineLimit(1); Spacer(); Text(formatCompact(modelTokens(model))).font(.subheadline.monospacedDigit().bold()).foregroundStyle(.secondary) }
                    Text("请求 \(formatNumber(model.requests)) · 成本 \(formatCurrency(model.cost))").font(.caption2).foregroundStyle(.secondary)
                    GeometryReader { proxy in ZStack(alignment: .leading) { Capsule().fill(Color(uiColor: .systemGray5)); Capsule().fill(Color(red: 1, green: 0.42, blue: 0.06)).frame(width: maximum > 0 ? max(9, proxy.size.width * modelTokens(model) / maximum) : 0) } }.frame(height: 9)
                }
            }
        }
        .padding(14).glassPanel(cornerRadius: 18)
    }

    private var trendSummaryCard: some View {
        let points = Array(trend.suffix(6).reversed())
        return VStack(alignment: .leading, spacing: 11) {
            HStack { Image(systemName: "chart.line.uptrend.xyaxis").foregroundStyle(AppPalette.blue); VStack(alignment: .leading, spacing: 2) { Text("趋势摘要").font(.headline); Text("最近几个统计点的请求、Token 和成本变化").font(.caption).foregroundStyle(.secondary) } }
            if points.isEmpty { Text("当前时间范围没有趋势数据。").font(.footnote).foregroundStyle(.secondary) }
            ForEach(points) { point in
                VStack(alignment: .leading, spacing: 7) {
                    Text(point.date).font(.caption.weight(.semibold))
                    HStack { summaryValue("请求", formatCompact(point.requests)); summaryValue("Token", formatTokens(point.totalTokens)); summaryValue("成本", formatCurrency(point.cost)) }
                }.padding(10).background(.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 11))
            }
        }
        .padding(14).glassPanel(cornerRadius: 18)
    }

    private func summaryValue(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) { Text(label).font(.caption2).foregroundStyle(.secondary); Text(value).font(.caption.weight(.bold)) }.frame(maxWidth: .infinity, alignment: .leading)
    }

    private func load(refreshing: Bool = false) async {
        guard let service = try? store.adminService() else { return }
        if refreshing { isRefreshing = true } else { isLoading = true }
        defer { isRefreshing = false; isLoading = false }
        do {
            let nextStats = try await service.dashboardStats()
            let dateRange = range.queryRange
            async let nextSettings: AdminSettings? = try? await service.adminSettings()
            async let nextOps: OpsOverview? = try? await service.opsOverview(filters: ["window": "24h"])
            async let nextAccounts: Page<AdminAccount>? = try? await service.accounts()
            async let nextTrend: DashboardTrend? = try? await service.dashboardTrend(start: dateRange.start, end: dateRange.end, granularity: range.granularity)
            async let nextModels: DashboardModelStats? = try? await service.dashboardModels(start: dateRange.start, end: dateRange.end)
            async let nextSnapshot: DashboardSnapshot? = try? await service.dashboardSnapshot(start: dateRange.start, end: dateRange.end, granularity: range.granularity, filters: ["include_stats": "false", "include_trend": "false", "include_model_stats": "false", "include_group_stats": "true"])
            let payload = await (nextSettings, nextOps, nextAccounts, nextTrend, nextModels, nextSnapshot)
            stats = nextStats
            if let value = payload.0 { settings = value }
            if let value = payload.1 { ops = value }
            if let value = payload.2 { accounts = value.items }
            if let value = payload.3 { trend = value.trend }
            if let value = payload.4 { models = value.models }
            if let value = payload.5 { groups = value.groups ?? [] }
            errorMessage = nil
        } catch { errorMessage = error.localizedDescription }
    }

    private var totalAccounts: Double { stats?.totalAccounts ?? Double(accounts.count) }
    private var errorAccounts: Double { max(stats?.errorAccounts ?? 0, Double(accounts.filter(hasError).count)) }
    private var limitedAccounts: Double { Double(accounts.filter(isRateLimited).count) }
    private var normalAccounts: Double { Double(accounts.filter(isNormal).count) }
    private var busyAccounts: Double { Double(accounts.filter { !hasError($0) && !isRateLimited($0) && ($0.currentConcurrency ?? 0) > 0 }.count) }
    private var currentRPM: Double? { stats?.rpm ?? ops?.rpm }
    private var currentTPM: Double? { stats?.tpm }

    private var averageResponse: String {
        if let value = stats?.avgResponseSeconds { return String(format: "%.2fs", value) }
        if let value = stats?.avgResponseTimeMs ?? stats?.averageDurationMs { return String(format: "%.2fs", value / 1_000) }
        if let value = ops?.avgLatencyMs { return String(format: "%.2fs", value / 1_000) }
        let weighted = trend.reduce(into: (duration: 0.0, requests: 0.0, sum: 0.0, count: 0.0)) { result, point in
            guard let duration = point.avgDurationMs ?? point.averageDurationMs ?? point.avgLatencyMs, duration >= 0 else { return }
            let requests = point.requests ?? 0
            result.sum += duration; result.count += 1
            if requests > 0 { result.duration += duration * requests; result.requests += requests }
        }
        if weighted.requests > 0 { return String(format: "%.2fs", weighted.duration / weighted.requests / 1_000) }
        if weighted.count > 0 { return String(format: "%.2fs", weighted.sum / weighted.count / 1_000) }
        return "--"
    }

    private func hasError(_ account: AdminAccount) -> Bool { account.status?.lowercased() == "error" || account.error?.isEmpty == false || account.errorMessage?.isEmpty == false }
    private func isRateLimited(_ account: AdminAccount) -> Bool {
        let extra = account.extra?.objectValue ?? [:]
        if let explicit = extra["is_rate_limited"]?.boolValue ?? extra["isRateLimited"]?.boolValue ?? extra["rate_limited"]?.boolValue ?? extra["rateLimited"]?.boolValue { return explicit }
        if account.isRateLimited == true || ["rate_limited", "rate-limited", "rate_limit", "limited", "throttled", "too_many_requests"].contains(account.status?.lowercased() ?? "") || account.errorCode == 429 || extra.number("error_code", "errorCode", "status_code", "statusCode") == 429 { return true }
        let message = (account.errorMessage ?? account.error ?? "").lowercased()
        let extraMessage = extra.text("error_message", "errorMessage", "message", "reason")?.lowercased() ?? ""
        let hasSignal = [message, extraMessage].contains { $0.contains("rate limit") || $0.contains("rate_limit") || $0.contains("429") || $0.contains("限流") }
        let resetAt = account.rateLimitResetAt ?? extra.text("rate_limit_reset_at", "rateLimitResetAt")
        if let resetAt, let date = ISO8601DateFormatter().date(from: resetAt), date > Date(), hasSignal { return true }
        if let limits = extra["model_rate_limits"]?.objectValue ?? extra["modelRateLimits"]?.objectValue {
            for value in limits.values {
                guard let row = value.objectValue else { continue }
                if row["is_rate_limited"]?.boolValue == true || row["isRateLimited"]?.boolValue == true { return true }
                if ["rate_limited", "limited", "throttled"].contains(row.text("status", "state")?.lowercased() ?? "") { return true }
            }
        }
        return hasSignal && account.rateLimitResetAt != nil
    }
    private func isNormal(_ account: AdminAccount) -> Bool {
        if hasError(account) || isRateLimited(account) || account.schedulable == false || ["inactive", "disabled", "paused", "stop", "stopped"].contains(account.status?.lowercased() ?? "") { return false }
        let pause = account.tempUnschedulableUntil ?? account.extra?.objectValue?.text("temp_unschedulable_until", "tempUnschedulableUntil")
        if let pause, let date = ISO8601DateFormatter().date(from: pause), date > Date() { return false }
        return true
    }

    private func groupMetricValue(_ row: DashboardGroupRow) -> Double { groupMetric == "tokens" ? row.tokens : row.actualCost }
    private func modelTokens(_ model: ModelStat) -> Double { model.totalTokens ?? (model.inputTokens ?? 0) + (model.outputTokens ?? 0) }
    private func pointLabel(_ value: String) -> String { (range == .today || range == .day) ? String(value.dropFirst(11).prefix(2)) : String(value.dropFirst(5).prefix(5)) }
    private func formatNumber(_ value: Double?) -> String { guard let value else { return "--" }; return NumberFormatter.localizedString(from: NSNumber(value: value), number: .decimal) }
    private func formatCompact(_ value: Double?) -> String { guard let value else { return "--" }; return NumberFormatters.compact(value) }
    private func formatTokens(_ value: Double?) -> String { formatCompact(value) }
    private func formatCurrency(_ value: Double?) -> String { guard let value else { return "--" }; return NumberFormatters.currency(value) }

    private func groupColor(_ index: Int) -> Color {
        let colors: [Color] = [Color(red: 0.18, green: 0.49, blue: 0.95), Color(red: 0.04, green: 0.70, blue: 0.49), Color(red: 0.98, green: 0.58, blue: 0.05), Color(red: 0.49, green: 0.32, blue: 0.91), Color(red: 0.03, green: 0.65, blue: 0.75), Color(red: 0.93, green: 0.27, blue: 0.49)]
        return colors[index % colors.count]
    }
}

private struct OverviewMetricCard: View {
    let title: String, value: String, detail: String, symbol: String
    let tint: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Image(systemName: symbol)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(tint)
                    .frame(width: 24, height: 24)
                    .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                Text(title).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.75)
            }
            .font(.caption)
            Text(value).font(.system(.title3, design: .rounded, weight: .bold)).lineLimit(1).minimumScaleFactor(0.7)
            Text(detail).font(.caption2.weight(.semibold)).foregroundStyle(tint).lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, minHeight: 68, alignment: .leading)
        .padding(10)
        .glassPanel(cornerRadius: 14)
    }
}

private struct DashboardLinePoint { let label: String; let value: Double }
private struct DashboardGroupRow { let name: String; let requests: Double; let tokens: Double; let actualCost: Double }
private struct DashboardSegment: Identifiable { let id = UUID(); let name: String; let value: Double; let color: Color }
private struct DashboardBarRow: Identifiable { let id = UUID(); let label: String; let value: Double; let color: Color }

private enum DashboardRange: String, CaseIterable, Identifiable {
    case today
    case day = "24h"
    case week = "7d"
    case month = "30d"
    var id: String { rawValue }
    var label: String { switch self { case .today: "今日"; case .day: "24H"; case .week: "7D"; case .month: "30D" } }
    var granularity: String { self == .today || self == .day ? "hour" : "day" }
    var queryRange: (start: String, end: String) {
        let now = Date(), calendar = Calendar.current
        let start: Date
        switch self {
        case .today: start = calendar.startOfDay(for: now)
        case .day: start = calendar.date(byAdding: .hour, value: -23, to: now) ?? now
        case .week: start = calendar.date(byAdding: .day, value: -6, to: now) ?? now
        case .month: start = calendar.date(byAdding: .day, value: -29, to: now) ?? now
        }
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "yyyy-MM-dd"
        return (formatter.string(from: start), formatter.string(from: now))
    }
}
