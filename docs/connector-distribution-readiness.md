# Connector distribution readiness

Use this as the go/no-go contract before offering Google Workspace or Slack to anyone outside the
approved internal tester list. Passing local tests is necessary but does not make a provider OAuth
app publicly distributable.

## Definition of out of the box

A fresh invited participant, who has never been added to a provider test-user list, can:

1. Sign in to Sia, review the research consent, and use chat, web search, schedules, and computer
   use without connecting a work app.
2. Open **Settings → Apps** and press **Connect Google** once. One Google-owned read-only consent
   connects Gmail, Drive, Docs, Sheets, and Slides; the participant can turn each service on or off
   without another OAuth round trip.
3. Press **Connect Slack** separately and select any workspace in which the participant is allowed
   to install apps. Google and Slack remain independently disconnectable.
4. See the connected account or workspace in Settings, complete a read, choose **Enable editing**
   for a separate write consent when needed, complete an explicitly targeted write, disconnect, and
   reconnect without operator intervention.
5. Receive a specific, recoverable message for provider denial, administrator policy, timeout,
   offline status, or a stale saved grant. A missing connector offers signed-in Chrome as an
   immediate browser/computer-use fallback. They must never be sent into a repeated consent loop.
6. Produce the expected local trajectory and encrypted AWS `raw_v1` events while OAuth URLs, codes,
   tokens, cookies, and client secrets remain excluded. Google Workspace action turns must also be
   absent from both research batches and the diagnostic trajectory; they remain only in the normal
   local user-facing transcript.

Until every unchecked item below passes, describe connectors as **internal alpha only**, not as
working out of the box for arbitrary users.

Alpha.20 internal-test update (2026-08-27): JY is enrolled as a named `ConnectorTester`. A disposable
production-stack smoke confirmed Google read-only consent-link creation, cancellation, and cleanup,
plus Slack install-link creation and cleanup. No provider account was accessed. JY's fresh-account
read, denial, disconnect, restart, and reconnect results remain required; this does not close any
public-distribution checkbox below.

## Google Workspace production gate

- [x] Deploy the Sia-owned authorization-code + PKCE callback and direct Google API adapter. Never
      use a broad managed connector consent app for Google Workspace.
- [ ] Add the complete progressive scope union from `docs/google-oauth-verification-packet.md` to
      Google Auth Platform. Reject unexpected contacts, profile-write, full Drive write, or
      unrelated scopes.
- [x] Configure the production homepage, privacy policy, terms, authorized domains, the exact AWS
      callback URI, and verify the production site in Google Search Console.
- [x] Move the External OAuth app from Testing to In production, automatically verify the public
      brand, and publish the verified brand to users.
- [ ] Upload the consent-screen logo and select the intended public support alias when Google makes
      those values eligible. The public support alias already delivers externally; Google currently
      shows the verified brand with the operator support address and no logo.
- [ ] Submit brand and sensitive-scope verification when Google marks it as required. Do not treat
      the unverified-app bypass or the 100-test-user allowance as a release path.
- [x] Deploy the KMS-encrypted Google token vault, one-time OAuth-state table records, fixed Google
      API origin allowlist, and matching control Lambda contract.
- [x] Create the dedicated Web OAuth client under the operator Google account, add the exact
      deployed callback URI, and install its client ID/secret in the AWS Google secret.
- [ ] Test from two fresh non-tester Google accounts on different domains. Verify all five grants,
      cancellation after each step, restart/resume, transient-network recovery, revocation, and
      reconnect.
- [x] Confirm the initial connection can read but cannot mutate Gmail, Drive, Docs, Sheets, or
      Slides. The cloud rejects write tools with `google_access_upgrade_required` before creating an
      approval or calling Google.

Current console audit (2026-08-24): the audience is External and **In production**, and the public
brand is verified and shown to users. The Sia-owned Web client uses the exact AWS callback and its
credential is installed in the encrypted AWS secret. The public site is verified in Search Console.
The progressive read-only/editor flow is deployed in alpha.9. The complete scope union still needs
to be added to Google Auth Platform Data Access before a fresh production connection can be treated
as supported or the reviewer video can be recorded. The consent-screen logo, public support alias
selection, reviewer video, scope verification, and CASA remain open.

Alpha.9 progressive-access update (2026-08-24): Sia now requests read-only Gmail, Drive, Docs,
Sheets, and Slides access on first connection. A separate **Enable editing** action requests the
reviewed compose, `drive.file`, and editor scopes while the old read grant remains usable. The cloud
verifies the new grant before the desktop switches and then removes the superseded credential. Local
service switches and per-tool scopes are enforced before any provider call. Do not describe Google
as generally available until the progressive scope union is configured, the reviewer video, Google
review and CASA are complete, and the fresh-account matrix finishes.

Public-site launch update (2026-08-23): the homepage, participant notice, privacy policy, terms,
support page, security contact, sitemap, and OAuth logo are deployed behind the locked-down AWS
CloudFront distribution recorded in `public-site-launch.md`. The apex and `www` records are live on
public resolvers, the custom certificate is issued and attached, and the four public mail aliases are
configured without changing the existing MX/SPF/DKIM/DMARC records. A verified SES message from
`hello@superintelligentagents.ai` to the public support alias arrived in the operator inbox through
the production forwarding path. An unrelated-domain sender check and the Google data-access
verification submission remain open gates.

Alpha.5 live update (2026-08-24): the provider's current Gmail `20260817_00` and Drive
`20260821_00` schemas are pinned in source and AWS. A healthy acceptance account passed Gmail,
Drive, and Slack read-only execution. Its Drive grant had no Docs, Sheets, or Slides resources, so
the three editor content reads still need designated fixtures. The main administrator's older
Google grants returned HTTP 410 despite a shallow ACTIVE status. Alpha.5 now persists those grants
as failed, audits `connection_reconnect_required`, and presents the normal reconnect path instead
of silently restoring the misleading status. The stale Google records were marked failed; the
working Slack grant was preserved.

The exact signed alpha.5 artifact additionally passed a clean temporary-profile launch, local-only
onboarding, required workspace selection, first-agent and first-thread creation, quit, relaunch, and
state restoration. A control-table audit kept the acceptance and administrator connection sets
strictly separated. This is one-profile evidence only and does not satisfy the required two-profile,
two-provider-identity matrix below.

Alpha.6 follow-up (2026-08-24): designated private Docs, Sheets, and Slides fixture creation reached
all three real editor tools, but each grant returned a nested Google 401 before creating a resource.
Composio returned no resource IDs, so no fixtures or duplicates exist. The cloud now converts nested
401/403/410 provider failures directly to `connection_reconnect_required`; the signed alpha.6 app
immediately marks only that app as expired and replaces its stale grant through one **Reconnect**
click. The three fixture creates and reads remain pending fresh provider consent.

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
the eight reviewed user scopes. A fresh browser OAuth install connected Russ Lab without a plugin,
desktop Slack dependency, developer-console login, API key, or client secret. The deployed control
plane reconciled the grant as connected and live `slack.find_users` plus `slack.search` reads returned
`executed`; no DM was opened and no message was posted. The previously exposed token and its stale
records remain revoked and deleted. A second unrelated-workspace acceptance, exact write preview and
approved synthetic send, revocation, and reconnect remain.

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
