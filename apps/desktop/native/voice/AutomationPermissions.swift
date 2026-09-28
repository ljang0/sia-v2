import AppKit
import Carbon

// Permission-only mode. Never reads calendars, messages, files, or reminder content.
// Keep targets fixed; neither the renderer nor a model can supply a bundle identifier.
func runAutomationPermissions(request: String?) {
    let targets = ["system_events": "com.apple.systemevents", "safari": "com.apple.Safari", "chrome": "com.google.Chrome", "calendar": "com.apple.iCal", "reminders": "com.apple.reminders",
                   "finder": "com.apple.finder", "messages": "com.apple.MobileSMS"]
    func check(_ key: String, ask: Bool) -> String {
        guard let bundle = targets[key], NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundle) != nil else { return "unavailable" }
        let target = NSAppleEventDescriptor(bundleIdentifier: bundle)
        switch Int(AEDeterminePermissionToAutomateTarget(target.aeDesc, typeWildCard, typeWildCard, ask)) {
        case Int(noErr): return "ready"
        case errAEEventWouldRequireUserConsent: return "needs_permission"
        case errAEEventNotPermitted: return "denied"
        case procNotFound: return "not_running"
        default: return "error"
        }
    }
    func finish() {
        DispatchQueue.global(qos: .userInitiated).async {
            var result: [String: String] = [:]
            for key in targets.keys.sorted() { result[key] = check(key, ask: key == request) }
            if let data = try? JSONSerialization.data(withJSONObject: result) {
                FileHandle.standardOutput.write(data + Data([10]))
            }
            exit(0)
        }
    }
    guard let request else { finish(); return }
    guard let bundle = targets[request] else { exit(2) }
    // Never send a reopen event to a running app: Finder can create a new window.
    // Denied and already-granted permissions also do not need a launch.
    let status = check(request, ask: false)
    if !automationTargetNeedsLaunch(status: status, isRunning: !NSRunningApplication.runningApplications(withBundleIdentifier: bundle).isEmpty) {
        finish(); return
    }
    guard let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundle) else { finish(); return }
    let configuration = NSWorkspace.OpenConfiguration()
    configuration.activates = false
    configuration.hides = true
    configuration.addsToRecentItems = false
    NSWorkspace.shared.openApplication(at: url, configuration: configuration) { _, _ in finish() }
}

func automationTargetNeedsLaunch(status: String, isRunning: Bool) -> Bool {
    !isRunning && (status == "not_running" || status == "needs_permission")
}
