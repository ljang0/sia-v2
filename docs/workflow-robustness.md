# Workflow robustness

This is a continuing source and deterministic-test audit of the major user workflows. It is not an
all-app live acceptance result. The public release remains gated by [public-release.md](./public-release.md).

## Shared reliability practices

Personal-account testing must produce shared fixes, rather than defaults tailored to the tester.
Apply these rules to new apps and workflows. Test paths below are relative to
`apps/desktop/src/main`:

| Lesson                                               | Product behavior and regression coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep personal context separate from shared behavior. | Institution, account, preferred sources and working folders come from the person's agent-scoped memory and live app context. Do not embed a tester's identity, campus default, enrollment, credentials or paths in the runtime. `assistant/task-context.test.ts` and `assistant/memory-context.test.ts` check retained context and isolation.                                                                                                                                                             |
| Verify what the request actually requires.           | A live read in the explicitly selected signed-in profile can complete without an unrequested display name. A visible conflict, named-account requirement, uncertain destination or write still requires resolution. The opt-in `actions/account-scope.smoke.test.ts` checks both course inventories and project documents, with and without an account conflict.                                                                                                                                          |
| Treat remembered facts as hints.                     | Reuse established service origins and navigation lessons, then verify current account contents, dates and source coverage. A previous access failure does not prove a current sign-in requirement. Resolve ambiguous names from that person's context; ask when it remains ambiguous.                                                                                                                                                                                                                     |
| Preserve the meaning of a failure.                   | Unreadable, incomplete, stale or ambiguous observations do not establish sign-out or absence. A delivered action followed by a refused read remains delivered but unverified, with a separate observation blocker. Missing Safari tab-bar discovery does not disable an independently verified, unprotected Start Page or its supported navigation routes; refused snapshots grant no input. `actions/computer-browser-navigation.test.ts` and the opt-in Safari recovery probe cover these distinctions. |
| Keep observation and input authority separate.       | Native Safari tab-only reads skip webpage content and grant tab selection plus an explicitly available native Cmd+T route. The new tab needs its own normal snapshot; no other keys or page input are permitted. Sia-hosted typing requires a fresh normal snapshot of an unprotected tab. Neither tab recovery nor another public page authorizes credentials or a protected document.                                                                                                                   |
| Keep concurrent windows and attempts isolated.       | Serialize the whole observation/action transaction per physical window, including supplemental reads and capability publication. Cancelled waiters cannot overtake active work. Explicit continuation receives new execution authority; it cannot revive old input references. `actions/window-operations.test.ts` and `actions/computer-window-order.test.ts` cover those races.                                                                                                                         |
| Protect the person's active work.                    | In strict background mode, production checks macOS's actual frontmost PID, including utility panels. Unknown focus refuses input; a change after delivery preserves uncertainty. Do not restore focus, replay input or exceed the turn's chosen foreground policy. Native helper and `mac/cua-service.test.ts` regressions cover these boundaries.                                                                                                                                                        |
| Grade outcomes rather than tool acknowledgements.    | A click receipt is not proof the requested result happened. Check source coverage, verify semantic results and read back created files. Retain failed attempts. Label synthetic/model probes, file-only results, assisted preparation and real GUI tasks separately; none substitutes for another.                                                                                                                                                                                                        |

These host-tool rules do not claim to enforce the foreground provider's native shell; that route retains its provider approval boundary. The opt-in model probes use fictional accounts and cannot establish live cross-app reliability.
Safari's native PDF viewer can omit both `AXWebArea` and document URL attributes. Its identity
fallback requires the native PDF plugin outside web content, a non-editing native address field,
and the same full HTTP(S) URL in the native window title. It refuses mismatches, credentials,
queries, fragments, missing focus metadata and loading indicators; the existing complete security
scan and exact-window revalidation still apply. Native pure tests cover these boundaries. A
successful identity diagnostic is separate from verifying a complete task or all PDF content.
Native PDF snapshots identify their document kind. Direct address-bar focus or editing is refused
before input, with a supported new-tab alternative: focusing the address field itself removes the
PDF viewer's independent identity. Refusal leaves the current grant usable for Cmd+T; the new tab
must then be observed normally. PDF page reading and observed links remain available. Host
regressions reproduce the identity loss and verify the no-input refusal, preserved grant, new-tab
route and ordinary-page navigation. The opt-in Safari probe also starts from a fictional PDF.
Public access notices must not turn a static article into a claim that the whole account needs
sign-in. The restricted notice path requires explicit signed native proof, excludes non-search
form fields and authentication controls, and returns only text. It withholds search values, all
page refs, images, OCR, pixels and typing. Only scrolling or a fresh new-tab shortcut is permitted;
changed or missing proof revokes that authority. Focused regressions cover real auth controls,
credential markers, contradictory raw fields, changed proof, expected-page binding and withheld
images/field values. It is not an authentication bypass or a full public-page interaction grant.
Normal checks never require a personal account or run those probes at app startup. Real-account
evidence stays outside Git, and research collection requires separate consent. Manual permission,
fresh-install and physical-phone acceptance remain separate gates in [manual-acceptance.md](./manual-acceptance.md).

Match research completion to the requested outcome. A verified suitable option can complete an
open-ended "where can I" request once its required facts and constraints are checked; an optional
blocked directory does not make that answer unfinished. An explicit comparison, requested count,
or "all" still needs every in-scope item, and missing opening hours remain missing when asked for.
The opt-in fictional research-scope probes cover these three boundaries without real app access.
They are model checks, not evidence of completed GUI tasks.

