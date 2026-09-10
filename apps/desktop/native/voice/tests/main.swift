import AppKit
import CoreGraphics

// Exercises the real Notch-derived monitor without installing an OS tap or posting input.
Task { @MainActor in
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
    await pause()
    precondition(holds == 1, "Hold must activate once")
    event(.flagsChanged, 63, held: true)
    event(.flagsChanged, 63, held: false)
    precondition(releases == 1, "Release must finish exactly once")
    event(.flagsChanged, 63, held: true)
    await pause()
    event(.keyDown, 53, held: true)
    event(.flagsChanged, 63, held: false)
    precondition(holds == 2 && releases == 1 && cancellations == 1, "Escape must cancel without release/send")
    event(.flagsChanged, 63, held: true)
    await pause()
    event(.tapDisabledByTimeout, 0, held: true)
    event(.flagsChanged, 63, held: false)
    precondition(releases == 1 && cancellations == 2, "A dropped event tap must cancel")
    monitor.stop()
    print("Native Fn monitor: 6 scenarios passed (no OS input or microphone access).")
    exit(0)
}
RunLoop.main.run()
