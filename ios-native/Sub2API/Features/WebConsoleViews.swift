import SwiftUI
import UniformTypeIdentifiers

enum ConsoleLocalization {
    static func field(_ key: String) -> String {
        let labels: [String: String] = [
            "id": "ID", "name": "名称", "title": "标题", "description": "描述", "content": "内容", "status": "状态", "state": "状态",
            "type": "类型", "platform": "平台", "model": "模型", "models": "模型", "code": "代码", "email": "邮箱", "role": "角色",
            "protocol": "协议", "host": "主机", "port": "端口", "username": "用户名", "password": "密码",
            "account_count": "关联账号数", "backup_proxy_id": "备用代理", "fallback_mode": "到期后连接方式",
            "expiry_warn_days": "到期提醒天数", "expires_at": "到期时间", "created_at": "创建时间", "updated_at": "更新时间",
            "city": "城市", "region": "地区", "country": "国家或地区", "country_code": "国家代码", "ip_address": "出口 IP",
            "latency_ms": "延迟", "latency_status": "延迟状态", "latency_message": "延迟信息",
            "quality_status": "质量状态", "quality_score": "质量评分", "quality_grade": "质量等级",
            "quality_summary": "质量摘要", "quality_checked": "检测项目数", "success": "是否成功", "message": "信息",
            "target": "检测目标", "http_status": "HTTP 状态码", "cf_ray": "Cloudflare Ray", "exit_ip": "出口 IP",
            "base_latency_ms": "基础延迟", "passed_count": "通过数", "warn_count": "警告数", "failed_count": "失败数",
            "challenge_count": "验证挑战数", "checked_at": "检测时间", "items": "检测明细",
            "provider": "供应商", "api_mode": "API 模式", "check_mode": "检测模式", "endpoint": "接口地址",
            "primary_model": "主模型", "extra_models": "附加模型", "group_name": "显示分组", "enabled": "已启用",
            "interval_seconds": "检测间隔（秒）", "jitter_seconds": "随机抖动（秒）", "availability_7d": "7 天可用率",
            "primary_status": "主模型状态", "primary_latency_ms": "主模型延迟", "last_checked_at": "最后检测时间",
            "billing_model_source": "计费模型来源", "restrict_models": "限制模型", "group_ids": "绑定分组",
            "model_pricing": "模型定价", "model_mapping": "模型映射", "features_config": "功能配置",
            "evaluation_interval_seconds": "评估间隔（秒）", "events_open": "未恢复事件", "events_total": "事件总数",
            "request_count_total": "请求总数", "error_count_total": "错误总数", "error_rate": "错误率",
            "health_score": "健康评分", "qps_current": "当前每秒请求", "tps_current": "当前每秒 Token",
            "cpu_usage_percent": "CPU 使用率", "memory_usage_percent": "内存使用率", "memory_used_mb": "已用内存",
            "memory_total_mb": "总内存", "db_ok": "数据库正常", "redis_ok": "Redis 正常", "goroutine_count": "协程数",
            "current_concurrency": "当前并发", "max_concurrency": "最大并发", "queue_size": "排队数量",
            "total_requests": "总请求", "total_tokens": "总 Token", "total_cost": "总成本", "actual_cost": "实际成本",
            "input_tokens": "输入 Token", "output_tokens": "输出 Token", "cache_read_tokens": "缓存读取 Token",
            "user_id": "用户 ID", "account_id": "账号 ID", "group_id": "分组 ID", "channel_id": "渠道 ID",
            "sort_order": "排序", "value": "值", "count": "数量", "total": "总数", "page": "页码", "page_size": "每页数量",
            "source": "数据来源", "five_hour": "5 小时额度", "seven_day": "7 天额度", "seven_day_sonnet": "Sonnet 7 天额度",
            "antigravity_quota": "Antigravity 模型额度", "antigravity_quota_details": "模型能力详情",
            "subscription_tier": "订阅等级", "subscription_tier_raw": "原始订阅等级", "ai_credits": "AI 点数",
            "utilization": "使用率", "reset_time": "重置时间", "resets_at": "重置时间", "remaining_seconds": "剩余秒数",
            "display_name": "显示名称", "recommended": "推荐模型", "supports_images": "支持图片", "supports_thinking": "支持思考",
            "max_tokens": "最大 Token", "max_output_tokens": "最大输出 Token", "credit_type": "点数类型",
            "amount": "数量", "minimum_balance": "最低余额", "is_forbidden": "上游禁止", "forbidden_reason": "禁止原因"
        ]
        if let label = labels[key] { return label }
        if key.contains("-") || key.contains(".") { return key }
        return "其他信息"
    }

    static func status(_ value: String) -> String {
        switch value.lowercased() {
        case "active", "enabled": "启用"
        case "inactive", "disabled": "停用"
        case "expired": "已过期"
        case "success", "healthy", "operational", "pass", "passed": "正常"
        case "warn", "warning", "degraded": "警告"
        case "critical", "fatal": "严重"
        case "info": "信息"
        case "debug": "调试"
        case "firing": "触发中"
        case "resolved": "已恢复"
        case "manual_resolved": "手动恢复"
        case "queued": "排队中"
        case "challenge": "需要验证"
        case "failed", "failure", "error": "失败"
        case "pending": "等待中"
        case "running": "运行中"
        case "completed": "已完成"
        default: value
        }
    }

    static func value(_ value: JSONValue, key: String) -> String {
        if ["status", "state", "quality_status", "latency_status", "primary_status"].contains(key), let text = value.stringValue {
            return status(text)
        }
        if case let .bool(flag) = value { return flag ? "是" : "否" }
        if key == "protocol", let text = value.stringValue { return text.uppercased() }
        if ["provider", "platform"].contains(key), let text = value.stringValue { return provider(text) }
        if key == "fallback_mode", let text = value.stringValue { return ["none": "无", "proxy": "备用代理", "direct": "直连"][text] ?? text }
        if key == "check_mode", let text = value.stringValue { return ["probe": "探活", "quota": "仅配额", "quota_probe": "探活 + 配额"][text] ?? text }
        if key == "api_mode", let text = value.stringValue { return ["chat_completions": "Chat Completions", "responses": "Responses"][text] ?? text }
        if ["message", "quality_summary", "latency_message", "error"].contains(key), let text = value.stringValue { return phrase(text) }
        if key.hasSuffix("_at"), let text = value.stringValue, let date = parseDate(text) {
            let formatter = DateFormatter(); formatter.dateFormat = "yyyy-MM-dd HH:mm"
            return formatter.string(from: date)
        }
        return value.displayText
    }

