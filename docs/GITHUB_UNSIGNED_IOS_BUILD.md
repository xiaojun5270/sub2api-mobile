# GitHub Unsigned iOS IPA Build

This workflow builds an unsigned iOS IPA on GitHub Actions without Expo Token, EAS, or Apple signing certificates.

## What It Produces

- Artifact: `sub2api-mobile-unsigned-ipa`
- File: `sub2api-mobile-unsigned.ipa`

The IPA is not signed. It cannot be installed directly on a normal iPhone. Use it for later re-signing or other environments that accept unsigned apps.

## Start a Build

The workflow runs automatically when `.github/workflows/ios-unsigned-ipa.yml` is changed on `main`.

You can also start it manually:

1. Open the GitHub repository.
2. Go to `Actions`.
3. Select `Build Unsigned iOS IPA`.
4. Click `Run workflow`.

## Download the IPA

1. Open the finished workflow run.
2. Scroll to `Artifacts`.
3. Download `sub2api-mobile-unsigned-ipa`.
4. Unzip the downloaded artifact to get `sub2api-mobile-unsigned.ipa`.

## Notes

- This build does not use EAS Build.
- This build does not require `EXPO_TOKEN`.
- This build does not require an Apple Developer certificate.
- The GitHub runner still needs to compile the native iOS project, so the workflow uses `macos-15`.
