# Documentation

Each document has one owner audience. Keep documents current rather than adding dated copies;
superseded records stay in Git history and at their release tags.

## Contributors

- [`ra-onboarding.md`](./ra-onboarding.md) — fresh-clone setup, first contribution, and safe
  testing. Start here.
- [`architecture.md`](./architecture.md) — process, trust, data, and action boundaries.
- [`harness-policy.md`](./harness-policy.md) — how a thread resolves and pins its provider, model,
  and harness.
- [`model-lab-integration.md`](./model-lab-integration.md) — adding an included model lab safely.
- [`ui-quality.md`](./ui-quality.md) — renderer design and accessibility constraints.
- [`cloud-computer.md`](./cloud-computer.md) — the current local/cloud execution boundary, with the
  remote-computer decision record in [`cloud-provider-decision.md`](./cloud-provider-decision.md).
- [`workflow-robustness.md`](./workflow-robustness.md) — source audit of the major user workflows
  and the remaining live tests.
- Workspace notes: [`apps/cloud`](../apps/cloud/README.md), [`infra`](../infra/README.md),
  [`native voice helper`](../apps/desktop/native/voice/README.md), and
  [`notch engine`](../apps/desktop/native/notch/README.md).

## Release operators

- [`release-status.md`](./release-status.md) — last signed build and the work left before a
  broader release.
- [`release.md`](./release.md) — build, signing, notarization, and deployed release procedure.
- [`release-evidence.md`](./release-evidence.md) — signed-artifact, live-provider, and clean-CI
  evidence for the last signed build.
- [`release-notes.md`](./release-notes.md) — tester-facing notes for the next build.
- [`rollback.md`](./rollback.md) — rollback and revocation procedure.
- [`public-release.md`](./public-release.md) and
  [`public-site-launch.md`](./public-site-launch.md) — public download candidate and website
  launch record.
- [`connector-distribution-readiness.md`](./connector-distribution-readiness.md) — Google Workspace
  and Slack distribution gates.
- [`google-oauth-verification-packet.md`](./google-oauth-verification-packet.md) and
  [`ses-production-access-request.md`](./ses-production-access-request.md) — external-service
  submissions.

## Pilot and research

- [`cmu-pilot-runbook.md`](./cmu-pilot-runbook.md) — shortest tester setup and support procedure.
- [`manual-acceptance.md`](./manual-acceptance.md) — human checks that automation cannot complete.
- [`demo.md`](./demo.md) — bounded live demo flow.
- [`alpha-invite-template.md`](./alpha-invite-template.md) — private invite copy.
- [`research-release-signoff.md`](./research-release-signoff.md) — approvals required before a
  research launch.

## Policy

- [`provider-policy.md`](./provider-policy.md) — provider availability and billing rules.
- [`../SECURITY.md`](../SECURITY.md) — security model and vulnerability reporting.
- [`../PRIVACY.md`](../PRIVACY.md) — what Sia stores, sends, and deletes.
- [`../SUPPORT.md`](../SUPPORT.md) — how testers get help.
- [`../THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) — bundled third-party licenses.
