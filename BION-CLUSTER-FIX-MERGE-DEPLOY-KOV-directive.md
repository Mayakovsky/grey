# BION — MERGE + DEPLOY (cluster race fix + heartbeat check) + retry-window audit — KOV DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED. Diff (`review-bion-cluster-race-fix-and-heartbeat-check.diff`) reviewed directly, both commits approved, no changes requested to what's already there.

## Task 1 — Merge

Merge branch `fix-cluster-race-condition` into `bion`'s `main`. Both commits as-is:
1. `feat(daemon): heartbeat-staleness alerting + Postgres service registration scripts`
2. `fix(daemon): stop self-starting a bare Postgres process on connection loss`

## Task 2 — Deploy: restart `BionDaemon`

Not merge-only — `BionDaemon` is running the old, demonstrably-racy `cluster.ts` right now, on this exact machine, hours after that race was proven live. `Stop-ScheduledTask -TaskName BionDaemon` then `Start-ScheduledTask -TaskName BionDaemon`. Confirm the new heartbeat's `pid` changed and it's ticking clean post-restart — same standard as every other "prove it, don't just configure it" check this session.

## Task 3 — Retry-window audit: does `ensureClusterUp`'s wait still make sense now that it's waiting on the service, not itself?

`ensureClusterUp`'s `retries`/`backoffMs` defaults were presumably tuned when the function expected to actively start Postgres itself and just wait out a normal boot. It no longer self-starts — it now waits entirely on `postgresql-bion-5433`'s own Service Recovery timing, which Task 2 of the registration directive configured up to **300s** on repeated failures. Check, don't assume:

- What are the actual current `retries`/`backoffMs` defaults in `cluster.ts`, and what total wall-clock window do they add up to?
- Is that window comfortably longer than the service's worst-case Recovery delay (300s), or could the daemon still throw its own startup HALT while probing during a slow service recovery that would have succeeded given more time?
- If the window is too short: widen it to comfortably exceed 300s with margin (same "real margin, not a hair-trigger" reasoning already applied twice this session to `BionHeartbeatCheck` and the service's own Recovery backoff). If it's already sufficient, say so plainly with the actual numbers, don't just assert it's fine.

## Deliver

Merge commit hash (Task 1), confirmation of the daemon restart with the new pid/tick (Task 2), and the retry-window numbers plus whatever change (or none, with reasoning) Task 3 produces. Diff export not needed for Task 3 unless the numbers actually change — if they do, same review-before-anything-further convention as everything else.
