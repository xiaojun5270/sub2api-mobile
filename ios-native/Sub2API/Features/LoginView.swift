import SwiftUI

private enum LoginMode: String, CaseIterable, Identifiable {
    case account
    case credential

    var id: String { rawValue }
    var title: String { self == .account ? "账号密码" : "Admin Key" }
}

struct LoginView: View {
    @EnvironmentObject private var store: AppStore
    @State private var baseURL = ""
    @State private var loginMode: LoginMode = .account
    @State private var account = ""
    @State private var password = ""
    @State private var adminKey = ""
    @State private var revealKey = false
    @State private var revealPassword = false
    @State private var twoFactorToken: String?
    @State private var twoFactorEmail: String?
    @State private var twoFactorCode = ""
    @State private var isConnecting = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    Spacer(minLength: 38)

                    VStack(alignment: .leading, spacing: 12) {
                        Image("AppMark")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 72, height: 72)
                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                            .accessibilityHidden(true)

                        Text("Sub2API")
                            .font(.system(size: 38, weight: .bold, design: .rounded))
                        Text("连接管理服务器")
                            .font(.title3.weight(.semibold))
                        Text(loginMode == .account ? "使用管理账号登录，登录令牌只保存在本机钥匙串中。" : "使用 Admin Key 或已有 JWT 连接服务器，凭证只保存在本机钥匙串中。")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }

                    VStack(spacing: 16) {
                        VStack(alignment: .leading, spacing: 7) {
                            Label("服务器地址", systemImage: "link")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                            TextField("https://api.example.com", text: $baseURL)
                                .textContentType(.URL)
                                .keyboardType(.URL)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .submitLabel(.next)
                                .padding(13)
                                .background(.quaternary.opacity(0.45), in: RoundedRectangle(cornerRadius: 12))
                        }

                        Picker("登录方式", selection: $loginMode) {
                            ForEach(LoginMode.allCases) { mode in
                                Text(mode.title).tag(mode)
                            }
                        }
                        .pickerStyle(.segmented)

                        if loginMode == .account {
                            VStack(alignment: .leading, spacing: 7) {
                                Label("账号 / 邮箱", systemImage: "person.fill")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                TextField("admin@example.com", text: $account)
                                    .textContentType(.username)
                                    .keyboardType(.emailAddress)
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()
                                    .submitLabel(.next)
                                    .padding(13)
                                    .background(.quaternary.opacity(0.45), in: RoundedRectangle(cornerRadius: 12))
                            }

                            VStack(alignment: .leading, spacing: 7) {
                                Label("密码", systemImage: "lock.fill")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                HStack(spacing: 8) {
                                    Group {
                                        if revealPassword {
                                            TextField("请输入密码", text: $password)
                                        } else {
                                            SecureField("请输入密码", text: $password)
                                        }
                                    }
                                    .textContentType(.password)
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()
                                    Button {
                                        revealPassword.toggle()
                                    } label: {
                                        Image(systemName: revealPassword ? "eye.slash" : "eye")
                                            .frame(width: 28, height: 28)
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel(revealPassword ? "隐藏密码" : "显示密码")
                                }
                                .padding(9)
                                .background(.quaternary.opacity(0.45), in: RoundedRectangle(cornerRadius: 12))
                            }

                            if twoFactorToken != nil {
                                VStack(alignment: .leading, spacing: 7) {
                                    Label("两步验证码", systemImage: "checkmark.shield.fill")
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(.secondary)
                                    TextField("6 位动态验证码", text: $twoFactorCode)
                                        .textContentType(.oneTimeCode)
                                        .keyboardType(.numberPad)
                                        .padding(13)
                                        .background(.quaternary.opacity(0.45), in: RoundedRectangle(cornerRadius: 12))
                                    if let twoFactorEmail {
                                        Text("验证码账户：\(twoFactorEmail)")
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        } else {
                            VStack(alignment: .leading, spacing: 7) {
                                Label("管理密钥 / JWT", systemImage: "key")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                HStack(spacing: 8) {
                                    Group {
                                        if revealKey {
                                            TextField("admin-xxxxxxxx", text: $adminKey)
                                        } else {
                                            SecureField("admin-xxxxxxxx", text: $adminKey)
                                        }
                                    }
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()
                                    Button {
                                        revealKey.toggle()
                                    } label: {
                                        Image(systemName: revealKey ? "eye.slash" : "eye")
                                            .frame(width: 28, height: 28)
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel(revealKey ? "隐藏密钥" : "显示密钥")
                                }
                                .padding(9)
                                .background(.quaternary.opacity(0.45), in: RoundedRectangle(cornerRadius: 12))
                            }
                        }

                        if let errorMessage {
                            Label(errorMessage, systemImage: "exclamationmark.circle.fill")
                                .font(.footnote)
                                .foregroundStyle(.red)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }

                        Button {
                            connect()
                        } label: {
                            HStack(spacing: 8) {
                                if isConnecting { ProgressView().tint(.white) }
                                Image(systemName: "arrow.right.circle.fill")
                                Text(isConnecting ? "正在验证" : (twoFactorToken == nil ? "进入应用" : "验证并进入"))
                            }
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(AppPalette.teal)
                        .disabled(isConnecting || !canConnect)
                    }
                    .padding(18)
                    .glassPanel(cornerRadius: 24)
                    .onChange(of: loginMode) { _, _ in clearTwoFactor() }
                    .onChange(of: account) { _, _ in clearTwoFactor() }
                    .onChange(of: password) { _, _ in clearTwoFactor() }

                    if !store.servers.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("已保存的服务器")
                                .font(.headline)
                            ForEach(store.servers) { server in
                                Button {
                                    store.select(server)
                                } label: {
                                    HStack {
                                        Image(systemName: "server.rack")
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(server.label).font(.subheadline.weight(.semibold))
                                            Text(server.baseURL).font(.caption).foregroundStyle(.secondary)
                                        }
                                        Spacer()
                                        Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
                                    }
                                    .padding(14)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .glassPanel(cornerRadius: 16, interactive: true)
                            }
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 32)
            }
            .scrollDismissesKeyboard(.interactively)
            .appPage()
        }
    }

    private var canConnect: Bool {
        guard !baseURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        if loginMode == .account {
            if twoFactorToken != nil { return twoFactorCode.count == 6 }
            return !account.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !password.isEmpty
        }
        return !adminKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func connect() {
        isConnecting = true
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
                            isConnecting = false
                            return
                        }
                    }
                } else {
                    credential = adminKey
                }
                try await store.connect(baseURL: baseURL, adminKey: credential)
            } catch {
                errorMessage = error.localizedDescription
            }
            isConnecting = false
        }
    }

    private func clearTwoFactor() {
        twoFactorToken = nil
        twoFactorEmail = nil
        twoFactorCode = ""
    }
}
