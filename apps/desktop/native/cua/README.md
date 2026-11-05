# Cua Driver patches

Sia uses the upstream TypeScript API and Node runtime at **0.38.0**. Its macOS SDK is
built from the exact source revision in `upstream.json`, with one
[reviewable patch](../../../../patches/cua-driver-0.38.0-chrome-consent.patch).
The two `packages/cua-driver-darwin-*` workspace packages replace only upstream's
platform SDK packages. Development and packaged apps resolve those same packages.
No binaries or upstream checkout are committed.

## Why

With multiple Chrome windows, the original consent handler repeated a native accessibility
walk for each window. An observed scan took 7.7 seconds despite a four-second deadline;
the first walk had already found the native consent sheet. The patch walks Chrome's
native application surfaces once and omits the menu bar. Web content remains excluded.
The approved window must still belong to the approved process; exact native-sheet identity,
ambiguous-button rejection, truncation refusal and post-click disappearance checks remain.
It does not grant macOS permissions, change Chrome's setting, expand browser scope, or
remove the consent deadline. The bounded attempt now allows eight seconds: a signed-app
scan took 3.8 seconds before the exact action and another 2.0 seconds to confirm disappearance,
leaving the original four-second cutoff too close to ordinary scan latency. Optional
`SIA_CUA_CONSENT_DIAGNOSTICS=1` logs only scan timings, counts and booleans for QA.
The initial engineering probe connected in 1.7 seconds;
repeatability and exact release acceptance remain separate gates.

The core connection caller must also allow that platform budget. It previously cancelled an
unstarted consent scan after four seconds, before macOS's eight-second attempt could finish.
A regression reproduced that exact refusal with a 4.1-second scan. The caller now allows ten
seconds for observation and always bounds the subsequent socket handshake to four seconds.
Committed native consent work still settles before teardown, and rejected, ambiguous or revoked
consent remains a refusal. This fixes the reproduced deadline mismatch; live restart recovery on
the newly signed artifact still has to pass.

A subsequent timed signed-app comparison found the native consent sheet through operator CUA
five seconds into setup while the driver reported no prompt throughout its eight-second scan.
When the application-child/window walk finds no consent sheet, the host now also inspects
`AXFocusedWindow`, but only if it is a native `AXSheet` owned by the already-approved process.
It applies the same web-content exclusion, size limits, exact prompt/button matcher and settlement
checks. The fallback is read-only until those existing consent checks authorize the exact action;
it neither changes focus nor supplies an accessibility tree to the model. A native matcher test
covers the observed standalone-sheet shape and rejects a web-content imitation. The full pilot
gate passed. A signed commute-card retry on `7fe2089` exercised this fallback:
the diagnostic reported a focused native sheet and accepted consent settled in 143 ms. An earlier
retry used only the ordinary walk. The later run required sleep/focus recovery before continuation,
so repeatable unattended recovery remains unproved.

