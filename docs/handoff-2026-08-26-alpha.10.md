# Sia `0.1.0-alpha.10` handoff

_Authoritative continuation state as of 2026-08-26 KST_

## Start here

Sia is a local-first macOS assistant in the private `ljang0/sia-v2` repository. The working copy is
`/Users/lawrencejang/sia_new` on branch `main`.

The immediate engineering issue is fixed, tested, deployed, signed, and notarized: upgrading a
Google Workspace connection from read-only to editor access no longer revokes the shared Google
authorization grant. Live acceptance is **not finished**, however. A fresh Google consent and the
synthetic write/read-back matrix still need a human at the provider boundary. Do not describe Google
editing as release-verified until that matrix passes.

The current source tree is dirty. The `alpha.10` artifact was built from the uncommitted changes
listed below on top of commit `5a673af48c14485f1b831ae5220b0b7043b02dda`. Commit or otherwise
immutably identify the exact source and refresh release evidence before distributing the artifact.

Never copy credentials from chat history, Keychain, AWS Secrets Manager, or browser OAuth URLs into
this document, source code, logs, test fixtures, or shell history.

## What happened

On `alpha.9`, Google Workspace showed `editing enabled`, but the first bounded live write failed:

- Gmail draft creation returned `connection_reconnect_required`.
- Docs, Sheets, and Slides creation returned `User denied the action` after the unified Google
  connection had already become invalid.
- No draft was sent and no Doc, Sheet, or Slides fixture was created.
- All five Google service rows changed to **Needs attention**. Slack remained connected.

Metadata-only CloudWatch events established the failure order:

1. the read-write OAuth connection completed successfully;
2. the desktop disconnected the superseded read-only connection two seconds later;
3. the first Gmail write returned `connection_reconnect_required`.

The upgrade path used ordinary disconnect cleanup. The direct Google connector decrypts the old
refresh token and calls Google's revoke endpoint during disconnect. Multiple refresh tokens for the
same user/client can represent one authorization grant, so revoking the old token invalidated the
new editor token too.

## Implemented fix

The new path retires only Sia's encrypted copy of the superseded credential. It never calls Google's
revoke endpoint during an upgrade. An intentional user-facing **Disconnect Google** still revokes
provider access.

Main changes:

- `apps/cloud/src/ports.ts`
  - adds the narrowly scoped optional `retireSuperseded(connectionId)` provider operation;
- `apps/cloud/src/google-workspace.ts`
  - removes the superseded access-token cache entry and encrypted refresh-token record locally;
  - keeps normal disconnect/revoke behavior unchanged;
  - rejects non-Google use through the hybrid connector;
- `apps/cloud/src/services.ts`
  - adds `retireSupersededGoogle(...)`;
  - requires the replacement to belong to the signed-in Sia user, be a connected
    `google_workspace` editor grant, use a different connection ID, and match the prior Google
    account before removing anything;
  - writes a metadata-only `connection.superseded` audit event;
- `apps/cloud/src/router.ts`
  - adds authenticated `POST /v1/connections/google_workspace/retire-superseded`;
- `apps/desktop/src/main/cloud-client.ts`
  - adds the matching cloud request;
- `apps/desktop/src/main/controller.ts`
  - uses safe retirement instead of `disconnect('gmail', previousId)` after editor OAuth succeeds;
- cloud and desktop regression tests cover the connector, control-plane validation, HTTP client,
  and desktop handoff behavior.

Version and release notes were advanced to `0.1.0-alpha.10`.

## Verification completed

`pnpm check` passed before release packaging:

- cloud: 111 passed;
- desktop: 298 passed;
- shared packages: 54 passed;
- total: 463 passed;
- the one explicit real Codex-isolation smoke test remained skipped by design;
- build, Prettier, quality guard, and every workspace typecheck passed.

Additional release checks passed:

- `sam validate --lint --template-file infra/template.yaml --region us-east-1`;
- strict application and DMG signatures;
- app and DMG Gatekeeper assessment;
- app and DMG notarization/stapling;
- universal/native architecture checks;
- packaged cloud configuration, license corpus, CUA probe, and MCP bridge verification.

