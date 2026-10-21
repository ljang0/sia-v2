# Sia for iPhone

A native shell around the phone screens in `apps/desktop/src/mobile`, so the iPhone app and the
web remote stay one codebase ([decision](../../docs/phone-native-app.md)). It adds:

- pairing by scanning the Mac's code with the camera (or the system Paste button)
- the pairing kept in the iOS Keychain, on this device only
- the phone page served from inside the app, so it opens instantly and works from any network
  through the same end-to-end sealed relay as the web remote

## Build and run

```sh
pnpm --filter @sia/desktop remote:build   # builds the phone screens into apps/desktop/out/remote
cd apps/ios && xcodegen generate           # writes Sia.xcodeproj (not checked in)
xcodebuild test -project Sia.xcodeproj -scheme Sia -destination 'platform=iOS Simulator,name=<device>' CODE_SIGNING_ALLOWED=NO
```

The simulator has no camera. Debug builds accept a pairing link in the `SIA_PAIRING_LINK`
environment variable (`SIMCTL_CHILD_SIA_PAIRING_LINK` with `xcrun simctl launch`); release
builds ignore it.

## Ship

The combined pilot uses version `0.1.0`, build `30`, alongside Mac alpha.32. Generate the project
before archiving so Info.plist takes its version from the Xcode build settings. TestFlight needs
an App Store Connect app record for `ai.sia.phone` (team `DXYJ578DD4`) and distribution signing.

```sh
xcodebuild archive -project Sia.xcodeproj -scheme Sia -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/Sia.xcarchive \
  -allowProvisioningUpdates
PATH=/usr/bin:/bin:/usr/sbin:/sbin xcodebuild -exportArchive -archivePath build/Sia.xcarchive \
  -exportOptionsPlist ExportOptions.plist -exportPath build/export \
  -allowProvisioningUpdates
```

The system-only PATH avoids mixing Apple rsync with an incompatible Homebrew rsync during export.
The export options request App Store Connect upload. Use the signed-in Xcode account; do not
put Apple credentials in this repository. Verify build processing in App Store Connect before
marking the TestFlight gate complete. External testing also requires Apple's beta review.
On a real iPhone, check pairing, one complete task, reconnect, revocation, spoken input, and
opening a generated result. Simulator tests alone do not establish those device behaviors.

Not yet built:

- notifications when a task finishes or needs you (needs a push sender in Sia cloud)
- universal links, so the iPhone Camera app opens the pairing code straight in Sia (needs an
  `apple-app-site-association` file on the Sia site)
