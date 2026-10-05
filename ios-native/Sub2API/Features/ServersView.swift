import SwiftUI

struct ServersView: View {
    @EnvironmentObject private var store: AppStore
    @State private var showsAddServer = false
    @State private var serverToDelete: ServerProfile?
    @State private var verificationState: VerificationState = .idle

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
                    Text("服务器列表存储在本机偏好设置中；Admin Key 单独存入 iOS Keychain，不会写入日志或普通配置文件。")
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
                }
                Spacer()
                if active { StatusPill(text: "当前使用", color: .green) }
            }
            HStack {
                Text(active ? "已连接" : "点击切换并验证")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(active ? .green : AppPalette.purple)
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
        .contentShape(Rectangle())
        .onTapGesture {
            if verificationState != .checking { verifyAndSelect(server) }
        }
        .glassPanel(cornerRadius: 18, interactive: true)
        .opacity(verificationState == .checking ? 0.7 : 1)
    }

    private func verifyAndSelect(_ server: ServerProfile) {
        guard server.id != store.activeServerID else { return }
        verificationState = .checking
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
        }
    }
}

private enum VerificationState: Equatable {
    case idle, checking, failed(String)
}

private struct AddServerView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: AppStore
    @State private var baseURL = ""
    @State private var adminKey = ""
    @State private var revealKey = false
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("连接信息") {
                    TextField("https://api.example.com", text: $baseURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    HStack {
                        if revealKey { TextField("管理密钥 / JWT", text: $adminKey) }
                        else { SecureField("管理密钥 / JWT", text: $adminKey) }
                        Button { revealKey.toggle() } label: { Image(systemName: revealKey ? "eye.slash" : "eye") }
                    }
                }
                Section {
                    Label("保存前会向管理设置接口发起一次验证请求。", systemImage: "checkmark.shield")
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
                        .disabled(isSaving || baseURL.isEmpty || adminKey.isEmpty)
                }
            }
        }
    }

    private func save() {
        isSaving = true
        errorMessage = nil
        Task {
            do {
                try await store.connect(baseURL: baseURL, adminKey: adminKey)
                dismiss()
            } catch { errorMessage = error.localizedDescription }
            isSaving = false
        }
    }
}
