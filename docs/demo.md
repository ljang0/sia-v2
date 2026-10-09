# Sia personal-assistant demos

The demo target is a useful personal assistant from first launch through finished work and
follow-up. The nine scenarios below use [fictional fixtures](./demo-fixtures/demo-cases.json).
The planning steps have recorded real-model fixture results; live account actions remain
acceptance cases. Do not present the deterministic fake-service reply as completed assistant work.

## Arena CTO rehearsal

Use the signed **alpha.25** candidate at
`~/Applications/Sia Release Verification/Sia.app`, built from `32a916c`. Open the operator
workspace's `Launch Verified Sia.command`; it selects the persistent isolated profile at
`~/Library/Application Support/Sia Release Verification`. Do not use the unrelated alpha.14
copy in `/Applications`. The code/test head `9adb294` passed
[replacement CI](https://github.com/ljang0/sia-v2/actions/runs/37859613752); its test/documentation
changes do not alter the signed runtime.

The October 9 computer-use rehearsal completed real email-code sign-in and guided setup.
The app shows **Mac access is ready**, Codex **Connected**, the included model **Ready**, and
research capture **Not enabled**. Plan usage showed **94% left** at rehearsal; check again before
presenting. The prepared **Arena demo** agent uses **GPT-5.6-Sol**, **Use my Mac → Work in
background**, and the fictional working folder
`arena-demo/rehearsal-2026-10-09/` under the operator workspace. Local automatic actions remain
on; phone requests still require approval. The authorized self-test number is the only texting
recipient, with **Approve steps by replying YES or NO** on and Texting **Ready**.

### Five-minute presentation

1. **Set the scope (30 seconds).** “Sia turns a request into checked work on your Mac. This is a
   real model using fictional data.” Keep the Mac awake, unlocked and online, with Sia open.
   Close unrelated personal windows before sharing the screen.
2. **Useful work (90 seconds).** In Arena demo, start a conversation and use the prompt below.
   Open the saved result in Sia. Show the $2,499 total, $59 subscriptions, refund treatment and
   duplicate/pending exclusions. Ask why “Unused fitness app” does not establish actual usage.
3. **A text that does work (90 seconds).** In the authorized self iMessage conversation, send
   `NEW`, wait for “Starting fresh,” then use the text prompt below with a new filename. Reply
   `NO` first: no file should appear. Repeat the request and reply `YES` to the exact write.
   Show the created file and its returned attachment. The Mac-originated real iMessage path is
   freshly verified; include the physical handset only after its separate preflight passes.
4. **Control and continuity (30 seconds).** Show the same conversation on the Mac. Explain
   `STATUS`, `STOP`, and `NEW`; demonstrate STOP on a pending disposable write if time permits.
   A late YES after cancellation must not resume work.
5. **Arena collaboration (30 seconds).** Discuss the agreed API credits, marketing and
   sponsorship, then agree the credit endpoint/models, budget/expiry, evaluation tasks and
   success criteria. Do not describe this Codex-plan run as using sponsored credits. No public
   sponsorship announcement or logo use has been approved in this workflow.

Desktop prompt (use new output names on each rehearsal so earlier evidence stays intact):

> Read spending.csv in your working folder using the workspace file tools. Summarize September
> spending by category, excluding transfers, pending transactions and duplicate transaction IDs,
> and net refunds. A merchant name is not evidence of actual usage. Save a concise, polished
> spending-live.md and spending-live.json directly in the working folder. Label the report
> “Real model, fictional data” and explain exclusions and evidence-based observations. The JSON
> should contain net_spending_usd and category_totals_usd. Read both saved files back, then give
> me the result. Use only this fixture and these outputs; no apps, browsing, accounts, purchases,
> or cancellations.

Text prompt (choose a new `arena-live-N.txt` for each demonstration):

> Using your working-folder file tools, create arena-live-1.txt with exactly
> ARENA-IMESSAGE-ACTION-OK and then read it back. Use only that file. If any step is denied,
> stop without retrying.

### What the current rehearsal establishes

The signed GUI completed the spending request in **29 seconds, eight steps**. The actual
`spending-recap.md` and `spending-summary.json` matched an independently calculated oracle:
Housing $1,800; Food $255; Utilities $160; Dining $145; Shopping $80; Subscriptions $59.
Sia's report correctly distinguishes the merchant label from usage evidence and its in-app
preview renders the report and table. These files are also the fallback if the live provider is
slow: explicitly introduce them as the saved rehearsal result, not a new completion.

The first attempt used nested paths outside the default agent workspace, so background mode
tried the Mac UI. It was stopped after 73 seconds and 12 steps without the requested outputs.
Use the prepared working folder with top-level files for this demo. That incomplete attempt is
retained; this pass does not establish arbitrary Finder/TextEdit work in background mode.

Fresh CUA actions in native Mac Messages used the real iMessage service. NO left
`arena-text-demo.txt` absent; a fresh request and YES created it with exactly
`ARENA-IMESSAGE-ACTION-OK`. Sia returned a completion message and the actual attachment, which
was saved from Messages and independently matched byte for byte. STATUS reported a pending
approval, STOP left `arena-stop-must-not-exist.txt` absent, and a stale YES was rejected.
NEW completed a fresh exact reply; after a full quit/relaunch, authentication, the pinned report
and Texting Ready persisted, and a new iMessage returned `ARENA-READY-AFTER-RESTART`.
Evidence is under `release-verification-evidence/arena-rehearsal-2026-10-09/` in the operator
workspace. Screenshots and transcripts exclude credentials and unrelated Messages threads.

### Boundaries and fallback

This is a prepared Mac demo, not public-release approval or complete Instinct parity. The
physical-phone text-reply round trip was confirmed earlier, but handset-originated Mac actions,
handset media and physical Wi-Fi pairing remain separate gates. In this rehearsal iPhone
Mirroring reported **iPhone in Use** and then timed out; it requires the phone to be locked
before device checks.
Earlier signed candidates have source-specific Mac iMessage photo/voice and LAN browser
results in [public release evidence](./public-release.md); do not relabel those as current
handset tests. Telegram and Discord have no test bots configured. Telephone calls and Notion
live acceptance remain deferred; Calendar, Tasks and Outlook connectors remain off.

If sign-in or model availability changes, stop before presenting a live completion. Use the
saved report and describe the current blocker plainly. Re-select a model actually offered by
the picker if necessary, then rehearse again. Mac permissions belong to the signed Sia identity;
Codex's own approval settings do not replace macOS grants. Sia must stay open and the Mac awake
for local and remote work. No public alpha.25 release or Arena outreach was sent by this pass.

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
