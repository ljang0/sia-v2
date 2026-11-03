# Distribution acceptance record

## Current RA evaluation artifact

Alpha.122 is the current signed and notarized evaluation candidate. It permits background browser actions when a host check proves that a different browser window is in front, and rechecks that identity after input. Unknown identity fails closed. Broad distribution and Arena acceptance remain open. Nothing has been publicly published or sent to a recipient by this work.

| Identity                   | Value                                                              |
| -------------------------- | ------------------------------------------------------------------ |
| Version                    | `0.1.0-alpha.122`                                                  |
| Source                     | `7531ee7f3115265817e8dd56cf081672799bd8f4`, clean at packaging     |
| Universal DMG SHA-256      | `277f22d0d950878cfee3abb751293430ffed88b04e9174910088f6ec4c38e895` |
| Universal ZIP SHA-256      | `efde7e42893384ce9fff2cb8cc4a376ce9a8ce763b7ffc4a9c20bf237b35c474` |
| Installed ASAR SHA-256     | `c6614fa9bd45465b474edc64d37cdc9a4405825ef65f7d79e0b3047bd7636c3c` |
| Private evidence directory | `alpha122-browser-window` under Sia Release Verification           |
| Packaging / installation   | November 2, 2026, 19:25:22 / 19:26:55 UTC                          |

Developer ID signing, Apple notarization, stapling, Gatekeeper and packaged-runtime checks passed. Installation used the read-only mounted DMG, verified signatures and compared its ASAR. Apple silicon received runtime verification; Intel received static verification. Live AWS configuration, default recording and managed ElevenLabs remain included without bundled private credentials or the QA profile.

All 202 focused checks and the full local pilot gate passed: 2,045 desktop, 46 Electron, 48 renderer, 72 phone-browser and 223 cloud tests, plus shared/native/build/static checks. Only version metadata and release-status prose changed after the full gate; the packaged verifier checked alpha.122. Exact-source remote CI run 362 passed, including the pilot gates and unsigned universal package verification.

Operator CUA created a disposable Budget Bytes window, resized it using Chrome's Window menu and successfully attached it through Sia Settings. A separate public Wikipedia window held the exact test text in two samples while background browser actions continued. Initial marker attempts failed, and final lookup could not find that tab. No final/continuous focus, editable-text or clipboard-preservation pass is claimed.

Fresh meal-planning thread `52aefcd7-c7af-4367-b348-bd4e6bc79a05`, turn `f4fa9db0-9b7b-481d-ae98-7efe14906d16`, first ran from 19:36:40.584 to 19:37:04.310 UTC (**23.726 seconds**). It captured the attached viewport, then navigation was refused with `foreground_app_in_use` before input. Operator Return on Continue resumed it at 19:39:53.532. Background navigation and scrolling reached three recipe pages, with stale-image responses requiring fresh observations. At 19:44:43.898 a snapshot was refused with `authorization_host_failed`; the turn ended failed at 19:45:09.943 (**316.411 seconds** after resume). The safe diagnostic reported `callback_started=0`, `callback_completed=0`, `hint=unspecified`. Its cause remains unidentified; no renewed user permission was requested or bypassed. `alpha122-weeknight-plan.md` was not created.

The household guide queued behind the browser task because it shared the working folder, then started at 19:45:09.948. A visitor guide in another workspace started at 19:45:21.180. They overlapped for **36.563 seconds** before both paused on sleep. The visitor output was saved before the pause and read back after operator recovery at 20:03:57.238. It preserved the original source and correctly reconciled the $45.32 / $50.82 / $52.32 budget scenarios and $14.68 / $9.18 / $7.68 remaining allowances. The model lacked an action for opening Sia Preview, so its turn ended failed at 20:04:19.888; the operator subsequently clicked the result attachment and verified the rendered guide. The household guide remains paused without an output. This is a useful saved artifact with interventions, not two successful concurrent workflows.

`alpha122-visitor-pocket-guide.md` is 3,562 bytes, SHA-256 `6f65a670d7415946bb9c97c7d994ea1db27b4cbc886c047d9e07423e0a41ece4`. Its source retains SHA-256 `b108421b2d78aa3061e90812ae98521582c2de4aa213387474076d29d534b499`. Both native incident files and all three household source files retain their prior hashes. Private receipts retain exact thread/turn identities and content-free event summaries. CUA temporarily showed older state and reported `elementHasNoFrame`/`noWindowsAvailable` during recovery; those observations alone do not establish an application rendering defect.