Chrome 156 exposed a separate fast-scan failure: the native sheet was found in 9 ms, but
100 ms action retries left it open until the deadline. Chromium's
[default input protection](https://chromium.googlesource.com/chromium/src/+/refs/tags/156.0.8078.80/ui/views/input_protection/default_input_protection_policy.cc)
updates its last-event timestamp even for ignored actions; its accessibility default action
dispatches mouse events through that policy. Consent action retries now leave the system
double-click interval plus 50 ms quiet, bounded by the original deadline. Observation-only
polls retain their short interval. Exact native-sheet matching, ambiguous-target refusal and
disappearance verification remain unchanged. A regression models the external policy and fails
with the prior 100 ms cadence. Signed internal `4e5724b` then found the sheet in 17 ms and
confirmed its disappearance at 1,148 ms without operator consent input; Sia showed Attached.
The subsequent fresh task retained the selected window after restart, but connection recovery
paused before input when Chrome was foreground. Useful restart/concurrent acceptance remains open.

## Reusing an approved connection

The host can now request `browser_prepare` with `reuse_only:true` when another exact Chrome
window is active. That path retains process/window/endpoint ownership and authorization checks,
but only joins a live approved socket under the existing pool lock. It cannot dial, run setup,
handle native consent, install an activation guard or restore focus. Missing, closed and expired
sockets refuse. Ordinary explicit setup keeps its original behavior. Native regressions cover
both reuse and zero-connection refusals; host checks require a different, proved foreground
window and the host-bound target. This repairs unnecessary blocking of a retained connection;
it cannot retain a socket across a complete Sia process exit. The signed `0428730` trial found
that ordinary preparation still blocked reuse while Chrome was inactive. The follow-up tries reuse
before any setup guard for ordinary preparation too. Only missing endpoint/socket proof before
host authorization falls through to ordinary setup; denial and a post-approval race remain terminal.
This preserves the setup guard for cold connections. Signed live acceptance remains open.

## Live foreground identity

The patch backports upstream [#6182](https://github.com/trycua/cua/pull/6182), commit
`337c62c9a41e340b772b40615624c5f83fa49c43`: `apps::frontmost_pid` reads WindowServer
instead of `NSWorkspace.frontmostApplication`. The AppKit value can retain the app active at
the first read in hosts without a main run loop delivering activation notifications. Upstream
reproduced this across Finder/Calculator switches in a no-overlay daemon. The existing SkyLight
query supplies the current PID or returns unavailable; it does not activate a window or relax
any input guard. Sia's separate signed observer already runs a main loop and is unchanged.
This backport removes the known native query defect; it is not proof that it caused Sia's
observed Chrome recovery or input failures. Signed-app background acceptance remains required.

## Native panels

The signed reviewer-copy task exposed Finder's Go to Folder panel through operator CUA while
Sia reported `ax_unresolved`. Exact-window discovery now also checks `AXFocusedWindow` when
neither `AXWindows` nor application children contains the requested surface. It accepts only an
`AXWindow` or `AXSheet` with the exact requested backing window ID and process ID. Focus alone
never selects or authorizes a different window. The read is bounded, retains only a matched
element and leaves hidden/minimized, key-window and dispatch checks intact. This supplies the
same acquisition path to observation and input validation; no AX content is exposed to the model.
Signed `52a81f3` resolves the panel exactly, confirming the discovery repair, but input still
refuses its visibility state. The ordinary document rerun completed through another Finder window.
The follow-up supplies independent visibility proof when a focused sheet omits `AXMinimized`:
its exact PID/window must be focused, and WindowServer must report it onscreen on the current
Space with finite, nonzero geometry. Apple's [onscreen key](https://developer.apple.com/documentation/coregraphics/kcgwindowisonscreen)
describes current visibility. An explicit minimized value is never overridden; ordinary windows,
other windows/processes, off-Space/unknown visibility and hidden apps retain their refusals.
The regression fails with the AX-only rule and passes with this proof, including negative cases.
This is host validation only; the model still sees screenshots. Signed `04fdb7d` still refused
the panel: signed diagnostic `0385bc4` confirmed every visibility premise except the comparison
with the focused owning window. The raw focused sheet matches the target, but its parent does
not. Visibility now compares the exact raw surface, preserving owner-based keyboard ancestry.
A regression reproduces the parent/surface mismatch and rejects a different focused surface
even when its owner equals the target. Opt-in `SIA_CUA_INPUT_DIAGNOSTICS=1`
reports only visibility booleans and whether the focused raw surface and its owning window
match the target. It logs no IDs, titles, paths, input or AX content. This distinguishes missing
visibility from sheet-to-parent identity mapping without changing input decisions. Signed
panel-input acceptance remains required.

Signed `b15d68c` cleared the visibility refusal and delivered a background panel click, but
Command-A then reached the native menu route and failed its document-only context check.
Menu binding now accepts the exact focused sheet as well as its owning document, requiring
the same proven main document in either case. The raw sheet identity remains part of both
pre-dispatch reads, so replacement, dismissal, another owner or an unknown context refuses.
The regression failed before this change; this does not relax menu enablement or permit the
document Save fallback while a modal sheet is open. Live navigation acceptance remains required.

Signed `d4b4f73` dispatched Select All through that exact sheet, then visual typing refused
`no_focused_text_input`: the focused-field ownership lookup also replaced the sheet with its
parent. The shared bounded ancestry resolver now retains the sheet's raw ID only when that
exact surface is requested. Ordinary ownership reads still return the parent; other windows
remain rejected. A before/after regression covers both identities and sibling rejection.
Visual typing still checks the focused field and sends keyboard events only. Sia also classifies
this explicit pre-input refusal correctly instead of recording an uncertain delivery.

## Background links

The same patch checks an exactly bound link before background click dispatch. A signed alpha.50
visitor-planning task clicked a public `target="_blank"` dining link; Chrome opened a new tab and
Sia's focus guard paused. Known links targeting another context are now refused before either
trusted or synthetic input. Sia explains that the agent should read observed destinations and
navigate the existing tab instead. The driver does not rewrite the page, silently substitute
navigation, replay input, or grant another tab. Unknown preflight results refuse; JavaScript can
still cause unanticipated effects, so the post-input focus guard remains necessary.

The preflight reads only a boolean about the current node and its document's base target. It
returns no URLs or page content. Exact frame/ref checks run first, and explicit foreground input
retains its existing behavior. Native regression tests cover refusal before dispatch, unknown
reads, ordinary background input, foreground choice and existing browser routing. A real Chromium
regression also executes the exact patched function with `throwOnSideEffect`: `Element.closest`
was rejected by that evaluator even for ordinary links, so the preflight uses a bounded parent
walk instead. The side-effect restriction remains enabled. Temporary remote objects are released
through the reviewed CDP method policy. These engine checks are not signed-app acceptance.

Each operation now owns its temporary parent CDP attachment through input/readback and releases
that exact session on completion or refusal. The one registered dialog-event observer per target
is intentionally retained until its bounded browser connection closes. This also releases its child attachments without closing the
shared browser socket or detaching another operation. A regression reproduced retained parent
sessions before the fix and verifies cleanup while an independent validation remains live.
The relation to observed navigation stalls is not established. Opt-in
`SIA_CUA_CONSENT_DIAGNOSTICS` timeout logs contain only the CDP method and a fixed stage
(`focus_enable`, `focus_restore` or `command`), never raw parameters or page data.

## Browser attestation failures

macOS can middle-elide a native window title even when Chrome's tab metadata contains the full
title. With several maximized windows, the original full-title containment check then refused the
approved window as ambiguous. The title matcher now accepts one interior Unicode ellipsis only
when both ends contain at least eight characters, both match the full candidate, and at least one
character was omitted. Candidates containing their own ellipsis use only the original literal
match. All matching windows/tabs still compete: collisions, including a literal ellipsis title,
remain ambiguous. Missing geometry still yields at most a read-only heuristic binding. A regression
uses the observed USDA window title and failed before the change. All 20 binding tests and the full
pilot gate passed. In signed QA `7fe2089`, automatic recovery
then produced one exact binding among 29 tabs in seven windows with elision and exact geometry
confirmed; the useful commute-card task completed. The existing opt-in diagnostic flag records
only binding counts, geometry/elision booleans and a fixed outcome label, never titles, URLs or
target IDs. This one resumed run does not establish repeatable recovery or native keyboard input.

Before a browser observation or input reaches Sia's authorization callback, the native driver
revalidates the process, window, tab, connection generation and live origin. That boundary used
to discard its browser refusal code when wrapping the failure as `authorization_host_failed`.
The patch now prefixes the native code with `[browser_attestation:...]`. Sia decodes only the
closed set of known codes, from the native refusal/error envelope, when no callback has started.
Content-bearing details never reach the model or diagnostic log. Unknown envelopes and callback
failures retain the generic refusal; bounded observation-timeout recovery is unchanged. No action
is retried or authorized by this classification. This makes stale connections and missing tabs
distinguishable from an actual consent requirement without weakening the underlying checks.

## Visual browser input

The staged vision-only host route uses screenshot coordinates for pointer input and a new
`browser_type` focused mode for text. Focused mode never focuses, selects or sets a DOM element.
It checks the current caret before and after focus emulation, refuses protected or unproven fields,
inserts text once and restores focus emulation even after uncertain delivery. Visual capture
checks its protection snapshot document identity before and after the image. The host forwards
a hash of live frame/loader identities and CSS viewport state with input. Same-URL reloads,
scrolling, resizing, pan and zoom changes revoke it, including changes during focus emulation.
Capture also rechecks the viewport after the image and returns no image if it changed. Missing or
invalid viewport metadata refuses input; optional zoom metadata remains explicitly absent when
Chrome does not report it. This token never reaches model responses. Its host-only check
returns a boolean, never field contents or an element target.

The host also retains a separate native fingerprint of the top-level document and viewport,
plus the exact PNG hash. When a child frame refreshes between observations, an identical image
with the same root/viewport may carry the requested action forward using the **new** full-frame
token. A root reload, changed image, URL, geometry, expired observation or missing proof still
revokes the old action. Native capture-time and immediately-before-input checks remain unchanged;
this never replays a dispatched action or exposes document fingerprints to the model.

The `focused_key` mode treats the text argument as one named page key, with optional Cmd, Shift
or Option modifiers. It sends one CDP key-down/up pair to the bound page, using reviewed editor
commands for selection, undo/redo and caret movement. A side-effect-checked focus guard rejects
protected, unknown and cross-origin fields; Enter/Space also check known new-context links and
form targets. Tab and other non-activating keys can leave those links. Checks repeat after focus
emulation. Key release and focus restoration are attempted even after uncertain delivery; the host
consumes that image authority and never replays the key. Clipboard and browser-wide shortcuts
remain unavailable, including Shift+Escape. Shift+Enter needs an editable caret so it cannot open
a focused link in another window. Plain letter keys and Cmd+A/Z remain available to page apps
with custom focus handling. Chromium tests exercise the exact guard and selection/Tab/Enter behavior;
these are transport checks, not signed real-task acceptance.

Coordinate clicks and button gestures perform a security hit-test at the selected point, then run
the same new-context guard described above. They do not move the point, scroll an element into view,
rewrite the page or expose the hit node. Unknown checks refuse before input. The CDP method policy
admits `DOM.getNodeForLocation` for this host-side check. A drag checks both endpoints. JavaScript
may still cause unexpected focus changes, so post-input checks remain necessary.

Signed alpha.58 exposed an allowlist lookup defect: `DOM.getNodeForLocation` was declared out of
sort order, so binary search rejected it before Chrome received the request. The policy now uses
set membership over the same reviewed commands. A source-extracted reproduction failed before
the change; regression checks cover every declared method and coordinate input on a restricted
existing-profile socket. The earlier unrestricted fixtures could not detect this failure.

## Native attached sheets

Finder's Go to Folder dialog can be a top-level `AXSheet` with its own CGWindowID.
Window scoping now accepts that exact sheet ID, walking only its matched surface, without
borrowing the application menu or another sheet. If `AXWindows` omits it, a bounded lookup
of application children admits only the requested ID and process. Pointer and keyboard
visibility/focus checks remain unchanged: unknown minimized/hidden state still refuses input.
The scope regression failed before this correction; the 82 AX tests pass afterward. The pilot
gate now also explicitly runs window-scope, binding and core background-input tests. Signed-app
rename/move/reopen acceptance is still required.

`ax/exact_target.rs` maps an attached sheet to its canonical document while retaining the raw
focused-window ID for focus records and restoration. Keyboard delivery requires matching document
and focused-element ancestry; missing, conflicting or sibling ancestry refuses input. Foreground
focus readers retain raw IDs.

`ax/window_point.rs` resolves a screenshot point when the app-level hit-test has no usable target.
It scans the freshly owned window or attached sheet for one enabled pressable or focusable control
at that point, prunes clipped scroll content outside that point, rejects ambiguous
or incomplete scans, and rechecks ownership and geometry before returning a retained element.
`tools/click.rs` owns dispatch under the exact-window mutation lease. No labels or semantic targets
reach the model. Regressions cover exact-root ownership, point bounds, clipping, ambiguity, unreadable trees, limits and cycles.
Vision-only clicks set the host-owned `pointer_only` flag. It requires an exact window and screenshot coordinates, rejects semantic targets and actions before target resolution, and skips the AXPress delivery shortcut. The legacy assisted route retains that shortcut. Host ownership, protection, capture geometry and focus validation still run.

Background keyboard input requires verified focus in the exact requested window.
`tools/pixel_focus.rs` owns focus and readback; both share the click screenshot transform in
`tools/px_frame.rs`, including session-specific scale and zoom. Unscaled readback incorrectly
rejected the focused Search field during alpha.87; its regression covers scale and isolation.
Capture geometry is handled separately below; signed Save/reopen acceptance is still open.

A popup inside a remote sheet is another surface. `ax/window_point/popup.rs` proves the menu's
exact document ancestry, process identity and unique layer-101 WindowServer bounds. Remote AppKit
menus can report the document PID while their pixels belong to a service. That service must have
Apple's exact Open/Save Panel executable path, and macOS must identify the exact document process
as responsible for it. The optional private `responsibility_get_pid_responsible_for_pid`
symbol is resolved dynamically; a missing symbol, unknown service or other client refuses ownership.
No other windows from the process are admitted. Missing or ambiguous identity refuses capture. The module supplies geometry only; no menu text reaches the
model.

`ax/window_point/popup/popover.rs` follows bounded, fresh focus ancestry to prove a document-owned
`AXPopover`, then requires one visible same-process backing window with matching bounds. It does not
search by title or read text. The menu resolver starts inside that proven popover when one exists;
its backing window is excluded from menu candidates. A service-owned menu still needs the exact
client/service proof above. Unknown or ambiguous ownership refuses capture.

`capture/popup.rs` composes the document with an ordered list of at most two additional surfaces:
one popover and its menu, or one menu alone. Each layer retains its completed sample's content
rectangle and measured scale. Both layers must appear in the resulting image, with the menu on top;
returning only the popover falsely suggests its destination control did nothing. The complete list
is revalidated after capture and before input. Moving, closing, replacing or reordering either
surface invalidates the observation. Pointer lookup selects the topmost proven surface at the
model's point; empty composite regions cannot receive input. The list stays in host-only geometry.

Regression tests cover ownership, ambiguity, compositing order, distinct sample scales, stale
identity and input boundaries. Alpha.97 captured the title popover but omitted its opened menu;
alpha.98 refused that menu's unmatched service owner. Alpha.99 identified matching bounds and
Apple's DocumentPopoverViewService owner. Signed alpha.100–104 diagnostics established that this
shared service is self-responsible, its menu exposes no raw AX window ID, and its WindowServer parent
chain ends inside the service. Native child-window capture also omits the menu. Those unsuccessful
ownership probes and capture dumps were removed; the menu still refuses capture. These diagnostics
do not establish Save/reopen acceptance.
Complete useful workflows still need to pass on the exact signed candidate.

## Interruptible visual typing

`tools/type_text/cancellation.rs` connects async cancellation to the blocking keyboard writer.
Dropping the async wait sets a cancellation flag; the writer checks it between complete characters,
after releasing each character's key and modifiers. The worker owns the process mutation lease
until it exits, so a cancelled task cannot release that lease while its input loop continues.
`input/keyboard.rs` supplies checked event loops; `type_text/visual.rs` uses them for background,
foreground Unicode and foreground physical input. Legacy callers retain their existing wrappers.
A deterministic native regression cancels a writer between two characters and verifies that the
second is never written. Signed alpha.96 also stopped a real checklist mid-entry and resumed it
without duplicated text. This does not validate Save/Open filename input or concurrent usefulness.

## Embedded-frame snapshots

The pinned driver also contains the renderer-local AX identity collision reported in
[upstream issue #5381](https://github.com/trycua/cua/issues/5381). Merging an embedded frame could
make an omitted parent resolve in another frame and create an unbounded outline walk. The patch
namespaces AX nodes and edges by frame/document identity and bounds parent traversal, including
malformed same-frame cycles. Subtree selection retains the exact frame with its backend node id
through pagination; a regression reproduced an embedded input being replaced by an unrelated
main-page heading with the same numeric id. These fixes address proven snapshot defects. They
do not establish the cause of the live navigation/focus-emulation timeout.

## Build and inspect

Install Rust through [rustup](https://rustup.rs) in addition to the normal Sia prerequisites.
The first native build downloads the pinned compiler and source; later builds verify and reuse
cached outputs. `pnpm build` and `pnpm dev` build the host architecture automatically.

The source-cache check includes new patch files, including caches created by older builds. It
applies patches without disturbing the sparse index, then marks only declared new files for the
exact diff comparison. Changed or unexpected source files are refused and preserved. The full
pinned patch passed two consecutive checks in a fresh upstream sparse checkout; regressions also
cover first apply, older-cache recovery, divergent files and sparse-index preservation.
Universal packaging builds both architectures before signing.

```sh
pnpm --filter @sia/desktop native:cua
pnpm --filter @sia/desktop native:cua --arch=universal
```

The source and Cargo cache live in ignored `apps/desktop/build/native/cua/`. Each generated
platform package includes `build-provenance.json` recording source, patch, build recipe,
compiler, architecture, deployment target, license corpus and pre-signing binary hashes.
`RUST_LICENSES.txt` preserves original notices for the SDK dependency closure, including
embedded C libraries. Missing crate license files use checked-in original upstream texts
pinned by the crate’s source revision; unknown omissions fail the build. The build fails
if the cached source has an unexpected revision or edits. It never edits pnpm's shared store.
The original Node runtime comes from an exact npm alias pinned in `pnpm-lock.yaml`.
The original SDK from that alias is not used by Sia.

For native regression checks on the host architecture:

```sh
pnpm --filter @sia/desktop native:cua --test
```

The full pilot gate includes these checks. They test consent-sheet recognition, exact-target ownership,
sheet point resolution, keyboard focus/menu isolation, browser routing and refusal boundaries. They cannot replace a signed-app Chrome
connection, background research, detach/reconnect and restart test. Intel builds are statically
verified on the Apple Silicon release Mac; execution requires an Intel Mac.

Remove the patch and workspace overrides when an upstream release carries the verified fix.
The unverified Finder named-arrow experiment is deliberately excluded.

The checked-in supplemental license manifest records the exact upstream source revision and URL
for crates that omit their own license body. Original upstream notices and embedded-library
notices remain intact. Regenerate and review this corpus when updating Cargo.lock or the source pin.

## Capture geometry

`capture/frame.rs` owns the window/sheet geometry, capture errors, parent backing-scale validation
and pixel-to-screen transform. Capture code does not import input tools; `tools/px_frame.rs`
consumes these contracts and owns their tool-facing refusal messages. The backing-scale regressions
live with the validator, while dispatch/refusal regressions remain with the tools.
`capture/stream.rs` takes pixels and metadata from one completed ScreenCaptureKit sample;
its small CFNumber status reader avoids the pinned dependency's failed NSNumber-to-enum cast.
The captured content rectangle and scale must match the union of the parent and a freshly owned
sheet. Before/after surface checks reject movement, resize, sheet replacement and missing ownership.
Padding is excluded from input, and the host retains the geometry proof outside model-visible data.
`tools/px_frame.rs` validates that proof again for input and centralizes coordinate conversion.
The legacy assisted route can use a bounded owned-sheet accessibility press beyond the parent.
Vision-only clicks exclude that route: pointer delivery outside the parent requires the separate
owned-popup proof. Other out-of-parent input is refused.
The shell window fallback was removed: image dimensions do not prove its content transform.
The backing-store fallback remains for parent-only windows and refuses known attached sheets.
Signed internal alpha.70 visibly collapsed and re-expanded the Save sheet with fresh-image
background clicks. Save/reopen then stopped at the separate Cmd-Shift-G window-context guard.
The full pilot gate passed; Save/reopen and concurrency acceptance remain open.

## Native visual input

`tools/invoke_menu/context.rs` binds the exact document and optional attached sheet for native
menu key equivalents. The hotkey route resolves the requested field first and shares its existing
per-process lease with menu dispatch. A replaced/dismissed sheet invalidates the command. Modal
commands must already be enabled; a disabled modal Save cannot fall through to a scripted save of
the parent document. Signed alpha.75 visibly selected the filename in the background, but Save/reopen
failed at Go to Folder. Its text insertion used the old assisted setter and does not qualify as
keyboard-only acceptance.

`tools/type_text/visual.rs` implements host-requested keyboard-only text delivery. It retains exact
window and focused-input checks, applies the synthesis budget before input, posts one event sequence,
and leaves effect verification to screenshots. It neither reads text values nor uses AX setters.
The regular native gate includes modal-context, menu-equivalent and visual-typing regressions.

Background pixel cleanup also checks the actual keyboard-focus holder after a failed private
activation call. If the exact target holds that focus while the user’s app remains foreground,
it restores the user’s focus record. Unknown focus and unrelated holders do not trigger this
fallback. A failing-then-passing regression covers this partial-activation case; it does not
establish the cause of the live filename mismatch or prove native typing acceptance.

Prior signed filename diagnostics found matching client/field process identities and granted
Accessibility/event-posting access. The authenticated route, alpha.91’s envelope-free
`SLEventPostToPid` text trial and separate single-key test, and alpha.94’s public
`CGEventPostToPid` trial all failed to replace the selected filename/query. The transport
experiments were removed; none is a fallback. The private alpha.88 document-body receipt records
visible text after an acknowledgement timeout, followed by failed filename entry; a new empty-body
trial alone would repeat that comparison, not explain native dialog delivery. These historical
results do not establish the behavior of the current signed build. Before adding another transport variant, inspect
the current [release evidence](../../../../docs/release-status.md) and its preserved diagnostic
receipts, and state what new observation distinguishes the hypothesis from those failed trials.
A successful post call alone does not verify delivery.

The host logs a bounded `[sia:cua-input] window_not_key` hint when exact key-window priming
refuses. It reports whether the native focused window and focused element's window are missing,
the requested target, or another window. Unknown envelope shapes produce `unavailable`; native
IDs and content are never logged. This diagnostic does not relax the gate or retry input. Use it
to distinguish missing focus from conflicting focus before proposing another routing change.

Menu-context refusal uses the same public error code but a different producer reason. The native
`invoke_menu/context.rs` boundary now logs a fixed `menu_context` label for missing focused/main
window information, a non-document main window, or conflicting target/owner identity. It retains
the same binding predicate and logs no native IDs or content. This diagnostic distinguishes the
fresh Saturday-comparison failure from key-window priming before any routing change is justified.
Signed `13a8759` reproduced `main_not_document`: Finder reported Go to Folder as its main
surface. The fix additionally accepts an exact focused/main sheet pair only when both raw IDs
equal the requested sheet and both ownership reads prove the same separate document. It retains
the full raw context for the pre-dispatch equality check; a replacement, transition back to the
document, missing owner or sibling still refuses. This preserves modal command enablement and
does not permit the document Save fallback. The regression fails before the fix; useful signed
acceptance remains required.

Signed `20f5616` diagnosed the missing Finder file menu: after one background right-click,
capture reported `focused_root_unresolved` while post-terminal operator inspection still found
the open menu under the exact Finder document. The temporary capture labels were then removed.
`ax/window_point/popup/root.rs` retains the existing proven focused-sheet route, but otherwise
resolves a unique exact document from the application's `AXWindows` using raw window ID, role
and PID. Popup capture no longer depends on keyboard focus remaining in that document.
Menu ancestry, unique visible popup-window identity and geometry checks remain required; the
root is re-read before returning it and the surface is revalidated before capture/input.
Missing, ambiguous, replaced and wrong-process roots remain refused. This changes observation
and pixel-surface ownership only, not keyboard authorization or model-visible semantics.

Owned-popup pointer coordinates must convert the captured top-left origin to AppKit's
bottom-left window origin before stamping the native event. Global Quartz coordinates remain
unchanged. The event-readback regression reproduces the old wrong-row mapping: a point 50 below
the top of a 200-point popup was stamped as local Y=50 instead of 150. It reads both native
location fields without posting input and covers the existing SkyLight/public fallback choices.
The correction changes only popup-local Y; it retains the single event sequence, window identity,
ownership validation and focus protection. Coordinate conventions follow WebKit's
[event serializer](https://github.com/WebKit/WebKit/blob/7596ac02075f631c107be8d4e0b056d236288433/Tools/TestRunnerShared/EventSerialization/mac/EventSerializerMac.mm).
Useful signed acceptance remains required; this regression alone does not prove menu tracking.

Native hotkeys also log fixed `menu_lookup` labels: `enabled_match`, `disabled_match`,
`no_match`, `target_active` or `non_native`. A matched command logs `menu_dispatch=returned`
or `unavailable_key_fallback`. These distinguish the paths that otherwise all end in synthetic
key delivery. They contain no combo, menu title, process/window ID or field content and do not
change dispatch. A `returned` label alone is not success; inspect the existing action result and
fresh screenshot. This diagnostic follows the signed Finder comparison: menu-assisted folder
creation worked, while a later Info-field Cmd+A used synthetic events without visible selection.

Signed `770360e` also tried the existing unenveloped native menu-key path specifically after
an unavailable menu command. The ordinary Open-panel workflow still failed; post-terminal
inspection confirmed no Go to Folder sheet. That route and the preceding temporary ownership
label were removed. Do not repeat transport variants without a distinct cause.
