import ImageIO
import AppKit
import CoreGraphics

// Exercises the real Notch-derived monitor without installing an OS tap or posting input.
// Bulk permission setup must not reopen Finder or any already-running app.
for status in ["ready", "denied", "unavailable", "error", "needs_permission", "not_running"] {
    assert(!automationTargetNeedsLaunch(status: status, isRunning: true))
}
for status in ["ready", "denied", "unavailable", "error"] {
    assert(!automationTargetNeedsLaunch(status: status, isRunning: false))
}
assert(automationTargetNeedsLaunch(status: "not_running", isRunning: false))
assert(automationTargetNeedsLaunch(status: "needs_permission", isRunning: false))
print("Automation setup avoids reopening running apps (no host apps launched).")

// Same-size overlapping browser windows must resolve by exact title, never by order.
let sharedFrame = CGRect(x: 0, y: 125, width: 1512, height: 857)
let otherFrame = CGRect(x: 10, y: 125, width: 1512, height: 857)
let inbox = WindowContext.Identity(frame: sharedFrame, title: "Inbox — Fixture")
let docs = WindowContext.Identity(frame: sharedFrame, title: "Documents — Fixture")
let calendar = WindowContext.Identity(frame: sharedFrame, title: "Calendar — Fixture")
precondition(WindowContext.matchingIndex(target: inbox, candidates: [docs, calendar, inbox]) == 2)
precondition(WindowContext.matchingIndex(target: inbox, candidates: [inbox, docs, calendar]) == 0)
precondition(WindowContext.matchingIndex(target: inbox, candidates: [inbox, inbox]) == nil)
precondition(WindowContext.matchingIndex(target: inbox, candidates: [docs, calendar]) == nil)
// AX can expose only the focused window. Identical geometry must not substitute
// that unrelated window for the requested browser page.
precondition(WindowContext.matchingIndex(target: inbox, candidates: [docs]) == nil)
precondition(WindowContext.matchingIndex(target: inbox, candidates: [inbox]) == 0)
precondition(WindowContext.matchingIndex(target: inbox, candidates: [WindowContext.Identity(frame: sharedFrame, title: nil)]) == nil)
precondition(WindowContext.matchingIndex(target: inbox, candidates: [WindowContext.Identity(frame: otherFrame, title: inbox.title)]) == nil)
for missing in [nil, "", "  "] as [String?] {
    let untitled = WindowContext.Identity(frame: sharedFrame, title: missing)
    precondition(WindowContext.matchingIndex(target: untitled, candidates: [untitled, untitled]) == nil)
    precondition(WindowContext.matchingIndex(target: untitled, candidates: [untitled]) == 0)
}
precondition(WindowContext.matchingIndex(target: inbox, candidates: []) == nil)
precondition(WindowContext.matchingIndex(target: inbox, candidates: [WindowContext.Identity(frame: otherFrame, title: inbox.title), docs, inbox]) == 2)
// Real Chromium can expose a different AX title than WindowServer. Native IDs
// bind the intended window despite that mismatch, movement, or same-size siblings.
let requested = WindowContext.Identity(frame: sharedFrame, title: "Public page — Chrome", windowID: 91)
let exactNative = WindowContext.Identity(frame: otherFrame, title: "Public page", windowID: 91)
let wrongNative = WindowContext.Identity(frame: sharedFrame, title: requested.title, windowID: 92)
let unknownNative = WindowContext.Identity(frame: sharedFrame, title: requested.title)
precondition(WindowContext.matchingIndex(target: requested, candidates: [wrongNative, exactNative]) == 1)
precondition(WindowContext.matchingIndex(target: requested, candidates: [exactNative, wrongNative]) == 0)
precondition(WindowContext.matchingIndex(target: requested, candidates: [wrongNative]) == nil)
precondition(WindowContext.matchingIndex(target: requested, candidates: [exactNative, exactNative]) == nil)
precondition(WindowContext.matchingIndex(target: requested, candidates: [unknownNative, exactNative]) == 1)
precondition(WindowContext.matchingIndex(target: requested, candidates: [wrongNative, unknownNative]) == 1)
precondition(WindowContext.matchingIndex(target: requested, candidates: [unknownNative, unknownNative]) == nil)
precondition(WindowContext.matchingIndex(target: requested, candidates: [WindowContext.Identity(frame: sharedFrame, title: "Other page")]) == nil)
print("Exact-window matching handles overlapping windows and refuses ambiguous identities.")

