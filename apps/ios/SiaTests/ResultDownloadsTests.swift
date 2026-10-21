import WebKit
import XCTest
@testable import Sia

@MainActor
final class ResultDownloadsTests: XCTestCase {
    func testCompletedDownloadPresentsShareSheetAndUnpairDismissesIt() async throws {
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let previous = scene.windows.first(where: \.isKeyWindow)
        let window = UIWindow(windowScene: scene)
        let presenter = UIViewController()
        let view = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let downloads = ResultDownloads()
        let delegate = DownloadNavigation(downloads: downloads)
        view.navigationDelegate = delegate
        presenter.view.addSubview(view)
        window.rootViewController = presenter
        window.makeKeyAndVisible()
        defer {
            downloads.clear()
            view.stopLoading()
            window.isHidden = true
            previous?.makeKeyAndVisible()
        }
        view.loadHTMLString("""
            <!doctype html><body><script>
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob(['Fictional pilot report'], {type:'text/plain'}));
            a.download = 'pilot.txt'; document.body.append(a); a.click();
            </script></body>
            """, baseURL: URL(string: "https://fixture.invalid"))
        let shown = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            presenter.presentedViewController is UIActivityViewController
        }, object: nil)
        await fulfillment(of: [shown], timeout: 20)
        downloads.clear()
        let dismissed = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            presenter.presentedViewController == nil
        }, object: nil)
        await fulfillment(of: [dismissed], timeout: 5)
    }

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
