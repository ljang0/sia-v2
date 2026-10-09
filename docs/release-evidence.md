# Sia 0.1.0-alpha.24 release evidence

_Prepared 2026-08-28 ET_

This file records the most recent published signed build and is replaced at each release; earlier records
remain at their release tags. Behavior described here is the alpha.24 build, not current `main`.

## Decision

`alpha.24` is technically ready for a controlled, named CMU product pilot with research collection
off. It is the only build that should be distributed. It supersedes `alpha.22`; `alpha.23` was an
unshared release candidate whose clean runner exposed stale visual baselines before handoff.

This is **not full public-release or research-participant approval**. The owners and signatures in
[`research-release-signoff.md`](./research-release-signoff.md) remain incomplete, and Google/Slack
remain limited to named connector testers. The pilot owner must maintain the recipient list and
support path.

The included Meta model passed a fresh live sentinel on 2026-08-29 ET. Direct model discovery
authenticated with HTTP 200 and listed the configured model among three advertised models. Direct
inference streamed text to a normal `stop` completion in about 1.8 seconds. A separate disposable
identity then exercised the deployed Sia `/v1/responses` relay: it returned HTTP 200, streamed text,
and completed without an error event in about 2.6 seconds. The disposable identity and its quota
rows were removed. This establishes current pilot usability, not a permanent provider-availability
guarantee; Codex remains the fallback.

## Pilot simplification and safety

- Email one-time-code sign-in remains the only entry path. Signed-out users cannot see agents,
  threads, providers, or computer access.
- Agent creation asks only for a name and short instruction in the main form. Sia chooses the color
  and private folder, and Codex is selected first when ready.
- AI, Connections, and Computer settings use shorter pilot-oriented copy. Google/Slack are primary;
  account details and local extras remain collapsed until needed.
- Computer changes ask for confirmation by default. The prior one-click “unlock everything” surface
  was removed; macOS and Chrome permissions are granted separately.
- New schedules are finite: one run for `once` and ten for recurring cadences unless the user picks
  another limit. The UI states that schedules run while Sia is open.
- Google begins read-only; connector write actions are outside the first CMU pass.

## Source and clean CI

- Exact signed source: `92609ad628b55fdf9547fad9251dfbae749a731c`.
- Annotated tag: `v0.1.0-alpha.24`.
- Branch and tag are pushed to `origin`.
- GitHub Actions run
  [`33217083496`](https://github.com/ljang0/sia-v2/actions/runs/33217083496) passed `pnpm check`,
  all 27 default Electron scenarios, and unsigned universal package verification on a clean macOS
  runner.
- The unrelated local `codex_incident_019fb85c/` bundle was not committed or packaged.

## Signed artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Sia-0.1.0-alpha.24-universal.dmg` | 257,730,192 | `d842ecbc208c134187b46fdf9e0bc18bb7a5fc563f4bc8f055b275356cfa8d72` |
| `Sia-0.1.0-alpha.24-universal.zip` | 257,068,280 | `9cd575926d22e813e6b0d8c7ec627b821fb15b68520de9e408750fd5e393285b` |

- Signing identity: `Developer ID Application: Lawrence Jang (DXYJ578DD4)`.
- Bundle ID: `ai.sia.desktop`; app CDHash: `33f5e05e13079f6655a4087fee53e08c68e2f8fa`.
- App notarization submission: `b9c556d5-882f-42bb-841f-d6581ffab53d`, accepted.
- DMG notarization submission: `97035c75-8382-418a-9c35-35415b888d4a`, accepted.
- The DMG is stapled and Gatekeeper-accepted as Notarized Developer ID. The release verifier passed
  strict nested signatures, hardened runtime, universal Electron/helper binaries, both CUA and
  UniFFI native architectures, packaged runtime probes, licenses, and signed cloud/update config.

## Automated and live verification

- `pnpm check` passed build, formatting, quality policy, type checks, and the complete default unit
  suite. The desktop portion passed 42 files / 344 tests; the workspace had 553 runnable unit tests
  in total, with only explicit real-provider smoke tests skipped by default.
- `pnpm test:e2e` passed all 27 default Electron scenarios; four opt-in external/device scenarios
  were skipped in that aggregate run.
- The exact notarized package passed a fresh-profile launch at version `0.1.0-alpha.24`: email
  sign-in was the only entry path, no local-mode bypass or signed-out private state appeared, and
  computer access was denied before sign-in.
- A live no-turn check passed installed Codex authentication and macOS CUA permission reporting.
  Chrome attachment was skipped because no dedicated test window was selected.
- The real Codex isolation smoke passed authenticated ephemeral-session creation without starting a
  model turn.
- The Codex custom Responses-provider smoke completed a tool call and result round trip through a
  model-scoped relay. This verifies that hosted Meta-compatible models can use the Codex harness.
- A 2026-08-29 live sentinel separately verified the stored Meta credential and the complete deployed
  Sia relay path. No provider key, token, prompt response, or disposable password was printed or
  persisted in the repository.
- Background Activity/relaunch recovery, finite app-open schedules, worktrees, connector UI,
  persisted-state isolation, keyboard use at 200% zoom, and visual baselines passed.

## Private publication

- DMG key:
  `releases/0.1.0-alpha.24/d842ecbc208c1341/Sia-0.1.0-alpha.24-universal.dmg`.
- ZIP key:
  `releases/0.1.0-alpha.24/9cd575926d22e813/Sia-0.1.0-alpha.24-universal.zip`.
- Manifest key:
  `manifests/macos/0.1.0-alpha.24/dbf881964d2d7be67e7237ec94886438e449339f181b179c6e59f4ad56830bd5.json`.
- JY's mode-`0600` recipient record is
  `/Users/lawrencejang/.sia-release/jingyuk-alpha24-download.json` and expires
  `2026-09-04T22:38:43.604Z`.
- A one-byte range request through the private recipient URL returned HTTP 206. The URL itself was
  not printed, committed, or placed in release evidence.

The Apple app-specific password previously supplied in chat must be revoked. Future notarization
should continue through a fresh Keychain-held credential rather than a password in chat or source.
