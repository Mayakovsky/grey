# CDP Facilitator / Agentic.Market Compatibility Audit — Report

**From:** Kov · **To:** Desktop / Forces · 2026-08-02
**Nature:** investigation + report only, per directive. No code changed. No settlement rerouting.
**Refs:** `EXPANSION-CDP-BAZAAR-COMPATIBILITY-AUDIT-KOV-directive.md`, `adapters/x402-middleware/src/{config,clients,verify,settle,challenge}.ts`, `packages/grey-core/src/server/routes/offerings.ts`, live production VPS (`ubuntu@44.243.254.19`), live route `https://api.whitepapergrey.com`.

## Task 1 — Confirmed: settlement is 100% self-hosted, zero CDP Facilitator contact

**Code (both deployed and current `main` — see below):**
- `adapters/x402-middleware/src/config.ts` — `X402Config`/`loadX402Config()` has no facilitator URL field in its schema at all; no such env var is read.
- `adapters/x402-middleware/src/clients.ts:29-50` — `makeRelayerClients()` builds a plain viem `walletClient`/`publicClient` via `createWalletClient`/`createPublicClient` against `cfg.rpcUrl` (a generic RPC endpoint) with a `fallback([http(rpcUrl), http(rpcUrlFallback)])` transport. No CDP API client anywhere.
- `adapters/x402-middleware/src/verify.ts` — `verifyPayment()` does local EIP-712 signature recovery (`recoverTypedDataAddress`) and a direct on-chain `publicClient.readContract` call to the USDC contract's `authorizationState`. No network call to any CDP endpoint.
- `adapters/x402-middleware/src/settle.ts` — `settle()` does a local `simulateContract` + `writeContract` via the relayer's own private key, directly against the USDC EIP-3009 `transferWithAuthorization` function. No CDP call.
- `grep -ri "cdp\|facilitator\|coinbase" adapters/x402-middleware/src` → **zero matches**. The word "facilitator" does not exist anywhere in Grey's settlement code.

