// Adapted from Notch's ScreenContextProvider at 6c74c30. See README.md.
import AppKit

/// Activation records app identity only, before the nonactivating voice panel appears.
/// UI contents come exclusively from authorized screenshot observations.
enum FnContext {
    static func bounded(_ text: String, _ limit: Int) -> String {
        String(decoding: text.utf16.prefix(limit), as: UTF16.self)
    }
    static func blockedIdentity(_ identity: String) -> Bool {
        ["sia", "electron", "notch", "password", "keychain", "bitwarden", "lastpass", "dashlane", "keeper", "enpass", "strongbox", "keepass", "authenticator", "terminal", "iterm", "warp", "alacritty", "systempreferences", "system settings", "security"].contains(where: identity.lowercased().contains)
    }
    static func activationApp() -> [String: String]? {
        guard let app = NSWorkspace.shared.frontmostApplication, let bundle = app.bundleIdentifier else { return nil }
        let name = app.localizedName ?? bundle
        guard !blockedIdentity(name + " " + bundle) else { return nil }
        return ["app": bounded(name, 160), "bundleID": bounded(bundle, 200)]
    }
}
