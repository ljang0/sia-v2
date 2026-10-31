# Distribution acceptance record

Updated October 31, 2026. **Distribution is not ready.** Universal alpha.60 passed signed-package
and final-DMG installation verification. Its real native document task reached Save but failed;
a parent-document diagnostic also failed. Alpha.59 browser recovery and restart issues remain open.
Nothing new was published; the last published Mac pilot is alpha.24.

## Exact universal alpha.60 artifact

Source: `b22d9c279eea120118d73083aa27281964dc727f`. Developer ID signatures, app/DMG notarization,
stapling, Gatekeeper and packaged runtime checks passed. The app was installed from the read-only
mounted final DMG and its ASAR matched. Packaging never published. Alpha.59 is retained as a backup.

| Artifact       | SHA-256                                                            |
| -------------- | ------------------------------------------------------------------ |
| Universal DMG  | `af33f7157412d3e8b4befdd31f1360dd42a87ba58cc44b16f48a1dad64839ae1` |
| Universal ZIP  | `75a97eac0e07f475a78a8e0518e031387c05f909e3b512fd16ce1b5b2c32afeb` |
| Installed ASAR | `15bf1a235112be62631900e01f401bdf9991cd6295d12caa13bc6e85520a285e` |

The exact source passed `pnpm test:pilot`: 1,950 desktop tests, 249 native browser tests,
46 Electron E2E, 40 renderer and 72 Chromium/WebKit phone tests, plus build, format, lint,
quality, types and other native/shared checks. The gate now includes 12 exact-target ownership
and 13 key-focus regressions. Skips are retained in the log. [Exact-source CI](https://github.com/ljang0/sia-v2/actions/runs/41242349687)
was still running at the last check.
Automated checks do not establish real task skill.

## Native document and Save recovery

A fresh agent used GPT-6-Astra through the ChatGPT plan and vision-only background Mac control.
The real proposal and current release evidence were supplied as a text attachment. The task was
to prepare a 350–500-word technical-review brief in a new TextEdit document, save it in the agent
workspace, close it, reopen it and visually verify its filename and complete contents.

- The request began at 21:21:27 UTC. Background keys created a new document, selected plain text
  and entered the brief. After opening Save, the host reported a separate Save window and told
  the model to inspect it. That snapshot had `ax_unresolved` with no available input route.
  Sia stopped at 21:22:38, leaving the requested file absent. It did not claim completion.
- A recorded supervisor follow-up asked for a fresh observation of the original document,
  because attached sheets can be owned by that document. After reacquiring the expired turn grant,
  its screenshot was available, but Cmd+A returned `needs_foreground` without attempting input.
  The diagnostic stopped at 21:24:09. This intervention did not establish a live fix.
- After both attempts ended, supervisor CUA selected the QA document to preserve the draft.
  A click intended for Cancel instead activated Save after CUA indices changed. It saved
  `Untitled 3.txt` in the previously selected alpha.58 evidence folder. That operator-created
  file was retained and copied into alpha.60 evidence; it is not the requested Sia deliverable.

The preserved brief has 444 words and accurately keeps distribution on hold. The requested
workspace file remains absent; Save/close/reopen acceptance failed. The source ownership change
passed a regression that failed under the old comparison, but live sheet focus remains unresolved.
The new-window guidance also fails to explain the parent-document route. Do not remove focus or
ownership checks to make this case pass.

Private `alpha60-artifacts` holds exact package/install receipts, gate logs, the source prompt,
original trace reference, `native-result.json`, screenshots and `operator-preserved-native-brief.txt`.
The observer read existing alpha.59 notes unchanged; this does not establish a concurrent-task pass.

## Browser evidence retained from alpha.59

The [alpha.59 record](https://github.com/ljang0/sia-v2/blob/b22d9c279eea120118d73083aa27281964dc727f/docs/public-release.md)
retains its exact hashes, outing timeline and interventions. Corrected Visit-menu clicks and
scrolling worked, but the outing failed on a restaurant network-error page. Continue and restart
still timed out on `Page.getFrameTree`; one approved Chrome setup prompt also failed to dismiss.
No itinerary was saved. Ten navigation samples measured median 946.5 ms / worst 1,199 ms including
CUA overhead, and separate 239-character notes stayed intact. These observations do not establish
renderer-only latency, clipboard/focus preservation or two completed concurrent Sia tasks.

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
