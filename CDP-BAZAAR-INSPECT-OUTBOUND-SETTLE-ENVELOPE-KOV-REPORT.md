# CDP Bazaar — Inspect Our Own Outbound Settle Envelope — Delivery Report

**From:** Kov · **To:** Desktop / Forces · 2026-08-22
**Refs:** `CDP-BAZAAR-INSPECT-OUTBOUND-SETTLE-ENVELOPE-KOV-directive.md`

## Outcome, stated plainly up front

Task 1 came up empty — neither settlement #5 nor the rejected dry-run ever had its outbound
request body captured, confirmed two independent ways. Rather than stop there, reading Grey's own
code and `@x402/core`'s compiled source directly (both the raw client Grey calls and the SDK's own
"correct" higher-level wrapper) answered the real question more precisely than a single capture
could: **`extensions.bazaar` has exactly one real transmission path to CDP's settle-time envelope
— `paymentPayload.extensions`, populated by the *buyer's* client echoing our 402 declaration — not
`paymentRequirements.extensions`, which structurally never travels to `/verify`/`/settle` for
anyone using this SDK, including CDP's own reference implementation.** A fresh, capturing dry-run
(Task 2, pre-authorized) confirms that path works end-to-end on Grey's side: when a payload
carries that echo, it survives Grey's passthrough and JSON serialization intact, verbatim, into
the real outbound POST body. This reverses the investigation's working hypothesis — the gap, if
one exists, is not a missing wiring step in Grey's server code.

**Separately: an operational incident.** A grep I ran mid-investigation (broad `--include="*.env*"`
glob) accidentally matched local `.env` and printed the real `CDP_API_KEY_ID`/`CDP_API_KEY_SECRET`
in cleartext into my own tool output/transcript. Flagged live immediately; Forces judged no
rotation needed, told me to continue. Documenting here for the record — see "Operational incident"
below.

---

## Task 1 — nothing was ever captured, confirmed two ways

