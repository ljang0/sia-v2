// QR generation and Bonjour discovery adapted from romirthedev/notch 6c74c30,
// NotchApp.qrImage and RemoteControlServer.start. No voice capture in this mode.
import AppKit
import CoreImage
import Network

func remoteQRCode() {
    // The pairing capability travels over stdin, never process arguments or logs.
    let data = FileHandle.standardInput.readData(ofLength: 2049)
    guard data.count <= 2048, let filter = CIFilter(name: "CIQRCodeGenerator") else { exit(2) }
    filter.setValue(data, forKey: "inputMessage")
    filter.setValue("M", forKey: "inputCorrectionLevel")
    guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 6, y: 6)),
          let cg = CIContext().createCGImage(output, from: output.extent),
          let png = NSBitmapImageRep(cgImage: cg).representation(using: .png, properties: [:]) else { exit(2) }
    FileHandle.standardOutput.write(png)
}

final class PhoneRemoteDiscovery {
    private let service: NetService
    private let browser: NWBrowser
    init(port: Int32) {
        service = NetService(domain: "local.", type: "_http._tcp.", name: "Sia Phone Remote", port: port)
        browser = NWBrowser(for: .bonjour(type: "_http._tcp", domain: nil), using: .tcp)
        service.publish()
        // Advertising alone does not trigger macOS's Local Network permission prompt.
        browser.start(queue: .main)
    }
    func stop() { service.stop(); browser.cancel() }
}
