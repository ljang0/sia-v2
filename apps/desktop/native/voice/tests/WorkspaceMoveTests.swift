import Foundation

func testWorkspaceMove() throws {
    
    let manager = FileManager.default
    let root = manager.temporaryDirectory.appendingPathComponent("sia-move-test-" + UUID().uuidString)
    try manager.createDirectory(at: root, withIntermediateDirectories: false)
    defer { try? manager.removeItem(at: root) }
    let original = Data("Actual bytes — résumé\n".utf8)
    let digest = WorkspaceMove.hash(original)
    func write(_ name: String, _ data: Data = original) throws {
        try data.write(to: root.appendingPathComponent(name))
    }
    func rejects(_ body: () throws -> Void) {
        var rejected = false
        do { try body() } catch { rejected = true }
        precondition(rejected)
    }
    try write("source.md")
    let moved = try WorkspaceMove.move(root: root.path, source: "source.md", destination: "Review packet/brief.md", expected: digest)
    precondition(moved["verified"] as? Bool == true)
    precondition(!manager.fileExists(atPath: root.appendingPathComponent("source.md").path))
    precondition(try! Data(contentsOf: root.appendingPathComponent("Review packet/brief.md")) == original)
    try write("second.md", Data("newer content".utf8))
    rejects { _ = try WorkspaceMove.move(root: root.path, source: "second.md", destination: "other.md", expected: digest) }
    rejects { _ = try WorkspaceMove.move(root: root.path, source: "second.md", destination: "Review packet/brief.md", expected: WorkspaceMove.hash(Data("newer content".utf8))) }
    precondition(try! Data(contentsOf: root.appendingPathComponent("Review packet/brief.md")) == original)
    try manager.createSymbolicLink(atPath: root.appendingPathComponent("outside").path, withDestinationPath: "/tmp")
    rejects { _ = try WorkspaceMove.move(root: root.path, source: "Review packet/brief.md", destination: "outside/escaped.md", expected: digest) }
    try manager.createSymbolicLink(atPath: root.appendingPathComponent("linked.md").path, withDestinationPath: root.appendingPathComponent("Review packet/brief.md").path)
    rejects { _ = try WorkspaceMove.move(root: root.path, source: "linked.md", destination: "moved-link.md", expected: digest) }
    for invalid in ["../escaped.md", "/tmp/escaped.md", "nested/../escaped.md", ".hidden/report.md", "keys/report.md", "report.exe"] {
        rejects { _ = try WorkspaceMove.move(root: root.path, source: "Review packet/brief.md", destination: invalid, expected: digest) }
    }
    try write("race.md")
    let lock = NSLock()
    var successes = 0
    DispatchQueue.concurrentPerform(iterations: 2) { index in
        if let result = try? WorkspaceMove.move(root: root.path, source: "race.md", destination: "race-\(index).md", expected: digest), result["verified"] as? Bool == true {
            lock.lock(); successes += 1; lock.unlock()
        }
    }
    precondition(successes == 1)
    let destinations = (0..<2).filter { manager.fileExists(atPath: root.appendingPathComponent("race-\($0).md").path) }
    precondition(destinations.count == 1)
    try write("left.md", Data("left".utf8))
    try write("right.md", Data("right".utf8))
    successes = 0
    DispatchQueue.concurrentPerform(iterations: 2) { index in
        let label = index == 0 ? "left" : "right"
        if let result = try? WorkspaceMove.move(root: root.path, source: "\(label).md", destination: "shared.md", expected: WorkspaceMove.hash(Data(label.utf8))), result["verified"] as? Bool == true {
            lock.lock(); successes += 1; lock.unlock()
        }
    }
    precondition(successes == 1)
    let winner = try String(contentsOf: root.appendingPathComponent("shared.md"), encoding: .utf8)
    precondition(winner == "left" || winner == "right")
    let loser = winner == "left" ? "right" : "left"
    precondition(try! String(contentsOf: root.appendingPathComponent("\(loser).md"), encoding: .utf8) == loser)
    print("Native exclusive move: bytes, revision, collision, symlink, path boundary and concurrent-source checks passed.")
}
