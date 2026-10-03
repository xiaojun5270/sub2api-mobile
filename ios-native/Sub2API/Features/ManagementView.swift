import SwiftUI

struct ManagementHubView: View {
    @EnvironmentObject private var store: AppStore
    @State private var stats: DashboardStats?

    private let modules = [
        ManagementModule(title: "账号管理", subtitle: "筛选、授权、调度、配额和批量工具", symbol: "shield.checkered", tint: AppPalette.teal, destination: .accounts),
        ManagementModule(title: "API 密钥", subtitle: "创建、编辑、额度、分组和使用趋势", symbol: "key.fill", tint: AppPalette.blue, destination: .apiKeys),
        ManagementModule(title: "分组管理", subtitle: "容量、费率、路由策略和启停", symbol: "folder.fill", tint: .cyan, destination: .groups),
        ManagementModule(title: "使用记录", subtitle: "多条件查询、统计和清理任务", symbol: "clock.arrow.circlepath", tint: AppPalette.orange, destination: .usage),
        ManagementModule(title: "运维监控", subtitle: "资源、并发、错误、日志和告警", symbol: "waveform.path.ecg", tint: AppPalette.purple, destination: .ops),
        ManagementModule(title: "订阅管理", subtitle: "分配、延期、撤销、恢复与配额", symbol: "creditcard", tint: .indigo, destination: .web(.subscriptions)),
        ManagementModule(title: "公告", subtitle: "发布、编辑与阅读状态", symbol: "megaphone", tint: .orange, destination: .web(.announcements)),
        ManagementModule(title: "IP / 代理管理", subtitle: "代理测试、质量、统计与账号关联", symbol: "network", tint: .cyan, destination: .web(.proxies)),
        ManagementModule(title: "兑换码", subtitle: "生成、批量管理、过期与导出", symbol: "ticket", tint: .green, destination: .web(.redeemCodes)),
        ManagementModule(title: "优惠码", subtitle: "优惠规则、状态与使用明细", symbol: "tag", tint: .pink, destination: .web(.promoCodes)),
        ManagementModule(title: "渠道管理", subtitle: "渠道、模型价格和路由配置", symbol: "point.3.connected.trianglepath.dotted", tint: AppPalette.blue, destination: .web(.channels)),
        ManagementModule(title: "渠道监控", subtitle: "监控任务、运行和历史", symbol: "waveform.path.ecg.rectangle", tint: AppPalette.purple, destination: .web(.channelMonitors)),
        ManagementModule(title: "操作日志", subtitle: "操作审计、详情与清理", symbol: "list.clipboard", tint: .gray, destination: .web(.auditLogs)),
        ManagementModule(title: "我的账户", subtitle: "个人资料、我的密钥、订阅、兑换与渠道状态", symbol: "person.crop.circle", tint: AppPalette.teal, destination: .personal),
        ManagementModule(title: "系统设置", subtitle: "站点、认证、计费、通知与系统更新", symbol: "gearshape.2", tint: .secondary, destination: .systemSettings)
    ]

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                PageHeader(title: "管理", subtitle: "Sub2API 资源与运维工具", symbol: "square.grid.2x2.fill")
                Grid(horizontalSpacing: 9, verticalSpacing: 9) {
                    GridRow {
                        MetricTile(label: "账号", value: NumberFormatters.compact(stats?.totalAccounts), symbol: "shield", tint: AppPalette.teal)
                        MetricTile(label: "API Key", value: NumberFormatters.compact(stats?.totalAPIKeys), symbol: "key", tint: AppPalette.blue)
                    }
                    GridRow {
                        MetricTile(label: "今日请求", value: NumberFormatters.compact(stats?.todayRequests), symbol: "arrow.up.arrow.down", tint: AppPalette.purple)
                        MetricTile(label: "异常账号", value: NumberFormatters.compact(stats?.errorAccounts), symbol: "exclamationmark.triangle", tint: AppPalette.orange)
                    }
                }
                ForEach(modules) { module in
                    NavigationLink(value: module.destination) {
                        HStack(spacing: 13) {
                            Image(systemName: module.symbol).font(.title3.weight(.semibold)).foregroundStyle(module.tint)
                                .frame(width: 42, height: 42).background(module.tint.opacity(0.1), in: RoundedRectangle(cornerRadius: 13))
                            VStack(alignment: .leading, spacing: 4) {
                                Text(module.title).font(.headline)
                                Text(module.subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                            }
                            Spacer()
                            Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
                        }
                        .padding(15).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .glassPanel(cornerRadius: 18, interactive: true)
                }
            }
            .padding(.horizontal, 16).padding(.top, 12).padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .navigationBarHidden(true)
        .navigationDestination(for: ManagementDestination.self) { destination in
            switch destination {
            case .accounts: AccountsView()
            case .apiKeys: APIKeysView()
            case .groups: GroupsView()
            case .usage: UsageRecordsView()
            case .ops: OpsView()
            case let .web(module): WebConsoleListView(module: module)
            case .systemSettings: SystemSettingsView()
            case .personal: PersonalConsoleView()
            }
        }
        .appPage()
        .task(id: store.activeServerID) {
            guard let service = try? store.adminService() else { return }
            stats = try? await service.dashboardStats()
        }
    }
}

private struct ManagementModule: Identifiable {
    var id: ManagementDestination { destination }
    let title: String
    let subtitle: String
    let symbol: String
    let tint: Color
    let destination: ManagementDestination
}

private enum ManagementDestination: Hashable { case accounts, apiKeys, groups, usage, ops, web(WebConsoleModule), systemSettings, personal }
