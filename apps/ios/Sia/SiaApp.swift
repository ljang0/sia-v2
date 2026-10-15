import SwiftUI

@main
struct SiaApp: App {
    @State private var pairing = SiaApp.initialPairing()

    private static func initialPairing() -> Pairing? {
        #if DEBUG
        // Simulator and UI tests only: the simulator has no camera, and the system paste button
        // ignores synthetic taps. Release builds never read this.
        if let link = ProcessInfo.processInfo.environment["SIA_PAIRING_LINK"],
           let pairing = Pairing(link: link) {
            PairingStore.save(pairing)
            return pairing
        }
        #endif
        return PairingStore.load()
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if let pairing {
                    RemoteWebView(pairing: pairing) {
                        PairingStore.clear()
                        self.pairing = nil
                    }
                    .ignoresSafeArea()
                    // A new pairing reloads the page with the new secrets.
                    .id(pairing)
                } else {
                    PairingView { paired in
                        PairingStore.save(paired)
                        pairing = paired
                    }
                }
            }
            .onOpenURL { url in
                // Universal links to the pairing page (phase 2) arrive here.
                if let paired = Pairing(link: url.absoluteString) {
                    PairingStore.save(paired)
                    pairing = paired
                }
            }
        }
    }
}
