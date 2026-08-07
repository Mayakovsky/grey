# EXPANSION E1-A — computeClass + canonical pricing engine — KOV BUILD DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-07-30).
**Spec:** `MARKET-EXPANSION-PROJECT.md` §2.2–2.3 (computeClass, canonical price + networkMultiplier), §3 E1-A, §6 (Invariant #30, #31).
**Anchor:** `grey/main` `2b9c56f` (confirmed current HEAD via `refs/heads/main` — no drift since the M6 baseline tag; `docs/INVARIANTS.md` sits at #29).
**Branch:** `expansion-e1-a-computeclass`.
**Nature:** schema + enforcement layer. **No external surface changes** — existing x402/ACP behavior, routes, and prices stay byte-identical on this phase. Zero new chain, zero new channel. Low-risk, mechanical.
**Discipline:** explicit staging paths only (never `git add -A`/`.`); `vitest run` is the canonical runner; MCP failure → retry ≤3 then STOP+report; no time estimates; central verification, cite `file:line`. Reviews are diffs (`gh pr diff`), not prose reports. Commits stage explicit paths; merge is Forces-gated.

## Why this phase, and what it must not do

This is the foundation the entire Expansion sequences on top of (§1, §4 G1/G3). Two structural facts to build against, both confirmed by inspection just now, not assumed from the plan doc alone:

- `packages/grey-core/src/handlers/index.ts` registers **9** offerings. Of those, exactly **4** are live-capable — `legitimacy_scan`, `verify_whitepaper`, `verify_full_tech`, `claim_extraction` — routed through `packages/grey-core/src/orchestration/cacheOrLive.ts` on a cache miss. The other 5 (`claim_history`, `quick_protocol_facts`, `daily_tech_brief`, `daily_greenlight_list`, `scam_alert_feed`) never reach `cacheOrLive` today — they're structurally cache-only already, which is most of Invariant #30's enforcement half-done by existing architecture, not by a new gate.
- `adapters/x402-middleware/src/prices.ts` is the **current** single price source (Invariant #20) but only covers **7** slugs — it has no entry for `daily_greenlight_list` or `scam_alert_feed`. It also doesn't match two of §2.5's recommended values: current `legitimacy_scan` is `$0.25` (this is the existing **live-capable, LIVE_ALLOWED** offering — do not confuse it with the **new**, distinct `$0.10 CACHE_ONLY` trust-rung offering from §2.4/B-1, which is out of scope for E1-A and belongs to E1-C, blocked from live exposure regardless); current `quick_protocol_facts` is `$0.30` against a `$0.20` Agentverse-tier recommendation that doesn't apply yet (Agentverse is E6). **Do not silently reprice anything on this phase** — canonicalize the *existing* values as-is, flag the gaps (the 2 missing offerings) to Desktop rather than inventing prices for them.

## Task 1 — `computeClass` + canonical price table in `@grey/schemas`

Land the single source Invariant #31 requires, superseding (not duplicating) `adapters/x402-middleware/src/prices.ts`'s `PRICE_TABLE`. Suggested shape — adjust to what the codebase's existing schema conventions actually look like, this is the sound intent, not a mandated literal:

```typescript
export type ComputeClass = 'CACHE_ONLY' | 'LIVE_ALLOWED' | 'LIVE_PRIORITY';

export interface OfferingPricing {
  readonly slug: OfferingSlug;       // reuse the existing type from @grey/schemas/responses
  readonly canonicalUsd: number;     // one canonical USD price, channel-agnostic
  readonly computeClass: ComputeClass;
}
```

Classify all 9 current offerings:
- `legitimacy_scan`, `verify_whitepaper`, `verify_full_tech`, `claim_extraction` → `LIVE_ALLOWED` (they resolve through `cacheOrLive`).
- `claim_history`, `quick_protocol_facts`, `daily_tech_brief`, `daily_greenlight_list`, `scam_alert_feed` → `CACHE_ONLY` (they don't).
- Nobody gets `LIVE_PRIORITY` yet — no current offering has a premium-queue variant. Flag if you find one.

For the 2 slugs with no existing canonical price (`daily_greenlight_list`, `scam_alert_feed`): don't invent a number. Carry them into the table with the price field left absent/flagged, and note it in the PR — Desktop will source the correct figure before merge, this is not a blocking decision Kov should make.

## Task 2 — Enforce the floor at the `cacheOrLive.ts` boundary (Invariant #30)

`No offering may be served below its computeClass floor. CACHE_ONLY offerings never trigger live compute under any circumstance, including a paid retry.`

Concretely: add an assertion at the entry to `cacheOrLive()` (or at its call sites in the 4 relevant handlers) that the offering being passed in is provably `LIVE_ALLOWED`/`LIVE_PRIORITY` per the new table — never callable with a `CACHE_ONLY` slug. Since `cacheOrLive<O extends ComputeOfferingSlug>`'s type parameter is already narrower than the full `OfferingSlug` union (only the 4 compute offerings satisfy it), the *type system* may already make this partially true — verify that, and add the runtime assertion anyway as defense-in-depth (the pattern this codebase already uses elsewhere per Invariant #27's fail-open guards — this is the inverse: fail closed against a class violation, not open against an outage).

## Task 3 — `networkMultiplier` resolution at the adapter boundary (Invariant #31)

Per §2.3: x402/Base = `1.00×`, ACP = `1.00×` (grandfathered, no repricing). Both are `1.00` right now, so this task is about landing the **resolution mechanism**, not changing any output number — build it so a future channel (E2's Kite, at `1.00×` also, or E3's Olas at `0.65×` CACHE_ONLY-only) is a config entry, not new code. Resolve at the adapter boundary (`adapters/x402-middleware`, `adapters/acp-adapter`), reading from the canonical table in Task 1 — adapters never hold a hardcoded price literal after this lands (that's the point of #31).

## Task 4 — Tests (the gate)

- Assert every `CACHE_ONLY` offering is structurally unreachable from `cacheOrLive()` — this is the first slice of G3 (§4), which isn't fully due until the E3 gate, but the assertion belongs here where the boundary is built, not deferred.
- Assert x402 request/response behavior is byte-identical pre/post this change for all 7 currently-priced slugs (no external surface change, per the phase's own constraint).
- Assert `networkMultiplier` resolves to `1.00` for both live channels today.
- Full suite green (`vitest run`).

## What this phase explicitly does not do

- Does not touch `docs/INVARIANTS.md`. Per that file's own closing note, invariants get appended "at their close, not mid-flight" — #30/#31 land in code+tests now; the formal ledger entry is Desktop's job at the Expansion's (or at minimum E1's) close, not this diff.
- Does not build the trust rung (`legitimacy_scan` $0.10 CACHE_ONLY, E1-C) or the cost ledger (E1-F) — both depend on this table existing but are separate tasks (`e1-c`, `e1-f` in Bion).
- Does not reprice `quick_protocol_facts` or anything else against the §2.5 recommendations — those apply at the channel/phase where they're actually relevant (E5, E6), not here.

## Deliver

One diff against `expansion-e1-a-computeclass`, reviewed as a diff (`gh pr diff`), plus the two flagged gaps (unpriced offerings) called out explicitly in the PR description for Desktop to resolve before merge. Merge itself is Forces-gated, unchanged.