Private receipts: `package.json`, `install.json`, `source-checks.json`, `pilot-gate.log`, `package.log`, `install.log`, `pilot.log` and `live-acceptance.json`. The alpha.121 QA app is preserved for rollback. Native filename input remains unresolved; its earlier evidence follows.

## Internal QA after alpha.122

The preceding internal app came from clean source `3438d2243a339bb1c2068331779986c15adcdfdd`. It preserves known pre-callback browser failures through the action backend, without treating later uncertain delivery as proof that no input was sent. Its full local pilot gate passed: 2,060 desktop, 46 Electron, 48 renderer, 72 phone-browser and 223 cloud tests, plus shared/native/build/static checks. All 246 focused checks passed; four regression cases failed before the correction.

The Developer ID-signed **internal Apple silicon QA app** passed package/runtime checks at 21:07:40 UTC and was installed in the isolated profile. Its ASAR SHA-256 is `b19683e7458593f8160ac2ced6c17d2e7c7fd188d620e51e4e5504daeff0fa18`. It is not notarized and is not a distribution DMG. The notarized alpha.122 above remains the evaluation artifact. The preceding internal app and evaluation app are preserved for rollback. Receipts and bounded event summaries are in private `alpha122-predispatch-internal`.

After the operator reconnected the existing public recipe window through CUA, the first meal retry omitted scroll x/y. A follow-up reused expired turn-local window IDs and asked for permission unnecessarily. With explicit operator corrections, turn `22bfc9c4-4d3c-4e35-8de6-8f4394cb77df` performed background scrolls and two verified navigations, but stopped after repeated page/document/geometry changes at 21:15:33.778 UTC. No five-dinner plan existed at that point. This operator-assisted run does not prove unattended browser reliability or resolve the previous uncertain-navigation failure's cause.

In a separate workspace, turn `44416560-45df-44ed-aa04-e1773a22aabe` completed a visitor-message draft and departure checklist from 21:15:25.679 to 21:16:28.031 UTC (**62.352 seconds**). `nov7-guest-message-and-checklist.md` is 3,031 bytes and 452 whitespace-delimited words, SHA-256 `eece30235895b6d15140e8f22bfe992ca012a40d57494395ed96a95bb3c5e292`. Sia saved/read it back and returned the attachment. Independent review verified the budget arithmetic, normal/late schedules, explicit inherited-fact caveat and unchanged hashes for all three source files. The operator opened and verified Sia Preview through CUA; nothing was sent, booked or purchased. The 8.099-second overlap with failed browser research is not two successful concurrent tasks. The preceding useful 70.663-second late-start backup remains an unchanged source.

Read-only AWS verification matched five automatically uploaded batches from three recent turns: 268 stored records, with prompts, reported usage, action results and 11 screenshot payloads. Chunked records reassembled successfully; content-addressed hashes and KMS encryption matched. No per-task recording action was used. The private receipt is `alpha122-predispatch-internal/aws-recording-verification.json`.

The source follow-up addresses missing-coordinate guidance, stale-ID recovery and redundant screenshot reads after a pre-input page change. Four regression cases failed before the changes; 178 focused tests and the full pilot gate passed (2,064 desktop, 46 Electron, 48 renderer, 72 phone-browser and 223 cloud tests, plus shared/native/build/static checks). A Developer ID-signed internal arm64 app from clean source `2fe5182e2d81adc1a94a7075d2ba4823af4f3396` passed package/runtime checks at 21:32:19 UTC and was installed in the isolated profile. Its ASAR SHA-256 is `62a9a186b0f387242bbc469d1168e7708720ce0293b71001c83fedf7ee53c9d3`; receipts are in private `alpha122-visual-recovery-internal`. It is not notarized or a distribution DMG. The resumed real-task trial below completed; broad acceptance remains open. Native document rename/move, uninterrupted focus/clipboard preservation, Chrome restart/error recovery, off-Space capture and lock/sleep acceptance remain open. CUA intermittently returns `noWindowsAvailable` or clicks without a visible effect; refreshed indices plus Return opened the checklist. The prior keep-awake error `0xe00002bd` is IOKit's allocation failure (`kIOReturnNoMemory`), not permission denial.

