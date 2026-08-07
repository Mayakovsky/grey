# CDP BAZAAR — POST-SETTLEMENT VERIFICATION ROUND — KOV DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces.
**No new money, no new wallet.** Three independent, low-cost checks. Do all three, one report.
This gates the next step (a possible GitHub reply) — nothing there happens until this is back.

---

## Context, brief (skip if you're the same instance that ran settlement #5)

Grey (`api.whitepapergrey.com`, `packages/grey-core`, VPS `44.243.254.19` user `ubuntu`, systemd
`grey-core` on `127.0.0.1:3002`) just completed its cleanest real production settlement yet
(`CDP-BAZAAR-ORGANIC-SETTLEMENT-AND-CRAWLER-CHECK-REPORT-KOV.md`) as part of an ongoing
investigation into why Grey never appears in CDP's x402 Bazaar catalogue despite clean settlements.
The three tasks below are follow-up verification, not new investigation ground.

---

## Task 1 — `EXTENSION-RESPONSES` header check on settlement #5

Desktop found `x402-foundation/x402#2112` — an unrelated seller with Grey's exact symptom (correct
Bazaar setup, real settlements, never indexed), where the `EXTENSION-RESPONSES` header CDP's docs
describe as the facilitator's cataloguing-status signal was **never emitted at all**, confirmed via
raw response interception. Worth checking whether Grey's facilitator interaction shows the same gap.

For settlement #5 (`legitimacy_scan`,
tx `0x75e8bff253180b378a306780f9d54070ddf7dd6d77606f263094542ca2b84082`):

1. If you still have the raw captured response from either the `/verify` or `/settle` call to
   `api.cdp.coinbase.com/platform/v2/x402/...` — check the **full header set**, not just the ones
   already decoded (`PAYMENT-REQUIRED`/`PAYMENT-SIGNATURE`/`PAYMENT-RESPONSE`). Look specifically
   for `EXTENSION-RESPONSES` in any casing, and `access-control-expose-headers` (rtkmotion found
   this empty, which hides the header from browser-origin clients even if present).
2. If the raw response wasn't captured and is gone, say so plainly. In that case: could a fresh
   dry-run `/verify` call (no real payment, just inspecting headers on the challenge exchange)
   answer this without spending anything further? If yes, don't run it yet — just report that it's
   possible, Desktop/Forces will decide if it's worth it.
3. Report the raw header list verbatim either way.

## Task 2 — independently confirm the RLS migration actually applied cleanly

Forces applied `supabase/migrations/20260806224500_grey_two_enable_rls.sql` himself via his own
owner-cred psql session. **Desktop never received his Steps 1–4 output, so this is not yet
confirmed from any independent source — don't assume it's clean, verify it directly.**

Using whatever DB access you already have (the `grey_pipeline_rw` role, same one you used to query
`revenue_events` in the settlement report):

1. `select relname, relrowsecurity from pg_class where relnamespace = 'grey_two'::regnamespace and relkind = 'r' order by relname;`
   — expect `relrowsecurity = t` on all 10 tables.
2. `select schemaname, tablename, policyname, roles from pg_policies where schemaname = 'grey_two' order by tablename;`
   — expect every `roles` array to contain only `grey_pipeline_rw`, never `anon`/`authenticated`/`public`.

If `grey_pipeline_rw` can't see `pg_policies` or `pg_class` for this schema for permission reasons,
report exactly what happened — don't work around it or guess at the answer. Report both queries'
raw output verbatim.

## Task 3 — smoke test: confirm nothing broke

1. `curl -s http://127.0.0.1:3002/health` — expect the normal healthy response.
2. Pick 2 of the 7 paid CDP offering routes
   (`packages/grey-core/src/server/routes/cdpOfferings.ts`) and send each an unpaid POST — expect
   the normal `402` with the usual challenge body. This is the real test: confirms the new RLS
   policies didn't inadvertently block anything `grey_pipeline_rw` actually does at runtime.
3. Anything different from baseline (errors, unexpected status codes, anything DB-related in the
   logs around now) — report plainly, don't guess at whether it's RLS-related or something else.

## Deliver

One report, all three tasks, concrete verbatim output throughout — query results, header dumps,
curl output. This is a verification round, not an investigation; keep it tight.
