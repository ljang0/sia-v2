# Public site launch record

## Live AWS surface

- Stack: `sia-public-site`
- AWS account: `<AWS account ID>`
- Private origin bucket: `sia-public-site-sitebucket-pwwaws3jkmxb`
- CloudFront distribution: `E3MFZH4OWO2B9C`
- Staging URL: `https://<distribution>.cloudfront.net/`
- Production URL: `https://superintelligentagents.ai/`
- ACM certificate: `<ACM certificate ARN>`
- Certificate state: `ISSUED`

The origin blocks public access and accepts signed reads only from the named CloudFront distribution.
The bucket has encryption, versioning, public-access blocks, and a 30-day noncurrent-version expiry.
CloudFront redirects HTTP to HTTPS, uses TLS 1.2 or later, supports HTTP/2 and HTTP/3, rewrites clean
paths to directory indexes, compresses responses, and adds CSP, HSTS, frame, content-type, referrer,
permissions, and cross-origin-opener headers.

The final hosted Lighthouse run on 2026-08-23 KST scored 99 performance, 100 accessibility, 100 best
practices, and 100 SEO. Lab metrics were 1.1 s first contentful paint, 2.0 s largest contentful paint,
0 cumulative layout shift, 0 ms total blocking time, and 1.4 s speed index, with zero console errors.

## Applied Namecheap DNS records

Every pre-existing MX and TXT record was preserved. The following web and certificate records were
applied on 2026-08-23 KST.

### ACM validation

| Type  | Namecheap host                          | Value                                                              | TTL       |
| ----- | --------------------------------------- | ------------------------------------------------------------------ | --------- |
| CNAME | `_480dd221d5886ca9fa645edcb3271508`     | `_8dc30bf575cf87251126c4de3ec028d2.jkddzztszm.acm-validations.aws` | Automatic |
| CNAME | `_7daa30302ba2b8e4b3cc1ad7c2135642.www` | `_9a033eda5736169299ce05a78aeabd1a.jkddzztszm.acm-validations.aws` | Automatic |

Both validation names resolve from the authoritative Namecheap servers and the Cloudflare and Google
public resolvers. ACM reports `ISSUED`.

### Web traffic

| Type  | Namecheap host | Value                           | TTL       |
| ----- | -------------- | ------------------------------- | --------- |
| ALIAS | `@`            | `<distribution>.cloudfront.net` | Automatic |
| CNAME | `www`          | `<distribution>.cloudfront.net` | Automatic |

CloudFront has both apex and `www` aliases plus the issued certificate. Direct SNI/TLS checks against
the distribution returned HTTP 200 for both names with certificate verification result 0 and the
expected CSP, HSTS, frame, content-type, referrer, and permissions headers. The public resolvers see
the production records; this Mac retained an earlier negative DNS result immediately after cutover,
so repeat the ordinary local-browser route pass after that cache expires before entering the URLs in
Google Auth Platform.

## Domain email forwarding

The existing Namecheap email-forwarding MX and SPF records were preserved. These aliases now forward
to the operator Google account mailbox; delivery still needs testing from an
unrelated sender:

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
