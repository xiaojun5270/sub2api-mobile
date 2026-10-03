import SwiftUI

@main
@MainActor
struct Sub2APIApp: App {
    @StateObject private var store = AppStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .tint(AppPalette.teal)
        }
    }
}

