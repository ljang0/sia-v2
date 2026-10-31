# Distribution acceptance record

Updated October 31, 2026. **Distribution is not ready.** Universal alpha.58 is signed,
notarized and installed from its final DMG. Its fresh outing task still failed on coordinate
clicks. The investigation reproduced an incorrectly searched native command allowlist and
host handling that missed structured refusals. Alpha.59 source fixes those paths; signed live
acceptance is still required. Nothing new was published; the last published Mac pilot is alpha.24.

## Exact universal alpha.58 artifact

Source: `e5b5b78dd0b7c7ce67ee9c398669f7de2c16ee8b`. Developer ID signatures, app/DMG notarization,
stapling, Gatekeeper and packaged runtime checks passed. The app was installed from the read-only
mounted final DMG and its ASAR matched. Packaging never published.

| Artifact       | SHA-256                                                            |
| -------------- | ------------------------------------------------------------------ |
| Universal DMG  | `b587a6b4876dacb3dbba70cb2d88723b56a7c1b72bee7f79504ab43889339770` |
| Universal ZIP  | `2dd0c94e44da7aba9ee3205de470a313b485e8106404d2b9eb45fd6e39ccdc9f` |
| Installed ASAR | `767557a98e26bcb05f5b621d271154e8c55f094aab931657e9130ab64609b9ae` |

A fresh agent/conversation started the real $60 Pittsburgh outing task at 20:06:52 UTC.
After relaunch it required the operator to choose the previously approved public Events window;
Connect Chrome & continue resumed the saved request. Two clicks at the visible Visit menu were
refused, and the task ended at 20:08:41 without an itinerary. No task rescue prompt, purchase,
booking or message occurred. Restart access reuse and unattended completion remain unproven.

The exact native allowlist reproduction rejected its declared `DOM.getNodeForLocation` method:
binary search depended on sort order that the added entry violated. Alpha.59 uses membership in
the same reviewed list and tests coordinate input under the production connection restriction.
It also handles structured refusal envelopes for diagnostics and bounded screenshot recovery;
alpha.58 only handled the exception form. No permission guard or allowed-method set was relaxed.

The older alpha.57 native draft was saved separately by supervisor CUA into the private evidence
folder. AX field setters were needed after clipboard paste did not update the Save path. This
preserves its 327-word content but is not a Sia Save or vision-only acceptance pass. Receipts,
failure screenshot, original traces and this operator recovery are in `alpha58-artifacts/real-work`.

## Exact universal alpha.57 artifact

Source: `47352213cfe9bf254a39d3a1094ad765902d4a1b`.
Strict Developer ID signatures, app/DMG notarization, stapling, Gatekeeper and packaged runtime
checks passed. The QA app was copied from the read-only mounted final DMG; the mounted and installed
ASAR hashes match. Packaging was explicitly configured never to publish.

| Artifact       | SHA-256                                                            |
| -------------- | ------------------------------------------------------------------ |
| Universal DMG  | `d50a0f936c7e78a404eeb4f108cff413447d176569098a97df1e0a9c6d87860f` |
| Universal ZIP  | `d0ac5e239365abc1fce298281feae6c9872f3017fe89997dbb057e17f822db67` |
| Installed ASAR | `c90941a695d95da85a1058981b279a30f84205958566bc03443457a1331f5d3b` |

The final receipt wrapper failed after successful package checks because the local Python lacks
`hashlib.file_digest`. Hashing and receipt copying were repaired with streaming SHA-256; the
package was not rebuilt. Both the original log and repaired receipt are retained privately.