    private static func parseDate(_ text: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: text) { return date }
        return ISO8601DateFormatter().date(from: text)
    }

    static func error(_ message: String) -> String {
        phrase(message)
    }

    static func provider(_ value: String) -> String {
        switch value.lowercased() {
        case "openai": "OpenAI"
        case "anthropic": "Anthropic"
        case "gemini": "Gemini"
        case "antigravity": "Antigravity"
        case "grok", "xai": "Grok"
        case "kimi": "Kimi"
        case "zhipu": "智谱"
        case "deepseek": "DeepSeek"
        case "minimax": "MiniMax"
        case "opencode_go": "OpenCode Go"
        case "typesafe": "TypeSafe"
        case "composite": "复合渠道"
        default: value
        }
    }

    static func accountType(_ value: String) -> String {
        switch value.lowercased() {
        case "apikey": "API 密钥"
        case "oauth": "OAuth"
        case "setup-token": "设置令牌"
        case "service_account": "服务账号"
        case "bedrock": "Bedrock"
        case "upstream": "上游接口"
        default: value
        }
    }

    static func oauthMethod(_ value: String) -> String {
        switch value {
        case "manual": "手动凭证"
        case "authorization": "手动授权"
        case "session-key": "会话密钥"
        case "refresh-token": "刷新令牌"
        case "mobile-refresh-token": "移动端刷新令牌"
        case "codex-session": "Codex 会话"
        case "agent-identity": "Agent Identity 文件"
        case "codex-pat": "Codex 个人访问令牌"
        default: value
        }
    }

    private static func phrase(_ message: String) -> String {
        let replacements = [
            "Session network fingerprint changed, please login again": "会话网络指纹已变化，请重新登录",
            "Invalid proxy ID": "代理 ID 无效",
            "Proxy not found": "未找到代理",
            "Failed to test proxy": "代理连接测试失败",
            "Failed to check proxy quality": "代理质量检测失败",
            "Request failed": "请求失败",
            "Proxy connection successful": "代理连接成功",
            "Connection successful": "连接成功",
            "Proxy is working": "代理工作正常",
            "All checks passed": "全部检测通过",
            "Healthy": "正常"
        ]
        return replacements.reduce(message) { result, item in result.replacingOccurrences(of: item.key, with: item.value) }
    }
}

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
        case .proxies: ["name": .string(""), "protocol": .string("http"), "host": .string(""), "port": .number(0), "username": .string(""), "password": .string(""), "status": .string("active")]
        case .redeemCodes: ["count": .number(1), "type": .string("balance"), "value": .number(0), "expires_in_days": .number(30)]
        case .promoCodes: ["code": .string(""), "bonus_amount": .number(0), "max_uses": .number(0), "expires_at": .null, "notes": .string(""), "status": .string("active")]
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
    @State private var proxyEditor: ProxyEditorState?
    @State private var channelEditor: ChannelEditorState?
    @State private var monitorEditor: ChannelMonitorEditorState?
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
                else {
                    ForEach(records) { record in
                        if module == .proxies {
                            ConsoleRecordCard(
                                module: module,
                                record: record,
                                onProxyTest: { Task { await performProxyAction("test", record: record) } },
                                onProxyQuality: { Task { await performProxyAction("quality-check", record: record) } },
                                onProxyEdit: { proxyEditor = ProxyEditorState(record: record) },
                                onProxyDelete: { deleting = record }
                            )
                            .contextMenu { recordMenu(record) }
                        } else {
                            ConsoleRecordCard(module: module, record: record)
                                .onTapGesture { showDetail(record) }
                                .contextMenu { recordMenu(record) }
                        }
                    }
                }
                HStack { Button("上一页") { page -= 1; Task { await load() } }.disabled(page <= 1); Spacer(); Text("第 \(page) / \(pages) 页").font(.caption).foregroundStyle(.secondary); Spacer(); Button("下一页") { page += 1; Task { await load() } }.disabled(page >= pages) }.padding(12).glassPanel(cornerRadius: 16)
            }.padding(16)
        }
        .searchable(text: $search, prompt: "搜索\(module.title)")
        .onSubmit(of: .search) { page = 1; Task { await load() } }
        .refreshable { await load() }
        .navigationTitle(module.title)
        .toolbar { ToolbarItemGroup(placement: .primaryAction) { if module == .auditLogs { Button(role: .destructive) { clearsAudit = true } label: { Image(systemName: "trash") } }; if module.canCreate { Button { openCreateEditor() } label: { Image(systemName: "plus") } } } }
        .sheet(item: $editor, onDismiss: { Task { await load() } }) { ConsoleJSONEditor(state: $0) }
        .sheet(item: $proxyEditor, onDismiss: { Task { await load() } }) { ProxyEditorView(state: $0) }
        .sheet(item: $channelEditor, onDismiss: { Task { await load() } }) { ChannelEditorView(state: $0) }
        .sheet(item: $monitorEditor, onDismiss: { Task { await load() } }) { ChannelMonitorEditorView(state: $0) }
        .sheet(item: $detail) { ConsoleDetailView(state: $0) }
        .confirmationDialog("确认删除？", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) { Button("删除", role: .destructive) { if let deleting { Task { await delete(deleting) } } } }
        .alert("清理操作日志", isPresented: $clearsAudit) { SecureField("TOTP 验证码", text: Binding(get: { auditCode }, set: { auditCode = $0 })); Button("取消", role: .cancel) {}; Button("清理", role: .destructive) { Task { await clearAudit() } } } message: { Text("此操作需要管理员 TOTP 验证码。") }
        .appPage().task(id: "\(store.activeServerID?.uuidString ?? "")-\(module.rawValue)") { await load() }
    }

    @State private var auditCode = ""

    @ViewBuilder private func recordMenu(_ record: DynamicRecord) -> some View {
        Button { showDetail(record) } label: { Label("详情", systemImage: "info.circle") }
        if module.canEdit { Button { openEditEditor(record) } label: { Label("编辑", systemImage: "pencil") } }
        ForEach(actions(for: record)) { action in Button(role: action.destructive ? .destructive : nil) { Task { await perform(action, record: record) } } label: { Label(action.title, systemImage: action.symbol) } }
        if module.canDelete { Divider(); Button(role: .destructive) { deleting = record } label: { Label("删除", systemImage: "trash") } }
    }

    private func actions(for record: DynamicRecord) -> [ConsoleAction] {
        switch module {
        case .subscriptions: return [ConsoleAction(title: "延期", symbol: "calendar.badge.plus", suffix: "extend", body: ["days": .number(30)]), ConsoleAction(title: "重置配额", symbol: "arrow.counterclockwise", suffix: "reset-quota"), ConsoleAction(title: "撤销", symbol: "xmark.circle", suffix: "revoke", destructive: true), ConsoleAction(title: "恢复", symbol: "arrow.uturn.backward.circle", suffix: "restore")]
        case .announcements: return [ConsoleAction(title: "阅读状态", symbol: "eye", suffix: "read-status", method: .get, showsResult: true)]
        case .proxies: return [ConsoleAction(title: "测试连接", symbol: "checkmark.circle", suffix: "test", showsResult: true), ConsoleAction(title: "质量检测", symbol: "checkmark.shield", suffix: "quality-check", showsResult: true), ConsoleAction(title: "统计", symbol: "chart.bar", suffix: "stats", method: .get, showsResult: true), ConsoleAction(title: "关联账号", symbol: "server.rack", suffix: "accounts", method: .get, showsResult: true)]
        case .redeemCodes: return [ConsoleAction(title: "立即过期", symbol: "clock.badge.xmark", suffix: "expire", destructive: true)]
        case .promoCodes: return [ConsoleAction(title: "使用明细", symbol: "list.bullet", suffix: "usages", method: .get, showsResult: true)]
        case .channels: return [ConsoleAction(title: "模型价格", symbol: "dollarsign.circle", suffix: "model-pricing", method: .get, showsResult: true)]
        case .channelMonitors: return [ConsoleAction(title: "立即运行", symbol: "play.fill", suffix: "run"), ConsoleAction(title: "复制", symbol: "doc.on.doc", suffix: "duplicate"), ConsoleAction(title: "历史", symbol: "clock.arrow.circlepath", suffix: "history", method: .get, showsResult: true)]
        case .auditLogs: return []
        }
    }

    private func openCreateEditor() {
        switch module {
        case .proxies: proxyEditor = ProxyEditorState(record: nil)
        case .channels: channelEditor = ChannelEditorState(record: nil)
        case .channelMonitors: monitorEditor = ChannelMonitorEditorState(record: nil)
        default: editor = ConsoleEditorState(title: "创建\(module.title)", path: module.createPath, method: .post, object: module.createTemplate)
        }
    }

    private func openEditEditor(_ record: DynamicRecord) {
        switch module {
        case .proxies: proxyEditor = ProxyEditorState(record: record)
        case .channels: channelEditor = ChannelEditorState(record: record)
        case .channelMonitors: monitorEditor = ChannelMonitorEditorState(record: record)
        default: editor = ConsoleEditorState(title: "编辑\(module.title)", path: "\(module.path)/\(record.id)", method: .put, object: record.object)
        }
    }

    private func load() async { guard let service = try? store.adminService() else { return }; isLoading = true; do { let result = try await service.dynamicPage(module.path, page: page, search: search, itemKeys: module.itemKeys); records = result.items; total = result.total; pages = max(result.pages, Int(ceil(Double(total) / 20))); errorMessage = nil } catch { errorMessage = ConsoleLocalization.error(error.localizedDescription) }; isLoading = false }
    private func showDetail(_ record: DynamicRecord) { detail = ConsoleDetailState(title: record.text("name", "title", "code", "email") ?? "\(module.title)详情", value: .object(record.object)) }
    private func delete(_ record: DynamicRecord) async { guard let service = try? store.adminService() else { return }; deleting = nil; do { try await service.dynamicDelete("\(module.path)/\(record.id)"); await load() } catch { message = ConsoleLocalization.error(error.localizedDescription) } }
    private func perform(_ action: ConsoleAction, record: DynamicRecord) async {
        guard let service = try? store.adminService() else { return }
        let path = "\(module.path)/\(record.id)/\(action.suffix)"
        do {
            if action.method == .get {
                let value = try await service.dynamicGet(path, query: action.suffix == "usages" ? ["page": "1", "page_size": "100"] : [:])
                if action.showsResult { detail = ConsoleDetailState(title: action.title, value: value) }
            } else if action.showsResult {
                let value = try await service.dynamicCreate(path, body: action.body)
                detail = ConsoleDetailState(title: action.title, value: value)
            } else {
                try await service.dynamicAction(path, method: action.method, body: action.body)
                message = "\(action.title)已完成"
                await load()
            }
            if module == .proxies && action.showsResult { await load() }
        } catch {
            message = ConsoleLocalization.error(error.localizedDescription)
        }
    }
    private func performProxyAction(_ suffix: String, record: DynamicRecord) async {
        guard let action = actions(for: record).first(where: { $0.suffix == suffix }) else { return }
        await perform(action, record: record)
    }
    private func clearAudit() async { guard let service = try? store.adminService() else { return }; do { try await service.dynamicAction("/api/v1/admin/audit-logs/clear", body: ["totp_code": .string(auditCode)]); auditCode = ""; await load() } catch { message = error.localizedDescription } }
}

