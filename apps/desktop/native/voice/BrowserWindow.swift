import AppKit
import ApplicationServices

/// Host-only browser metadata. Reuses Notch's bounded AX traversal pattern; never returns
/// page text, selections, screenshots, cookies, or credentials. No Apple Events/CDP needed.
enum BrowserWindow {
    static let bundles: Set<String> = ["com.apple.safari", "com.google.chrome", "org.chromium.chromium", "com.brave.browser", "com.microsoft.edgemac", "org.mozilla.firefox", "company.thebrowser.browser"]

    static func unsafeAddress(_ value: String) -> Bool {
        // Browsers strip whitespace/control characters from pasted schemes. Inspect the
        // actual field, not just each proposed text chunk, before allowing the next key.
        let normalized = String(String.UnicodeScalarView(value.unicodeScalars.filter { $0.value > 32 && $0.value != 127 && !CharacterSet.whitespacesAndNewlines.contains($0) })).lowercased()
        return normalized.range(of: "^(javascript|data|file|chrome|safari|about|devtools|view-source|vbscript):", options: .regularExpression) != nil
    }

    static func inspect(pid: pid_t, windowID: CGWindowID) -> [String: Any] {
        guard AXIsProcessTrusted() else { return ["status": "unavailable", "reason": "accessibility"] }
        guard let app = NSRunningApplication(processIdentifier: pid),
              let bundle = app.bundleIdentifier, bundles.contains(bundle.lowercased()) else { return ["status": "unavailable", "reason": "window"] }
        guard let window = WindowContext.resolve(pid: pid, windowID: windowID) else { return ["status": "unavailable", "reason": "ambiguous"] }
        let deadline = Date().addingTimeInterval(2)
        func attr<T>(_ node: AXUIElement, _ key: String) -> T? {
            guard Date() < deadline else { return nil }
            var value: CFTypeRef?
            guard AXUIElementCopyAttributeValue(node, key as CFString, &value) == .success else { return nil }
            return value as? T
        }
        let title: String = attr(window, kAXTitleAttribute) ?? ""
        var url: String? = attr(window, kAXDocumentAttribute)
        var protected = false
        var complete = true
        var nodes = 0
        var webAreas = 0
        var visited = Set<CFHashCode>()
        func walk(_ node: AXUIElement, _ depth: Int) {
            guard complete, !protected else { return }
            guard Date() < deadline, depth < 50, nodes < 4000 else { complete = false; return }
            guard visited.insert(CFHash(node)).inserted else { return }
            nodes += 1
            let role: String = attr(node, kAXRoleAttribute) ?? ""
            let subrole: String = attr(node, kAXSubroleAttribute) ?? ""
            let name: String = attr(node, kAXTitleAttribute) ?? ""
            let description: String = attr(node, kAXDescriptionAttribute) ?? ""
            let label = (role + " " + subrole + " " + name + " " + description).lowercased()
            if role.isEmpty { complete = false; return }
            if ["securetextfield", "password", "passkey", "verification code", "private browsing", "private window", "incognito", "developer tools", "web inspector"].contains(where: label.contains) {
                protected = true; return
            }
            if ["AXTextField", "AXComboBox", "AXSearchField"].contains(role) {
                let identifier: String = attr(node, kAXIdentifierAttribute) ?? ""
                if label.contains("address") || label.contains("smart search") || identifier == "WEB_BROWSER_ADDRESS_AND_SEARCH_FIELD" {
                    let value: String = attr(node, kAXValueAttribute) ?? ""
                    if unsafeAddress(value) { protected = true; return }
                }
            }
            if role == "AXWebArea" {
                webAreas += 1
                if url == nil {
                    if let value: URL = attr(node, "AXURL") { url = value.absoluteString }
                    else if let value: String = attr(node, "AXURL") { url = value }
                }
            }
            let children: [AXUIElement] = attr(node, kAXChildrenAttribute) ?? []
            for child in children { walk(child, depth + 1) }
        }
        walk(window, 0)
        if protected { return ["status": "protected"] }
        guard complete, Date() < deadline, NSRunningApplication(processIdentifier: pid)?.bundleIdentifier == bundle,
              let live = WindowContext.resolve(pid: pid, windowID: windowID), CFEqual(window, live),
              Date() < deadline else { return ["status": "unavailable", "reason": "incomplete"] }
        // An empty browser window can be navigated without exposing a web account.
        if url == nil, webAreas == 0, ["Start Page", "New Tab", "Safari"].contains(title) { url = "about:blank" }
        guard let url, url.utf8.count <= 8192 else { return ["status": "unavailable", "reason": "page"] }
        return ["status": "ready", "url": url, "bundleID": bundle, "title": FnContext.bounded(title, 300)]
    }
}
