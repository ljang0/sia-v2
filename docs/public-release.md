# Distribution acceptance record

## Current RA evaluation artifact

Alpha.119 is the current signed and notarized evaluation DMG. It adds strict pointer-event delivery for vision-only native clicks. It is not accepted for broad distribution or completed Arena evaluation. Nothing has been publicly published or sent to a recipient by this work.

| Identity                   | Value                                                              |
| -------------------------- | ------------------------------------------------------------------ |
| Version                    | `0.1.0-alpha.119`                                                  |
| Source                     | `2dfcf45ac78e1f6798891ca91a458c5786dd728c`, clean at packaging     |
| Universal DMG SHA-256      | `9d52730c534016df3c53869f50e673c64af1ff71677954263c695bd7d44656d7` |
| Universal ZIP SHA-256      | `da8d31d9f1cb421763670106fe23d7b15e3e05a9295f7b05dc8b55c7fd5e2936` |
| Installed ASAR SHA-256     | `b6975bec3bccfaa4b6242e54c7a60b54bcab7b4ce8bd637952136e033c5f0c48` |
| Private evidence directory | `alpha119-pointer-only` under Sia Release Verification             |
| Packaging / installation   | November 2, 2026, 15:06:19 / 15:08:26 UTC                          |

Developer ID signing, notarization, stapling, Gatekeeper and packaged-runtime checks passed. The app was installed from the read-only mounted DMG with ASAR comparison and signature verification. Apple silicon received live testing; Intel received static verification. The full local pilot gate passed: 2,009 desktop, 46 Electron, 48 renderer, 72 phone-browser and 223 cloud tests, plus native/shared/build/static checks. Remote CI run 350 remained in progress at the last check. Earlier intermittent test failures remain recorded in [release status](./release-status.md#alpha119-candidate).

The fresh native handoff (`898c747f-4a3e-4697-89ec-d40264ed17a1`) stopped after 57.659 seconds. Finder’s Go to Folder sheet opened, but both it and the parent reported `ax_unresolved`; rename/move/reopen did not complete. Both original RTF hashes below remained unchanged. A five-day meal-plan task reached Chrome connection recovery and then paused on Mac sleep without saving an output. The native recovery attempt subsequently failed with the connected model plan’s usage limit (HTTP 429). No successful concurrency is claimed.

CUA started microphone dictation, observed **Listening**, stopped it and received **No speech was detected**. No deliberate spoken command was supplied. The physical Fn shortcut remains unverified because CUA cannot send that key. Stale external CUA screenshots/input required the window’s exposed Raise action; this intervention is not evidence of Sia background reliability. Receipts: `package.json`, `install.json`, `pilot-gate.log`, `live-acceptance.json`, extracted trajectories, `voice-listening-cua.png` and `voice-no-speech-cua.png`.

## Alpha.118 recording and voice baseline

Alpha.118 is prepared for the owner's requested RA evaluation. It is not accepted for broad distribution or completed Arena evaluation. Nothing has been publicly published, sent to a recipient or submitted to Arena. The last published pilot remains alpha.24.

| Identity                   | Value                                                                            |
| -------------------------- | -------------------------------------------------------------------------------- |
| Version                    | `0.1.0-alpha.118`                                                                |
| Source                     | `db14166524a0d6fe80c5055fee6209a3bc5c96e7`, clean source at packaging            |
| Package                    | Universal macOS 14+; Developer ID Lawrence Jang (`DXYJ578DD4`)                   |
| Universal DMG SHA-256      | `bbee10fb839698393e4db5a6bb59fa21f3d601bf10fcabc649876bc294a4b0e7`               |
| Universal ZIP SHA-256      | `8b13d20487c01b6370b3db64e74d1adcf880a059b85b0ff3d583d4c6c42d0856`               |
| Installed ASAR SHA-256     | `75afdc86b57d1809cc9b7a11903da1194fff28af86297e5d26856310b509a8c5`               |
| Private evidence directory | `alpha118-ra-cloud` under the release operator's Sia Release Verification folder |
| Packaging completed        | November 2, 2026, 02:27:04 UTC                                                   |
| Installed from DMG         | November 2, 2026, 02:28:05 UTC                                                   |

`pnpm package:mac` passed signing, notarization, stapling, Gatekeeper and packaged-runtime checks. Installation mounted the exact DMG read-only, verified its app, copied into staging, compared the ASAR hash, verified again and promoted it to the isolated QA app. Apple accepted app submission `78df264d-75bb-4d10-868a-0735fed348c6` and DMG submission `af5586ee-8b76-4711-bc8d-695789b2052c`. Intel contents were statically verified; live execution was on Apple silicon.

Receipts: `package.json`, `install.json`, `package.log`, `install.log`, `pilot.log`, `aws-review.json`, `aws-deployed-function.json`, `aws-live-transport-result.json`, and `signed-app-recording-verification.json`. Raw QA batches and screenshots remain private and are not committed. The DMG contains live cloud configuration, without fake services, the QA profile or private credentials. Later documentation commits do not change its source identity.

## Default recording and live AWS proof

The installed DMG displayed the first-run disclosure with recording selected. CUA clicked Continue once; Settings → Privacy then displayed **Recording**. No per-task recording control was used. Existing declines, pauses and deletion choices stay respected, and Google Workspace connector turns remain excluded.

The `sia-alpha` control-function deployment reached `UPDATE_COMPLETE`. Only the function's code location changed in the deployment template; dependent ARN references updated without resource replacement. The deployed code hash matched the tested bundle. Ordinary Cognito `Users` now have upload eligibility, while archive reads remain restricted to authorized administrators. S3 remains KMS-encrypted with public access blocked and 90-day active-record retention.

A disposable ordinary user verified authenticated HTTPS upload, exact prompt/usage/screenshot bytes in S3, duplicate acknowledgement without another object, and deletion of all object versions. The account was removed and no email was sent. This was synthetic transport verification.

Separate real-provider turns on the installed app uploaded automatically:

| Task                     | Turn                                   | Stored events | Stored bytes | Images | Result                                         |
| ------------------------ | -------------------------------------- | ------------- | ------------ | ------ | ---------------------------------------------- |
| Native checklist handoff | `031c8abe-8cbe-470b-912e-186952c70a8c` | 49            | 2,035,615    | 3      | Stopped at title click; rename/move incomplete |
| Sunday prep checklist    | `0686bbe6-527d-4982-af1c-c8a866cd66a6` | 60            | 132,717      | 0      | Saved, read back and opened in Sia Preview     |

Independent S3 reads matched each stored batch hash and verified prompt text, provider-reported input/output token usage and action results. The three native screenshot payloads decoded as PNGs; visual review confirmed the unchanged checklist and absence of a Name popover. The workspace-file task appropriately produced no computer screenshots. These checks prove automatic recording of both successful and stopped tasks, not universal workflow reliability.

## Real task outcomes and interventions

The native task received explicit recovery instructions to inspect the existing copy, open its title controls and click the Name field before typing. It stopped when the title click did not expose that field. The alpha.117 popup-routing correction therefore was not exercised. Original `Untitled 8.rtf` and `Untitled 8 copy.rtf` remain 1,874 bytes, both SHA-256 `bfcd55c3e66d3118ab4b709c667f7ccac3dd5c057b3b3932171690eb40085d14`. No rename, move or close/reopen pass is claimed.

The personal-assistant task transformed the previously source-checked dinner plan into optional Sunday prep and three evening checklists in 104.759 seconds. Independent review checked the corrected half-batch quantities, two-adult servings, leftover portion, unknown quantities and timing caveats. The app saved and read it back, and CUA opened the result in Sia Preview. `weeknight-prep-checklist.md` is 4,130 bytes, SHA-256 `68c44dd7be3ea3af4af198ba8f8c0fb8e61187e0217e4b64925f94161d984d3f`. The 6,702-byte original dinner plan retained SHA-256 `e3fb2eb00a3747039cbe64a25089c6c1b5b5eff1e70a5984cf97410209e0743b`.

The native turn finished at 02:34:05 UTC; the meal turn started at 02:35:06 UTC. Despite an earlier progress message describing two running tasks, the logs establish sequential runs. Concurrency and continuous foreground/clipboard preservation were not measured.

Earlier alpha.115 tasks produced a source-checked $97 museum/lunch itinerary and a dinner/grocery plan, each with setup and review interventions. The [previous detailed record](https://github.com/ljang0/sia-v2/blob/db14166524a0d6fe80c5055fee6209a3bc5c96e7/docs/public-release.md) preserves those artifact identities, timings, failed diagnostics and interventions. Earlier private receipts, screenshots and generated documents are retained. Progress across versions does not constitute one complete workflow pass.

## Overlapping follow-up tasks

A second pair on the same installed DMG overlapped for **18.208 seconds**. Native recovery turn `ccc20cef-9f67-43de-b86d-2b65224eaafb` ran 02:46:58.017–02:47:51.270 UTC and stopped after the menu-focus shortcut and title context click did not expose a usable control. No successful rename/move is claimed. Grocery turn `d74405f9-a543-4475-808e-d135175c776d` ran 02:47:33.062–02:49:01.732 UTC and completed in **88.670 seconds**. It saved, read back and reopened `grocery-checklist.md` in Sia Preview. Independent review confirmed 23 ingredient rows, shared-ingredient arithmetic, five quesadillas and explicit unknown package sizes. Both source-file hashes remained unchanged. The output is 4,392 bytes, SHA-256 `82359c33c12571f7f6dd3cb9823540d916a7d81f09fff3c1c554b482a5dc1c1d`.

`overlapping-tasks-verification.json` and the two extracted event logs retain the evidence privately. This establishes overlapping execution and one successful task, not two successful concurrent computer-use workflows. Continuous focus/clipboard preservation was not measured. After both turns finished, operator CUA inspected TextEdit's Window menu for diagnosis; that intervention is not Sia acceptance.

## Managed voice repair

On November 2, the owner reported **temporarily unavailable** when enabling Fn voice in the DMG. Both cloud voice switches were on, but a direct provider check returned HTTP 401 `invalid_api_key` for the AWS credential. The saved local-development credential also failed authentication. Release builds correctly selected the managed AWS route; the shared key was never bundled into the app.

The owner supplied a replacement. Before installation, catalog access and all three single-use token types passed against ElevenLabs. Only the `apiKey` field in the existing AWS secret changed; voice allowlists, quotas, feature switches and other settings were preserved. No app rebuild was needed.

An ordinary disposable Cognito user then exercised the existing desktop `CloudClient` and `ElevenLabsVoiceService` through the deployed AWS API. The live catalog returned 21 voices. Synthetic TTS produced 53,542 bytes; batch and realtime transcription both recovered “Find my Carnegie Mellon professors for this semester.” exactly. Realtime cancellation passed. The round trip took 3,516 ms. The account was deleted, no email was sent, and no microphone or model turn was used. This is real provider transport verification, not a physical Fn/microphone acceptance pass. An initial probe read the wrong session field and stopped before speech; the corrected probe reads `entitlements.hostedVoice`.

Private receipts are `voice-key-rotation.json`, `managed-voice-probe-initial-failure.json` and `managed-voice-roundtrip.json`. The initial installed-app UI check hit the computer-use tool’s `noWindowsAvailable` failure. The owner requested a CUA retry, recorded below.

CUA subsequently refreshed the voice catalog in the installed alpha.118 app and observed **ElevenLabs voice ready** with enabled controls. Reading the saved grocery reply reached **Speaking…**. Cancellation briefly restored the read-aloud control, but later input became unreliable (`noWindowsAvailable`), so microphone startup and stable cancellation are not accepted. CUA rejects the Fn key (`keyNotFound("fn")`); no physical hold-Fn command was verified. Private receipts: `voice-cua-verification.json`, `voice-ready-cua.png`, and `voice-speaking-cua.png`.

On the owner’s physical Fn retry, a notification reported that the personal ElevenLabs key lacked access. Process inspection found the old development app and the QA DMG both running Fn helpers. CUA verified that the development copy had Hold Fn enabled, turned that competing shortcut off, and verified the off state. The development Fn helper exited; the QA helper remained. The managed release route prefers configured AWS over the local credential. A fresh physical Fn retry is still required. Private screenshot: `alpha119-pointer-only/development-fn-disabled-cua.png`.

## Automated gates and remaining acceptance

The final full `pnpm test:pilot` passed: 2,007 desktop, 46 Electron, 48 renderer, 72 phone-browser and 223 cloud tests, plus native/shared/build/static checks. An earlier run was stopped after the new notice blocked older E2E flows; it is not counted as a pass. Updated tests cover the default selection, opting out and preserving the choice after reload. Remote CI run 345 passed for the exact DMG source revision (`db14166524a0d6fe80c5055fee6209a3bc5c96e7`). The broad native run has a known keep-awake failure, so no all-native pass is claimed.

Remaining broad-release gates are native rename/move/Save/reopen, repeatable Chrome restart/setup/error recovery, two completed simultaneous tasks, continuous focus/clipboard preservation, end-to-end latency and broader Stop/recovery. Off-Space capture remains unreliable. Lock/sleep/voice acceptance and a fresh-account first-use check remain unavailable or incomplete; the host keep-awake assertion fails with `0xe00002bd`. macOS permissions must be granted by the person.

Lawrence Jang is the support/incident owner. Use the concise [release notes](./release-notes.md) for the RA handoff and keep the PR draft until the broader acceptance gates pass.
