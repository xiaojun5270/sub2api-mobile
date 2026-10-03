import Combine
import Foundation

@MainActor
final class AppStore: ObservableObject {
    @Published private(set) var servers: [ServerProfile] = []
    @Published private(set) var activeServerID: UUID?
    @Published private(set) var adminKey = ""

    private let profilesKey = "native.serverProfiles"
    private let activeKey = "native.activeServerID"

    init() {
        load()
    }

    var activeServer: ServerProfile? {
        servers.first { $0.id == activeServerID }
    }

    var isAuthenticated: Bool {
        activeServer != nil && !adminKey.isEmpty
    }

    func client() throws -> APIClient {
        guard let activeServer, !adminKey.isEmpty else { throw APIError.invalidBaseURL }
        return APIClient(baseURL: activeServer.baseURL, adminKey: adminKey)
    }

    @discardableResult
    func connect(baseURL: String, adminKey: String) async throws -> ServerProfile {
        let normalizedURL = normalize(baseURL)
        let normalizedKey = adminKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedURL.isEmpty, !normalizedKey.isEmpty else { throw APIError.invalidBaseURL }

        let temporaryClient = APIClient(baseURL: normalizedURL, adminKey: normalizedKey)
        let settings: AdminSettings = try await temporaryClient.get("/api/v1/admin/settings")
        let existing = servers.first { $0.baseURL.caseInsensitiveCompare(normalizedURL) == .orderedSame }
        let id = existing?.id ?? UUID()
        let host = URL(string: normalizedURL)?.host ?? normalizedURL
        let label = settings.siteName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let profile = ServerProfile(
            id: id,
            label: label?.isEmpty == false ? (label ?? host) : host,
            baseURL: normalizedURL,
            updatedAt: Date()
        )

        try KeychainStore.set(normalizedKey, for: id.uuidString)
        servers.removeAll { $0.id == id }
        servers.insert(profile, at: 0)
        activeServerID = id
        self.adminKey = normalizedKey
        persist()
        return profile
    }

    func select(_ profile: ServerProfile) {
        activeServerID = profile.id
        adminKey = KeychainStore.get(for: profile.id.uuidString) ?? ""
        if let index = servers.firstIndex(where: { $0.id == profile.id }) {
            servers[index].updatedAt = Date()
            servers.sort { $0.updatedAt > $1.updatedAt }
        }
        persist()
    }

    func remove(_ profile: ServerProfile) {
        KeychainStore.remove(for: profile.id.uuidString)
        servers.removeAll { $0.id == profile.id }
        if activeServerID == profile.id {
            activeServerID = servers.first?.id
            adminKey = activeServerID.flatMap { KeychainStore.get(for: $0.uuidString) } ?? ""
        }
        persist()
    }

    func signOut() {
        activeServerID = nil
        adminKey = ""
        persist()
    }

    private func load() {
        if let data = UserDefaults.standard.data(forKey: profilesKey),
           let decoded = try? JSONDecoder().decode([ServerProfile].self, from: data) {
            servers = decoded.sorted { $0.updatedAt > $1.updatedAt }
        }
        if let rawID = UserDefaults.standard.string(forKey: activeKey), let id = UUID(uuidString: rawID) {
            activeServerID = id
            adminKey = KeychainStore.get(for: id.uuidString) ?? ""
        } else if let first = servers.first {
            activeServerID = first.id
            adminKey = KeychainStore.get(for: first.id.uuidString) ?? ""
        }
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(servers) {
            UserDefaults.standard.set(data, forKey: profilesKey)
        }
        UserDefaults.standard.set(activeServerID?.uuidString, forKey: activeKey)
    }

    private func normalize(_ value: String) -> String {
        var result = value.trimmingCharacters(in: .whitespacesAndNewlines)
        while result.hasSuffix("/") { result.removeLast() }
        if !result.contains("://"), !result.isEmpty { result = "https://\(result)" }
        return result
    }
}
