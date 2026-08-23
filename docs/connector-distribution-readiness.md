# Connector distribution readiness

Use this as the go/no-go contract before offering Google Workspace or Slack to anyone outside the
approved internal tester list. Passing local tests is necessary but does not make a provider OAuth
app publicly distributable.

## Definition of out of the box

A fresh invited participant, who has never been added to a provider test-user list, can:

1. Sign in to Sia, review the research consent, and use chat, web search, schedules, and computer
   use without connecting a work app.
2. Open **Settings → Apps** and press **Connect work apps** once. Gmail, Drive, Docs, Sheets, Slides, and Slack complete in
   sequence, with already-connected apps preserved after cancellation or restart. Slack still lets
   the participant select any workspace in which they are allowed to install apps.
3. Choose **Choose apps** instead, select any subset, and complete only those approvals. Connected
   apps remain independently disconnectable, and omitted apps remain available to connect later.
4. See the connected account or workspace in Settings, complete a read and an explicitly targeted
   write, disconnect, and reconnect without operator intervention.
5. Receive a specific, recoverable message for provider denial, administrator policy, timeout,
   offline status, or a stale saved grant. A missing connector offers signed-in Chrome as an
   immediate browser/computer-use fallback. They must never be sent into a repeated consent loop.
6. Produce the expected local trajectory and encrypted AWS `raw_v1` events while OAuth URLs, codes,
   tokens, cookies, and client secrets remain excluded. Google Workspace action turns must also be
   absent from both research batches and the diagnostic trajectory; they remain only in the normal
   local user-facing transcript.

Until every unchecked item below passes, describe connectors as **internal alpha only**, not as
working out of the box for arbitrary users.

## Google Workspace production gate

- [x] Create Sia-owned custom Composio auth configs for Gmail, Drive, Docs, Sheets, and Slides from
      the production Google OAuth client. Never use a broad managed Composio consent app.
- [x] Confirm the exact consent-screen scopes match `docs/provider-policy.md`; reject unexpected
      contacts, profile-write, full-Drive, or unrelated scopes.
- [x] Configure the production homepage, privacy policy, terms, authorized domains, reviewed Composio
      redirect URIs, and verify the production site in Google Search Console.
- [x] Move the External OAuth app from Testing to In production, automatically verify the public
      brand, and publish the verified brand to users.
- [ ] Upload the consent-screen logo and select the intended public support alias when Google makes
      those values eligible. The public support alias already delivers externally; Google currently
      shows the verified brand with the operator support address and no logo.
- [ ] Submit brand and sensitive-scope verification when Google marks it as required. Do not treat
      the unverified-app bypass or the 100-test-user allowance as a release path.
- [x] Update the KMS-encrypted connector secret with all five custom auth-config IDs and deploy the
      matching control Lambda contract.
- [ ] Test from two fresh non-tester Google accounts on different domains. Verify all five grants,
      cancellation after each step, restart/resume, transient-network recovery, revocation, and
      reconnect.
- [x] Confirm `drive.file` cannot browse pre-existing Drive files unless the user explicitly opens
      or shares them with Sia. A live production search over the connected test account returned zero
      files while normal pre-existing Drive content remained outside the app grant.

Current console audit (2026-08-23): the reviewed scopes are configured, the audience is External and
**In production**, and the public brand is verified and being shown to users. Homepage, privacy,
terms, `composio.dev`, and `superintelligentagents.ai` are saved; both reviewed Composio redirect
URIs are present; and the production site is verified in Search Console by the deployed HTML tag.
The consent-screen logo is not uploaded and the selected support email remains the operator Gmail
address. Verification Center is open but cannot be submitted until the reviewer video URL is added.

One clean Google client secret now backs all five custom Composio auth configs. A secret exposed to
operator output and the superseded secret were both disabled and permanently deleted. Fresh Gmail
and Drive consent with `ljang@andrew.cmu.edu` completed token exchange after the rotation. Gmail,
Drive, Docs, Sheets, and Slides reconciled as connected and fresh `mail.search`, `drive.search`,
`docs.read`, `sheets.read`, and `slides.read` calls all returned `executed` through the deployed
control plane. The remaining second-account attempts reached Google re-verification and stopped at
passkey/SMS confirmation; no bypass was attempted and their pending records were removed. Do not
describe Google as generally verified or out of the box until the reviewer video, data-access review,
CASA, and fresh-account matrix finish.

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
