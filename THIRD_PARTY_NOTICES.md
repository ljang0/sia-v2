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
speech provider, encrypted conversations/manual preferences and schedule services. See `docs/architecture.md` for the native
execution boundary and the deliberate adapter differences.

Sia's optional Fn helper adapts the Fn monitor, edge-glow panel/view, microphone conversion,
and frontmost-context capture code. The Use my Mac window reader also adapts ScreenContextProvider’s bounded static-text and numeric-value capture; its interactive panel also draws on Notch's nonactivating panel
structure. The foreground engine now executes copied JournalStore, SkillLibrary and AgentResponse
Swift source, using an agent-scoped local file vault. Original operating and consolidation prompt
literals are generated from the pinned source; Codex replaces Claude transport. `native-skills.ts`
shares the first-eight-nonempty-line registry with desktop and phone. Notch’s stable local signing
certificate setup is adapted for Sia's Electron runtime and voice helper, with codesign-only key
access and a persistent device certificate pin. See `apps/desktop/native/notch/README.md` for the
file-by-file source map, checksums, and remaining differences.
The Cmd+E launcher ports
HotkeyManager’s registration lifecycle to Electron, and reviewable improvements adapt the
ConsolidationScheduler PROMOTE/DISTILL instructions through Sia's existing runtime and authorization system. These adaptations derive from [romirthedev/notch](https://github.com/romirthedev/notch) at commit
`6c74c30c31a2ce31a852209eba86f28c8371409e`, at the repository owner's request. The source repository at
that revision does not include a license file. Attribution and adaptation details are preserved in
`apps/desktop/native/voice/README.md`; no replacement license is asserted for the original sources.

## React Bits Dither

