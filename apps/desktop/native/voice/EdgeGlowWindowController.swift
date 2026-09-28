// Adapted from romirthedev/notch at 6c74c30. See README.md for provenance.
import AppKit
import SwiftUI

/// Full-screen, click-through overlay that renders the multicolor
/// edge glow around the display's edges.  Uses `EdgeGlowContentView` (SwiftUI
/// with `.drawingGroup()` for Metal compositing) hosted in a transparent panel.
@MainActor
final class EdgeGlowWindowController {

    private let panel: NSPanel
    private let model = EdgeGlowModel()

    /// Keeps the compositor at full rate while the glow animates; without it
    /// App Nap coalesces this accessory app's frames and the flow stutters.
    private var activity: NSObjectProtocol?

    /// Pending fade-out order-out.  Cancelled if the glow reactivates before
    /// it fires so a quick re-hold doesn't blink the window away.
    private var teardownWorkItem: DispatchWorkItem?

    /// Tracks logical state so the teardown guard can check re-activation.
    private var isActive = false

    /// Expand the screen frame by glowPadding on every side so the
    /// bloom/blur at the top corners is never clipped by the drawable region.
    private static func glowFrame(for screen: NSScreen) -> NSRect {
        let pad = EdgeGlowContentView.glowPadding
        return screen.frame.insetBy(dx: -pad, dy: -pad)
    }

    init() {
        let screen = Self.targetScreen()
        panel = NSPanel(
            contentRect: Self.glowFrame(for: screen),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.isMovable = false
        panel.hidesOnDeactivate = false
        panel.ignoresMouseEvents = true          // decorative — never eats clicks
        panel.isFloatingPanel = true
        panel.animationBehavior = .none
        // Set level AFTER isFloatingPanel — that setter resets it to .floating,
        // which would sit under the menu bar.
        panel.level = .statusBar
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]

        Self.applyCornerRadii(screen: screen, model: model)

        let glowFrame = Self.glowFrame(for: screen)
        let hostingView = NSHostingView(rootView: EdgeGlowContentView(model: model))
        hostingView.frame = NSRect(origin: .zero, size: glowFrame.size)
        hostingView.autoresizingMask = [.width, .height]
        panel.contentView = hostingView
    }

    /// Show (true) or fade out (false) the edge glow.
    func setActive(_ active: Bool, moving: Bool = true) {
        model.isMoving = moving
        guard active != isActive else { return }
        if active {
            teardownWorkItem?.cancel()
            teardownWorkItem = nil
            if activity == nil {
                activity = ProcessInfo.processInfo.beginActivity(
                    options: [.userInitiated, .latencyCritical],
                    reason: "Sia voice task indicator"
                )
            }
            // Re-anchor in case the display changed while we were hidden.
            let screen = Self.targetScreen()
            Self.applyCornerRadii(screen: screen, model: model)
            panel.setFrame(Self.glowFrame(for: screen), display: false)
            panel.orderFrontRegardless()
            isActive = true
            model.isActive = true
        } else {
            isActive = false
            model.isActive = false
            // Order out only after the fade-out completes.
            let work = DispatchWorkItem { [weak self] in
                guard let self, !self.isActive else { return }
                self.panel.orderOut(nil)
                if let activity = self.activity {
                    ProcessInfo.processInfo.endActivity(activity)
                    self.activity = nil
                }
                self.teardownWorkItem = nil
            }
            teardownWorkItem = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8, execute: work)
        }
    }

    /// Re-anchor to the (possibly new) notch display when the setup changes.
    func displaysChanged() {
        let screen = Self.targetScreen()
        panel.setFrame(Self.glowFrame(for: screen), display: true)
        Self.applyCornerRadii(screen: screen, model: model)
    }

    static func targetScreen() -> NSScreen {
        NSScreen.screens.first(where: { NSMouseInRect(NSEvent.mouseLocation, $0.frame, false) })
            ?? NSScreen.main ?? NSScreen.screens[0]
    }

    private static func applyCornerRadii(screen: NSScreen, model: EdgeGlowModel) {
        // Public geometry only; Notch's private _displayCornerRadius is deliberately omitted.
        model.topCornerRadius = 0
        model.bottomCornerRadius = screen.safeAreaInsets.top > 0 ? 10 : 0
    }
}