private struct ConsoleRecordCard: View {
    let module: WebConsoleModule
    let record: DynamicRecord
    var onProxyTest: (() -> Void)? = nil
    var onProxyQuality: (() -> Void)? = nil
    var onProxyEdit: (() -> Void)? = nil
    var onProxyDelete: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Image(systemName: module.symbol).foregroundStyle(module.color)
                VStack(alignment: .leading, spacing: 3) {
                    Text(record.text("name", "title", "code", "email", "action") ?? "#\(record.id)").font(.subheadline.bold()).lineLimit(2)
                    Text(subtitleText).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                }
                Spacer()
                if let status = record.text("status", "state") { StatusPill(text: ConsoleLocalization.status(status), color: statusColor(status)) }
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 110), spacing: 7)], spacing: 7) {
                ForEach(summaryFields, id: \.0) { label, value in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(label).font(.caption2).foregroundStyle(.secondary)
                        Text(value).font(.caption.weight(.semibold)).lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(8)
                    .background(.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 8))
                }
            }
            if module == .proxies {
                Divider()
                HStack(spacing: 4) {
                    proxyAction("测试连接", symbol: "checkmark.circle", color: AppPalette.teal, action: onProxyTest)
                    proxyAction("质量检测", symbol: "checkmark.shield", color: AppPalette.blue, action: onProxyQuality)
                    proxyAction("编辑", symbol: "pencil", color: .secondary, action: onProxyEdit)
                    proxyAction("删除", symbol: "trash", color: .red, action: onProxyDelete)
                }
            }
        }
        .padding(14)
        .contentShape(Rectangle())
        .glassPanel(cornerRadius: 18, interactive: true)
    }

    private func proxyAction(_ title: String, symbol: String, color: Color, action: (() -> Void)?) -> some View {
        Button { action?() } label: {
            VStack(spacing: 4) {
                Image(systemName: symbol).font(.subheadline.weight(.medium))
                Text(title).font(.caption2).lineLimit(1).minimumScaleFactor(0.75)
            }
            .foregroundStyle(color)
            .frame(maxWidth: .infinity, minHeight: 42)
        }
        .buttonStyle(.plain)
        .disabled(action == nil)
    }

    private var summaryFields: [(String, String)] { let skip = Set(["id", "name", "title", "description", "content", "status", "state", "created_at", "updated_at"]); return record.object.keys.sorted().filter { !skip.contains($0) && record.object[$0]?.objectValue == nil && record.object[$0]?.arrayValue == nil }.prefix(6).map { key in (ConsoleLocalization.field(key), record.object[key].map { ConsoleLocalization.value($0, key: key) } ?? "--") } }
    private var subtitleText: String {
        if let text = record.text("description", "content", "url", "proxy_url") { return text }
        if let value = record.object["created_at"] { return ConsoleLocalization.value(value, key: "created_at") }
        if let value = record.object["createdAt"] { return ConsoleLocalization.value(value, key: "created_at") }
        return "ID \(record.id)"
    }
    private func statusColor(_ value: String) -> Color { ["active", "enabled", "success", "completed", "valid"].contains(value.lowercased()) ? .green : ["failed", "error", "revoked", "expired", "disabled"].contains(value.lowercased()) ? .red : .secondary }
}

private struct ConsoleAction: Identifiable {
    let id = UUID(); let title: String; let symbol: String; let suffix: String; var method: HTTPMethod = .post; var body: [String: JSONValue] = [:]; var destructive = false; var showsResult = false
}

private struct ConsoleEditorState: Identifiable { let id = UUID(); let title: String; let path: String; let method: HTTPMethod; let object: [String: JSONValue] }
private struct ProxyEditorState: Identifiable { let id = UUID(); let record: DynamicRecord? }
private struct ChannelEditorState: Identifiable { let id = UUID(); let record: DynamicRecord? }
private struct ChannelMonitorEditorState: Identifiable { let id = UUID(); let record: DynamicRecord? }
private struct ConsoleDetailState: Identifiable { let id = UUID(); let title: String; let value: JSONValue }

private struct ProxyEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    let state: ProxyEditorState
    @State private var name: String
    @State private var proxyProtocol: String
    @State private var host: String
    @State private var port: String
    @State private var username: String
    @State private var password = ""
    @State private var passwordDirty = false
    @State private var status: String
    @State private var hasExpiry: Bool
    @State private var expiryDate: Date
    @State private var expiryWarnDays: String
    @State private var fallbackMode: String
    @State private var backupProxyID: String
    @State private var backupProxies: [DynamicRecord] = []
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(state: ProxyEditorState) {
        self.state = state
        let object = state.record?.object ?? [:]
        let expiresAt = object.text("expires_at")
        _name = State(initialValue: object.text("name") ?? "")
        _proxyProtocol = State(initialValue: object.text("protocol") ?? "http")
        _host = State(initialValue: object.text("host") ?? "")
        _port = State(initialValue: object.number("port").map { String(Int($0)) } ?? "8080")
        _username = State(initialValue: object.text("username") ?? "")
        _status = State(initialValue: object.text("status") == "inactive" ? "inactive" : "active")
        _hasExpiry = State(initialValue: expiresAt != nil)
        _expiryDate = State(initialValue: Self.parseDate(expiresAt) ?? Calendar.current.date(byAdding: .day, value: 30, to: Date()) ?? Date())
        _expiryWarnDays = State(initialValue: object.number("expiry_warn_days").map { String(Int($0)) } ?? "7")
        _fallbackMode = State(initialValue: object.text("fallback_mode") ?? "none")
        _backupProxyID = State(initialValue: object.number("backup_proxy_id").map { String(Int($0)) } ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("代理信息") {
                    TextField("名称", text: $name)
                    Picker("协议", selection: $proxyProtocol) {
                        Text("HTTP").tag("http")
                        Text("HTTPS").tag("https")
                        Text("SOCKS5").tag("socks5")
                        Text("SOCKS5H").tag("socks5h")
                    }
                    TextField("主机 / IP", text: $host)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    TextField("端口", text: $port)
                        .keyboardType(.numberPad)
                    if state.record != nil {
                        Picker("状态", selection: $status) {
                            Text("启用").tag("active")
                            Text("停用").tag("inactive")
                        }
                    }
                }

                Section("身份验证") {
                    TextField("用户名（可选）", text: $username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField(state.record == nil ? "密码（可选）" : "新密码（留空不修改）", text: $password)
                        .textContentType(.password)
                        .onChange(of: password) { _, _ in passwordDirty = true }
                }

                Section("有效期") {
                    Toggle("设置到期日", isOn: $hasExpiry)
                    if hasExpiry {
                        DatePicker("到期日期", selection: $expiryDate, displayedComponents: .date)
                    }
                    TextField("提前提醒天数", text: $expiryWarnDays)
                        .keyboardType(.numberPad)
                }

                Section("到期后连接方式") {
                    Picker("兜底模式", selection: $fallbackMode) {
                        Text("无").tag("none")
                        Text("备用代理").tag("proxy")
                        Text("直连").tag("direct")
                    }
                    if fallbackMode == "proxy" {
                        Picker("备用代理", selection: $backupProxyID) {
                            Text("请选择").tag("")
                            ForEach(backupProxies) { proxy in
                                Text(proxyLabel(proxy)).tag(proxy.id)
                            }
                        }
                    }
                }

                if let errorMessage {
                    Section { Text(errorMessage).foregroundStyle(.red) }
                }
            }
            .navigationTitle(state.record == nil ? "添加代理" : "编辑代理")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "保存中" : "保存") { save() }
                        .disabled(isSaving || name.nilIfBlank == nil || host.nilIfBlank == nil || !(1...65535).contains(Int(port) ?? 0) || (fallbackMode == "proxy" && backupProxyID.isEmpty))
                }
            }
            .task { await loadBackupProxies() }
        }
    }

    private func save() {
        guard let service = try? store.adminService(), let portValue = Int(port) else { return }
        isSaving = true
        errorMessage = nil
        Task {
            do {
                var body: [String: JSONValue] = [
                    "name": .string(name.trimmingCharacters(in: .whitespacesAndNewlines)),
                    "protocol": .string(proxyProtocol),
                    "host": .string(host.trimmingCharacters(in: .whitespacesAndNewlines)),
                    "port": .number(Double(portValue)),
                    "username": .string(username.trimmingCharacters(in: .whitespacesAndNewlines)),
                    "fallback_mode": .string(fallbackMode),
                    "backup_proxy_id": fallbackMode == "proxy" ? .number(Double(Int(backupProxyID) ?? 0)) : .null,
                    "expiry_warn_days": .number(Double(Int(expiryWarnDays) ?? 7))
                ]
                body["expires_at"] = hasExpiry ? .number(expiryTimestamp) : .null
                if state.record == nil || passwordDirty { body["password"] = .string(password.trimmingCharacters(in: .whitespacesAndNewlines)) }
                if let record = state.record {
                    body["status"] = .string(status)
                    _ = try await service.dynamicUpdate("/api/v1/admin/proxies/\(record.id)", body: body)
                } else {
                    _ = try await service.dynamicCreate("/api/v1/admin/proxies", body: body)
                }
                dismiss()
            } catch {
                errorMessage = error.localizedDescription
            }
            isSaving = false
        }
    }

    private func loadBackupProxies() async {
        guard let service = try? store.adminService() else { return }
        guard let value = try? await service.dynamicGet("/api/v1/admin/proxies/all", query: ["with_count": "true"]) else { return }
        var rows = value.arrayValue ?? []
        if rows.isEmpty, let object = value.objectValue {
            rows = object.rows("items", "proxies", "data").map { .object($0) }
        }
        backupProxies = rows.enumerated().map { DynamicRecord(value: $0.element, index: $0.offset) }.filter { $0.id != state.record?.id }
    }

    private var expiryTimestamp: Double {
        Calendar.current.startOfDay(for: expiryDate).timeIntervalSince1970
    }

    private func proxyLabel(_ proxy: DynamicRecord) -> String {
        let name = proxy.text("name") ?? "代理 #\(proxy.id)"
        let address = "\(proxy.text("host") ?? "--"):\(Int(proxy.number("port") ?? 0))"
        return "\(name)（\(address)）"
    }

    private static func parseDate(_ value: String?) -> Date? {
        guard let value else { return nil }
        let prefix = String(value.prefix(10))
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: prefix)
    }
}

