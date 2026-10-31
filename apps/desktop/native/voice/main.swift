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
    private let speaker = ReplySpeaker()
    private var limit: Timer?
    private var statusTimer: Timer?
    private var lastPing = Date()
    private var observers: [NSObjectProtocol] = []
    private let status = VoiceTranscriptPanelController()

    init() {
        monitor = PushToTalkMonitor()
        monitor?.onHoldBegan = { [weak self] in
            guard let self else { return }
            self.speaker.stop()
            emit(["type": "speechCancelled"])
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
            MainActor.assumeIsolated {
                self?.glow.displaysChanged()
                self?.status.reposition()
            }
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
        case "speechPrepare":
            guard heldID == nil, recordingID == nil, let id = value["id"] as? String else { return }
            speaker.prepare(id)
        case "speechAudio":
            guard let id = value["id"] as? String, let audio = value["audioBase64"] as? String else { return }
            speaker.append(audio, for: id)
        case "speechPlay":
            guard heldID == nil, recordingID == nil, let id = value["id"] as? String else { return }
            speaker.play(id)
        case "stopSpeech":
            speaker.stop()
        case "context":
            contextEnabled = value["enabled"] as? Bool == true
            macContext = value["mac"] as? Bool == true
        case "ping":
            lastPing = Date()
            emit(["type": "ready", "accessibility": AXIsProcessTrusted(), "microphone": AVCaptureDevice.authorizationStatus(for: .audio) == .authorized])
        case "permissions":
            if value["accessibility"] as? Bool != false && !AXIsProcessTrusted() {
                let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
                _ = AXIsProcessTrustedWithOptions(options)
            }
            // Microphone consent belongs to the signed Electron app's visible
            // setup window. This helper only observes the resulting grant.
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
                statusTimer?.invalidate()
                status.show("", hint: "Esc to cancel", label: value["label"] as? String ?? "Sia", phase: .listening)
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
                status.hide()
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
            if sessionID != nil && processingVoice && recordingID == nil { status.transcribing() }
            else { status.hide() }
        case "status":
            if let id = value["id"] as? String, id != sessionID { return }
            statusTimer?.invalidate()
            status.show(value["text"] as? String ?? "Sia", hint: value["hint"] as? String ?? "",
                        label: value["label"] as? String ?? "Sia",
                        phase: VoiceTranscriptPhase(rawValue: value["voicePhase"] as? String ?? "") ?? .notice)
            if value["dismiss"] as? Bool == true {
                sessionID = nil
                statusTimer = Timer.scheduledTimer(withTimeInterval: 3, repeats: false) { [weak self] _ in
                    MainActor.assumeIsolated { self?.status.hide() }
                }
            }
        case "shutdown": shutdown()
        default: break
        }
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
        if processingVoice { status.transcribing() }
        updateGlow()
        guard let id else { return }
        DispatchQueue.main.async {
            emit(["type": "stopped", "id": id, "hasSpeech": commit && heardSpeech])
        }
    }

    private func cancel() {
        speaker.stop()
        emit(["type": "speechCancelled"])
        let id = sessionID ?? heldID
        heldID = nil
        stop(commit: false)
        sessionID = nil
        status.hide()
        if let id { emit(["type": "cancelled", "id": id]) }
    }

    func shutdown() {
        taskPhase = "idle"
        cancel()
        monitor?.stop()
        NSApplication.shared.terminate(nil)
    }
}

