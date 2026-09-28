import AppKit
import ImageIO

/// Codex may resize Retina screenshots again. Emit a bounded image with an explicit
/// image-to-screen transform instead of asking the model to divide by Retina twice.
enum MacScreenshot {
    static func imageSize(points: CGSize) -> CGSize {
        let scale = min(1, 1920 / points.width, 1200 / points.height)
        return CGSize(width: max(1, (points.width * scale).rounded()),
                      height: max(1, (points.height * scale).rounded()))
    }

    static func png(image: CGImage, size: CGSize) throws -> Data {
        guard let context = CGContext(data: nil, width: Int(size.width), height: Int(size.height),
                                      bitsPerComponent: 8, bytesPerRow: 0,
                                      space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
            throw failure("Could not allocate screenshot image")
        }
        context.interpolationQuality = .high
        context.draw(image, in: CGRect(origin: .zero, size: size))
        guard let scaled = context.makeImage() else { throw failure("Could not scale screenshot") }
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data, "public.png" as CFString, 1, nil) else {
            throw failure("Could not encode screenshot")
        }
        CGImageDestinationAddImage(destination, scaled, nil)
        guard CGImageDestinationFinalize(destination) else { throw failure("Could not finish screenshot") }
        return data as Data
    }

    static func capture(path: String, display: Int) throws -> [String: Any] {
        guard path.hasPrefix("/"), path.lowercased().hasSuffix(".png"),
              NSScreen.screens.indices.contains(display - 1) else {
            throw failure("Use an absolute PNG path and a current display number from --mac-context")
        }
        guard CGPreflightScreenCaptureAccess() else {
            throw failure("Screen Recording is unavailable. Enable it for Sia in macOS Settings and restart Sia.")
        }
        let screen = NSScreen.screens[display - 1]
        let frame = screen.frame
        let size = imageSize(points: frame.size)
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("sia-screen-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false)
        defer { try? FileManager.default.removeItem(at: directory) }
        let raw = directory.appendingPathComponent("retina.png")
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        task.arguments = ["-x", "-D", String(display), raw.path]
        task.standardOutput = FileHandle.nullDevice
        task.standardError = FileHandle.nullDevice
        try task.run()
        task.waitUntilExit()
        guard task.terminationStatus == 0,
              let source = CGImageSourceCreateWithURL(raw as CFURL, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
            throw failure("Screenshot capture failed; do not use a previous image")
        }
        try png(image: image, size: size).write(to: URL(fileURLWithPath: path), options: .atomic)
        let mainHeight = NSScreen.screens.first?.frame.height ?? frame.height
        return ["path": path, "display": display, "image_width": Int(size.width), "image_height": Int(size.height),
                "origin_x_points": frame.minX, "origin_y_points": mainHeight - frame.maxY,
                "points_per_image_pixel_x": frame.width / size.width,
                "points_per_image_pixel_y": frame.height / size.height,
                "coordinates": "For System Events use origin + image coordinate * points_per_image_pixel. Do NOT divide by Retina scale. View this exact PNG before clicking."]
    }

    private static func failure(_ message: String) -> NSError {
        NSError(domain: "SiaMacScreenshot", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
