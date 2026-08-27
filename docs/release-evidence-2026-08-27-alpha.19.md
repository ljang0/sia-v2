# Sia 0.1.0-alpha.19 release evidence

_Prepared 2026-08-27 ET_

## Decision

`alpha.19` is ready for controlled distribution to JY as an internal operator and hosted-model
tester. It replaces `alpha.18`: the prior build required email sign-in only on an empty first-run
profile, while this build enforces the account boundary across existing profiles, backend calls,
background work, and relaunch.

This is not a general-public or research-participant release. The separate named approvals in
[`research-release-signoff.md`](./research-release-signoff.md) remain incomplete.

## Authentication boundary

- A cloud-configured release renders only **Sign in to Sia** until email authentication succeeds.
  Existing agents, threads, timelines, provider state, schedules, connected apps, usage, browser,
  computer, voice, and update state are redacted from the signed-out bootstrap.
- The main-process bridge independently denies every method except bootstrap and the email
  authentication progression while signed out. Direct computer authorization, model-visible tools,
  connector bindings, and scheduled execution also fail closed.
- Signing out immediately locks the renderer, cancels queued and running turns, resolves pending
  questions, revokes approvals, resets runtime sessions, disables schedules and tools, and hides the
  local records. A failed sign-out caused by a protected unsynced research outbox restores the
  signed-in view after work has been stopped rather than silently losing the outbox.
- A cloud-disabled development build retains its explicitly local developer path. That path is not
  present in this signed release.
- Cognito email OTP, password-plus-TOTP administrator fallback, encrypted renewable-session storage,
  refresh, and rejected-session behavior remain covered by the identity suite. The exact signed app
  passed a clean-profile launch with the email dialog, a redacted bootstrap, no app navigation, and
  zero renderer errors.

## Included Meta and Codex

- Meta does not have a separate user login. A successful Sia email login unlocks the included model;
  its permanent model-lab credential remains only in AWS Secrets Manager.
- A live production capability probe under the same `Users` authorization context enforced by the
  service returned `super_nova_ext` with availability, streaming, and tools all enabled. A live
  production turn returned the exact
  `SIA_AUTH_GATE_META_OK` sentinel plus usage and completion events.
- Real Codex isolation retained the existing ChatGPT account while creating an ephemeral session.
  The real Codex App Server custom-provider smoke completed a Responses turn through the
  model-scoped local relay and exercised the Sia computer-tool round trip.

## Source identity

- Exact signed source: `fb055631b3997868386d970ed8440ec814dec78d`.
- Annotated tag: `v0.1.0-alpha.19`.
- Branch and tag are pushed to `origin`.
- GitHub Actions run `33107703946` passed the clean hosted-macOS quality, Electron E2E, and unsigned
  universal-package checks for the exact source.
- The unrelated local `codex_incident_019fb85c/` bundle was not committed or packaged.

## Signed artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Sia-0.1.0-alpha.19-universal.dmg` | 257,720,096 | `dcd4eb5a9cc9f5d506096d29d427c544110d2617c84f6e5c327c9576d6959dc5` |
| `Sia-0.1.0-alpha.19-universal.zip` | 257,068,271 | `4d8ffcb51bc76ff3064b70f5b996afe06ca60a1de13f8790ca88547f75ce389f` |

- Signing identity: `Developer ID Application: Lawrence Jang (DXYJ578DD4)`.
- Bundle ID: `ai.sia.desktop`; app CDHash: `5bc9f28371f3b73819be228db4122518c843cbae`.
- App notarization: `2a5bc7d6-e601-4d4b-ac1c-0cc706e1e90f`, accepted.
- DMG notarization: `df38429f-9b6e-4bdc-8034-139f60c3f45d`, accepted.
- The app and DMG are stapled and independently Gatekeeper-accepted as Notarized Developer ID.
- The release verifier passed strict nested signatures, hardened runtime, universal Electron/helper
  binaries, both CUA and UniFFI native architectures, packaged runtime probes, licenses, and the
  embedded production cloud/signed-update configuration.

## Automated and operational verification

- `pnpm check` passed build, formatting, quality policy, type checks, and 549 runnable tests; three
  credential-dependent runtime smokes remain opt-in in the aggregate command and the two relevant
  Codex smokes were run separately and passed.
- `pnpm test:e2e` passed 27 scenarios, including a signed-out relaunch with a persisted private agent;
  four explicitly opt-in real-device cases were skipped.
- AWS stack `sia-alpha` is `UPDATE_COMPLETE`. All 17 monitored alarms report `OK` with actions
  enabled.
- The immutable and latest manifests are byte-identical, the Ed25519 signature verifies against the
  key pinned in the signed app, and the unauthenticated manifest route returns HTTP 401.
- A one-byte range request through the private recipient URL returned HTTP 206 and the exact
  published DMG length without exposing the URL.

## Private publication

- DMG key:
  `releases/0.1.0-alpha.19/dcd4eb5a9cc9f5d5/Sia-0.1.0-alpha.19-universal.dmg`.
- ZIP key:
  `releases/0.1.0-alpha.19/4d8ffcb51bc76ff3/Sia-0.1.0-alpha.19-universal.zip`.
- Manifest key:
  `manifests/macos/0.1.0-alpha.19/12d8c8a62d336ac058609b216ce946537a33a452d063ef0b2d4d2b046add4b21.json`.
- JY remains in `Operators` and `MetaTesters`. His mode-`0600` recipient record is
  `/Users/lawrencejang/.sia-release/jingyuk-alpha19-download.json` and expires
  `2026-09-03T19:18:15.713Z`.

## Remaining recipient check

JY should install this DMG, enter the emailed Sia code, create one included-model agent, and run one
short disposable task. He should then open **Settings → AI**, choose **Sign in with ChatGPT** if his
Codex plan is not already connected, complete the official browser flow, and run one short Codex
task. The emailed-code entry and provider use on JY's own Mac cannot be completed without his code
and account interaction; they are the remaining recipient acceptance check, not a signing or
publication blocker.

The Apple app-specific password previously supplied in chat must be revoked. Future notarization
should continue through a fresh Keychain-held credential rather than a password in chat or source.
