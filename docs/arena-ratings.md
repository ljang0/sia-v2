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
