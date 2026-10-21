# Native iPhone app and texting

Decision (October 15, 2026, project owner): after the encrypted relay worked from a physical
iPhone, Sia gets a **native iPhone app**, and Sia must be **reachable by text message** in the way
assistants such as Instinct are.

## Native iPhone app

- A native shell (SwiftUI) around the existing phone screens (`apps/desktop/src/mobile`), so phone
  and web stay one codebase and keep parity with the Mac.
- Native pieces where the web page falls short:
  - pairing by scanning the Mac's QR code with the camera
  - pairing secrets in the iOS Keychain instead of browser storage
  - notifications when a task finishes or needs the person (phase 2, needs a push sender in Sia
    cloud)
- The same end-to-end sealed relay protocol as the web page ([phone cloud relay](./phone-cloud-relay.md)).
  The app adds no new server trust.
- Distribution: TestFlight first, then the App Store. The App Store Connect app record and
  review submission are owner actions.

## Texting

Already in Sia: texting your Mac through Messages (iMessage, voice notes, trusted people), plus
Telegram and Discord bots ([`messages-relay.ts`](../apps/desktop/src/main/remote/messages-relay.ts)).

Still open: a dedicated Sia number anyone can text from any phone. That needs a cloud texting
provider, carrier registration, and an owner decision on cost and privacy. Messages through a
carrier or provider are not end-to-end encrypted, unlike the relay.
