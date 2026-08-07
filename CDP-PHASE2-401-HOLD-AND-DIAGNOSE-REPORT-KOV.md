# CDP Facilitator — 401 Diagnosis + Margin Report — Delivery Report

**From:** Kov · **To:** Desktop / Forces · 2026-08-03
**Refs:** `CDP-PHASE2-401-HOLD-AND-DIAGNOSE-KOV-directive.md`.

## 1. Value-integrity check: local `.env` vs VPS `/etc/grey/grey-core.env` — MATCH

Compared both `CDP_API_KEY_ID` and `CDP_API_KEY_SECRET` via byte-length + SHA-256 digest, computed independently on each side, values never printed:

| Var | Local length | VPS length | Local SHA-256 | VPS SHA-256 |
|---|---|---|---|---|
| `CDP_API_KEY_ID` | 36 | 36 | match | match |
| `CDP_API_KEY_SECRET` | 88 | 88 | match | match |

Both values are byte-identical on both sides. **This rules out the transfer/sync bug theory** — the piped `printf \| ssh ... sudo tee -a` transfer from the Phase 1 deploy did not corrupt or truncate either value. The 401 is not a value-integrity problem; per the directive, this points back to a Portal-side cause (the two checks flagged for Forces in the prior directive: IP allowlist, and Secret vs Client API Key type).

## 2. Margin report — live production

`pnpm -F @grey/core margin-report`, real `GREY_DATABASE_URL` (production Supabase). Default 30-day window showed nothing at all, so I widened it — full picture, last 365 days:

```
GREY MARGIN REPORT — last 365d (since 2025-08-03T02:21:47.525Z)
────────────────────────────────────────────────────────────
verify_full_tech         revenue=$   0.0000 cost=$   0.3187 margin=$-0.3187  [no revenue yet]
verify_whitepaper        revenue=$   0.0000 cost=$   0.0210 margin=$-0.0210  [no revenue yet]
────────────────────────────────────────────────────────────
TOTAL  revenue=$0.0000  cost=$0.3397  margin=$-0.3397
```

**Where realized margin actually stands on the 4 `LIVE_ALLOWED` offerings** (`legitimacy_scan`, `verify_whitepaper`, `verify_full_tech`, `claim_extraction`):

- **`verify_full_tech`**: real live-compute cost recorded ($0.3187), **zero revenue ever** — margin is negative.
- **`verify_whitepaper`**: same pattern, smaller cost ($0.0210), **zero revenue ever** — margin is negative.
- **`legitimacy_scan`** and **`claim_extraction`**: **no rows at all** in the last year — never triggered a live-compute run (cache miss) or a payment, on any channel.
- **Every offering, across the entire year of ledger history: zero revenue events.** No payment has ever actually settled through either the x402 route or MCP on production — the cost rows here are from live-pipeline exercising (development/testing), not real buyer traffic.

**Bottom line for the E1→E2 gate's "positive realized margin" leg:** not just unmet — there is no revenue signal to even compute a realized margin from yet. This is a demand/traffic gap, not a pricing or cost problem (the small costs recorded are consistent with the canonical prices already in place). Worth Forces knowing this plainly rather than reading it into a bare "$0.00 margin" figure.

(Minor, not acted on: the script itself doesn't exit cleanly after printing — its DB pool is left open — I worked around it with a hard timeout rather than fixing the script, since that wasn't in scope here.)

## Status

CDP Phase 2 stays on hold per the prior directive — Task 3 blocked, not a Kov-side fix. Nothing further for me to do until Forces checks the CDP Portal (IP allowlist / key type) or the margin picture changes.
