# Sub2API Native iOS

SwiftUI implementation of the Sub2API mobile admin console. The app uses the native iOS 26 Liquid Glass APIs and falls back to system materials on iOS 17 and iOS 18.

## Requirements

- macOS with Xcode 26 or newer
- iOS 17 deployment target
- XcodeGen only when regenerating the checked-in Xcode project

## Open and run

Open `Sub2API.xcodeproj` in Xcode, select your development team, then run the `Sub2API` scheme.

To regenerate the project after adding or moving source files:

```bash
brew install xcodegen
cd ios-native
xcodegen generate
```

The app accepts both an Admin API Key and a web JWT. Server metadata is stored in `UserDefaults`; secrets are stored separately in the iOS Keychain.

## Included workflows

- Dashboard metrics and token trend chart
- Users, user detail, status and balance actions
- Accounts, account detail and recovery actions
- API key overview with secure copy action
- Groups and group creation
- Usage records and operational overview
- Multiple server profiles with connection verification
- Web console parity for subscriptions, announcements, proxies, redeem codes, promo codes, channels, audit logs, system settings, and the JWT-backed personal area

The detailed web-to-native mapping is documented in [`../docs/WEB_SWIFTUI_PARITY.md`](../docs/WEB_SWIFTUI_PARITY.md).
