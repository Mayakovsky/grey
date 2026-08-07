# CDP Bazaar indexing failure despite four independent real settlements, both known leads closed clean.  


**Related:** #2112 (closed, but underlying problem in this report is not resolved by that thread — posting fresh since this goes further than what's documented there).

**Service:** Whitepaper Grey (`api.whitepapergrey.com`), custom hand-rolled resource server (raw Fastify, no `x402ResourceServer` framework). Facilitator: CDP (`api.cdp.coinbase.com/platform/v2/x402`). Tested on both `eip155:84532` (Sepolia) and `eip155:8453` (Base mainnet).

## Summary

Four independent, real, on-chain-confirmed settlements — across two networks, at different points in a multi-week fix cycle — through a challenge shape CDP's own `/v2/x402/validate` confirms is fully clean (25/25 preflight, `simulation.outcome: "accepted"`). None have ever appeared in `/discovery/merchant` or `/discovery/search`. Every hypothesis raised in #2112, including two specific fixes suggested directly by `@ethanoroshiba`, has been checked against real production bytes or real settlements and closed clean.

## The four settlements


| #   | Network                                       | Tx                                                                   | Status                                                                                                         |
| --- | --------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | Sepolia                                       | (early challenge-shape test, pre-fixes)                              | on-chain confirmed                                                                                             |
| 2   | Sepolia                                       | (post-shape-fix validation)                                          | on-chain confirmed                                                                                             |
| 3   | Base mainnet                                  | `0x20fb0916fd11322e8d26a91a028abaec26126e681e6fe39e2450ae7e83ba35f9` | on-chain confirmed, `status: 0x1`, correct mainnet USDC contract, real `Transfer` log for 250,000 atomic units |
| 4   | Sepolia (retest, post `payload.resource` fix) | `0x1824bece3cbe8b2f8bc2fe6c9aa25c170708010542d153216100e19d1a6aefc2` | on-chain confirmed, `status: 0x1`, correct Sepolia USDC contract                                               |


All four: real EIP-712 domain independently recomputed against the live USDC contract before signing (not just trusted from config), real `PAYMENT-RESPONSE` header confirming facilitator-side verify+settle success, real polling of `/discovery/merchant?payTo=` and `/discovery/search` (20–30s intervals, full 10-minute windows minimum) — zero results, every time.

## Wire-format issues found and fixed along the way (five, all confirmed via `/validate`)

1. `x402_version` — challenge was v1-shaped; resource itself must be v2.
2. `PAYMENT-SIGNATURE` — the v2 client request header, not `X-PAYMENT` (applies to both directions).
3. `resource.url` must be absolute, not a bare path.
4. `extensions.bazaar.info.input`/`output` need a real schema-valid example value plus a `type` discriminator — not transport metadata, not the raw request schema itself.
5. A `$ref` inside `output.schema` pointing at a non-publicly-resolvable internal domain broke CDP's validator attempting to dereference it — dropped (optional, advisory-only field).



## Two additional leads from `@ethanoroshiba` directly, both checked against real bytes, one was real

- `extensions.bazaar.discoverable: true` ("not a valid field... we've seen this pattern before") — checked directly against live production output. **Confirmed clean, not present.**
- `paymentPayload.resource` **required for the discovery job to be submitted, not part of the base x402 spec, settlements succeed without it** — checked directly. **This was real.** Grey's CDP-routed settlement path was not populating this field on the payload sent to CDP's verify/settle. Fixed: the field is now always overwritten with Grey's own canonical value server-side, even if a buyer's payload omits it. Deployed to production, re-verified clean via `/validate` post-deploy. Settlement #4 above is the retest against this exact fix. Still not indexed.



## Hypotheses tested and refuted

- **Wallet must be CDP-registered, not a self-generated EOA** — independently refuted by our own mainnet settlement (self-generated EOA, indexing still absent) and consistent with the later correction inside #2112 itself (an engineer reply plus independent EIP-1167 bytecode analysis both refute the community's earlier working theory on this).
- **Mainnet-specific requirement** — refuted; settlement #4 (Sepolia) behaves identically to settlement #3 (mainnet).
- **Settle-on-2xx / naive middleware charging on handler failure** — checked directly against our actual Fastify hook wiring, not applicable to our architecture.
- **Slower-than-expected indexing** — checked against documented cases elsewhere (indexing typically appears within minutes when it works); every one of our four tests polled for a minimum of 10 minutes with zero change.



## Open question

Given four independently confirmed real settlements, a challenge shape CDP's own validator calls fully compliant, and both of your own engineer's specific leads checked directly against production bytes (one confirmed clean, one confirmed real and fixed) — what else gates a resource actually entering the catalog? Happy to provide raw request/response captures, the CDP API key ID, specific transaction hashes for cross-referencing against internal indexing logs, or run any further diagnostics.