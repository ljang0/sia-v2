# Public site launch record

## Staged AWS surface

- Stack: `sia-public-site`
- AWS account: `677513020767`
- Private origin bucket: `sia-public-site-sitebucket-pwwaws3jkmxb`
- CloudFront distribution: `E3MFZH4OWO2B9C`
- Staging URL: `https://dua821t8fcsc9.cloudfront.net/`
- ACM certificate: `arn:aws:acm:us-east-1:677513020767:certificate/c49d6024-56b4-4d0c-99b0-f4643cedf266`
- Certificate state at staging: `PENDING_VALIDATION`

The origin blocks public access and accepts signed reads only from the named CloudFront distribution.
The bucket has encryption, versioning, public-access blocks, and a 30-day noncurrent-version expiry.
CloudFront redirects HTTP to HTTPS, uses TLS 1.2 or later, supports HTTP/2 and HTTP/3, rewrites clean
paths to directory indexes, compresses responses, and adds CSP, HSTS, frame, content-type, referrer,
permissions, and cross-origin-opener headers.

The final hosted Lighthouse run on 2026-08-23 KST scored 99 performance, 100 accessibility, 100 best
practices, and 100 SEO. Lab metrics were 1.1 s first contentful paint, 2.0 s largest contentful paint,
0 cumulative layout shift, 0 ms total blocking time, and 1.4 s speed index, with zero console errors.

## Exact Namecheap DNS additions

Preserve every existing MX and TXT record. Add only the following web and certificate records.

### ACM validation

| Type  | Namecheap host                          | Value                                                              | TTL       |
| ----- | --------------------------------------- | ------------------------------------------------------------------ | --------- |
| CNAME | `_480dd221d5886ca9fa645edcb3271508`     | `_8dc30bf575cf87251126c4de3ec028d2.jkddzztszm.acm-validations.aws` | Automatic |
| CNAME | `_7daa30302ba2b8e4b3cc1ad7c2135642.www` | `_9a033eda5736169299ce05a78aeabd1a.jkddzztszm.acm-validations.aws` | Automatic |

Wait until ACM reports `ISSUED`, then deploy the custom-domain distribution configuration.

### Web traffic

| Type  | Namecheap host | Value                          | TTL       |
| ----- | -------------- | ------------------------------ | --------- |
| ALIAS | `@`            | `dua821t8fcsc9.cloudfront.net` | Automatic |
| CNAME | `www`          | `dua821t8fcsc9.cloudfront.net` | Automatic |

Confirm `https://superintelligentagents.ai/`, `/privacy/`, `/terms/`, `/research/`, `/support/`, and
`/.well-known/security.txt` before entering those URLs in Google Auth Platform.

## Domain email forwarding

Keep the existing Namecheap email-forwarding MX and SPF records. Forward these aliases to the operator
mailbox `superintelligentagents@gmail.com` and test each one from an unrelated sender:

- `hello@superintelligentagents.ai`
- `support@superintelligentagents.ai`
- `privacy@superintelligentagents.ai`
- `security@superintelligentagents.ai`

Do not publish an alias as a participant contact until delivery and reply behavior have been tested.

## Public copy review

The staged site describes actual engineering controls, but publication does not replace named human
approval. Before external invitations, complete `docs/research-release-signoff.md` with a research
lead, privacy/legal reviewer, security owner, support owner, AWS alarm owner, and rollback owner.

The exact staged policy copy is under `apps/site/public/`. Any material change to collection, Google
data use, retention, training, export, deletion, or administrator access requires an updated policy and,
where applicable, a new in-app consent version.
