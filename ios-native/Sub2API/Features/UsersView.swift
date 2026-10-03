import SwiftUI

struct UsersView: View {
    @EnvironmentObject private var store: AppStore
    @State private var users: [AdminUser] = []
    @State private var searchText = ""
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var showsCreateUser = false

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                PageHeader(
                    title: "用户",
                    subtitle: "搜索用户，查看余额、密钥和活跃状态",
                    symbol: "person.2.fill",
                    tint: AppPalette.blue,
                    action: { showsCreateUser = true }
                )

                if isLoading && users.isEmpty {
                    LoadingView(label: "正在加载用户")
                } else if let errorMessage, users.isEmpty {
                    InlineErrorView(message: errorMessage) { Task { await load() } }
                } else if users.isEmpty {
                    EmptyContentView(symbol: "person.crop.circle.badge.questionmark", title: "暂无用户", message: "当前搜索条件下没有匹配结果。")
                } else {
                    ForEach(users) { user in
                        NavigationLink(value: user) {
                            UserRow(user: user)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .searchable(text: $searchText, prompt: "邮箱、用户名或备注")
        .refreshable { await load() }
        .navigationBarHidden(true)
        .navigationDestination(for: AdminUser.self) { user in UserDetailView(user: user) }
        .sheet(isPresented: $showsCreateUser, onDismiss: { Task { await load() } }) {
            CreateUserView()
        }
        .appPage()
        .task(id: "\(store.activeServerID?.uuidString ?? "")-\(searchText)") {
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            await load()
        }
    }

    private func load() async {
        guard let client = try? store.client() else { return }
        isLoading = true
        errorMessage = nil
        do {
            let page: Page<AdminUser> = try await client.get(
                "/api/v1/admin/users",
                query: [
                    URLQueryItem(name: "page", value: "1"),
                    URLQueryItem(name: "page_size", value: "50"),
                    URLQueryItem(name: "search", value: searchText.trimmingCharacters(in: .whitespacesAndNewlines))
                ]
            )
            users = page.items.sorted { ($0.lastUsedAt ?? $0.updatedAt ?? "") > ($1.lastUsedAt ?? $1.updatedAt ?? "") }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

private struct UserRow: View {
    let user: AdminUser

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: user.role?.lowercased() == "admin" ? "person.badge.shield.checkmark.fill" : "person.crop.circle.fill")
                .font(.title2)
                .foregroundStyle(user.role?.lowercased() == "admin" ? AppPalette.purple : AppPalette.blue)
                .frame(width: 42, height: 42)
                .background(.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 13))
            VStack(alignment: .leading, spacing: 4) {
                Text(user.email).font(.subheadline.weight(.bold)).lineLimit(1)
                Text(user.username?.isEmpty == false ? user.username! : (user.notes?.isEmpty == false ? user.notes! : "用户 #\(user.id)"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                HStack(spacing: 10) {
                    Label(NumberFormatters.currency(user.balance), systemImage: "creditcard")
                    Label("\(user.currentConcurrency ?? 0)/\(user.concurrency ?? 0)", systemImage: "bolt.horizontal")
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
            }
            Spacer(minLength: 4)
            let style = StatusStyle.generic(user.status)
            StatusPill(text: style.0, color: style.1)
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
        }
        .padding(14)
        .contentShape(Rectangle())
        .glassPanel(cornerRadius: 18, interactive: true)
    }
}

private struct UserDetailView: View {
    @EnvironmentObject private var store: AppStore
    @State var user: AdminUser
    @State private var usage: UsageSummary?
    @State private var keys: [AdminAPIKey] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var showsBalance = false

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(user.email).font(.title3.bold()).textSelection(.enabled)
                            Text(user.username ?? user.notes ?? "用户 #\(user.id)")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                        Spacer()
                        let style = StatusStyle.generic(user.status)
                        StatusPill(text: style.0, color: style.1)
                    }
                    HStack(spacing: 10) {
                        Button("调整余额") { showsBalance = true }
                            .buttonStyle(.borderedProminent)
                            .tint(AppPalette.blue)
                        Button(user.status == "disabled" ? "启用" : "停用", role: user.status == "disabled" ? nil : .destructive) {
                            Task { await toggleStatus() }
                        }
                        .buttonStyle(.bordered)
                    }
                }
                .padding(16)
                .glassPanel()

                Grid(horizontalSpacing: 10, verticalSpacing: 10) {
                    GridRow {
                        MetricTile(label: "余额", value: NumberFormatters.currency(user.balance), symbol: "creditcard", tint: AppPalette.orange)
                        MetricTile(label: "请求", value: NumberFormatters.compact(usage?.totalRequests ?? usage?.requestCount), symbol: "arrow.up.arrow.down", tint: AppPalette.blue)
                    }
                    GridRow {
                        MetricTile(label: "Token", value: NumberFormatters.compact(usage?.totalTokens), symbol: "cpu", tint: AppPalette.teal)
                        MetricTile(label: "成本", value: NumberFormatters.currency(usage?.actualCost ?? usage?.totalCost), symbol: "dollarsign.circle", tint: AppPalette.purple)
                    }
                }

                VStack(alignment: .leading, spacing: 12) {
                    Text("API 密钥").font(.headline)
                    if isLoading { ProgressView() }
                    else if keys.isEmpty { Text("暂无密钥").font(.footnote).foregroundStyle(.secondary) }
                    ForEach(keys) { key in
                        HStack {
                            Image(systemName: "key.fill").foregroundStyle(AppPalette.blue)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(key.name ?? "未命名密钥").font(.subheadline.weight(.semibold))
                                Text(masked(key.customKey ?? key.key)).font(.caption.monospaced()).foregroundStyle(.secondary)
                            }
                            Spacer()
                            StatusPill(text: StatusStyle.generic(key.status).0, color: StatusStyle.generic(key.status).1)
                        }
                        if key.id != keys.last?.id { Divider() }
                    }
                }
                .padding(16)
                .glassPanel()

                if let errorMessage { InlineErrorView(message: errorMessage) { Task { await load() } } }
            }
            .padding(16)
        }
        .navigationTitle("用户详情")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .sheet(isPresented: $showsBalance, onDismiss: { Task { await load() } }) {
            BalanceEditorView(user: user)
        }
        .appPage()
        .task { await load() }
    }

    private func load() async {
        guard let client = try? store.client() else { return }
        isLoading = true
        do {
            async let nextUser: AdminUser = client.get("/api/v1/admin/users/\(user.id)")
            async let nextUsage: UsageSummary = client.get("/api/v1/admin/users/\(user.id)/usage", query: [URLQueryItem(name: "period", value: "month")])
            async let nextKeys: Page<AdminAPIKey> = client.listPage("/api/v1/admin/users/\(user.id)/api-keys", itemKeys: ["api_keys", "apiKeys", "keys", "items"])
            let result = try await (nextUser, nextUsage, nextKeys)
            user = result.0
            usage = result.1
            keys = result.2.items
            errorMessage = nil
        } catch { errorMessage = error.localizedDescription }
        isLoading = false
    }

    private func toggleStatus() async {
        guard let client = try? store.client() else { return }
        struct Body: Encodable, Sendable { let status: String }
        do {
            user = try await client.send("/api/v1/admin/users/\(user.id)", method: .put, body: Body(status: user.status == "disabled" ? "active" : "disabled"))
        } catch { errorMessage = error.localizedDescription }
    }

    private func masked(_ value: String?) -> String {
        guard let value, value.count > 8 else { return "••••••••" }
        return "\(value.prefix(4))••••\(value.suffix(4))"
    }
}