Task { @MainActor in
    let partialContext = ScreenContext(appName: "Fixture", bundleID: "test.fixture", windowTitle: "Document", outline: "Read this", processID: 123, isFrontmost: false, isPartial: true)
    precondition(partialContext.promptBlock.contains("Target app (not frontmost)"))
    precondition(partialContext.promptBlock.contains("PARTIAL accessibility snapshot"))
    precondition(partialContext.siaContext["outline"]!.hasPrefix("PARTIAL"))
    let browserContext = ScreenContext(appName: "Safari", bundleID: "com.apple.Safari", windowTitle: "Calendar", outline: String(repeating: "x", count: 13000), pageURL: "https://calendar.google.com/calendar/u/7/r")
    precondition(browserContext.promptBlock.contains("Observed page: https://calendar.google.com/calendar/u/7/r"))
    precondition(browserContext.siaContext["outline"]!.hasPrefix("Observed page: https://calendar.google.com/calendar/u/7/r"))
    precondition(ScreenContextProvider.pageIdentity("https://canvas.cmu.edu/courses?search=private#item") == "https://canvas.cmu.edu/courses")
    precondition(ScreenContextProvider.pageIdentity("https://login.example.test/saml2?SAMLRequest=private#token") == "https://login.example.test")
    precondition(ScreenContextProvider.pageIdentity("https://user:secret@example.test/") == nil)
    precondition(ScreenContextProvider.pageIdentity("file:///private/report.txt") == nil)
    precondition(ScreenContextProvider.boundedOutlineLine("Due: 2026-09-15", limit: 12) == "Due: 2026-0…")
    precondition(ScreenContextProvider.boundedOutlineLine("résumé ✓", limit: 8) == "résumé ✓")
    precondition(ScreenContextProvider.boundedOutlineLine("👩🏽‍💻abc", limit: 3) == "👩🏽‍💻a…")
    precondition(ScreenContextProvider.boundedOutlineLine("254", limit: 1) == "…")
    precondition(ScreenContextProvider.boundedOutlineLine("254", limit: 0).isEmpty)
    precondition(WindowContext.contentValue(role: "AXStaticText", value: NSNumber(value: 254)) == "254")
    precondition(WindowContext.contentValue(role: "AXHeading", value: NSNumber(value: 2)) == nil)
    precondition(WindowContext.contentValue(role: "AXStaticText", value: "3,374") == "3,374")
    precondition(BrowserWindow.unsafeAddress("java\nscript:alert(1)"))
    precondition(BrowserWindow.unsafeAddress(" javascript:alert(1)"))
    precondition(BrowserWindow.unsafeAddress("chrome://settings"))
    precondition(!BrowserWindow.unsafeAddress("https://example.com"))
    precondition(!BrowserWindow.unsafeAddress("example.com"))
    precondition(FnContext.bounded(String(repeating: "👩🏽‍💻", count: 1000), 1200).utf16.count <= 1200)
    precondition(FnContext.blockedIdentity("com.1password.1password"))
    precondition(FnContext.blockedIdentity("com.apple.Terminal"))
    precondition(!FnContext.blockedIdentity("com.apple.TextEdit"))
    precondition(FnContext.protectedLabel("AXSecureTextField"))
    precondition(FnContext.protectedLabel("Sign in to your account"))
    precondition(FnContext.protectedLabel("Verification code"))
    precondition(FnContext.protectedLabel("Authentication required"))
    precondition(!FnContext.protectedLabel("AXTextArea Document"))
    // Retina capture is normalized to logical points before the model sees it.
    let logicalSize = MacScreenshot.imageSize(points: CGSize(width: 1710, height: 1107))
    precondition(logicalSize == CGSize(width: 1710, height: 1107))
    let largeSize = MacScreenshot.imageSize(points: CGSize(width: 3840, height: 2160))
    precondition(largeSize == CGSize(width: 1920, height: 1080))
    let portrait = MacScreenshot.imageSize(points: CGSize(width: 1080, height: 1920))
    precondition(portrait.height == 1200 && portrait.width == 675)
    // Asymmetric image checks dimensions and orientation without capturing the screen.
    var pixels = [UInt8](repeating: 0, count: 4 * 4 * 4)
    for pixel in 0..<16 {
        pixels[pixel * 4 + (pixel < 8 ? 0 : 2)] = 255
        pixels[pixel * 4 + 3] = 255
    }
    let provider = CGDataProvider(data: Data(pixels) as CFData)!
    let sample = CGImage(width: 4, height: 4, bitsPerComponent: 8, bitsPerPixel: 32,
                         bytesPerRow: 16, space: CGColorSpaceCreateDeviceRGB(),
                         bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
                         provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)!
    let png = try! MacScreenshot.png(image: sample, size: CGSize(width: 2, height: 2))
    let decoded = CGImageSourceCreateImageAtIndex(CGImageSourceCreateWithData(png as CFData, nil)!, 0, nil)!
    precondition(decoded.width == 2 && decoded.height == 2)
    let bytes = [UInt8](decoded.dataProvider!.data! as Data)
    precondition(bytes[0] > bytes[2], "Top row must remain red")
    precondition(bytes[decoded.bytesPerRow + 2] > bytes[decoded.bytesPerRow], "Bottom row must remain blue")
    print("Native screenshot geometry and PNG orientation passed (synthetic images only).")
    let monitor = PushToTalkMonitor(startMonitoring: false)
    var holds = 0
    var releases = 0
    var cancellations = 0
    monitor.onHoldBegan = { holds += 1 }
    monitor.onReleased = { releases += 1 }
    monitor.onCancelled = { cancellations += 1 }
    func event(_ type: CGEventType, _ key: CGKeyCode, held: Bool) {
        let event = CGEvent(keyboardEventSource: nil, virtualKey: key, keyDown: true)!
        event.flags = held ? .maskSecondaryFn : []
        monitor.handleTapEvent(type: type, event: event)
    }
    func pause() async { try? await Task.sleep(nanoseconds: 360_000_000) }
    // A busy runner can wake the 0.3 s hold timer late; wait for it rather than racing it.
    func waitUntil(_ condition: () -> Bool) async {
        for _ in 0..<60 where !condition() { try? await Task.sleep(nanoseconds: 50_000_000) }
    }
    event(.flagsChanged, 63, held: true)
    event(.flagsChanged, 63, held: false)
    await pause()
    precondition(holds == 0 && releases == 0, "Quick Fn tap must not activate")
    event(.flagsChanged, 63, held: true)
    event(.keyDown, 123, held: true)
    await pause()
    event(.flagsChanged, 63, held: false)
    precondition(holds == 0, "Fn-arrow must not activate")
    event(.flagsChanged, 63, held: true)
    event(.leftMouseDown, 0, held: true)
    await pause()
    event(.flagsChanged, 63, held: false)
    precondition(holds == 0, "Fn-click must not activate")
    event(.flagsChanged, 63, held: true)
    await waitUntil { holds == 1 }
    precondition(holds == 1, "Hold must activate once")
    event(.flagsChanged, 63, held: true)
    event(.flagsChanged, 63, held: false)
    precondition(releases == 1, "Release must finish exactly once")
    event(.flagsChanged, 63, held: true)
    await waitUntil { holds == 2 }
    event(.keyDown, 53, held: true)
    event(.flagsChanged, 63, held: false)
    precondition(holds == 2 && releases == 1 && cancellations == 1, "Escape must cancel without release/send")
    event(.flagsChanged, 63, held: true)
    await waitUntil { holds == 3 }
    event(.tapDisabledByTimeout, 0, held: true)
    event(.flagsChanged, 63, held: false)
    precondition(releases == 1 && cancellations == 2, "A dropped event tap must cancel")
    monitor.stop()
    print("Native Fn monitor: 6 scenarios passed (no OS input or microphone access).")
    exit(0)
}
RunLoop.main.run()
