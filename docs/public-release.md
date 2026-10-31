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
also passed.
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
Source guidance now explains fresh parent-document observation when a separate panel has no route.
This does not establish working input. Do not remove focus or ownership checks to make this case pass.

Private `alpha60-artifacts` holds exact package/install receipts, gate logs, the source prompt,
original trace reference, `native-result.json`, screenshots and `operator-preserved-native-brief.txt`.
The observer read existing alpha.59 notes unchanged; this does not establish a concurrent-task pass.

Internal signed arm64 diagnostics narrowed the failure without establishing acceptance. Alpha.61
confirmed that sheet-to-document focus ownership matched: filename entry worked, but Cmd-Shift-G
reached the app-menu guard, which rejected the raw sheet ID. Alpha.62 bypassed that menu route for
proven sheets; alpha.63 also tried the existing alternate PID keyboard transport. Both returned
accepted, unverified input with unchanged screenshots. Those transport experiments were removed;
their source diffs, signatures and failure receipts remain in private evidence. No requested file
was saved. Supervisor CUA coordinate input also failed on the panel's out-of-process element,
while accessibility activation expanded the disclosure control; the supervisor collapsed it again.
That comparison is diagnostic evidence only. It is not a model-visible accessibility fallback or
a successful Sia task.

Alpha.64's read-only point diagnostic found no application hit-test element but exactly one
pressable sheet descendant at the requested coordinate, with matching document ownership.
The separate native point-resolution module in internal signed arm64 alpha.65 corrected that
case: Sia's coordinate click expanded the panel. Its next click did not collapse it. The expanded
image scales the document within the same output dimensions; capture-coordinate mapping is the
next investigation, not a confirmed fix. Host action/readback took 1,367 ms and 2,033 ms respectively;
these are two diagnostic samples, not an end-to-end performance result.

Alpha.65 installed ASAR: `5f9af9ba3bb602fd472f198b33257e13e7d00fbd80ff5413f555ad8088996338`.
Its base is `f3f9f71e986671eb3f48caa0ef834b35bbd77603`; the captured source diff hashes to
`aa1f93c86da8fce4adbd984d616b6c3c00df65c5c16d2bb4a131d60b491a15bc`.
Private `alpha64-sheet-point` and `alpha65-sheet-point-fix` retain package/install receipts,
the diagnostic source, prompts, traces, screenshots and results. These packages are internal QA,
not notarized distribution artifacts. The brief remains unsaved in the requested workspace.

Alpha.65 source passed the full local `pnpm test:pilot` gate: build/static/shared checks,
1,950 desktop tests, 249 native browser tests, 46 Electron tests, 40 renderer tests and
72 phone-browser tests. The six new sheet-point cases and the existing ownership/focus/menu
checks also passed. Documented skips remain in the retained `pilot-gate.log`.

The alpha.65 QA process remained open behind a quit-confirmation alert during that gate. The
diagnostic turn had ended; the retained trace shows only a completed memory review afterward,
not further computer input. No live acceptance is credited during the gate. The confirmation was
closed and process exit verified before alpha.66 packaging and the later transport probes.

Internal signed alpha.66 recorded a parent rectangle `[532,356,586,476]` and owned sheet rectangle
`[425,384,800,448]`; ScreenCaptureKit's filter still described the parent and its sample-buffer
frame metadata was absent. The valid saved PNG visibly shows the expanded sheet and black padding.
The model instead reported no viewable image. This read-only diagnostic sent no UI input and earns
no task acceptance. Its temporary native diagnostics were removed; private
`alpha66-capture-geometry` retains the package, source diff, geometry and image evidence.

Fresh ephemeral transport probes on Codex `0.153.0` reproduced the image failure while recording
an `inputImage` in the completed dynamic-tool response. Inspection of the wrapper's return shape
and upstream implementation identified newline-separated text and image URLs. Explicit `image()`
forwarding allowed the model to read the Save As field, selected folder and first two filenames,
none supplied in the prompt. Alpha.67 source puts that guidance beside provider response encoding
in `codex-tool-results.ts`. The opt-in real-provider regression passed with all four facts; mock
protocol tests alone had not detected the missing observation.

Signed internal arm64 alpha.67 passed the same observation through a new Sia assistant, with
Codex · GPT-6-Astra displayed. It listed apps and took one fresh screenshot, then correctly reported
the four image-only facts and sheet overhang in an 11.178-second turn. The trace records no computer
input. Full-task repeats are still required; expanded-sheet coordinate mapping remains unresolved.
Installed ASAR: `a5faa6910cd798c2aff18832b1e00b0d072ce7e9b19e89f3a0bccbf59b6c61ad`.
The source base is `ac98a9afc9d94558d77f66392713e8895dd2c94f`, with captured diff
`452c0eeccc77895ddd6e148d328d459711bc5423a66cfd6a50062f6efdfd96c2`.
Private `alpha67-image-handoff` retains package/install receipts, source, the fresh-agent prompt,
trace, screenshots and result. This build is not notarized or approved for distribution.

Alpha.67 passed the full local pilot gate: build/static/shared checks, 1,950 desktop tests,
249 native browser tests, 46 Electron tests, 40 renderer tests and 72 phone-browser tests.
Documented skips remain in `pilot-gate.log`. Live QA began after packaging and all gates completed;
the QA process was then quit through CUA and its exit verified.

Internal read-only alpha.68 initially discarded stream frames because the dependency's decoded
status was null. Alpha.69 removed that diagnostic filter and recorded actual stream geometry:
the ordinary window had content scale 1; the expanded Save sheet had content scale
`0.7325000166893005`, backing scale 2 and content/bounding rectangles
`[0,0,586.0000133514404,348.67000794410706]`. Its screen rectangle remained
`[532,356,586,476]`, the parent, despite the earlier proven 800-point sheet overhang. Thus a
scale-only correction would still misplace the image origin. Production work must validate status,
pair pixels with their own frame metadata, reconcile fresh exact-owned sheet bounds, and reject
changed geometry before input. Enlarged image bounds alone must not widen synthetic input.

Both turns used only app listing and one screenshot. Alpha.69's installed ASAR was
`a1bb6054cee44a1ba6bda8db8586a4f444f30107fbd9037fa2a17c620e237a08`; its base was
`311cdd03dd0caf14d8f50c8268fb6ecc7a3deb72`, with captured diff
`97d7a0d33ffd8fe62d4b608f7cd8ca9b6fc15deb4f23377902c9db2960b3b35e`.
Private `alpha68-stream-geometry` and `alpha69-stream-metadata` retain receipts, source, traces,
metadata and results. Neither is a distribution candidate or completed task. Probe code was removed,
the QA process exited, and the signed alpha.67 app was restored without launching it.

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
