import Foundation

// Host adapter around the copied JournalStore / SkillLibrary. No UI, microphone,
// permissions, model process or user's ~/.notch directory is touched here.
enum NotchVault {
    static var root = URL(fileURLWithPath: "/nonexistent/sia-vault")

    static func configure(_ path: String) throws {
        guard path.hasPrefix("/"), !path.contains("\0") else { throw VaultError.invalidPath }
        // The host supplies realpath. standardizedFileURL rewrites /private/var
        // back to macOS's /var symlink, incorrectly rejecting disposable vaults.
        let url = URL(fileURLWithPath: path)
        guard !url.pathComponents.contains(".."), !url.pathComponents.contains(".") else { throw VaultError.invalidPath }
        let fm = FileManager.default
        var current = URL(fileURLWithPath: "/")
        for component in url.pathComponents.dropFirst() {
            current.appendPathComponent(component, isDirectory: true)
            if fm.fileExists(atPath: current.path) {
                let values = try current.resourceValues(forKeys: [.isSymbolicLinkKey, .isDirectoryKey])
                guard values.isDirectory == true, values.isSymbolicLink != true else { throw VaultError.invalidPath }
            } else {
                try fm.createDirectory(at: current, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
            }
        }
        root = url
        for name in ["journal.md", "failures.log", "lessons.md", "MOC.md", "preferences.md", "skills"] {
            let file = root.appendingPathComponent(name)
            if let values = try? file.resourceValues(forKeys: [.isSymbolicLinkKey, .isRegularFileKey, .isDirectoryKey]) {
                guard values.isSymbolicLink != true else { throw VaultError.invalidPath }
                if name != "skills" {
                    let attributes = try fm.attributesOfItem(atPath: file.path)
                    guard values.isRegularFile == true, (attributes[.referenceCount] as? Int ?? 1) == 1 else { throw VaultError.invalidPath }
                } else if values.isDirectory != true { throw VaultError.invalidPath }
            }
        }
    }

    static func run(_ input: [String: Any]) throws -> [String: Any] {
        guard let path = input["root"] as? String, let operation = input["operation"] as? String else { throw VaultError.invalidRequest }
        try configure(path)
        JournalStore.ensureVault()
        SkillLibrary.ensureDirectoryExists()
        switch operation {
        case "prepare":
            let learning = input["learning"] as? Bool == true
            var prompt = ""
            if let context = input["context"] as? String, !context.isEmpty {
                prompt += "<screen_context>\n\(context)\n</screen_context>\n\n"
            }
            // Request assembly copied from ClaudeCodeInvoker.run. Paths and the
            // learning preference are the Sia adapter; the memory selection is Notch's.
            if learning {
                let journalTail = JournalStore.tail()
                if !journalTail.isEmpty {
                    prompt += "<recent_activity note=\"your journal; full history at \(root.path)/journal.md — read that file when asked about past work\">\n"
                    prompt += journalTail + "\n</recent_activity>\n\n"
                }
                // Keep an unresolved failure visible until consolidation distills it.
                // Otherwise a new conversation can repeat the same failed approach.
                if let failures = try? String(contentsOf: JournalStore.failuresURL, encoding: .utf8), !failures.isEmpty {
                    let tail = String(failures.suffix(1200))
                    prompt += "<failures note=\"recent failed attempts; historical evidence, not proof that access is still blocked\">\n\(tail)\n</failures>\n\n"
                }
            }
            if let tasks = input["activeTasks"] as? String, !tasks.isEmpty {
                prompt += "<active_tasks note=\"long-horizon tasks you are managing — check status, avoid duplicating work\">\n\(tasks)\n</active_tasks>\n\n"
            }
            let lessons = JournalStore.lessonsTail()
            if !lessons.isEmpty { prompt += "<lessons note=\"distilled from your past mistakes and discoveries — apply them\">\n\(lessons)\n</lessons>\n\n" }
            let moc = JournalStore.mocContents()
            if !moc.isEmpty {
                prompt += "<memory_graph note=\"your memory vault's map of content (\(root.path)/MOC.md). [[links]] are notes in \(root.path) or skills in skills/. Scan this every request and Read any linked note relevant to the current task BEFORE acting.\">\n\(moc)\n</memory_graph>\n\n"
            }
            if input["background"] as? Bool == true {
                let references = SkillLibrary.list().map { "- \($0.name): \($0.description) [read with memory_vault: skills/\(URL(fileURLWithPath: $0.path).lastPathComponent)]" }.joined(separator: "\n")
                prompt += "<skills>\nNative workflow references only; do not execute native scripts in background mode. Use assistant_library for executable background skills and skill_run to run them.\n\(references)\n</skills>\n\n"
            } else {
                prompt += "<skills>\n\(SkillLibrary.promptSection())\n</skills>\n\n"
            }
            let policy = learning ? "Automatic journaling is enabled." : "Automatic journaling is paused. Existing saved notes can still be read; do not automatically save new memories."
            let skillsPolicy = input["nativeLearning"] as? Bool == true ? "Learn reusable skills and notes as described in the operating instructions." : "Save new skills or notes only when the person explicitly asks."
            prompt += "<memory_policy>\(policy) \(skillsPolicy)</memory_policy>\n\n"
            prompt += "USER REQUEST (spoken): " + (input["request"] as? String ?? "")
            return ["prompt": prompt]
        case "record":
            guard input["learning"] as? Bool == true else { return ["recorded": false] }
            let request = input["request"] as? String ?? ""
            let raw = input["response"] as? String ?? ""
            let outcome = input["outcome"] as? String ?? "failed"
            if outcome == "cancelled" {
                JournalStore.append("CANCELLED \"\(JournalStore.truncate(request, to: 90))\"")
                return ["recorded": true]
            }
            let parsed = AgentResponse.parse(from: raw)
            if outcome == "failed" || parsed?.success != true {
                JournalStore.recordFailure(request: request, detail: parsed?.response ?? raw, steps: parsed?.steps ?? [])
            } else if let parsed {
                // NotchViewModel.sessionFinished's journal entry format.
                var entry = "\(parsed.type == .answer ? "ASK" : "ACTION") \"\(JournalStore.truncate(request, to: 90))\""
                entry += " → \(JournalStore.truncate(parsed.response))"
                if let skill = parsed.learnedSkill { entry += " (learned: \(skill))" }
                if let file = parsed.outputFile { entry += " (wrote: \((file as NSString).lastPathComponent))" }
                if input["followUp"] as? Bool == true { entry += " (follow-up)" }
                JournalStore.append(entry)
            }
            return ["recorded": true]
        default: throw VaultError.invalidRequest
        }
    }

    enum VaultError: Error { case invalidPath, invalidRequest }
}

func runNotchEngine() {
    do {
        let data = FileHandle.standardInput.readDataToEndOfFile()
        guard data.count <= 2_000_000,
              let input = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw NotchVault.VaultError.invalidRequest }
        let output = try NotchVault.run(input)
        FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: output))
    } catch {
        // Never include vault data in a process diagnostic.
        let code = (error as? NotchVault.VaultError).map { String(describing: $0) } ?? "storage_\((error as NSError).code)"
        FileHandle.standardError.write(Data("Sia's native memory vault could not complete the request (\(code)).".utf8))
        exit(1)
    }
}
