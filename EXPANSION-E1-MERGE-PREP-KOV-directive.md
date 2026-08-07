# EXPANSION E1 — MERGE PREP — KOV BUILD DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-07-30).
**Ruling (Forces, this session):** `daily_greenlight_list` and `scam_alert_feed` are not priced gaps to fill — they're **not being offered yet, period**, until there's enough usage data, which needs daily customers first. Toggle-on is a later, separate decision. Don't invent a price; mark them not-yet-offered.

## Task 1 — Canonical table
In the `@grey/schemas/pricing` table from E1-A, give both an explicit not-yet-offered status (e.g. `enabled: false`, no price) rather than a blank/TODO price field. Table should read as 7 priced + 2 disabled = 9, matching the full handler count.

## Task 2 — Verify they're actually invisible, not just unpriced
Both must be absent from every live-facing surface while disabled:
- `GET /v1/discovery/services` (+ `/:slug`)
- the `extra.bazaar` block embedded in every 402 response
- the MCP tool surface (`POST /v1/mcp`)

Check each explicitly — don't assume "no price" already implies "not listed." If any of the three currently enumerates all 9 handlers regardless of price, fix it so these two are filtered out same as the trust-rung pattern (structurally absent, not just missing a field).

Also check ACP: if either offering is already registered there from before this Expansion, report it — don't silently change ACP behavior, that's outside this round's scope, but Forces needs to know if these two are already live somewhere.

## Task 3 — Prep the merge
Rebase `expansion-e1-round2` (and `expansion-e1-a-computeclass` under it) into a clean, mergeable state against current `main`. Full monorepo build/test/typecheck/lint green. Open the PR(s) against `main`.

**Prep, not merge.** Push/merge stays Forces-gated as always — get it reviewable and report back; don't push or merge it yourself.

## Deliver
PR link(s) + confirmation that Task 2's three-surface check (plus the ACP check) passed, in the usual status-ping format.
