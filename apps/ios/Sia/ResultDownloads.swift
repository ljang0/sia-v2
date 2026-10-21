import UIKit
import WebKit

/// Receives the decrypted result blob from the bundled page and offers the iOS save/share sheet.
/// Each file has its own temporary directory; dismissing the sheet or unpairing removes it.
@MainActor
final class ResultDownloads: NSObject, WKDownloadDelegate {
    private weak var webView: WKWebView?
    private weak var sharing: UIActivityViewController?
    private let onReady: ((URL) -> Void)?

    init(onReady: ((URL) -> Void)? = nil) { self.onReady = onReady }
    private var active: [ObjectIdentifier: WKDownload] = [:]
    private var files: [ObjectIdentifier: URL] = [:]
    private var directories = Set<URL>()

    func receive(_ download: WKDownload, from webView: WKWebView) {
        self.webView = webView
        active[ObjectIdentifier(download)] = download
        download.delegate = self
    }

    static func safeFilename(_ suggested: String) -> String {
        let name = (suggested as NSString).lastPathComponent
            .components(separatedBy: .controlCharacters).joined()
        return name.isEmpty || name == "." || name == ".." ? "Sia result" : name
    }

    func download(
        _ download: WKDownload, decideDestinationUsing response: URLResponse,
        suggestedFilename: String, completionHandler: @escaping (URL?) -> Void
    ) {
        guard response.expectedContentLength <= 25 * 1024 * 1024 else {
            completionHandler(nil)
            return
        }
        do {
            let directory = FileManager.default.temporaryDirectory
                .appendingPathComponent("sia-result-\(UUID().uuidString)", isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            directories.insert(directory)
            let file = directory.appendingPathComponent(Self.safeFilename(suggestedFilename))
            files[ObjectIdentifier(download)] = file
            completionHandler(file)
        } catch {
            completionHandler(nil)
        }
    }

    func downloadDidFinish(_ download: WKDownload) {
        let id = ObjectIdentifier(download)
        active.removeValue(forKey: id)
        guard let file = files.removeValue(forKey: id) else { return }
        if let onReady { return onReady(file) }
        guard let presenter = webView?.window?.rootViewController,
              presenter.presentedViewController == nil else {
            remove(file.deletingLastPathComponent())
            return
        }
        let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        sheet.completionWithItemsHandler = { [weak self] _, _, _, _ in
            self?.remove(file.deletingLastPathComponent())
        }
        sheet.popoverPresentationController?.sourceView = webView
        sheet.popoverPresentationController?.sourceRect = webView?.bounds ?? .zero
        sharing = sheet
        presenter.present(sheet, animated: true)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        let id = ObjectIdentifier(download)
        active.removeValue(forKey: id)
        if let file = files.removeValue(forKey: id) { remove(file.deletingLastPathComponent()) }
        guard let presenter = webView?.window?.rootViewController,
              presenter.presentedViewController == nil else { return }
        let alert = UIAlertController(title: "Couldn’t save this file", message: "Please try again while your Mac is connected.", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        presenter.present(alert, animated: true)
    }

    func clear() {
        sharing?.dismiss(animated: false)
        let downloads = Array(active.values)
        active.removeAll()
        for download in downloads {
            download.delegate = nil
            download.cancel { _ in }
        }
        files.removeAll()
        for directory in Array(directories) { remove(directory) }
    }

    private func remove(_ directory: URL) {
        try? FileManager.default.removeItem(at: directory)
        directories.remove(directory)
    }
}
