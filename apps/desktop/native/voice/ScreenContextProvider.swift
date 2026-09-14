// Copied from romirthedev/notch at 6c74c30; bounded timeout and secure-field exclusions added for Sia.
// See README.md and THIRD_PARTY_NOTICES.md.
import AppKit
import ApplicationServices

/// Deictic context: a semantic snapshot of what the user is looking at,
/// built by walking the frontmost app's Accessibility tree. Captured the
/// moment the notch activates (our panel is non-activating, so the user's
/// app is still frontmost), then injected into the agent prompt so
/// "reply to this" / "fix this error" / "add this to my calendar" resolve.
///
/// Deliberately dependency-free: this file must compile standalone so it
/// can be integration-tested from the CLI against live apps.
struct ScreenContext {
    var appName: String
    var bundleID: String
    var windowTitle: String
    var selectedText: String?
    var focusedElement: String?
    var outline: String
    var processID: pid_t = 0
    var isFrontmost = true
    var isPartial = false

    /// The block injected into the agent prompt.
    var promptBlock: String {
        var lines = ["<screen_context>"]
        lines.append("\(isFrontmost ? "Frontmost app" : "Target app (not frontmost)"): \(appName) (\(bundleID)), pid \(processID)")
        if isPartial { lines.append("PARTIAL accessibility snapshot: some content was omitted or could not be read. Inspect further; absence here is not evidence of absence in the app.") }
        if !windowTitle.isEmpty { lines.append("Window: \(windowTitle)") }
        if let focused = focusedElement, !focused.isEmpty { lines.append("Focused element: \(focused)") }
        if let selected = selectedText, !selected.isEmpty { lines.append("Selected text: \"\(selected)\"") }
        if !outline.isEmpty {
            lines.append("Visible UI:")
            lines.append(outline)
        }
        lines.append("</screen_context>")
        return lines.joined(separator: "\n")
    }
}

final class ScreenContextProvider {

    // Budgets keep capture fast and the prompt small.
    private var deadline = Date.distantFuture
    private var partial = false
    private let detailed: Bool
    private let maxNodes: Int
    private let maxDepth: Int
    private let maxOutlineChars: Int
    private let maxTextPerNode = 220

    init(detailed: Bool = false) {
        self.detailed = detailed
        maxNodes = detailed ? 1200 : 400
        maxDepth = detailed ? 28 : 12
        maxOutlineChars = detailed ? 12000 : 2800
    }

    static func isTrusted(promptIfNeeded: Bool) -> Bool {
        if promptIfNeeded {
            let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
            return AXIsProcessTrustedWithOptions(options)
        }
        return AXIsProcessTrusted()
    }

    /// Synchronous; call off the main thread. Returns nil when there's no
    /// frontmost app or Accessibility isn't granted.
    func capture(pid: pid_t? = nil) -> ScreenContext? {
        guard Self.isTrusted(promptIfNeeded: false) else { return nil }
        // An explicit target must never fall back to a different foreground app.
        let target = pid.flatMap { NSRunningApplication(processIdentifier: $0) }
        guard let app = pid == nil ? NSWorkspace.shared.frontmostApplication : target,
              !app.isTerminated,
              app.bundleIdentifier != Bundle.main.bundleIdentifier else { return nil }

        guard !["password", "keychain", "bitwarden", "lastpass", "dashlane", "authenticator"].contains(where: { (app.bundleIdentifier ?? "").lowercased().contains($0) }) else { return nil }
        partial = false
        deadline = Date().addingTimeInterval(detailed ? 2.0 : 0.6)
        let axApp = AXUIElementCreateApplication(app.processIdentifier)
        AXUIElementSetMessagingTimeout(axApp, 0.05)

        // Electron/Chromium apps only build their AX tree once an assistive
        // client announces itself. Harmless no-op elsewhere.
        AXUIElementSetAttributeValue(axApp, "AXManualAccessibility" as CFString, kCFBooleanTrue)
        AXUIElementSetAttributeValue(axApp, "AXEnhancedUserInterface" as CFString, kCFBooleanTrue)

        guard let window: AXUIElement = copyAttr(axApp, kAXFocusedWindowAttribute)
            ?? firstElement(of: axApp, attribute: kAXWindowsAttribute) else { return nil }

        let windowTitle: String = copyAttr(window, kAXTitleAttribute) ?? ""

        // Selected text + focused element, the highest-signal pieces.
        var selectedText: String?
        var focusedDescription: String?
        if let focused: AXUIElement = copyAttr(axApp, kAXFocusedUIElementAttribute) {
            let role: String = copyAttr(focused, kAXRoleAttribute) ?? ""
            let subrole: String = copyAttr(focused, kAXSubroleAttribute) ?? ""
            guard !(role + subrole).lowercased().contains("secure") else { return nil }
            selectedText = nonEmpty(copyAttr(focused, kAXSelectedTextAttribute), limit: 1200)
            focusedDescription = describe(focused)
        }

        var lines: [String] = []
        var nodeCount = 0
        var charCount = 0
        walk(window, depth: 0, lines: &lines, nodeCount: &nodeCount, charCount: &charCount)

        return ScreenContext(
            appName: app.localizedName ?? "Unknown",
            bundleID: app.bundleIdentifier ?? "?",
            windowTitle: windowTitle,
            selectedText: selectedText,
            focusedElement: focusedDescription,
            outline: lines.joined(separator: "\n"),
            processID: app.processIdentifier,
            isFrontmost: NSWorkspace.shared.frontmostApplication?.processIdentifier == app.processIdentifier,
            isPartial: partial || Date() >= deadline
        )
    }