private struct ChannelPricingDraft: Identifiable {
    let id = UUID()
    var base: [String: JSONValue]
    var platform: String
    var models: String
    var billingMode: String
    var inputPrice: String
    var outputPrice: String
    var cacheWritePrice: String
    var cacheWrite1hPrice: String
    var cacheReadPrice: String
    var imageInputPrice: String
    var imageOutputPrice: String
    var perRequestPrice: String
    var fastMultiplier: String
    var flexMultiplier: String

    init(object: [String: JSONValue] = [:]) {
        base = object
        platform = object.text("platform") ?? "anthropic"
        models = object["models"]?.arrayValue?.compactMap(\.stringValue).joined(separator: ",") ?? ""
        billingMode = object.text("billing_mode") ?? "token"
        inputPrice = Self.perMillion(object.number("input_price"))
        outputPrice = Self.perMillion(object.number("output_price"))
        cacheWritePrice = Self.perMillion(object.number("cache_write_price"))
        cacheWrite1hPrice = Self.perMillion(object.number("cache_write_1h_price"))
        cacheReadPrice = Self.perMillion(object.number("cache_read_price"))
        imageInputPrice = Self.perMillion(object.number("image_input_price"))
        imageOutputPrice = Self.perMillion(object.number("image_output_price"))
        perRequestPrice = object.number("per_request_price").map { String($0) } ?? ""
        fastMultiplier = object.number("fast_multiplier").map { String($0) } ?? ""
        flexMultiplier = object.number("flex_multiplier").map { String($0) } ?? ""
    }

    func requestBody() throws -> [String: JSONValue] {
        let modelList = models.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        guard !modelList.isEmpty else { throw ValidationError("每条模型定价至少需要一个模型。") }
        var body = base
        body["platform"] = .string(platform)
        body["models"] = .array(modelList.map { .string($0) })
        body["billing_mode"] = .string(billingMode)
        try setPerToken(&body, key: "input_price", raw: inputPrice)
        try setPerToken(&body, key: "output_price", raw: outputPrice)
        try setPerToken(&body, key: "cache_write_price", raw: cacheWritePrice)
        try setPerToken(&body, key: "cache_write_1h_price", raw: cacheWrite1hPrice)
        try setPerToken(&body, key: "cache_read_price", raw: cacheReadPrice)
        try setPerToken(&body, key: "image_input_price", raw: imageInputPrice)
        try setPerToken(&body, key: "image_output_price", raw: imageOutputPrice)
        body["per_request_price"] = try FormParsing.number(perRequestPrice).map { .number($0) } ?? .null
        body["fast_multiplier"] = try FormParsing.number(fastMultiplier).map { .number($0) } ?? .null
        body["flex_multiplier"] = try FormParsing.number(flexMultiplier).map { .number($0) } ?? .null
        return body
    }

    private static func perMillion(_ value: Double?) -> String { value.map { String($0 * 1_000_000) } ?? "" }
    private func setPerToken(_ body: inout [String: JSONValue], key: String, raw: String) throws {
        body[key] = try FormParsing.number(raw).map { .number($0 / 1_000_000) } ?? .null
    }
}

private struct ChannelMappingDraft: Identifiable {
    let id = UUID()
    var platform: String
    var source: String
    var target: String
}

