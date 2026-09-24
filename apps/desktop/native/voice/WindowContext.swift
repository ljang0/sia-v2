// Adapted from Notch's Context/ScreenContextProvider.swift at 6c74c30.
// See README.md. Unlike Fn capture, this reads only a host-granted exact window.
import AppKit
import ApplicationServices
import Darwin

enum WindowContext {
    static func attribute<T>(_ element: AXUIElement, _ key: String) -> T? {
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, key as CFString, &value) == .success else { return nil }
        return value as? T
    }

    struct Identity {
        let frame: CGRect
        let title: String?
        var windowID: CGWindowID? = nil
    }

    // The bundled CUA driver uses this macOS SPI to bind AXWindow to CGWindowID.
    // Resolve it optionally so unsupported systems retain the strict public-AX
    // fallback instead of failing to launch. Never infer identity from focus.
    private typealias WindowIDReader = @convention(c) (AXUIElement, UnsafeMutablePointer<CGWindowID>) -> AXError
    private static let readWindowID: WindowIDReader? = {
        guard let handle = dlopen(nil, RTLD_LAZY) else { return nil }
        defer { dlclose(handle) }
        guard let symbol = dlsym(handle, "_AXUIElementGetWindow") else { return nil }
        return unsafeBitCast(symbol, to: WindowIDReader.self)
    }()

    private static func nativeWindowID(_ window: AXUIElement, pid: pid_t) -> CGWindowID? {
        var owner: pid_t = 0
        var id: CGWindowID = 0
        guard AXUIElementGetPid(window, &owner) == .success, owner == pid,
              let readWindowID, readWindowID(window, &id) == .success, id > 0 else { return nil }
        return id
    }

    /// Geometry alone is ambiguous when browsers stack windows at identical bounds.
    /// Native IDs take precedence: WindowServer and AX titles can disagree during
    /// navigation and Chromium decorates them differently. Known conflicting IDs
    /// must never fall through to title/geometry matching.
    static func matchingIndex(target: Identity, candidates: [Identity]) -> Int? {
        if let id = target.windowID {
            let exact = candidates.indices.filter { candidates[$0].windowID == id }
            if !exact.isEmpty { return exact.count == 1 ? exact.first : nil }
        }
        let matches = candidates.indices.filter { index in
            if target.windowID != nil, candidates[index].windowID != nil { return false }
            let frame = candidates[index].frame
            return abs(frame.minX - target.frame.minX) < 1 && abs(frame.minY - target.frame.minY) < 1 &&
                abs(frame.width - target.frame.width) < 1 && abs(frame.height - target.frame.height) < 1
        }
        if let title = target.title, !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let titled = matches.filter { candidates[$0].title == title }
            return titled.count == 1 ? titled.first : nil
        }
        return matches.count == 1 ? matches.first : nil
    }

    /// Resolve only a window owned by the requested process; never substitute focus.
    static func resolve(pid: pid_t, windowID: CGWindowID) -> AXUIElement? {
        guard AXIsProcessTrusted(),
              let info = (CGWindowListCopyWindowInfo(.optionIncludingWindow, windowID) as? [[String: Any]])?.first,
              (info[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == pid,
              (info[kCGWindowNumber as String] as? NSNumber)?.uint32Value == windowID,
              let bounds = info[kCGWindowBounds as String] as? NSDictionary,
              let frame = CGRect(dictionaryRepresentation: bounds) else { return nil }
        let target = Identity(frame: frame, title: info[kCGWindowName as String] as? String, windowID: windowID)
        let root = AXUIElementCreateApplication(pid)
        AXUIElementSetMessagingTimeout(root, 0.08)
        AXUIElementSetAttributeValue(root, "AXManualAccessibility" as CFString, kCFBooleanTrue)
        AXUIElementSetAttributeValue(root, "AXEnhancedUserInterface" as CFString, kCFBooleanTrue)
        var windows: [AXUIElement] = attribute(root, kAXWindowsAttribute) ?? []
        // Chromium can omit AXWindows while exposing its window through focus or
        // root children. These are candidates only: every route must still match
        // the requested native ID or strict fallback below, never substitute focus.
        let children: [AXUIElement] = attribute(root, kAXChildrenAttribute) ?? []
        let focused: AXUIElement? = attribute(root, kAXFocusedWindowAttribute)
        for candidate in children + [focused].compactMap({ $0 }) {
            let role: String = attribute(candidate, kAXRoleAttribute) ?? ""
            if role == kAXWindowRole,
               nativeWindowID(candidate, pid: pid) == windowID || !(target.title ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
               !windows.contains(where: { CFEqual($0, candidate) }) {
                windows.append(candidate)
            }
        }
        let candidates: [(element: AXUIElement, identity: Identity)] = windows.compactMap { window in
            guard let position: AXValue = attribute(window, kAXPositionAttribute),
                  let size: AXValue = attribute(window, kAXSizeAttribute),
                  AXValueGetType(position) == .cgPoint, AXValueGetType(size) == .cgSize else { return nil }
            var p = CGPoint.zero; var s = CGSize.zero
            guard AXValueGetValue(position, .cgPoint, &p), AXValueGetValue(size, .cgSize, &s) else { return nil }
            return (window, Identity(frame: CGRect(origin: p, size: s), title: attribute(window, kAXTitleAttribute), windowID: nativeWindowID(window, pid: pid)))
        }
        guard let index = matchingIndex(target: target, candidates: candidates.map(\.identity)) else { return nil }
        return candidates[index].element
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