**Way 1 — re-checked what actually gets logged.** Re-read `@x402/core`'s compiled
`HTTPFacilitatorClient.verify()`/`.settle()` (`chunk-4Y6I6537.mjs`): both build their request body
inline via a single `JSON.stringify({x402Version, paymentPayload, paymentRequirements})` passed
straight to `fetch()` — there is no logging call anywhere near the request construction.
`logExtensionResponsesHeader(response)` (the thing settlement #5's journald capture caught) runs
**after** the response comes back and only ever touches `response`, never the request that
produced it. Structurally could not have captured the outbound body, for either call.

**Way 2 — checked whether anything else in Grey's infra captured it.** The `requests` table
(`grey_two.requests`, `packages/grey-pipeline/src/persistence/schema.ts`) — the only real
"incoming request audit trail" table in the schema — stores `offering, subject (jsonb), status,
error, timestamps`; nothing here is the raw HTTP payment payload/header. Matches the prior report's
own already-stated baseline ("no request-level logging exists at all"). The rejected dry-run's own
script (the one that produced last round's raw response dump) was deleted from both machines
immediately after that run, per its own hygiene note — nothing recoverable there either.

**Conclusion: genuinely nothing captured for either call. Task 1 is empty**, as anticipated by the
directive's own fallback structure.

## The real mechanism (found by reading source, not guessed)

Before running a new dry-run, traced exactly where `extensions.bazaar` could possibly land in an
outbound `/verify`/`/settle` request, reading both Grey's own code and `@x402/core`'s compiled
implementation end to end:

- **`cdpFacilitator.ts`'s `buildCdpPaymentRequirementsEntry()`** — the single `accepts[]`-shaped
  object Grey's own doc comment says is "used both in the 402 challenge and handed to
  verify/settle" — returns `{scheme, network, asset, amount, payTo, maxTimeoutSeconds, extra}`.
  **No `extensions` field, ever.** `buildCdpChallenge()` (the full 402 body) adds
  `extensions: buildCdpBazaarExtension(kit)` as a **top-level sibling of `accepts`**, only on the
  402 wrapper object — never on the single-accept object handed to `verifyAndSettleViaCdp()`.
- **Confirmed this isn't a Grey-specific miss**: `@x402/core`'s own type declarations
  (`facilitator/index.d.ts`, `x402Client-....d.ts`) show `FacilitatorClient.verify()`/`.settle()`
  both take exactly `(paymentPayload, paymentRequirements)` — two arguments, no extensions slot.
  Even the SDK's own higher-level `x402ResourceServer.verifyPayment()`/`.settlePayment()` (the
  "correct", framework-driven usage Grey's hand-rolled Fastify routes don't use) bottoms out
  calling `facilitatorClient.verify(paymentPayload, requirements)` — the **exact same two-argument
  shape**, confirmed by reading `server/index.mjs` directly. `declaredExtensions` in that higher
  layer is used **only** to invoke local, in-process extension lifecycle hooks (`beforeVerify`,
  `onVerifyFailure`, 402-declaration enrichment) — it is never serialized into the facilitator HTTP
  call, in any usage pattern this SDK supports.
- **The real slot is `paymentPayload.extensions`** — a documented field on the v2 `PaymentPayload`
  type itself (`x402Client-....d.ts` line 1243). `@x402/core`'s own reference buyer-side
  `x402Client` (`client/index.mjs`) is built to read the seller's 402-declared `extensions` and
  **merge a client echo into the payload it submits** ("merges server-declared extensions with
  client extension echoes"). Grey's server-side `decodeCdpPaymentPayload()`
  (`cdpFacilitator.ts`) decodes the buyer's `PAYMENT-SIGNATURE` header, validates a few specific
  inner fields (`accepted.scheme`, `payload.signature`, `payload.authorization.{from,to}`), and
  returns the **entire parsed object unmodified** otherwise — it never touches, strips, or needs to
  add `.extensions`. Whatever the real buyer's client included survives untouched all the way to
  `client.verify(payload, requirements)`.

**This is a materially different, more precise finding than the directive's working hypothesis.**
Whether `extensions.bazaar` reaches CDP's settle-time envelope was never gated by anything in
Grey's server code — it depends entirely on whether the *buyer's own client* is spec-compliant
enough to echo the seller's 402 declaration back into its submitted payload, exactly the kind of
distinction novadyne-hq's "inspect the envelope you actually send" framing was pointing at, just
located one hop further out than assumed.

## Task 2 — capturing dry-run, real bytes, self-corrected once

Built a script (`adapters/x402-middleware/scratch-capture-outbound.mjs`, deleted after — see
below) that imports Grey's **real, compiled, production** `buildCdpPaymentRequirementsEntry`,
`buildCdpBazaarExtension`, and `makeCdpFacilitatorClient` directly from
`adapters/x402-middleware/dist/`, builds a disposable-key-signed v2 payload (same Anvil test key as
the prior authorized dry-run — no real funds, no new spend, `verify()` never broadcasts), attaches
a simulated compliant-buyer echo of the real `legitimacy_scan` 402 declaration (same offering as
settlement #5) as `payload.extensions`, monkeypatches `fetch` to log the exact outbound bytes
before letting the real call through, then calls the real `client.verify()`.

**First run had a bug in my own test construction, caught before trusting it**: I wrote
`extensions: { bazaar: bazaarExt }`, double-wrapping — `buildCdpBazaarExtension()` already returns
a `{bazaar: {...}}`-keyed object (confirmed against `buildCdpChallenge()`'s real usage, which
assigns it directly, no extra key). Fixed to `extensions: bazaarExt`, re-ran.

**Real, verbatim captured outbound POST body** (`https://api.cdp.coinbase.com/platform/v2/x402/verify`,
CDP creds sourced from the VPS's own `/etc/grey/grey-core.env`, never printed):

```json
{"x402Version":2,"paymentPayload":{"x402Version":2,"accepted":{"scheme":"exact","network":"eip155:8453","asset":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","amount":"250000","payTo":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8","maxTimeoutSeconds":120,"extra":{"name":"USD Coin","version":"2","credentialTypes":["authorization"]}},"payload":{"signature":"0x3660bc82...","authorization":{"from":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266","to":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8","value":"250000","validAfter":"0","validBefore":"9999999999","nonce":"0xabab...ab"}},"extensions":{"bazaar":{"info":{"input":{"type":"http","method":"POST","bodyType":"json","body":{"token_address":"0x1f9840a85d5af5bf1d1762f925bdaddc4201f984","project_name":"Example Protocol"}},"output":{"type":"json","example":{"projectName":"Example Protocol", "...": "..."}}},"schema":{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"input":{"...":"full legitimacy_scan request schema, verbatim"}}}}}},"paymentRequirements":{"scheme":"exact","network":"eip155:8453","asset":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","amount":"250000","payTo":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8","maxTimeoutSeconds":120,"extra":{"name":"USD Coin","version":"2","credentialTypes":["authorization"]}}}
```

(Inner `output.example`/`schema` bodies elided with `"..."` markers for length above — every
top-level key shown is complete and verbatim, and the full untruncated capture matched the
`bazaarExt` printout from the same run byte-for-byte.)

**Two confirmed facts, directly from this capture:**

1. **`paymentRequirements` (bottom-level key of the request) has no `extensions` field** —
   exactly `{scheme, network, asset, amount, payTo, maxTimeoutSeconds, extra}`, matching the source
   analysis above precisely.
2. **`paymentPayload.extensions.bazaar.{info,schema}` is present, intact, single-nested, and
   byte-identical in shape to what our own 402 declares** (compared directly against the
   `bazaarExt`/`buildCdpBazaarExtension(kit)` printout captured in the same run) — it survived
   JSON serialization and Grey's passthrough completely unmodified.

Called `client.verify()` for real (no new money — same disposable key/no-broadcast guarantee as
before): got `VerifyError: invalid_exact_evm_payload_signature` (the test signer has no real
funds, same rejection shape as the prior dry-run). **Notably: CDP's `/verify` didn't reject or
complain about the malformed double-nested `extensions` on the first (buggy) run either** — it
returned the identical signature-rejection error both times, suggesting CDP's `/verify` doesn't
validate the `extensions` shape at verify time regardless of what's inside it. Consistent with the
prior round's `EXTENSION-RESPONSES: {}` finding: CDP receives it, doesn't visibly engage with it.

Cleaned up: `scratch-capture-outbound.mjs` deleted from both the VPS
(`/opt/grey/grey/adapters/x402-middleware/`) and local checkout immediately after, `git status`
confirmed it was never tracked either place.

## Operational incident — accidental secret exposure, flagged and resolved live

Mid-investigation, ran `grep -rln "CDP_API_KEY..." --include="*.env*" ...` to locate which env file
documents these vars. The glob matched local `C:\Users\kidco\dev\grey\.env` and the tool printed
the real `CDP_API_KEY_ID` and `CDP_API_KEY_SECRET` values in cleartext into my own tool output —
meaning they landed in this session's transcript, a different (and arguably lower-trust) exposure
surface than the local file alone. Stopped immediately, flagged it directly rather than continuing
past it. **Forces' call: no rotation needed, continue** — judged acceptable given it's the user's
own local machine/session. Did not reuse the exposed value for the rest of this task regardless —
the actual dry-run above sourced CDP creds fresh from the VPS's own `/etc/grey/grey-core.env`,
loaded into a remote shell's environment without ever displaying its contents.

**Worth a permanent habit change, not just this-once:** avoid `--include="*.env*"`-shaped globs
(or any pattern that could match a real dotenv file) in future searches — grep for the variable
*name* inside `.md`/`.ts` files specifically, or exclude `.env` explicitly, rather than a broad
glob that happens to also match the one file guaranteed to hold live secrets in cleartext.

## Deliver checklist

- [x] Task 1: confirmed empty, two independent grounds stated above (not guessed)
- [x] Real mechanism traced from source (Grey's own code + `@x402/core` compiled SDK, both layers)
      — `paymentRequirements.extensions` structurally never travels to `/verify`/`/settle`, for
      anyone; `paymentPayload.extensions` is the real, buyer-populated slot, and Grey's server
      faithfully passes it through unmodified
- [x] Task 2: fresh capturing dry-run, verbatim outbound bytes shown above, self-corrected one
      bug in my own test construction before trusting the result, no new money, scripts cleaned up
      both sides
- [x] Operational incident: accidental cleartext secret exposure via a broad grep glob, flagged
      live, Forces decided no rotation needed, noted here for the record with a habit fix

## Open question for the next round (not answered by this pass)

Grey's server-side transmission is proven correct when the buyer's client cooperates — but there's
still no way to check, after the fact, what the **real** buyer's client actually sent for
settlement #5 specifically (no request-level logging exists in production to check against). Two
concrete options if this matters going forward: (a) add minimal logging of
`decoded.payload.extensions` presence/shape at the point `decodeCdpPaymentPayload` succeeds (small,
targeted, no PII/secret risk — just a boolean + key list), or (b) test with the actual reference
`@x402/core` `x402Client` library as the buyer (not a hand-signed payload) against a real 402
Grey serves, to see empirically whether a "normal" spec-compliant client really performs the echo
in practice. Flagging both, not building either without direction — this pass was scoped to
Task 1/2 as written.
