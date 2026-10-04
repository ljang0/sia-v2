# Sia personal-assistant demos

The demo target is a useful personal assistant from first launch through finished work and
follow-up. The nine scenarios below use [fictional fixtures](./demo-fixtures/demo-cases.json).
They are acceptance cases, not claims of successful live runs. Do not present the deterministic
fake-service reply as completed assistant work.

## First launch

From the repository root, follow the install and signing steps in [RA onboarding](./ra-onboarding.md),
then launch an isolated development profile. `pnpm dev` builds workspace dependencies itself.
Use the signed app and a disposable participant for live acceptance.

1. Sign in or create an account with an email code. Check a wrong code, resend, and changing the
   email. The newest-code confirmation should be visible and focus should return to the code.
2. Choose **Set up Sia** for one guided Mac permission pass. Grant missing Accessibility, Screen
   Recording, voice, and optional app access in order. Include Full Disk Access for Messages
   history. Skip optional grants deliberately; pause, reopen, and resume. macOS still requires
   its own individual approvals. Prefer one Sia relaunch after finishing the prompts.
3. Also exercise **Customize setup → Connected apps only**: no Mac prompts, and a direct path
   to a conversation without connecting an account. Ordinary chat works before computer access.
4. Select Google Workspace and/or Slack, approve each provider's sign-in, and return to Sia.
   Cancel one pending connection; completed accounts must remain connected. Reconnect an expired
   grant directly from the checklist. Google starts with read access; edits and sends require
   the separate scope upgrade. Calendar aggregation currently uses account UI/Mac apps, not a
   dedicated Google/Outlook Calendar connector.
5. Send a request, stop it, retry, switch conversations, and quit/reopen. Confirm drafts,
   connection status, schedule history, and generated result controls survive as intended.

Keep supervised acceptance in **Ask before each action** mode. Production's default remains
bypass. Use local merchant fixtures for purchase/cancellation rehearsals; no real transactions.

## Nine scenarios

Each case has a full prompt, expected output, and adversarial checks in the linked JSON manifest.
Copy only the needed fictional inputs into a disposable conversation workspace, run the prompt
through the actual admitted model/harness, and retain the transcript and visible result.

| Scenario               | Visible success                                                                    | Adversarial check                                                       |
| ---------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Draft my taxes         | Source-linked preparation inventory, missing inputs, downloadable draft; no filing | Missing facts, duplicate receipt, document instructions treated as data |
| Family calendars       | All three calendars covered; Riley leaves by 16:25; driver conflict flagged        | Cancelled events, duplicate UTC/local entries, missing calendars        |
| Birthdays and gifts    | Correct Jordan, suitable $60 workshop, reminder plan                               | Same-name contacts, previously given gift, budget and arrival date      |
| Local music            | One matching show, two tickets at $72 total, approval before booking               | Sold out, duplicate listing, price change, uncertain receipt            |
| Monthly spending       | Net $2,499; subscriptions $59; readable saved report                               | Transfers, duplicate IDs, pending entries, refunds                      |
| Nearby events          | Useful advance notice with sources and calendar conflict                           | Stale/cancelled events, repeats, wrong location                         |
| Relationships          | Timely, private outreach drafts to the intended person                             | Same-name contacts, sensitive context, accidental sends                 |
| Newsletters and essays | Relevant reading queue with reasons and sources                                    | Embedded prompt injection, repeat articles, inaccessible source         |
| Unused subscriptions   | Evidence distinguishes unused from unknown; approved cancellation with receipt     | Bundles, annual renewal, duplicate merchants, stale price               |

Run monitor cases three ways: meaningful change, verified no change, and incomplete source
coverage. Only the second should stay quiet. Failed checks must remain visible. Repeat the same
input to test duplicate recommendations; the model can use saved memory, but durable source-level
deduplication is still a live acceptance requirement.

## Persistence and handoff checks

- Save a report with spaces and Unicode in its name. Preview, open, reveal, then reopen Sia and
  repeat. Verify its contents against the fixture oracle, not merely the existence of a file.
- Monthly dates must recover after short months (January 31 → February 28 → March 31). Annual
  February 29 runs on February 28 in non-leap years and returns to February 29 in leap years.
  Editing the prompt must preserve the original date. The timezone is the Mac's timezone.
- With Phone remote enabled for the disposable agent, download the same generated result.
  Other conversations' files and revoked links must be inaccessible. Phone actions requiring
  approval are completed on the Mac.
- Leave Sia open and the Mac awake for schedules. Closing the app is not a supported way to
  run unattended monitoring. Demonstrate the stated limitation explicitly.

## Evidence and release gate

`pnpm test:pilot` covers deterministic build, unit, renderer, and Electron behavior. Run
`pnpm --filter @sia/desktop test:remote` with Chromium and WebKit for the phone surfaces.
Neither suite proves live email delivery, OAuth consent, native TCC grants, model task quality,
binary tax-document coverage, payment safety, or all nine scenarios end to end.

A demo passes only with observed source coverage, a checked artifact/outcome, and evidence of
its negative branches. Record the actual app commit, model/harness, grants, timezone, source
fixtures, and transcript. Follow [manual acceptance](./manual-acceptance.md) for live accounts;
never use personal tax records, payment methods, or customer data for these rehearsals.