private struct ChannelEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    let state: ChannelEditorState
    @State private var name: String
    @State private var description: String
    @State private var status: String
    @State private var billingSource: String
    @State private var restrictModels: Bool
    @State private var applyToAccountStats: Bool
    @State private var selectedGroupIDs: Set<Int>
    @State private var pricing: [ChannelPricingDraft]
    @State private var mappings: [ChannelMappingDraft]
    @State private var features: [String: JSONValue]
    @State private var webSearchEmulation: Bool
    @State private var codexImageBridge: Bool
    @State private var bedrockCompatibility: Bool
    @State private var groups: [AdminGroup] = []
    @State private var isLoadingGroups = false
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(state: ChannelEditorState) {
        self.state = state
        let object = state.record?.object ?? [:]
        let featureObject = object["features_config"]?.objectValue ?? [:]
        _name = State(initialValue: object.text("name") ?? "")
        _description = State(initialValue: object.text("description") ?? "")
        _status = State(initialValue: object.text("status") ?? "active")
        _billingSource = State(initialValue: object.text("billing_model_source") ?? "channel_mapped")
        _restrictModels = State(initialValue: object.flag("restrict_models") ?? false)
        _applyToAccountStats = State(initialValue: object.flag("apply_pricing_to_account_stats") ?? false)
        _selectedGroupIDs = State(initialValue: Set(object["group_ids"]?.arrayValue?.compactMap { value in value.doubleValue.map { Int($0) } } ?? []))
        _pricing = State(initialValue: object["model_pricing"]?.arrayValue?.compactMap(\.objectValue).map { ChannelPricingDraft(object: $0) } ?? [])
        _mappings = State(initialValue: Self.mappingDrafts(object["model_mapping"]?.objectValue ?? [:]))
        _features = State(initialValue: featureObject)
        _webSearchEmulation = State(initialValue: Self.platformFlag(featureObject["web_search_emulation"], platform: "anthropic"))
        _codexImageBridge = State(initialValue: Self.platformFlag(featureObject["codex_image_generation_bridge"], platform: "openai"))
        _bedrockCompatibility = State(initialValue: featureObject["bedrock_cc_compat"]?.boolValue ?? false)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("基本信息") {
                    TextField("渠道名称", text: $name)
                    TextField("描述", text: $description, axis: .vertical)
                    if state.record != nil {
                        Picker("状态", selection: $status) { Text("启用").tag("active"); Text("停用").tag("disabled") }
                    }
                    Picker("计费模型来源", selection: $billingSource) {
                        Text("请求模型").tag("requested")
                        Text("上游模型").tag("upstream")
                        Text("渠道映射后模型").tag("channel_mapped")
                        Text("响应模型").tag("response_model")
                    }
                    Toggle("仅允许定价列表中的模型", isOn: $restrictModels)
                    Toggle("定价应用于账号统计", isOn: $applyToAccountStats)
                }

                Section("绑定分组") {
                    if isLoadingGroups { ProgressView("正在加载分组") }
                    if groups.isEmpty && !isLoadingGroups { Text("暂无可选分组").foregroundStyle(.secondary) }
                    ForEach(groups.sorted(by: groupSort)) { group in
                        Toggle("\(group.name) · \(group.platform)", isOn: groupBinding(group.id))
                    }
                }

                Section("模型定价") {
                    Button { pricing.append(ChannelPricingDraft()) } label: { Label("添加模型定价", systemImage: "plus") }
                    ForEach($pricing) { $entry in
                        DisclosureGroup(entry.models.nilIfBlank ?? "未命名定价") {
                            Picker("平台", selection: $entry.platform) { ForEach(Self.platforms, id: \.self) { Text(ConsoleLocalization.provider($0)).tag($0) } }
                            TextField("模型，逗号分隔", text: $entry.models)
                            Picker("计费模式", selection: $entry.billingMode) { Text("Token").tag("token"); Text("按请求").tag("per_request"); Text("图片").tag("image"); Text("视频").tag("video") }
                            TextField("输入价格 / 1M Token", text: $entry.inputPrice).keyboardType(.decimalPad)
                            TextField("输出价格 / 1M Token", text: $entry.outputPrice).keyboardType(.decimalPad)
                            TextField("缓存写入 / 1M Token", text: $entry.cacheWritePrice).keyboardType(.decimalPad)
                            TextField("1H 缓存写入 / 1M", text: $entry.cacheWrite1hPrice).keyboardType(.decimalPad)
                            TextField("缓存读取 / 1M Token", text: $entry.cacheReadPrice).keyboardType(.decimalPad)
                            TextField("图片输入 / 1M Token", text: $entry.imageInputPrice).keyboardType(.decimalPad)
                            TextField("图片输出 / 1M Token", text: $entry.imageOutputPrice).keyboardType(.decimalPad)
                            TextField("每请求价格", text: $entry.perRequestPrice).keyboardType(.decimalPad)
                            TextField("快速模式倍率", text: $entry.fastMultiplier).keyboardType(.decimalPad)
                            TextField("弹性模式倍率", text: $entry.flexMultiplier).keyboardType(.decimalPad)
                            Button("删除此定价", role: .destructive) { pricing.removeAll { $0.id == entry.id } }
                        }
                    }
                }

                Section("模型映射") {
                    Button { mappings.append(ChannelMappingDraft(platform: "anthropic", source: "", target: "")) } label: { Label("添加模型映射", systemImage: "plus") }
                    ForEach($mappings) { $mapping in
                        DisclosureGroup(mapping.source.nilIfBlank ?? "未命名映射") {
                            Picker("平台", selection: $mapping.platform) { ForEach(Self.platforms, id: \.self) { Text(ConsoleLocalization.provider($0)).tag($0) } }
                            TextField("请求模型 / 匹配模式", text: $mapping.source)
                            TextField("映射到模型", text: $mapping.target)
                            Button("删除此映射", role: .destructive) { mappings.removeAll { $0.id == mapping.id } }
                        }
                    }
                }

                Section("平台功能") {
                    Toggle("Anthropic Web Search 模拟", isOn: $webSearchEmulation)
                    Toggle("OpenAI Codex 图片生成桥接", isOn: $codexImageBridge)
                    Toggle("Bedrock Claude Code 兼容", isOn: $bedrockCompatibility)
                }
                if let errorMessage { Section { Text(errorMessage).foregroundStyle(.red) } }
            }
            .navigationTitle(state.record == nil ? "创建渠道" : "编辑渠道")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button(isSaving ? "保存中" : "保存") { save() }.disabled(isSaving || name.nilIfBlank == nil) }
            }
            .task { await loadGroups() }
        }
    }

    private func save() {
        guard let service = try? store.adminService() else { return }
        isSaving = true
        errorMessage = nil
        Task {
            do {
                var mappingObject: [String: [String: JSONValue]] = [:]
                for mapping in mappings where mapping.source.nilIfBlank != nil && mapping.target.nilIfBlank != nil {
                    mappingObject[mapping.platform, default: [:]][mapping.source.trimmingCharacters(in: .whitespacesAndNewlines)] = .string(mapping.target.trimmingCharacters(in: .whitespacesAndNewlines))
                }
                var nextFeatures = features
                nextFeatures["web_search_emulation"] = .object(["anthropic": .bool(webSearchEmulation)])
                nextFeatures["codex_image_generation_bridge"] = .object(["openai": .bool(codexImageBridge)])
                nextFeatures["bedrock_cc_compat"] = .bool(bedrockCompatibility)
                let pricingValues = try pricing.map { JSONValue.object(try $0.requestBody()) }
                var body: [String: JSONValue] = [
                    "name": .string(name.trimmingCharacters(in: .whitespacesAndNewlines)),
                    "description": .string(description.trimmingCharacters(in: .whitespacesAndNewlines)),
                    "billing_model_source": .string(billingSource),
                    "restrict_models": .bool(restrictModels),
                    "apply_pricing_to_account_stats": .bool(applyToAccountStats),
                    "group_ids": .array(selectedGroupIDs.sorted().map { .number(Double($0)) }),
                    "model_pricing": .array(pricingValues),
                    "model_mapping": .object(mappingObject.mapValues { .object($0) }),
                    "features_config": .object(nextFeatures)
                ]
                if let rules = state.record?.object["account_stats_pricing_rules"] { body["account_stats_pricing_rules"] = rules }
                if let record = state.record {
                    body["status"] = .string(status)
                    _ = try await service.dynamicUpdate("/api/v1/admin/channels/\(record.id)", body: body)
                } else {
                    _ = try await service.dynamicCreate("/api/v1/admin/channels", body: body)
                }
                dismiss()
            } catch { errorMessage = error.localizedDescription }
            isSaving = false
        }
    }

    private func loadGroups() async {
        guard let service = try? store.adminService() else { return }
        isLoadingGroups = true
        do { groups = try await service.allGroups() }
        catch { errorMessage = error.localizedDescription }
        isLoadingGroups = false
    }

    private func groupBinding(_ id: Int) -> Binding<Bool> {
        Binding(get: { selectedGroupIDs.contains(id) }, set: { enabled in if enabled { selectedGroupIDs.insert(id) } else { selectedGroupIDs.remove(id) } })
    }

    private func groupSort(_ left: AdminGroup, _ right: AdminGroup) -> Bool {
        let leftOrder = left.sortOrder ?? Int.max
        let rightOrder = right.sortOrder ?? Int.max
        return leftOrder == rightOrder ? left.name.localizedStandardCompare(right.name) == .orderedAscending : leftOrder < rightOrder
    }
    private static let platforms = ["anthropic", "openai", "gemini", "antigravity", "grok", "kimi", "zhipu", "deepseek", "minimax", "opencode_go", "typesafe", "composite"]
    private static func platformFlag(_ value: JSONValue?, platform: String) -> Bool { value?.objectValue?[platform]?.boolValue ?? value?.boolValue ?? false }
    private static func mappingDrafts(_ object: [String: JSONValue]) -> [ChannelMappingDraft] {
        object.keys.sorted().flatMap { platform in
            (object[platform]?.objectValue ?? [:]).keys.sorted().compactMap { source in
                guard let target = object[platform]?.objectValue?[source]?.stringValue else { return nil }
                return ChannelMappingDraft(platform: platform, source: source, target: target)
            }
        }
    }
}