The desktop, launcher, and phone aurora use the
[Dither](https://reactbits.dev/backgrounds/dither) background from
[DavidHDev/react-bits](https://github.com/DavidHDev/react-bits) (the JS + CSS variant), kept in
`apps/desktop/src/renderer/components/effects/dither-preview/` with its license. Sia ships it as
part of the application, renders it with three.js, @react-three/fiber, and postprocessing, and
adds its own colors, 30 fps pacing, pausing, and a CSS fallback. It is not offered as a
standalone component.

The original license follows verbatim:

MIT + Commons Clause License Condition v1.0

Copyright (c) 2026 David Haz

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, and distribute the Software **as part of an application, website, or product**, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

## Commons Clause Restriction

You may use this Software, including for any commercial purpose, **so long as you do not sell, sublicense, or redistribute the components themselves-whether alone, in a bundle, or as a ported version.**

## No Warranty

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Joly UI Liquid Metal Button and Paper Shaders

The phone's primary action buttons adapt the layered reflective rim, shader settings, and press
ripple from [Joly UI Liquid Metal Button](https://www.jolyui.dev/docs/components/buttons/liquid-metal-button),
`docs/registry/default/ui/liquid-metal-button.tsx` at `Johuniq/jolyui` commit
`bdbddce394333afe570af9cb35af42eb643d104c`. Sia adds native button semantics, its own colors and icons,
touch/keyboard feedback, disabled and reduced-motion handling, bounded rendering, and resource cleanup.

Joly UI's license follows:

MIT License

Copyright (c) 2025 Johuniq

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Paper Shaders `@paper-design/shaders` 0.0.81 supplies the original liquid metal shader and mount.
Its Apache License 2.0 is reproduced below. Upstream NOTICE:

Paper Shaders
Copyright 2026 Paper

Powered by Paper Shaders:
https://shaders.paper.design

                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1.  Definitions.

    "License" shall mean the terms and conditions for use, reproduction,
    and distribution as defined by Sections 1 through 9 of this document.

    "Licensor" shall mean the copyright owner or entity authorized by
    the copyright owner that is granting the License.

    "Legal Entity" shall mean the union of the acting entity and all
    other entities that control, are controlled by, or are under common
    control with that entity. For the purposes of this definition,
    "control" means (i) the power, direct or indirect, to cause the
    direction or management of such entity, whether by contract or
    otherwise, or (ii) ownership of fifty percent (50%) or more of the
    outstanding shares, or (iii) beneficial ownership of such entity.

    "You" (or "Your") shall mean an individual or Legal Entity
    exercising permissions granted by this License.

    "Source" form shall mean the preferred form for making modifications,
    including but not limited to software source code, documentation
    source, and configuration files.

    "Object" form shall mean any form resulting from mechanical
    transformation or translation of a Source form, including but
    not limited to compiled object code, generated documentation,
    and conversions to other media types.

    "Work" shall mean the work of authorship, whether in Source or
    Object form, made available under the License, as indicated by a
    copyright notice that is included in or attached to the work
    (an example is provided in the Appendix below).

    "Derivative Works" shall mean any work, whether in Source or Object
    form, that is based on (or derived from) the Work and for which the
    editorial revisions, annotations, elaborations, or other modifications
    represent, as a whole, an original work of authorship. For the purposes
    of this License, Derivative Works shall not include works that remain
    separable from, or merely link (or bind by name) to the interfaces of,
    the Work and Derivative Works thereof.

    "Contribution" shall mean any work of authorship, including
    the original version of the Work and any modifications or additions
    to that Work or Derivative Works thereof, that is intentionally
    submitted to Licensor for inclusion in the Work by the copyright owner
    or by an individual or Legal Entity authorized to submit on behalf of
    the copyright owner. For the purposes of this definition, "submitted"
    means any form of electronic, verbal, or written communication sent
    to the Licensor or its representatives, including but not limited to
    communication on electronic mailing lists, source code control systems,
    and issue tracking systems that are managed by, or on behalf of, the
    Licensor for the purpose of discussing and improving the Work, but
    excluding communication that is conspicuously marked or otherwise
    designated in writing by the copyright owner as "Not a Contribution."

    "Contributor" shall mean Licensor and any individual or Legal Entity
    on behalf of whom a Contribution has been received by Licensor and
    subsequently incorporated within the Work.

2.  Grant of Copyright License. Subject to the terms and conditions of
    this License, each Contributor hereby grants to You a perpetual,
    worldwide, non-exclusive, no-charge, royalty-free, irrevocable
    copyright license to reproduce, prepare Derivative Works of,
    publicly display, publicly perform, sublicense, and distribute the
    Work and such Derivative Works in Source or Object form.

3.  Grant of Patent License. Subject to the terms and conditions of
    this License, each Contributor hereby grants to You a perpetual,
    worldwide, non-exclusive, no-charge, royalty-free, irrevocable
    (except as stated in this section) patent license to make, have made,
    use, offer to sell, sell, import, and otherwise transfer the Work,
    where such license applies only to those patent claims licensable
    by such Contributor that are necessarily infringed by their
    Contribution(s) alone or by combination of their Contribution(s)
    with the Work to which such Contribution(s) was submitted. If You
    institute patent litigation against any entity (including a
    cross-claim or counterclaim in a lawsuit) alleging that the Work
    or a Contribution incorporated within the Work constitutes direct
    or contributory patent infringement, then any patent licenses
    granted to You under this License for that Work shall terminate
    as of the date such litigation is filed.

4.  Redistribution. You may reproduce and distribute copies of the
    Work or Derivative Works thereof in any medium, with or without
    modifications, and in Source or Object form, provided that You
    meet the following conditions:

    (a) You must give any other recipients of the Work or
    Derivative Works a copy of this License; and

    (b) You must cause any modified files to carry prominent notices
    stating that You changed the files; and

    (c) You must retain, in the Source form of any Derivative Works
    that You distribute, all copyright, patent, trademark, and
    attribution notices from the Source form of the Work,
    excluding those notices that do not pertain to any part of
    the Derivative Works; and

    (d) If the Work includes a "NOTICE" text file as part of its
    distribution, then any Derivative Works that You distribute must
    include a readable copy of the attribution notices contained
    within such NOTICE file, excluding those notices that do not
    pertain to any part of the Derivative Works, in at least one
    of the following places: within a NOTICE text file distributed
    as part of the Derivative Works; within the Source form or
    documentation, if provided along with the Derivative Works; or,
    within a display generated by the Derivative Works, if and
    wherever such third-party notices normally appear. The contents
    of the NOTICE file are for informational purposes only and
    do not modify the License. You may add Your own attribution
    notices within Derivative Works that You distribute, alongside
    or as an addendum to the NOTICE text from the Work, provided
    that such additional attribution notices cannot be construed
    as modifying the License.

    You may add Your own copyright statement to Your modifications and
    may provide additional or different license terms and conditions
    for use, reproduction, or distribution of Your modifications, or
    for any such Derivative Works as a whole, provided Your use,
    reproduction, and distribution of the Work otherwise complies with
    the conditions stated in this License.

5.  Submission of Contributions. Unless You explicitly state otherwise,
    any Contribution intentionally submitted for inclusion in the Work
    by You to the Licensor shall be under the terms and conditions of
    this License, without any additional terms or conditions.
    Notwithstanding the above, nothing herein shall supersede or modify
    the terms of any separate license agreement you may have executed
    with Licensor regarding such Contributions.

6.  Trademarks. This License does not grant permission to use the trade
    names, trademarks, service marks, or product names of the Licensor,
    except as required for reasonable and customary use in describing the
    origin of the Work and reproducing the content of the NOTICE file.

7.  Disclaimer of Warranty. Unless required by applicable law or
    agreed to in writing, Licensor provides the Work (and each
    Contributor provides its Contributions) on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
    implied, including, without limitation, any warranties or conditions
    of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
    PARTICULAR PURPOSE. You are solely responsible for determining the
    appropriateness of using or redistributing the Work and assume any
    risks associated with Your exercise of permissions under this License.

8.  Limitation of Liability. In no event and under no legal theory,
    whether in tort (including negligence), contract, or otherwise,
    unless required by applicable law (such as deliberate and grossly
    negligent acts) or agreed to in writing, shall any Contributor be
    liable to You for damages, including any direct, indirect, special,
    incidental, or consequential damages of any character arising as a
    result of this License or out of the use or inability to use the
    Work (including but not limited to damages for loss of goodwill,
    work stoppage, computer failure or malfunction, or any and all
    other commercial damages or losses), even if such Contributor
    has been advised of the possibility of such damages.

9.  Accepting Warranty or Additional Liability. While redistributing
    the Work or Derivative Works thereof, You may choose to offer,
    and charge a fee for, acceptance of support, warranty, indemnity,
    or other liability obligations and/or rights consistent with this
    License. However, in accepting such obligations, You may act only
    on Your own behalf and on Your sole responsibility, not on behalf
    of any other Contributor, and only if You agree to indemnify,
    defend, and hold each Contributor harmless for any liability
    incurred by, or claims asserted against, such Contributor by reason
    of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS

APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

Copyright [yyyy] [name of copyright owner]

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
