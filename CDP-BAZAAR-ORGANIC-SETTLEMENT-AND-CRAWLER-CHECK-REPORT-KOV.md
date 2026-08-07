# CDP Bazaar — Organic Production Settlement + Crawler Check — Delivery Report

**From:** Kov · **To:** Desktop / Forces · 2026-08-07
**Refs:** `CDP-BAZAAR-ORGANIC-SETTLEMENT-AND-CRAWLER-CHECK-KOV-directive.md`

## Outcome, stated plainly up front

All three steps ran. **Settlement #5 succeeded**, real money moved, and — for the first time across
five settlements — **`grey_two.revenue_events` actually got a row**, because this one went through
the real deployed `grey-core` process instead of a scratch checkout. The crawler check found **zero
third-party traffic** on any of the 7 paid CDP routes in the settlement window — every hit in that
window, and in fact every hit in the log's entire lifetime so far, is mine. Discovery poll: **still
not indexed**, same as all four prior settlements.

One correction to the directive's own premise, caught before any money moved: **`claim_evaluation`
does not exist.** Flagged and resolved below (Step 1).

---

## Step 0 — fresh wallet, funded, confirmed on-chain myself

**Address:** `0x451d781CFce55C00D1ccBc9c208c036bf9124813` — brand-new keypair, not a reuse of any
existing Grey/Benthic wallet or the settlement #3 `.cdp-mainnet-test` wallet. Generated via the real
`@grey/ceremony` crypto path (`runGenkey` → Argon2id + AES-256-GCM), non-interactive passphrase
injection (same pattern as `.sepolia/gen-fixture.mts`), except the passphrase itself is a real
CSPRNG-generated 6-word diceware phrase, not a hardcoded throwaway — this wallet held real funds.
Verified by decrypting the keystore and re-deriving the address from the recovered key before
reporting it (integrity check built into `runAddress`, not skipped).

**Funding confirmed directly on-chain, not from a message alone** — queried the address against two
independent RPCs (Alchemy `base-mainnet`, public `mainnet.base.org`), both agreeing at consecutive
block heights:

```
chainId 8453 block 49663005 rpc https://base-mainnet.g.alchemy.com/v2/...
ETH: 0.00006 (60000000000000 wei)
USDC: 0.25 (250000 atomic)

chainId 8453 block 49663010 rpc https://mainnet.base.org
ETH: 0.00006 (60000000000000 wei)
USDC: 0.25 (250000 atomic)
```

## Step 1 — pricing check found the directive's premise stale, resolved before spending

**`claim_evaluation` does not exist.** Checked `packages/grey-schemas/src/pricing/table.ts` and the
`PAID` array in `packages/grey-core/src/server/routes/offerings.ts` directly — the 7 paid CDP
offering slugs are `legitimacy_scan` ($0.25), `verify_whitepaper` ($1.50), `verify_full_tech`
($3.00), `claim_extraction` ($0.75), `claim_history` ($0.25), `quick_protocol_facts` ($0.30),
`daily_tech_brief` ($8.00). No slug named `claim_evaluation` anywhere in this repo. Cheapest is a
**tie at $0.25** between `legitimacy_scan` and `claim_history` (network multiplier is 1.00× for the
`x402` channel, so no hidden repricing on the CDP-routed path) — confirmed live against real `402`
challenges before picking, both returning `amount: "250000"` atomic USDC.

**Picked `legitimacy_scan`** — same resource used in all four prior settlements, keeping this
comparable to that history rather than introducing a new variable.

### The settlement itself — real HTTP round-trip against the live deployed service

