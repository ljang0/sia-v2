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
- User support email: `support@superintelligentagents.ai`
- Developer contact: `superintelligentagents@gmail.com`
- Authorized domains to retain: `composio.dev`, `superintelligentagents.ai`
- Consent-screen logo: `apps/site/public/assets/sia-oauth-logo.png` (120 by 120 PNG)

The homepage publicly identifies Sia, explains connected Google features and research capture, links
the matching privacy policy, and is accessible without signing in. The privacy policy separately
describes Google API data, optional provider consent, task-visible research capture, service
providers, retention, export, deletion, and the Google Limited Use requirements.

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

When signed-in research mode is enabled, Google content that becomes visible inside a task can be
included in that task's raw research event stream. This is disclosed before research participation and
again in the public privacy policy. Cloud research content expires after 90 days. Authorized research
administrators use MFA and archive reads write immutable metadata-only audit records. Participants can
export or delete research records or delete their Sia account. Research data is not used for model
training under the current policy.

Sia's use and transfer of information received from Google APIs adheres to the Google API Services
User Data Policy, including the Limited Use requirements.

## Reviewer demo video shot list

Record the final signed Sia app in English. Keep the Google consent screen language set to English.
Show the OAuth client ID without exposing the client secret. Do not show real participant content,
credentials, codes, tokens, or unrelated inbox material.

1. Open the public Sia homepage, privacy policy, participant notice, terms, and support page.
2. Launch the signed Sia app and show the product name and version.
3. Show the local alternative, then sign in with the dedicated reviewer account and accept the raw
   research consent.
4. Open Connected apps and show both **Connect work apps** and **Choose apps**.
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
13. Disconnect each Google service from Sia and show the disconnected state.
14. Show Research archive export and deletion controls, then finish on the public support and privacy
    contacts.

Publish the video as unlisted YouTube or an equivalently accessible reviewer link. Verify the link in
an incognito browser before submitting it.

## Submission order

1. Publish and verify `superintelligentagents.ai`, including a Google Search Console Domain property
   verified by a Google Cloud project owner.
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
