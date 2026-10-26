import AppKit

/// Fixed, read-only operations over the parent's private pipes. Keeping one AX
/// client and a running main loop avoids restarting accessibility for every read.
enum WindowObserver {
    struct Request: Decodable {
        let id: String
        let operation: String
        let pid: Int32
        let window_id: UInt32
    }

    static func request(_ line: String) -> Request? {
        guard line.utf8.count <= 1024, let data = line.data(using: .utf8),
              let fields = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              Set(fields.keys) == Set(["id", "operation", "pid", "window_id"]),
              let request = try? JSONDecoder().decode(Request.self, from: data),
              UUID(uuidString: request.id) != nil,
              ["browser", "context", "tabs"].contains(request.operation),
              request.pid > 0, request.window_id > 0 else { return nil }
        return request
    }

    static func run(_ application: NSApplication) {
        application.setActivationPolicy(.prohibited)
        DispatchQueue.global(qos: .userInitiated).async {
            while let line = readLine() {
                guard let request = request(line) else { exit(2) }
                let result = DispatchQueue.main.sync {
                    switch request.operation {
                    case "browser": return BrowserWindow.inspect(pid: request.pid, windowID: request.window_id)
                    case "tabs": return BrowserWindow.inspectTabs(pid: request.pid, windowID: request.window_id)
                    default: return WindowContext.capture(pid: request.pid, windowID: request.window_id)
                    }
                }
                guard let data = try? JSONSerialization.data(withJSONObject: ["id": request.id, "result": result]) else { exit(2) }
                FileHandle.standardOutput.write(data + Data([10]))
            }
            DispatchQueue.main.async { application.terminate(nil) }
        }
        application.run()
    }
}
