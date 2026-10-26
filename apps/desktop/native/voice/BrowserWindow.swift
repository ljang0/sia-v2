import AppKit
import ApplicationServices

/// Host-only browser metadata. Reuses Notch's bounded AX traversal pattern; never returns
/// page text, selections, screenshots, cookies, or credentials. No Apple Events/CDP needed.
enum BrowserWindow {
    static let bundles: Set<String> = ["com.apple.safari", "com.google.chrome", "org.chromium.chromium", "com.brave.browser", "com.microsoft.edgemac", "org.mozilla.firefox", "company.thebrowser.browser"]

    static func pageURL(_ value: Any?) -> String? {
        if let url = value as? URL { return url.absoluteString }
        return value as? String
    }

    /// Safari's native PDF plugin has no AXWebArea, AXURL or window AXDocument.
    /// Its full document URL is also the window title. Require agreement with
    /// the non-editing native address field; never infer identity from one alone.
    static func pdfPageURL(bundle: String, hasPDFPlugin: Bool, webAreas: Int,
                           title: String, address: String?, addressFocused: Bool?, loading: Bool) -> String? {
        guard bundle.lowercased() == "com.apple.safari", hasPDFPlugin, webAreas == 0, !loading,
              addressFocused == false, let address,
              let titleURL = URLComponents(string: title),
              let addressURL = URLComponents(string: address),
              ["http", "https"].contains(titleURL.scheme?.lowercased() ?? ""),
              titleURL.host != nil, titleURL.user == nil, titleURL.password == nil,
              titleURL.query == nil, titleURL.fragment == nil,
              titleURL.url?.absoluteString == addressURL.url?.absoluteString else { return nil }
        return titleURL.url?.absoluteString
    }

    /// Native tab bar only. Web areas and their descendants are never inspected;
    /// an authentication page must not prevent choosing a different existing tab.
    static func inspectTabs(pid: pid_t, windowID: CGWindowID) -> [String: Any] {
        guard AXIsProcessTrusted(),
              NSRunningApplication(processIdentifier: pid)?.bundleIdentifier?.lowercased() == "com.apple.safari",
              let window = WindowContext.resolve(pid: pid, windowID: windowID) else { return ["status": "unavailable"] }
        let deadline = Date().addingTimeInterval(WindowContext.securityScanSeconds)
        var visited = Set<CFHashCode>()
        var complete = true
        var protected = false
        var found = false
        func walk(_ node: AXUIElement, _ depth: Int) {
            guard complete, !protected else { return }
            guard Date() < deadline, depth <= 20, visited.count < 2000 else { complete = false; return }
            guard visited.insert(CFHash(node)).inserted else { return }
            let role: String? = WindowContext.attribute(node, kAXRoleAttribute)
            guard let role else { complete = false; return }
            if role == "AXWebArea" { return }
            guard let metadata = WindowContext.metadata(node) else { complete = false; return }
            if [metadata.title, metadata.description].contains(where: { WindowContext.hasPasswordMetadata(role: role, label: $0) }) || metadata.subrole.lowercased().contains("secure") {
                protected = true; return
            }
            if ["AXTabGroup", "AXOpaqueProviderGroup"].contains(role) {
                let identifier: String = WindowContext.attribute(node, kAXIdentifierAttribute) ?? ""
                if identifier.hasPrefix("TabBar?") { found = true }
            }
            for child in metadata.children { walk(child, depth + 1) }
        }
        walk(window, 0)
        if protected { return ["status": "protected"] }
        guard complete, found, Date() < deadline,
              WindowContext.stillMatches(window, pid: pid, windowID: windowID) else { return ["status": "unavailable"] }
        return ["status": "navigation", "surface": "safari-tabs", "bundleID": "com.apple.Safari"]
    }

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
        let document: Any? = attr(window, kAXDocumentAttribute)
        var url = pageURL(document)
        var protected = false
        var protectedRole = "unknown"
        var protectedKind = "unknown"
        var protectedLabelLength = 0
        var protectedLabelWords = 0
        var complete = true
        var nodes = 0
        var webAreas = 0
        var tabOverview = false
        var hasPDFPlugin = false
        var address: String?
        var addressFocused: Bool?
        var loading = false
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
            if !insideWebArea, role == "AXGroup", subrole == "AXPDFPluginSubrole" { hasPDFPlugin = true }
            if !insideWebArea, role == "AXProgressIndicator" { loading = true }
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
                    if bundle.lowercased() == "com.apple.safari", !insideWebArea,
                       identifier == "WEB_BROWSER_ADDRESS_AND_SEARCH_FIELD" {
                        address = value
                        addressFocused = attr(node, kAXFocusedAttribute)
                    }
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
        if url == nil {
            url = pdfPageURL(bundle: bundle, hasPDFPlugin: hasPDFPlugin, webAreas: webAreas,
                             title: title, address: address, addressFocused: addressFocused, loading: loading)
        }
        guard let url, url.utf8.count <= 8192 else { return ["status": "unavailable", "reason": "page"] }
        return ["status": "ready", "url": url, "bundleID": bundle, "title": FnContext.bounded(title, 300)]
    }
}
