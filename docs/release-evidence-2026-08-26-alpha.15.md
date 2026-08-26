# Sia 0.1.0-alpha.15 release evidence

_Prepared 2026-08-26 ET_

## Decision

`alpha.15` is signed, Apple-notarized, stapled, independently verified, pushed, tagged, and
privately published for the approved operator/internal-QA cohort. It replaces `alpha.14` for JY's
hosted Meta and Apple Notes acceptance pass. It is not a research-participant release and does not
change the separate research or connector approval gates.

## Source and scope

- Exact signed source: `7024b3684358e417f31324d9bc9371cc33cbd243`.
- Annotated tag: `v0.1.0-alpha.15`; source and tag are pushed to `origin`.
- JY remains in exactly `Operators` and `MetaTesters`, not `Participants`, `ConnectorTesters`, or
  `Admins`.
- Cognito now refreshes cached sessions at launch and on a Meta recheck, so a new group grant is not
  hidden behind an unexpired one-hour ID token.
- Untouched new-agent setup moves to a ready hosted Meta provider when local Codex is unavailable.
  Codex remains an optional local provider and is not required for hosted Meta.
- Operator/model-tester sessions no longer trigger participant consent, research capture, research
  upload retries, or participant-only research API calls.
- The curated action surface adds one bounded `computer_open_app` action for Apple Notes only. The
  host launches fixed bundle ID `com.apple.Notes`; the model must then request a fresh window grant.

## Signed artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Sia-0.1.0-alpha.15-universal.dmg` | 257,733,722 | `fe03bcfcc8da1d5d56a48bb9b080e0bc753dad0324f78c1204341ad59122ee79` |
| `Sia-0.1.0-alpha.15-universal.zip` | 257,053,713 | `9f45c717afe7cb530ecb2a3fe0333a83a81e27c8554be8e120e6012f9d8cc735` |

- Signing identity: `Developer ID Application: Lawrence Jang (DXYJ578DD4)`.
- Bundle ID: `ai.sia.desktop`; app CDHash: `319fc8ff0f92a25fd06b74d1edd78e72aedcc7df`.
- App notarization: `c76760c5-36fa-4fe9-8d1a-e2afdc891a90`, accepted.
- DMG notarization: `1864838c-6823-4f4e-a4af-45da6f7586af`, accepted.
- Strict signing, Gatekeeper, staple validation, both native architectures, production cloud
  resource, release-key pinning, CUA runtime, MCP bridge, and bundled-license verification passed.

## Private publication

- DMG key:
  `releases/0.1.0-alpha.15/fe03bcfcc8da1d5d/Sia-0.1.0-alpha.15-universal.dmg`.
- ZIP key:
  `releases/0.1.0-alpha.15/9f45c717afe7cb53/Sia-0.1.0-alpha.15-universal.zip`.
- Manifest key:
  `manifests/macos/0.1.0-alpha.15/51a800e0f39c993012af0d8ab7ab2977d604375bed6679d4b801626b20c68f31.json`.
- Manifest SHA-256:
  `51a800e0f39c993012af0d8ab7ab2977d604375bed6679d4b801626b20c68f31`.
- The downloaded latest and immutable manifests are byte-identical. The Ed25519 signature verifies
  against the public key pinned in the app, and the signed artifact key, size, and hash match S3.
- The unauthenticated manifest request is denied with HTTP 401. The direct recipient URL served a
  one-byte range request with HTTP 206 without exposing the URL in logs.
- The recipient-specific seven-day JY record is
  `/Users/lawrencejang/.sia-release/jingyuk-alpha15-download.json`, mode `0600`, expiring
  `2026-09-02T19:21:07Z`. It must not be committed or posted publicly.

## Verification

- `pnpm check`: build, formatting, curated-surface guard, type checks, and 497 runnable tests passed;
  one credential-dependent Codex isolation smoke was intentionally skipped.
- `pnpm test:e2e`: 26 passed; four opt-in live-account/macOS-permission probes were skipped.
- Focused regression suite: 148 tests passed across identity refresh, provider selection, access
  policy, research isolation, Notes launch, and renderer behavior.
- GitHub Actions run `33004122526` passed the clean hosted-macOS build/quality gates, Electron E2E,
  and unsigned universal-package verification.
- A real host probe launched Apple Notes through bundle ID `com.apple.Notes` and confirmed the Notes
  process. The source-level backend test verifies that the canonical action delegates only this
  fixed target to the trusted host.
- Stack `sia-alpha` remains `UPDATE_COMPLETE`; all 17 `sia-alpha-*` alarms are `OK`. No cloud
  deployment was required for this desktop-only correction.

## Remaining exact-human acceptance

JY must install this `alpha.15` DMG, sign in as `jingyuk@andrew.cmu.edu`, confirm hosted Meta appears
without installing Codex, create a Meta agent, and approve one disposable Apple Notes creation. This
is the only remaining gate for the reported JY workflow. It also provides the first positive live
request to the authenticated update route from this operator account.

