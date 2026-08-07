# Bion Heartbeat-Staleness Alerting — Delivery Report

**From:** Kov · **To:** Desktop / Forces · 2026-08-06
**Refs:** `BION-HEARTBEAT-ALERTING-KOV-directive.md`, `BION-HEARTBEATCHECK-S4U-REGISTRATION-KOV-directive.md`

## Bottom line

Built, registered (by Forces, elevated, S4U), and proven against a real deliberate outage — both the stale alert and the recovery alert fired correctly, with independently-verified ntfy delivery, not just clean-exit code.

---

## Task 1 — What was built

Kept it to a liveness probe, not a new subsystem, per the directive:

- **`src/cli/checkHeartbeat.ts`** — the check itself. Reads `heartbeat.json` via the daemon's own existing `isDaemonAlive()`/`readHeartbeat()` (`src/daemon/heartbeat.ts`) — no new staleness logic invented, reused what was already there. No DB dependency at all (deliberate: the daemon being dead can't be allowed to also break the thing detecting it's dead). Fires via the existing `notifyForces()` (`src/notify/ntfy.ts`), the same ntfy plumbing `daemon.start` already uses. Edge-triggered: a tiny state file (`.bion/daemon/heartbeat-alert-state.json`, `{alerted: boolean, since?}`) means it alerts once on the healthy→stale transition and once on stale→healthy, staying silent every other check — a six-hour outage produces one alert, not one every poll.
- **`scripts/check-heartbeat.ps1`** — Task Scheduler wrapper, TEEs output to `.bion/daemon/heartbeat-check.log` (same pattern as `run-daemon.ps1`, since Task Scheduler discards stdout/stderr otherwise).
- **`scripts/install-heartbeat-check.ps1`** — the one-time elevated registration script (my sandboxed session can't call `Register-ScheduledTask` at all — same limitation `install-daemon.ps1` already documents for `BionDaemon`). Syntax-verified via `[System.Management.Automation.Language.Parser]::ParseFile` before handoff (0 errors), not just eyeballed.
- **`BionHeartbeatCheck`** — registered by Forces, elevated, confirmed: `LogonType: S4U`, `UserId: kidco`, repeats every 1 minute, `LastTaskResult: 0`. S4U specifically (not `AtLogOn`) so this checker doesn't share `BionDaemon`'s session-teardown vulnerability — a checker that dies the same way the thing it's checking dies is worthless at the one moment it matters.
- `package.json`: added `"check-heartbeat": "tsx src/cli/checkHeartbeat.ts"`, matching the existing `status`/`cost`/`task` CLI convention.

## Task 2 — Deliberate-outage test: full round trip, confirmed both directions

**Stale-alert half:**

1. Killed `BionDaemon` (pid 26112, healthy, tick 449 — it had actually been running continuously since the previous liveness fix, ~5.6 hours uptime) at **2026-08-06T17:01:41Z**, deliberately, to test the checker.
2. Did **not** invoke the check manually — let the standing S4U trigger catch it on its own. `heartbeat-check.log`, real unattended runs:
   ```
   [check-heartbeat] quiet-healthy (age=20s)    13:00:13 -04:00
   [check-heartbeat] quiet-healthy (age=34s)    13:01:13 -04:00
   [check-heartbeat] quiet-healthy (age=94s)    13:02:13 -04:00   <- still under 120s threshold
   [check-heartbeat] alerted-stale (age=154s)   13:03:13 -04:00   <- crossed threshold, alert fires
   [check-heartbeat] quiet-stale (age=214s)     13:04:13 -04:00   <- correctly silent (already alerted)
   [check-heartbeat] quiet-stale (age=274s)     13:05:13 -04:00
   ```
3. `.bion/daemon/heartbeat-alert-state.json` → `{"alerted": true, "since": "2026-08-06T17:03:13.465Z"}`.
4. **Independently verified via a direct ntfy poll** (not trusting the code's own "it didn't error"):
   ```json
   {"title":"Bion daemon DOWN","message":"heartbeat stale (154s, threshold 120s). Check now — ...",
    "priority":5,"tags":["bion","daemon","warning","rotating_light"]}
   ```
   Real delivery, correct title/message/priority/tags.

**Recovery half:**

5. Restarted `BionDaemon` at **2026-08-06T17:06:24Z** (fresh pid `11284`, tick 1).
6. Again let the standing checker catch it unattended:
   ```
   [check-heartbeat] quiet-stale (age=334s)        13:06:13 -04:00   <- checked just before restart landed
   [check-heartbeat] alerted-recovered (age=4s)    13:07:13 -04:00   <- caught the fresh heartbeat, fires
   [check-heartbeat] quiet-healthy (age=18s)       13:08:13 -04:00   <- correctly silent (already recovered)
   [check-heartbeat] quiet-healthy (age=33s)       13:09:13 -04:00
   ```
7. `.bion/daemon/heartbeat-alert-state.json` → back to `{"alerted": false}`.
8. Ntfy poll, in order, confirms three real deliveries — the stale alert above, then the daemon's own pre-existing `daemon.start` ping (unrelated infrastructure, useful corroboration), then:
   ```json
   {"title":"Bion daemon recovered","message":"heartbeat fresh again (pid 11284, tick 2). Was down ~4 min.",
    "priority":3,"tags":["bion","daemon","white_check_mark"]}
   ```
   "~4 min" is accurate — alert fired 17:03:13Z, recovery detected 17:07:13Z.

**Detection latency observed:** ~91s from actual heartbeat staleness onset (last real tick ~17:00:39Z... conservatively from the 17:01:41Z kill) to alert (17:03:13Z) — within the expected bound (120s threshold + up to 60s check interval ≈ 180s worst case).

No manual invocation anywhere in this test — every log line above is the standing S4U task firing on its own schedule.

**Third, independent confirmation — a human actually received these on the actual device, not just server-side delivery.** Forces confirmed real phone notifications landed for all three:

| Notification | Forces's phone (local) | `heartbeat-check.log` / ntfy poll (UTC) | Match |
|---|---|---|---|
| Bion daemon DOWN | 1:03pm | `alerted-stale` 13:03:13 -04:00 / ntfy `time: 1786035793` (17:03:13Z) | exact |
| Bion daemon started | 1:06pm | ntfy `time: 1786035983` (17:06:23Z) | exact |
| Bion daemon recovered | 1:07pm | `alerted-recovered` 13:07:13 -04:00 / ntfy `time: 1786036033` (17:07:13Z) | exact |

All three independent verification layers agree byte-for-byte on timing: the daemon-side log, the server-side ntfy poll, and the human's own phone. This isn't just "the code ran without erroring" or "the API accepted the POST" — it's confirmed end-to-end, device-in-hand, exactly as it would fire during a real unattended outage.

## Task 3 — Threshold and escalation path, documented explicitly

- **Channel:** ntfy topic `bion-413943f962ec6c8fc3156ecf1ddbf92b` (`BION_NTFY_URL` in `.env.local`) — Forces's phone, the same channel `daemon.start`/`daemon.recovered`-style pings already use. No new channel stood up, per the directive.
- **Stale alert — priority 5 (max), tags `warning`/`rotating_light` — go look now.** This means the daemon is confirmed down; treat it the same urgency as the original liveness incident, not a "check when convenient" item.
- **Recovery alert — priority 3, tag `white_check_mark` — FYI only, no action needed.** Confirms the outage is over and reports how long it lasted; nothing to do in response beyond noting it if a root cause is still worth chasing down.
- **Staleness threshold: 120s.** Not a new number — reused `isDaemonAlive()`'s existing default in `src/daemon/heartbeat.ts` (already ~2.7× the daemon's 45s tick interval, already what `bion status` calls "down"). Keeps "stale" meaning the same thing everywhere in the codebase.
- **Check interval: 60s.** Reasoned directly off the 45s tick / 120s threshold, not a round number picked arbitrarily: checking every 60s bounds worst-case detection latency at roughly threshold + one interval (~180s) without polling far more often than a 45s-cadence heartbeat needs. Documented inline in `install-heartbeat-check.ps1`'s own comments so the reasoning travels with the code.

## Deliver

- Check running: confirmed (`BionHeartbeatCheck`, S4U, every 1 min, `LastTaskResult: 0`).
- Deliberate-outage test: **both halves confirmed**, real ntfy payloads captured above, not inferred.
- Alert destination/escalation: documented above — Forces's phone via the existing ntfy topic, priority 5 = go now, priority 3 = FYI.
