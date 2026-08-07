# CDP Phase 2 — Push for Review — Delivery Report

**From:** Kov · **To:** Desktop / Forces · 2026-08-03
**Refs:** `CDP-PHASE2-TASK3-ACCEPTED-push-for-review-KOV-directive.md`.

## Pre-push confirmation: `POST /v2/x402/validate` against the real production URL

```
resource: https://api.whitepapergrey.com/v1/cdp/offerings/legitimacy_scan
```

- `endpoint_reachable`: **true** — CDP can reach `api.whitepapergrey.com` fine (the domain/server is live for other routes).
- `returns_402`: **false** — "Endpoint returned HTTP 404 instead of 402" (this specific route doesn't exist yet — branch not deployed).
- Every downstream check (`has_bazaar_extension`, `bazaar.info`, `bazaar.schema`, etc.) shows `"Skipped: endpoint did not return 402"` — cascading from that one required check.
- `valid: false`, `simulation.outcome: "rejected", rejectionReason: "endpoint failed preflight checks"`.

Confirms the hypothesis cleanly and cheaply, no deploy needed: `returns_402` is a **required** preflight check for indexing, and it's currently failing purely because the route isn't live — not a settlement, wire-shape, or code problem. This fully explains why the discovery/merchant lookup showed nothing after the real Base Sepolia settlement in the last report.

## Pushed, PR opened, not merged

- Branch `cdp-facilitator-phase2` pushed.
- Full gate re-run before pushing: `turbo run build test typecheck lint` on `@grey/x402-middleware` + `@grey/core` + `@grey/acp-adapter`, forced/no-cache — **14/14 green**, unchanged from the last report.
- `review-cdp-phase2.diff` exported at the repo root (2435 lines, `main..cdp-facilitator-phase2`).
- **[PR #38](https://github.com/Mayakovsky/grey/pull/38)** — `cdp-facilitator-phase2` → `main`. Not merged — same standing rule as every PR before this one.

## Noted, not acted on

A few new files appeared on disk during this pass that weren't part of this directive (`MARGIN-LEDGER-ACP-GAP-CHECK-KOV-directive.md`, `MARGIN-LEDGER-CORRECTION-skip-task1-KOV.md`, `CDP-PORTAL-CREDENTIAL-FIX-RUNBOOK-FORCES(-v2).md`, `CDP-CREDENTIAL-FIX-KOV-part-v2.md`). Left untouched, per the standing one-directive-at-a-time discipline — flagging their presence in case that's not intentional, not opening them unless told to.

## Remaining plan, unchanged from the prior report

1. This PR gets reviewed; merge is Forces' call once the diff's been read.
2. Deploy to production, same process as Phase 1.
3. Re-run the discovery check (`/discovery/merchant?payTo=...` and/or `/validate`) against the real, now-live URL — that's when Bazaar indexing can actually be confirmed, closing that leg of the E1→E2 gate for real.
