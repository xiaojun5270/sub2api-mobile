# GitHub Unsigned SwiftUI IPA Build

This workflow builds the native SwiftUI app under `ios-native/` on GitHub Actions without Expo Token, EAS, or Apple signing certificates.

## What It Produces

- Workflow: `.github/workflows/ios-unsigned-ipa-v2.yml`
- Artifact: `sub2api-swiftui-unsigned-ipa`
- File: `sub2api-swiftui-unsigned.ipa`
- Checksum: `sub2api-swiftui-unsigned.ipa.sha256`

The IPA is not signed. It cannot be installed directly on a normal iPhone. Use it for later re-signing or other environments that accept unsigned apps.

## Start a Build

The workflow runs automatically when `ios-native/**` or the SwiftUI workflow changes on `main`.

You can also start it manually:

1. Open the GitHub repository.
2. Go to `Actions`.
3. Select `Build Unsigned SwiftUI IPA`.
4. Click `Run workflow`.

## Download the IPA

1. Open the finished workflow run.
2. Scroll to `Artifacts`.
3. Download `sub2api-swiftui-unsigned-ipa`.
4. Unzip the downloaded artifact to get the IPA and its SHA-256 checksum.

## Notes

- This build compiles `ios-native/Sub2API.xcodeproj` directly and does not use EAS Build.
- This build does not require `EXPO_TOKEN`.
- This build does not require an Apple Developer certificate.
- The runner selects Xcode 26 or newer because Liquid Glass is compiled from the native SwiftUI APIs.
- The older `.github/workflows/ios-unsigned-ipa.yml` remains available for the Expo/React Native build.
