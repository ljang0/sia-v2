# Sia development handoff

Updated October 6, 2026 UTC. The integrated alpha.25 candidate is on
`codex/release-verification`; [public-release.md](./public-release.md) records its input commits,
verification results, and release gates.

## Current state

The release-verification branch combines PRs #17, #18, and #19 with the public-release audit
branch and six previously unpublished local-main commits. Source merge conflicts are resolved.
The combined source gate, 1,159 desktop unit tests, 45 deterministic Electron tests, and 17
renderer tests passed. All 60 phone-browser checks and unsigned universal packaging also passed.
CI now also requires renderer and Chromium/WebKit phone checks before
signed packaging. Main has not been changed by this integration pass.

**Public distribution remains blocked.** The combined candidate still needs signed/notarized
packaging and acceptance on that exact artifact: clean signup and permissions, authenticated
upgrade, live connector consent, and real phone/bot round trips. The prior signed internal alpha.25
candidate predates these workstreams. `/Applications/Sia.app` on the verification Mac is alpha.14.
Computer Use works in the current Codex session. The integrated source opened with real services
and an isolated encrypted profile in the existing signed Sia Development runtime. Six permissions
are allowed; System Events, Safari, Calendar, and Reminders Automation still need grants. Keychain
opened successfully. Global Codex `0.154.0` is incompatible; the app's managed runtime setup awaits
operator confirmation. No grants were changed or real model tasks/messages sent. These existing
development grants do not establish clean-user or signed-release acceptance.

The original audit results and demonstrations below are historical evidence. They prove analysis
and drafting with fictional inputs, not live bookings, cancellations, account-wide source coverage,
or reminders running while Sia is closed. Current release decisions belong in
[public-release.md](./public-release.md).

## Product direction

The goal is an everyday assistant that feels easy from signup through finished work. People should
understand what Sia can do, connect only what they need, finish one guided Mac permission pass,
and get useful results without learning the harness or developer vocabulary.

The requested scenarios are tax preparation, family logistics, birthdays and gifts, local music,
monthly spending, nearby events, relationship outreach, a useful reading queue, and unused
subscriptions. The recurring versions need dependable source coverage and timely, restrained
notifications. Booking, sending, and cancellation demonstrations must distinguish a proposal,
approval, and a verified receipt.

The first demo felt robotic to the user. It was replaced with a shorter film built around three
ordinary requests, real app screens, and concise replies. Continue that direction: familiar
language, readable documents, and less visible machinery. The new demo used special instructions
to keep responses brief; it does not establish that all production replies now have that tone.

The original request also called for comparison with Claude Desktop and Codex Desktop. This work
audited concrete Sia workflows and integration boundaries. It did **not** complete a current,
exhaustive feature-by-feature comparison of those products. Do not describe Sia as reaching parity.

## Changes completed

| Commit    | What changed and why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `69d25f4` | Made integrations optional, kept ordinary chat usable without Mac permissions, and stopped Connected apps only setup from requesting computer access. Improved email-code and permission/relaunch guidance. Fixed fresh development startup to build workspace dependencies and document signing. Added validated Preview/Open/Reveal result controls, phone downloads, monthly/yearly scheduling, and quiet completion for successful checks with no changes. Added the nine fictional demo fixtures. |
| `fcfa92c` | Fixed saved calendar schedules to match their preview and preserve their calendar anchor when edited.                                                                                                                                                                                                                                                                                                                                                                                                  |
| `5d50b33` | Fixed real generated-result grants when macOS resolves `/var` to `/private/var`. Hardened development and release signing against Finder/resource-fork metadata while preserving other attributes. Updated release evidence and remaining gates.                                                                                                                                                                                                                                                       |
| `e4909cb` | Added the opt-in real-model demo harness, output checks, isolated scenario workspaces, source-preservation checks, and reproducible evidence capture.                                                                                                                                                                                                                                                                                                                                                  |
| `6ba4e5f` | Collapsed completed, rejected, and expired approvals into expandable status rows while leaving pending approvals visible. Rendered saved Markdown as readable documents through `SafeMarkdown`. Added an explicit preview close button and immediate unmount so a background window cannot leave a blank dialog waiting for animation.                                                                                                                                                                 |

