# Sia 0.1.0-alpha.16 release evidence

_Prepared 2026-08-26 ET_

## Decision

`alpha.16` is the signed internal hotfix for JY's authenticated Codex CLI detection failure. It is
Developer ID signed, Apple-notarized, stapled, Gatekeeper-accepted, pushed, tagged, privately
published, and independently verified. It carries forward `alpha.15`'s hosted Meta, operator
research-isolation, and Apple Notes corrections.

This remains an operator/internal-QA release. It does not change or satisfy the separate research
participant and connector-distribution gates.

## Source and correction

- Exact signed source: `8730e0575c4e14d7bdf22ac054ec454b20860d42`.
- Annotated tag: `v0.1.0-alpha.16`; source and tag are pushed to `origin`.
- Finder-launched Sia now adds bounded, known CLI locations for Homebrew, the standalone installer,
  `nvm`, `fnm`, Volta, `asdf`, `nodenv`, Mise, Bun, pnpm, and npm-global. It does not execute a login
  shell or evaluate shell startup files.
- Version-manager traversal is bounded to 32 version directories per known manager root and ignores
  missing or invalid directories.
- `codex login status` now uses its exit status as the stable authentication signal rather than
  requiring the exact prose `Logged in using ChatGPT`. Explicit `not logged in`, authentication
  required, and missing-key responses still fail closed.
- The supported Codex version range and isolated app-server policy remain pinned; this hotfix does
  not silently accept an untested CLI protocol version.

## Signed artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Sia-0.1.0-alpha.16-universal.dmg` | 257,730,082 | `d1f9d1bf2b407fe840c60d045de9e48cca255c0ff149cced5ab5bd0f875a6230` |
| `Sia-0.1.0-alpha.16-universal.zip` | 257,055,038 | `178956e2a581382cb42120cb5c8ba2d7879ac22b91bd1edfb4b9d81c4d06cf92` |

- Signing identity: `Developer ID Application: Lawrence Jang (DXYJ578DD4)`.
- Bundle ID: `ai.sia.desktop`; app CDHash: `2510493717303999b269b589e463c0bb85f3b06c`.
- App notarization: `1a038cfb-d6c6-4705-bb32-958c3ddbbaa1`, accepted.
- DMG notarization: `3eb37e0b-bc15-42d0-b7a9-1ef8ad08404c`, accepted.
- Strict signing, Gatekeeper, staple validation, both native architectures, production cloud
  resource, release-key pinning, CUA runtime, MCP bridge, and bundled-license verification passed.

## Private publication

- DMG key:
  `releases/0.1.0-alpha.16/d1f9d1bf2b407fe8/Sia-0.1.0-alpha.16-universal.dmg`.
- ZIP key:
  `releases/0.1.0-alpha.16/178956e2a581382c/Sia-0.1.0-alpha.16-universal.zip`.
- Manifest key:
  `manifests/macos/0.1.0-alpha.16/2c8984cb23050f78e1472e6b9f36ee927c949d209994df896a393e0aea751928.json`.
- Manifest SHA-256:
  `2c8984cb23050f78e1472e6b9f36ee927c949d209994df896a393e0aea751928`.
- Latest and immutable manifests are byte-identical. The Ed25519 signature verifies against the key
  pinned in the app, and the signed artifact key, size, and hash match S3.
- The unauthenticated update request is denied with HTTP 401. The recipient URL served a one-byte
  range request with HTTP 206 without exposing the URL.
- JY's mode-`0600` recipient record is
  `/Users/lawrencejang/.sia-release/jingyuk-alpha16-download.json`, expiring
  `2026-09-02T19:44:23Z`.

## Verification

- `pnpm check`: build, formatting, quality policy, type checks, and 500 runnable tests passed; one
  credential-dependent isolation smoke remained intentionally opt-in.
- `pnpm test:e2e`: 26 passed; four opt-in real-environment probes skipped in the aggregate run.
- `SIA_REAL_CODEX_E2E=1 pnpm test:e2e:real:no-turn`: the real authenticated Codex probe passed inside
  Electron without starting a model turn; the unrelated Chrome and CUA probes were skipped.
- GitHub Actions run `33006154771` passed the clean hosted-macOS build/quality, Electron E2E, and
  unsigned universal-package checks.
- Stack `sia-alpha` remains healthy and all 17 `sia-alpha-*` alarms are `OK`. This desktop-only
  hotfix required no cloud deployment or access-policy change.

## Remaining exact-machine acceptance

JY must install `alpha.16`, open **Settings → Providers**, and use **Recheck** for Codex. A CLI in one
of the supported locations with a successful `codex login status` and supported version should show
as ready. If it does not, collect only `command -v codex`, `codex --version`, `codex login status`,
and the non-secret `CODEX_HOME` path; do not share credentials or token files.