## AWS deployment

- Account: `677513020767`
- Region: `us-east-1`
- Stack: `sia-alpha`
- API: `https://uve01q24la.execute-api.us-east-1.amazonaws.com/alpha`
- Stack status: `UPDATE_COMPLETE`
- Last update: `2026-08-24T16:50:04.578Z`
- Resource replacement: none
- Alarms: all 15 `sia-alpha-*` alarms are `OK` with actions enabled

Deployed reproducible Lambda bundle manifest:

| Bundle   | SHA-256                                                            |
| -------- | ------------------------------------------------------------------ |
| control  | `8d8093669402cca3dd4df303f98b395a00b89f700b75aa41f763fb5798abc8dd` |
| meta     | `f2adc8d53dca75bde70e0ae3209158e2a44734c220eedf7e2c8097b8a4fa847e` |
| deletion | `d58d82e2ecb07f9efc156a1d3d9fd9596471b094e7fe0310f61de4a4a422ec14` |
| export   | `610608410a6fa11097e62d87a4dc9ebfe3e32d7b5cff0701ba0beaaa63d66e5e` |

The deployment preserved the existing Cognito-default email sender and intentionally blank SES
source fields. SES production delivery is still a release gate; do not claim that it was completed
by this deployment.

## Signed `alpha.10` artifacts

Current packaged app:

- `apps/desktop/release/mac-universal/Sia.app`

Distribution artifacts:

| Artifact                                                |       Bytes | SHA-256                                                            |
| ------------------------------------------------------- | ----------: | ------------------------------------------------------------------ |
| `apps/desktop/release/Sia-0.1.0-alpha.10-universal.dmg` | 257,673,057 | `e494cc638d696f7b548a76af9788e54df7cfd8197c513a3aed74fe21224a09e0` |
| `apps/desktop/release/Sia-0.1.0-alpha.10-universal.zip` | 257,019,960 | `217a82bcc9aa764c28acd4cb43c7089dc04e7fc9e6c713876be70fbf4c0abe8c` |

- Signing identity: `Developer ID Application: Lawrence Jang (DXYJ578DD4)`
- App notarization: `cc7704eb-67c9-43c0-acb4-a968550ce623`, accepted
- DMG notarization: `394b9b91-52e9-46e5-88d9-6f22c6319257`, accepted
- Rollback copies:
  - `releases/0.1.0-alpha.9/`
  - `releases/0.1.0-alpha.10/`

The signing/notary profile remains in the secured operator Keychain. Do not add Apple credentials or
app-specific passwords to the repository or environment files.

## Live acceptance state

The exact packaged `alpha.10` application was restarted and inspected. It showed:

- signed-in Sia research account unchanged;
- Slack still connected;
- all five Google services requiring reconnect because of the earlier `alpha.9` token-revocation
  failure.

A fresh read-only Google OAuth attempt was started. The first link opened in a hidden Chrome profile
and timed out. A second link reached Google's **Choose an account** screen in the Chrome profile
`Lawrence (andrew.cmu.edu)`, on a tab titled **Sign in - Google Accounts**. No account or permission
was selected in the final observed state. The OAuth URL contained one-time state and was deliberately
not logged here.

Those links were created on 2026-08-25 and are expired now. Do not reuse them. Cancel any stale
`Connecting` state in Sia and generate one fresh link.

## Exact continuation procedure

Use the signed `alpha.10` app and benign fixtures only.

1. Open `apps/desktop/release/mac-universal/Sia.app` and confirm the bundle version is
   `0.1.0-alpha.10`.
2. Go to **Settings → Apps**. If Google is still `Connecting`, choose **Cancel setup**. Then choose
   **Connect Google** once.
3. In Chrome, switch to the profile `Lawrence (andrew.cmu.edu)` and open the new
   **Sign in - Google Accounts** tab. Use `ljang@andrew.cmu.edu` only for this operator acceptance.
4. A human must handle any Google unverified-app warning and the final permission grant. Select all
   requested read-only Gmail, Drive, Docs, Sheets, and Slides permissions. Computer automation must
   not bypass the browser warning.