**Production, verified live via SSH (not assumed from the local `.env` template):**
- `grey-core.service` (systemd, `/opt/grey/grey`, live and running) loads `/etc/grey/grey-core.env`. Actual contents (secrets redacted): `X402_NETWORK=eip155:8453` (**Base mainnet**, not the stale testnet template the directive warned about), `BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/...` (**Alchemy**, not CDP), `BASE_X402_PAY_TO=0x394e81DA28799b578620803772FAeE403dE2d3f6` (real receiver). No facilitator-related variable exists in the file, matching the code's schema (there's nowhere to put one).
- **New finding, not asked for but load-bearing:** the deployed commit on the VPS is `a4bdab1` (PR #33, M6 FDQ-73) — **12 commits behind `origin/main` (`c7b8376`)**. The box has not been redeployed since before this entire Expansion project (E1-A/Round2/merge-prep, PRs #34-36) started. `git diff a4bdab1..origin/main -- adapters/x402-middleware/src/{verify,settle,clients,config}.ts` is **empty** — those four files are byte-identical between deployed and current `main`, so this Task 1 finding holds for both. But it also means **Round 2's `extra.bazaar` metadata work is not live in production at all** — see Task 2.

**Conclusion:** Grey's real settlements are currently invisible to CDP's indexing regardless of metadata quality, exactly as the directive suspected — confirmed against the live system, not assumed.

## Task 2 — CDP validator raw output

Ran `POST https://api.cdp.coinbase.com/platform/v2/x402/validate` against `https://api.whitepapergrey.com/v1/offerings/legitimacy_scan`, read-only, no payment, nothing indexed. No CDP API key was required to call the validator (got real diagnostic responses, not an auth error).

**Attempt 1 — default probe (validator defaults to GET):**
```json
{"resource":"https://api.whitepapergrey.com/v1/offerings/legitimacy_scan"}
```
→ HTTP 200 (validator's own status), `paymentRequirements.statusCode: 404`, `paymentRequirements.message: "Route GET:/v1/offerings/legitimacy_scan not found"`. Preflight check `returns_402`: **failed** (`actual: 404`, `passed: false`). Every subsequent check short-circuited as "Skipped: endpoint did not return 402". `bazaarExtension: null`, `index: null`, `valid: false`.

**Attempt 2 — explicit `method: "POST"`:**
```json
{"resource":"...","method":"POST"}
```
→ `paymentRequirements.statusCode: 400`, `code: "FST_ERR_VALIDATION"`, `message: "body must have required property 'token_address'"`. Same cascade of skipped checks. **The validator does not send a request body** — it probes with method + empty body, by design (a discovery crawler shouldn't need to already know the input shape to get a 402).

**Attempt 3 — explicit `method` + a `body` field with a valid `token_address`:** the validator **ignored the supplied body** and produced the identical 400/`token_address`-missing result as attempt 2. The validate endpoint's schema does not support injecting a request body — confirming this is deliberate: CDP's discovery flow assumes a probe-worthy resource returns 402 on an empty/no-body request.

**Ground truth, direct curl (not through CDP), to see exactly what's live:**
- `POST /v1/offerings/legitimacy_scan` with a **schema-valid body**, no payment → real `402`:
  ```json
  {"x402Version":1,"accepts":[{"scheme":"exact","network":"eip155:8453","maxAmountRequired":"250000","resource":"/v1/offerings/legitimacy_scan","description":"Grey legitimacy_scan offering","mimeType":"application/json","payTo":"0x394e81DA28799b578620803772FAeE403dE2d3f6","maxTimeoutSeconds":120,"asset":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","extra":{"name":"USD Coin","version":"2"}}],"error":"payment required"}
  ```
  **`extra` has no `bazaar` key at all** — confirms the deployed build predates Round 2 (per Task 1's commit-lag finding). Nothing to validate the shape of yet, live.
- `POST /v1/offerings/legitimacy_scan` with `{}` (empty body), no payment → `400 {"statusCode":400,"code":"FST_ERR_VALIDATION","error":"Bad Request","message":"body must have required property 'token_address'"}` — reproduces CDP's validator result exactly; not a validator quirk.
- `GET /v1/offerings/legitimacy_scan` → `404 {"message":"Route GET:/v1/offerings/legitimacy_scan not found",...}` — also reproduces exactly.

## Task 3 — Diagnosis: three independent, stacking blockers, not one

This is not simply (a) vs (b) from the directive's framing — it's **both, plus a third, more immediate one**:

1. **Settlement never touches CDP Facilitator** (Task 1). Even if everything else were perfect, indexing is structurally impossible — CDP only catalogs a route the first time *its own* `/settle` sees a payment for it, and Grey's settlement path never calls CDP at all.

2. **Wire-format mismatch.** Per CDP's docs (`docs.cdp.coinbase.com/x402/bazaar`, fetched today): the canonical discovery field is a **top-level `extensions.bazaar`** object (`{bazaar: {info: {input, output}, schema: {...}}}`), populated via CDP's reference SDK. Grey's Round 2 build nests it as `accepts[0].extra.bazaar` (`adapters/x402-middleware/src/challenge.ts`) with a different internal shape (`discoverable/serviceName/tags/description/inputSchema/outputSchema/iconUrl` vs CDP's `info.input/info.output/schema`). This is a real shape mismatch, not a naming nit — even a route that *did* settle through CDP would need this reprojected to validate.

3. **New finding: Grey's own request-validation ordering blocks discovery-by-probing, independent of (1) and (2).** `packages/grey-core/src/server/routes/offerings.ts:30-34` registers each paid route with both `schema: { body: { $grey: {...} } }` and `preHandler: x402PreHandler` on the same Fastify route options object. Fastify's request lifecycle runs body-schema validation *before* `preHandler` hooks fire. So a probe that doesn't already know the exact required request body (which is exactly what an evaluating agent or a discovery crawler is trying to learn — that's the whole point of returning `extra`/`extensions` on the 402) gets a `400 FST_ERR_VALIDATION` and never reaches the point where `x402PreHandler` would run and a 402-with-metadata would be returned. **This is untested territory**: `packages/grey-core/test/x402-routes.test.ts`'s existing "402 without payment" coverage (`it.each` over all 7 slugs) always supplies a schema-valid `payload` — no test exercises an empty-body probe, so this gap was never exercised, in CI or otherwise, until this audit hit it live.

Blocker 3 is arguably the most consequential of the three on its own: it would defeat *any* third-party discovery crawler's ability to probe Grey's routes at all (CDP's or otherwise), independent of whether Grey ever adopts CDP Facilitator or fixes the extension shape. Fixing (2) alone would do nothing while (3) stands — the fixed metadata would never be reachable by an unauthenticated probe.

**Not diagnosing further per the directive** — whether to (a) route settlement through CDP Facilitator (new Coinbase dependency, cost/platform-risk call), (b) reproject `extra.bazaar` → `extensions.bazaar`, and/or (c) reorder Grey's own validation so an empty/malformed body still reaches the payment gate and returns 402-with-metadata (this one has no CDP dependency at all and looks independently worth doing regardless of the CDP decision) are Forces' calls, not mine to make here.

## Task 4 — Agentic.Market curated tier (carried forward, not re-chased)

No self-service application process found in CDP's docs for this pass either — consistent with the directive's own finding (automatic/objective ranking: buyer reach, transaction volume, recency, metadata completeness). Nothing in Tasks 1-3 changes that picture, so carrying it forward as a known-unknown per the directive's own instruction, not independently re-verified further this round.

## Stopping here

Per the directive: no code changes, no settlement rerouting. Awaiting Forces' ruling on (a) the CDP Facilitator adoption question specifically, and ideally a separate, lower-stakes call on blocker 3 (the validation-ordering fix), since that one has no external-dependency cost and blocks discovery generally, not just CDP's. E2 (Kite) rides the same x402 rail and inherits whatever's decided here.