private struct ChannelMonitorEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    let state: ChannelMonitorEditorState
    @State private var name: String
    @State private var provider: String
    @State private var apiMode: String
    @State private var checkMode: String
    @State private var accountID: String
    @State private var endpoint: String
    @State private var apiKey = ""
    @State private var primaryModel: String
    @State private var extraModels: String
    @State private var groupName: String
    @State private var interval: String
    @State private var jitter: String
    @State private var enabled: Bool
    @State private var templateID: String
    @State private var extraHeaders: String
    @State private var bodyMode: String
    @State private var bodyOverride: String
    @State private var accounts: [AdminAccount] = []
    @State private var templates: [DynamicRecord] = []
    @State private var isLoadingOptions = false
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(state: ChannelMonitorEditorState) {
        self.state = state
        let object = state.record?.object ?? [:]
        _name = State(initialValue: object.text("name") ?? "")
        _provider = State(initialValue: object.text("provider") ?? "anthropic")
        _apiMode = State(initialValue: object.text("api_mode") ?? "chat_completions")
        _checkMode = State(initialValue: object.text("check_mode") ?? "probe")
        _accountID = State(initialValue: object.number("account_id").map { String(Int($0)) } ?? "")
        _endpoint = State(initialValue: object.text("endpoint") ?? "")
        _primaryModel = State(initialValue: object.text("primary_model") ?? "")
        _extraModels = State(initialValue: object["extra_models"]?.arrayValue?.compactMap(\.stringValue).joined(separator: ",") ?? "")
        _groupName = State(initialValue: object.text("group_name") ?? "")
        _interval = State(initialValue: object.number("interval_seconds").map { String(Int($0)) } ?? "60")
        _jitter = State(initialValue: object.number("jitter_seconds").map { String(Int($0)) } ?? "0")
        _enabled = State(initialValue: object.flag("enabled") ?? true)
        _templateID = State(initialValue: object.number("template_id").map { String(Int($0)) } ?? "")
        _extraHeaders = State(initialValue: Self.headerText(object["extra_headers"]?.objectValue ?? [:]))
        _bodyMode = State(initialValue: object.text("body_override_mode") ?? "off")
        _bodyOverride = State(initialValue: Self.prettyJSON(object["body_override"]))
    }

    private var usesQuota: Bool { checkMode != "probe" }
    private var usesProbe: Bool { checkMode != "quota" }
    private var filteredAccounts: [AdminAccount] { accounts.filter { $0.platform == provider }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending } }

    var body: some View {
        NavigationStack {
            Form {
                Section("检测设置") {
                    TextField("名称", text: $name)
                    Picker("检测模式", selection: $checkMode) { Text("探活").tag("probe"); Text("仅配额").tag("quota"); Text("探活 + 配额").tag("quota_probe") }.pickerStyle(.segmented)
                    Picker("供应商", selection: $provider) { ForEach(Self.providers, id: \.self) { Text(ConsoleLocalization.provider($0)).tag($0) } }
                    if provider == "openai" && usesProbe {
                        Picker("OpenAI API 模式", selection: $apiMode) { Text("聊天补全").tag("chat_completions"); Text("响应接口").tag("responses") }
                    }
                    if usesQuota {
                        Picker("关联账号", selection: $accountID) {
                            Text("请选择账号").tag("")
                            if let currentID = Int(accountID), !filteredAccounts.contains(where: { $0.id == currentID }) {
                                Text("账号 #\(currentID)（当前）").tag(accountID)
                            }
                            ForEach(filteredAccounts) { account in Text("\(account.name) · #\(account.id)").tag(String(account.id)) }
                        }
                    }
                }

                if usesProbe {
                    Section("探活请求") {
                        TextField("接口地址", text: $endpoint).textInputAutocapitalization(.never).autocorrectionDisabled()
                        SecureField(state.record == nil ? "API Key" : "新 API Key（留空不修改）", text: $apiKey)
                        TextField("主模型", text: $primaryModel).textInputAutocapitalization(.never)
                        TextField("附加模型，逗号分隔", text: $extraModels).textInputAutocapitalization(.never)
                    }
                }

                Section("调度") {
                    TextField("显示分组名称", text: $groupName)
                    TextField("检测间隔（15-3600 秒）", text: $interval).keyboardType(.numberPad)
                    TextField("随机抖动秒数", text: $jitter).keyboardType(.numberPad)
                    Toggle("启用监控", isOn: $enabled)
                }

                if usesProbe {
                    Section("高级请求配置") {
                        Picker("请求模板", selection: $templateID) {
                            Text("不使用模板").tag("")
                            ForEach(templatesForSelection) { template in Text(template.text("name") ?? "模板 #\(template.id)").tag(template.id) }
                        }
                        Text("额外 Headers，每行 key=value").font(.caption).foregroundStyle(.secondary)
                        TextEditor(text: $extraHeaders).frame(minHeight: 90).font(.caption.monospaced())
                        Picker("请求体覆盖", selection: $bodyMode) { Text("关闭").tag("off"); Text("合并").tag("merge"); Text("替换").tag("replace") }
                        if bodyMode != "off" {
                            TextEditor(text: $bodyOverride).frame(minHeight: 120).font(.caption.monospaced())
                        }
                    }
                }

                if isLoadingOptions { Section { ProgressView("正在加载账号与模板") } }
                if let errorMessage { Section { Text(errorMessage).foregroundStyle(.red) } }
            }
            .navigationTitle(state.record == nil ? "创建渠道监控" : "编辑渠道监控")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button(isSaving ? "保存中" : "保存") { save() }.disabled(isSaving || !canSave) }
            }
            .task { await loadOptions() }
            .onChange(of: provider) { _, value in if value == "antigravity" { checkMode = "quota" } }
            .onChange(of: templateID) { _, _ in applySelectedTemplate() }
        }
    }

    private var canSave: Bool {
        guard name.nilIfBlank != nil, let intervalValue = Int(interval), (15...3600).contains(intervalValue), let jitterValue = Int(jitter), jitterValue >= 0, jitterValue <= max(0, intervalValue - 15) else { return false }
        if usesQuota && accountID.isEmpty { return false }
        if usesProbe && (endpoint.nilIfBlank == nil || primaryModel.nilIfBlank == nil || (state.record == nil && apiKey.nilIfBlank == nil)) { return false }
        return true
    }

    private func save() {
        guard let service = try? store.adminService(), let intervalValue = Int(interval), let jitterValue = Int(jitter) else { return }
        isSaving = true
        errorMessage = nil
        Task {
            do {
                var body: [String: JSONValue] = [
                    "name": .string(name.trimmingCharacters(in: .whitespacesAndNewlines)),
                    "provider": .string(provider),
                    "api_mode": .string(apiMode),
                    "check_mode": .string(checkMode),
                    "endpoint": .string(usesProbe ? endpoint.trimmingCharacters(in: .whitespacesAndNewlines) : ""),
                    "api_key": .string(usesProbe ? apiKey : ""),
                    "primary_model": .string(usesProbe ? primaryModel.trimmingCharacters(in: .whitespacesAndNewlines) : ""),
                    "extra_models": .array(usesProbe ? extraModels.split(separator: ",").map { .string($0.trimmingCharacters(in: .whitespacesAndNewlines)) } : []),
                    "group_name": .string(groupName.trimmingCharacters(in: .whitespacesAndNewlines)),
                    "enabled": .bool(enabled),
                    "interval_seconds": .number(Double(intervalValue)),
                    "jitter_seconds": .number(Double(jitterValue)),
                    "extra_headers": .object(try parseHeaders(extraHeaders)),
                    "body_override_mode": .string(usesProbe ? bodyMode : "off")
                ]
                if usesQuota, let id = Int(accountID) { body["account_id"] = .number(Double(id)) }
                else if state.record != nil { body["account_id"] = .number(0) }
                if let id = Int(templateID), usesProbe { body["template_id"] = .number(Double(id)) }
                else if state.record != nil { body["clear_template"] = .bool(true) }
                body["body_override"] = usesProbe && bodyMode != "off" ? .object(try FormParsing.jsonObject(bodyOverride)) : .null
                if let record = state.record { _ = try await service.dynamicUpdate("/api/v1/admin/channel-monitors/\(record.id)", body: body) }
                else { _ = try await service.dynamicCreate("/api/v1/admin/channel-monitors", body: body) }
                dismiss()
            } catch { errorMessage = error.localizedDescription }
            isSaving = false
        }
    }

    private func loadOptions() async {
        guard let service = try? store.adminService() else { return }
        isLoadingOptions = true
        async let nextAccounts: Page<AdminAccount>? = try? await service.accounts()
        async let nextTemplates: JSONValue? = try? await service.dynamicGet("/api/v1/admin/channel-monitor-templates")
        let values = await (nextAccounts, nextTemplates)
        accounts = values.0?.items ?? []
        if let value = values.1 {
            var rows = value.arrayValue ?? []
            if rows.isEmpty, let object = value.objectValue { rows = object.rows("items", "templates", "data").map { .object($0) } }
            templates = rows.enumerated().map { DynamicRecord(value: $0.element, index: $0.offset) }
        }
        isLoadingOptions = false
    }

    private var templatesForSelection: [DynamicRecord] {
        templates.filter { template in
            template.text("provider") == provider && (provider != "openai" || (template.text("api_mode") ?? "chat_completions") == apiMode)
        }
    }

    private func applySelectedTemplate() {
        guard let selected = templates.first(where: { $0.id == templateID }) else { return }
        extraHeaders = Self.headerText(selected.object["extra_headers"]?.objectValue ?? [:])
        bodyMode = selected.text("body_override_mode") ?? "off"
        bodyOverride = Self.prettyJSON(selected.object["body_override"])
    }

    private func parseHeaders(_ raw: String) throws -> [String: JSONValue] {
        var result: [String: JSONValue] = [:]
        for line in raw.split(whereSeparator: \.isNewline) {
            let text = line.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { continue }
            let parts = text.split(separator: "=", maxSplits: 1).map { String($0) }
            guard parts.count == 2, parts[0].nilIfBlank != nil else { throw ValidationError("Header 格式应为 key=value，每行一个。") }
            result[parts[0].trimmingCharacters(in: .whitespaces)] = .string(parts[1].trimmingCharacters(in: .whitespaces))
        }
        return result
    }

    private static func headerText(_ headers: [String: JSONValue]) -> String { headers.keys.sorted().map { "\($0)=\(headers[$0]?.stringValue ?? "")" }.joined(separator: "\n") }
    private static func prettyJSON(_ value: JSONValue?) -> String { guard let value, value != .null, let data = try? FormParsing.jsonData(value) else { return "{}" }; return String(data: data, encoding: .utf8) ?? "{}" }
    private static let providers = ["anthropic", "openai", "gemini", "grok", "antigravity", "kimi", "zhipu", "deepseek", "minimax", "opencode_go"]
}

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

private struct LegacySystemSettingsView: View {
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

private struct LegacyPersonalConsoleView: View {
    @EnvironmentObject private var store: AppStore
    @State private var data: [String: JSONValue] = [:]
    @State private var editor: AdvancedActionState?
    @State private var errorMessage: String?
    @State private var isLoading = true

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                HStack(spacing: 8) {
                    Button { let object = data["个人资料"]?.objectValue ?? [:]; editor = AdvancedActionState(title: "编辑个人资料", path: "/api/v1/user", method: .put, template: object) } label: { Label("编辑资料", systemImage: "person.crop.circle.badge.checkmark").frame(maxWidth: .infinity) }.buttonStyle(.bordered)
                    Button { editor = AdvancedActionState(title: "兑换", path: "/api/v1/redeem", method: .post, template: ["code": .string("")]) } label: { Label("兑换", systemImage: "giftcard").frame(maxWidth: .infinity) }.buttonStyle(.borderedProminent)
                }
                if isLoading { LoadingView(label: "正在加载个人中心") }
                if let errorMessage { InlineErrorView(message: errorMessage) }
                ForEach(data.keys.sorted(), id: \.self) { key in VStack(alignment: .leading, spacing: 9) { Text(key).font(.headline); DynamicJSONView(value: data[key] ?? .null) }.padding(16).glassPanel() }
            }.padding(16)
        }
        .navigationTitle("我的账户")
        .sheet(item: $editor, onDismiss: { Task { await load() } }) { AdvancedJSONActionEditor(state: $0) }
        .refreshable { await load() }
        .appPage().task { await load() }
    }

    private func load() async {
        guard let service = try? store.adminService() else { return }
        isLoading = true; errorMessage = nil
        async let me: JSONValue? = try? await service.dynamicGet("/api/v1/auth/me")
        async let user: JSONValue? = try? await service.dynamicGet("/api/v1/user")
        async let keys: JSONValue? = try? await service.dynamicGet("/api/v1/keys", query: ["page": "1", "page_size": "100"])
        async let subscriptions: JSONValue? = try? await service.dynamicGet("/api/v1/subscriptions")
        async let channels: JSONValue? = try? await service.dynamicGet("/api/v1/channels/available")
        async let monitors: JSONValue? = try? await service.dynamicGet("/api/v1/channel-monitors")
        let values = await (me, user, keys, subscriptions, channels, monitors)
        if let value = values.0 { data["我的账户"] = value }
        if let value = values.1 { data["个人资料"] = value }
        if let value = values.2 { data["API 密钥"] = value }
        if let value = values.3 { data["我的订阅"] = value }
        if let value = values.4 { data["渠道状态"] = value }
        if let value = values.5 { data["渠道监控"] = value }
        if data.isEmpty { errorMessage = "个人中心需要网页登录 JWT；当前 Admin API Key 只能访问管理员接口。" }
        isLoading = false
    }
}

