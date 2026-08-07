# BION DAEMON LIVENESS — URGENT CHECK — KOV DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED, urgent — ahead of any other work in queue.

Bion's `events` table goes silent after 2026-08-02, and `daemon.start` itself hasn't logged since 2026-07-29 23:15. Three days of this session's real work (E2 close-out, MCP tooling, the CDP Bazaar investigation) produced zero Bion-tracked activity. Before anything else: **is the daemon actually running right now?**

## Task 1 — Live status, right now
- Windows Task Scheduler: is the persistent logon-task daemon's scheduled task present, enabled, recent/successful last run?
- `bion status` CLI (or current equivalent) — run it, report raw output, not a paraphrase.
- Actual process check: is there a running node process for the daemon at this moment?

## Task 2 — If it's down, since when and why
- Task Scheduler's own history/event log for that task — any failure, the point it stopped triggering.
- The daemon's own logs (this project fixed a "daemon observability gap" previously — use whatever that produced) for a crash/unhandled rejection near 2026-07-29 23:15–2026-08-02.
- Windows Event Viewer/system logs for the same window if the daemon's own logs don't show a cause (update reboot, unexpected shutdown, etc.).

## Task 3 — Restart via the real mechanism, confirm it holds
- Bring it back up through the actual persistent-task path, not a one-off `node` invocation that dies on logout.
- Confirm a fresh `daemon.start` lands in `events`, then confirm at least one real shadow/dispatch event fires under real conditions before calling this closed.

## Why this outranks a normal bug

Bion is being evaluated for cutover to live dispatch. A daemon that silently stops for three days with nobody noticing is disqualifying on its own, independent of whatever shadow-mode accuracy turns out to look like — an autonomous system going dark mid-workflow undetected is the actual risk, not a monitoring nicety.

## Deliver

Live status, root cause if findable (say plainly if not), confirmation it's back up with fresh events. Flag explicitly whether standing alerting (something that notifies if `daemon.start` doesn't recur within an expected window) should be a cutover precondition rather than a nice-to-have — that's a real recommendation to make, not just a status report.