if CommandLine.arguments.count >= 2 && CommandLine.arguments[1] == "--workspace-file-move" {
    guard CommandLine.arguments.count == 6 else { exit(2) }
    var result: [String: Any]
    do {
        result = try WorkspaceMove.move(root: CommandLine.arguments[2], source: CommandLine.arguments[3],
                                        destination: CommandLine.arguments[4], expected: CommandLine.arguments[5])
    } catch let error as WorkspaceMove.Failure {
        result = ["moved": false, "error": error.message]
    } catch {
        result = ["moved": false, "error": "Unable to inspect the file; no move was made."]
    }
    if let data = try? JSONSerialization.data(withJSONObject: result) { FileHandle.standardOutput.write(data) }
    exit(0)
}
if CommandLine.arguments == [CommandLine.arguments[0], "--notch-engine"] {
    runNotchEngine()
    exit(0)
}
let application = NSApplication.shared
application.setActivationPolicy(.accessory)
if CommandLine.arguments == [CommandLine.arguments[0], "--window-observer"] {
    WindowObserver.run(application)
    exit(0)
}
if CommandLine.arguments == [CommandLine.arguments[0], "--remote-qr"] {
    remoteQRCode()
    exit(0)
}
if CommandLine.arguments.contains("--remote-discovery") {
    guard CommandLine.arguments.count == 3, let port = Int32(CommandLine.arguments[2]), port > 0, port <= 65535 else { exit(2) }
    let discovery = PhoneRemoteDiscovery(port: port)
    DispatchQueue.global().async {
        while !FileHandle.standardInput.availableData.isEmpty {}
        DispatchQueue.main.async { discovery.stop(); application.terminate(nil) }
    }
    application.run()
    exit(0)
}
if CommandLine.arguments.contains("--mac-screenshot") {
    guard CommandLine.arguments.count == 3 || CommandLine.arguments.count == 4,
          CommandLine.arguments[1] == "--mac-screenshot",
          let display = Int(CommandLine.arguments.count == 4 ? CommandLine.arguments[3] : "1") else { exit(2) }
    do {
        let result = try MacScreenshot.capture(path: CommandLine.arguments[2], display: display)
        FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: result))
    } catch {
        FileHandle.standardError.write(Data(error.localizedDescription.utf8))
        exit(1)
    }
    exit(0)
}
if CommandLine.arguments == [CommandLine.arguments[0], "--mac-apps"] {
    let apps = NSWorkspace.shared.runningApplications.filter { $0.activationPolicy == .regular }.map { app -> [String: Any] in
        ["pid": app.processIdentifier, "name": app.localizedName ?? "Unknown", "bundleID": app.bundleIdentifier ?? "", "frontmost": app.isActive]
    }
    if let data = try? JSONSerialization.data(withJSONObject: ["apps": apps]) { FileHandle.standardOutput.write(data) }
    exit(0)
}
if CommandLine.arguments.count >= 2 && CommandLine.arguments[1] == "--mac-context" {
    guard CommandLine.arguments.count == 2 || CommandLine.arguments.count == 3 else { exit(2) }
    let pid = CommandLine.arguments.count == 3 ? Int32(CommandLine.arguments[2]) : nil
    if CommandLine.arguments.count == 3 && (pid == nil || pid! <= 0) { exit(2) }
    let displays = NSScreen.screens.enumerated().map { index, screen -> [String: Any] in
        let frame = screen.frame
        let mainHeight = NSScreen.screens.first?.frame.height ?? frame.height
        return ["display": index + 1, "width_points": frame.width, "height_points": frame.height,
                "origin_x_points": frame.minX, "origin_y_points": mainHeight - frame.maxY,
                "scale": screen.backingScaleFactor,
                "width_pixels": frame.width * screen.backingScaleFactor, "height_pixels": frame.height * screen.backingScaleFactor]
    }
    let captured = ScreenContextProvider(detailed: pid != nil).capture(pid: pid)
    let context = captured?.promptBlock ?? "No accessible context for the requested app. It may have closed, have no window, or require Accessibility access. No other app was substituted."
    let value: [String: Any] = ["status": captured == nil ? "unavailable" : "ready", "context": context,
                              "partial": captured?.isPartial ?? true, "captured_at": ISO8601DateFormatter().string(from: Date()), "displays": displays]
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
let speechMode = CommandLine.arguments == [CommandLine.arguments[0], "--speech"]
guard speechMode || CommandLine.arguments.count == 1 else { exit(2) }
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
