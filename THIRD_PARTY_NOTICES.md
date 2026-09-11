# Third-party notices

Sia distributes code from, or records design provenance to, the projects below. Every build generates `THIRD_PARTY_LICENSES.txt` from the exact pnpm installation, supplements npm packages that omit root terms with pinned canonical SPDX texts, and packages Electron's `ELECTRON_LICENSE.txt` and `CHROMIUM_LICENSES.html` without modification.

- Cua Driver, MIT; its native Node runtime also includes MPL-2.0 code and the upstream runtime notice.
- UniFFI JavaScript runtime (`@ubjs/node` and platform packages), MPL-2.0. Sia applies a narrow packaging patch to resolve native libraries from Electron's `app.asar.unpacked` directory; the patch source is included under `patches/`.
- OpenMausBot concepts and any provenance-marked port from audited commit `f301a20e4c455d03fb7211ce074b1a8d55a4b0c1`, MIT.
- Bricolage Grotesque typeface (The Bricolage Grotesque Project Authors, Atelier Triay), SIL Open Font License 1.1; the renderer bundles the variable latin-subset file and reproduces the OFL text in `THIRD_PARTY_LICENSES.txt`.
- Electron, React, Radix UI, Phosphor Icons, Zod, and other packages listed in the lockfile under their respective licenses.

Sia interoperates with, but does not bundle, the separately installed OpenAI Codex CLI/app-server (Apache-2.0), xAI Grok Build (Apache-2.0, including its own notices), or Google Gemini CLI (Apache-2.0). Anthropic Claude Agent SDK is proprietary software used only under Anthropic's applicable terms and is not described as open source. Those products remain under their publishers' authentication, billing, and license terms. Product names are used descriptively and do not imply endorsement.

## Notch native assistant components

Phone remote ports `Remote/RemoteControlServer.swift`'s token-addressed LAN HTTP flow,
mobile polling/composer/recents/keyboard behavior, vault wikilinks, and graph force constants.
`native/voice/PhoneRemote.swift` adapts Notch's Core Image QR generation and Bonjour discovery.
Sia substitutes its typed controller dispatch, encrypted pairing records, own library and outbox,
and actual desktop font, colors, mark and Markdown renderer. The mobile UI is a separate local
bundle; it does not expose Electron IPC. Pairing tokens are stronger, links can be revoked, and
requests are bounded, deduplicated, origin-checked and limited to the local network.

Use my Mac additionally ports `Agent/ClaudeCodeInvoker.swift`'s native AppleScript/shell/screenshot
operating instructions and progress watchdog, and `Agent/AgentResponse.swift`'s balanced-JSON parser.
`Context/ScreenContextProvider.swift` is copied into the native helper with bounded-time and
secure-field checks. Codex App Server replaces Claude Code transport; Sia retains its UI, macOS
speech provider, encrypted memory and schedule services. See `docs/architecture.md` for the native
execution boundary and the deliberate adapter differences.

Sia's optional Fn helper adapts the Fn monitor, edge-glow panel/view, microphone conversion,
and frontmost-context capture code. The Use my Mac window reader also adapts ScreenContextProvider’s bounded static-text and numeric-value capture; its interactive panel also draws on Notch's nonactivating panel
structure. The encrypted journal, idle lesson consolidation, and executable skill library adapt
JournalStore, ConsolidationScheduler, and SkillLibrary concepts.
`native-skills.ts` additionally ports SkillLibrary's filesystem registry and first-eight-line
metadata parsing, shared by the desktop and phone. Native journal summaries and prompt tails
adapt JournalStore and NotchViewModel; the native consolidation prompt ports PROMOTE/DISTILL/INDEX,
with encrypted memory storage and host-side script saving replacing the plaintext vault worker.
The Cmd+E launcher ports
HotkeyManager’s registration lifecycle to Electron, and reviewable improvements adapt the
ConsolidationScheduler PROMOTE/DISTILL instructions through Sia's existing runtime and authorization system. These adaptations derive from [romirthedev/notch](https://github.com/romirthedev/notch) at commit
`6c74c30c31a2ce31a852209eba86f28c8371409e`, at the repository owner's request. The source repository at
that revision does not include a license file. Attribution and adaptation details are preserved in
`apps/desktop/native/voice/README.md`; no replacement license is asserted for the original sources.
