import AppKit
import ApplicationServices

/// Identity only: never reads titles, page contents or editable values, and never activates an app.
enum ForegroundWindow {
    static func capture() -> [String: Any] {
        let unavailable: [String: Any] = ["status": "unavailable"]
        guard AXIsProcessTrusted(), let app = NSWorkspace.shared.frontmostApplication,
              app.processIdentifier > 0, !app.isTerminated else { return unavailable }
        let pid = app.processIdentifier
        let root = AXUIElementCreateApplication(pid)
        AXUIElementSetMessagingTimeout(root, 0.08)
        guard let focused: AXUIElement = WindowContext.attribute(root, kAXFocusedWindowAttribute),
              let windowID = WindowContext.nativeWindowID(focused, pid: pid),
              let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]],
              let front = windows.first(where: { ($0[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == pid }),
              matches(pid: pid, windowID: windowID, front: front),
              let checked: AXUIElement = WindowContext.attribute(root, kAXFocusedWindowAttribute),
              WindowContext.nativeWindowID(checked, pid: pid) == windowID,
              NSWorkspace.shared.frontmostApplication?.processIdentifier == pid else { return unavailable }
        return ["status": "ready", "pid": pid, "window_id": windowID]
    }

    /// The frontmost owned surface must be the exact focused, ordinary on-screen window.
    /// A sheet, popup, overlay, missing owner or stale AX window cannot prove this boundary.
    static func matches(pid: pid_t, windowID: CGWindowID, front: [String: Any]) -> Bool {
        pid > 0 && windowID > 0 &&
            (front[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == pid &&
            (front[kCGWindowNumber as String] as? NSNumber)?.uint32Value == windowID &&
            (front[kCGWindowLayer as String] as? NSNumber)?.intValue == 0 &&
            (front[kCGWindowIsOnscreen as String] as? NSNumber)?.boolValue == true
    }
}