The exact source passed `pnpm test:pilot`: 1,933 desktop tests, 248 native browser tests,
46 Electron E2E, 40 renderer and 72 Chromium/WebKit phone tests, plus build, format, lint,
quality, type and other native/shared checks. Skipped cases are recorded in the gate log.
[Exact-source CI](https://github.com/ljang0/sia-v2/actions/runs/41232634379) passed, including
unsigned universal packaging.
Automated transport and authorization checks do not establish real task skill.

## Alpha.57 household work

A new agent used default GPT-6-Astra through the ChatGPT plan, background Mac control and a
private workspace. The prompt requested three weeknight dinners for two adults, inspected
published recipes, active/elapsed times, ingredient reuse, serving adjustments, a consolidated
shopping list and verified saved outputs. Explicit file tools were allowed for the two files;
those writes are not counted as visual editing.

The initial request at 19:18:27 UTC required **Connect Chrome & continue**. The operator selected
the previously approved disposable public window. Research visually inspected two recipes but
stopped after a stale image and refused pointer input on the third search result. At 19:24 UTC,
the operator requested independent recovery through permitted keyboard navigation or a known
public recipe URL. The model navigated and inspected the third recipe, then finished at
19:26:53. No operator clicked the recipe for it. This is a recovered run with two interventions.

| Deliverable      | Bytes | SHA-256                                                            |
| ---------------- | ----- | ------------------------------------------------------------------ |
| `dinner-plan.md` | 6,492 | `3a1895e4966711415a9297e763d39deac343741b08cb801ebbf410e880952812` |
| `groceries.md`   | 5,084 | `b2b812e78ccfcfd668e774c23291bd89ac0aa5daef698dddacb2a7a1735e6e38` |

Independent reads of the three published sources confirmed ingredient quantities, yields,
methods and published timings. Grocery totals reconcile, including four onions, five garlic
cloves, four tablespoons of oil, four eggs and four tomato cans. The cherry-tomato can size,
rice/bread allowances and substitutions are explicitly labeled assumptions. The pasta makes
four portions, including two reserved lunches. Both files opened in the installed app's preview.
No meals were cooked, pantry stock/prices were not verified, and food-storage advice was not
independently checked.

## Alpha.57 native work and concurrency

A separate new agent received a GUI-only TextEdit task: create, save, reopen and visibly verify
a 250–350-word Arena pilot brief. It used screenshots, coordinates and keys, created a new
document, entered the brief and opened Save. The separate Save window was `ax_unresolved` and
reported no safe background input. An operator recovery prompt asked it to inspect the parent
document without repeating text or Save. Pointer input was available there, but keyboard input
returned `window_not_key`. The draft remains intact and unsaved. This scenario failed.

Browser observations and native document actions interleaved on separate queues. This establishes
independent progress, not completed concurrent tasks. Native Stop/recovery, exact-artifact UI
latency and clipboard preservation remain unverified. The second personal task, a sourced $60
Pittsburgh outing, reused the connection but stopped after two refused clicks; no output was
created and no booking or purchase occurred.

Private receipts, traces, hashes and preview screenshots are in `alpha57-artifacts/real-work`.
The application logs 29 household and 11 native image-bearing visual results, with explicit file
tools counted separately. Counts alone do not prove successful visual control.

## Remaining gates and rollback

Fix and repeat background browser input/re-observation and native Save targeting on the exact
final artifact. Source follow-ups add one bounded read retry for an invalidated capture pair,
content-free pointer/link guard diagnostics and corrected visual-control settings copy. They
are not part of the alpha.57 artifact above and do not yet establish a live fix. The follow-up
source passed the full local pilot gate with 1,941 desktop tests and the same native/E2E, renderer
and phone counts; 155 focused checks cover the changed boundaries.

Alpha.58 additionally removes the native-skill UI branch and enforces the visual policy across
library reads and skill launches. All local pilot-gate stages completed with 1,942 desktop tests
and the same native/E2E, renderer and phone counts. One obsolete native-creation E2E expectation
was updated; its three-test library file and the remaining stages passed separately. Its artifact
passed signed-package and mounted-DMG verification, but its live outing still failed as recorded
above. Alpha.59 corrections passed the full `pnpm test:pilot` gate: 1,950 desktop, 249 native
browser, 46 Electron, 40 renderer and 72 phone-browser tests, plus build, static and other
native/shared checks. The restricted coordinate test fails with the old lookup and passes with
the correction. Alpha.59 still requires signing, exact-source CI and live acceptance.

Retain the alpha.56 QA backup for rollback. Its assisted-mode successes and interventions are
in the [previous acceptance record](https://github.com/ljang0/sia-v2/blob/47352213cfe9bf254a39d3a1094ad765902d4a1b/docs/public-release.md);
they do not validate vision-only control. Do not overlap real QA with Electron/renderer gates
or packaged runtime verification.

Keep-awake, physical lock/sleep, voice, restart/expiry, clipboard and clean-account acceptance
remain open. This Mac refuses Sia's display-sleep assertion with `kIOReturnNoMemory`; independent
Apple `caffeinate` probes also failed. The cause is not established. No fresh macOS account or
second Mac is available. Background new tabs and Finder file drag remain unsupported.

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
