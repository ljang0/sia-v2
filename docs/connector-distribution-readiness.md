# Connector distribution readiness

Use this as the go/no-go contract before offering Google Workspace or Slack to anyone outside the
approved internal tester list. Passing local tests is necessary but does not make a provider OAuth
app publicly distributable.

## Definition of out of the box

A fresh invited participant, who has never been added to a provider test-user list, can:

1. Sign in to Sia and review the research consent.
2. Press **Connect work apps** once. Gmail, Drive, Docs, Sheets, Slides, and Slack complete in
   sequence, with already-connected apps preserved after cancellation or restart. Slack still lets
   the participant select any workspace in which they are allowed to install apps.
3. Choose **Choose apps** instead, select any subset, and complete only those approvals. Connected
   apps remain independently disconnectable, and omitted apps remain available to connect later.
4. See the connected account or workspace in Settings, complete a read and an explicitly targeted
   write, disconnect, and reconnect without operator intervention.
5. Receive a specific, recoverable message for provider denial, administrator policy, timeout,
   offline status, or a stale saved grant. They must never be sent into a repeated consent loop.
6. Produce the expected local trajectory and encrypted AWS `raw_v1` events while OAuth URLs, codes,
   tokens, cookies, and client secrets remain excluded.

Until every unchecked item below passes, describe connectors as **internal alpha only**, not as
working out of the box for arbitrary users.

## Google Workspace production gate

- [x] Create Sia-owned custom Composio auth configs for Gmail, Drive, Docs, Sheets, and Slides from
      the production Google OAuth client. Never use a broad managed Composio consent app.
- [x] Confirm the exact consent-screen scopes match `docs/provider-policy.md`; reject unexpected
      contacts, profile-write, full-Drive, or unrelated scopes.
- [ ] Configure the production homepage, privacy policy, support contact, authorized domains, and
      redirect URI, then move the External OAuth app from Testing to In production.
- [ ] Submit brand and sensitive-scope verification when Google marks it as required. Do not treat
      the unverified-app bypass or the 100-test-user allowance as a release path.
- [x] Update the KMS-encrypted connector secret with all five custom auth-config IDs and deploy the
      matching control Lambda contract.
- [ ] Test from two fresh non-tester Google accounts on different domains. Verify all five grants,
      cancellation after each step, restart/resume, transient-network recovery, revocation, and
      reconnect.
- [ ] Confirm `drive.file` cannot browse pre-existing Drive files unless the user explicitly opens
      or shares them with Sia.

Current console audit (2026-08-23): `ljang@andrew.cmu.edu` is an approved test user and the reviewed
scopes are configured, but publishing is still **Testing** with one test user. Homepage,
privacy-policy, and terms fields are blank and verification has not started. The superseded August
17 OAuth client secret was disabled, a new Docs grant and read proved the August 22 replacement, and
the old secret was then permanently deleted. Docs, Sheets, and Slides each retain one connected test
grant and passed a read-only live action. Do not describe Google as public or out of the box yet.

## Slack production gate

- [x] Create the Sia-owned Slack app from `infra/slack-app-manifest.yaml`; confirm its scopes exactly
      match `docs/provider-policy.md`.
- [x] Create the custom Composio Slack auth config and store its client credentials only in the
      provider configuration. Never grant the broad managed Composio Slack app.
- [x] Configure OAuth redirect URLs and unlisted public Slack distribution. Complete any workspace-administrator
      approval required by the target workspace.
- [x] Update the KMS-encrypted connector secret with the custom Slack auth-config ID and the complete
      twenty-three-tool/version contract, then deploy the matching control Lambda.
- [ ] Test in two unrelated workspaces: connect, find a person by name, open/reuse the exact DM,
      review the resolved recipient and text, send, search, read a thread, revoke, and reconnect.

Current console audit (2026-08-23): public distribution is active and the share URL contains exactly
the eight reviewed user scopes. Russ Lab now retains one acceptance grant and `slack.find_users`
passed without opening a DM or posting. The console's daily installation counter still reports zero;
a second unrelated-workspace acceptance, write-preview/send pass, revocation, and reconnect remain.

## Cross-account and failure acceptance

- [x] Composio entities are keyed by the signed-in Sia subject, not a shared application identity.
- [x] Cloud tests prove one Sia user cannot list or revoke another user's saved provider grant.
- [x] Desktop tests prove partial Google setup resumes without replacing completed grants.
- [x] Desktop polling survives a transient provider-status/network error without abandoning the
      pending grant.
- [ ] Run the signed release artifact from two fresh macOS profiles with separate Sia, Google, and
      Slack identities; verify no account label, connection ID, trajectory, or archive event crosses
      identities.
- [ ] Exercise denial, browser close, offline/reconnect, two-minute timeout, app restart, provider
      revocation, expired Google test grant, workspace-admin rejection, and server kill switch.
- [ ] Verify every connection lifecycle and tool action appears in the participant's local viewer
      and AWS archive, and that the administrator viewer remains MFA- and group-gated with immutable
      metadata-only access auditing.

## Release evidence

Attach the following to `docs/release-evidence-YYYY-MM-DD.md`:

- Google publishing and verification state, approved scope list, and test date (no credentials).
- Slack distribution state, manifest hash, approved scope list, and test date (no credentials).
- Deployed auth-config aliases/opaque IDs, tool-contract count, Lambda version, signed artifact hash,
  test commands and counts, and fresh-account acceptance results.
- Confirmation that all disposable grants were revoked and all test workspaces/files/messages were
  cleaned up.
