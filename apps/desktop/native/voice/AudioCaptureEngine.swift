// Adapted from romirthedev/notch at 6c74c30. See README.md for provenance.
import AVFoundation
import Foundation

/// Notch's AVAudioEngine / AVAudioConverter path, streaming bounded 16 kHz PCM chunks.
/// Conversion happens inside the tap: AVAudioEngine owns and reuses the input buffer.
final class AudioCaptureEngine {
    var onAudio: ((Data) -> Void)?
    private let engine = AVAudioEngine()
    private var installedTap = false
    private var heardSpeech = false
    private var frameCount = 0
    private let lock = NSLock()
    private let targetFormat = AVAudioFormat(
        commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true
    )!

    func start() throws {
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0,
              let converter = AVAudioConverter(from: format, to: targetFormat) else {
            throw NSError(domain: "SiaVoice", code: 1)
        }
        heardSpeech = false
        frameCount = 0
        input.installTap(onBus: 0, bufferSize: AVAudioFrameCount(format.sampleRate / 10), format: format) { [weak self] buffer, _ in
            guard let self else { return }
            self.lock.lock()
            defer { self.lock.unlock() }
            if let channel = buffer.floatChannelData?[0], buffer.frameLength > 0 {
                var sum: Float = 0
                for i in 0..<Int(buffer.frameLength) { sum += channel[i] * channel[i] }
                if sqrt(sum / Float(buffer.frameLength)) > 0.015 { self.heardSpeech = true }
            }
            let capacity = AVAudioFrameCount(Double(buffer.frameLength) * 16000 / format.sampleRate) + 16
            guard let output = AVAudioPCMBuffer(pcmFormat: self.targetFormat, frameCapacity: capacity) else { return }
            var consumed = false
            var error: NSError?
            converter.convert(to: output, error: &error) { _, status in
                if consumed { status.pointee = .noDataNow; return nil }
                consumed = true
                status.pointee = .haveData
                return buffer
            }
            guard error == nil, output.frameLength > 0, let samples = output.int16ChannelData?[0] else { return }
            self.frameCount += Int(output.frameLength)
            // Copy before the engine reuses the buffer. Never retain audio on disk.
            let data = Data(bytes: samples, count: Int(output.frameLength) * 2)
            self.onAudio?(data)
        }
        installedTap = true
        do {
            engine.prepare()
            try engine.start()
        } catch {
            _ = stop()
            throw error
        }
    }

    func stop() -> Bool {
        if installedTap {
            engine.inputNode.removeTap(onBus: 0)
            installedTap = false
        }
        engine.stop()
        lock.lock()
        defer { lock.unlock() }
        return heardSpeech && frameCount >= 8000 // Ignore accidental sub-half-second recordings.
    }
}
