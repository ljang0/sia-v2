import Foundation
import ImageIO
import Vision

/// Reads pixels already captured and authorized by the desktop host. No screen,
/// file or network access. On-demand only, for previews without accessible text.
enum ImageText {
    static func recognize(_ data: Data) -> [String: Any] {
        guard data.count <= 16_000_000,
              let source = CGImageSourceCreateWithData(data as CFData, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int,
              let height = properties[kCGImagePropertyPixelHeight] as? Int,
              width > 0, height > 0, width <= 8192, height <= 8192 else { return ["status": "unavailable"] }
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false
        do {
            try VNImageRequestHandler(data: data, orientation: .up, options: [:]).perform([request])
            let lines = (request.results ?? []).compactMap { observation -> String? in
                guard let candidate = observation.topCandidates(1).first, candidate.confidence >= 0.7 else { return nil }
                return candidate.string
            }
            return ["status": "ready", "text": FnContext.bounded(lines.joined(separator: "\n"), 16000)]
        } catch { return ["status": "unavailable"] }
    }
}
