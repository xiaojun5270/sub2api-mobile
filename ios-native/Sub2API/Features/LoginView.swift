import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var store: AppStore
    @State private var baseURL = ""
    @State private var adminKey = ""
    @State private var revealKey = false
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
                        Text("使用服务器地址和 Admin Key 登录。凭证只保存在本机钥匙串中。")
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

                        VStack(alignment: .leading, spacing: 7) {
                            Label("Admin Key / JWT", systemImage: "key")
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
                                Text(isConnecting ? "正在验证" : "进入应用")
                            }
                            .fontWeight(.semibold)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(AppPalette.teal)
                        .disabled(isConnecting || baseURL.trimmingCharacters(in: .whitespaces).isEmpty || adminKey.isEmpty)
                    }
                    .padding(18)
                    .glassPanel(cornerRadius: 24)

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

    private func connect() {
        isConnecting = true
        errorMessage = nil
        Task {
            do {
                try await store.connect(baseURL: baseURL, adminKey: adminKey)
            } catch {
                errorMessage = error.localizedDescription
            }
            isConnecting = false
        }
    }
}
