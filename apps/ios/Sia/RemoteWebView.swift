import SwiftUI
import UniformTypeIdentifiers
import WebKit

/// The phone screens from apps/desktop/src/mobile, served from inside the app over a private
/// `sia-app:` scheme. The page is the same one the web remote uses, so phone and web stay one
/// codebase; the pairing reaches it in the URL fragment, exactly like a scanned QR link.
struct RemoteWebView: UIViewRepresentable {
    let pairing: Pairing
    /// Called when the page reports that the Mac revoked this phone or forgot the pairing.
    let onUnpaired: () -> Void

    static let scheme = "sia-app"

    func makeCoordinator() -> Coordinator { Coordinator(onUnpaired: onUnpaired) }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.setURLSchemeHandler(BundledPageHandler(), forURLScheme: Self.scheme)
        configuration.userContentController.add(context.coordinator, name: "sia")
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = context.coordinator
        view.uiDelegate = context.coordinator
        view.isOpaque = false
        view.backgroundColor = .systemBackground
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.allowsBackForwardNavigationGestures = false
        if let url = URL(string: "\(Self.scheme)://app/index.html#\(pairing.fragment)") {
            view.load(URLRequest(url: url))
        }
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {}

    static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
        view.configuration.userContentController.removeScriptMessageHandler(forName: "sia")
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
        let onUnpaired: () -> Void

        init(onUnpaired: @escaping () -> Void) {
            self.onUnpaired = onUnpaired
        }

        func userContentController(
            _ controller: WKUserContentController, didReceive message: WKScriptMessage
        ) {
            guard message.frameInfo.isMainFrame,
                  message.frameInfo.securityOrigin.protocol == RemoteWebView.scheme,
                  let body = message.body as? [String: Any],
                  body["type"] as? String == "unpaired"
            else { return }
            onUnpaired()
        }

        /// Only the bundled page loads inside the app; web links open in Safari.
        func webView(
            _ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
            decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = action.request.url else { return decisionHandler(.cancel) }
            if url.scheme == RemoteWebView.scheme || url.scheme == "about" || url.scheme == "blob" {
                return decisionHandler(.allow)
            }
            if url.scheme == "https" || url.scheme == "mailto" || url.scheme == "tel" {
                UIApplication.shared.open(url)
            }
            decisionHandler(.cancel)
        }

        /// Links that ask for a new window (target=_blank) also open in Safari.
        func webView(
            _ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
            for action: WKNavigationAction, windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if let url = action.request.url, url.scheme == "https" {
                UIApplication.shared.open(url)
            }
            return nil
        }

        /// The microphone is for spoken requests on the bundled page only; iOS still asks once.
        func webView(
            _ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
            initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
            decisionHandler: @escaping @MainActor (WKPermissionDecision) -> Void
        ) {
            decisionHandler(
                origin.protocol == RemoteWebView.scheme && type == .microphone ? .grant : .deny)
        }
    }
}

/// Serves files from the app bundle's `remote` folder (the built phone page) and nothing else.
final class BundledPageHandler: NSObject, WKURLSchemeHandler {
    private let root = Bundle.main.resourceURL?.appendingPathComponent("remote", isDirectory: true)

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url, let root,
              let file = Self.file(for: url, in: root),
              let data = try? Data(contentsOf: file)
        else {
            let missing = HTTPURLResponse(
                url: task.request.url ?? URL(string: "\(RemoteWebView.scheme)://app/")!,
                statusCode: 404, httpVersion: "HTTP/1.1", headerFields: nil)!
            task.didReceive(missing)
            task.didFinish()
            return
        }
        let type = UTType(filenameExtension: file.pathExtension)?.preferredMIMEType
            ?? "application/octet-stream"
        let response = HTTPURLResponse(
            url: url, statusCode: 200, httpVersion: "HTTP/1.1",
            headerFields: [
                "Content-Type": type,
                "Content-Length": String(data.count),
                "Cache-Control": "no-store",
            ])!
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    /// Resolves a request path inside the bundled folder, refusing anything that escapes it.
    static func file(for url: URL, in root: URL) -> URL? {
        var path = url.path(percentEncoded: false)
        if path.isEmpty || path == "/" { path = "/index.html" }
        let candidate = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        let base = root.standardizedFileURL.path
        guard candidate.path.hasPrefix(base.hasSuffix("/") ? base : base + "/") else { return nil }
        return candidate
    }
}
