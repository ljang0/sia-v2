# Research release sign-off

Complete this document before inviting external participants. A checked engineering control means
the implementation was verified; it is not legal or institutional approval.

## Release boundary

- Release: Sia `0.1.0-alpha.2`
- Consent version: `alpha-research-v3-raw`
- Evidence: [`release-evidence-2026-08-22.md`](./release-evidence-2026-08-22.md)
- Invite copy: [`alpha-invite-template.md`](./alpha-invite-template.md)
- Intended population: invited adults participating in the Sia research release
- Local alternative: **Continue locally** without signing in or uploading research data
- Connector policy: Gmail, Drive, Docs, Sheets, Slides, and Slack enabled for internal alpha
  acceptance; external distribution remains gated on
  [`connector-distribution-readiness.md`](./connector-distribution-readiness.md)

## Participant-facing facts to approve

- Signing in enrolls the invited person in the research release; the current raw consent must be
  accepted before a task can start.
- Captured data includes exact prompts, replies, surfaced reasoning, commands and output, tool and
  action arguments/results, approvals, errors, paths/diffs, browser/computer events, and captured
  images visible inside the eligible task surface. Raw task-visible strings can themselves contain
  private or secret material. A turn that invokes Gmail, Drive, Docs, Sheets, or Slides is excluded
  in full from research capture and administrator research review.
- Sia does not intentionally obtain provider credentials, Chrome cookies, Keychain contents, secure
  fields, private-window contents, or hidden authentication surfaces. These controls reduce exposure
  but do not make task-visible content anonymous.
- Research data is not used for model training under the current policy.
- Authorized research administrators can inspect eligible raw turns. Google Workspace connector
  turns never enter the archive. Archive access requires the Cognito `Admins` group plus
  software-token MFA and writes immutable metadata-only audit records.
- Cloud research objects expire after 90 days. Audit metadata is retained under Object Lock for 365
  days and expires after 400 days. Unsynced local records remain until sync, explicit deletion, or the
  documented local retention controls apply.
- Participants can export local/cloud research records and request research-only or account deletion.
  Provider accounts, workspace files, and unrelated macOS permissions are outside that deletion.
- Turning capture off or signing out stops new capture; pending eligible uploads are not silently
  discarded. Local-only records never become eligible for later upload.

## Required operational owners

Fill every field; do not use a shared inbox without a named accountable owner.

- Research lead: ____________________
- Privacy/legal reviewer: ____________________
- Security/incident owner: ____________________
- Participant support owner: ____________________
- AWS/alarm on-call owner: ____________________
- Rollback owner: ____________________
- Participant support address: ____________________
- Security incident address/phone: ____________________
- Initial recipient list location: ____________________

## Approval checklist

- [ ] Research lead approves the research purpose, population, collected fields, eligible-turn
      administrator review, and the Google Workspace turn exclusion.
- [ ] Privacy/legal reviewer approves the consent language, raw-data risk statement, legal basis,
      age/territory restrictions, 90-day research retention, 365/400-day audit retention, export,
      deletion, and withdrawal behavior.
- [ ] Security owner approves administrator enrollment/recovery, Keychain-held TOTP seed, immutable
      audit access, alarm routing, incident response, and breach-notification procedure.
- [ ] Support owner has a tested process for sign-in, export, deletion, withdrawal, and incident
      requests, including response-time targets.
- [ ] Release owner confirms the recipient list is limited to the approved population and sends the
      exact notice that sign-in means research enrollment, Continue locally is available, eligible
      raw task-surface data uploads, Google Workspace turns are excluded, and connected-app access
      is optional and separately consented.
- [ ] Release owner confirms the exact artifact hashes and committed source identity match the final
      distribution decision.

## Signatures

Research lead

- Name: ____________________
- Decision: Approve / Reject
- Date and timezone: ____________________
- Signature or approval-record link: ____________________

Privacy/legal reviewer

- Name: ____________________
- Decision: Approve / Reject
- Date and timezone: ____________________
- Signature or approval-record link: ____________________

Security/release owner

- Name: ____________________
- Decision: Approve / Reject
- Date and timezone: ____________________
- Signature or approval-record link: ____________________
