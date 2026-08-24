# Google OAuth verification packet

This document is the operator-ready source for the Sia production verification submission. It
contains no client secret, OAuth code, token, connection ID, or participant content.

## Project and public identity

- Google Cloud project: `sia-production-connectors` (`Sia Production`)
- OAuth app name: `Sia`
- Operator account: `superintelligentagents@gmail.com`
- User type: External
- Intended publishing status: In production
- Homepage: `https://superintelligentagents.ai/`
- Privacy policy: `https://superintelligentagents.ai/privacy/`
- Terms: `https://superintelligentagents.ai/terms/`
- Participant notice: `https://superintelligentagents.ai/research/`
- Support: `https://superintelligentagents.ai/support/`
- Intended user support email: `support@superintelligentagents.ai`
- Current console selection: `superintelligentagents@gmail.com` until the public alias is eligible
  for selection and its external delivery test passes
- Developer contact: `superintelligentagents@gmail.com`
- Authorized domain to retain: `superintelligentagents.ai`
- Authorized redirect URI:
  `https://uve01q24la.execute-api.us-east-1.amazonaws.com/alpha/v1/oauth/google/callback`
- Consent-screen logo: `apps/site/public/assets/sia-oauth-logo.png` (120 by 120 PNG)

The homepage publicly identifies Sia, explains connected Google features and research capture, links
the matching privacy policy, and is accessible without signing in. The privacy policy separately
describes Google API data, optional provider consent, task-visible research capture, service
providers, retention, export, deletion, and the Google Limited Use requirements.

Current submission state (2026-08-23 KST): Branding has the homepage, privacy, terms, and both
authorized domains saved. The exact production HTTPS origin is verified in Search Console through a
deployed HTML meta tag. Audience is External and **In production**. Google automatically verified the
brand against the public site and the verified brand is being shown to users. Verification Center is
open and correctly requires scope justification, intended Gmail data usage, and a demo-video URL for
the three sensitive editor scopes and two restricted Gmail scopes. The logo and public support alias
are not selected in Google because the console file chooser and email selector did not accept them;
the public support alias itself is live and externally delivered. The reviewer video, data-access
submission, Google review, and CASA assessment remain open.

Alpha.7 replaces the five per-service Composio Google grants with one Sia-owned Web OAuth grant.
Authorization code + PKCE terminates at the exact AWS callback above; refresh tokens are KMS-encrypted
in a credential vault separated from research records and are never returned to the desktop. The
direct adapter can call only the fixed Gmail, Drive, Docs, Sheets, and Slides API origins. The
dedicated Web client still needs to be created under the production operator account and installed
into the empty AWS Google secret before the fresh read-only reviewer pass. No Google OAuth secret is
stored in this repository or in this packet.

## Exact reviewed scopes and justifications

### `https://www.googleapis.com/auth/userinfo.email`

Sia uses the primary Google Account email only to label the connected account, reconcile connection
state with the correct signed-in Sia subject, and help the user distinguish multiple Google accounts.
It is not used for advertising, contact enrichment, or unrelated identity profiling.

### `https://www.googleapis.com/auth/drive.file`

Sia lets a user find, read, upload, update, and share only files that the user creates with Sia or
explicitly opens or shares with Sia. This scope is the narrowest Drive scope that supports those
user-facing features. Sia does not use a full-Drive scope and does not bulk browse or copy a user's
existing Drive.

### `https://www.googleapis.com/auth/documents`

Sia reads a Google Doc selected by the user and can create or apply bounded edits when the user asks.
Read actions return document content into the visible task. Write actions name the target and show a
preview for explicit approval. A read-only scope is insufficient because creating and updating a
document is a prominent user-facing feature.

### `https://www.googleapis.com/auth/spreadsheets`

Sia reads a selected spreadsheet and can create or update bounded ranges when the user asks. Read
actions return the requested range into the visible task. Write actions identify the spreadsheet,
range, and values for explicit approval. A read-only scope is insufficient because spreadsheet
creation and editing are prominent user-facing features.

### `https://www.googleapis.com/auth/presentations`

Sia reads a selected presentation and can create or update slides when the user asks. Read actions
return requested presentation content into the visible task. Write actions identify the presentation
and planned change for explicit approval. A read-only scope is insufficient because presentation
creation and editing are prominent user-facing features.

### `https://www.googleapis.com/auth/gmail.readonly`

Sia searches and reads email only at the user's explicit request so the user can find, summarize, or
reference message content in the visible task. Message bodies are necessary for requests such as
summarizing a thread or extracting requested details; metadata-only access is insufficient. Sia does
not index a mailbox in the background, train models on mailbox data, or bulk copy a mailbox into Sia.

### `https://www.googleapis.com/auth/gmail.compose`

Sia creates a Gmail draft and can send it only after the user supplies or approves the recipient,
subject, and body. Draft creation is a prominent review surface because it lets the user inspect and
revise the exact message in Gmail before sending. `gmail.send` alone is insufficient for the source
Gmail draft workflow because it does not provide the same saved-draft lifecycle. Sia does not modify
other mailbox content.

## Google API data handling statement