struct SystemSettingsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var values: [String: JSONValue] = [:]
    @State private var systemInfo: JSONValue?
    @State private var updateInfo: JSONValue?
    @State private var isLoading = true
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var pendingAction: String?

    var body: some View {
        Form {
            if isLoading { Section { HStack { Spacer(); ProgressView(); Text("正在加载设置").foregroundStyle(.secondary); Spacer() } } }
            Section("站点") {
                TextField("站点名称", text: textBinding("site_name"))
                TextField("站点副标题", text: textBinding("site_subtitle"))
                TextField("站点 Logo 地址", text: textBinding("site_logo")).textInputAutocapitalization(.never)
                TextField("API 基础地址", text: textBinding("api_base_url")).textInputAutocapitalization(.never)
                TextField("联系方式", text: textBinding("contact_info"))
                TextField("文档地址", text: textBinding("doc_url")).textInputAutocapitalization(.never)
                Toggle("紧凑首页", isOn: boolBinding("compact_home_enabled"))
            }
            Section("注册与认证") {
                Toggle("允许注册", isOn: boolBinding("registration_enabled"))
                Toggle("邮箱验证", isOn: boolBinding("email_verify_enabled"))
                Toggle("启用优惠码", isOn: boolBinding("promo_code_enabled"))
                Toggle("密码重置", isOn: boolBinding("password_reset_enabled"))
                Toggle("邀请码", isOn: boolBinding("invitation_code_enabled"))
                Toggle("TOTP", isOn: boolBinding("totp_enabled"))
                Toggle("Passkey", isOn: boolBinding("passkey_enabled"))
                Toggle("登录条款确认", isOn: boolBinding("login_agreement_enabled"))
            }
            Section("OAuth 登录") {
                Toggle("GitHub OAuth", isOn: boolBinding("github_oauth_enabled"))
                Toggle("Google OAuth", isOn: boolBinding("google_oauth_enabled"))
                Toggle("LinuxDo OAuth", isOn: boolBinding("linuxdo_oauth_enabled"))
                Toggle("钉钉 OAuth", isOn: boolBinding("dingtalk_oauth_enabled"))
                Toggle("微信 OAuth", isOn: boolBinding("wechat_oauth_enabled"))
                Toggle("OIDC", isOn: boolBinding("oidc_oauth_enabled"))
                TextField("OIDC 提供方名称", text: textBinding("oidc_oauth_provider_name"))
            }
            Section("订阅与计费") {
                Toggle("启用订阅", isOn: boolBinding("subscription_enabled"))
                Toggle("允许购买订阅", isOn: boolBinding("purchase_subscription_enabled"))
                TextField("购买订阅地址", text: textBinding("purchase_subscription_url")).textInputAutocapitalization(.never)
                Toggle("启用支付", isOn: boolBinding("payment_enabled"))
                Toggle("禁用余额支付", isOn: boolBinding("payment_balance_disabled"))
                Toggle("推广返佣", isOn: boolBinding("affiliate_enabled"))
            }
            Section("通知") {
                Toggle("余额不足提醒", isOn: boolBinding("balance_low_notify_enabled"))
                TextField("余额提醒阈值", text: numberBinding("balance_low_notify_threshold")).keyboardType(.decimalPad)
                TextField("充值地址", text: textBinding("balance_low_notify_recharge_url")).textInputAutocapitalization(.never)
                Toggle("账号额度提醒", isOn: boolBinding("account_quota_notify_enabled"))
            }
            Section("渠道监控") {
                Toggle("启用渠道监控", isOn: boolBinding("channel_monitor_enabled"))
                TextField("默认间隔（秒）", text: numberBinding("channel_monitor_default_interval_seconds")).keyboardType(.numberPad)
                Toggle("隐藏吞吐", isOn: boolBinding("channel_monitor_hide_throughput"))
                Toggle("隐藏用户排行", isOn: boolBinding("channel_monitor_hide_user_ranking"))
                Toggle("显示额度", isOn: boolBinding("channel_monitor_show_quota"))
                Toggle("可用渠道页面", isOn: boolBinding("available_channels_enabled"))
            }
            Section("后台能力") {
                Toggle("后台模式", isOn: boolBinding("backend_mode_enabled"))
                Toggle("插件管理", isOn: boolBinding("plugin_management_enabled"))
                Toggle("风控", isOn: boolBinding("risk_control_enabled"))
                Toggle("允许用户查看错误请求", isOn: boolBinding("allow_user_view_error_requests"))
                TextField("服务器时区", text: textBinding("server_timezone"))
                TextField("默认分页数量", text: numberBinding("table_default_page_size")).keyboardType(.numberPad)
            }
            if let info = systemInfo?.objectValue {
                Section("系统版本") {
                    LabeledValueRow(label: "版本", value: info.text("version", "current_version") ?? "--")
                    LabeledValueRow(label: "提交", value: info.text("commit", "git_commit") ?? "--")
                    LabeledValueRow(label: "构建时间", value: info.text("build_time", "buildTime") ?? "--")
                    Button("检查更新") { Task { await checkUpdates() } }
                    Button("执行更新", role: .destructive) { pendingAction = "update" }
                    Button("重启服务", role: .destructive) { pendingAction = "restart" }
                }
            }
            if let updateInfo { Section("更新信息") { Text(updateInfo.displayText).font(.footnote).textSelection(.enabled) } }
            if let errorMessage { Section { Text(errorMessage).foregroundStyle(.red) } }
        }
        .scrollContentBackground(.hidden)
        .navigationTitle("系统设置")
        .toolbar { ToolbarItem(placement: .primaryAction) { Button(isSaving ? "保存中" : "保存") { save() }.disabled(isSaving || isLoading) } }
        .confirmationDialog("确认系统操作？", isPresented: Binding(get: { pendingAction != nil }, set: { if !$0 { pendingAction = nil } }), titleVisibility: .visible) {
            Button(pendingAction == "restart" ? "重启服务" : "执行更新", role: .destructive) { if let action = pendingAction { Task { await systemAction(action) } } }
        }
        .appPage().task { await load() }
    }

    private func textBinding(_ key: String) -> Binding<String> {
        Binding(get: { values[key]?.stringValue ?? "" }, set: { values[key] = .string($0) })
    }
    private func numberBinding(_ key: String) -> Binding<String> {
        Binding(get: { values[key]?.displayText == "--" ? "" : values[key]?.displayText ?? "" }, set: { raw in values[key] = Double(raw).map(JSONValue.number) ?? .null })
    }
    private func boolBinding(_ key: String) -> Binding<Bool> {
        Binding(get: { values[key]?.boolValue ?? false }, set: { values[key] = .bool($0) })
    }
    private func load() async {
        guard let service = try? store.adminService() else { return }
        isLoading = true
        do {
            let settings = try await service.dynamicGet("/api/v1/admin/settings")
            values = settings.objectValue ?? [:]
            systemInfo = try? await service.dynamicGet("/api/v1/admin/system/version")
            errorMessage = nil
        } catch { errorMessage = error.localizedDescription }
        isLoading = false
    }
    private func save() {
        guard let service = try? store.adminService() else { return }
        isSaving = true
        Task { do { _ = try await service.dynamicUpdate("/api/v1/admin/settings", body: values); await load() } catch { errorMessage = error.localizedDescription }; isSaving = false }
    }
    private func checkUpdates() async { guard let service = try? store.adminService() else { return }; do { updateInfo = try await service.dynamicGet("/api/v1/admin/system/check-updates") } catch { errorMessage = error.localizedDescription } }
    private func systemAction(_ action: String) async { guard let service = try? store.adminService() else { return }; pendingAction = nil; do { try await service.dynamicAction("/api/v1/admin/system/\(action)"); await load() } catch { errorMessage = error.localizedDescription } }
}

