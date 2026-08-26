# Sia `0.1.0-alpha.15` internal-operator handoff

_Prepared 2026-08-26 ET_

## Outcome

`alpha.15` fixes both blockers JY hit. Hosted Meta no longer depends on a local Codex installation,
and Sia can launch Apple Notes before asking macOS for a live Notes window. It also closes the
access-policy bug that showed research consent and retried participant-only uploads for an internal
operator/model tester.

The exact build is Developer ID signed, Apple-notarized, stapled, Gatekeeper-accepted, tagged,
pushed, and privately published. Full local and hosted-macOS gates are green. Use it for approved
operator/internal QA only; research and connector release approvals remain separate.

## Give JY the build

The recipient-specific record is
`/Users/lawrencejang/.sia-release/jingyuk-alpha15-download.json` with mode `0600`. Copy only its
`downloadUrl` value into a direct private message to `jingyuk@andrew.cmu.edu`. The URL expires
`2026-09-02T19:21:07Z`; do not paste it into Git, a public page, analytics, or a broad channel.

JY should replace `alpha.14` with `alpha.15`, sign in with the same email, and open **New agent**.
The dialog should select **Meta** automatically even if Codex says **Not installed**. For the Notes
check, ask Sia to create a disposable note and approve the app-open/computer action when prompted.

## Evidence and honest boundary

- Exact source/tag: `7024b3684358e417f31324d9bc9371cc33cbd243` / `v0.1.0-alpha.15`.
- Complete evidence: [`release-evidence-2026-08-26-alpha.15.md`](./release-evidence-2026-08-26-alpha.15.md).
- JY is confirmed in `Operators` + `MetaTesters`; all 17 production alarms are `OK`.
- Local `pnpm check`, 26-test Electron E2E, signed-package verification, private-manifest signature
  verification, and GitHub Actions run `33004122526` passed.
- The remaining check cannot be impersonated from this Mac: JY must complete the email-code sign-in
  and one real Meta/Notes task in the exact signed app. No research signoff or `Participants` grant
  is needed for that internal operator test.
