import SwiftUI

/// First run: pair this iPhone with Sia on a Mac by scanning the code in Settings → Phone remote.
struct PairingView: View {
    let onPaired: (Pairing) -> Void
    @State private var scanning = false
    @State private var problem: String?

    var body: some View {
        VStack(spacing: 28) {
            Spacer()
            Image("Logo")
                .resizable()
                .frame(width: 96, height: 96)
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                .shadow(color: .black.opacity(0.12), radius: 16, y: 6)
                .accessibilityHidden(true)
            VStack(spacing: 10) {
                Text("Your Mac, within reach.")
                    .font(.system(.largeTitle, design: .default, weight: .bold))
                    .multilineTextAlignment(.center)
                Text("Pair once, then ask Sia from anywhere. Your Mac does the work.")
                    .font(.title3)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            VStack(alignment: .leading, spacing: 14) {
                Step(number: 1, text: "On your Mac, open Sia → Settings → Phone remote.")
                Step(number: 2, text: "Choose Pair a phone.")
                Step(number: 3, text: "Scan the code with this iPhone.")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
            .background(.background.secondary, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            if let problem {
                Text(problem)
                    .font(.callout)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }
            Spacer()
            VStack(spacing: 12) {
                Button {
                    problem = nil
                    scanning = true
                } label: {
                    Label("Scan pairing code", systemImage: "qrcode.viewfinder")
                        .font(.headline)
                        .frame(maxWidth: .infinity, minHeight: 52)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color("Accent"))
                // The system paste button reads the clipboard only when tapped, with no prompt.
                PasteButton(payloadType: String.self) { strings in
                    Task { @MainActor in pair(strings.first ?? "") }
                }
                .buttonBorderShape(.capsule)
                .labelStyle(.titleAndIcon)
                .tint(Color("Accent"))
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 12)
        .fullScreenCover(isPresented: $scanning) {
            ZStack(alignment: .topTrailing) {
                QRScannerView(
                    onCode: { code in
                        scanning = false
                        pair(code)
                    },
                    onUnavailable: {
                        scanning = false
                        problem = "Sia can’t use the camera. Allow it in Settings, or paste the pairing link instead."
                    })
                .ignoresSafeArea()
                Button("Cancel") { scanning = false }
                    .font(.headline)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
                    .background(.ultraThinMaterial, in: Capsule())
                    .padding(20)
            }
        }
    }

    private func pair(_ link: String) {
        guard let pairing = Pairing(link: link) else {
            problem = "That isn’t a Sia pairing code. On your Mac, choose Pair a phone and try again."
            return
        }
        onPaired(pairing)
    }
}

private struct Step: View {
    let number: Int
    let text: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text("\(number)")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .frame(width: 26, height: 26)
                .background(Color("Accent"), in: Circle())
            Text(text).font(.body)
        }
    }
}
