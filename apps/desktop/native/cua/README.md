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

## Build and inspect

Install Rust through [rustup](https://rustup.rs) in addition to the normal Sia prerequisites.
The first native build downloads the pinned compiler and source; later builds verify and reuse
cached outputs. `pnpm build` and `pnpm dev` build the host architecture automatically.
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

The full pilot gate includes these checks. They test sheet recognition, browser routing and refusal boundaries. They cannot replace a signed-app Chrome
connection, background research, detach/reconnect and restart test. Intel builds are statically
verified on the Apple Silicon release Mac; execution requires an Intel Mac.

Remove the patch and workspace overrides when an upstream release carries the verified fix.
The unverified Finder named-arrow experiment is deliberately excluded.

The checked-in supplemental license manifest records the exact upstream source revision and URL
for crates that omit their own license body. Original upstream notices and embedded-library
notices remain intact. Regenerate and review this corpus when updating Cargo.lock or the source pin.
