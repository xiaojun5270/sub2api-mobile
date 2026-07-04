# GitHub Android APK Build

This project can build an Android APK through GitHub Actions without Expo EAS Build or `EXPO_TOKEN`.

## Requirements

- No Expo token is required.
- No EAS account setup is required.

## Start an APK Build

1. Open the GitHub repository.
2. Go to `Actions`.
3. Select `Build Android APK`.
4. Open the `Run workflow` menu.
5. Click the green `Run workflow` button.

## Download the APK

When the workflow finishes:

1. Open the finished workflow run.
2. Scroll to `Artifacts`.
3. Download `sub2api-mobile-apk`.
4. Unzip the artifact to get `sub2api-mobile.apk`.

The APK is a release build signed with the generated Android debug key, so it is suitable for direct testing installs.

## Notes

- The workflow runs `npx expo prebuild --platform android --clean`.
- It then builds with `./gradlew assembleRelease`.
- Use this APK for testing only, not Play Store release.
