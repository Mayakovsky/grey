# Bion — Merge + Deploy (cluster race fix) + Retry-Window Audit — Delivery Report

**From:** Kov · **To:** Desktop / Forces · 2026-08-06
**Refs:** `BION-CLUSTER-FIX-MERGE-DEPLOY-KOV-directive.md`

## Task 1 — Merged

Pushed `fix-cluster-race-condition`, opened PR, merged both commits as-reviewed, no changes.

- **PR:** `Mayakovsky/bion#3`
- **Merge commit:** `4ac5c2e9ef7a5cf1a9370560b8b9b7f9b407b2f0`
- Local `main` fast-forwarded to it; branch deleted.

## Task 2 — Deployed and proven

`BionDaemon` was running the old, racy `cluster.ts` live on this machine — restarted it to actually pick up the fix, same "prove it, don't just configure it" standard as everything else this session:

- Before: `pid 29044`, tick 43.
- `Stop-ScheduledTask` → confirmed the old process actually dead (`Get-Process -Id 29044` → not found), not just the task marked idle.
- `Start-ScheduledTask` → after: **`pid 16676`** (different pid, confirmed fresh), ticking clean — tick 1 → tick 2 confirmed.
- `daemon.log`: clean startup (`module loaded` → `runDaemon entered` → `reclaimed a stale pidfile`), **no** `"brought up the :5433 cluster"` line — correctly means the probe succeeded immediately against the already-running service, exactly the no-self-start behavior the fix is for. No HALT, no errors.
- Fresh `daemon.start` event confirmed in `events`: `2026-08-06 16:39:17 | daemon.start | {"pid": 16676, ...}`.

## Task 3 — Retry-window audit: checked, was wrong, fixed and staged for review

**Actual current numbers, not assumed:** `retries ?? 12`, `backoffMs ?? 500` → **12 × 500ms = 6 seconds total.**

**Compared against the service's actual worst-case Recovery delay:** `install-postgres-service.ps1`'s `sc.exe failure` config is 60s / 120s / 300s (1st / 2nd / 3rd+ failure). Worst single-tier wait: **300 seconds.**

**6s vs. 300s — the window was drastically too short**, not fine as-is. The daemon would give up (HALT on startup, or abandon its tick-error check) roughly **50x before** a slow, 3rd-failure-tier service recovery could ever complete. This is a real gap, not a theoretical one — it means a genuinely-recovering service (doing exactly what it's supposed to) could still leave `BionDaemon` HALTed at startup if the timing landed wrong.

**Fixed:** new default **90 × 5000ms = 450 seconds (7.5 min)** — clears the 300s worst case with **150s (50%) of real margin**, same reasoning already applied twice this session (`BionHeartbeatCheck`'s threshold, the service's own Recovery backoff). Reasoning written directly into the code comment, not just this report, so it doesn't need re-deriving next time someone touches it.

**Verified safe before committing, not assumed:** grepped every `ensureClusterUp(` call in `test/cluster.test.ts` — all five that actually reach the retry loop pass an explicit `backoffMs` override (mostly `1`); the one that doesn't short-circuits on an immediate-true probe before the loop is ever reached. Ran the full suite after the change anyway: `tsc --noEmit` clean, **123/123 tests passing, 13.4s total** — confirms nothing accidentally hit the new real-time defaults.

**Status: NOT merged, per the directive's own instruction** ("diff export not needed unless the numbers actually change — if they do, same review-before-anything-further convention"). They changed, so:

- Branch: `widen-cluster-retry-window` (based on the now-merged `main`), local only, not pushed.
- Diff exported: `C:\Users\kidco\dev\grey\review-bion-cluster-retry-window.diff` (10 insertions, 2 deletions — small, focused).
- `main` confirmed clean and untouched by this part.

## Deliver

- Task 1: PR `#3`, merge commit `4ac5c2e9ef7a5cf1a9370560b8b9b7f9b407b2f0`.
- Task 2: restart confirmed — `pid 29044` → `pid 16676`, ticking clean, fresh `daemon.start` recorded, no HALT/errors.
- Task 3: old window was **6s vs. a 300s worst case** — genuinely insufficient, not fine as-is. Widened to **450s** (450s clears 300s by 150s/50%). Change is written, tested, committed, and diff-exported for review at `review-bion-cluster-retry-window.diff` — awaiting authorization before merge, same as every other change this session.
