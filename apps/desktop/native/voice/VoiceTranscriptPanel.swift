import AppKit
import SwiftUI

enum VoiceTranscriptPhase: String {
    case listening, transcribing, sent, notice

    var title: String {
        switch self {
        case .listening: return "Listening"
        case .transcribing: return "Getting your words"
        case .sent: return "Sent to Sia"
        case .notice: return "Sia voice"
        }
    }

    var symbol: String {
        switch self {
        case .listening: return "waveform"
        case .transcribing: return "ellipsis"
        case .sent: return "checkmark"
        case .notice: return "info"
        }
    }
}

@MainActor
final class VoiceTranscriptModel: ObservableObject {
    @Published var text = ""
    @Published var label = "Sia"
    @Published var hint = ""
    @Published var phase: VoiceTranscriptPhase = .listening
    @Published var visible = false
}

/// A steady reading surface: partial words update in place without replaying an entrance.
struct VoiceTranscriptCard: View {
    @ObservedObject var model: VoiceTranscriptModel
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast

    private let mint = Color(red: 0.24, green: 0.79, blue: 0.60)
    private var dark: Bool { colorScheme == .dark }
    private var surface: Color {
        dark ? Color(red: 0.075, green: 0.085, blue: 0.09) : Color(red: 0.98, green: 0.985, blue: 0.98)
    }

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: 22, style: .continuous)
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: model.phase.symbol)
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(dark ? mint : Color(red: 0.035, green: 0.43, blue: 0.30))
                    .frame(width: 23, height: 23)
                    .background(mint.opacity(dark ? 0.13 : 0.12), in: Circle())
                Text(model.phase.title)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)
                Spacer(minLength: 8)
                if model.phase == .listening {
                    Text("fn")
                        .font(.system(size: 10, weight: .semibold, design: .rounded))
                        .padding(.horizontal, 5).padding(.vertical, 2)
                        .background(.primary.opacity(0.055), in: RoundedRectangle(cornerRadius: 4))
                    Text("Release to send")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                }
            }
            Text(model.text.isEmpty ? "What would you like Sia to do?" : model.text)
                .font(.system(size: 17, weight: .medium))
                .tracking(-0.25)
                .foregroundStyle(model.text.isEmpty ? .secondary : .primary)
                .lineSpacing(3)
                .lineLimit(3)
                .truncationMode(.tail)
                .frame(maxWidth: .infinity, minHeight: 72, maxHeight: 72, alignment: .topLeading)
            HStack(spacing: 12) {
                Text(model.label)
                    .lineLimit(1)
                    .truncationMode(.middle)
                Spacer(minLength: 0)
                if !model.hint.isEmpty {
                    Text(model.hint).lineLimit(1)
                }
            }
            .font(.system(size: 10.5, weight: .medium))
            .foregroundStyle(.secondary)
        }
        .padding(16)
        .background {
            if reduceTransparency {
                shape.fill(surface)
            } else {
                shape.fill(.regularMaterial)
                    .overlay(shape.fill(surface.opacity(dark ? 0.78 : 0.82)))
            }
        }
        .overlay(shape.strokeBorder(
            LinearGradient(colors: [mint.opacity(dark ? 0.35 : 0.30),
                                    Color.primary.opacity(0.10), mint.opacity(0.10)],
                           startPoint: .topLeading, endPoint: .bottomTrailing),
            lineWidth: contrast == .increased ? 2 : 1
        ))
        .shadow(color: .black.opacity(dark ? 0.25 : 0.12), radius: 14, y: 5)
        .padding(12)
        .opacity(model.visible ? 1 : 0)
        .scaleEffect(model.visible ? 1 : 0.97, anchor: .top)
        .animation(reduceMotion ? nil : .spring(response: 0.28, dampingFraction: 0.88), value: model.visible)
        .accessibilityElement(children: .combine)
    }
}

@MainActor
private final class VoiceStatusPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

@MainActor
final class VoiceTranscriptPanelController {
    private let model = VoiceTranscriptModel()
    private let panel = VoiceStatusPanel(contentRect: .zero,
        styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
    private var teardown: DispatchWorkItem?

    init() {
        panel.title = "Sia voice"
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.hidesOnDeactivate = false
        panel.ignoresMouseEvents = true
        panel.isFloatingPanel = true
        panel.level = .statusBar
        panel.animationBehavior = .none
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        panel.contentView = NSHostingView(rootView: VoiceTranscriptCard(model: model))
    }

    func show(_ text: String, hint: String = "", label: String = "Sia", phase: VoiceTranscriptPhase = .notice) {
        teardown?.cancel()
        teardown = nil
        model.text = String(text.prefix(4000))
        model.hint = String(hint.prefix(100))
        model.label = String(label.prefix(160))
        model.phase = phase
        reposition()
        panel.orderFrontRegardless()
        model.visible = true
    }

    func transcribing() {
        model.phase = .transcribing
        model.hint = "Finishing your request…"
    }

    func reposition() {
        let screen = EdgeGlowWindowController.targetScreen()
        let width = min(544, max(280, screen.visibleFrame.width - 32))
        let size = NSSize(width: width, height: 186)
        panel.setFrame(NSRect(x: screen.visibleFrame.midX - width / 2,
                              y: screen.visibleFrame.maxY - size.height - 6,
                              width: size.width, height: size.height), display: true)
    }

    func hide() {
        teardown?.cancel()
        model.visible = false
        let work = DispatchWorkItem { [weak self] in
            guard let self, !self.model.visible else { return }
            self.panel.orderOut(nil)
            self.model.text = ""
        }
        teardown = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18, execute: work)
    }
}
