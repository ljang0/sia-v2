# SES production-access resubmission

This is the reviewed wording and operator checklist for a new Amazon SES production-access request
in `us-east-1`. It is not evidence that AWS approved the request. As last verified, account
`677513020767` has healthy SES enforcement and sending enabled, but
`ProductionAccessEnabled: false`; the earlier request was denied under case `178215835700668`.

## Suggested request wording

> Sia is an invite-only desktop research alpha for no more than 20 named adult participants. We use
> Amazon Cognito to send passwordless one-time sign-in codes and account-security messages only.
> We do not send marketing, newsletters, purchased-list mail, or unsolicited bulk mail. Every
> recipient first agrees directly with the research team to join the private cohort; operators add
> only the approved address, and recipients can leave by contacting the public support address or
> deleting their Sia account.
>
> We expect fewer than 200 messages per day and no more than one message per second. The verified
> `superintelligentagents.ai` identity has successful DKIM. The domain publishes SPF and DMARC, and
> the public privacy, terms, and support pages describe the product and contact path. SES account
> suppression is enabled for bounces and complaints. An operator-monitored SNS topic receives
> CloudWatch alarms at a 5% bounce rate and 0.1% complaint rate. The operator reviews alarms,
> removes failing recipients, investigates complaints, and pauses invitations before resuming.
>
> Production access is requested only so Cognito can reliably deliver these transactional security
> messages to the small pre-approved cohort across unrelated email domains.

Use `MAILBOX_SIMULATOR` as the website/business type only if the AWS form offers no better research
or software category; do not describe this as a marketing use case. Submit through the SES
production-access workflow for `us-east-1`, include `https://superintelligentagents.ai/privacy`,
`/terms`, and `/support`, and answer follow-up questions with the same bounded use case.

## Evidence to recheck immediately before submission

```sh
aws sts get-caller-identity
aws sesv2 get-account --region us-east-1
aws sesv2 get-email-identity --email-identity superintelligentagents.ai --region us-east-1
aws sesv2 list-recommendations --region us-east-1
aws sesv2 get-suppressed-destination --email-address approved-test-address@example.com --region us-east-1
dig +short TXT superintelligentagents.ai
dig +short TXT _dmarc.superintelligentagents.ai
```

The last command against a proposed recipient is optional and should be omitted unless the approved
test address exists. Never put a real participant address in the repository or a shared log.

## Small internal-cohort alternative while approval is pending

AWS documents that `COGNITO_DEFAULT` can use a custom verified From identity while Cognito retains
the lower managed-delivery quota. For an internal cohort of at most 20 people, deploy the stack with:

```sh
EmailSendingAccount=COGNITO_DEFAULT
SesSourceArn=arn:aws:ses:us-east-1:677513020767:identity/superintelligentagents.ai
FromEmail=noreply@superintelligentagents.ai
```

This is a temporary delivery path, not SES production approval. Before relying on it, inspect a
non-executed CloudFormation change set for replacement or deletion, then have a release owner send
one Cognito-generated OTP or invitation to an approved unrelated-domain test recipient. Record
delivery time, From/Reply-To, SPF/DKIM/DMARC results, bounce/complaint alarms, and cleanup in the
private release log. Do not automate the send, use an unapproved address, or invite a participant as
part of infrastructure validation.
