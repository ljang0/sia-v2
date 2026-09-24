# Notch foreground engine in Sia

Source: [romirthedev/notch](https://github.com/romirthedev/notch), revision
`6c74c30c31a2ce31a852209eba86f28c8371409e`, reused at the repository owner's request.
The source revision has no license file; no replacement license is asserted here.
`upstream/` preserves original files byte for byte and `upstream.json` records their SHA-256s.
It is a source reference, not a second runtime. Do not copy the user's `~/.notch` directory.

| Notch source                                             | Executing Sia implementation                                          | Necessary adapter changes                                                                                                                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Core/JournalStore.swift`                                | `engine/Core/JournalStore.swift`                                      | Agent-scoped root; Sia branding. Original append format, journal tail, bullet lessons and complete MOC selection.                                                                  |
| `Agent/SkillLibrary.swift`                               | `engine/Agent/SkillLibrary.swift`                                     | Agent-scoped root; bounded ordinary kebab-name scripts, no links. Original sorted registry and first eight nonempty-line metadata parser.                                          |
| `Agent/AgentResponse.swift`                              | `engine/Agent/AgentResponse.swift`                                    | Original parser runs on the raw model result before journal recording. Host cancellation/failure wins over model success.                                                          |
| `Agent/AgentSession.swift` and `ClaudeCodeInvoker.swift` | `engine/Host/NotchVault.swift`, `src/main/notch/prompts.generated.ts` | Same request-section ordering; Codex tool names, screenshot transform and Sia output presentation.                                                                                 |
| `Ambient/ConsolidationScheduler.swift`                   | Generated PROMOTE/DISTILL/INDEX prompt, controller scheduler          | Six-hour/new-experience cadence, startup delay and explicit trigger. Codex executes the source recipe through revision-checked vault tools, without shell/GUI/network execution.   |
| `scripts/setup-signing.sh`                               | `scripts/setup-signing.sh`, `scripts/dev-signing.mjs`                 | Same reusable certificate approach; Sia label, codesign-only key access, device-wide certificate pin and signed Electron development app.                                          |
| User-created `~/.notch/skills/canvas-api.sh`             | `skills/canvas-api.sh`                                                | Reviewed optional CMU skill: signed-in Safari session, fixed read-only course/teacher and assignment routes, validated IDs and pages, no arbitrary endpoint or output-file writes. |

`node apps/desktop/scripts/port-notch-prompts.mjs` regenerates prompts from the preserved
Swift literals; `--check` detects drift. Source extraction explicitly omits detached Claude
coding workers and app self-modification/relaunch. The brief Sia/Codex adapter is separately
visible in `src/main/notch/foreground.ts`. The native helper's `--notch-engine` mode runs before
AppKit initialization: it does not prompt for permissions or capture/control the desktop.
The Sia presentation adapter reports meaningful progress milestones and returns verified report
files to the conversation/phone rather than repeatedly activating an external editor. Foreground
uses the pinned Notch operating prompt with a small transport/presentation adapter; the separate
window-control investigation recipe is not appended. Account work uses live evidence and the
requested sources; private account data and observed email addresses are not sent to public search. The optional Canvas
skill reads only from an already signed-in Safari Canvas tab and is skipped for UI-only requests.
It is not bundled into every agent's vault or available to background window control.

## Memory and skills

Both Mac modes share memory at `<agent workspace>/.sia-mac/<agent id>/`: `journal.md`,
`failures.log`, `lessons.md`, `MOC.md`, linked Markdown notes and `skills/*.sh`. These are normal
local files, with private directory/file permissions; they are not encrypted by Sia. Existing
conversations and manually saved preferences remain in encrypted SQLite. Enabled preferences
are projected into read-only `preferences.md` and up to 16,000 characters are included in each
native request, including while automatic learning is paused; old Sia task summaries/scripts migrate once.
Deleting a preference updates the projection. Previous model history and learned notes can still
contain the fact, so deleting a saved preference is not a comprehensive erasure operation.

Swift reads the last 1,200 journal characters, the last 1,000 bullet-lesson characters and the
complete MOC, then supplies the script registry. Sia also injects up to 1,200 characters of
unresolved failures. Background tasks read the same topic files through `memory_vault`; native
skills are described as references without runnable shell commands. Saving notes requires active
learning; executable background skills stay in the scoped gateway registry. Automatic reviews
in either mode use only `memory_vault`, recheck mode/agent/workspace/learning authorization,
and reject stale revisions, traversal, links and credentials. Writes save scripts without
executing them. Long journals are paged, with explicit append for consolidation records.
Settings and the phone vault read the same files. New Mac agents in either mode enable native
learning; existing choices are preserved. Turning learning off stops new recording and reviews.

## Remaining differences

Codex App Server owns sessions, streaming, cancellation and tool transport instead of Claude
Code. Sia retains its UI, action policy, signed-in release checks and a serialized GUI lease.
Fn uses Sia's configured ElevenLabs transcription/voice or on-device speech recognition,
not Notch's Groq Whisper service. `ReplySpeaker.swift` adapts the AVAudioPlayer lifecycle from
Notch's `Voice/SpeechSpeaker.swift`; Sia supplies audio over a bounded private pipe rather than
letting the helper read credentials or make network requests. Screenshots use
Sia's normalized capture/coordinate adapter, with Notch's perceive/act/verify cycle. Background
CUA and Connected apps retain their distinct capability-limited engines. This transplant does
not make model decisions, browser state, permissions or task reliability identical to Notch.

## Verification

`pnpm --filter @sia/desktop test` builds the actual Swift helper, checks source/prompt hashes,
and tests the vault, runtime review isolation and controller integration. The opt-in
`native-learning.smoke.test.ts` exercises real Codex commands, durable memory, skill creation,
restart/reuse, bidirectional memory recall across control modes, interrupted-task continuation
without duplicate writes, and file-only consolidation using disposable fixtures. It does not validate GUI
reliability. Do not run broad desktop probes automatically on launch.
