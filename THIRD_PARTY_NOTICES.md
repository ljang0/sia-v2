# Third-party notices

Sia distributes code from, or records design provenance to, the projects below. Every build generates `THIRD_PARTY_LICENSES.txt` from the exact pnpm installation, supplements npm packages that omit root terms with pinned canonical SPDX texts, and packages Electron's `ELECTRON_LICENSE.txt` and `CHROMIUM_LICENSES.html` without modification.

- Cua Driver, MIT; its native Node runtime also includes MPL-2.0 code and the upstream runtime notice.
- UniFFI JavaScript runtime (`@ubjs/node` and platform packages), MPL-2.0. Sia applies a narrow packaging patch to resolve native libraries from Electron's `app.asar.unpacked` directory; the patch source is included under `patches/`.
- OpenMausBot concepts and any provenance-marked port from audited commit `f301a20e4c455d03fb7211ce074b1a8d55a4b0c1`, MIT.
- Bricolage Grotesque typeface (The Bricolage Grotesque Project Authors, Atelier Triay), SIL Open Font License 1.1; the renderer bundles the variable latin-subset file and reproduces the OFL text in `THIRD_PARTY_LICENSES.txt`.
- Electron, React, Radix UI, Phosphor Icons, Zod, and other packages listed in the lockfile under their respective licenses.

Sia interoperates with, but does not bundle, the separately installed OpenAI Codex CLI/app-server (Apache-2.0), xAI Grok Build (Apache-2.0, including its own notices), or Google Gemini CLI (Apache-2.0). Anthropic Claude Agent SDK is proprietary software used only under Anthropic's applicable terms and is not described as open source. Those products remain under their publishers' authentication, billing, and license terms. Product names are used descriptively and do not imply endorsement.
