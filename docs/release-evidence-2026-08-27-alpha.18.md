# Sia 0.1.0-alpha.18 release evidence

_Prepared 2026-08-27 ET_

## Decision

`alpha.18` is ready for controlled distribution to JY as an internal operator and hosted-model
tester. The exact source is pushed and tagged; the universal app and DMG are Developer ID signed,
Apple-notarized, stapled, Gatekeeper-accepted, privately published, and independently verified.

This is not a general-public or research-participant release. The separate named approvals in
[`research-release-signoff.md`](./research-release-signoff.md) remain incomplete.

## Release behavior

- First run is reduced to Sia email sign-in followed by a two-field agent form: name and
  instructions. Model, workspace, voice, and other choices remain under a closed **Details**
  disclosure.
- The included hosted model is the default. Its permanent model-lab credential remains in AWS
  Secrets Manager and is never included in the app, Codex configuration, logs, or release records.
- The optional local alternative is **Sign in with ChatGPT** for Codex. Sia starts the official
  Codex App Server ChatGPT browser login, waits for the completion event, refreshes the account
  state, and accepts only trusted OpenAI/ChatGPT HTTPS login hosts.
- Included models use the supported Codex harness through a model-scoped local Responses relay.
  Computer and web capabilities remain Sia-scoped tools subject to the existing action policy.
- The release UI shows only the included model and optional Codex-plan path; provider diagnostics
  and advanced creation choices no longer dominate onboarding.

## Source identity

- Exact signed source: `b59b9a5bee76ce14a6d0b4229361a4e83d96a892`.
- Annotated tag: `v0.1.0-alpha.18`.
- Branch and tag are pushed to `origin`.
- The unrelated local `codex_incident_019fb85c/` bundle was not committed or packaged.

## Signed artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Sia-0.1.0-alpha.18-universal.dmg` | 257,724,161 | `d7e870890e2089afc4c0d1766cd55d9a14bef0dfe50452a0c55ce8c9e36cfcf4` |
| `Sia-0.1.0-alpha.18-universal.zip` | 257,068,014 | `913092e48a12353e387e56281e30aa8ace8674b06fe0c0b8be3473d78fd0a5ec` |

- Signing identity: `Developer ID Application: Lawrence Jang (DXYJ578DD4)`.
- Bundle ID: `ai.sia.desktop`; app CDHash: `87b85dc68135e4c851239ae9fa2bbfd8d462be4f`.
- App notarization: `0712171c-2bc7-4f70-be85-e3b5850888eb`, accepted.
- DMG notarization: `e95c13e3-ea8b-4cf1-8ef4-35ea97ed91aa`, accepted.
- The app executable and Electron runtime are universal `x86_64`/`arm64`.
- Strict deep-signature checks, app execute assessment, DMG open assessment, and staple validation
  passed independently after the release script completed.
- The packaged app launched successfully with a fresh isolated data directory and emitted no fatal
  startup diagnostic.

## Cloud and model verification

- AWS account `677513020767`, stack `sia-alpha`, reports `UPDATE_COMPLETE`.
- The deployed control, hosted-model, deletion, and research-export Lambda bundle hashes match the
  exact local release bundles.
- The AWS-stored hosted-model configuration is enabled, its key is configured, and the upstream
  capability check returned model `super_nova_ext` with streaming and tool support.
- A live, minimal upstream inference completed with usage and finish events and returned the exact
  deterministic release-smoke response. No credential or upstream endpoint was printed.
- Real Codex isolation retained the ChatGPT account while creating an ephemeral session.
- A real Codex App Server custom-provider smoke completed a Responses turn through a model-scoped
  local relay and exercised the Sia tool-call round trip.

## Automated verification

- `pnpm check`: build, formatting, quality policy, type checks, and 548 runnable tests passed; three
  credential-dependent smoke tests remained opt-in in the aggregate run and the two relevant Codex
  smokes were run separately and passed.
- `pnpm test:e2e`: 26 passed; four explicitly opt-in real-environment scenarios were skipped.
- GitHub Actions run `33102673721` passed the clean hosted-macOS quality, E2E, and unsigned universal
  package checks for the exact release commit.
- The release package verifier passed production cloud/update configuration, bundled licenses,
  native architectures, CUA runtime, and packaged MCP bridge checks.

## Private publication

- DMG key:
  `releases/0.1.0-alpha.18/d7e870890e2089af/Sia-0.1.0-alpha.18-universal.dmg`.
- ZIP key:
  `releases/0.1.0-alpha.18/913092e48a12353e/Sia-0.1.0-alpha.18-universal.zip`.
- Manifest key:
  `manifests/macos/0.1.0-alpha.18/7a880d16354af0f05157c489d4c3fda9bbab36ccfe559baea0f38e5b5cc9970b.json`.
- The immutable and latest manifests are byte-identical, and the Ed25519 signature verifies against
  the public key pinned in the signed app.
- The unauthenticated manifest request returns HTTP 401. The private recipient URL served a one-byte
  range request with HTTP 206 without exposing the URL.
- JY remains in `Operators` and `MetaTesters`. His mode-`0600` recipient record is
  `/Users/lawrencejang/.sia-release/jingyuk-alpha18-download.json` and expires
  `2026-09-03T18:30:03.487Z`.

## Remaining recipient check

JY should install this DMG, complete Sia email sign-in, create one included-model agent, and run one
short disposable task. He should then open **Settings → AI**, choose **Sign in with ChatGPT** if his
Codex plan is not already connected, complete the official browser flow, and run one short Codex
task. This exact-machine acceptance is the remaining handoff check, not a signing or publication
blocker.

The Apple app-specific password supplied during release appeared in chat. Revoke it after this
release and create a new Keychain-held credential before the next notarization.
