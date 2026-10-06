import SwiftUI

struct ServersView: View {
    @EnvironmentObject private var store: AppStore
    @State private var showsAddServer = false
    @State private var serverToDelete: ServerProfile?
    @State private var verificationState: VerificationState = .idle
    @State private var switchingServerID: UUID?

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                PageHeader(
                    title: "服务器",
                    subtitle: "切换当前管理的 Sub2API 服务",
                    symbol: "server.rack",
                    tint: AppPalette.purple,
                    action: { showsAddServer = true }
                )

                if case let .failed(message) = verificationState {
                    InlineErrorView(message: message)
                }

                ForEach(store.servers) { server in
                    serverCard(server)
                }

                if store.servers.isEmpty {
                    EmptyContentView(symbol: "server.rack", title: "还没有服务器", message: "点击右上角添加服务器。")
                }

                VStack(alignment: .leading, spacing: 12) {
                    Label("本机安全", systemImage: "lock.shield.fill")
                        .font(.headline)
                        .foregroundStyle(AppPalette.teal)
                    Text("服务器列表存储在本机偏好设置中；Admin Key 和登录令牌存入 iOS Keychain，账号密码只用于登录且不会保存。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .padding(16)
                .glassPanel()

                Button(role: .destructive) {
                    store.signOut()
                } label: {
                    Label("退出当前服务器", systemImage: "rectangle.portrait.and.arrow.right")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .navigationBarHidden(true)
        .sheet(isPresented: $showsAddServer) { AddServerView() }
        .confirmationDialog("删除服务器？", isPresented: Binding(
            get: { serverToDelete != nil },
            set: { if !$0 { serverToDelete = nil } }
        ), titleVisibility: .visible) {
            Button("删除", role: .destructive) {
                if let serverToDelete { store.remove(serverToDelete) }
                serverToDelete = nil
            }
            Button("取消", role: .cancel) { serverToDelete = nil }
        } message: {
            Text("服务器配置和对应的本机 Keychain 凭证都会被移除。")
        }
        .appPage()
    }

    private func serverCard(_ server: ServerProfile) -> some View {
        let active = store.activeServerID == server.id
        let switching = switchingServerID == server.id
        let credentialLabel = server.authMode == "account"
            ? "账号密码 · \(server.username?.nilIfBlank ?? "未记录账号")"
            : (server.authMode == "credential" ? "Admin Key" : "本机凭证")
        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: active ? "checkmark.circle.fill" : "server.rack")
                    .font(.title3)
                    .foregroundStyle(active ? .green : AppPalette.purple)
                    .frame(width: 40, height: 40)
                    .background((active ? Color.green : AppPalette.purple).opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 3) {
                    Text(server.label).font(.headline).lineLimit(1)
                    Text(server.baseURL).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                    Label(credentialLabel, systemImage: server.authMode == "account" ? "person" : "key")
                        .font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer()
                if active { StatusPill(text: "当前使用", color: .green) }
            }
            HStack {
                if active {
                    Text("已连接").font(.caption.weight(.semibold)).foregroundStyle(.green)
                } else {
                    Button { verifyAndSelect(server) } label: {
                        HStack(spacing: 5) {
                            if switching { ProgressView().controlSize(.small) }
                            else { Image(systemName: "arrow.left.arrow.right") }
                            Text(switching ? "验证中" : "切换")
                        }
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .disabled(verificationState == .checking)
                }
                Spacer()
                Button(role: .destructive) {
                    serverToDelete = server
                } label: {
                    Image(systemName: "trash")
                        .frame(width: 30, height: 30)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("删除 \(server.label)")
            }
        }
        .padding(15)
        .glassPanel(cornerRadius: 18, interactive: true)
        .opacity(switching ? 0.72 : 1)
    }

    private func verifyAndSelect(_ server: ServerProfile) {
        guard server.id != store.activeServerID else { return }
        verificationState = .checking
        switchingServerID = server.id
        Task {
            do {
                guard let key = KeychainStore.get(for: server.id.uuidString), !key.isEmpty else {
                    throw APIError.server(status: 401, message: "此服务器没有可用的本机凭证，请删除后重新添加。")
                }
                let client = APIClient(baseURL: server.baseURL, adminKey: key)
                let _: AdminSettings = try await client.get("/api/v1/admin/settings")
                store.select(server)
                verificationState = .idle
            } catch {
                verificationState = .failed(error.localizedDescription)
            }
            switchingServerID = nil
        }
    }
}

private enum VerificationState: Equatable {
    case idle, checking, failed(String)
}

private enum ServerLoginMode: String, CaseIterable, Identifiable {
    case account
    case credential

    var id: String { rawValue }
    var title: String { self == .account ? "账号密码" : "Admin Key" }
}

private struct AddServerView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    @State private var serverName = ""
    @State private var baseURL = ""
    @State private var loginMode: ServerLoginMode = .account
    @State private var account = ""
    @State private var password = ""
    @State private var adminKey = ""
    @State private var revealPassword = false
    @State private var revealKey = false
    @State private var twoFactorToken: String?
    @State private var twoFactorEmail: String?
    @State private var twoFactorCode = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("连接信息") {
                    TextField("服务器名称，例如：生产环境", text: $serverName)
                        .textContentType(.organizationName)
                    TextField("https://api.example.com", text: $baseURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }

                Section("登录方式") {
                    Picker("登录方式", selection: $loginMode) {
                        ForEach(ServerLoginMode.allCases) { mode in Text(mode.title).tag(mode) }
                    }
                    .pickerStyle(.segmented)

                    if loginMode == .account {
                        TextField("账号 / 邮箱", text: $account)
                            .textContentType(.username)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        HStack {
                            if revealPassword { TextField("密码", text: $password) }
                            else { SecureField("密码", text: $password) }
                            Button { revealPassword.toggle() } label: { Image(systemName: revealPassword ? "eye.slash" : "eye") }
                                .buttonStyle(.plain)
                        }
                        if twoFactorToken != nil {
                            TextField("6 位两步验证码", text: $twoFactorCode)
                                .textContentType(.oneTimeCode)
                                .keyboardType(.numberPad)
                            if let twoFactorEmail { Text("验证码账户：\(twoFactorEmail)").font(.caption).foregroundStyle(.secondary) }
                        }
                    } else {
                        HStack {
                            if revealKey { TextField("管理密钥 / JWT", text: $adminKey) }
                            else { SecureField("管理密钥 / JWT", text: $adminKey) }
                            Button { revealKey.toggle() } label: { Image(systemName: revealKey ? "eye.slash" : "eye") }
                                .buttonStyle(.plain)
                        }
                    }
                }
                Section {
                    Label(loginMode == .account ? "密码仅用于本次登录，APP 只保存登录令牌。" : "保存前会向管理设置接口验证密钥。", systemImage: "checkmark.shield")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                if let errorMessage { Section { Text(errorMessage).foregroundStyle(.red) } }
            }
            .navigationTitle("添加服务器")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "验证中" : "保存") { save() }
                        .disabled(isSaving || !canSave)
                }
            }
            .onChange(of: loginMode) { _, _ in clearTwoFactor() }
            .onChange(of: account) { _, _ in clearTwoFactor() }
            .onChange(of: password) { _, _ in clearTwoFactor() }
        }
    }

    private var canSave: Bool {
        guard serverName.nilIfBlank != nil, baseURL.nilIfBlank != nil else { return false }
        if loginMode == .credential { return adminKey.nilIfBlank != nil }
        if twoFactorToken != nil { return twoFactorCode.count == 6 }
        return account.nilIfBlank != nil && !password.isEmpty
    }

    private func save() {
        isSaving = true
        errorMessage = nil
        Task {
            do {
                let credential: String
                if loginMode == .account {
                    if let twoFactorToken {
                        credential = try await APIClient.completeTwoFactor(
                            baseURL: baseURL,
                            tempToken: twoFactorToken,
                            code: twoFactorCode
                        )
                    } else {
                        switch try await APIClient.login(baseURL: baseURL, account: account, password: password) {
                        case let .authenticated(token):
                            credential = token
                        case let .requiresTwoFactor(tempToken, maskedEmail):
                            twoFactorToken = tempToken
                            twoFactorEmail = maskedEmail
                            twoFactorCode = ""
                            isSaving = false
                            return
                        }
                    }
                } else {
                    credential = adminKey
                }
                try await store.connect(
                    name: serverName,
                    baseURL: baseURL,
                    adminKey: credential,
                    username: loginMode == .account ? account : nil,
                    authMode: loginMode.rawValue
                )
                dismiss()
            } catch { errorMessage = error.localizedDescription }
            isSaving = false
        }
    }

    private func clearTwoFactor() {
        twoFactorToken = nil
        twoFactorEmail = nil
        twoFactorCode = ""
    }
}
