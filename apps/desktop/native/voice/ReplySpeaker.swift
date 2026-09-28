import AVFoundation
import Foundation

/// AVAudioPlayer lifecycle adapted from Notch/Voice/SpeechSpeaker.swift (6c74c30).
/// Sia's main process supplies audio; credentials and network requests stay there.
@MainActor
final class ReplySpeaker {
    private var player: AVAudioPlayer?
    private var id: String?
    private var audio = Data()

    func prepare(_ next: String) {
        stop()
        id = next
    }

    func append(_ encoded: String, for next: String) {
        guard id == next, encoded.utf8.count <= 12000,
              let data = Data(base64Encoded: encoded), audio.count + data.count <= 3_000_000 else {
            stop()
            return
        }
        audio.append(data)
    }

    func play(_ next: String) {
        guard id == next else { return }
        defer { audio = Data(); id = nil }
        guard let newPlayer = try? AVAudioPlayer(data: audio) else { return }
        player = newPlayer
        newPlayer.play()
    }

    func stop() {
        player?.stop()
        player = nil
        id = nil
        audio = Data()
    }
}
