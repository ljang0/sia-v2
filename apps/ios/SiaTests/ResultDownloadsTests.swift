import WebKit
import XCTest
@testable import Sia

@MainActor
final class ResultDownloadsTests: XCTestCase {
    func testWebKitBlobDownloadPreservesBytesAndCleansTemporaryFile() async throws {
        let ready = expectation(description: "Result downloaded")
        var downloaded: URL?
        let downloads = ResultDownloads { file in
            downloaded = file
            ready.fulfill()
        }
        let delegate = DownloadNavigation(downloads: downloads)
        let view = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        view.navigationDelegate = delegate
        view.loadHTMLString("""
            <!doctype html><script>
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob(['orders,refunds,net\\n83,6,77\\n'], {type:'application/octet-stream'}));
            a.download = 'pilot.csv'; document.body?.append(a); a.click();
            </script>
            """, baseURL: URL(string: "https://fixture.invalid"))
        await fulfillment(of: [ready], timeout: 20)
        let file = try XCTUnwrap(downloaded)
        XCTAssertEqual(file.lastPathComponent, "pilot.csv")
        XCTAssertEqual(try String(contentsOf: file, encoding: .utf8), "orders,refunds,net\n83,6,77\n")
        downloads.clear()
        XCTAssertFalse(FileManager.default.fileExists(atPath: file.path))
        view.stopLoading()
    }
}

@MainActor
private final class DownloadNavigation: NSObject, WKNavigationDelegate {
    let downloads: ResultDownloads
    init(downloads: ResultDownloads) { self.downloads = downloads }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(action.shouldPerformDownload ? .download : .allow)
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        downloads.receive(download, from: webView)
    }
}
