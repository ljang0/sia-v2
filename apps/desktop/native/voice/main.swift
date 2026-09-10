import AppKit
import AVFoundation
import SwiftUI

// Keep pipe backpressure off the main loop so the recording timeout and watchdog still run.
private let outputQueue = DispatchQueue(label: "sia.voice.output")

// stdout is a private, bounded event channel to the parent; never log audio or transcripts.
func emit(_ value: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: value) else { return }
    outputQueue.async { FileHandle.standardOutput.write(data + Data([10])) }
}

@MainActor
final class AssistantStatusPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

@MainActor
final class VoiceHelper {
    private var contextEnabled = false
    private var macContext = false
    private var monitor: PushToTalkMonitor?
    private let glow = EdgeGlowWindowController()
    private var capture: AudioCaptureEngine?
    private var heldID: String?
    private var sessionID: String?
    private var recordingID: String?
    private var processingVoice = false
    private var taskPhase = "idle"
    private var limit: Timer?
    private var statusTimer: Timer?
    private var lastPing = Date()
    private var observers: [NSObjectProtocol] = []
    private let status = AssistantStatusPanel(contentRect: NSRect(x: 0, y: 0, width: 440, height: 60),
                                 styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)

    init() {
        status.isOpaque = false
        status.backgroundColor = .clear
        status.hasShadow = true
        status.hidesOnDeactivate = false
        status.ignoresMouseEvents = true
        status.level = .statusBar
        status.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        monitor = PushToTalkMonitor()
        monitor?.onHoldBegan = { [weak self] in
            guard let self else { return }
            guard AVCaptureDevice.authorizationStatus(for: .audio) == .authorized else {
                self.command(["type": "status", "text": "Allow microphone access for Sia Voice in System Settings.", "dismiss": true])
                return
            }
            let id = UUID().uuidString
            self.heldID = id
            var event: [String: Any] = ["type": "hold", "id": id]
            if self.contextEnabled, let context = self.macContext ? ScreenContextProvider().capture()?.siaContext : FnContext.capture() { event["context"] = context }
            emit(event)
        }
        monitor?.onReleased = { [weak self] in
            guard let self, let id = self.heldID else { return }
            self.heldID = nil
            emit(["type": "released", "id": id])
            if self.recordingID == id { self.stop(commit: true) }
        }
        monitor?.onCancelled = { [weak self] in self?.cancel() }
        monitor?.onAvailability = { allowed in emit(["type": "ready", "accessibility": allowed, "microphone": AVCaptureDevice.authorizationStatus(for: .audio) == .authorized]) }
        for name in [NSWorkspace.willSleepNotification, NSWorkspace.screensDidSleepNotification,
                     NSWorkspace.sessionDidResignActiveNotification] {
            observers.append(NSWorkspace.shared.notificationCenter.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.monitor?.cancelHold() }
            })
        }
        observers.append(NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.glow.displaysChanged() }
        })
        Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                if Date().timeIntervalSince(self.lastPing) > 15 { self.shutdown() }
            }
        }
        emit(["type": "ready", "accessibility": AXIsProcessTrusted(), "microphone": AVCaptureDevice.authorizationStatus(for: .audio) == .authorized])
    }

    func command(_ value: [String: Any]) {
        guard let type = value["type"] as? String else { return }
        switch type {
        case "context":
            contextEnabled = value["enabled"] as? Bool == true
            macContext = value["mac"] as? Bool == true
        case "ping":
            lastPing = Date()
            emit(["type": "ready", "accessibility": AXIsProcessTrusted(), "microphone": AVCaptureDevice.authorizationStatus(for: .audio) == .authorized])
        case "permissions":
            let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
            _ = AXIsProcessTrustedWithOptions(options)
            if AVCaptureDevice.authorizationStatus(for: .audio) == .notDetermined {
                AVCaptureDevice.requestAccess(for: .audio) { _ in }
            } else if AVCaptureDevice.authorizationStatus(for: .audio) != .authorized {
                if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone") { NSWorkspace.shared.open(url) }
            }
        case "start":
            guard let id = value["id"] as? String, id == heldID, capture == nil else { return }
            sessionID = id
            guard AVCaptureDevice.authorizationStatus(for: .audio) == .authorized else {
                emit(["type": "error", "id": id, "code": "microphone"])
                return
            }
            let engine = AudioCaptureEngine()
            // Tap delivery and stop's completion are ordered on the main queue.
            engine.onAudio = { data in
                DispatchQueue.main.async { [weak self] in
                    guard self?.sessionID == id else { return }
                    emit(["type": "audio", "id": id, "audioBase64": data.base64EncodedString()])
                }
            }
            do {
                try engine.start()
                capture = engine
                recordingID = id
                processingVoice = true
                updateGlow()
                status.orderOut(nil)
                emit(["type": "recording", "id": id])
                limit = Timer.scheduledTimer(withTimeInterval: 60, repeats: false) { [weak self] _ in
                    MainActor.assumeIsolated { self?.cancel() }
                }
            } catch { emit(["type": "error", "id": id, "code": "capture"]) }
        case "cancel":
            guard let id = value["id"] as? String else { return }
            if sessionID == id || heldID == id {
                stop(commit: false)
                sessionID = nil
                status.orderOut(nil)
            }
        case "task":
            guard let phase = value["phase"] as? String,
                  ["idle", "working", "waiting"].contains(phase) else { return }
            taskPhase = phase
            updateGlow()
        case "session":
            sessionID = value["id"] as? String
            if sessionID == nil { processingVoice = false }
            updateGlow()
            statusTimer?.invalidate()
            status.orderOut(nil)
        case "status":
            sessionID = value["id"] as? String
            show(value["text"] as? String ?? "Sia", hint: value["hint"] as? String ?? "")
            if value["dismiss"] as? Bool == true {
                sessionID = nil
                statusTimer = Timer.scheduledTimer(withTimeInterval: 3, repeats: false) { [weak self] _ in
                    MainActor.assumeIsolated { self?.status.orderOut(nil) }
                }
            }
        case "shutdown": shutdown()
        default: break
        }
    }

    private func show(_ text: String, hint: String) {
        statusTimer?.invalidate()
        status.ignoresMouseEvents = true
        status.setContentSize(NSSize(width: 440, height: 60))
        let screen = EdgeGlowWindowController.targetScreen()
        status.setFrameOrigin(NSPoint(x: screen.visibleFrame.midX - 220, y: screen.visibleFrame.maxY - 78))
        status.contentView = NSHostingView(rootView:
            VStack(spacing: 4) {
                Text(String(text.prefix(140))).font(.system(size: 14, weight: .medium)).lineLimit(1)
                Text(hint).font(.system(size: 11)).foregroundStyle(.secondary)
            }.padding(12).frame(width: 440, height: 60).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        )
        status.orderFrontRegardless()
    }

    private func updateGlow() {
        glow.setActive(processingVoice || taskPhase != "idle",
                       moving: processingVoice || taskPhase == "working")
    }

    private func stop(commit: Bool) {
        limit?.invalidate()
        limit = nil
        let id = recordingID
        recordingID = nil
        let heardSpeech = capture?.stop() ?? false
        capture = nil
        processingVoice = commit && heardSpeech
        updateGlow()
        guard let id else { return }
        DispatchQueue.main.async {
            emit(["type": "stopped", "id": id, "hasSpeech": commit && heardSpeech])
        }
    }

    private func cancel() {
        let id = sessionID ?? heldID
        heldID = nil
        stop(commit: false)
        sessionID = nil
        status.orderOut(nil)
        if let id { emit(["type": "cancelled", "id": id]) }
    }

    func shutdown() {
        taskPhase = "idle"
        cancel()
        monitor?.stop()
        NSApplication.shared.terminate(nil)
    }
}

