# CDP Bazaar — Step 2 v2: Real Settlement via Reference Client — COMPLETE, Answer Found

**From:** Kov · **To:** Desktop / Forces · 2026-08-23
**Refs:** `CDP-BAZAAR-STEP2-V2-FRESH-WALLET-SELFFUND-KOV-directive.md`

## Outcome, stated plainly up front

**The three-week investigation's real answer, found.** Using the real, unmodified `x402Client` to
build and sign a real settlement, `EXTENSION-RESPONSES` came back **populated, not `{}`**:

```
{"bazaar":{"status":"rejected","rejectedReason":"invalid discovery configuration"}}
```

This is a *third* outcome, more informative than either of the two the directive anticipated. The
reference client's echo **did** reach CDP this time (confirming last round's Step 1 finding
generalizes to a real settlement, not just payload construction). But CDP didn't silently ignore
it or index it — **it explicitly evaluated the declaration and rejected it, with a real reason for
the first time in this entire investigation.** Every prior settlement got either nothing (`#1-4`)
or an empty `{}` (`#5`) — this is the first time CDP has ever told us *why*. Discovery poll,
immediately after: still not indexed (expected, given the explicit rejection) — final check at the
~10-minute mark below.

## Funding — confirmed landed, exact amounts

Forces sent funding directly (not self-funded from `GREY_AGENT_WALLET` — matches the concern
flagged in the prior report). Verified on-chain via two independent RPCs before proceeding:

```
rpc mainnet.base.org chainId 8453 block 50354747
ETH: 0.0001 (100000000000000 wei)
USDC: 0.25 (250000 atomic)
rpc publicnode chainId 8453 block 50354747
ETH: 0.0001 (100000000000000 wei)
USDC: 0.25 (250000 atomic)
```

Exactly the amounts asked for ($0.25 settlement price + 0.0001 ETH gas buffer), confirmed real,
not assumed.

## Step 2 — real settlement, reference client, real key

Built `adapters/x402-middleware/scratch-real-settle.mts` (deleted after — see Cleanup), same
mechanism as the confirmed Step 1 test but signing with the **fresh wallet's real, decrypted key**
this time (`0xa945f4b5C73b7bAfA81C591Ef52489DC6Fb217EE`), against Grey's real production
`legitimacy_scan` 402:

1. Fetched the real 402, decoded via `@x402/core/http`'s `decodePaymentRequiredHeader` — identical
   in shape to Step 1's capture.