5. Wait for Sia to show all five services connected with read-only access. Run one bounded read per
   service against designated synthetic fixtures only.
6. Choose **Enable editing**. Complete the second Google consent with the same account and every
   requested compose/editor permission. Again, a human performs the warning/permission step.
7. Confirm Sia shows `5 of 5 services available, editing enabled`.
8. Inspect metadata-only CloudWatch logs. The expected upgrade sequence is:
   - `connection.oauth.completed` for the editor connection;
   - `connection.superseded` for the old read credential;
   - no `connection.disconnect` for the old credential during upgrade;
   - no `connection_reconnect_required` on the first editor action.
9. Run the bounded synthetic matrix with one unique marker:
   - create a Gmail draft to `ljang@andrew.cmu.edu`; **do not send**;
   - create a Google Doc containing the marker;
   - create a Google Sheet with the marker in a bounded range;
   - create a one-slide Google Slides presentation containing the marker;
   - read back only those four created fixtures and record their opaque IDs/URLs.
10. Do not share, send, delete, or read unrelated real content. Fixture cleanup requires a separate
    explicit human decision because deletion is consequential.
11. Verify Google tool turns remain excluded from local trajectory/research upload as documented,
    and verify CloudWatch contains metadata only—never OAuth URLs, codes, tokens, message bodies, or
    file contents.

If the first editor action still fails, stop. Preserve the exact request ID and metadata-only event
sequence, but do not retry in a loop or repeatedly reconnect/revoke the account.

## Current modified source

The intended `alpha.10` change set currently modifies:

```text
RELEASE_NOTES.md
package.json
apps/desktop/package.json
apps/desktop/src/main/cloud-client.ts
apps/desktop/src/main/cloud-client.test.ts
apps/desktop/src/main/controller.ts
apps/desktop/src/main/controller.test.ts
apps/cloud/src/ports.ts
apps/cloud/src/google-workspace.ts
apps/cloud/src/memory.ts
apps/cloud/src/router.ts
apps/cloud/src/services.ts
apps/cloud/test/control-plane.test.ts
apps/cloud/test/google-workspace.test.ts
```

This handoff document and the root `HANDOFF.md` pointer are additional documentation changes. Do not
discard unrelated user changes if more appear in the tree.

Recommended source-freeze sequence after live acceptance:

```sh
git status --short
git diff --check
pnpm check
sam validate --lint --template-file infra/template.yaml --region us-east-1
```

Review the diff, commit it to the private `ljang0/sia-v2` repository, record the commit hash, and
create a new `alpha.10` release-evidence file. If any packaged source changes after the current
artifact, rebuild, resign, renotarize, restaple, and replace the hashes above.

## Remaining external-distribution gates

The connector fix does not close these gates:

1. **Google**: finish the two-stage live matrix, record the reviewer video, submit the complete
   progressive scope union for Google verification, and complete CASA if Google requests it. The
   unverified-app warning remains until Google approves the OAuth application.
2. **Slack**: complete read/revoke/reconnect in a second unrelated workspace and one explicitly
   approved benign send with an exact recipient/message preview.
3. **Email signup**: migrate Cognito from the default sender to monitored SES production delivery,
   then verify email-code delivery on at least one unrelated external domain.
4. **Research release**: fill every named owner and signature in
   `docs/research-release-signoff.md`; engineering checks are not institutional/legal approval.
5. **Fresh-machine acceptance**: exercise signup, local escape, Google/Slack cancellation,
   restart/offline recovery, research viewer/export/deletion, and rollback on clean macOS profiles.
6. **Source identity**: commit or immutably freeze the exact source, add `alpha.10` evidence, and
   ensure artifact hashes match the distribution decision.

Core local Sia may continue to be evaluated without Google or Slack. Schedules run only while Sia is
open and the Mac is awake; there is no always-on cloud workcell or OS cron daemon.

## Useful references

- `docs/release.md`
- `docs/manual-acceptance.md`
- `docs/google-oauth-verification-packet.md`
- `docs/connector-distribution-readiness.md`
- `docs/research-release-signoff.md`
- `docs/provider-policy.md`
- `docs/architecture.md`
- `infra/README.md`
