# CDP / BAZAAR ALIGNMENT — PHASE 1 (deploy, validation-order fix, wire-format reprojection)

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-02).
**Refs:** `CDP-BAZAAR-COMPATIBILITY-AUDIT-REPORT-KOV.md` (the three blockers this phase addresses #1 and #2 of, plus the deploy gap the report surfaced).
**Ruling on posture (Forces, this session):** build-and-own applies to Grey's own core (DB, hosting, relayer) — it does NOT mean avoiding third-party rails when the entire point is connecting to them. CDP Facilitator adoption is now a "when/how," not an "if" — Task 3 of this phase is prep for that; the actual settle/verify routing is Phase 2, gated on Forces obtaining CDP API keys.

## Task 1 — Deploy current `main` to production (most urgent, do this first)

The VPS is on `a4bdab1` (pre-Expansion, PR #33/M6 FDQ-73); `main` is at `c7b8376`, 12 commits ahead. Nothing from E1-A, Round 2, or merge-prep is live. Standard deploy per however this project's existing deploy runbook works (systemd restart of `grey-core.service` on `44.243.254.19` per the audit report's SSH findings) — pull `main`, rebuild, restart, confirm the service comes back up clean. Post-deploy, re-run a live curl against `/v1/offerings/legitimacy_scan` with a schema-valid body and confirm `extra.bazaar` is now present in the 402 body (the audit report's "ground truth curl" showed it absent — this is the check that it's no longer absent). Also confirm `GET /v1/discovery/services` now responds (it didn't exist on the deployed build at all).

## Task 2 — Fix the validation-ordering bug (independent of CDP, worth doing regardless)

`packages/grey-core/src/server/routes/offerings.ts` currently runs Fastify's body-schema validation before the `x402PreHandler` hook, so a request without a schema-valid body 400s before ever reaching the point where a 402-with-metadata would be returned. This defeats any discovery crawler that doesn't already know the input shape — which is the exact scenario a real evaluating agent (or CDP's own validator) hits.

Fix: reorder so the x402 payment gate runs first, and body-schema validation happens only after payment is confirmed (or make the route tolerant of a missing/empty body specifically for the purpose of returning the 402 challenge — whichever is the more correct Fastify pattern here; use your judgment on the cleanest fix, this is a routing/lifecycle question, not a business-logic one). Add the test that was missing: an empty-body / malformed-body probe against a paid route, asserting it still gets a `402` with the Bazaar metadata attached, not a `400`. Cover all 7 currently-priced offerings, not just one, since this is exactly the gap `x402-routes.test.ts` had.

## Task 3 — Reproject to CDP's actual wire shape

Per CDP's docs, the canonical field is a top-level `extensions.bazaar` object (`{bazaar: {info: {input, output}, schema: {...}}}`), not Grey's current `accepts[0].extra.bazaar` with its own internal shape. Add the `extensions.bazaar` projection alongside (not necessarily replacing) what Round 2 already built — `EvaluationKitEntry` already has everything needed (`inputSchema`/`outputSchema`/`description`), this is a reshaping/mapping task in `challenge.ts`, not new data. Keep the existing `extra.bazaar` field too for now (other consumers may read it) unless you find a reason it should go — flag if so, don't remove it unilaterally.

## What this phase does NOT do

Does not touch `verify.ts`/`settle.ts`/`clients.ts` — no CDP Facilitator routing yet. That's Phase 2, blocked on Forces obtaining CDP API keys from `portal.cdp.coinbase.com`. Don't start that piece until told the keys exist.

## Deliver

Diff + deploy confirmation (the live curl re-check from Task 1), test coverage for Task 2, and the `extensions.bazaar` addition from Task 3. Standard review-diff convention if there's a PR; direct report if this stays a hotfix-style change — your call given how contained it is, flag which you're doing.