The original six audit findings covered chat blocked by missing permissions, unusable result links,
fresh setup failure, unwanted permission prompts, missing monthly/yearly cadence, and noisy monitor
completion. The first five have implementation fixes and regression coverage. The sixth now has
structured `no_change` handling; independent coverage verification, durable source deduplication,
and a broader notification policy remain unfinished.

The initial findings JSON is retained as historical evidence. It should not be read as a list of
currently unfixed bugs. The older September `SIA_APP_REVIEW.md` is also a historical snapshot.

## How the app works today

The Electron main process owns execution, credentials, persistence, and authorization. React uses a
typed preload bridge. `DesktopController` coordinates conversations and `RuntimeCoordinator`
resolves the model/harness. Sia-hosted actions pass through `packages/action-gateway`; approved
tools use the capability-scoped transport in `packages/tool-bridge`.

Both the included-model route and the user's Codex plan use Codex App Server. The live tests used
admitted Codex `0.153.0` and GPT-6 Astra. Threads pin their execution route. Other provider seams
are intentional compatibility/evaluation paths, not additional release choices. See
[architecture.md](./architecture.md) and [harness-policy.md](./harness-policy.md).

- A cloud-configured release requires email sign-in before showing private app surfaces. A local
  development build without cloud configuration intentionally behaves differently.
- Google Workspace, Slack, GitHub, Notion, and Chrome connections are optional. Use my Mac setup
  now requires all supported Mac permissions, including Messages Full Disk Access; Connected apps
  only needs none. Calendar, Tasks, and Outlook connectors remain disabled.
- Production defaults to **Use my Mac**, background operation, and **bypass** for per-action
  confirmations. Supervised testing explicitly selected **Ask before each action**. Phone actions
  always require a separate approval; an enabled text channel can bind YES/NO to one pending action. Do not infer production confirmation behavior from the demo.
- Sia-hosted tools block protected authentication and credential surfaces. Native shell/file tools
  follow the provider's sandbox/approval boundary; prompt instructions are not OS enforcement.
- Mac permissions are guided together, but macOS still requires individual grants. “All in one
  go” means a coordinated flow and preferably one final relaunch, not one universal OS approval.
- Tasks and schedules require Sia open and the Mac awake. Mac tasks pause on lock/sleep. There is
  no always-on cloud execution while the Mac is off.
- Monthly and yearly schedules preserve calendar anchors across short months and leap years;
  their timezone follows the Mac. Successful structured `no_change` outcomes stay in history
  without unread status or a completion alert. This depends on the model's coverage judgment.
- Generated files use thread-scoped grants with file-identity checks. Markdown previews disallow
  raw HTML and remote images. Phone downloads are bounded and limited to their conversation.
- Research capture is separately consented and off by default. Local trajectory logging is a
  separate mechanism; consult the architecture/privacy documents before changing either.

## Verification completed

| Check                              | Recorded result                                                                                                                   | What it establishes                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Latest `pnpm test:pilot`           | 1,081 desktop unit tests passed, 7 skipped; 42 Electron passed, 4 skipped; 17 renderer passed                                     | Deterministic build, source, lifecycle, and UI gates during the final UI work                                 |
| Subsequent `pnpm check`            | 1,082 desktop unit tests passed, 7 skipped; other workspace suites passed                                                         | Build, formatting, lint, quality policy, types, and unit checks with the additional UI regression             |
| Final preview-dismissal adjustment | 18 focused UI tests, build, formatting, lint, and desktop typecheck passed                                                        | Immediate modal removal, plus direct app verification                                                         |
| Phone remote                       | 30 Chromium and 30 WebKit checks passed in the earlier release pass                                                               | Phone UI and result-download behavior on those test browsers                                                  |
| Live harness                       | Four no-turn Codex isolation probes; synthetic relay tool round trip; background report/skill/restart workflow passed             | Real harness admission/authentication and local work; synthetic relay is not deployed included-model evidence |
| Personal demos                     | Nine primary cases and four follow-ups passed across retained initial/rerun records; three fresh conversational cases also passed | Fictional-data analysis, decisions, local writes, and result grants through the real model/controller         |
| Package                            | Universal architecture/resource checks and strict nested signatures passed                                                        | Signed internal candidate; Gatekeeper correctly reported it as unnotarized                                    |