The corrected signed app resumed turn `22bfc9c4-4d3c-4e35-8de6-8f4394cb77df` from 21:35:01.232 to 21:40:52.081 UTC (**350.849 seconds**). The operator reconnected the same public window and clicked Continue without new coaching. Four document-change refusals returned replacement images; Sia continued background input, finished the fifth recipe and USDA research, and saved/read back `alpha122-weeknight-plan.md` (15,430 bytes, SHA-256 `88ed7e6f1e8f71b0b23f33e39be51c8418a73b2615dbb057b2f8622c37d4fefd`). The operator opened Sia Preview and independently checked recipe scaling, grocery totals and key storage limits against publisher/USDA sources. The last browser result preceded the write by 145.830 seconds. This is a completed continuation of earlier assisted research, not a fresh unattended run; no simultaneous second task or continuous focus/clipboard measurement was performed. Exact actions and review limits are in private `alpha122-visual-recovery-internal/live-acceptance.json`.

A subsequent attempt on the same signed source did not establish concurrency. Dinner substitution turn `39a9e978-9280-4732-9ede-378229db091b` failed from 23:10:03.178 to 23:10:33.793 UTC (30.615 seconds): observation and prepare-only browser recovery both returned `permission_denied`, without a connection-recovery marker. Calendar turn `e8d0245f-8d0f-43f8-a427-c1d6f16bbc87` started later, at 23:11:49.255 UTC, and completed at 23:13:16.833 UTC (87.578 seconds). It saved/read back `nov7-museum-outing.ics` (4,908 bytes, SHA-256 `a6b10d0fc43c6553850e41bf3f07809abe7ec88bbc6a871e30361ddd107a15f4`) and `calendar-import-notes.md` (4,787 bytes, SHA-256 `54fb0066319840a47d46e6f2aaf9f66f2644cf230875510847e27e7e6c5a3e0f`). Independent validation checked six non-overlapping tentative events, correct November EST times, CRLF and content-line folding, unique IDs, absence of invitations/alarms/recurrence and preservation of all nine source files. No calendar-app import or rendered Preview was verified. Private `concurrent-attempt.json`, `calendar-validation.json` and `concurrent-baseline.json` retain the evidence in `alpha122-visual-recovery-internal`. CUA input failures prevented the intended overlapping launch and Stop-isolation check.

### Current internal browser-lease trial

Clean source `d2474d021380b3f01f8793b23b429f199380c57e` passed the full pilot rerun (2,075 desktop, 46 Electron, 48 renderer, 72 phone-browser, 223 cloud plus shared/native/build/static checks) and three opt-in real native session probes. Two executable-sandbox tests timed out in the first gate; all 14 passed in isolation and the complete rerun passed unchanged. A Developer ID-signed arm64 QA app passed package/runtime verification at 23:37:57 UTC and was installed at 23:38:26 UTC, ASAR `b05e6d605aa52e9b0157502d3bd9e919d19b9e5ca26124793956471597ce6d28`. Private receipts are in `alpha122-browser-lease-internal`. It is not notarized or a replacement distribution DMG.

The subsequent native handoff trial and a coached coordinate-typing diagnostic both failed to change TextEdit’s filename. Their terminal turns are `a1a815fd-1609-464f-8102-daf1988f314f` (23:51:09.467 UTC) and `cbc567a9-0a5f-43af-aa6f-7c53db13c7e8` (23:57:01.244 UTC), November 2. Both source RTFs remain 1,874 bytes with SHA-256 `bfcd55c3e66d3118ab4b709c667f7ccac3dd5c057b3b3932171690eb40085d14`; no destination file exists. Live `pmset` samples showed no idle-sleep prevention assertion, and an independent IOKit assertion request returned `0xe00002bd`. These failures remain release limitations; neither permission bypass nor delivered input is evidence of a completed native workflow. The same private receipt directory contains the complete action records and preserved-file checks.