struct PersonalConsoleView: View {
    @EnvironmentObject private var store: AppStore
    @State private var profile: [String: JSONValue] = [:]
    @State private var subscriptions: JSONValue?
    @State private var channels: JSONValue?
    @State private var monitors: JSONValue?
    @State private var showsProfile = false
    @State private var showsPassword = false
    @State private var showsRedeem = false
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 12) {
                        Image(systemName: "person.crop.circle.fill").font(.largeTitle).foregroundStyle(AppPalette.teal)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(profile.text("username", "display_name", "email") ?? "我的账户").font(.title3.bold())
                            Text(profile.text("email") ?? "--").font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        if profile.text("role") == "admin" { StatusPill(text: "管理员", color: AppPalette.purple) }
                    }
                    HStack { accountMetric("余额", NumberFormatters.currency(profile.number("balance")), "creditcard", .green); accountMetric("并发", "\(Int(profile.number("current_concurrency") ?? 0))/\(Int(profile.number("concurrency") ?? 0))", "bolt.horizontal", AppPalette.blue); accountMetric("加入时间", shortDate(profile.text("created_at")), "calendar", AppPalette.orange) }
                    HStack { Button("编辑资料") { showsProfile = true }.buttonStyle(.borderedProminent); Button("修改密码") { showsPassword = true }.buttonStyle(.bordered); Button("兑换") { showsRedeem = true }.buttonStyle(.bordered) }
                }.padding(16).glassPanel()

                NavigationLink { APIKeysView() } label: { personalLink("API 密钥", "创建、额度、限流、期限与使用配置", "key.fill", AppPalette.blue) }.buttonStyle(.plain)
                personalSection("我的订阅", symbol: "creditcard", color: .indigo, value: subscriptions)
                personalSection("渠道状态", symbol: "point.3.connected.trianglepath.dotted", color: .cyan, value: channels)
                personalSection("渠道监控", symbol: "waveform.path.ecg.rectangle", color: AppPalette.purple, value: monitors)
                if isLoading { LoadingView(label: "正在加载个人中心") }
                if let errorMessage { InlineErrorView(message: errorMessage) }
            }.padding(16)
        }
        .navigationTitle("我的账户")
        .sheet(isPresented: $showsProfile, onDismiss: { Task { await load() } }) { ProfileEditorView(profile: profile) }
        .sheet(isPresented: $showsPassword) { PasswordEditorView() }
        .sheet(isPresented: $showsRedeem, onDismiss: { Task { await load() } }) { RedeemCodeView() }
        .refreshable { await load() }
        .appPage().task { await load() }
    }

    private func accountMetric(_ label: String, _ value: String, _ symbol: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 5) { Image(systemName: symbol).foregroundStyle(color); Text(value).font(.subheadline.bold()).lineLimit(1).minimumScaleFactor(0.7); Text(label).font(.caption2).foregroundStyle(.secondary) }.frame(maxWidth: .infinity, alignment: .leading).padding(9).background(.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 10))
    }
    private func personalLink(_ title: String, _ subtitle: String, _ symbol: String, _ color: Color) -> some View { HStack(spacing: 12) { Image(systemName: symbol).foregroundStyle(color).frame(width: 38, height: 38).background(color.opacity(0.1), in: RoundedRectangle(cornerRadius: 11)); VStack(alignment: .leading, spacing: 3) { Text(title).font(.headline); Text(subtitle).font(.caption).foregroundStyle(.secondary) }; Spacer(); Image(systemName: "chevron.right").foregroundStyle(.tertiary) }.padding(14).glassPanel(cornerRadius: 18, interactive: true) }
    @ViewBuilder private func personalSection(_ title: String, symbol: String, color: Color, value: JSONValue?) -> some View {
        VStack(alignment: .leading, spacing: 10) { Label(title, systemImage: symbol).font(.headline).foregroundStyle(color); let rows = personalRows(value); if rows.isEmpty { Text("暂无数据").font(.caption).foregroundStyle(.secondary) }; ForEach(rows) { row in HStack { VStack(alignment: .leading, spacing: 3) { Text(row.text("name", "title", "group_name") ?? row.text("platform").map(ConsoleLocalization.provider) ?? "#\(row.id)").font(.subheadline.weight(.semibold)); Text(row.text("description", "expires_at", "updated_at") ?? "").font(.caption).foregroundStyle(.secondary) }; Spacer(); if let status = row.text("status") { StatusPill(text: ConsoleLocalization.status(status), color: status == "active" ? .green : .secondary) } }; Divider() } }.padding(14).glassPanel()
    }
    private func personalRows(_ value: JSONValue?) -> [DynamicRecord] { guard let value else { return [] }; if let array = value.arrayValue { return array.enumerated().map { DynamicRecord(value: $0.element, index: $0.offset) } }; if let object = value.objectValue { for key in ["items", "subscriptions", "channels", "monitors", "data"] { if let array = object[key]?.arrayValue { return array.enumerated().map { DynamicRecord(value: $0.element, index: $0.offset) } } } }; return [] }
    private func shortDate(_ value: String?) -> String { value.map { String($0.replacingOccurrences(of: "T", with: " ").prefix(10)) } ?? "--" }
    private func load() async { guard let service = try? store.adminService() else { return }; isLoading = true; errorMessage = nil; async let nextProfile: JSONValue? = try? await service.dynamicGet("/api/v1/user/profile"); async let nextSubscriptions: JSONValue? = try? await service.dynamicGet("/api/v1/subscriptions"); async let nextChannels: JSONValue? = try? await service.dynamicGet("/api/v1/channels/available"); async let nextMonitors: JSONValue? = try? await service.dynamicGet("/api/v1/channel-monitors"); let result = await (nextProfile, nextSubscriptions, nextChannels, nextMonitors); profile = result.0?.objectValue ?? [:]; subscriptions = result.1; channels = result.2; monitors = result.3; if profile.isEmpty { errorMessage = "个人中心需要网页登录 JWT；Admin API Key 只能访问管理员接口。" }; isLoading = false }
}

private struct ProfileEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    let profile: [String: JSONValue]
    @State private var username: String
    @State private var avatarURL: String
    @State private var notifyEnabled: Bool
    @State private var notifyThreshold: String
    @State private var isSaving = false
    @State private var errorMessage: String?
    init(profile: [String: JSONValue]) { self.profile = profile; _username = State(initialValue: profile.text("username") ?? ""); _avatarURL = State(initialValue: profile.text("avatar_url", "avatarUrl") ?? ""); _notifyEnabled = State(initialValue: profile.flag("balance_notify_enabled", "balanceNotifyEnabled") ?? false); _notifyThreshold = State(initialValue: profile.number("balance_notify_threshold", "balanceNotifyThreshold").map { String($0) } ?? "") }
    var body: some View { NavigationStack { Form { Section("基本资料") { TextField("用户名", text: $username); TextField("头像 URL", text: $avatarURL).textInputAutocapitalization(.never) }; Section("余额提醒") { Toggle("启用余额提醒", isOn: $notifyEnabled); TextField("提醒阈值", text: $notifyThreshold).keyboardType(.decimalPad) }; if let errorMessage { Section { Text(errorMessage).foregroundStyle(.red) } } }.navigationTitle("编辑资料").navigationBarTitleDisplayMode(.inline).toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }; ToolbarItem(placement: .confirmationAction) { Button(isSaving ? "保存中" : "保存") { save() }.disabled(username.nilIfBlank == nil || isSaving) } } } }
    private func save() { guard let service = try? store.adminService() else { return }; isSaving = true; Task { do { var body: [String: JSONValue] = ["username": .string(username), "avatar_url": .string(avatarURL), "balance_notify_enabled": .bool(notifyEnabled)]; if let threshold = Double(notifyThreshold) { body["balance_notify_threshold"] = .number(threshold) }; _ = try await service.dynamicUpdate("/api/v1/user", body: body); dismiss() } catch { errorMessage = error.localizedDescription }; isSaving = false } }
}

private struct PasswordEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    @State private var oldPassword = ""
    @State private var newPassword = ""
    @State private var confirmation = ""
    @State private var errorMessage: String?
    var body: some View { NavigationStack { Form { SecureField("当前密码", text: $oldPassword); SecureField("新密码", text: $newPassword); SecureField("确认新密码", text: $confirmation); if let errorMessage { Text(errorMessage).foregroundStyle(.red) } }.navigationTitle("修改密码").toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }; ToolbarItem(placement: .confirmationAction) { Button("修改") { save() }.disabled(newPassword.count < 8 || newPassword != confirmation) } } } }
    private func save() { guard let service = try? store.adminService() else { return }; Task { do { _ = try await service.dynamicUpdate("/api/v1/user/password", body: ["old_password": .string(oldPassword), "new_password": .string(newPassword)]); dismiss() } catch { errorMessage = error.localizedDescription } } }
}

private struct RedeemCodeView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    @State private var code = ""
    @State private var errorMessage: String?
    var body: some View { NavigationStack { Form { TextField("兑换码", text: $code).textInputAutocapitalization(.characters); if let errorMessage { Text(errorMessage).foregroundStyle(.red) } }.navigationTitle("兑换").toolbar { ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }; ToolbarItem(placement: .confirmationAction) { Button("兑换") { redeem() }.disabled(code.nilIfBlank == nil) } } } }
    private func redeem() { guard let service = try? store.adminService() else { return }; Task { do { _ = try await service.dynamicCreate("/api/v1/redeem", body: ["code": .string(code)]); dismiss() } catch { errorMessage = error.localizedDescription } } }
}
