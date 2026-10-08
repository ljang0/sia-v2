# Semester instructors

This is a synthetic browser task modeled on the recurring Sia failure of answering from a partial calendar or stale web result instead of checking every current course. It contains no CMU or user data.

## Difficulty explanation

The current term has three courses, but the calendar mentions only two and includes an outdated instructor. One course has its professor only in the syllabus, while another has two co-instructors. The agent must inspect every current course and avoid TAs and archived pages.

## Solution explanation

The agent sees a course portal sidecar at `http://portal:8000/` and writes one answer artifact. The reference solution discovers the current course list, checks People for each course, then checks Syllabus where People has no instructor. It derives names from the portal rather than hard-coding the answer.

## Verification explanation

The portal sidecar is separate from the agent container. The exact-answer verifier and oracle are baked into a separate verifier image and receive only `/workspace/answer.json`.

The reward is `1` only when every current course has exactly the right instructors and supporting page; extra courses, TAs, archived names, missing co-instructors, self-reported completion, and malformed output score `0`.

## Relevant experience

Basic browser navigation and structured information extraction are enough. No CMU, Canvas, or real account access is needed.

This tests a browser information-gathering outcome. It does not prove the agent used only mouse/keyboard actions: a terminal agent can inspect page HTML over HTTP. A strict CUA action-space benchmark requires the runner to expose only a controlled browser/computer interface and to record/validate tool use outside the task container. Before publishing a benchmark, randomize the fixture per trial and pin both container images by digest to reduce answer leakage and environment drift.