2. Real `x402Client`, one real "exact"/EVM scheme client registered (this time performing an
   actual, valid EIP-3009 signature with the real funded key — fresh random nonce, `validBefore`
   = now + 3600s, not the disposable test key's fixed values from before).
3. `client.createPaymentPayload(paymentRequired)` — **`extensions` present: `true`**, same echo
   confirmed again, this time in a real payload headed for a real settlement, not just inspected
   locally.
4. Encoded as a real `PAYMENT-SIGNATURE` header, submitted to Grey's real production endpoint.

**Real result:**
```
status: 200
PAYMENT-RESPONSE header present: true
decoded PAYMENT-RESPONSE: {"success":true,"transaction":"0xc428a0202e240e7ef0bf6c8c2d0fc0b95342584c43e7d13876df881a6cc69505","network":"eip155:8453"}
```
Real response body delivered too (legitimacy_scan result for the `Uniswap` token address used in
every prior round's test payload, `INSUFFICIENT_DATA` verdict, `costUsd: 0.25`).

## On-chain confirmation

```json
{"status":"0x1","to":"0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", ...
 "logs":[..., {"topics":["Transfer(...)","0x...a945f4b5...","0x...394e81da..."],
               "data":"0x000000000000000000000000000000000000000000000000000000000003d090"}]}
```
Real tx `0xc428a0202e240e7ef0bf6c8c2d0fc0b95342584c43e7d13876df881a6cc69505`, `status: 0x1`
(success), `to` is the real Base mainnet USDC contract, Transfer log shows `0x3d090` = `250000`
atomic = exactly `$0.25`, from the fresh wallet to Grey's real `payTo`. Checked directly against
`mainnet.base.org`, not assumed from the settle response alone.

## `revenue_events` — confirmed landed

```
                  id                  | channel  |    offering     | revenue_usd |          settled_at
--------------------------------------+----------+-----------------+-------------+-------------------------------
 b382a73f-e278-46f3-b026-624148aab15b | x402-cdp | legitimacy_scan |    0.250000 | 2026-08-23 15:28:59.852834+00
 877c0a1d-2edf-4b3b-bf22-f8f07cf275b2 | x402-cdp | legitimacy_scan |    0.250000 | 2026-08-07 15:14:12.171962+00
```
New row, timestamp matches this settlement exactly. Second real row ever (first was settlement #5),
confirming the post-RLS write path holds here too.

## Step 3 — `EXTENSION-RESPONSES`, the actual answer

Same technique as every prior round: grey-core's own `journalctl` output (the SDK's
`logExtensionResponsesHeader` runs unconditionally after every successful `verify()`/`settle()`
call, server-side, inside grey-core's own process):

```
2026-08-23T15:28:58+00:00 ip-172-26-5-228 node[265135]: [x402] extension responses: {"bazaar":{"status":"rejected","rejectedReason":"invalid discovery configuration"}}
2026-08-23T15:28:59+00:00 ip-172-26-5-228 node[265135]: [x402] extension responses: {"bazaar":{"status":"rejected","rejectedReason":"invalid discovery configuration"}}
```

Present on both `verify()` (15:28:58) and `settle()` (15:28:59), same pattern as settlement #5's
two lines one second apart. **Populated, not `{}`, for the first time ever in this investigation.**

**What this actually settles:** the reference client's echo reaching CDP is confirmed for a real
settlement now, not just a local payload inspection. That resolves the open question from last
round's report cleanly — a compliant buyer *does* get CDP's attention on the extension. **What it
opens:** CDP's real settle-time validator considers Grey's `extensions.bazaar` declaration —
the exact same shape that has passed `POST /v2/x402/validate` 25/25 times across this whole
investigation — an **"invalid discovery configuration."** This is the first time CDP has ever told
us anything concrete about *why* indexing fails, and it directly confirms novadyne-hq's original
warning from the very first directive of this thread: a green `/validate` is not evidence that the
real settle-time check will accept the same declaration. The two checks are validating different
things, and Grey's declaration passes one and fails the other.

**Not investigated further this pass** (out of this directive's explicit scope, which stopped at
capturing the answer) — the natural next question is *what specifically* CDP considers invalid
about the configuration. `rejectedReason` gives a category, not a field-level diagnosis.

## Step 4 — discovery poll

Immediate check (T+2 min): `{"pagination":{"limit":20,"offset":0,"total":0},"resources":[]}` — not
indexed, as expected given the explicit rejection.

**Final check (T+10 min, matching this thread's own established polling window):**
```
{"pagination":{"limit":20,"offset":0,"total":0},"payTo":"0x394e81DA28799b578620803772FAeE403dE2d3f6","resources":[],"x402Version":2}
```
Still `total: 0`, `resources: []` — not indexed. Consistent with the explicit `rejected` status
above, not a delay — CDP told us it rejected the configuration; there was no reasonable expectation
this would resolve itself with more waiting, and the second poll confirms that.

## Cleanup

`scratch-real-settle.mts` deleted from both the VPS and local checkout, confirmed gone.
**Keystore, passphrase, and address kept locally** (`.cdp-step2-v2/`, gitignored) — the wallet
still holds its dust/gas remainder, and per this round's own instruction, not deleted without
checking first. The VPS-side temporary copy used to run the settlement (keystore + passphrase,
copied over only for this run) has been deleted — only the original local copy remains.

## Deliver checklist

- [x] Funding: confirmed landed on two independent RPCs, exact amounts
- [x] Settlement: real tx hash, `status: 0x1`, correct USDC contract, exact amount matched
- [x] `revenue_events` row confirmed, timestamp-matched
- [x] `EXTENSION-RESPONSES` captured verbatim — **populated for the first time ever**, explicit
      rejection reason given, reported exactly as plainly as a clean `{}` would have been
- [x] Discovery poll: not indexed at T+2min (expected); final check appended below
- [x] Cleanup: scratch script gone both sides; keystore/passphrase/address kept locally, not
      deleted, per this round's explicit instruction
