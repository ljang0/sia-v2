// Adapted from Notch's Context/ScreenContextProvider.swift at 6c74c30.
// See README.md. Unlike Fn capture, this reads only a host-granted exact window.
import AppKit
import ApplicationServices

enum WindowContext {
    static func attribute<T>(_ element: AXUIElement, _ key: String) -> T? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, key as CFString, &value) == .success else { return nil }
        return value as? T
    }

    /// Public AX has no WindowServer id. Never substitute the frontmost window.
    static func resolve(pid: pid_t, windowID: CGWindowID) -> AXUIElement? {
        guard AXIsProcessTrusted(),
              let info = (CGWindowListCopyWindowInfo(.optionIncludingWindow, windowID) as? [[String: Any]])?.first,
              (info[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == pid,
              let bounds = info[kCGWindowBounds as String] as? NSDictionary,
              let frame = CGRect(dictionaryRepresentation: bounds) else { return nil }
        let root = AXUIElementCreateApplication(pid)
        AXUIElementSetMessagingTimeout(root, 0.08)
        AXUIElementSetAttributeValue(root, "AXManualAccessibility" as CFString, kCFBooleanTrue)
        AXUIElementSetAttributeValue(root, "AXEnhancedUserInterface" as CFString, kCFBooleanTrue)
        let windows: [AXUIElement] = attribute(root, kAXWindowsAttribute) ?? []
        let matches = windows.filter { window in
            guard let position: AXValue = attribute(window, kAXPositionAttribute),
                  let size: AXValue = attribute(window, kAXSizeAttribute),
                  AXValueGetType(position) == .cgPoint, AXValueGetType(size) == .cgSize else { return false }
            var p = CGPoint.zero; var s = CGSize.zero
            guard AXValueGetValue(position, .cgPoint, &p), AXValueGetValue(size, .cgSize, &s) else { return false }
            return abs(p.x - frame.minX) < 1 && abs(p.y - frame.minY) < 1 && abs(s.width - frame.width) < 1 && abs(s.height - frame.height) < 1
        }
        return matches.count == 1 ? matches.first : nil
    }

    /// Notch reads static text as well as controls, converts NSNumber values, and
    /// skips heading levels. CUA's indexed control list alone omits these readouts.
    static func contentValue(role: String, value: Any?) -> String? {
        guard role != "AXHeading" else { return nil }
        if let text = value as? String { return text }
        if let number = value as? NSNumber { return number.stringValue }
        return nil
    }

    static func capture(pid: pid_t, windowID: CGWindowID) -> [String: Any] {
        guard let bundle = NSRunningApplication(processIdentifier: pid)?.bundleIdentifier,
              let window = resolve(pid: pid, windowID: windowID) else { return ["status": "unavailable"] }
        let deadline = Date().addingTimeInterval(1.5)
        var nodes: [(AXUIElement, String, String)] = []
        var visited = Set<CFHashCode>()
        var complete = true
        var protected = false
        // Inspect security metadata before reading any values. Exhausting a budget
        // suppresses this supplemental outline; it never bypasses the CUA guard.
        func inspect(_ element: AXUIElement, _ depth: Int) {
            guard complete, !protected else { return }
            guard depth <= 40, nodes.count < 2000, Date() < deadline else { complete = false; return }
            guard visited.insert(CFHash(element)).inserted else { return }
            let role: String = attribute(element, kAXRoleAttribute) ?? ""
            let subrole: String = attribute(element, kAXSubroleAttribute) ?? ""
            let title: String = attribute(element, kAXTitleAttribute) ?? ""
            let description: String = attribute(element, kAXDescriptionAttribute) ?? ""
            guard !role.isEmpty else { complete = false; return }
            let identity = (role + " " + subrole + " " + title + " " + description).lowercased()
            if ["securetextfield", "password", "passkey", "verification code", "private browsing", "incognito"].contains(where: identity.contains) { protected = true; return }
            nodes.append((element, role, title.isEmpty ? description : title))
            let children: [AXUIElement] = attribute(element, kAXChildrenAttribute) ?? []
            for child in children { inspect(child, depth + 1) }
        }
        inspect(window, 0)
        guard !protected else { return ["status": "protected"] }
        guard complete, Date() < deadline else { return ["status": "unavailable"] }
        var lines: [String] = []
        var chars = 0
        // Actionable controls already come from CUA. Supplement only readable
        // content, not a second inventory of buttons or editable field values.
        for (node, role, label) in nodes where ["AXStaticText", "AXText", "AXHeading"].contains(role) {
            guard Date() < deadline, chars < 12000 else { break }
            let liveRole: String = attribute(node, kAXRoleAttribute) ?? ""
            let subrole: String = attribute(node, kAXSubroleAttribute) ?? ""
            guard liveRole == role, !subrole.lowercased().contains("secure") else { return ["status": "unavailable"] }
            let raw: Any? = attribute(node, kAXValueAttribute)
            let value = contentValue(role: role, value: raw) ?? ""
            let text = label.isEmpty ? value : value.isEmpty || value == label ? label : "\(label): \(value)"
            let line = FnContext.bounded(text.trimmingCharacters(in: .whitespacesAndNewlines), min(2000, 12000 - chars))
            if !line.isEmpty, lines.last != line { lines.append(line); chars += line.utf16.count + 1 }
        }
        guard NSRunningApplication(processIdentifier: pid)?.bundleIdentifier == bundle,
              let live = resolve(pid: pid, windowID: windowID), CFEqual(window, live), Date() < deadline else { return ["status": "unavailable"] }
        let title: String = attribute(window, kAXTitleAttribute) ?? ""
        return ["status": "ready", "bundleID": bundle, "title": FnContext.bounded(title, 300), "text": FnContext.bounded(lines.joined(separator: "\n"), 12000)]
    }
}
