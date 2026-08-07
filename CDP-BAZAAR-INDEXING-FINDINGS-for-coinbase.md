# Grey / Whitepaper Grey — CDP Bazaar indexing failure, exhaustive investigation, real evidence

**Service:** Whitepaper Grey (`api.whitepapergrey.com`), custom hand-rolled resource server (raw Fastify, no `x402ResourceServer` framework — deliberate, to control behavior directly and avoid a heavy dependency tree on a memory-constrained VPS). Facilitator: CDP (`api.cdp.coinbase.com/platform/v2/x402`). Network: `eip155:8453` (Base mainnet), also tested extensively on `eip155:84532` (Sepolia).

## Summary

A real, on-chain-confirmed Base mainnet settlement, through a challenge shape independently confirmed correct by CDP's own `/v2/x402/validate` endpoint (`valid: true`, `simulation.outcome: "accepted"`, zero failed checks), under our real production `payTo`, never appears in `/discovery/merchant` or `/discovery/search` after 10 minutes of polling. Every alternative explanation we could construct or find has been tested directly and ruled out.

## The real settlement

- Tx: `0x20fb0916fd11322e8d26a91a028abaec26126e681e6fe39e2450ae7e83ba35f9`
- From: `0x250E784efC40202f6dACf523d6e2Df4331AE7373` (single-purpose test wallet)
- To (`payTo`): `0x394e81DA28799b578620803772FAeE403dE2d3f6` (our real production receiving wallet)
- Amount: 250,000 atomic units USDC ($0.25), confirmed via the `Transfer` event log
- Confirmed via direct RPC: `status: 0x1`, `to` is the real mainnet USDC contract
- EIP-712 domain (`name()`, `version()`, `DOMAIN_SEPARATOR()`) independently fetched from the live contract and recomputed to a byte-exact match before signing

## Five real bugs found and fixed along the way (in case useful to others hitting the same wall)

1. `x402_version` mismatch — our buyer-facing 402 challenge was v1-shaped; the resource itself needs to be v2.
2. `PAYMENT-SIGNATURE` — the v2 client request header, not `X-PAYMENT` (that rename applies to both directions, not just the response headers).
3. `resource.url` must be absolute — a bare path (e.g. from a raw `req.url`) fails silently.
4. `extensions.bazaar.info.input`/`output` must contain a real, schema-valid **example value** plus a `type` discriminator (`http`) — not transport metadata (method/bodyType alone) and not the raw request schema itself.
5. A `$ref` inside `output.schema` pointing at an internal, non-publicly-resolvable domain caused CDP's validator to fail attempting to dereference it over the network — dropping `output.schema` (optional, advisory-only per CDP's own severity classification) resolved it.

All five are now confirmed fixed — `/v2/x402/validate` returns clean.

## Hypotheses tested directly and refuted

- **Wallet must be CDP-provisioned, not a self-generated EOA.** Refuted — our test wallet is a fresh, self-generated EOA with no CDP account association whatsoever, and settlement + the validator both behave identically regardless.
- **Indexing requires mainnet specifically, not testnet.** Refuted — this exact real mainnet settlement, above, behaves identically to two prior real Sepolia settlements: clean everywhere, zero indexing.
- **A naive settle-on-any-2xx bug causing failed-but-charged requests, masking the real issue.** Checked directly against our actual Fastify hook wiring — not applicable to our architecture.
- **Indexing is simply slower than expected.** Checked against documented successful cases (other implementers report indexing within ~1–6 minutes of a correctly-shaped settlement) — we polled for a full 10 minutes across three separate query methods (`merchant?payTo=`, `search?query=legitimacy`, `search?query=whitepapergrey`) with zero results; the search endpoint itself is confirmed working, since it returns other real merchants for adjacent queries.

## Open question

Given a real settlement, a clean validator result, and every alternative explanation directly ruled out — what else gates a resource actually entering the discovery catalog? Happy to provide additional logs, the exact request/response bodies, or run further diagnostics on request.
