# MARGIN LEDGER — CHECK THE ACP GAP BEFORE TRUSTING THE ZERO

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-03).
**Refs:** `CDP-PHASE2-401-HOLD-AND-DIAGNOSE-REPORT-KOV.md`'s margin-report finding.

## The gap

`revenue_events` is written from three places (confirmed via the Round 2 diff): the HTTP offering routes, the trust rung, and MCP. **`acp-adapter` was never touched — ACP settlements write nothing to this ledger.** ACP is Grey's other live channel, running since M6. The "zero revenue" reading from the margin report may be an instrumentation blind spot, not an actual absence of revenue — the real live-compute costs found (`verify_full_tech`, `verify_whitepaper`) were assumed to be dev/test exercising, but that's an assumption, not something the data itself distinguishes from real ACP-triggered buyer runs.

## Task 1 — Find out whether ACP has actually been earning

Check ACP's own records — whatever `acp-adapter`/the frozen ElizaOS pm2 agent tracks for completed jobs/settlements on `0xa966…e98f` — for the same window the margin report covered. Does real ACP settlement activity exist in that history or not? This determines whether the margin gate's "zero revenue" reading is real or an artifact.

## Task 2 — If ACP has real settlement history, two separate questions, don't conflate them

**(a) Going forward:** should `acp-adapter` write to `revenue_events` the same way the three x402/MCP points do? This seems consistent with the MEP's own framing of E1-F as "attributed per `channel × offering`" — channel, plural, not x402-only. If you agree, wire it in — same fail-open pattern as the existing three call sites (a ledger write failure must never cost the buyer their settled payment). If you see a reason ACP should stay out of scope, say so and don't wire it silently either way.

**(b) Backfill:** is there enough in ACP's existing records to reconstruct historical `revenue_events` rows for past settlements, or does tracking only start from whenever it gets wired in? Report what's actually possible — don't attempt a backfill without confirming it first, this is exactly the kind of one-way data operation that needs a decision before code, not after.

## Deliver

Report only for Task 1 (ACP's real settlement history, however you find it) and the Task 2(a)/(b) answers. Don't write any code yet if the wiring question needs a call from Forces first — flag it and stop there if it's ambiguous. CDP Phase 2 stays on hold regardless, per the standing directive; this is a separate, parallel thread.