A failed fresh observation cannot preserve older input authority. Starting a native-window
refresh revokes that window's previous snapshot; protection, expected-source mismatch or an
unavailable observation never revives it. Browser preflight also revokes the grant when its
surface changes and refuses input when signed metadata detects authentication controls at the
same URL. A later ordinary page still needs a fresh successful observation. The refusal of an
unsupported action itself is separate: for example, refused PDF address editing preserves its
current grant for the explicitly permitted native new-tab route.

Sanitize links across every observation channel, rather than only the page-location field.
Native and browser titles, control display fields, supplemental document text and OCR omit
credential-bearing URLs. A detected access-bearing link also withholds that snapshot's image
and native pixel authority, preserving otherwise permitted semantic refs. Invisible link-target
metadata alone does not suppress images. Synthetic fixtures exercise meeting passcodes, signed
URLs, userinfo, encoded query keys and nested redirects without reading actual credentials.
This bounded URL rule does not detect arbitrary secrets in images/prose or authorize an
authentication surface; the existing protection checks still apply.
For native-app Use my Mac reads, a structurally marked credential field blocks the whole snapshot,
not just that element. Neighbouring text and controls must not escape an authentication window;
no older grant may survive the refused refresh. Structural role, subrole, input-type and autocomplete
fixtures cover this independently of broad lexical matches in public document prose.

## Repository-wide continuation

The continuation from `fa97fc6` inventories all 880 tracked files, including tests, documentation,
native helpers, infrastructure, scripts and binary assets. Automated coverage includes the full
source gate, text hygiene, script syntax, JSON/YAML/XML parsing, local documentation and site
asset links, and asset signatures. Manual review concentrates on asynchronous lifetime boundaries,
authorization, persistence, cloud jobs and user workflows; this is not a claim that every line was
manually reviewed or that live external services have no defects. The new renderer test brings the
tree to 881 files. The existing domain organization remains appropriate.

The continuation fixes these reproduced failures:

- **Cloud jobs:** a duplicate delivery could take over a live export, abandoned deletion jobs
  could stay stuck, and failed queue submissions could leave deletion permanently pending. Claims
  now compare the saved revision atomically and reclaim only after the configured six-minute
  visibility interval. Queue failures permit retry. An account-deletion request cannot silently
  reuse a research-only request, and worker scope must match the saved job.
- **Research storage:** an uncertain metadata write or a failed competing upload could delete a
  successfully claimed, content-addressed object. Unknown outcomes now preserve the object for
  retry reconciliation, user deletion and the existing retention policy. Definitively losing
  uploads with different content still remove their unclaimed object.
- **Connectors:** delayed refreshes could restore disconnected credentials, and concurrent calls
  could rotate the same refresh token twice. Refreshes now share one request and check the saved
  credential before committing. Cancelled sign-in cannot restore credentials after account lookup.
  Notion reads bounded SSE incrementally and shares initialization, resolving matching replies
  even when the remote stream remains open. All local connector HTTP requests have a timeout.
- **Model relay and transport:** reset now cancels streams and interrupted startup, while the
  JSON-RPC transport handles output failure, synchronous send errors and oversized complete lines.
- **Workspace and task cancellation:** terminal disposal prevents delayed starts, handles closed
  stdin and kills surviving descendants. Undo checks canonical paths against protected locations,
  rechecks staged writes, preserves observed concurrent edits and reports incomplete rollback
  honestly. Already-cancelled turns cannot acquire capacity or computer-control leases.
- **Composer:** late pick/drop/paste results cannot cross conversation or composer lifetimes.
  Returning to the original conversation does not restore an obsolete selection.

Focused regression evidence and the file inventory are retained outside Git under
`release-verification-evidence/repository-audit-continuation` in the parent workspace. These source
changes do not replace the installed signed demo, deploy cloud changes, or establish external
connector, physical-handset or signed-release acceptance.

## Messaging lifecycle and repository audit

The October 12 review starts from `c256f71` on `codex/release-verification`. It examines the domain
layout, renderer/main bridge, local persistence, authentication boundaries, scheduling and task
cancellation, remote messaging, bot transport, release scripts, CI and contributor instructions.
The existing desktop/cloud/package separation and typed controller collaborators remain the
organization to build on; there is no need for a broad directory rewrite. The concrete changes are:

- **Keep renderer state current.** A delayed bootstrap or action response could overwrite a
  newer pushed snapshot, including restoring old conversation data after sign-out. The renderer
  now retains its highest received revision. A deferred-bootstrap regression reproduces the
  sign-out race and verifies that the cleared state stays visible.
- **Revoke pending messaging work.** Voice transcription, result-file reads and queued replies
  previously survived disabling texting, removing a recipient, changing the assistant, signing
  out or disposing the relay. Eleven deterministic cases reproduced those paths. Pending work
  now checks its original route and recipient after asynchronous work and before dispatch or
  delivery. Re-enabling texting does not revive old queued replies. An external send already
  handed to Messages or a bot cannot be recalled by this guard.
- **Bind YES to delivered, complete details.** An approval becomes answerable by text only after
  its notice was sent successfully. If its content or summary would be shortened, review stays
  on the Mac. Tests cover failed delivery and both shortening cases alongside the existing
  exact-request and stale-YES checks.
- **Keep bot lifetimes explicit.** A late bot-token verification cannot reconnect a disconnected
  bot. Discord gateway discovery and retry timers stop with their owning connection; late
  downloads cannot deliver into a stopped channel. Attachment messages keep arrival order, so
  a follow-up cannot overtake the photo it refers to.
