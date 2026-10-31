# Public distribution candidate

## Current decision — October 31, 2026

The owner selected **Mac first; iPhone follows** and confirmed ownership of the relevant Notch
source rights. Internal signed alpha.49 completed two useful research/native task pairs and two
verified filing runs. The latest universal notarized package is alpha.48, whose browser research
failed. Final-artifact and physical acceptance remain incomplete. **External pilot release is not complete.**
No artifacts were published or invitations sent; the last published Mac pilot remains alpha.24.

## Current internal alpha.49 evidence

Developer ID signed arm64 QA from `857671735fefe2669fa40a5a3a2b5d49afd84ef2`; **not notarized**.
Installed `app.asar`: `ba63bdab4a39e4319a2993674c5270e9d22a0ceec4ade3da280c6a11eeb5c66f`.
Strict signatures and package/runtime checks passed. The complete local pilot gate passed:
1,832 desktop units, 46 Electron, 33 renderer and 72 phone-web checks, plus native/shared-package
checks. Exact-source CI is [run 41192133254](https://github.com/ljang0/sia-v2/actions/runs/41192133254).

- **Research/native repeats:** two fresh official-source control comparisons (688/664 words) and
  native proposal briefs (338/342 words) were saved and independently checked. Research took
  181/172 seconds; the first followed explicit Chrome recovery, the second reused its connection.
  Setup settled in 1.835 seconds and returned to Sia automatically. No corrective task messages
  were needed. The first native run refused a final scroll with same-app window ambiguity after
  saving; the second verified its saved copy with no failed native action. The report preview works.
- **Cancellation:** a second agent visibly waited for the occupied browser window without input.
  Stop showed the cancellation result within a 672 ms CUA round trip; the owner subsequently
  completed its report. Alpha.48's equivalent notice took 30.112 seconds.
- **Filing:** two independent packets each moved six actual project documents into three requested
  folders, preserved every hash and retained an empty Inbox. Runs took 27/31 seconds and 24/25 steps.
- **Responsiveness:** ten switches during the second filing run measured median 826 ms / worst
  1,301 ms including CUA observation; click acknowledgements were 30–88 ms. This is not isolated
  paint latency, and one round trip exceeded the one-second target. An unsent foreground draft
  survived the first research/native pair. Current-candidate foreground TextEdit/clipboard and
  precise startup measurements remain open.

Later technical-research trajectories were filtered, so these runs do not provide complete
interleaved-GUI or post-cancellation browser-input instrumentation. The operator did not claim the
public Chrome tab in CUA during alpha.49 research; both runs completed without the earlier browser
stall. Competing browser control is a hypothesis, not an established cause. Personal planning,
complete reviewer-packet preparation, final universal-artifact repeats and physical acceptance
remain open. Private evidence is in `alpha49-artifacts/real-work/real-work-result.json`.

## Exact alpha.48 artifact and live result

Built from `d07060a6a8edf469905f30b21698282dbe808dfd`. The complete local pilot gate passed:
1,828 desktop units, 46 Electron, 33 renderer and 72 phone-web checks. Universal signing,
app/DMG notarization, stapling, Gatekeeper and packaged runtime checks passed. Nothing was published.

| Artifact                           | SHA-256                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `Sia-0.1.0-alpha.48-universal.dmg` | `321bfd4ead2efbe5fb7334983b55f95ecbe5e321e30f0d92b0d5239d13d200d9` |
| `Sia-0.1.0-alpha.48-universal.zip` | `fb0b26d3cc4b7dd5a499f27833c91c54a9173717a7f46875efa7c5b1f8e8f497` |
| Installed QA `app.asar`            | `a537257931361bfcd9b463baef2ec428ec9ff185266e601604a61c0662a80b7c` |
| Saved native brief                 | `4319d0e27941111130f7e5e4e81175a54c6f961b80ba492065b2b16dfdc5086f` |

Explicit Chrome setup settled in 1.742 seconds, returned focus to Sia and resumed the saved task
without operator activation or an extra Continue click. The native TextEdit task saved a faithful
343-word technical-review brief in about 95 seconds. An unsent foreground draft survived switching
conversations; a Unicode clipboard canary was preserved and the original clipboard restored.
CUA's typed draft omitted accented/emoji characters, so this is not a Unicode typing pass.

Browser research failed after navigation lost its acknowledgement and a subsequent native access
check returned `authorization_host_failed`. Independent CUA also timed out reading the public page;
a screenshot showed the requested destination, and a later DOM read recovered. One assisted
continuation encountered another navigation failure. The cause remains unproven; no completed
comparison or successful concurrent browser-input run is claimed for alpha.48.

A second task waited for the occupied browser window without sending input. Its execution cancelled
in 202 ms; the visible cancellation notice was not committed until 30.112 seconds after Stop.
Alpha.49 acknowledges local cancellation without awaiting the provider RPC, while retaining runner
leases through cleanup, and deduplicates provider interruption requests. Content-free diagnostics
will distinguish browser transport timeouts from unavailable origin proof. The complete alpha.49 local gate passed (1,832 desktop units, 46 Electron, 33 renderer and
72 phone-web checks); exact-source CI and signed live verification remain pending. Sia's display-sleep assertion still failed.

Private evidence is in `alpha48-artifacts/real-work`. The prior notarized packages are preserved.

## Earlier useful-work evidence and rollback

Internal signed alpha.46 completed a public-source visitor plan and native proposal editing with
interleaved GUI actions, without corrective messages. Six actual project files were organized with
all hashes intact. Ten conversation switches during filing measured median 815 ms / worst 1,068 ms,
including CUA observation. Its full local and CI gates passed. Working renderer CPU remained
elevated in short spot checks; those samples were not a controlled performance benchmark.

Notarized alpha.47 saved a sourced control-tool comparison and native brief but needed operator
continuation after Chrome setup. These prior successes do not override alpha.48's failed research.
The [pinned prior record](https://github.com/ljang0/sia-v2/blob/d07060a6a8edf469905f30b21698282dbe808dfd/docs/public-release.md)
preserves exact hashes, sources, timings, failures and qualifications for alpha.42–47. Earlier
notarized packages and QA backups remain available locally; do not relabel them as this candidate.

This Mac refused Sia's display-sleep assertion with `kIOReturnNoMemory`; independent Apple
`caffeinate -d` and `-i` probes also failed, although other processes had assertions. The error does
not establish physical RAM as the cause. Keep-awake and physical lock/sleep behavior remain unverified.

## Cloud and follow-on iPhone evidence

Cloud ratings/account-deletion changes from `bd32d980635b6cf894ae56c4bb2504cfadfaead7` were
deployed to `sia-alpha`. The deployment verified both package hashes, atomic retries/rerating and
account-deletion isolation. A synthetic authenticated app rating reached the aggregate report.
The October 30 health recheck found all 18 alarms OK with actions enabled and all five Lambdas
Active/Successful. Anonymous catalog, ratings-report and release requests returned 401.

Native iPhone 0.1.0 (31) is Ready to Test in the internal Pilot QA group, with zero testers at the
last acceptance check. Native tests, signed archive, upload and Apple processing passed. Physical
pairing, file Save, reconnect and microphone acceptance, and external beta review remain open.
The owner selected iPhone as a follow-on release, so those checks do not gate this Mac-first handoff.

## Publication

The alpha.48 artifact folder is prepared locally with the installer, checksums, signed-package verification and private
real-work evidence. It is an acceptance candidate, not a published release. Keep private
recipient lists and download links outside Git. After the remaining [release gates](./release-status.md)
pass and the owner authorizes distribution, follow [release operations](./release.md) and verify the
recipient's downloaded hash. Keep prior notarized backups available for rollback. Research recruitment retains
its separate [sign-off](./research-release-signoff.md).
