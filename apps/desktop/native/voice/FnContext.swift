// Adapted from Notch's ScreenContextProvider at 6c74c30. See README.md.
import AppKit
import ApplicationServices

/// Captured only for an explicit Fn gesture after opting in. No screenshots,
/// clipboard, or background capture. The bounded tree walk is gesture-only. The app is pinned
/// before the nonactivating panel appears.
enum FnContext {
    static func bounded(_ text: String, _ limit: Int) -> String {
        String(decoding: text.utf16.prefix(limit), as: UTF16.self)
    }
    static func blockedIdentity(_ identity: String) -> Bool {
        ["sia", "electron", "notch", "password", "keychain", "bitwarden", "lastpass", "dashlane", "keeper", "enpass", "strongbox", "keepass", "authenticator", "terminal", "iterm", "warp", "alacritty", "systempreferences", "system settings", "security"].contains(where: identity.lowercased().contains)
    }
    static func protectedLabel(_ label: String) -> Bool {
        ["secure", "password", "sign in", "signin", "log in", "login", "authenticate", "authentication", "credential", "one-time", "verification code", "passkey", "api key", "token"].contains(where: label.lowercased().contains)
    }
    static func capture() -> [String: String]? {
        guard AXIsProcessTrusted(), let app = NSWorkspace.shared.frontmostApplication,
              let bundle = app.bundleIdentifier else { return nil }
        let name = app.localizedName ?? bundle
        let identity = (name + " " + bundle).lowercased()
        guard !blockedIdentity(identity) else { return nil }
        // Browsers retain Sia's separate attachment and origin authorization.
        if ["chrome", "safari", "firefox", "arc", "edge", "brave", "chromium", "opera", "vivaldi", "orion", "dia"].contains(where: identity.contains) {
            return ["app": bounded(name, 160), "bundleID": bounded(bundle, 200)]
        }
        let axApp = AXUIElementCreateApplication(app.processIdentifier)
        AXUIElementSetMessagingTimeout(axApp, 0.08)
        func attribute<T>(_ element: AXUIElement, _ key: String) -> T? {
            var value: CFTypeRef?
            guard AXUIElementCopyAttributeValue(element, key as CFString, &value) == .success else { return nil }
            return value as? T
        }
        var result = ["app": bounded(name, 160), "bundleID": bounded(bundle, 200)]
        guard let focused: AXUIElement = attribute(axApp, kAXFocusedUIElementAttribute) else { return result }
        let deadline = Date().addingTimeInterval(0.6)
        var ancestor: AXUIElement? = focused
        // Inspect role/label before reading any selected text or value.
        for _ in 0..<12 {
            guard let element = ancestor else { break }
            guard Date() < deadline else { return nil }
            let role: String = attribute(element, kAXRoleAttribute) ?? ""
            let subrole: String = attribute(element, kAXSubroleAttribute) ?? ""
            let title: String = attribute(element, kAXTitleAttribute) ?? ""
            let label = (role + " " + subrole + " " + title).lowercased()
            if role.isEmpty || protectedLabel(label) { return nil }
            ancestor = attribute(element, kAXParentAttribute)
        }
        guard ancestor == nil, Date() < deadline else { return nil }
        // Reuse Notch's bounded window walk, with a metadata-only first pass.
        // A protected control anywhere in the captured tree suppresses all content.
        guard let window: AXUIElement = attribute(axApp, kAXFocusedWindowAttribute) else { return result }
        var nodes: [(AXUIElement, String, String)] = []
        var visited = Set<CFHashCode>()
        var complete = true
        func inspect(_ element: AXUIElement, _ depth: Int) {
            guard complete else { return }
            guard depth <= 12, nodes.count < 400, Date() < deadline else { complete = false; return }
            let hash = CFHash(element)
            guard !visited.contains(hash) else { return }
            visited.insert(hash)
            let role: String = attribute(element, kAXRoleAttribute) ?? ""
            let subrole: String = attribute(element, kAXSubroleAttribute) ?? ""
            let title: String = attribute(element, kAXTitleAttribute) ?? ""
            let description: String = attribute(element, kAXDescriptionAttribute) ?? ""
            guard !role.isEmpty, !protectedLabel(role + " " + subrole + " " + title + " " + description) else { complete = false; return }
            nodes.append((element, role, title.isEmpty ? description : title))
            let children: [AXUIElement] = attribute(element, kAXChildrenAttribute) ?? []
            for child in children { inspect(child, depth + 1) }
        }
        inspect(window, 0)
        guard complete, Date() < deadline else { return result }
        let contentRoles: Set<String> = ["AXStaticText", "AXHeading", "AXButton", "AXPopUpButton", "AXCheckBox", "AXRadioButton", "AXLink", "AXMenuItem", "AXTabButton", "AXImage"]
        var lines: [String] = []
        var count = 0
        for (element, role, label) in nodes where contentRoles.contains(role) {
            guard Date() < deadline, count < 2800 else { break }
            // Editable field values are excluded even when the AX provider mislabels
            // their security state. Static visible text provides the useful outline.
            let liveRole: String = attribute(element, kAXRoleAttribute) ?? ""
            let liveSubrole: String = attribute(element, kAXSubroleAttribute) ?? ""
            guard liveRole == role, !protectedLabel(liveRole + " " + liveSubrole) else { return nil }
            let value: String = role == "AXStaticText" ? (attribute(element, kAXValueAttribute) ?? "") : ""
            let text = bounded(label.isEmpty ? value : label, 220)
            if !text.isEmpty {
                let line = bounded(role + ": " + text, max(0, 2799 - count))
                lines.append(line)
                count += line.utf16.count + 1
            }
        }
        if !lines.isEmpty { result["outline"] = bounded(lines.joined(separator: "\n"), 2800) }
        // Selection only; never read the complete field's AXValue.
        if let selected: String = attribute(focused, kAXSelectedTextAttribute), !selected.isEmpty {
            result["selectedText"] = bounded(selected, 1200)
        }
        if let window: AXUIElement = attribute(axApp, kAXFocusedWindowAttribute),
           let title: String = attribute(window, kAXTitleAttribute) {
            result["window"] = bounded(title, 300)
        }
        guard NSWorkspace.shared.frontmostApplication?.processIdentifier == app.processIdentifier,
              let liveWindow: AXUIElement = attribute(axApp, kAXFocusedWindowAttribute),
              CFEqual(liveWindow, window) else { return nil }
        return result
    }
}