An internal keyboard comparison was packaged from local source `f802db3` after the full pilot gate passed (2,075 desktop, 46 Electron, 48 renderer, 72 phone-browser, 223 cloud; 564 native checks passed, one ignored). It was **never installed**: review of the preserved `alpha94-public-key-events/result.json` showed that the same public `CGEventPostToPid` route had already failed. The temporary route and logging were removed, restoring the exact previously tested native patch. `alpha122-keyboard-public-trial` retains the abandoned package receipt, source diff, checks and reason. Earlier `alpha92-key-owner` and `alpha93-event-access` receipts found no process-ID mismatch and confirmed Accessibility/event-posting grants. These observations do not establish a fix; a post-restart check of the unchanged signed QA is next.

After restart, the earlier dinner request failed in 30.681 seconds with a usable Chrome recovery card. The operator selected only the previously approved public USDA window. Sia reconnected and resumed the saved request automatically. Dinner turn `402fd54b-2b82-452a-85d1-83567587ed59` completed from 23:39:54.694 to 23:43:56.459 UTC (**241.765 seconds**). It researched the publisher’s chickpea-curry card and saved/read back `dairy-free-thursday-swap.md` (10,263 bytes, SHA-256 `7750ee76cc69adf468cd5d8041da75d42638f88f9e2353ed53c192da2d777208`). The model corrected its own coconut-milk measurement wording during readback. Independent review checked the publisher’s yield/ingredients, half-batch arithmetic and all replaced grocery allocations against the original weekly plan.

In parallel, outing turn `0110cc8c-3b81-4378-8682-6548dc97b704` was intentionally stopped at 23:40:43.099 UTC. Browser actions continued afterward, including a verified screenshot at 23:40:50.778. Explicit continuation `a04470f7-b585-47f2-97ae-94e87e8ca4a8` completed from 23:40:52.529 to 23:42:00.111 UTC (**67.582 seconds**), fully overlapping the successful dinner turn with interleaved actions. Its `nov7-ready-to-go.md` is 4,405 bytes / 656 whitespace-delimited words, SHA-256 `6493ff3be191e64bd98a0ea0d8a53079f97a6bd94ac6dd6cff2f2601fe0a8dbf`. Independent review checked budget alternatives, normal/late/rain timing reconciliation and inherited-fact caveats. Both attachments opened in Sia Preview; the checklist scrolled correctly. All 11 pre-existing planning-source hashes remained unchanged.

This is one successful browser-plus-file overlap and Stop-isolation trial, including the retained cancellation and operator reconnection. It does not prove two native-app workflows, same-window contention, continuous focus/clipboard preservation, repeatability or a naturally expired 15-minute lease. Exact actions and interventions are in private `live-acceptance.json`; prior hashes are in `source-baseline.json`. Independent read-only AWS downloads verified four automatic batches for the two successful turns: 280 stored records, both prompts, provider-reported usage, action results, capture completion and 12 browser screenshots. Content-addressed hashes and KMS encryption matched. No per-task recording action was used; private `aws-recording-verification.json` retains the receipt.

## Alpha.121 setup evidence

Alpha.121 is the preceding signed and notarized evaluation candidate. Direct Chrome setup explicitly activates Sia and waits for native foreground-process confirmation before resuming; an unconfirmed handoff leaves the request stopped. Broad distribution and Arena acceptance remain open. Nothing has been publicly published or sent to a recipient by this work.

| Identity                   | Value                                                              |
| -------------------------- | ------------------------------------------------------------------ |
| Version                    | `0.1.0-alpha.121`                                                  |
| Source                     | `17ced846eda6002de975fdd460cfd5c38dae3877`, clean at packaging     |
| Universal DMG SHA-256      | `aedcb94f406662b2bef09600a8630f717d298a2aee3526212ec2abc0820705f8` |
| Universal ZIP SHA-256      | `ea432622dd39b12b16fe7a52a9d8b56813dca8caa71911cd86728fccc21c983a` |
| Installed ASAR SHA-256     | `ce38c632ae3252f8f39c6cc4e16ed1772c68dddb87a047d748f266ca9e02c25d` |
| Private evidence directory | `alpha121-browser-return` under Sia Release Verification           |
| Packaging / installation   | November 2, 2026, 18:35:43 / 18:37:06 UTC                          |

