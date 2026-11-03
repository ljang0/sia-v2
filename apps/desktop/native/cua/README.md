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

Prior signed filename diagnostics found matching client/field process identities and granted
Accessibility/event-posting access. Both the authenticated native route and a public
`CGEventPostToPid` text trial failed to replace the selected filename/query. The public transport
experiment was removed; it is not a fallback. Before adding another transport variant, inspect
the current [release evidence](../../../../docs/release-status.md) and its preserved diagnostic
receipts, and state what new observation distinguishes the hypothesis from those failed trials.
A successful post call alone does not verify delivery.
