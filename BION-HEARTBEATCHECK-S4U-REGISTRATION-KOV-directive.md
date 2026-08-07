# BionHeartbeatCheck — S4U task registration script — KOV DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED. Continuation of `BION-HEARTBEAT-ALERTING-KOV-directive.md` Task 1/2 — this is the registration blocker you correctly flagged rather than silently downgrading to `Interactive`.

**Decision: S4U, not `AtLogOn`.** You're right that `AtLogOn` shares `BionDaemon`'s exact session-teardown vulnerability — a checker that dies the same way the thing it's checking dies is worthless at the one moment it matters. S4U is the real answer, and Forces's account already has "Log on as a batch job" by default (Administrators), so there's no separate rights-grant step needed — just the elevated registration call your sandboxed session can't make.

## Task 1 — Write the exact registration script, don't make Forces improvise one

Base it on whatever pattern `install-daemon.ps1` already used for `BionDaemon`'s own one-time elevated handoff — same structure, adapted:

- Task name: `BionHeartbeatCheck`.
- **Principal: S4U / `ServiceAccount` logon type**, run as `kidco` — registered this way from creation, not fixed up after like `BionDaemon` needed.
- **Trigger:** this is a periodic checker, not a long-running daemon — use a repeating schedule (Task Scheduler's "repeat every N minutes, indefinitely/for 1 day, repeating") rather than a one-shot `AtStartup`. Size the interval off the real tick data from your own liveness report — you already know the actual tick cadence and chose a staleness threshold with real margin; pick a check interval that's sane against that, not an arbitrary round number.
- **Action:** whatever actually runs the heartbeat-staleness check + ntfy call from the original directive.
- Highest privileges where needed for the check itself to read `heartbeat.json` and reach the network for the ntfy call.

Write this as a single, complete, copy-paste-ready script (`.ps1`), not a fragment Forces has to assemble by hand. Confirm it's syntactically valid yourself (dry-read it, don't just hand over something untested-by-eye) before handing it off.

## Task 2 — Hand off clearly, then stop

Tell Forces exactly what elevated context to run it in (elevated PowerShell, right-click → Run as Administrator — be explicit, don't assume they know which "elevated" you mean). State the file's full path. Then stop — don't attempt registration again yourself.

## Deliver

The script's path, and confirmation it's ready for Forces to run. Resume Task 2 of the original alerting directive (prove it actually fires against a deliberate outage) only after Forces confirms the registration itself succeeded — don't assume it worked.