These runs were incremental. The full pilot run preceded the final small preview-close adjustment;
the focused checks and actual app interaction cover that last change. Before packaging the final
source, rerun `pnpm test:pilot` once on the settled revision.

Computer Use exercised isolated setup and permissions fixtures, email resend, monthly schedule
creation, approval disclosure with keyboard interaction, and Markdown preview/open/close. The
actual signed package was launched in a fresh isolated profile: it showed email sign-in and its
shortcuts did not expose private surfaces. No new email account was created in that package test.

Durable logs are under
`/Users/lawrencejang/Documents/ChatGPT/sia/demo-showcase/story-evidence/` (`pilot.log`,
`check-final.log`, `real-model.log`, `verification.txt`, and `closed-preview-ax.txt`). Earlier
release and phone evidence is under
`/Users/lawrencejang/Documents/ChatGPT/sia/audit-2026-10-04/release/`.

## Demo results and their limits

All inputs were fictional. The actual controller, runtime, model, supervised file tools, and result
grants ran; external account and GUI tools were unavailable in the nine-case suite.

| Scenario            | Verified outcome                                                                                                      | Still needed for the complete product promise                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Taxes               | Preparation draft, missing information, duplicate receipt removed; $240 unique receipt total; no filing/payment claim | Real document ingestion, binary/scanned coverage, jurisdiction-specific review and filing boundaries |
| Family calendars    | Three sources reconciled, cancelled/duplicate event excluded, 4:25 PM departure and driver conflict identified        | Live multi-account coverage, refresh, conflict updates, and actual reminders                         |
| Birthdays and gifts | Correct Jordan selected; $60 workshop within budget; repeated/late/overbudget gifts excluded                          | Durable reminders, current availability, approved purchase                                           |
| Local music         | Matching show and two tickets at $72; no purchase claim                                                               | Repeated venue checks and verified merchant checkout                                                 |
| Spending            | Net $2,499 and $59 subscriptions, with transfers/pending/duplicates/refunds handled                                   | Recurring live ingestion and usefulness over multiple months                                         |
| Nearby events       | Suitable free family event identified in advance with travel time                                                     | Live local coverage, calendar availability, repeated checks without noise                            |
| Relationships       | Appropriate drafts for two intended recipients; no-contact and same-name cases handled                                | Reliable contact/context refresh and explicitly approved delivery                                    |
| Reading             | Two relevant unread essays, 32 minutes total; duplicate/ad filtering and embedded instruction resistance              | Live inbox/feed polling and durable seen/read state                                                  |
| Subscriptions       | $29/month, $348/year cancellation candidate; household usage uncertainty retained                                     | Merchant action after approval and verified cancellation receipt                                     |

Four follow-ups covered a price increase from $72 to $112 requiring fresh approval, an uncertain
ticket receipt requiring verification before retry, a **simulated** cancellation receipt, and an
unchanged reading queue returning no notification. These are decision checks, not real transactions.

The first run had ten passes and three incomplete cases. Reruns clarified one-shot planning scope
and isolated workspaces. A decision filename also collided with a subscription input; the harness
now uses distinct output names and checks that sources remain unchanged. Original attempts are
retained. Thirteen selected passing results are not a first-attempt success rate or broad reliability
estimate. The canonical harness and rerun command are in [demo.md](./demo.md).

## Demo files to use

All paths below are in `/Users/lawrencejang/Documents/ChatGPT/sia/demo-showcase/`.

| File                                    | Purpose                                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `index.html`                            | Local showcase with the short film and detailed report/decision/transcript links                              |
| `Sia-a-little-less.mp4`                 | Current main demo: 71 seconds, 1920×1080 H.264, silent; family logistics, birthday gift, unused subscription  |
| `Sia-everyday-demos.pptx`               | Earlier 13-slide editable deck; useful as the detailed test reference, not redesigned after the tone feedback |
| `Sia-story-evidence.zip`                | Revised demo evidence, app captures, and edit manifest                                                        |
| `Sia-demo-evidence.zip`                 | Earlier nine-scenario and follow-up evidence                                                                  |
| `evidence/verified-results.json`        | Selected verified results, source revision, model, report hashes, and rerun provenance                        |
| `story-evidence/` and `story-captures/` | Three fresh real-model conversations, checks, fictional inputs, and actual Electron screenshots               |

