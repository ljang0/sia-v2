# Arena release: pick and rate

Decision (October 19, 2026, project owner): Sia's LM Arena computer-use release uses **pick and
rate**, not blind battles.

- A person picks any admitted model and engine for a conversation, or lets Sia choose. The choice
  is pinned per thread, as it is today.
- After each finished task, the person can rate it. The rating is recorded with the exact
  provider, lab, model, engine (harness), and outcome.
- Ratings sync to Sia cloud and roll up per lab, model, and engine, so a sponsor such as Arena
  gets a per-combination computer-use report.
- Privacy:
  - No prompt, reply, file, or screen content leaves the Mac with a rating unless the person
    explicitly adds a comment.
  - A comment is shown before it is sent.

Also required for the release: agent-quality parity with Claude Cowork and Instinct, tracked in
the parity checklist.

## How it works

**When a task ends.** The desktop main process records the finished task's facts the moment the
turn ends (`TaskRatings.recordFinishedTask`, `apps/desktop/src/main/controller/ratings.ts`):
the pinned provider, lab (catalog id and name), model, and engine (harness), plus the outcome
(completed, failed, or cancelled), duration, the number of model tool calls, and whether computer
use or the browser was used. These facts come from the thread's pinned route and the timeline,
never from the renderer. Idle reviews are not rateable.

**Rating.** The thumbs on the final reply of a finished task record `good` or `bad` at once and
show "Thanks, saved." "Tell us more" opens a small popover with reason tags and an optional note
(500 characters at most). A note is shown in full, with what will be sent, before Send. Rating
again replaces the earlier rating, locally and in the cloud. "Send feedback to the Sia team" in
the popover still opens the support email draft.

- Good reasons: did it right, fast, careful.
- Bad reasons: wrong result, got stuck, too slow, unsafe or asked too much, didn't finish.

The conversation header names who is being rated next to "AI for this conversation", for example
"Arena · Llama 5 · Claude Code" (lab · model · engine, repeated names dropped).

**Phone and texting.** The owner's encrypted-relay phone shows thumbs on finished tasks and sends
them through the `rate` remote route; the plain-HTTP Wi-Fi link never sees or accepts ratings.
From the owner's own texting numbers, a reply of 👍 / 👎 or "good" / "bad" rates the task that
just finished in that conversation; with no finished, rateable task it is an ordinary message.

**Record.** One shape is shared by desktop and cloud: `taskRatingRecordSchema` in
`@sia/protocol/ratings`.

```text
schemaVersion 1, threadId, turnId, rating (good | bad), reasons[], comment?,
route { provider, lab { id, name }, model, harnessId },
task { outcome, durationMs, stepCount, usedComputer, usedBrowser, finishedAt },
appVersion, createdAt
```

The schema is strict: any other field (a prompt, a reply, a screenshot) is rejected on both sides.

**Desktop storage and sync.** Task facts and ratings are kept in the encrypted local repository
(scopes `rating_tasks`, at most 1,000 recent tasks, and `ratings`). `ratings.submit` on the bridge
checks that the turn finished and belongs to the thread, then queues the rating for Sia cloud.
Each cloud write commits the rating, its report-counter delta, and a private account reference in one DynamoDB transaction. A conditional read/write retries competing edits; retrying after a lost response cannot double count. Upload retries with backoff (15 s doubling to 5 min) and runs only for the signed-in account the
rating was made under.

**Cloud.**

- `POST /v1/ratings` (Cognito, Sia account): body at most 4 KiB, validated against the shared
  schema, `finishedAt` within the last 400 days, at most 120 ratings per account per hour. The lab
  must be a configured hosted lab (whose name the cloud supplies), the provider itself (for
  example Codex on the person's plan), or a signed lab harness's own id.
- Storage in the control table, under the lab:
  - `PK = LAB#<lab>`, `SK = RATING#<day>#<model>#<harness>#<id>`: the rating, without thread or
    turn ids. `id` is a one-way hash of the account and the Mac's random turn id, so re-rating
    replaces it but the record names no account.
  - `PK = LAB#<lab>`, `SK = RATING_DAY#<day>#<model>#<harness>`: daily counters (ratings, good,
    bad, each reason, each outcome, notes, computer and browser use, duration and step totals).
    Re-rating subtracts the earlier rating's counts atomically.
  - Both expire after 400 days. The per-account hourly limit is `USER#<sub> / RATE#RATING#<hour>`.
- `GET /v1/admin/ratings?lab=&from=&to=` (Admins with an authenticator, audited): one row per day,
  model, and engine with the counts and averages. It never returns a rating, a note, or anything
  that identifies a person.

## Privacy guarantees

- No prompt, reply, file, or screen content is stored with a rating or sent. The shared schema
  has no field for it and rejects unknown fields on the Mac and in the cloud.
- The only free text is the optional note, which the person types and sees in full before Send.
- The route and task facts come from the main process, not the renderer.
- Lab rating records carry no account id, email, thread id, or turn id. A separate reference in
  the account partition links its ratings for deletion, so these records are pseudonymous, not
  anonymous. The sponsor report is counts only. Account deletion removes ratings and optional
  notes and subtracts their report contributions atomically.
- Phone ratings are accepted only from the owner's encrypted-relay phone; texted ratings only from
  the owner's own numbers.

## Not done yet

- Ratings and account-deletion routes were deployed and exercised in the acceptance record in
  [`public-release.md`](./public-release.md). Recheck the live deployment for the candidate being
  distributed; that earlier evidence is not an Arena sponsor integration.
- There is no sponsor-facing (non-admin) role yet; an admin shares the report.
- The phone has thumbs only; reasons and notes are on the Mac. Texting's HELP message does not
  mention ratings yet.
- Codex on the person's own plan is filed under the provider id (`codex`), not "OpenAI".
