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
        let deadline = Date().addingTimeInterval(WindowContext.securityScanSeconds)
        func attr<T>(_ node: AXUIElement, _ key: String) -> T? {
            guard Date() < deadline else { return nil }
            var value: CFTypeRef?
            guard AXUIElementCopyAttributeValue(node, key as CFString, &value) == .success else { return nil }
            return value as? T
        }
        let title: String = attr(window, kAXTitleAttribute) ?? ""
        var url: String? = attr(window, kAXDocumentAttribute)
        var protected = false
        var protectedRole = "unknown"
        var protectedKind = "unknown"
        var protectedLabelLength = 0
        var protectedLabelWords = 0
        var complete = true
        var nodes = 0
        var webAreas = 0
        var tabOverview = false
        var stop: String?
        var visited = Set<CFHashCode>()
        func walk(_ node: AXUIElement, _ depth: Int, insideWebArea: Bool = false) {
            guard complete, !protected else { return }
            guard Date() < deadline, depth < 50, nodes < WindowContext.maximumScanNodes else {
                complete = false
                stop = Date() >= deadline ? "time" : depth >= 50 ? "depth" : "nodes"
                return
            }
            guard visited.insert(CFHash(node)).inserted else { return }
            nodes += 1
            guard let metadata = WindowContext.metadata(node) else { complete = false; stop = "attributes"; return }
            let role = metadata.role
            let subrole = metadata.subrole
            let name = metadata.title
            let description = metadata.description
            let label = (role + " " + subrole + " " + name + " " + description).lowercased()
            if role.isEmpty { complete = false; return }
            let passwordLabel = [name, description].first(where: { WindowContext.hasPasswordMetadata(role: role, label: $0) })
            let structural = ["securetextfield", "passkey", "verification code", "private browsing", "private window", "incognito", "developer tools", "web inspector"].first(where: label.contains)
            if passwordLabel != nil || structural != nil {
                protectedRole = ["AXWindow", "AXLink", "AXButton", "AXStaticText", "AXHeading", "AXTextField", "AXTextArea", "AXSecureTextField", "AXComboBox", "AXSearchField", "AXGroup", "AXWebArea"].contains(role) ? role : "other"
                protectedKind = passwordLabel != nil ? "password_metadata" : structural!
                protectedLabelLength = passwordLabel?.count ?? 0
                protectedLabelWords = passwordLabel?.split(whereSeparator: { $0.isWhitespace }).count ?? 0
                protected = true; return
            }
            if ["AXTextField", "AXComboBox", "AXSearchField"].contains(role) {
                let identifier: String = attr(node, kAXIdentifierAttribute) ?? ""
                if bundle.lowercased() == "com.apple.safari", !insideWebArea,
                   identifier == "TabOverviewSearchField" { tabOverview = true }
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
            for child in metadata.children { walk(child, depth + 1, insideWebArea: insideWebArea || role == "AXWebArea") }
        }
        walk(window, 0)
        if protected { return ["status": "protected", "protected_role": protectedRole,
                               "protected_kind": protectedKind, "protected_label_length": protectedLabelLength,
                               "protected_label_words": protectedLabelWords] }
        guard complete, Date() < deadline else { return ["status": "unavailable", "reason": "incomplete", "scan_stop": stop ?? "time", "scan_nodes": nodes] }
        guard NSRunningApplication(processIdentifier: pid)?.bundleIdentifier == bundle,
              WindowContext.stillMatches(window, pid: pid, windowID: windowID) else {
            return ["status": "unavailable", "reason": "incomplete", "scan_stop": "identity_changed", "scan_nodes": nodes]
        }
        guard Date() < deadline else { return ["status": "unavailable", "reason": "incomplete", "scan_stop": "time", "scan_nodes": nodes] }
        // Tab Overview is native navigation chrome, not a webpage. Never assign
        // its previews the previous tab's URL or expose them as page content.
        if tabOverview, webAreas == 0 {
            return ["status": "navigation", "surface": "safari-tab-overview", "bundleID": bundle,
                    "title": FnContext.bounded(title, 300)]
        }
        // An empty browser window can be navigated without exposing a web account.
        if url == nil, webAreas == 0, ["Start Page", "New Tab", "Safari"].contains(title) { url = "about:blank" }
        guard let url, url.utf8.count <= 8192 else { return ["status": "unavailable", "reason": "page"] }
        return ["status": "ready", "url": url, "bundleID": bundle, "title": FnContext.bounded(title, 300)]
    }
}
