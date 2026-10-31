import Foundation
import CryptoKit
import Darwin

enum WorkspaceMove {
    static let limit = 256 * 1024
    struct Failure: Error { let message: String }
    static func fail(_ message: String) throws -> Never { throw Failure(message: message) }

    static func components(_ path: String) throws -> [String] {
        let parts = path.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
        guard !parts.isEmpty, parts.count <= 10, path.utf8.count <= 1800 else {
            try fail("Use a bounded relative workspace path.")
        }
        for part in parts {
            guard !part.isEmpty, part.utf8.count <= 180, !part.hasPrefix("."),
                  !part.contains("\\"), !part.contains(":"),
                  !part.unicodeScalars.contains(where: { $0.value < 32 || $0.value == 127 }),
                  part.range(of: "credential|token|secret|password|keychain|(?:^|[._ -])(?:auth|keys?)(?:[._ -]|$)", options: .regularExpression.union(.caseInsensitive)) == nil
            else { try fail("This is not an ordinary workspace path.") }
        }
        guard ["txt", "md", "csv", "tsv", "json", "ics"].contains(URL(fileURLWithPath: parts.last!).pathExtension.lowercased())
        else { try fail("Only ordinary text/data files can be moved.") }
        for (index, part) in parts.enumerated() {
            if index < parts.count - 1 && part.range(of: "\\.(?:app|bundle|framework|plugin|scptd|workflow)$", options: .regularExpression.union(.caseInsensitive)) != nil {
                try fail("Application bundles are not ordinary task folders.")
            }
            if part.range(of: "(?:^|[._ -])session(?:[._ -]|$)", options: .regularExpression.union(.caseInsensitive)) != nil &&
                !(index == parts.count - 1 && part.lowercased().hasSuffix(".ics")) {
                try fail("Session-related paths are not ordinary task documents.")
            }
        }
        return parts
    }

    static func parent(_ root: Int32, _ parts: [String], create: Bool) throws -> Int32 {
        var current = dup(root)
        guard current >= 0 else { try fail("Cannot open workspace directory.") }
        do {
            for part in parts.dropLast() {
                var next = openat(current, part, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
                if next < 0 && errno == ENOENT && create {
                    guard mkdirat(current, part, 0o700) == 0 || errno == EEXIST else {
                        try fail("Cannot create destination folder.")
                    }
                    next = openat(current, part, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
                }
                guard next >= 0 else { try fail("Folder is missing or is a link; no move was made.") }
                close(current)
                current = next
            }
            return current
        } catch {
            close(current)
            throw error
        }
    }

    static func read(_ fd: Int32) throws -> (Data, stat) {
        var before = stat(), after = stat()
        guard fstat(fd, &before) == 0,
              before.st_mode & S_IFMT == S_IFREG, before.st_nlink == 1,
              before.st_size >= 0, before.st_size <= limit else {
            try fail("Only single-link regular text files up to 256 KB can be moved.")
        }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: false)
        try handle.seek(toOffset: 0)
        let data = try handle.read(upToCount: limit + 1) ?? Data()
        guard fstat(fd, &after) == 0, data.count == after.st_size,
              before.st_size == after.st_size,
              before.st_mtimespec.tv_sec == after.st_mtimespec.tv_sec,
              before.st_mtimespec.tv_nsec == after.st_mtimespec.tv_nsec,
              before.st_ctimespec.tv_sec == after.st_ctimespec.tv_sec,
              before.st_ctimespec.tv_nsec == after.st_ctimespec.tv_nsec,
              !data.contains(0), String(data: data, encoding: .utf8) != nil else {
            try fail("File changed while reading or is not UTF-8 text.")
        }
        return (data, after)
    }

    static func hash(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    static func move(root: String, source: String, destination: String, expected: String) throws -> [String: Any] {
        let from = try components(source), to = try components(destination)
        guard root.hasPrefix("/"), root.utf8.count <= 4096, !root.contains("\0"),
              expected.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else {
            try fail("Invalid workspace or revision.")
        }
        let rootFD = open(root, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
        guard rootFD >= 0 else { try fail("Workspace is unavailable.") }
        defer { close(rootFD) }
        let sourceFD = try parent(rootFD, from, create: false)
        defer { close(sourceFD) }
        let fileFD = openat(sourceFD, from.last!, O_RDONLY | O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC)
        guard fileFD >= 0 else { try fail("Source file is missing or a link.") }
        defer { close(fileFD) }
        let (content, initial) = try read(fileFD)
        guard hash(content) == expected else { try fail("File revision changed; read it again before moving.") }
        let destinationFD = try parent(rootFD, to, create: true)
        defer { close(destinationFD) }
        var named = stat()
        guard fstatat(sourceFD, from.last!, &named, AT_SYMLINK_NOFOLLOW) == 0,
              named.st_ino == initial.st_ino, named.st_dev == initial.st_dev,
              named.st_nlink == 1, named.st_mode & S_IFMT == S_IFREG else {
            try fail("Source target changed; inspect it before moving.")
        }
        // Atomic exclusive rename, relative to opened non-symlink directories. Never
        // emulate no-clobber with an existence check followed by an overwriting rename.
        guard renameatx_np(sourceFD, from.last!, destinationFD, to.last!, UInt32(RENAME_EXCL)) == 0 else {
            try fail(errno == EEXIST ? "Destination already exists; nothing was overwritten." : "Move could not complete; inspect source and destination.")
        }
        var result: [String: Any] = ["moved": true, "verified": false, "source": source, "destination": destination]
        do {
            let (readback, final) = try read(fileFD)
            var target = stat(), old = stat()
            let digest = hash(readback)
            result["sha256"] = digest
            result["bytes"] = readback.count
            result["verified"] = digest == expected &&
                fstatat(destinationFD, to.last!, &target, AT_SYMLINK_NOFOLLOW) == 0 &&
                target.st_ino == final.st_ino && target.st_dev == final.st_dev &&
                fstatat(sourceFD, from.last!, &old, AT_SYMLINK_NOFOLLOW) == -1 && errno == ENOENT
        } catch {
            // Rename already happened. A readback failure is uncertainty, never a
            // pre-input refusal or permission to replay the move.
        }
        return result
    }
}
