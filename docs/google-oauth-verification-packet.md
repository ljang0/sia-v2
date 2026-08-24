# Google OAuth verification packet

This is the operator-ready source for Sia's Google production verification submission. It contains
no client secret, OAuth code, token, connection ID, or participant content.

## Project and public identity

- Google Cloud project: `sia-production-connectors` (`Sia Production`)
- OAuth app name: `Sia`
- Operator account: `superintelligentagents@gmail.com`
- User type: External
- Publishing status: In production
- Homepage: `https://superintelligentagents.ai/`
- Privacy policy: `https://superintelligentagents.ai/privacy/`
- Terms: `https://superintelligentagents.ai/terms/`
- Participant notice: `https://superintelligentagents.ai/research/`
- Support: `https://superintelligentagents.ai/support/`
- Intended support email: `support@superintelligentagents.ai`
- Developer contact: `superintelligentagents@gmail.com`
- Authorized domain: `superintelligentagents.ai`
- Authorized redirect URI:
  `https://uve01q24la.execute-api.us-east-1.amazonaws.com/alpha/v1/oauth/google/callback`
- Consent-screen logo: `apps/site/public/assets/sia-oauth-logo.png` (120 by 120 PNG)

The public site identifies Sia, explains the optional Google features and research boundary, and
links the privacy policy without requiring sign-in. The site and desktop both state that Google
starts read-only and that editing or sending requires a separate permission upgrade.

## Implemented OAuth architecture

Sia owns the Google Web OAuth client. Authorization code with PKCE terminates at the exact AWS
callback above. Refresh tokens are encrypted with AWS KMS in a credential vault separated from
research records and are never returned to the desktop. The adapter can call only the fixed Gmail,
Drive, Docs, Sheets, and Slides API origins.

The connection has two deliberate levels:

1. **Connect Google** requests only read scopes. Gmail, Drive, Docs, Sheets, and Slides can then be
   enabled or disabled locally without another OAuth flow.
2. **Enable editing** requests the reviewed write scopes. The existing read grant remains active
   while the browser consent is pending. After the write grant is verified, Sia removes the
   superseded encrypted credential and switches the five services atomically.

A granular-consent response missing any selected scope is revoked best-effort and never saved. OAuth
state is single-use, PKCE-bound, and expires after ten minutes.

## Complete requested scope inventory

Google verification must cover the union of both user-visible connection levels even though Sia
does not request all scopes on first connection.

### Identity

- `openid`
- `email` (Google may return the canonical equivalent
  `https://www.googleapis.com/auth/userinfo.email`)

Sia uses the primary Google Account email only to label the connected account and bind the grant to
the correct signed-in Sia subject. It is not used for advertising, enrichment, or profiling.

### Read-only connection

- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/drive.readonly`
- `https://www.googleapis.com/auth/documents.readonly`
- `https://www.googleapis.com/auth/spreadsheets.readonly`
- `https://www.googleapis.com/auth/presentations.readonly`

`gmail.readonly` is used only when a person asks Sia to search, read, summarize, or reference email.
Message bodies are required for thread summaries and requested detail extraction, so metadata-only
access is insufficient. Sia does not index or bulk copy a mailbox.

`drive.readonly` lets the person ask Sia to find an existing file and inspect its metadata. The app
does not crawl, index, or bulk copy Drive. A task makes a bounded API request and returns the result
only into the person's visible local transcript.

The Docs, Sheets, and Slides read-only scopes let Sia read a resource selected or identified by the
person. The adapter accepts a resource ID or the corresponding Google URL. Sheets reads are bounded
to at most 500 rows per call. Read-only scopes cannot modify resources.

### Optional editor and sender upgrade

