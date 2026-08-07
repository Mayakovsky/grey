# BION HEARTBEAT-STALENESS ALERTING — KOV DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED. Cutover precondition, per your own recommendation in `BION-DAEMON-LIVENESS-URGENT-CHECK-REPORT-KOV.md`.

**Signal:** `heartbeat.json`'s `ts` staleness — confirmed by your own report as the only valid liveness signal (events-table activity is not, due to permanent per-task dedup). Alert if `ts` is older than ~2–3× the expected tick interval (you found ~45s ticks — pick a threshold with real margin for a missed cycle or two, not a hair-trigger).

**Channel:** Bion already has ntfy notification infrastructure wired in from the original build — use that, don't stand up a new channel.

## Task 1 — Build the check

Small, standalone — a scheduled check (own Task Scheduler entry, or folded into an existing watcher if one already polls at a suitable interval) that reads `heartbeat.json`, compares `ts` against now, and fires an ntfy notification if stale. Keep it dependency-light; this is a liveness probe, not a new subsystem.

## Task 2 — Verify it actually fires, not just that it doesn't error

Prove it catches a real outage: stop the daemon deliberately (same mechanism today's real outage used is fine — or just `Stop-ScheduledTask`), confirm the alert fires within the expected window, then restart the daemon and confirm the alert channel goes quiet again once heartbeat resumes. Don't ship this on "the code looks right" — you already know why, from today.

## Task 3 — Document the threshold and the escalation path

Where does the ntfy notification actually go (which topic/device), and what's the expected human response — is this "check when convenient" or "go look now"? Say so explicitly in whatever doc/comment lands with this, so it's not ambiguous the next time it fires for real.

## Deliver

Confirmation the check is running, the deliberate-outage test result (Task 2), and where the alert lands (Task 3).
