import Charts
import SwiftUI

struct DashboardView: View {
    @EnvironmentObject private var store: AppStore
    @State private var range: DashboardRange = .day
    @State private var stats: DashboardStats?
    @State private var usage: UsageSummary?
    @State private var trend: [TrendPoint] = []
    @State private var accounts: [AdminAccount] = []
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
        }
        .padding(16)
        .glassPanel()
    }

    private func load() async {
        guard let client = try? store.client() else { return }
        isLoading = true
        errorMessage = nil
        do {
            let dateRange = range.queryRange
            async let nextStats: DashboardStats = client.get("/api/v1/admin/dashboard/stats")
            async let nextUsage: UsageSummary = client.get(
                "/api/v1/admin/usage/stats",
                query: [
                    URLQueryItem(name: "start_date", value: dateRange.start),
                    URLQueryItem(name: "end_date", value: dateRange.end)
                ]
            )
            async let nextTrend: DashboardTrend = client.get(
                "/api/v1/admin/dashboard/trend",
                query: [
                    URLQueryItem(name: "start_date", value: dateRange.start),
                    URLQueryItem(name: "end_date", value: dateRange.end),
                    URLQueryItem(name: "granularity", value: range == .day ? "hour" : "day")
                ]
            )
            async let nextAccounts: Page<AdminAccount> = client.listPage(
                "/api/v1/admin/accounts",
                query: [URLQueryItem(name: "page", value: "1"), URLQueryItem(name: "page_size", value: "100")],
                itemKeys: ["accounts", "items", "data"]
            )
            let result = try await (nextStats, nextUsage, nextTrend, nextAccounts)
            stats = result.0
            usage = result.1
            trend = result.2.trend
            accounts = result.3.items
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