    // MARK: - Tree walk

    /// Roles whose text content is worth surfacing, mapped to a friendly label.
    private static let contentRoles: [String: String] = [
        "AXStaticText": "Text",
        "AXHeading": "Heading",
        "AXTextField": "Field",
        "AXTextArea": "TextArea",
        "AXSearchField": "Search",
        "AXComboBox": "Combo",
        "AXButton": "Button",
        "AXPopUpButton": "Popup",
        "AXCheckBox": "Checkbox",
        "AXRadioButton": "Radio",
        "AXLink": "Link",
        "AXMenuItem": "MenuItem",
        "AXTabButton": "Tab",
        "AXImage": "Image",
        "AXMenuButton": "MenuButton",
        "AXSlider": "Slider",
    ]

    private func walk(
        _ element: AXUIElement,
        depth: Int,
        lines: inout [String],
        nodeCount: inout Int,
        charCount: inout Int
    ) {
        guard Date() < deadline, depth <= maxDepth, nodeCount < maxNodes, charCount < maxOutlineChars else { partial = true; return }
        nodeCount += 1

        let role: String = copyAttr(element, kAXRoleAttribute) ?? ""
        let subrole: String = copyAttr(element, kAXSubroleAttribute) ?? ""
        guard !(role + subrole).lowercased().contains("secure") else { return }

        if let label = Self.contentRoles[role], let line = contentLine(element, label: label) {
            let indent = String(repeating: "  ", count: min(depth, 6))
            let remaining = max(0, maxOutlineChars - charCount - indent.count)
            if line.count > remaining { partial = true }
            let bounded = indent + String(line.prefix(remaining))
            lines.append(bounded)
            charCount += bounded.count
            // Content nodes re-emit their own text through child Text
            // nodes — recursing would double every line.
            return
        }

        // Containers are structural — recurse.
        guard let children: [AXUIElement] = copyAttrArray(element, kAXChildrenAttribute) else { return }
        for child in children {
            guard nodeCount < maxNodes, charCount < maxOutlineChars else { partial = true; return }
            walk(child, depth: depth + 1, lines: &lines, nodeCount: &nodeCount, charCount: &charCount)
        }
    }

    private func contentLine(_ element: AXUIElement, label: String) -> String? {
        let title = nonEmpty(copyAttr(element, kAXTitleAttribute), limit: maxTextPerNode)
        // A heading's AX "value" is its level (1-6), not content.
        let value = label == "Heading" ? nil : nonEmpty(stringValue(of: element), limit: maxTextPerNode)
        let description = nonEmpty(copyAttr(element, kAXDescriptionAttribute), limit: maxTextPerNode)

        let name = title ?? description
        switch (name, value) {
        case (nil, nil):
            return nil
        case (let n?, nil):
            return "\(label): \(n)"
        case (nil, let v?):
            return "\(label): \(v)"
        case (let n?, let v?):
            return n == v ? "\(label): \(n)" : "\(label) '\(n)': \(v)"
        }
    }

    private func describe(_ element: AXUIElement) -> String? {
        let role: String = copyAttr(element, kAXRoleAttribute) ?? "element"
        let title = nonEmpty(copyAttr(element, kAXTitleAttribute), limit: 120)
        let value = nonEmpty(stringValue(of: element), limit: 300)
        var parts = [role]
        if let title { parts.append("'\(title)'") }
        if let value { parts.append("value: \(value)") }
        return parts.count > 1 ? parts.joined(separator: " ") : nil
    }

    // MARK: - AX plumbing

    private func copyAttr<T>(_ element: AXUIElement, _ attribute: String) -> T? {
        guard Date() < deadline else { partial = true; return nil }
        var ref: CFTypeRef?
        let status = AXUIElementCopyAttributeValue(element, attribute as CFString, &ref)
        if status == .cannotComplete { partial = true }
        guard status == .success else { return nil }
        return ref as? T
    }

    private func copyAttrArray(_ element: AXUIElement, _ attribute: String) -> [AXUIElement]? {
        guard Date() < deadline else { partial = true; return nil }
        var ref: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, attribute as CFString, &ref) == .success,
              let array = ref as? [AnyObject] else { return nil }
        return array.compactMap { CFGetTypeID($0) == AXUIElementGetTypeID() ? ($0 as! AXUIElement) : nil }
    }

    private func firstElement(of element: AXUIElement, attribute: String) -> AXUIElement? {
        copyAttrArray(element, attribute)?.first
    }

    private func stringValue(of element: AXUIElement) -> String? {
        guard Date() < deadline else { partial = true; return nil }
        var ref: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, kAXValueAttribute as CFString, &ref) == .success,
              let ref else { return nil }
        if let s = ref as? String { return s }
        if let n = ref as? NSNumber { return n.stringValue }
        return nil
    }

    private func nonEmpty(_ s: String?, limit: Int) -> String? {
        guard var s = s?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty else { return nil }
        if s.count > limit { partial = true; s = String(s.prefix(limit)) + "…" }
        return s.replacingOccurrences(of: "\n", with: " ⏎ ")
    }
}

// Bridge the original Notch context to Sia's existing typed Fn event.
extension ScreenContext {
    var siaContext: [String: String] {
        var value = ["app": FnContext.bounded(appName, 160), "bundleID": FnContext.bounded(bundleID, 200),
                     "window": FnContext.bounded(windowTitle, 300), "outline": FnContext.bounded((isPartial ? "PARTIAL accessibility snapshot. Inspect further.\n" : "") + outline, 2800)]
        if let selectedText { value["selectedText"] = FnContext.bounded(selectedText, 1200) }
        return value
    }
}
