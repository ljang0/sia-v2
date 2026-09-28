import AppKit
import AVFoundation
import Speech

/// A separate pipe-only mode: receives bounded PCM, never opens the microphone or a network client.
@MainActor
final class MacSpeech {
    private let synthesizer = AVSpeechSynthesizer()
    private var recognition: SFSpeechRecognitionTask?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var recognizer: SFSpeechRecognizer?
    private var session: String?
    private var transcript = ""
    private var recognitionFailure = false
    private var recognitionFinal = false
    private var finishID: String?
    private var speechID: String?
    private var speechData = Data()
    private var sampleRate: UInt32 = 22050
    private var lastPing = Date()
    private var deadline: Timer?

    init() {
        Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                if Date().timeIntervalSince(self.lastPing) > 15 { self.shutdown() }
            }
        }
    }
    private func reply(_ id: String, _ value: [String: Any]) {
        emit(["id": id, "result": value])
    }
    private func fail(_ id: String, _ code: String) { emit(["id": id, "error": code]) }
    private func speechPermission() -> String {
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized: return "allowed"
        case .notDetermined: return "not-requested"
        default: return "denied"
        }
    }
    private func catalog() -> [String: Any] {
        let language = Locale.current.identifier.replacingOccurrences(of: "_", with: "-")
        let defaultVoice = AVSpeechSynthesisVoice(language: language) ?? AVSpeechSynthesisVoice(language: "en-US")
        let voices = AVSpeechSynthesisVoice.speechVoices().prefix(400).map { ["id": $0.identifier, "name": $0.name, "category": $0.language] }
        return ["speechRecognition": speechPermission(), "voices": voices, "defaultVoiceId": defaultVoice?.identifier ?? "", "dictationAvailable": SFSpeechRecognizer(locale: Locale.current)?.supportsOnDeviceRecognition == true]
    }
    func command(_ value: [String: Any]) {
        guard let type = value["type"] as? String else { return }
        if type == "ping" { lastPing = Date(); return }
        if type == "shutdown" { shutdown(); return }
        guard let id = value["id"] as? String, UUID(uuidString: id) != nil else { return }
        switch type {
        case "catalog": reply(id, catalog())
        case "permissions": reply(id, ["speechRecognition": speechPermission()])
        case "authorize":
            guard SFSpeechRecognizer(locale: Locale.current)?.supportsOnDeviceRecognition == true else { fail(id, "on_device_unavailable"); return }
            if SFSpeechRecognizer.authorizationStatus() == .notDetermined {
                SFSpeechRecognizer.requestAuthorization { status in
                    DispatchQueue.main.async { status == .authorized ? self.reply(id, [:]) : self.fail(id, "speech_permission") }
                }
            } else if SFSpeechRecognizer.authorizationStatus() == .authorized { reply(id, [:]) }
            else {
                if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_SpeechRecognition") { NSWorkspace.shared.open(url) }
                fail(id, "speech_permission")
            }
        case "start":
            guard request == nil else { fail(id, "busy"); return }
            guard SFSpeechRecognizer.authorizationStatus() == .authorized else { fail(id, "speech_permission"); return }
            guard let engine = SFSpeechRecognizer(locale: Locale.current), engine.supportsOnDeviceRecognition, engine.isAvailable else { fail(id, "on_device_unavailable"); return }
            let audioRequest = SFSpeechAudioBufferRecognitionRequest()
            audioRequest.requiresOnDeviceRecognition = true
            audioRequest.shouldReportPartialResults = true
            request = audioRequest; recognizer = engine; session = id; transcript = ""; recognitionFailure = false; recognitionFinal = false
            recognition = engine.recognitionTask(with: audioRequest) { [weak self] result, error in
                DispatchQueue.main.async {
                    guard let self, self.session == id else { return }
                    if let result { self.transcript = result.bestTranscription.formattedString; self.recognitionFinal = result.isFinal }
                    if error != nil && !self.recognitionFinal { self.recognitionFailure = true }
                    if let finish = self.finishID, result?.isFinal == true || error != nil {
                        if self.recognitionFailure { self.fail(finish, "recognition_failed") }
                        else { self.reply(finish, ["text": self.transcript]) }
                        self.cancelRecognition()
                    }
                }
            }
            deadline = Timer.scheduledTimer(withTimeInterval: 70, repeats: false) { [weak self] _ in
                MainActor.assumeIsolated { self?.cancelRecognition() }
            }
            reply(id, [:])
        case "audio":
            guard value["sessionId"] as? String == session, finishID == nil,
                  let encoded = value["audioBase64"] as? String, encoded.count <= 48000,
                  let data = Data(base64Encoded: encoded), data.count % 2 == 0,
                  let format = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: false),
                  let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(data.count / 2)),
                  let channel = buffer.int16ChannelData?[0] else { return }
            buffer.frameLength = buffer.frameCapacity
            data.copyBytes(to: UnsafeMutableRawBufferPointer(start: channel, count: data.count))
            request?.append(buffer)
        case "finish":
            guard value["sessionId"] as? String == session, request != nil else { fail(id, "session_expired"); return }
            if value["commit"] as? Bool != true { cancelRecognition(); reply(id, ["text": ""]); return }
            if recognitionFailure { cancelRecognition(); fail(id, "recognition_failed"); return }
            if recognitionFinal { reply(id, ["text": transcript]); cancelRecognition(); return }
            finishID = id
            request?.endAudio()
        case "speak":
            guard speechID == nil else { fail(id, "busy"); return }
            guard let text = value["text"] as? String, !text.isEmpty, text.count <= 2100,
                  let voiceID = value["voiceId"] as? String,
                  let voice = AVSpeechSynthesisVoice(identifier: voiceID) else { fail(id, "voice_unavailable"); return }
            speechID = id; speechData = Data()
            let utterance = AVSpeechUtterance(string: text); utterance.voice = voice
            synthesizer.write(utterance) { [weak self] audio in
                // Copy the callback buffer before it is recycled by AVFoundation.
                guard let buffer = audio as? AVAudioPCMBuffer else { return }
                let rate = UInt32(buffer.format.sampleRate)
                var samples = Data()
                let frames = Int(buffer.frameLength)
                if frames > 0 {
                    guard let channel = buffer.floatChannelData?[0] else {
                        DispatchQueue.main.async { self?.speechError(id) }; return
                    }
                    for frame in 0..<frames {
                        var sample = Int16(max(-1, min(1, channel[frame * buffer.stride])) * 32767).littleEndian
                        withUnsafeBytes(of: &sample) { samples.append(contentsOf: $0) }
                    }
                }
                let copied = samples
                DispatchQueue.main.async {
                    guard let self, self.speechID == id else { return }
                    if frames == 0 {
                        guard !self.speechData.isEmpty else { self.speechError(id); return }
                        self.reply(id, ["audioBase64": self.wave().base64EncodedString()])
                        self.speechID = nil; self.speechData = Data()
                    } else if self.speechData.count + copied.count > 12 * 1024 * 1024 { self.speechError(id) }
                    else { self.sampleRate = rate; self.speechData.append(copied) }
                }
            }
        default: fail(id, "unsupported")
        }
    }
    private func speechError(_ id: String) {
        guard speechID == id else { return }
        synthesizer.stopSpeaking(at: .immediate); speechID = nil; speechData = Data(); fail(id, "speech_failed")
    }
    private func wave() -> Data {
        var data = Data()
        func text(_ value: String) { data.append(value.data(using: .ascii)!) }
        func u32(_ value: UInt32) { var n = value.littleEndian; withUnsafeBytes(of: &n) { data.append(contentsOf: $0) } }
        func u16(_ value: UInt16) { var n = value.littleEndian; withUnsafeBytes(of: &n) { data.append(contentsOf: $0) } }
        text("RIFF"); u32(UInt32(speechData.count) + 36); text("WAVEfmt "); u32(16)
        u16(1); u16(1); u32(sampleRate); u32(sampleRate * 2); u16(2); u16(16)
        text("data"); u32(UInt32(speechData.count)); data.append(speechData); return data
    }
    private func cancelRecognition() {
        session = nil; finishID = nil; deadline?.invalidate(); deadline = nil
        recognition?.cancel(); recognition = nil; request = nil; recognizer = nil; transcript = ""
    }
    func shutdown() { cancelRecognition(); synthesizer.stopSpeaking(at: .immediate); NSApplication.shared.terminate(nil) }
}