private struct CreateUserView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    @State private var email = ""
    @State private var password = ""
    @State private var username = ""
    @State private var role = "user"
    @State private var balance = "0"
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("基本信息") {
                    TextField("邮箱", text: $email).keyboardType(.emailAddress).textInputAutocapitalization(.never)
                    SecureField("初始密码", text: $password)
                    TextField("用户名（可选）", text: $username)
                }
                Section("权限与余额") {
                    Picker("角色", selection: $role) { Text("用户").tag("user"); Text("管理员").tag("admin") }
                    TextField("初始余额", text: $balance).keyboardType(.decimalPad)
                }
                if let errorMessage { Section { Text(errorMessage).foregroundStyle(.red) } }
            }
            .navigationTitle("添加用户")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button(isSaving ? "保存中" : "保存") { save() }.disabled(isSaving || email.isEmpty || password.isEmpty) }
            }
        }
    }

    private func save() {
        guard let client = try? store.client() else { return }
        struct Body: Encodable, Sendable { let email: String; let password: String; let username: String?; let role: String; let status: String; let balance: Double }
        isSaving = true
        Task {
            do {
                let _: AdminUser = try await client.send("/api/v1/admin/users", method: .post, body: Body(email: email, password: password, username: username.isEmpty ? nil : username, role: role, status: "active", balance: Double(balance) ?? 0))
                dismiss()
            } catch { errorMessage = error.localizedDescription }
            isSaving = false
        }
    }
}

private struct BalanceEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    let user: AdminUser
    @State private var operation = "add"
    @State private var amount = ""
    @State private var notes = ""
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section { Picker("操作", selection: $operation) { Text("充值").tag("add"); Text("扣减").tag("subtract"); Text("设为").tag("set") }.pickerStyle(.segmented) }
                Section("金额") {
                    TextField("0.00", text: $amount).keyboardType(.decimalPad)
                    TextField("备注（可选）", text: $notes)
                }
                if let errorMessage { Section { Text(errorMessage).foregroundStyle(.red) } }
            }
            .navigationTitle("调整余额")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("确认") { save() }.disabled(Double(amount) == nil) }
            }
        }
    }

    private func save() {
        guard let client = try? store.client(), let value = Double(amount) else { return }
        struct Body: Encodable, Sendable { let balance: Double; let operation: String; let notes: String? }
        Task {
            do {
                let _: AdminUser = try await client.send(
                    "/api/v1/admin/users/\(user.id)/balance",
                    method: .post,
                    body: Body(balance: value, operation: operation, notes: notes.isEmpty ? nil : notes),
                    idempotencyKey: "user-balance-\(user.id)-\(UUID().uuidString)"
                )
                dismiss()
            } catch { errorMessage = error.localizedDescription }
        }
    }
}
