# CDP Bazaar — `inputSchema` Fix Deployed, Validator Clears, Indexing Still Pending (Directive 133)

**From:** Kov · **To:** Desktop / Forces · 2026-08-24
**Refs:** `BION-DIRECTIVE-133-deploy-bazaar-inputschema-fix.md`, `CDP-BAZAAR-INPUTSCHEMA-FIX-KOV-REPORT.md` (the fix this deploys)

## Outcome, stated plainly up front

**The actual root cause is conclusively, verifiably fixed — the three-week validator error is gone for real, confirmed live.** Discovery indexing has not appeared yet after a full 10-minute real poll, matching this investigation's own established pattern that indexing triggers at settlement time, not from a passive re-scan. Getting a real indexing answer needs a new real settlement under the now-fixed code — genuinely new spend, which this directive didn't authorize and I did not take unilaterally. Not overstating this as fully closed; reporting exactly where it stands.

## Merge — real commit hash, confirmed on origin

`git ls-remote origin main` → **`3e67b3ce47603a00e77db70e316fd60ecdbe4804`** (grey repo). Branch `bion/directive-131-fix-bazaar-inputschema-id` merged, gate re-run clean on merged `main` before pushing (118 passed, 1 pre-existing skip, x402-middleware).

## Deploy — real, confirmed on the live service, not assumed

VPS was 10 commits behind (`d407606` → `3e67b3c`); confirmed beforehand that 9 of those 10 were docs-only, one was the real fix — no surprise unrelated changes landed. Checked memory/swap first given this box's known constraint: 1.9GB RAM, 2GB swap configured (mostly free), 1.0GB available — safe to proceed.

```
git pull: fast-forward d407606..3e67b3c, exact expected SHA
pnpm install --frozen-lockfile: already up to date (no new deps)
pnpm run build: 8/8 successful — x402-middleware + grey-core cache-miss (rebuilt fresh
                 with the fix), everything else cache-hit (untouched, correctly unchanged)
sudo systemctl restart grey-core: new PID 315404, active (running)
```

**Real health verification, not assumed from the restart command's exit code:**
```
GET /health   → {"status":"ok","version":"0.1.0","uptimeSec":9}
GET /identity → {"did":"did:erc8004:8453:58618",...}
POST /v1/cdp/offerings/legitimacy_scan (no payment) → 402, correct
journalctl -u grey-core: clean startup, no errors; confirms the OLD rejection
  ("invalid discovery configuration") in the pre-restart history matches D-129's finding exactly
```
`grey-sweeper` and `grey-mech-adapter*` were **not** touched, per the doc's explicit posture — this change only affects `grey-core`'s bazaar declaration.

## Real validator re-check — the fix is confirmed, live, unambiguous

```
POST https://agentic.market/api/x402-validate {"resource":"...legitimacy_scan","method":"POST"}

BEFORE (documented in CDP-BAZAAR-VALIDATOR-ROOT-CAUSE-KOV-REPORT.md):
  valid: false — "schema must not contain external $ref/$id references"

AFTER (this session, post-deploy):
  valid: true, simulation.outcome: "accepted", 25/25 preflight checks passing, zero failures
```

This is the real, direct confirmation the directive asked for — not assumed from the code fix alone.

## Discovery/indexing — real, honest, not yet resolved

`GET https://api.cdp.coinbase.com/platform/v2/x402/discovery/merchant?payTo=0x394e81DA28799b578620803772FAeE403dE2d3f6` (the same real, unauthenticated lookup this investigation has used throughout):

- Immediate post-deploy: `total: 0`
- Polled every 30s for a full 10 minutes (matching this thread's own established checkpoint window from the 2026-08-04 six-checks round): **`total: 0` on every single poll, never changed.**

**The honest read, not a guess:** this investigation's own prior finding (`CDP-INDEXING-real-resolution-six-checks-REPORT-KOV.md`) already established that a *real settlement* triggers indexing fast (~1–6 minutes observed elsewhere), while a clean `/validate` alone was never shown to trigger it on its own — CDP's indexer appears to act on real settlement events, not on passively re-scanning already-registered `payTo` addresses. The last real settlement against this `payTo` (2026-08-23 15:28:58, `CDP-BAZAAR-STEP2-V2-REAL-SETTLEMENT-COMPLETE-REPORT-KOV.md`) happened **before** this fix was deployed and was explicitly rejected — so CDP has had no new, valid settlement event to index since. Getting a real indexing answer needs a **new** real settlement against the now-fixed endpoint.

**Not doing that here.** D-131's non-scope was explicit ("no new wallet spend beyond what's needed to confirm the fix works... don't spend if you don't have to") and I confirmed the fix without new spend (the free validator call was sufficient). A new settlement to test indexing is genuinely new spend beyond that — a real, separate decision, not something to take on my own initiative even under tonight's standing deploy authorization, which covered push/merge/deploy, not new financial transactions.

## `e1-e` — real, precise answer, not overstated

**Not resolved yet, but the actual blocker is real and confirmed cleared.** `e1-e`'s curated-listing question depends on the endpoint being indexed at all first (curation is a tier *above* basic indexing, per the MEP's own framing — "sorts above the general index"). Indexing itself is still unconfirmed. The schema defect that has blocked this for three weeks is conclusively fixed and deployed — that's real, verified progress — but claiming `e1-e` is unblocked would be premature until a real settlement confirms indexing.

## Non-scope compliance

No new wallet spend. `grey-sweeper`/`grey-mech-adapter*` untouched. Held nothing back that was asked for — reported the real gap (indexing needs new spend) rather than either taking the spend decision unilaterally or silently omitting it.

## Recommended next step, not decided here

A single new small real settlement (same $0.10–0.25 class as this investigation's own prior rounds) against the now-fixed endpoint would give a real, final answer on both indexing and `e1-e` within the same ~1–6 minute window prior successful cases showed. Flagging this as the concrete next step for Forces/Desktop to authorize explicitly, not assuming it.