- `https://www.googleapis.com/auth/gmail.compose`
- `https://www.googleapis.com/auth/drive.file`
- `https://www.googleapis.com/auth/documents`
- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/presentations`

`gmail.compose` lets Sia create a Gmail draft and send it only after the person supplies or approves
the recipient, subject, and body. Draft creation gives the person a reviewable copy in Gmail. Sia
does not modify unrelated mailbox content.

`drive.file` is the narrow write scope used to upload and share files the person creates with or
explicitly provides to Sia. General Drive write access is not requested.

The full Docs, Sheets, and Slides scopes are requested only after **Enable editing**. They allow Sia
to create a resource or apply a bounded user-requested change. Consequential writes identify the
target and exact content before execution under the active approval policy.

## Google API data handling statement

Google Workspace access is optional and separately consented on Google's page. Sia accesses Google
data only to provide the user-facing task the person requested. Data is read live, is not bulk
copied, and is not used for advertising, model training, or generalized AI development.

Every turn that invokes Gmail, Drive, Docs, Sheets, or Slides is excluded in full from:

- AWS research uploads and the research archive;
- administrator research review;
- Sia's optional local diagnostic trajectory.

The exact prompt, connector result, and assistant response from that turn are excluded together.
The user-facing result can remain in the person's normal local Sia transcript until the person
deletes it. Operational metadata such as connection start, completion, failure, and disconnection
may be recorded without Google content, OAuth URLs, authorization codes, tokens, cookies, or client
secrets.

Sia's use and transfer of information received from Google APIs adheres to the Google API Services
User Data Policy, including the Limited Use requirements.

## Verification Center form copy

Feature category: **Email productivity** plus file productivity where the current form requests a
second category.

Read scopes justification:

> Sia is a macOS assistant that reads Gmail and Google Workspace files only when a person asks for a
> specific search, message, file, document, spreadsheet range, or presentation. Drive, Docs, Sheets,
> and Slides are read live and are not crawled, indexed, or bulk copied. Read-only Google connection
> is optional and separately revocable. Every turn invoking a Google Workspace connector is excluded
> in full from research uploads, the AWS research archive, administrator research review, the
> optional local diagnostic trajectory, advertising, generalized AI development, and model
> training. The result remains only in the person's ordinary local transcript until deletion.

Editor and sender scopes justification:

> Sia requests editing and sending only after the person presses Enable editing and completes a
> second Google consent. gmail.compose creates a reviewable Gmail draft and can send only the exact
> recipient, subject, and body supplied or approved by the person. drive.file supports files created
> with or explicitly supplied to Sia. The Docs, Sheets, and Slides editor scopes support bounded
> user-requested creation and changes; read-only scopes cannot perform those features. Sia does not
> bulk copy or index Workspace data. Every invoking turn is excluded in full from research and
> diagnostic capture, advertising, generalized AI development, and model training.

Do not submit until the reviewer video URL is accessible without a Google project membership.

## Reviewer demo video shot list

Record the final signed Sia app in English with a dedicated synthetic Google account. Do not expose
real participant content, credentials, one-time codes, tokens, or unrelated inbox material.

1. Show the public homepage, privacy policy, participant notice, terms, and support page.
2. Launch the signed app and show that chat, web, schedules, and computer use are available before a
   work app is connected.
3. Sign in with the reviewer Sia account and accept the current research notice.
4. Open Connected apps and show separate **Connect Google** and **Connect Slack** actions.
5. Press **Connect Google**, show the complete read-only consent screen, and approve every selected
   read permission.
6. Return to Sia and show the account label, five service switches, `Read-only`, and the separate
   **Enable editing** action.
7. Read one synthetic Gmail thread, Drive file, Doc, bounded Sheet range, and presentation.
8. Show that a requested write fails before approval with the recoverable **Enable editing** path.
9. Press **Enable editing**, show the second consent screen, and approve every selected editor and
   sender permission.
10. Create a synthetic Gmail draft, preview one bounded Docs change, update one bounded Sheets
    range, and create or update one synthetic presentation.
11. Turn selected services off and show those tools become unavailable without disconnecting the
    Google account.
12. Press **Disconnect** once and show the complete current grant is removed, then reconnect
    read-only.
13. Show the Google task in the normal local transcript and its absence from research export and the
    optional diagnostic trajectory.
14. Finish on the public privacy and support contacts.

Publish the video as unlisted YouTube or an equivalent reviewer-accessible link and verify it in an
incognito browser before submission.

## CASA readiness evidence

Prepare these items before Google or its assessor opens the restricted-scope security assessment:

- architecture and data-flow diagram showing desktop, API Gateway, control Lambda, credential vault,
  Google APIs, and the separate research archive;
- fixed outbound origin allowlist and exact scope inventory;
- KMS encryption context and credential separation evidence;
- OAuth state, PKCE, expiry, replay, partial-consent, revocation, and cross-user isolation tests;
- proof that request bodies, Google responses, and credentials are absent from AWS logs and research
  storage;
- dependency, static analysis, and vulnerability scan results for the submitted commit;
- incident response, vulnerability disclosure, deletion, support, and annual reassessment owners;
- the signed artifact hash and deployed Lambda manifest hash used in the reviewer video.

CASA completion is an external assessor decision. Local implementation and tests can make the packet
ready, but they cannot replace Google's verification or the assessor's approval.

## Submission order

1. Add the full union of read and optional write scopes to Google Auth Platform Data Access.
2. Confirm the homepage, privacy policy, terms, support email, logo, authorized domain, and exact
   production callback in Branding and Clients.
3. Record and publish the reviewer demo using the submitted app, client, and scope set.
4. Open Verification Center, paste the justifications above, attach the accessible video, and
   submit from a project owner or editor account.
5. Respond to the Google verification thread without changing production scopes or behavior during
   review.
6. Complete CASA when Google Trust and Safety opens that restricted-scope step, then record the
   annual reassessment owner and renewal date.