let application = NSApplication.shared
application.setActivationPolicy(.accessory)
if CommandLine.arguments == [CommandLine.arguments[0], "--mac-context"] {
    let displays = NSScreen.screens.enumerated().map { index, screen -> [String: Any] in
        let frame = screen.frame
        let mainHeight = NSScreen.screens.first?.frame.height ?? frame.height
        return ["display": index + 1, "width_points": frame.width, "height_points": frame.height,
                "origin_x_points": frame.minX, "origin_y_points": mainHeight - frame.maxY,
                "scale": screen.backingScaleFactor,
                "width_pixels": frame.width * screen.backingScaleFactor, "height_pixels": frame.height * screen.backingScaleFactor]
    }
    let context = ScreenContextProvider().capture()?.promptBlock ?? "No accessible foreground context. Inspect the target app directly."
    let value: [String: Any] = ["context": context, "displays": displays]
    if let data = try? JSONSerialization.data(withJSONObject: value) { FileHandle.standardOutput.write(data) }
    exit(0)
}
if CommandLine.arguments == [CommandLine.arguments[0], "--image-text"] {
    var data = Data()
    while data.count <= 16_000_000 {
        let chunk = FileHandle.standardInput.readData(ofLength: min(65536, 16_000_001 - data.count))
        if chunk.isEmpty { break }
        data.append(chunk)
    }
    let result = ImageText.recognize(data)
    if let output = try? JSONSerialization.data(withJSONObject: result) { FileHandle.standardOutput.write(output) }
    exit(0)
}
if CommandLine.arguments.contains("--window-context") {
    guard CommandLine.arguments.count == 4, let pid = Int32(CommandLine.arguments[2]),
          let windowID = UInt32(CommandLine.arguments[3]), pid > 0, windowID > 0 else { exit(2) }
    let result = WindowContext.capture(pid: pid, windowID: windowID)
    if let data = try? JSONSerialization.data(withJSONObject: result) { FileHandle.standardOutput.write(data) }
    exit(0)
}
if CommandLine.arguments.contains("--browser-window") {
    guard CommandLine.arguments.count == 4, let pid = Int32(CommandLine.arguments[2]),
          let windowID = UInt32(CommandLine.arguments[3]), pid > 0, windowID > 0 else { exit(2) }
    let result = BrowserWindow.inspect(pid: pid, windowID: windowID)
    if let data = try? JSONSerialization.data(withJSONObject: result) { FileHandle.standardOutput.write(data) }
    exit(0)
}
if CommandLine.arguments.contains("--automation-check") {
    runAutomationPermissions(request: nil)
    application.run()
    exit(0)
}
if CommandLine.arguments.contains("--automation-request") {
    guard CommandLine.arguments.count == 3 else { exit(2) }
    runAutomationPermissions(request: CommandLine.arguments[2])
    application.run()
    exit(0)
}
let speechMode = CommandLine.arguments.contains("--speech")
let helper = MainActor.assumeIsolated { speechMode ? nil : VoiceHelper() }
let speech = MainActor.assumeIsolated { speechMode ? MacSpeech() : nil }
DispatchQueue.global(qos: .userInitiated).async {
    while let line = readLine() {
        guard line.utf8.count <= (speechMode ? 65536 : 16384), let data = line.data(using: .utf8),
              let command = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
        DispatchQueue.main.async { if let speech { speech.command(command) } else { helper?.command(command) } }
    }
    DispatchQueue.main.async { speech?.shutdown(); helper?.shutdown() }
}
application.run()