- **Bound downloads while reading.** Telegram and Discord now stop and cancel response streams
  at the 20 MB limit, including chunked responses or inaccurate Content-Length metadata. Previously
  the entire body was allocated before the size check. Network operations also have timeouts.
- **Use one pilot gate.** `pnpm test:pilot` includes the Chromium/WebKit phone checks; CI invokes
  that same command without rebuilding the entire workspace again for Electron E2E. The focused
  `pnpm test:remote` alias is available from the repository root. Contributor instructions and
  README now match the API-key option, Mac setup requirements, disabled connectors and phone
  approval behavior.
- **Patch the dependency graph.** Electron moves from 43.4.0 to 43.5.0, and the Vitest workspaces
  share the patched 4.1 line instead of mixing versions 3 and 4. Narrow overrides keep vulnerable
  transitive parsers, HTTP clients and build utilities on patched releases within their existing
  major lines. The registry audit fell from 29 high / 2 critical / 15 moderate / 4 low findings to
  zero high, critical or low and one moderate finding. CI runs `pnpm audit:dependencies` separately
  from the deterministic pilot gate. Package test commands explicitly select `src`, so Vitest 4
  does not also execute the compiled copies under `dist` and double the test counts.

The remaining [sprintf-js precision advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)
is in electron-builder's optional downloader logging chain (`@electron/get → global-agent →
roarr → sprintf-js`), not Sia's production dependency set. On October 12 the registry still lists
1.1.3 as the newest published version, and the upstream advisory lists no patched release. Do not
hide it with an audit exclusion or pin the nonexistent 1.1.4 suggested by the audit metadata.
The Electron update also covers the upstream
[sandboxed-preload cache advisory](https://github.com/electron/electron/security/advisories/GHSA-qmv3-fv6v-rmhq).

The final `pnpm test:pilot` passed with the updated dependency graph: build, formatting, lint,
quality guard, types, 168 cloud tests, 143 shared-package tests, 1,234 desktop unit tests,
45 Electron tests, 20 renderer tests and 62 phone-browser tests across Chromium and WebKit.
Native screenshot/permission helpers and all six synthetic Fn scenarios also passed. Six runtime,
seven desktop and four live Electron tests remain opt-in/skipped. This pass adds 19 regression
cases across the renderer, messaging relay and bot transports. The frozen-lockfile install and
`pnpm audit:dependencies` also passed. `pnpm package:mac:dir` built the unsigned universal app
with Electron 43.5.0 and passed its packaged architecture, native dependency, tool-bridge and
license-resource checks. Logs and before/after evidence are retained outside the
repository under `release-verification-evidence/code-audit-2026-10-12` in the parent workspace.

These changes are source fixes, not a replacement for signed-app or external-service acceptance.
The installed Arena demo remains the separately verified alpha.25 runtime from `32a916c` until a
new candidate is built, signed and rehearsed. Telegram/Discord live acceptance still requires
configured test bots; physical-handset actions remain a separate release gate.

## Responsiveness and compact UI

The local Codex reference was inspected read-only at
`/Applications/ChatGPT.app/Contents/Resources/app.asar`: package
`openai-codex-electron` version `26.915.31945`. Its bundled shared CSS defines a 46px
toolbar, 14px base text and a 4px spacing unit. This is an implementation reference, not a
measured speed comparison. No Codex account data or application state was exported.
The [official App Server lifecycle](https://learn.chatgpt.com/docs/app-server) uses a persistent
connection and thread with streamed turns. Sia already reuses matching sessions; it does not
restart a provider for each follow-up.

- **Codex startup:** concurrent callers now wait for the same complete handshake. Failed
  initialization disposes its peer and the next request starts a fresh one. Session reset remains
  reusable; a late pre-reset factory cannot install its old connection over the replacement.
  Linked JSON-RPC peer tests reproduce both original failures and exercise reset recovery.
- **Streaming:** renderer updates publish at a 50ms cadence; full encrypted state is checkpointed
  every 2s while streaming. Composer drafts persist after 500ms. Completion, non-streaming changes
  and graceful shutdown persist immediately. An abrupt process/OS failure can lose the latest
  checkpoint interval of unfinished text or drafts. See the current ownership rules in
  [architecture](./architecture.md#state-ownership).
- **Task preparation:** initialize the provider before acquiring the GUI lease, and acquire fresh
  screen context after ownership. A competing-turn regression proves preparation can proceed
  while another task owns the screen, without permitting an early action. Duplicate memory-vault
  initialization was removed. The whole action loop remains exclusive; this is not parallel GUI
  control or a guarantee that an app never activates itself.

| Before                                                                   | After                                                                          | Why                                                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| 284px sidebar and 76px chat header                                       | 260px sidebar and 58px header                                                  | More room for the task without shrinking the conversation text.                            |
| 54px top gap, 30px event gaps and 28px composer bottom padding           | 28px, 22px and 16px respectively; smaller composer padding                     | Less chrome and scrolling at the minimum 960×640 window.                                   |
| Large empty-thread artwork with automatic bottom scrolling               | Compact artwork; an empty conversation starts at the top                       | The welcome and suggested starts remain accessible instead of opening clipped.             |
| Failure reason repeated in the answer, banner and timeline notice        | Keep the answer, status and Continue control; suppress identical repeated text | Preserve the reason and recovery action with less clutter. Distinct errors remain visible. |
| Smooth scrolling on every keyboard find match                            | Immediate keyboard search navigation                                           | Repeated find commands do not queue animations.                                            |
| Oversized Settings header/navigation/content padding                     | Reduced shell and content spacing                                              | Expose more settings while retaining category labels and row control spacing.              |
| Scotty’s oversized welcome artwork placed its main action below the fold | Compact preview and copy, followed immediately by the main action              | The primary button is visible at 960×640, with size and animation controls directly below. |
| Four always-visible icons for Goal, Changes, Command and Schedules       | One labelled Tools menu with the same actions                                  | Keep occasional utilities out of the everyday chat path.                                   |
| Send feedback occupies a permanent sidebar row                           | Feedback lives in Settings → More → About and the existing quick switcher      | Keep help reachable without a competing primary navigation item.                           |

The refreshed visual baselines cover light/dark conversation, Settings, connections, quick switcher,
agent dialog and Activity. The minimum-window check asserts usable conversation height, visible
composer and an unclipped empty state. Screenshots wait for idle rather than the transient completion
animation. The Tools menu uses labelled, keyboard-accessible items and returns focus to its trigger
when a utility closes. Chat, attachments, voice and Stop remain direct controls. No additional
product feature, permission or service was introduced. Full verification status is recorded below.

The deterministic Electron harness disables background animation throttling only in fake-service
fixtures and bounds page-close cleanup before terminating its own test process. Real app probes
retain production window behavior. The launcher-result screenshot stalled again after its functional
assertions passed. The launcher hides on blur; its result artifacts now use Electron's native
`capturePage` with `stayHidden`, which supports hidden windows, and reject empty images. The complete
launcher fixture passed afterward (3.0s), and both light/dark artifacts were visually inspected.
The production launcher and its blur behavior are unchanged. The earlier timeout is retained as a
failed gate; its exact window visibility at the timeout was not recorded.

The real profile was visibly checked: Codex plan connected; Use my Mac with Work in background,
Allow brief foreground control and Bypass action approvals enabled; Accessibility and Screen
Recording allowed. Sia opened after the earlier Keychain handoff. The initial two real, manually
submitted Codex turns exercised only public Example Domain/IANA pages:

| Test                                                       | Observed result                                                                                                                                                                                           | Timing from accepted user message                                                   |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Open example.com, inspect it and click Learn more          | Exact-window read returned Example Domain; background accessibility click reached Example Domains at `https://www.iana.org/help/example-domains`. Independently confirmed through the browser UI.         | 40.6s to completion; first browser inventory at 6.9s, first page snapshot at 13.8s. |
| Reuse the IANA tab and click IANA-managed Reserved Domains | Background click was delivered. Sia's next read refused the window as protected. Independent browser observation subsequently confirmed the correct reserved-domains page. This turn failed verification. | First assistant response at 7.7s; failed turn finished at 40.5s.                    |

