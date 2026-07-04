# GitHub iOS Build

This project can build an iOS app through GitHub Actions by using Expo EAS Build.

## Requirements

- An Expo account that can access the EAS project.
- An Apple Developer account configured in EAS for `com.ppx.sub2apimobile`.
- A GitHub repository secret named `EXPO_TOKEN`.

## Create EXPO_TOKEN

Run locally:

```bash
npx eas-cli@latest login
npx eas-cli@latest token:create
```

Copy the generated token into GitHub:

```text
Repository > Settings > Secrets and variables > Actions > New repository secret
Name: EXPO_TOKEN
Value: <the token from eas token:create>
```

## Start an iOS build

1. Open the GitHub repository.
2. Go to `Actions`.
3. Select `EAS Build`.
4. Click `Run workflow`.
5. Choose:
   - `profile`: `preview` for internal testing, or `production` for a release build.
   - `platform`: `ios`.
6. Click `Run workflow`.

When the workflow finishes, open the workflow run summary. It will show the EAS build details link and the iOS download link when EAS returns one.

## Notes

- The default platform is `ios`.
- Use `preview` when you want an installable internal test build.
- Use `production` when you want a release build for App Store/TestFlight workflows.
- The `development` profile is not exposed in the GitHub workflow because this repository currently configures iOS development builds for the simulator.
