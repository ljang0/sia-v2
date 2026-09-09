// Adapted from romirthedev/notch at 6c74c30. See README.md for provenance.
import SwiftUI

@MainActor
final class EdgeGlowModel: ObservableObject {
    @Published var isActive = false
    @Published var isMoving = true
    @Published var topCornerRadius: CGFloat = 10
    @Published var bottomCornerRadius: CGFloat = 10
}

/// A quiet forest-green edge with a mint highlight travelling along the perimeter.
/// The overlay remains transparent and click-through; reduced motion uses a still edge.
struct EdgeGlowContentView: View {
    @ObservedObject var model: EdgeGlowModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    static let glowPadding: CGFloat = 20

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 60.0,
                                paused: !model.isActive || !model.isMoving || reduceMotion)) { timeline in
            let moving = model.isMoving && !reduceMotion
            let phase = moving ? timeline.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 5.0) / 5.0 : 0.12
            Canvas { context, size in
                let rect = CGRect(origin: .zero, size: size).insetBy(dx: Self.glowPadding + 1.5, dy: Self.glowPadding + 1.5)
                let path = UnevenRoundedRectangle(
                    topLeadingRadius: model.topCornerRadius,
                    bottomLeadingRadius: model.bottomCornerRadius,
                    bottomTrailingRadius: model.bottomCornerRadius,
                    topTrailingRadius: model.topCornerRadius,
                    style: .circular
                ).path(in: rect)
                let forest = Color(red: 0.15, green: 0.40, blue: 0.31)
                let mint = Color(red: 0.58, green: 0.83, blue: 0.66)
                context.stroke(path, with: .color(forest.opacity(0.65)), lineWidth: 1.5)
                if !moving {
                    context.stroke(path, with: .color(mint.opacity(0.55)), lineWidth: 2)
                } else {
                    // A fading tail wraps at the path seam, so it travels smoothly around
                    // rectangular displays without a rotating rectangle or corner jumps.
                    var segments: [(Path, Double)] = []
                    for index in 0..<96 {
                        let start = (phase + Double(index) * 0.002).truncatingRemainder(dividingBy: 1)
                        let end = start + 0.002
                        let alpha = Double(index + 1) / 96
                        var segment = path.trimmedPath(from: start, to: min(end, 1))
                        if end > 1 { segment.addPath(path.trimmedPath(from: 0, to: end - 1)) }
                        segments.append((segment, alpha))
                    }
                    // Composite the whole bloom once, rather than allocating one layer
                    // per tail segment on a full-resolution display.
                    context.drawLayer { bloom in
                        bloom.addFilter(.blur(radius: 3))
                        for (segment, alpha) in segments {
                            bloom.stroke(segment, with: .color(mint.opacity(alpha * 0.35)), lineWidth: 6)
                        }
                    }
                    for (segment, alpha) in segments {
                        context.stroke(segment, with: .color(mint.opacity(alpha)),
                                       style: StrokeStyle(lineWidth: 2.5, lineCap: .butt))
                    }
                }
            }
        }
        .ignoresSafeArea()
        .opacity(model.isActive ? 1 : 0)
        .animation(.easeInOut(duration: model.isActive ? 0.3 : 0.5), value: model.isActive)
        .allowsHitTesting(false)
    }
}