Google Workspace access is optional and separately consented on Google's page. Sia accesses Google
data only to provide the user-facing task the person requested. Provider data is read live when a task
needs it and is not bulk copied into Sia. Composio brokers the OAuth connection and bounded API action;
OAuth tokens and provider credentials are handled separately and are not intentionally recorded in
Sia trajectories.

Google Workspace API data is excluded from research uploads, the research archive, and administrator
research review. When a task invokes Gmail, Drive, Docs, Sheets, or Slides, Sia excludes that entire
turn from research capture, including the prompt, connector result, and assistant response. The same
turn is excluded from Sia's optional local diagnostic trajectory. The user-facing result can remain
in the person's local Sia transcript until the person deletes it.
Operational connection metadata such as connected/disconnected state can be recorded without Google
Workspace content. Google API data is not used for advertising, model training, or generalized AI
development and is not transferred to the research archive.

Sia's use and transfer of information received from Google APIs adheres to the Google API Services
User Data Policy, including the Limited Use requirements.

## Exact Verification Center form values

Select **Email productivity** for **What features will you use?** Use the following consolidated
justifications. Keep the deployed behavior and public privacy policy unchanged after submission.

Sensitive scopes justification:

> Sia is a macOS assistant that lets a person explicitly create, read, and edit Google Docs, Sheets,
> and Slides in a visible task. The documents, spreadsheets, and presentations scopes are needed to
> read and apply bounded user-requested changes across files the person selects or creates;
> drive.file cannot provide document bodies or editor operations. Sia does not bulk copy or index
> Workspace data. Each action is user initiated, results appear in the local transcript, and writes
> show a preview. Google Workspace API data and every turn invoking these connectors are excluded
> from research uploads, the AWS research archive, administrator research review, the optional local
> diagnostic trajectory, advertising, and generalized AI or model training. OAuth is optional and
> revocable.

Restricted scopes justification:

> Sia uses gmail.readonly only when a person explicitly asks to find, read, or summarize email in the
> visible task. Message bodies are required for thread summaries and requested detail extraction, so
> metadata-only scopes are insufficient. Sia uses gmail.compose to create a reviewable Gmail draft
> and, only after the user provides or approves the recipient, subject, and body, send it. Sia does
> not index or bulk copy mail. Gmail API data and the entire invoking turn are excluded from research
> uploads, the AWS research archive, administrator research review, the optional local diagnostic
> trajectory, advertising, and generalized AI or model training. OAuth is optional and revocable;
> results remain only in the local user-facing transcript until deletion.

Do not save or submit the form until the accessible reviewer-video URL is ready. The console requires
that URL before it enables **Save**.

## Reviewer demo video shot list

Record the final signed Sia app in English. Keep the Google consent screen language set to English.
Show the OAuth client ID without exposing the client secret. Do not show real participant content,
credentials, codes, tokens, or unrelated inbox material.

1. Open the public Sia homepage, privacy policy, participant notice, terms, and support page.
2. Launch the signed Sia app and show the product name and version.
3. Show the local alternative, then sign in with the dedicated reviewer account and accept the raw
   research consent.
4. Open Connected apps and show the separate **Connect Google** and **Connect Slack** actions plus
   the five Google service switches.
5. Start Google connection, show the complete Sia consent screen, expand every requested Google scope,
   and complete the grant.
6. Show the connected Google account label in Sia.
7. Gmail read: search a dedicated test inbox, open one synthetic test message, and show the requested
   summary in the task.
8. Gmail compose: create a synthetic draft, show the resolved recipient, subject, and body preview,
   approve it, and confirm the draft or send in the test account.
9. Drive: explicitly select or create a synthetic file, read it, and show that unrelated existing
   Drive files are not browsable through `drive.file`.
10. Docs: read a synthetic document, preview one bounded edit, approve it, and show the result.
11. Sheets: read a synthetic range, preview one bounded range update, approve it, and show the result.
12. Slides: read a synthetic presentation, preview one bounded update, approve it, and show the result.
13. Turn selected Google services off and show that their actions are unavailable, then use
    **Disconnect Google** once and show the full grant is revoked.
14. Show that the completed Google connector turn remains in the local transcript but is absent from
    Research archive export, then finish on the public support and privacy contacts.

Publish the video as unlisted YouTube or an equivalently accessible reviewer link. Verify the link in
an incognito browser before submitting it.

## Submission order

1. Publish and verify `superintelligentagents.ai` in Google Search Console under a Google Cloud
   project owner. The exact HTTPS origin is already verified; add the DNS Domain property as a second
   method if Verification Center requires domain-wide proof.
2. Set the public homepage, privacy, terms, support email, logo, and authorized domain in Branding.
3. Confirm the production client retains only reviewed redirect URIs and no unrelated JavaScript
   origins.
4. Record and publish the reviewer demo using the exact submitted app, client, and scopes.
5. Change Audience from Testing to In production.
6. Open Verification Center, enter the scope justifications above, attach the accessible demo link,
   and submit.
7. Respond to the Google verification thread from a project owner or editor address.
8. Complete the CASA security assessment when Google Trust and Safety opens that final restricted-scope
   step. Record the annual reassessment owner and renewal date.
