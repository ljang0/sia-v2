// Source: ../../upstream/SkillLibrary.swift; see ../../README.md for adapter changes.
import Foundation

/// Self-extending skills: executable shell scripts in ~/.notch/skills/,
/// each with a metadata header. The agent runs matching skills as a fast
/// path, and — when it figures out something new and reusable — writes,
/// tests, and saves a new skill itself. The registry IS the filesystem;
/// the agent already has Write and Bash.
///
/// Skill file format (~/.notch/skills/<kebab-name>.sh):
///   #!/bin/bash
///   # skill: toggle-dark-mode
///   # description: Toggle macOS dark mode on/off
///   osascript -e '...'
enum SkillLibrary {

    struct Skill {
        let name: String
        let description: String
        let path: String
    }

    static var directory: URL {
        NotchVault.root.appendingPathComponent("skills", isDirectory: true)
    }

    static func ensureDirectoryExists() {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    static func list() -> [Skill] {
        guard let files = try? FileManager.default.contentsOfDirectory(
            at: directory, includingPropertiesForKeys: nil
        ) else { return [] }

        return files
            .filter { $0.lastPathComponent.range(of: "^[a-z0-9][a-z0-9-]{0,79}\\.sh$", options: .regularExpression) != nil }
            // Sia's file boundary: discovery cannot follow links or read devices.
            .filter { url in
                guard let info = try? url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey]) else { return false }
                let links = (try? FileManager.default.attributesOfItem(atPath: url.path)[.referenceCount] as? Int) ?? 1
                return info.isRegularFile == true && info.isSymbolicLink != true && links == 1 && (info.fileSize ?? Int.max) <= 16000
            }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
            .prefix(100)
            .compactMap { url in
                guard let head = try? String(contentsOf: url, encoding: .utf8)
                    .split(separator: "\n").prefix(8).joined(separator: "\n") else { return nil }
                let name = match(in: head, prefix: "# skill:")
                    ?? url.deletingPathExtension().lastPathComponent
                let description = match(in: head, prefix: "# description:") ?? ""
                return Skill(name: name, description: description, path: url.path)
            }
    }

    /// The prompt section describing available skills to the agent.
    static func promptSection() -> String {
        let skills = list()
        guard !skills.isEmpty else {
            return "You currently have NO saved skills."
        }
        let rows = skills
            .map { "- \($0.name): \($0.description) [run: bash \"\($0.path)\"]" }
            .joined(separator: "\n")
        return "Your saved skills (prefer these as a fast path when one matches):\n" + rows
    }

    private static func match(in text: String, prefix: String) -> String? {
        for line in text.split(separator: "\n") {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix(prefix) {
                let value = trimmed.dropFirst(prefix.count).trimmingCharacters(in: .whitespaces)
                return value.isEmpty ? nil : value
            }
        }
        return nil
    }
}
