import XCTest
@testable import Sia

final class PairingTests: XCTestCase {
    private let link =
        "https://superintelligentagents.ai/remote/#r=wss%3A%2F%2Frelay.example.test%2Fv1&d=device-1&t=tok_en-1&k=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

    func testReadsAPairingLink() throws {
        let pairing = try XCTUnwrap(Pairing(link: link))
        XCTAssertEqual(pairing.r, "wss://relay.example.test/v1")
        XCTAssertEqual(pairing.d, "device-1")
        XCTAssertEqual(pairing.t, "tok_en-1")
        XCTAssertEqual(pairing.k.count, 43)
    }

    func testRefusesUnencryptedOrIncompleteLinks() {
        XCTAssertNil(Pairing(link: link.replacingOccurrences(of: "wss%3A", with: "ws%3A")))
        XCTAssertNil(Pairing(link: link.replacingOccurrences(of: "https://", with: "http://")))
        XCTAssertNil(Pairing(link: "https://superintelligentagents.ai/remote/#d=a&t=b&k=c"))
        XCTAssertNil(Pairing(link: "not a link"))
        // A relay on this same device may use plain ws, as on the web page.
        XCTAssertNotNil(Pairing(link: link.replacingOccurrences(
            of: "wss%3A%2F%2Frelay.example.test", with: "ws%3A%2F%2F127.0.0.1%3A8080")))
    }

    func testFragmentRoundTripsThroughURLSearchParamsRules() throws {
        let pairing = Pairing(r: "wss://relay.example.test/v1", d: "d+1", t: "t&2", k: "k=3")
        let again = try XCTUnwrap(Pairing(link: "https://x.test/remote/#\(pairing.fragment)"))
        XCTAssertEqual(again, pairing)
        XCTAssertFalse(pairing.fragment.contains("+"))
    }

    func testPairingPersistsUpdatesAndRevokesInKeychain() throws {
        let store = PairingStore(service: "ai.sia.phone.tests.\(UUID().uuidString)")
        defer { store.clear() }
        let pairing = try XCTUnwrap(Pairing(link: link))
        XCTAssertTrue(store.save(pairing))
        XCTAssertEqual(PairingStore(service: store.service).load(), pairing)
        let updated = Pairing(r: pairing.r, d: "replacement", t: "synthetic", k: pairing.k)
        XCTAssertTrue(store.save(updated))
        XCTAssertEqual(store.load(), updated)
        store.clear()
        XCTAssertNil(store.load())
    }

    @MainActor
    func testResultFilenamesCannotEscapeTheirTemporaryDirectory() {
        XCTAssertEqual(ResultDownloads.safeFilename("../../report.csv"), "report.csv")
        XCTAssertEqual(ResultDownloads.safeFilename(".."), "Sia result")
        XCTAssertEqual(ResultDownloads.safeFilename("report\n.csv"), "report.csv")
        XCTAssertEqual(ResultDownloads.safeFilename("Family résumé.csv"), "Family résumé.csv")
    }

    func testBundledPageHandlerStaysInsideItsFolder() throws {
        let root = URL(fileURLWithPath: "/tmp/remote", isDirectory: true)
        XCTAssertEqual(
            BundledPageHandler.file(for: try XCTUnwrap(URL(string: "sia-app://app/")), in: root)?.path,
            "/tmp/remote/index.html")
        XCTAssertEqual(
            BundledPageHandler.file(
                for: try XCTUnwrap(URL(string: "sia-app://app/assets/a.js")), in: root)?.path,
            "/tmp/remote/assets/a.js")
        XCTAssertNil(
            BundledPageHandler.file(
                for: try XCTUnwrap(URL(string: "sia-app://app/../secret")), in: root))
    }
}