Developer ID signing, Apple notarization, stapling, Gatekeeper and packaged-runtime checks passed. Installation used the read-only mounted DMG, verified signatures and compared its ASAR. Apple silicon received runtime verification; Intel received static verification. Live AWS configuration, default recording and managed ElevenLabs remain included without bundled private credentials or the QA profile.

The full local pilot gate passed: 2,026 desktop, 46 Electron, 48 renderer, 72 phone-browser and 223 cloud tests, plus shared/native/build/static checks. All 24 focused handoff/controller checks passed. After the full gate, only root/desktop version metadata and release-status prose changed; the packaged verifier checked the new version. Remote CI run 359 passed for the exact source, including the pilot gates and unsigned universal package verification.

Live acceptance is incomplete. Resetting the external CUA session restored readable UI state after it kept showing an old startup surface. The installed app reached Settings and the Chrome chooser. Choosing an isolated public recipe window was refused because Chrome could not distinguish it from another open window. An attempted distinct-public-page workaround was interrupted by CUA reporting that the user changed Chrome, so operator GUI input stopped. No successful setup-and-resume, completed meal plan, native rename/move or two-task concurrency is claimed. The alpha.120 filename incident remains unresolved; the owner denied typing the unexpected text.

Private receipts: `package.json`, `install.json`, `source-checks.json`, `pilot-gate.log`, `package.log`, `install.log`, `pilot.log` and `live-acceptance.json`. Alpha.120 remains available for rollback.

## Alpha.120 task and filename evidence

Alpha.120 is the preceding signed and notarized evaluation DMG. It includes exact top-level sheet recognition, the memory-review scheduling correction and accurate request-limit guidance, alongside pointer-only visual input. It is not accepted for broad distribution or completed Arena evaluation. Nothing has been publicly published or sent to a recipient by this work.

| Identity                   | Value                                                              |
| -------------------------- | ------------------------------------------------------------------ |
| Version                    | `0.1.0-alpha.120`                                                  |
| Source                     | `9c6b8d8588d0b8768608cbdb332e5883066e5383`, clean at packaging     |
| Universal DMG SHA-256      | `499d264712cdab6b13e343a08423be2d24e4f9c1e24db14cef4a6ba40dcd74de` |
| Universal ZIP SHA-256      | `3d48a02c36b9fe4fa0ffa34083c6d61f532ac223b1f65d3dc0bc94f3e2b664c1` |
| Installed ASAR SHA-256     | `918e9daa0470269c217306d2c22041609a5f987c741eef6f7bd1aa84fa964469` |
| Private evidence directory | `alpha120-sheet-scope` under Sia Release Verification              |
| Packaging / installation   | November 2, 2026, 16:41:15 / 16:42:39 UTC                          |

Developer ID signing, Apple notarization, stapling, Gatekeeper and packaged-runtime checks passed. The app was installed from the read-only mounted DMG with ASAR comparison and signature verification. Live runtime verification was on Apple silicon; Intel received static verification. The DMG contains live AWS configuration without fake services, the QA profile or private credentials. Later documentation commits do not change its source identity.

The full local pilot rerun passed: 2,022 desktop, 46 Electron, 48 renderer, 72 phone-browser and 223 cloud tests, plus native/shared/build/static checks. A native exact-sheet regression failed before the correction; all 82 AX tests pass afterward. The first pilot run failed in the separate real Electron bare-launch fixture with exit 1 and no stderr. Its isolated rerun and full-gate rerun passed; the cause remains undiagnosed and both results are retained. Remote CI run 355 passed for the exact packaged source, including the pilot gates and unsigned universal package verification.

The alpha.120 native handoff ran for **154.066 seconds** (`506f5eb1-0d05-40eb-98b1-f3d0be4474fb`). The Finder sheet still reported unresolved input, but its parent resolved and background navigation reached TextEdit's Name popover. The recorded screenshots did not show either keyboard-only filename write taking effect. Rename/move/reopen did not complete. This is partial routing progress, not acceptance.

