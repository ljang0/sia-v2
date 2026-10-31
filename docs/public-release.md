# Distribution acceptance record

Updated October 31, 2026. **Distribution is not ready.** Universal alpha.59 passed signed-package
and final-DMG installation verification. Its real outing confirms the repaired background click
path, but restart setup and recovery from a restaurant network error still failed. No itinerary
was saved. Nothing new was published; the last published Mac pilot is alpha.24.

## Exact universal alpha.59 artifact

Source: `820f45aad9177e0d3ec5f189903037e4e06bbbe2`. Developer ID signatures, app/DMG notarization,
stapling, Gatekeeper and packaged runtime checks passed. The app was installed from the read-only
mounted final DMG and its ASAR matched. Packaging never published. Alpha.58 is retained as a backup.

| Artifact       | SHA-256                                                            |
| -------------- | ------------------------------------------------------------------ |
| Universal DMG  | `dd2c835780963adce4c520d91e1a8116ffbfedcd1c1c6c5fc7456a69cbc2e6af` |
| Universal ZIP  | `d48f85ed7c8eec79972eb8d257e36b3e69b94c098a4daad07d4d3a52340d19b7` |
| Installed ASAR | `112c8c1302df80b4b0aad976d6f888378510ee67d6508dc019262a2023c90525` |

The exact source passed `pnpm test:pilot`: 1,950 desktop tests, 249 native browser tests,
46 Electron E2E, 40 renderer and 72 Chromium/WebKit phone tests, plus build, format, lint,
quality, types and other native/shared checks. Skips are retained in the gate log.
[Exact-source CI](https://github.com/ljang0/sia-v2/actions/runs/41239134811) was still running
at the last check. Automated checks do not establish real task skill.

## Real outing and recovery

A fresh agent used GPT-6-Astra through the ChatGPT plan, vision-only background Mac control and a
new workspace. The unchanged request asked for a solo Pittsburgh outing on November 7, 10 a.m.–
6 p.m., starting/ending near CMU, within $60: inspect official attraction, restaurant-menu and PRT
sources; provide budget arithmetic and a weather fallback; save/read back `pittsburgh-outing.md`.
No booking, purchase or message was authorized or performed.

- At 20:41:57 UTC the fresh request began. After relaunch, existing Chrome access was unavailable.
  The operator used Connect Chrome & continue and selected the previously approved public window.
  Sia resumed the preserved request automatically. This is an intervention, not an uninterrupted pass.
- At 20:43:09 the Visit-menu click that failed in alpha.58 was delivered in the background; the
  next page was the museum's visitor information. Further clicks and scrolling worked. Sia read
  Saturday hours and $25 admission from official pages. A refused ticket link did not end research:
  the model continued through another official page without a rescue prompt.
- Navigation to the restaurant site lost its acknowledgement; two bounded observations timed out.
  At 20:45:20 the task stopped without an itinerary. Supervisor CUA found Chrome's
  `ERR_CONNECTION_TIMED_OUT` page. A Continue attempt also failed to observe that settled page.
- Restarting the same signed build with content-free driver diagnostics did not repair the read.
  Diagnostics identify `Page.getFrameTree` as the timed-out command. During reconnection, Sia
  reported accepting Chrome's prompt while it remained open; supervisor CUA accepted the already
  approved prompt, then retried the exact public window. Setup completed, but page reads still
  timed out. The operator finally returned the disposable tab to the previous museum page.

The runtime preserved uncertainty and did not replay the failed navigation. It did not complete
the requested work. Browser network-error recovery and Chrome setup remain release blockers.
Private receipts, exact prompts, original traces, screenshots and diagnostics are in
`alpha59-artifacts/real-work` and its parent artifact directory. The report's absence was checked
independently; no operator-written itinerary substitutes for it.

## Responsiveness and coexistence

While the browser task ran, supervisor CUA typed a separate 239-character TextEdit note and
verified the full text remained intact. Ten agent-navigation interactions measured median
946.5 ms and worst 1,199 ms for click plus accessibility observation, including CUA overhead.
These samples do not establish renderer-only latency, clipboard/focus preservation, or two
successful concurrent Sia tasks. Those checks remain required.

## Prior evidence and remaining gates

The [prior artifact record](https://github.com/ljang0/sia-v2/blob/820f45aad9177e0d3ec5f189903037e4e06bbbe2/docs/public-release.md)
retains alpha.57/58 hashes, traces and failures. Alpha.57 saved independently checked dinner and
grocery files after operator recovery; native TextEdit creation reached Save but could not finish.
The draft was later preserved by operator CUA, not by Sia. Earlier alpha.56 assisted-mode successes
do not validate the vision-only default.

Alpha.59 fixes a reproduced native command-policy lookup: binary search rejected the declared
`DOM.getNodeForLocation` entry because the list was not sorted. Membership lookup uses the same
reviewed method set; a production-restricted coordinate regression fails with the old lookup and
passes with the correction. Structured refusal handling is covered separately. No permission guard
was relaxed. The live Visit-menu result above verifies the correction on the signed artifact.

Still required: uninterrupted real workflows and repeats; native Save/reopen; concurrent tasks and
same-window contention; Stop/recovery; clipboard/focus preservation; restart/expiry; clean-account,
physical lock/sleep and voice acceptance. No fresh macOS account or second Mac is available.
This Mac refuses Sia's display-awake assertion with `kIOReturnNoMemory`; independent Apple
`caffeinate` probes also failed, and the cause is not established. Background new tabs and Finder
file drag remain unsupported. Do not overlap live QA with build/Electron/renderer/package checks.

## Cloud and follow-on iPhone evidence

Cloud ratings/account-deletion changes from `bd32d980635b6cf894ae56c4bb2504cfadfaead7` were
deployed to `sia-alpha`. The deployment verified both package hashes, atomic retries/rerating and
account-deletion isolation. A synthetic authenticated app rating reached the aggregate report.
The October 30 health recheck found all 18 alarms OK with actions enabled and all five Lambdas
Active/Successful. Anonymous catalog, ratings-report and release requests returned 401.

Native iPhone 0.1.0 (31) is Ready to Test in the internal Pilot QA group, with zero testers at the
last acceptance check. Native tests, signed archive, upload and Apple processing passed. Physical
pairing, file Save, reconnect and microphone acceptance, and external beta review remain open.
The owner selected iPhone as a follow-on release, so those checks do not gate this Mac-first handoff.

## Publication

Installers, verification logs and private real-work receipts remain local. After the remaining
[release gates](./release-status.md) pass and the owner authorizes distribution, follow
[release operations](./release.md) and verify the recipient's downloaded hash. Research recruitment
retains its separate [sign-off](./research-release-signoff.md).
