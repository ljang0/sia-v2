# Sia personal-assistant demos

The demo target is a useful personal assistant from first launch through finished work and
follow-up. The nine scenarios below use [fictional fixtures](./demo-fixtures/demo-cases.json).
The planning steps have recorded real-model fixture results; live account actions remain
acceptance cases. Do not present the deterministic fake-service reply as completed assistant work.

## Arena CTO rehearsal

Use the signed candidate in a disposable profile, with research sharing off and only the
designated tester's iMessage number enabled. Launch through Finder/Launch Services so macOS
attributes the existing grants to Sia. Before presenting, check AI is ready, Computer shows the
intended Mac-control mode, and Phone remote shows Texting Ready. Check available model quota;
the October 8 final app displayed 99% plan usage, so the current route needs headroom before a
live demo. Keep the Mac awake and unlocked.
The Arena credits' endpoint, model list, budget and expiry still need to be supplied; do not label
the current Codex-plan demonstration as running on sponsored API credits.

The October 7 signed `64b40df` rehearsal used GPT-6-Astra in native Mac mode to create
`/private/tmp/sia-cto-demo/local-demo.txt` with exactly `SIA-LOCAL-DEMO-OK`. Sia read it back in
13 seconds; independent byte and SHA-256 checks matched. This establishes a real local file
action on that candidate. It does not establish a phone-originated action.

After restart, the runtime no longer offered that conversation's pinned GPT-6-Astra model.
Sia preserved the draft and rejected submission before a model turn. Choose a model actually
offered in the live picker and repeat the rehearsal before presenting; do not assume a saved
model remains available. The replacement `2898c71` signed app restored the same authenticated
profile. On October 8, exiting full screen and using Window → Center restored CUA input.
GPT-5.6-Sol was selected for the existing phone conversation and saved as the Sia agent default.
A subsequent NEW request created a fresh conversation and returned the exact expected reply.

On that signed candidate, CUA sent real self-addressed iMessages from Messages on the Mac.
A file action was denied first and independently confirmed absent; the repeated request was
approved and produced the exact bytes. The same sequence then passed with texted NO and YES,
including a separate YES for the read-back step. The completion reply appeared in Messages.
STATUS correctly described the pending approval, and a stale YES was rejected. STOP and outgoing
voice attachments exposed two live defects. Signed replacement `0d4b87f` passes both repairs:
STOP returns only “Stopped” with no file created; a synthetic WAV returns **blue paper lantern**
and an MP3 that can be saved from Messages, decoded and played to completion in QuickTime.
A fresh NO/YES file write/read-back on the replacement produced exactly
**SIA-FINAL-PHONE-ACTION-OK**, independently checked against the actual file.
Photo understanding on `2898c71` returned all four fixture colors in order. The paired LAN browser
also completed an exact reply and approved file action, then reconnected after replacement.
The final `cfd1a61` signed candidate also passes cancellation-status verification: a pending
file edit stopped through iMessage leaves no file, shows an error without Undo, and records
a cancelled outcome. The browser reconnects and shows Stopped.
These are Mac-originated live-service checks, not physical-handset action, media or receipt checks.
iPhone Mirroring could not find the paired phone. Rehearse that remaining handset gate before
claiming it in the demo.

A focused spending rerun on `2898c71` passed with GPT-5.6-Sol and admitted Codex 0.153.0 in
23.875 seconds. The real controller and file tools produced a report and decision record, with
two approved local writes. Net spending was $2,499 and subscriptions $59, matching the fixture
oracle. This was a headless controller check with fictional data and no GUI or external account
tools. Its initial invocation rejected the incompatible global Codex before a model turn;
the successful rerun used Sia's managed runtime. Both logs are retained.

Rehearse this short flow before the meeting:

1. Start with an ordinary local request that creates a useful report from fictional inputs in a
   disposable folder. Open the result and compare its contents with the inputs.
2. From the physical phone, text a request to create one clearly named disposable file. Reply NO
   to its approval first; independently verify the file was not created. Repeat the request and
   reply YES to each exact step. Confirm both the actual Mac file and the reply on the handset.
3. Send STATUS during a task, STOP while a step waits, and NEW after it stops. A late YES must
   report that no approval is waiting and must not start another task. Then complete a new task.
4. Show the same conversation and result on the Mac, then close an editor and Settings menu and
   continue typing. Repeat after another app has covered Sia to check input recovery.

Step 2 remains the physical-phone action gate. Earlier handset evidence proves the exact text
reply round trip, not a handset-originated Mac mutation. The Mac-originated photo and text-approval
checks above do not close handset media, Wi-Fi pairing, Telegram or Discord acceptance
in [manual acceptance](./manual-acceptance.md). Telephone calls
remain deferred. The demo should describe Sia's tested texting-to-Mac behavior, without promising
full parity with another product or work while the Mac is asleep or Sia is closed.

## Recorded model walkthrough

The October 7, 2026 walkthrough used source `5863329`, admitted Codex 0.153.0 and
GPT-5.6 Sol in disposable profiles. The actual desktop controller, runtime coordinator, file
gateway, result grants and model ran; external tools were unavailable. All nine planning scenarios
and four follow-up decisions passed in 278.31 seconds, with 26 approved fixture writes. Reports
and decisions were checked against their oracles and generated result grants. This establishes
fixture analysis and saved drafts; live account workflows remain unverified.

An initial GPT-6 Astra attempt stopped before a model turn because the test runtime catalog did
not offer it. Its failed log is retained alongside the successful run. The current sanitized
inputs, transcripts, reports and decisions are in `release-verification-evidence/demo-5863329-sol/`
in the original workspace. Earlier runs and failed attempts remain in the evidence and Git history.

Run the opt-in suite with an admitted, signed-in Codex installation available:

```sh
SIA_CODEX_REAL_SMOKE=1 SIA_PERSONAL_DEMOS_SMOKE=1 \
SIA_SMOKE_MODEL=gpt-5.6-sol SIA_DEMO_EVIDENCE_DIR=/private/tmp/sia-demo-evidence \
pnpm --filter @sia/desktop exec vitest run src/main/actions/personal-demos.smoke.test.ts
```

`SIA_DEMO_CASES=music,local_events` selects cases for a focused rerun. This consumes real model
turns. Expected-answer fields are removed from model inputs, each case uses its own agent
workspace, and only local file tools are available. The harness approves those fixture writes;
it cannot purchase, cancel, send messages, or access another app. It retains sanitized inputs,
transcripts, reports, decisions, model identity and the current code/harness revision in the
requested evidence directory. Without that directory, temporary evidence is removed on exit.

The follow-ups check changed ticket terms, an uncertain receipt, an unchanged reading queue,
and a **simulated** cancellation receipt. No live booking/cancellation occurred. Reminder plans
were drafted but not scheduled; automated venue/event monitoring and inbox polling remain live
acceptance gates. The spending check reconciles the fixture arithmetic, and the tax check
organizes documents without making legal tax determinations.

The accompanying presentation/video should say **real model, fictional data** and preserve this
scope. A narrated slide walkthrough is not an end-to-end recording of connected accounts.

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