External CUA controls recovered after the idle duplicate release copy was quit and the exact QA app restarted; causation is unproven. Later CUA inspection found unexpected uncommitted text in the Name field, different from the earlier Sia screenshots. The owner confirmed they did not type in that field. Its origin and timing remain unresolved; user typing is no longer a supported explanation, and misrouted input or stale capture has not been isolated. The exposed popover Cancel action committed that pending name. The operator restored `Untitled 8 copy.rtf` through TextEdit Rename. Independent reads confirmed that both original and copy are again present with their baseline hashes and that the destination is absent. The recovery is an operator intervention, not a Sia success.

A fresh five-dinner planning task overlapped the native task for **20.260 seconds**, then paused because Chrome was active. It required reconnection to the public test tab and explicit permission to reuse it. Recipe navigation and its follow-up observation timed out; operator CUA's browser reader also timed out. Selecting the loaded Budget Bytes tab restored reading; Chrome displayed high memory use, but the cause of the timeouts is not established. A further continuation read and scrolled the recipe before pausing on Mac sleep. Continue resumed the same turn and then paused again because Chrome was active. `alpha120-weeknight-plan.md` was not created. Two successful concurrent tasks remain unverified.

The initial post-install CUA handle observed Loading Sia, then Ready after reconnection; this is not a measured application startup delay. Lock/unlock and later `noWindowsAvailable` failures are preserved separately from Sia task outcomes. Private `live-acceptance.json`, extracted events and screenshots record each attempt and intervention. The resumed meal turn has two terminal records around its explicit Continue action; these are not two independent successful runs.

On alpha.119, native turn `898c747f-4a3e-4697-89ec-d40264ed17a1` stopped after 57.659 seconds at Finder's Go to Folder sheet with `ax_unresolved`; no rename/move occurred. The subsequent recovery returned a generic HTTP 429, which did not prove exhausted subscription quota. Alpha.120 addresses the corresponding scope and error-label defects, but requires a successful live retry. No successful two-task concurrency is claimed.

Voice and cloud transport evidence below remains from alpha.118/119. Alpha.119 CUA microphone dictation reached Listening and stopped with no speech detected. After the competing development Fn shortcut was disabled, the owner confirmed “mic now works.” Physical Fn and a complete deliberately spoken command have not been independently verified by CUA. Alpha.120 retains the managed AWS ElevenLabs route; no shared key is bundled.

Private receipts: `package.json`, `install.json`, `source-checks.json`, `pilot-first-failed.log`, `launch-focused.log`, `pilot-gate.log`, `sheet-scope-before.log`, `sheet-ax-after.log`, `native-handoff-baseline.json` and `live-acceptance.json`.

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

On the owner’s physical Fn retry, a notification reported that the personal ElevenLabs key lacked access. Process inspection found the old development app and the QA DMG both running Fn helpers. CUA verified that the development copy had Hold Fn enabled, turned that competing shortcut off, and verified the off state. The development Fn helper exited; the QA helper remained. The managed release route prefers configured AWS over the local credential. The owner subsequently confirmed “mic now works.” This is user-reported microphone acceptance; a complete spoken-command round trip was not independently observed. Private screenshot: `alpha119-pointer-only/development-fn-disabled-cua.png`.

## Automated gates and remaining acceptance

The final full `pnpm test:pilot` passed: 2,007 desktop, 46 Electron, 48 renderer, 72 phone-browser and 223 cloud tests, plus native/shared/build/static checks. An earlier run was stopped after the new notice blocked older E2E flows; it is not counted as a pass. Updated tests cover the default selection, opting out and preserving the choice after reload. Remote CI run 345 passed for the exact DMG source revision (`db14166524a0d6fe80c5055fee6209a3bc5c96e7`). The broad native run has a known keep-awake failure, so no all-native pass is claimed.

Remaining broad-release gates are native rename/move/Save/reopen, repeatable Chrome restart/setup/error recovery, two completed simultaneous tasks, continuous focus/clipboard preservation, end-to-end latency and broader Stop/recovery. Off-Space capture remains unreliable. Lock/sleep/voice acceptance and a fresh-account first-use check remain unavailable or incomplete; the host keep-awake assertion fails with `0xe00002bd`. macOS permissions must be granted by the person.

Lawrence Jang is the support/incident owner. Use the concise [release notes](./release-notes.md) for the RA handoff and keep the PR draft until the broader acceptance gates pass.
