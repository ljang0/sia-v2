import Foundation

/// The pairing a Mac hands to a phone in its QR link (docs/phone-cloud-relay.md). The values
/// live only in the link's fragment, which is never sent to any server.
struct Pairing: Codable, Hashable {
    /// The relay's wss URL.
    let r: String
    /// Device id and token issued by the relay at pairing.
    let d: String
    let t: String
    /// The AES-256-GCM key shared only with the Mac.
    let k: String

    /// Reads a pairing link such as `https://…/remote/#r=…&d=…&t=…&k=…`. Mirrors
    /// `pairingFrom` in apps/desktop/src/mobile/relay.ts, so the app accepts exactly what the
    /// phone page accepts.
    init?(link: String) {
        guard let url = URL(string: link.trimmingCharacters(in: .whitespacesAndNewlines)),
              url.scheme == "https",
              let fragment = url.fragment(percentEncoded: true),
              !fragment.isEmpty
        else { return nil }
        var values: [String: String] = [:]
        for part in fragment.split(separator: "&") {
            let pair = part.split(separator: "=", maxSplits: 1)
            guard pair.count == 2 else { continue }
            let value = String(pair[1]).replacingOccurrences(of: "+", with: " ")
            values[String(pair[0])] = value.removingPercentEncoding ?? value
        }
        guard let r = values["r"], let d = values["d"], let t = values["t"], let k = values["k"],
              !d.isEmpty, !t.isEmpty, !k.isEmpty,
              let relay = URLComponents(string: r)
        else { return nil }
        // Encrypted transport only; plain ws is allowed solely for a relay on this same device.
        let loopback = ["127.0.0.1", "localhost", "::1"].contains(relay.host ?? "")
        guard relay.scheme == "wss" || (relay.scheme == "ws" && loopback) else { return nil }
        self.init(r: r, d: d, t: t, k: k)
    }

    init(r: String, d: String, t: String, k: String) {
        self.r = r
        self.d = d
        self.t = t
        self.k = k
    }

    /// The fragment the bundled phone page reads on load (`readPairing` in relay.ts).
    var fragment: String {
        var components = URLComponents()
        components.queryItems = [
            URLQueryItem(name: "r", value: r),
            URLQueryItem(name: "d", value: d),
            URLQueryItem(name: "t", value: t),
            URLQueryItem(name: "k", value: k),
        ]
        // URLSearchParams reads "+" as a space, so it must be escaped.
        return (components.percentEncodedQuery ?? "").replacingOccurrences(of: "+", with: "%2B")
    }
}
