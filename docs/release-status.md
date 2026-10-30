# Release status

Updated October 29, 2026. The current signed controlled product-pilot candidate is
`0.1.0-alpha.33` from source `03f7e5e95e24ea0d52ff8c4e3b95dbacaf28cf55` (PR #26).
The full local pilot gate and signed packaging passed; live acceptance remains open;
**do not describe it as ready or send invitations until the acceptance record is complete**.
Alpha.30 and alpha.31 passed signing/notarization and upgrades retained the demo profile. Live file tasks
found missing result controls on plain-text and streamed provider replies; alpha.32 addresses both paths.
Native iPhone 0.1.0 (31) is **Ready to Test** in the internal **Pilot QA** TestFlight group
(zero testers). It fixes native result downloads and pairing-save errors. Eight native tests,
signed archive, upload and Apple processing passed. External beta review awaits contact details. The last published
pilot remains alpha.24.

PR #24 merged into `main` on October 29 at `23e0650`. Its head `f443b53` passed
the full pilot gate and unsigned universal packaging in
[GitHub CI](https://github.com/ljang0/sia-v2/actions/runs/40358976631); signing was skipped.
The heads of PRs #21–23 are already ancestors of `main`, despite their open draft status.
These source changes do not update an installed app. The October 29 computer-use smoke
check of the installed, signature-verified alpha.32 passed chat, CSV creation/readback/preview,
cancellation and native Calculator input. Background navigation to example.com remained
blocked by its protected-window observation. That result is not a live check of PR #24's
newer Chromium adapter. A current-source signed build and fresh browser acceptance remain
required, alongside the physical-phone and clean-install gates below.

PR #25 merged at `80b4889` after its exact head passed the full pilot and unsigned
universal package checks. The development app then completed the disposable browser click
and fresh IANA destination read without replaying input. The later main-branch CI run exposed
a phone visual-test race: it measured the lazy WebGL canvas before mount. The follow-up waits
for the visible canvas before measuring geometry.

The alpha.33 source candidate adds explicit background browser preparation without navigation,
Chromium tab-only discovery, and optional read-only safe link destinations. The driver exposes
link destinations through its bound DOM snapshot rather than its semantic snapshot. Sia returns
only unambiguous absolute HTTP(S) destinations, filters authentication and credential-bearing
URLs, refreshes semantic state afterward, and withholds the result if page identity changes.
The returned list is partial and is not a link-label mapping. No raw DOM access is exposed.

Live development-app testing recovered existing browser access after restart and read an inactive
public tab without selecting it. A subsequent cold preparation was refused with
`background_unavailable`; recovery remains conditional on the driver's available background route.
Background new-tab creation remains unavailable in both inspected driver versions, 0.37.0 and
0.38.0. The dependency stays on 0.37.0; unrelated tabs must be preserved. This is not signed-release
acceptance. A fresh development-app check also read the inactive page's title and the observed
`https://iana.org/help/example-domains` destination while IANA stayed selected.

Alpha.33 passed `pnpm package:mac`: universal signing, app/DMG notarization and stapling,
strict signatures, Gatekeeper and packaged native/runtime verification. The full local pilot
gate passed 1,748 desktop unit, 46 Electron, 31 renderer and 72 Chromium/WebKit phone checks.
CI subsequently caught an unrelated permissions-test race: the test clicked optional voice
before the preceding guided request released its disabled button. The test now waits for that
button to enable; all 44 focused settings/permissions tests passed. This test-only follow-up
does not change the signed application source.

The signed alpha.32-to-alpha.33 upgrade retained the isolated QA profile without a new Keychain
prompt. A fresh synthetic CSV task created/read back apples=3 and oranges=4, reported total 7,
and displayed the exact saved content in its result preview. Signed browser discovery then
returned `browser_consent_required`; preparation returned `needs_foreground` /
`background_unavailable`. Sia stopped without navigation or foreground escalation. Signed
background-browser acceptance remains incomplete despite the successful development-app check.
Physical iPhone checks were blocked by Mirroring's "iPhone in Use" timeout. Clean macOS-account
signup/permissions and physical pairing, Save, reconnect and microphone checks remain open.
Artifact hashes are recorded in [public distribution candidate](./public-release.md).

## Pilot scope

The owner selected a combined Mac pilot and native iPhone TestFlight release. The scope is a
small named cohort with research sharing off, Codex as the initial provider, and the encrypted
phone relay. PR #23 integrates the native iPhone shell with the current Mac candidate. No invitations or public download are authorized
by this status file. Keep the recipient list and private distribution links outside Git.

## Current engineering work

- Patched Vite to 7.3.7; the high-severity dependency gate now passes. One moderate advisory
  remains in the optional development packaging logger `sprintf-js` (the registry still offers
  only 1.1.3); it is not shipped as an app runtime dependency.
- Task ratings now save their record and report totals atomically, including delivery retry and
  competing edits. A private account reference supports deleting notes and report contributions.
- Local result links in final replies now create validated result controls, including persistent
  preview/open/reveal and phone download grants. Out-of-scope paths remain refused.
- Source, deterministic desktop/phone, signing, cloud and exact-artifact live checks are being
  recorded in the private operator evidence directory. Incomplete checks remain incomplete.

## Acceptance before inviting testers

1. Source/CI and signed/notarized alpha.32 packaging passed; retain the prior signed artifacts.
   The full local gate passed (1,318 desktop unit, 45 Electron, 27 renderer, 72 phone checks).
   See the exact source and checksums in [public release](./public-release.md).
2. Cloud ratings deployed successfully: both code hashes match, anonymous routes return 401,
   and all 18 alarms are OK. An authenticated app rating on a synthetic task reached the report.
3. Complete signed-app file work, native computer use, phone relay, voice and texting.
   Alpha.32 result preview and Finder reveal passed. Native relay delivered a synthetic task;
   a fresh post-restart file task and preview passed. Native Save UI and current voice/texting
   remain open. The signed simulator
   retained its pairing after relaunch. Revocation removed only the temporary test phone and
   returned the simulator to pairing, including after relaunch. The Finder rehearsal read the
   expected filenames but could not complete Go to Folder; current-artifact computer actions
   remain unverified.
4. Native iPhone tests, signed archive and TestFlight processing passed. Complete physical
   iPhone acceptance (camera pairing, file Save, Wi-Fi/cellular reconnect and microphone), then
   supply beta-review contacts and complete Apple review before external testing.
5. Complete clean macOS-account signup/permissions and previous-release upgrade acceptance.
6. Confirm a named support/incident owner, recipient list and redistribution permission for
   third-party native sources whose license is not recorded in this repository.

Research enrollment, public connector distribution, preview-harness admission,
APNs notifications, arbitrary user-added MCP connectors and always-on cloud execution are
separate gates; they are not implied by this controlled product pilot.

See [manual acceptance](./manual-acceptance.md), [pilot runbook](./cmu-pilot-runbook.md),
[release notes](./release-notes.md), and [public release](./public-release.md).
