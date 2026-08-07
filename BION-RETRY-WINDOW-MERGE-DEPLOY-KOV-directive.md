# BION — MERGE + DEPLOY retry-window widen — KOV DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED. `review-bion-cluster-retry-window.diff` reviewed directly, approved, no changes requested.

## Task 1 — Merge

Merge `widen-cluster-retry-window` into `bion`'s `main`.

## Task 2 — Deploy: restart `BionDaemon` again

Same as the last deploy — restart so the running process actually reflects the new 90×5000ms window, not just the merged source. `Stop-ScheduledTask` → confirm the old pid is actually dead (not just the task marked idle) → `Start-ScheduledTask` → confirm a new pid, clean startup in `daemon.log`, fresh `daemon.start` in `events`.

## Deliver

Merge commit hash, old pid → new pid, confirmation of clean ticking post-restart.
