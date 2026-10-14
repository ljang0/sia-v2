# Phone cloud relay

Decision (October 13, 2026, project owner): phone access moves from the plain-HTTP Wi-Fi remote to
an encrypted relay through Sia cloud, so a phone can reach its Mac from any network over HTTPS.
This document is the design. The Wi-Fi remote stays until the relay passes its acceptance checks.

## Why

The Wi-Fi remote serves the phone page over unencrypted LAN HTTP with the pairing token in the URL
path. Anyone on the same network can read the conversation and act as the phone. It works only on
the Mac's network, and browsers deny secure-context features such as speech recognition to plain
HTTP pages. `workflow-robustness.md` lists an encrypted channel as P1 before the remote is
marketed.

## Shape

```text
Phone browser (HTTPS page from the Sia site) ──wss──┐
                                                    ├── API Gateway WebSocket ── relay function
Mac (Sia, outbound only) ───────────────────wss─────┘        (forwards sealed frames; DynamoDB
                                                              holds devices and connections)
```

- **Push, not polling.** The Mac and each paired phone hold one WebSocket to the relay while
  phone access is on. The relay forwards frames between them with `postToConnection`. Idle cost is
  connection minutes, not function time, so more phones is a concurrency setting, not a redesign.
  The Mac still accepts no inbound connections. Sia must be open and the Mac awake, as today.
- **End-to-end sealed.** Pairing creates a random 256-bit key on the Mac. It reaches the phone only
  in the QR code's URL fragment, which browsers never send to a server. Every request, reply, and
  state push is sealed with AES-256-GCM under that key (random 96-bit nonce, the device id as
  additional data). The relay stores and forwards ciphertext and learns only sizes and timing.
- **Credentials in the first frame.** Browsers cannot set WebSocket headers, and URLs end up in
  logs, so a connection is anonymous until its first frame:
  - Mac: `{ "type": "hello", "role": "mac", "idToken": … }`. The relay verifies the Cognito ID
    token (issuer, audience, expiry, RS256 against the pool's JWKS).
  - Phone: `{ "type": "hello", "role": "phone", "deviceId": …, "token": … }`. The relay compares
    the token's SHA-256 with the device record in constant time.

  Any other first frame, or none within 10 seconds, closes the connection.

- **Devices.** Pairing (a Mac frame) mints a device id and a random token. The relay keeps only the
  token hash, scoped to the Mac's account (at most 10 devices). Revoking deletes the record and
  closes the device's connections. Re-pairing rotates the token and the key.
- **Same routes, same rules.** A sealed request is `{ id, method, route, body }` for the existing
  remote routes (`state`, `vault`, `note`, `command`, `cancel`, `clear`, `results/<id>`,
  `outbox/<name>`). The Mac answers with the transport-neutral handler the Wi-Fi server also uses.
  Relay turns come from the owner's own device: they follow the Mac's Computer setting (automatic
  by default), and when confirmations are on the phone can approve or deny the exact pending step
  (`approve` route, accepted only over the relay).
- **Live state.** The Mac pushes a sealed state frame to each connected phone whenever the phone
  view changes, so the phone shows progress without polling.
- **Limits.** Frames up to 96 KiB of sealed payload; files larger than the inline limit say "Open
  it on your Mac" until sealed object transfer (phase 2). Each connection may send 120 frames per
  minute. Connection records expire after 24 hours.

## Relay frames

| From  | Frame                          | Relay action                                                                           |
| ----- | ------------------------------ | -------------------------------------------------------------------------------------- |
| any   | `hello`                        | Authenticate; record the connection; reply `ready`                                     |
| Mac   | `pair`                         | Create a device; reply `paired { deviceId, token }`                                    |
| Mac   | `devices`                      | Reply `devices [{ deviceId, createdAt, lastSeenAt, online }]`                          |
| Mac   | `revoke { deviceId }`          | Delete the device; close its connections; reply `revoked`                              |
| Phone | `sealed { payload }`           | Forward to the account's Mac as `sealed { deviceId, payload }`, or reply `mac_offline` |
| Mac   | `sealed { deviceId, payload }` | Forward to that device's phone connections                                             |
| —     | phone connects / disconnects   | Tell the Mac `presence { deviceId, online }`                                           |

## Acceptance before marketing

1. Pair, send, approve on the Mac, STOP, NEW, and results from a physical phone on cellular data.
2. Revocation takes effect immediately; a revoked token and a stale key both fail.
3. The relay's table and logs contain no plaintext prompt, reply, file name, or state.
4. Speech recognition works on the HTTPS page.
5. Load: 100 paired phones with live state stay inside the relay function's concurrency budget.

## Where it lives

| Part                    | Code                                                                     |
| ----------------------- | ------------------------------------------------------------------------ |
| Relay service           | `apps/cloud/src/services/remote-relay.ts`, `src/remote-lambda.ts`        |
| Relay storage and push  | `apps/cloud/src/aws/remote-relay-store.ts`, `aws/api-gateway-pusher.ts`  |
| Mac ID token check      | `apps/cloud/src/aws/cognito-id-token.ts`                                 |
| Sealing (Mac and phone) | `apps/desktop/src/shared/remote-seal.ts`                                 |
| Mac relay client        | `apps/desktop/src/main/remote/cloud-remote.ts` (owned by `PhoneRemote`)  |
| Shared request handling | `PhoneRemote.dispatch` in `apps/desktop/src/main/remote/phone-remote.ts` |
| Phone page transport    | `apps/desktop/src/mobile/relay.ts`, `src/mobile/api.ts`                  |
| Infrastructure          | `infra/template.yaml` (`EnablePhoneRelay`), `infra/public-site.yaml`     |

Automated coverage: relay unit tests (`apps/cloud/test/remote-relay.test.ts`), token verification
against generated RSA keys, a Mac↔relay↔phone protocol test against the real relay service
(`cloud-remote.test.ts`), and a Chromium/WebKit test of the built phone page through a local
WebSocket relay (`tests/remote/phone-relay.spec.ts`). None of this is a deployed, physical-phone
acceptance run.

## Turning it on (operator)

Nothing changes until all of these are done, in order, each as its own reviewed step:

1. Deploy `sia-alpha` with `EnablePhoneRelay=true` through a reviewed change set, and note the
   `PhoneRelayUrl` output.
2. Deploy the public site with `PhoneRelayOrigin` set to that URL's `wss://host`, after
   `pnpm --filter @sia/desktop remote:build && pnpm --filter @sia/site build`.
3. Add `phoneRelayUrl` (the full `wss://…/v1`) and `phonePageUrl`
   (`https://<site>/remote/`) to the packaged `sia-cloud.json`, then build and sign a release.
   Builds with both values reach phones only through the relay; builds without them keep the
   Wi-Fi remote.
4. Run the acceptance checks above on that signed build with a physical phone.