The short film edits real app screenshots and replays saved real-model conversations. It is not a
continuous live screen recording. The viewer used fake services to avoid touching host accounts;
the replies were generated separately by the real model. No calendar changes, scheduled reminders,
purchases, cancellations, or outreach happened. Video frames and browser playback were inspected.
The older 4:17 narrated video remains on disk but is superseded as the main preview.

## Release work remaining

1. **Verify the first real signup and setup.** SES production delivery was deployed to `sia-alpha`
   in `us-east-1` with the verified branded sender. Existing sessions and the 30-day refresh lifetime
   were preserved. Test a new disposable recipient, wrong/expired code, resend, changing email,
   and full sign-in. Complete clean-macOS permission grant, denial, skip, resume, and relaunch.
   Configuration success and existing OS grants do not cover these cases.
2. **Build and notarize the final source.** The preserved alpha.25 app at
   `/Users/lawrencejang/Developer/sia-v2/apps/desktop/release/internal-candidate/mac-universal/Sia.app`
   is from `5d50b33`, so rebuild after the final source gate. Team `DXYJ578DD4` has an available
   Developer ID certificate. The exact notarization Keychain profile name is still needed. Preserve
   the `Sia` product/executable name and `ai.sia.desktop` identity. Follow [release.md](./release.md)
   for notarization, stapling, Gatekeeper, immutable artifacts, and rollback.
3. **Accept the exact installer on a fresh Mac and an upgrade.** Verify previous encrypted state,
   conversations, grants, results, schedules, repeated quit/reopen, physical microphone/Fn input,
   background/foreground operation, lock/sleep recovery, and stopping work.
4. **Prove connected workflows.** Exercise Google/Slack consent, account selection, denial, expiry,
   reconnect, and accurate source coverage using designated test identities. Public connector
   distribution has separate verification gates. Rehearse approval and receipt handling against
   synthetic merchants; a fixture decision is insufficient evidence of browser checkout safety.
5. **Prove proactive behavior over time.** Test new findings, unchanged sources, incomplete coverage,
   restart, missed due times, duplicate catch-up, and sleep/wake. Establish durable source identities
   and seen/read state. Make the open-app/awake-Mac limit clear in setup and demonstrations.
6. **Close release ownership and security items.** Confirm rotation of previously exposed Meta and
   Apple app-specific credentials; this session did not rotate them. Name the support/incident owner.
   Keep the proposed ten-year refresh lifetime out of deployment unless separately approved.
   Research recruitment and public connector access retain their own signoffs.

After those gates, publish the accepted installer/update artifacts through the documented release
commands and verify a recipient download. No alpha.25 installer was published during this work.

## Picking up the work

Read [AGENTS.md](../AGENTS.md), [RA onboarding](./ra-onboarding.md), and
[manual acceptance](./manual-acceptance.md). Requirements are macOS 14+, Node 24+, pnpm 11+,
and Xcode command-line tools. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @sia/desktop signing:setup # once per Mac
pnpm onboard:check
SIA_FAKE_SERVICES=1 pnpm dev
```

Use a disposable profile for Computer Use and live probes. Do not inspect the user's existing Sia
conversations, broadly enumerate Keychain content, or reset existing Mac permissions. Automatic
review previously rejected broad Keychain/private-app inspection; the successful alternative was
a fresh fictional profile with a separate demo identity. The demo viewer was quit after capture.
Its temporary profile and pinned CLI installation may disappear; durable evidence is in the
directories above. The test viewer's plaintext cipher and fake services are not production settings.

The next useful milestone is one observed, uninterrupted first-run experience on a clean Mac,
followed by one real connected workflow with a verified saved result. Record the exact source and
package identity, account scope, expected outcome, and observed failures. Resolve those failures,
then widen to the other scenarios and rebuild the final installer.
