import SwiftUI

struct RootView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        Group {
            if store.isAuthenticated {
                MainTabView()
                    .transition(.opacity)
            } else {
                LoginView()
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.22), value: store.isAuthenticated)
    }
}

private struct MainTabView: View {
    var body: some View {
        TabView {
            NavigationStack { DashboardView() }
                .tabItem { Label("概览", systemImage: "chart.xyaxis.line") }
            NavigationStack { UsersView() }
                .tabItem { Label("用户", systemImage: "person.2") }
            NavigationStack { ManagementHubView() }
                .tabItem { Label("管理", systemImage: "square.grid.2x2") }
            NavigationStack { ServersView() }
                .tabItem { Label("服务器", systemImage: "server.rack") }
        }
    }
}

