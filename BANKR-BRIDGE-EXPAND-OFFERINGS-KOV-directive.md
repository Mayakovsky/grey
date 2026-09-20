# Bankr Bridge — Expand to Full Offering Catalog — directive for Kov

**From:** Claude Desktop · **To:** Kov · **Status: AUTHORIZED by Forces (2026-09-20) — build, test, and go live. Kov is standing by; start now.**

**Context:** `legitimacy_scan` is live on Bankr's x402 Cloud (`BANKR-CREDENTIALS-RUNBOOK-STATUS-KOV.md`). It is the only one of Grey's 6 sellable offerings that's actually reachable there. This directive closes that gap for the other 5. Same posture as the original build: additive, env-gated, no new wallet/signing key anywhere in this path.

## Why this exists

`packages/grey-core/src/server/routes/bankrBridge.ts` already says it out loud:

> `/** Slug allowlist for this pass — legitimacy_scan only. Deliberately not the full PAID array (offerings.ts) — scope stays tight per the directive; more slugs are a follow-up directive. */`

This is that follow-up directive.

## Scope — exactly these 5, nothing else

From `packages/grey-core/src/server/routes/offerings.ts`'s `PAID` array and `packages/grey-schemas/src/pricing/table.ts`'s `PRICING_TABLE`:

| slug | canonicalUsd | Bankr service id (kebab) |
|---|---|---|
| `verify_whitepaper` | 1.50 | `verify-whitepaper` |
| `verify_full_tech` | 3.00 | `verify-full-tech` |
| `claim_extraction` | 0.75 | `claim-extraction` |
| `claim_history` | 0.25 | `claim-history` |
| `quick_protocol_facts` | 0.30 | `quick-protocol-facts` |

x402's `NETWORK_MULTIPLIER` is 1.00, so Bankr `price` = `canonicalUsd` unchanged, same as `legitimacy-scan`'s `0.25`.

### Explicitly NOT in scope — do not add these

- **`legitimacy_scan_trust_rung`** ($0.10, `enabled: true`) — it's a real priced offering, but it's gated by its own separate runtime flag (`trustRungEnabled()` in `@grey/x402-middleware`), independent of the `PAID` array. **Confirm its current enablement/reachability state before deciding whether it belongs in this batch — don't assume either way.** Report what you find; if it's live elsewhere, that's a candidate for a follow-up, not this one.
- **`daily_tech_brief`** ($8.00), **`daily_greenlight_list`** (unpriced), **`scam_alert_feed`** (unpriced) — all `enabled: false`. Per Forces rulings (BION-DIRECTIVE-62; 2026-07-30 merge-prep ruling), these are **not being offered, period** — not a listing gap, a deliberate hold. Putting these on Bankr would contradict a standing Forces ruling. Leave them out.
- **`prediction_market_research`**, **`resolution_evidence_compiler`** (e3-b2 Olas Mech offerings) — `enabled: true` but, per `table.ts`'s own comment, "ship built-but-functionally-empty this phase (no cache-population pipeline... always return `NOT_YET_ANALYSED`)." Do not expose a paid Bankr listing that always returns a placeholder. Leave out until that pipeline exists.

## Pattern to replicate — mechanical, not novel

Every piece of this was already built, reviewed (`BANKR-BRIDGE-REVIEW-DESKTOP.md`), fixed, and verified live for `legitimacy_scan`. Copy that pattern 5 times; don't redesign it.

1. **`packages/grey-core/src/server/routes/bankrBridge.ts`** — extend `BANKR_BRIDGE_SLUGS` from `['legitimacy_scan']` to include all 5 new slugs. The route registration loop is already generic (`offeringHandlers[slug]` + `buildEnvelope`, no per-slug logic) — this should be a one-line array change, not new route code.
2. **`packages/grey-core/test/routes/bankrBridge.test.ts`** — mirror the existing 8-test block per new slug: 404 unmounted, 403 missing/wrong/short secret, 400 bad body, 200 + envelope shape, primary `/v1/offerings/<slug>` route unaffected (regression guard), $0 bridge-ledger event kept distinct from real x402 revenue.
3. **`integrations/bankr-bridge/x402/<kebab-slug>/index.ts`** — one new file per offering, same shape as `legitimacy-scan/index.ts`, pointed at `POST /v1/bridge/bankr/<snake_slug>`. **Apply the `Response.json(await res.json())` fix on the success path from the start** (the bug my review caught on `legitimacy-scan` — don't reintroduce it on the new ones).
4. **`integrations/bankr-bridge/bankr.x402.json`** — one new entry per offering under `services`. Cite real input/output schemas against the actual `@grey/schemas` types for each offering (same diligence as `legitimacy-scan`'s citation of `GreyResponseEnvelope.d.ts` + `grey-schemas/src/index.ts:164-178`) — no placeholder schemas. Note the CLI also has `bankr x402 add <name>` / `bankr x402 configure <name>` for scaffolding a new service interactively — use whichever gets you to a correct, schema-accurate config file faster; hand-authoring is fine too, as done for `legitimacy-scan`.
5. `vitest run` — all green — before anything touches Bankr's side.
6. Push a branch, open the diff for my review. Same as last time: **merge-only vs. merge-and-deploy verdict, stated explicitly** — do not deploy to the VPS or to Bankr ahead of that review.
7. Once cleared and Forces gates the merge: VPS deploy of grey-core's route changes (same env-gated, dormant-safe posture as before — reuses the existing live `GREY_BANKR_BRIDGE_SECRET`, no new secret needed). Then `bankr x402 deploy <kebab-slug>` for each of the 5.
8. Verify each exactly like the runbook did for `legitimacy-scan`: `bankr x402 schema <url>` matches the built schema; unauthenticated `curl -i -X POST <url>` returns a clean `402` with correct price/network/asset/`payTo`.
9. One `BANKR-BRIDGE-EXPAND-OFFERINGS-REPORT-KOV.md`, same convention as the last runbook status report.

## Wallet/account protocol — RESOLVED, Forces decided (2026-09-20)

This was an open question when this directive was first drafted; it's closed now.

- Checked: Bankr's docs have no documented account-transfer/rename feature — each account (email → auto-generated wallet → API key) is created fresh at sign-in, not mutable. "Switching" would mean a real migration (new account, redeploy every endpoint, new live URL, old one retired) — not a settings change.
- **Forces' ruling: stay on the current account (`kidcopernicus@gmail.com`).** No migration. Deploy all 5 new offerings under this same account/session, same as `legitimacy_scan`.
- `payTo` stays Grey's existing production wallet (`0x394e81DA28799b578620803772FAeE403dE2d3f6`), routed through `BankrFeeRouterV2` exactly as already verified for `legitimacy_scan` — no change to that mechanism for the new offerings.

Nothing further to check or flag on this — proceed.