No scratch server. Signed and submitted directly from this machine against
`https://api.whitepapergrey.com/v1/cdp/offerings/legitimacy_scan`, the real production process
(this route is v2 x402 protocol — `PAYMENT-REQUIRED`/`PAYMENT-SIGNATURE`/`PAYMENT-RESPONSE` headers,
confirmed against `cdpFacilitator.ts`'s own header-naming comments before building the client, not
assumed to be the same as the primary route's `X-PAYMENT`/`X-PAYMENT-RESPONSE`).

1. **Real `402` challenge**, decoded via `@x402/core/http`'s own `decodePaymentRequiredHeader`:
   `payTo: 0x394e81DA28799b578620803772FAeE403dE2d3f6`, `asset: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
   (correct Base mainnet USDC), `amount: "250000"`, `network: eip155:8453`.
2. **Real EIP-3009 `TransferWithAuthorization`** signed by the funded wallet against that exact
   domain (name/version/chainId/verifyingContract all taken from the live challenge, not assumed).
3. **Resubmitted with `PAYMENT-SIGNATURE`** and a real, schema-valid body (`token_address` =
   Uniswap's real address, from the schema's own documented example shape) → **`200`**, and:
   ```
   PAYMENT-RESPONSE (decoded): {"success":true,"transaction":"0x75e8bff253180b378a306780f9d54070ddf7dd6d77606f263094542ca2b84082","network":"eip155:8453"}
   ```
4. **On-chain confirmation, two independent RPCs, both agreeing:**
   ```
   status: success
   blockNumber: 49663153
   to (contract called): 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913   <- correct Base mainnet USDC
   block timestamp: 2026-08-07T15:14:13Z
   ```
   Buyer wallet's USDC balance re-checked post-settlement: **`0`** — the full $0.25 actually moved,
   nothing left over (confirms the "cheapest, tied to the funded amount" sizing worked as intended).
   The transaction's `from` (gas payer) is `0xca5e87f82b3fa093800e6ad67d621a427d79c70d` — CDP's own
   facilitator relayer, not Grey's local one (`0xDbDb19E0...` from the primary-route settlements) —
   consistent with this route genuinely going through CDP's hosted facilitator, not the self-hosted
   rail.

5. **`grey_two.revenue_events` — a real row landed, the first ever:**
   ```
   id           | 877c0a1d-2edf-4b3b-bf22-f8f07cf275b2
   channel      | x402-cdp
   offering     | legitimacy_scan
   revenue_usd  | 0.250000
   settled_at   | 2026-08-07 15:14:12.171962+00
   ```
   Queried directly (`grey_pipeline_rw` role, production DB) immediately after on-chain confirmation
   — this table was empty before this settlement (confirmed in the prior log-confirm report). This
   closes the open question from that report: prior settlements never wrote here because they ran
   through scratch checkouts that never touched the deployed process's DB connection; this one did,
   and it wrote.

**Settlement timestamp used to anchor Step 2:** `2026-08-07T15:14:12Z` (server-reported
`metadata.timestamp` / DB `settled_at`; on-chain block timestamp agrees at `15:14:13Z`).

## Step 2 — crawler check: zero third-party traffic

Grepped `/var/log/caddy/api.whitepapergrey.com.log` on the VPS for any request to any of the 7 paid
CDP offering routes, any method, any source IP, no payment-header filter applied at grep time (all
matches inspected, then classified). The log has existed since 2026-08-06T22:14:49Z (this directive
is the first real settlement since logging went live). **Every single matching line in the log's
entire lifetime so far — 8 total — is from IP `98.113.67.178`, my own connection**, split as:

- 5 lines from 2026-08-07T02:42:22–02:42:30Z: the live pricing-check curls run earlier in this same
  session (Step 1's `402` confirmation probes), `curl/8.17.0` user-agent, no payment header, `402`.
- 3 lines inside the settlement window, verbatim:

| Timestamp (UTC) | Method | Path | Source IP | Status | Payment header present | User-Agent |
|---|---|---|---|---|---|---|
| 2026-08-07T15:13:42Z | POST | `/v1/cdp/offerings/legitimacy_scan` | 98.113.67.178 | 402 | **no** | node |
| 2026-08-07T15:14:10Z | POST | `/v1/cdp/offerings/legitimacy_scan` | 98.113.67.178 | 402 | **no** | node |
| 2026-08-07T15:14:12Z | POST | `/v1/cdp/offerings/legitimacy_scan` | 98.113.67.178 | 200 | **yes** | node |

The first two are my own settlement script's challenge-fetch calls (one dry-run pass, one live
pass, both intentionally sent without a payment header to capture the real `402`); the third is the
actual settlement. **No request from any other source IP touched any of the 7 paid CDP offering
routes in the ~1-hour window before or after settlement, or at any point since logging went live.**
This is a real absence, not a coverage gap — the log has been continuously live and capturing every
request (including my own test traffic) since well before this window opened.

## Step 3 — discovery poll: still not indexed

Polled `GET /discovery/merchant?payTo=0x394e81DA28799b578620803772FAeE403dE2d3f6` against CDP's
discovery endpoint (`api.cdp.coinbase.com/platform/v2/x402/discovery/merchant`) every ~28–30s for
**17 polls spanning 2026-08-07T15:17:51Z–15:25:33Z** (~11 minutes post-settlement, exceeding the
directive's 10-minute floor) — `pagination.total: 0` on **every single poll**, never changed. Final
`/discovery/search?query=legitimacy_scan` and `?query=whitepapergrey` at 15:25:33Z: both
`resources: []`. Same result as all four prior settlements, now including one that (a) went through
the real deployed process, (b) wrote a `revenue_events` row, and (c) had zero crawler traffic on the
route in the surrounding hour — none of which changed the indexing outcome.

## Cleanup

Deleted `.cdp-organic-settlement/` in full (signing script, keystore, passphrase file) — verified
gone (`ls` fails on the path post-deletion). One residual: the `.gitignore` entry I added for that
directory (mirrors the existing `.cdp-mainnet-test/` line) is still present and **uncommitted** —
harmless now that the directory it matches no longer exists, but flagging rather than silently
leaving an unexplained working-tree diff. No server-side checkout to clean up this time, per the
directive's own note (organic settlement, no scratch server).

## Deliver checklist

- [x] Step 0: fresh wallet generated, address reported, funding confirmed on-chain via two
      independent RPCs before proceeding
- [x] Step 1: pricing premise checked and corrected (`claim_evaluation` doesn't exist) before any
      money moved; real settlement executed against the live production endpoint; on-chain
      confirmed two ways; `revenue_events` row confirmed (first one ever, closing a prior open
      question)
- [x] Step 2: crawler check run against the real (now-populated-by-this-settlement) Caddy log;
      every match reported verbatim; zero third-party traffic found
- [x] Step 3: discovery poll run past the 10-minute floor; not indexed, consistent with prior
      settlements
- [x] Cleanup: signing script + key material deleted and verified gone