Both turns used background action delivery. Chrome became active during the first open and was
already active during the follow-up. Neither is proof of uninterrupted background use while the
person works in another app. Chrome/Slack across Spaces, minimized/fullscreen windows and
cold/warm speed comparisons remain unverified. No real messages were sent or app permissions changed.
Exact diagnostic evidence: local trajectory `be1e1505-dcea-4a52-a5ec-95a948e1c5fc`, September 24,
21:00:53–21:06:14 UTC. This is a live development-build check, not signed-release acceptance.

The refusal investigation found a reproducible matcher defect: `sign.?in` matched the start of
“Signing,” and `log.?in` matched part of “Blogging.” The public
[IANA page](https://www.iana.org/domains/reserved) has “Root Key Signing Key (DNSSEC)” and
“Key Signing Ceremonies” links. Replaying those labels through the actual action backend reproduced
`protected_window`; word boundaries now permit them, while tests retain sign-in, login, signing-in
progress and secure-field protection. The recorded refusal does not include its matched label, so
this is a source-confirmed explanation consistent with the observed page, rather than a captured
native reason. After the user reported Keychain approval, Sia was confirmed open and three more
public-page turns ran on the corrected build:

- At 21:38:50 UTC, IANA reserved domains was read successfully, including a fresh exact page URL
  and the “Root Key Signing Key (DNSSEC)” text. The previous false protection block did not recur.
  The real UI showed Getting ready complete while the turn was still running. Chrome was inactive
  before opening, briefly active afterward, and inactive at the end. CUA returned `ax_unresolved`
  with all three background input routes refused; no click was sent. This failed turn took 50.7s.
- At 21:43:07 UTC, a follow-up targeting the existing page stopped with an expected-URL mismatch;
  the test window no longer showed IANA. It did not read the replacement page or click elsewhere.
  This demonstrates stale-target rejection, not successful foreground recovery.
- At 21:44:44 UTC, a continuous open/read/click attempt opened the public page but its first exact
  read failed with `session_ended`; no click was sent. The reusable provider conversation had also
  been used as the CUA session label. A terminal driver session then poisoned later requests.

The then-installed CUA 0.21.0 source was inspected at commit
`70db98d1bcd92890d778f4978e0eb107a4b66c1b`:
[`ax/exact_target.rs`](https://github.com/trycua/cua/blob/70db98d1bcd92890d778f4978e0eb107a4b66c1b/libs/cua-driver/rust/crates/platform-macos/src/ax/exact_target.rs)
requires the exact native id in fresh `AXWindows` membership. Its `get_window_state` deliberately
returns observation-only state when that identity is unresolved, because input could reach another
window owned by the same process. Sia's supplemental native reader resolving the page does not
establish a safe CUA input route. No driver guard was bypassed in those checks. The subsequent
background reliability work upgrades the SDK and both Mac native libraries to 0.37.0 after an
isolated comparison resolved the same test window and delivered an exact background click. Sia
requests structured controls and route metadata explicitly and uses the current token-only input
contract. The 100-task matrix in [demo acceptance](./demo.md#background-reliability-matrix) keeps
native-driver results separate from simulated observations and retains failed attempts.

Native computer sessions are now scoped to each active turn with a fresh opaque label, while Codex
conversation reuse and explicitly attached browser sessions retain their own lifetimes. New turns
revoke old refs before resolving targets; cancelled old callers cannot revoke current refs. The
regression simulates the prior session ending, proves fresh read/click success on the next turn,
and verifies old refs cannot post input. After the full gate passed, the idle app was quit and
reopened into the rebuilt source. A one-second process sample initially confirmed the main process
waiting in `SecItemCopyMatching` / `SecKeychainItemCopyContent`
(`/private/tmp/sia-session-startup.sample`). On the next continuation, Sia was confirmed open;
that Keychain handoff is no longer pending.

Two additional turns ran on the rebuilt app at 22:24:19 and 22:26:30 UTC. The first opened IANA,
but both exact-URL checks rejected the subsequently changed page and withheld its content; no
click was sent (32.3s). The second found no IANA-titled native window and stopped before reading
content (9.7s). An independently prepared public tab remained readable through the browser tool.
The operator then confirmed using Chrome during the test. These runs therefore do not isolate
window-matching behavior, nor do they exercise the corrected native capture session successfully.
After the operator confirmed readiness, a steady-window repeat at 23:11:43 UTC found the
IANA window after opening, but exact-page inspection returned `protected_window` (27.6s). No click
was sent. The recorded result contains no matched protection label, so the cause remains unresolved.
True background clicking in this case and brief foreground recovery remain unproven. Do not infer a native driver regression or a
successful session recovery from these two interrupted tests.

The same live run exposed a misleading progress label: `runtime.start` stayed running for the whole
turn, so the header fell back to “Getting ready” between browser actions. It now completes when the
provider first begins visible work; the tool activity remains running until its own result. A gated
runtime regression proves these two lifetimes separately. No new UI controls were added.

## Consumer UI cleanup

A second pass removes visual clutter from the ordinary chat and settings path:

| Before                                                                          | After                                                                                                                                          |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent-colored header text and red failed-step text read like a persistent error | Neutral chat headers, activity labels, notices and composer errors; failure icons, explanatory text and Continue controls remain explicit      |
| Nine regular Settings categories, plus administrator pages                      | Scotty and Phone remote are primary; Appearance and About live under More. Connections also lives under More in Use my Mac.                    |
| Chrome attachment and website launch controls repeated in Computer              | Connections is the single browser attachment route; Computer links to it in Connected apps mode.                                               |
| Repeated implementation and access-mode explanations                            | Short descriptions alongside the controls they explain; permission status and setup stay visible                                               |
| Full local-log controls compete with everyday settings                          | Diagnostics disclosure, with the current local-log state visible in its summary                                                                |
| Voice setup and unavailable Fn controls remain prominent                        | Connected voice omits the setup button; unavailable Fn controls are absent unless already enabled; refresh/disconnect live under Manage voices |
| Long research policy text occupies the Privacy page                             | Research status and consent controls stay direct; the full explanation is available in a disclosure                                            |

Phone remote is explicitly labelled a preview on its page. This pass changes presentation and
navigation, not users' permissions, stored feature choices, research consent or automatic approvals.
Optional feature backends and existing saved data are retained. The assistant library remains
available under More; removing or graduating those capabilities is a separate product decision.
The existing recovery fixture now checks neutral failure text and distinct error icons in both
color schemes, while retaining its no-replay and stale-request checks. Keyboard menu navigation,
small-window layouts, zoom, onboarding, memory workflows and admin access are exercised through
the real renderer with deterministic services. Updated final gate results are recorded below.

## Defects corrected in this pass

| Priority | Failure                                                                                                                                         | Correction and regression evidence                                                                                                                                                                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | A successful token refresh arriving after sign-out could restore the old account. A rejected old refresh could erase a newly signed-in account. | `identity.ts`: authentication generations, exact token ownership and ownership-aware refresh deduplication. `identity.test.ts` exercises delayed success after sign-out and delayed rejection after account switch.                                                           |
| P1       | Email verification arriving after sign-out could sign the person back in.                                                                       | Pending challenge ownership checks after network responses; generation checks around sign-in and MFA enrollment. A delayed email challenge regression exercises the real manager and repository. Password/MFA guards also typecheck; their existing normal-path tests remain. |
| P1       | Disconnecting voice while its catalog or token request was pending could enable voice again or send text/audio afterward.                       | `voice-service.ts`: abort the service lifetime, reject stale responses before provider I/O, and prevent use after disposal. Regression tests cover catalog, realtime STT, batch STT and TTS token races.                                                                      |
| P1       | Speech generation sockets survived disposal, and controller sign-out did not disconnect voice.                                                  | Track and close speech sockets. Disconnect voice at sign-out/account deletion. Regressions cover disposal and controller sign-out. The existing renderer tests cover ending listening/loading/playback.                                                                       |
| P1       | A fresh real Mac selected Apple speech even when shared ElevenLabs was configured.                                                              | `voice-factory.ts` makes cloud-configured builds use included ElevenLabs. Factory tests configure the actual service both with and without a device credential, and retain native fallback for local builds without cloud configuration.                                      |

Nine new regression cases failed before their corresponding fixes. Three additional service-selection
cases cover the new default. Pending review and test results are recorded below rather than inferred
from implementation.

## Remaining priorities

### P0 — Public distribution evidence

The candidate is signed, but is not notarized or a published installer. A new Sia profile on the
operator's Mac reuses existing OS grants, Keychain and Codex state. It cannot establish the experience
of an unrelated recipient. Complete the notarization, public email and clean-Mac gates in
[public-release.md](./public-release.md), then test that exact downloaded artifact and its upgrade
from the previous signed release. Keep blocked production login-lifetime/email changes separate.

### P1 — Shared voice capacity and lifecycle

- The server has authenticated minting, a per-user UTC-day limit and API Gateway throttling
  (`apps/cloud/src/services.ts`, `aws.ts`, `infra/template.yaml`). The current limit is 20 token
  requests per user per day. This is **not a global monetary ceiling**. Add an account-wide budget,
  concurrency limits and operator alerts before unrestricted public growth. A conversational
  exchange usually needs both a transcription and speech token; expose remaining usage and a
  useful reset/retry message in Settings rather than an unexplained failure.
- The provider catalog reads the first 50 name-sorted voices (`ElevenLabsHttpProvider.catalog`).
  An allowlisted voice outside that page disappears. Implement bounded pagination or exact voice
  lookup and regressions for later-page voices, duplicate cursors and an empty allowlist.
- A voice allowlist filters the catalog. It does not constrain arbitrary client use of a minted
  native token. A strict per-request audio/text/voice budget requires provider-enforced restrictions
  or a metered relay. Do not describe client character limits as server-side spend enforcement.
- The current refresh no longer restores a removed selected voice into a new server catalog.
  The removed-voice case has a regression; add empty-catalog and expired-token tests. An outage should preserve
  a usable saved preference while honestly displaying availability.
- Run physical microphone/Fn tests on the packaged app: rapid start/stop, quiet speech, denied
  microphone, unplugged headset, network loss, sleep/wake and quota exhaustion. The earlier live
  synthetic ElevenLabs round trip did not exercise the microphone or OS shortcut.

[ElevenLabs' token contract](https://elevenlabs.io/docs/api-reference/tokens/create) provides
single-use tokens for the three supported operations with a 15-minute expiry. Sia keeps the
long-lived operator key in AWS Secrets Manager; the renderer never receives it. Shared-service
activation and verification status are recorded below.

### P1 — Background computer use and uncertain writes

`cua-service.ts` bounds driver calls, cancels queued work, retires hung drivers, and renews only
unscoped read-only inventory. The action backend (`main/actions/`) checks exact window identity, supported delivery
routes and explicit foreground fallback. Preserve these restrictions.

The remaining gap is live acceptance across Spaces, minimized windows and multiple Slack/browser
windows. Test both “Pause and tell me” and permitted brief foreground recovery. Require a fresh
observation of the intended window and visible completion evidence. A driver reporting that input
was delivered does not prove a message was sent or the intended page changed.

`task-recovery.ts` asks the model to inspect before repeating writes; that instruction is not a
durable action deduplication system. Add a receipt keyed to an external write and verify the
remote result before offering a retry when the acknowledgement is lost. Test a crash immediately
after the remote write. Never automatically replay an uncertain send/upload.

### P1 — Phone remote transport

`phone-remote.ts` binds a local network address, checks origin/host/token, invalidates rotated links,
and deduplicates recent request IDs. Its pairing URL and traffic use HTTP. On an untrusted LAN,
transport confidentiality is not established. Add an authenticated encrypted channel (or confine
this preview to a trusted network) before marketing it as general remote access. Test a real phone
through network changes, link rotation, lock/unlock and a lost response. Existing HTTP fixture tests
do not establish transport secrecy or real Wi-Fi reliability.

### P2 — Recovery and consumer clarity

- **Authentication:** deployment still needs an approved session-lifetime decision. Keep offline
  refresh failures recoverable, and distinguish expired/revoked credentials from temporary outages.
  Test overlapping new sign-ins, delayed cloud feature responses and logout during account setup.
- **Onboarding:** a single setup entry can guide OS approvals, but cannot guarantee that macOS will
  collapse them into one dialog. Test each denial and cancellation on a fresh account, status changes
  after returning from Settings, and restart mid-setup. Verify Codex install/update with no existing
  binary, interrupted network and browser login cancelled/expired. Use the pinned admitted release.
- **Schedules/goals:** schedules persist a claim before dispatch, keep stable run IDs and optional
  run limits, but require Sia open and the Mac awake (`controller/schedules.ts`). Test wake across a due time,
  timezone/DST changes, overlapping long tasks and crashes on each side of dispatch. Day-based
  cadences (daily, weekdays, chosen days) step local calendar days, so 8:00 AM stays 8:00 AM across
  DST (`shared/schedule-cadence.ts`). A run missed while the Mac slept runs once on wake, then later
  missed runs are skipped rather than replayed; do not promise an offline cloud worker.
- **Connectors:** OAuth polling checks pending connection identity and tolerates temporary outages.
  Verify real Google token revocation and Slack workspace switching with disposable accounts.
  Cohort restrictions and Google verification remain separate public-release gates. Browser fallback
  availability is not proof that a connector request succeeded.
- **Updates:** the signed manifest verifies metadata, but `#openUpdateDownload` opens a DMG link.
  Sia app updates are not yet an install-and-relaunch flow. Keep this distinct from the existing
  one-button managed Codex installer, which verifies its archive and switches versions atomically.
- **Storage:** encrypted records and unreadable database preservation have fixtures. Test disk-full,
  locked Keychain and update continuity on a signed recipient build. Recovery must explain where
  preserved data lives; do not silently equate a fresh database with successful restoration.

## Workflow coverage and next acceptance

| Workflow                                      | Code paths examined / existing checks                                                                                                 | What remains to prove live                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Install, Codex setup and permissions          | `index.ts`, `codex-installer.ts`, discovery/probe, controller setup; archive tamper/wrong-version/idempotency and onboarding fixtures | Clean Mac download, browser sign-in, each denied OS permission, resumable interrupted setup      |
| Sia login, MFA and logout                     | `identity.ts`, controller identity boundary, encrypted repository; normal auth/MFA and new stale-response regressions                 | Fresh recipient email, revocation and upgrade continuity; approved long-lived session deployment |
| Typed chat, cancel and continue               | Controller turn loop, `runtime-coordinator.ts`, `task-recovery.ts`; leases, approval revocation, failed-turn recovery tests           | Provider exit mid-action, exactly-once recovery of external writes                               |
| Dictation, voice conversation and read aloud  | Renderer voice lifecycle, `voice-service.ts`, factory, push-to-talk/native helper; new lifecycle regressions                          | Physical audio devices and sleep/wake; authenticated synthetic shared-voice round trip passed    |
| Foreground/background desktop and browser     | CUA queue, action backend and native exact-window matching; bounded-call and synthetic geometry tests                                 | Chrome/Slack across Spaces, minimized/full-screen windows, no-op clicks and recovery             |
| Google, Slack and Messages                    | Controller connection polling/ownership, cloud services and typed action gateway; OAuth and scope fixtures                            | Disposable-account reconnect/revoke, Slack multiple workspaces, Messages Full Disk Access        |
| Files, attachments, Git and commands          | `main/workspace/`; real Git fixtures, path/symlink guards, snapshots, bounded output and process-group cancellation                   | Interrupted large file operations, disk pressure and packaged helper behavior                    |
| Schedules, goals and activity                 | Persisted schedule claims/history, optional run limits, thread completion and notification paths                                      | Sleep, restart, DST and long-running overlap                                                     |
| Phone remote                                  | `phone-remote.ts`; replay, stale-command, rotation, lock and path tests                                                               | Encrypted transport and physical-phone/network acceptance                                        |
| Memory, skills and Scotty                     | Controller/shared task routes and existing assistant/Scotty suites; no separate authority path                                        | Stale tray controls, multiple displays and fullscreen interactions on the packaged app           |
| Research export/deletion and account deletion | Controller generation-bound sync, cloud services; retryable outbox and deletion/export fixtures                                       | Partial AWS failures, actual alarms, operator-reviewed production evidence                       |
| Updates and public download                   | Signed manifest, release identity and public artifact staging guards                                                                  | Notarized recipient install/upgrade, published digest and download verification                  |

## Verification record

- Consumer UI cleanup: the complete `pnpm test:pilot` passed, including build, formatting,
  quality, type checks, **720 desktop tests (6 explicit skips), 52 runtime tests (6 explicit
  skips), 135 cloud tests**, other package/native gates, and **46 UI tests (4 explicit live
  skips)**. Log: `/private/tmp/sia-consumer-ui-pilot.log`. Earlier focused runs exposed a
  persisted-fixture status mismatch and a color assertion during a theme transition; the fixture
  now uses the actual failed-state schema and waits for the final color. Both themes retain
  explicit failure icons and recovery actions. Recovery, Computer, Voice, Assistant and Privacy
  screenshots were visually inspected. The idle real app was refreshed through View → Reload;
  the six primary Settings categories and More menu are present, ElevenLabs reports ready, and
  the enabled Fn controls remain visible. This was a read-only voice UI check, not a microphone
  or provider round trip. No permissions, voice preferences or account state were changed.

- Computer-session lifecycle: the new later-turn regression failed on the prior implementation,
  then the action-backend and CUA-service suites passed together (141 tests), including stale refs,
  no replay, and a late cancellation. Logs: `/private/tmp/sia-computer-session-before.log` and
  `/private/tmp/sia-computer-session-after.log`. The complete `pnpm test:pilot` passed: build,
  formatting, quality, type checks, **720 desktop tests (6 explicit skips), 52 runtime tests
  (6 explicit skips), 135 cloud tests**, other package/native gates, and **46 UI tests
  (4 explicit live skips)**. Log: `/private/tmp/sia-computer-session-pilot.log`. The new source
  is built locally; no signed candidate was replaced or published.

- Browser refusal and progress corrections: the regressions failed before the fixes. The full
  controller suite then passed (121 tests), and the full action-backend suite passed (120 tests,
  including 13 public-text/authentication cases). Logs: `/private/tmp/sia-progress-before.log`,
  `/private/tmp/sia-progress-after.log`, `/private/tmp/sia-signing-before.log`, and
  `/private/tmp/sia-signing-after.log`. The first complete pilot run passed all source gates
  (719 desktop tests, 6 explicit skips) and 45 UI tests, with 4 explicit live skips, but failed at the
  launcher-result screenshot. Log: `/private/tmp/sia-browser-progress-pilot.log`. The launcher capture
  correction passed its complete fixture (`/private/tmp/sia-launcher-native-capture.log`). The final
  complete `pnpm test:pilot` rerun passed: build, formatting, quality, type checks, **719 desktop tests
  (6 explicit skips), 52 runtime tests (6 explicit skips), 135 cloud tests**, other package/native
  gates, and **46 UI tests (4 explicit live skips)**. Log:
  `/private/tmp/sia-browser-progress-pilot-final.log`. The fixed source is built in `apps/desktop/out`;
  the signed public candidate still predates these changes. No deployment or release was made.

- Simplified navigation: the complete `pnpm test:pilot` passed before the latest browser/progress corrections, including
  build, formatting, quality, type checks, 705 desktop tests (6 explicit skips), 52 runtime tests
  (6 explicit skips), the cloud/native/package gates, and **46 UI tests (4 explicit live skips)**.
  The menu is exercised through actual clicks and keyboard navigation at 960×640, including focus
  return after closing each utility. Feedback opens from About; the sidebar no longer exposes it.
  Git changes, command execution, background terminals, goals and schedules remain covered through
  the Tools menu. Current light/dark conversation, Settings and Activity screenshots were inspected.
  Log: `/private/tmp/sia-simplify-pilot-final.log`. Earlier attempts exposed a test menu-name mismatch
  and an obsolete CSS assertion requiring icon-only toolbar labels; those tests were corrected,
  while the real viewport and keyboard assertions were retained. That deterministic run made no real
  provider turn or permission change; the subsequent real browser tests are recorded above.

- Responsiveness/compactness source: the final `pnpm check` portion passed, including build,
  formatting, quality guard, type checks, 705 desktop unit/component tests (6 explicit skips),
  52 runtime tests (6 explicit skips), the cloud, action-gateway, tool-bridge and native gates.
  That `pnpm test:pilot` invocation finished with 45 UI tests passed, 4 explicit real-service skips,
  and a launcher-result screenshot timeout. The isolated launcher rerun passed, followed by a
  complete UI rerun on the same product source: **46 passed, 4 explicit real-service skips**.
  Thus the final source checks and complete deterministic UI gate passed across those runs;
  the earlier timeout was not reclassified. Logs: `/private/tmp/sia-speed-pilot-verified.log`,
  `/private/tmp/sia-launcher-diagnostic.log`, and `/private/tmp/sia-speed-ui-final.log`.
  The new screenshots were inspected across the minimum-window Settings pages, conversation,
  Activity, switcher and agent dialog; Scotty’s primary action and the empty-thread heading are
  visible. Live acceptance remains incomplete for the reasons recorded above. These changes are
  built in `apps/desktop/out`; the previously signed candidate below predates this responsiveness pass.

- Merged Romir changes through `148b452` with the robustness checkpoint `1fa1528`.
  The combined `pnpm test:pilot` passed: 702 desktop unit/component tests (6 explicit skips),
  135 cloud tests, 46 desktop/phone UI tests (4 explicit live skips), and the runtime,
  action-gateway, tool-bridge, native, build, formatting and type gates.
  The UI harness now observes the real setup shutdown and reopens the same disposable profile;
  only Electron’s detached relaunch and process-local fake OS grants are controlled by the fixture.
  It verifies persisted setup completion, relaunch, replay without duplicate agents, and settings
  layouts. This is not a real macOS permission-dialog or OS relaunch acceptance result.

- Before fixes: eight focused identity/voice cases failed; controller sign-out added a ninth failure.
- After initial fixes: 22 focused identity/voice tests passed. Full `pnpm test:pilot` passed: 696 desktop unit/component tests (6 explicit skips),
  135 cloud tests and 46 desktop/phone UI tests (4 explicit live skips), plus runtime,
  action-gateway, tool-bridge, native, formatting, build and type checks. A subsequently added
  removed-voice regression is verified separately; no product source changed after that full gate.
- Shared voice: after destination-specific approval, the saved operator key was transferred to
  Sia AWS Secrets Manager in `us-east-1`. The approved change changed only `EnableHostedVoice`
  to `true`; the `sia-alpha` stack reached `UPDATE_COMPLETE` on September 24, 2026. The existing
  limit remains 20 token mints per signed-in user per day. No session-lifetime or email-sender
  configuration was changed.
- Authenticated shared voice passed using the existing encrypted Sia sign-in, with the original
  profile opened read-only and temporary auth state held only in an encrypted in-memory store.
  The deployed catalog returned 21 voices and all three token types. The actual desktop
  `CloudClient` and `ElevenLabsVoiceService` generated a synthetic sentence and recovered it
  through both batch and realtime transcription; recording cancellation passed. The speech
  round trip took 3.59 seconds. An anonymous catalog request returned HTTP 401. This proves
  the deployed account/broker/provider path, not physical microphone or packaged UI behavior.
- The merged universal signed candidate is
  `apps/desktop/release/robustness/mac-universal/Sia.app`. Strict nested code-signature verification
  passed; the app and native helper contain both x86_64 and arm64. Its `app.asar` SHA-256 is
  `3e7de63c0440e98adc55c4cc6ded13faecc739416f02cfd84eadb4c242e47412`.
  It was launched with a separate empty profile, stayed running beyond the startup/update-check
  window, and visibly reached the real email sign-in screen. The secure-storage page was shown
  during startup; this observation does not establish the absence of an OS Keychain prompt.
  No sign-in or physical-microphone action was performed in this candidate. It is not notarized
  or published; the existing walkthrough app/profile remains unchanged.
- Final focused identity/voice/factory suite: 26 tests passed, including the removed-voice regression.
- No model-backed turns, real messages, private microphone capture or public publication were run
  during this audit. The approved synthetic voice check made paid ElevenLabs requests. No third-party key is included in source, fixtures or documentation.
