# Bion Daemon Liveness — Urgent Check — Delivery Report

**From:** Kov · **To:** Desktop / Forces · 2026-08-05
**Refs:** `BION-DAEMON-LIVENESS-URGENT-CHECK-KOV-directive.md`

## Bottom line

**It was down. Root cause found and confirmed against real evidence, not guessed. It's back up and currently holding.** But the underlying fragility (below) is not fixed — only worked around by a manual restart — and I'm recommending against calling this cutover-safe until the actual config fix lands.

---

## Task 1 — Live status: was down, confirmed three independent ways

- **Task Scheduler:** task `BionDaemon` present, enabled, `State: Ready` (i.e., not running). `LastRunTime: 8/5/2026 10:16:43 AM`, `LastTaskResult: 3221225786` (`0xC000013A` = `STATUS_CONTROL_C_EXIT` — the code a console process gets when its session/console is torn down out from under it, not a normal crash code).
- **`bion status` CLI, raw output:**
  ```
  BION STATUS
  ───────────
  daemon:    down (pid 18000, tick 5795, 2026-08-04T21:25:47.279Z)
  modes:     reactive=shadow  auto=shadow
  outbox:    pending=0 sending=0 done=2138
  tasks:     total=96 ratified-backlog=2 dispatchable=2
             by-status backlog:82 done:8 ready:5 blocked:1
  reactive:  shadow=39 dispatch=78 halt=74
  usage:     unknown (no .bion/usage.json)
  ```
- **Process check:** no `node.exe` process anywhere on the machine running the daemon (`pid 18000` from `bion status` confirmed dead via `Get-Process -Id 18000`; the only live `node.exe` processes belonged to unrelated Claude filesystem-extension tooling).

## Task 2 — Since when, and why: a session-teardown pattern, not a code bug

**Correct the directive's own framing first, with evidence:** "`daemon.start` hasn't logged since 2026-07-29 23:15" is true but misleading taken alone — `daemon.start` is a start-time-only event, and `heartbeat.json` proves that same process (pid 18000, started 2026-07-29 23:15:51) ran continuously and correctly for **five more days**, ticking all the way to **tick 5795 at 2026-08-04T21:25:47Z (17:25:47 EDT)**. *That* is the real time of death — roughly **27 hours** before this check, not three-plus days.

**Separately, and worth flagging on its own:** the Bion `events` table going silent after 2026-08-02 is *not* itself evidence of daemon death. `auto.shadow`/`auto.dispatch`/`reactive.*` events are deduplicated permanently per task-id (or per commit-sha/run-id) — once a dispatchable task has been shadow-logged once, it never logs again unless something genuinely new appears. A perfectly healthy daemon with a stable task backlog and no new git activity can go days without writing a single new event. **Events-table silence is not a liveness signal; it never was.** This matters for the standing-alerting recommendation below.

**Root cause, confirmed against Windows event logs, not inferred:**

The scheduled task's Principal:
```
LogonType   : Interactive
UserId      : kidco
```
"Interactive" ties the task's process lifetime to the desktop session. Checked both recent failure points directly:

- **2026-08-04, first restart attempt died instantly:** System log shows a Winlogon **logoff** (`Id 7002`) at **17:26:14 EDT** — about 90 seconds after the last heartbeat tick (17:25:47) — followed by a Winlogon **logon** (`Id 7001`) at **17:30:00 EDT**, which is exactly when Task Scheduler's LogonTrigger re-fired (`daemon.log`: `=== run-daemon.ps1 launch 2026-08-04T17:30:06 ===`, with **zero** subsequent daemon output before it died again).
- **2026-08-05, this morning's restart attempt died instantly:** System log shows a **full cold-boot sequence** (`Kernel-Boot`, `Wininit`, `Hyper-V-Hypervisor` init, `BitLocker-Driver` unlock, `EventLog` service start) from **10:16:10–10:16:43 AM**, ending in a Winlogon logon (`Id 7001`) at 10:16:42, with the task firing at **10:16:43** (matches `LastRunTime` exactly) — again zero daemon output before `STATUS_CONTROL_C_EXIT`.

Every death lines up with a session-boundary event. `Microsoft-Windows-TaskScheduler/Operational` (the log that would normally give richer task-history detail) is **disabled by default on this machine** (`IsEnabled: False`) — noting this as a real gap, not glossed over; the System/Security logs were sufficient to confirm the pattern without it.

**One complication surfaced during Task 3, worth being honest about:** my first hands-on restart attempt (below) also died within ~90 seconds, with *no* correlating System/Security session-teardown event. Best explanation, not fully provable: the same Interactive session-binding that causes death-on-logoff may also make the task vulnerable to console-signal cross-talk (e.g., `CTRL_C`/`CTRL_BREAK` broadcasts) from *other* processes sharing that same interactive console — which would include my own tool invocations running in this same session. A second restart, left completely untouched for a full quiet interval, held stable (see Task 3). This is circumstantial, not proven, but consistent, and it doesn't change the recommended fix.

## Task 3 — Restarted via the real mechanism; currently holding

`Start-ScheduledTask -TaskName "BionDaemon"` (the actual persistent-task path — not a bare `node` invocation that dies on logout).

- **First attempt:** came up genuinely (fresh `daemon.start` event recorded, `pid 25668`, ticked to tick 2) — then died again within ~90 seconds, `LastTaskResult` back to `3221225786`, no correlating session event (see above).
- **Second attempt:** restarted again, then deliberately left **untouched** for a full quiet interval (no polling, no commands) to rule out self-interference. Result, checked after ~2.5 minutes with zero interaction in between:
  ```
  pid: 26112, tick: 4, ts: 2026-08-06T02:11:08.371Z  (fresh, ~6s old at check time)
  Get-Process -Id 26112 → alive, StartTime 8/5/2026 10:08:51 PM
  Get-ScheduledTaskInfo → LastTaskResult: 267009 (SCHED_S_TASK_RUNNING — currently running, not an error code)
  events table: 2026-08-05 22:08:51 | daemon.start | {"pid": 26112, "auto": "shadow", "reactive": "shadow"}
  ```
  Survived 4 full 45-second tick cycles untouched — well past the point where the prior attempt died. **Holding, as of this report.**

**On "confirm at least one real shadow/dispatch event fires":** none has fired yet since restart, and I want to be precise about why rather than wave it away — per the dedup mechanics above, the 2 currently-dispatchable tasks were already shadow-logged in a prior run (e.g., `e1-e` logged 2026-08-02), so `autoTick()` is correctly evaluating them every cycle and correctly staying silent because there's nothing new to report — that's correct behavior, not a failure to fire. I did **not** manufacture a synthetic trigger (e.g., creating a throwaway task) to force one, since that wouldn't be "real conditions" and this is meant to be a genuine test. **I'm not calling this sub-item independently confirmed** — the daemon is verifiably alive, ticking, and evaluating state correctly every cycle without error, but a fresh, novel shadow/dispatch/reactive event firing under truly organic conditions hasn't happened yet on this restart. It will the moment something genuinely new shows up (a newly-ratified task, a new commit to the Bion repo itself, since `pollGit` watches `process.cwd()` — the Bion repo, not Grey's).

## Recommendation on standing alerting — yes, cutover precondition, not a nice-to-have

Three independent reasons, all grounded in what this check just found:

1. **The failure mode is structural and will recur on every routine reboot, sleep/wake, or logoff** as long as the task stays `LogonType: Interactive`. This isn't a one-off bug — it's the task's actual configured behavior working exactly as configured. Nothing about today's restart fixes that; it only clears the current instance of it.
2. **The one thing that *would* have caught this in real time — the `events` table going quiet — is not a valid signal**, per the dedup mechanics above. A monitor watching for "no new events" would have false-alarmed constantly during perfectly healthy stretches and given false confidence during this actual 27-hour outage was silence-compatible either way. The only valid liveness signal is `heartbeat.json`'s own timestamp staleness (or `daemon.start` recency compared against expected uptime), not downstream event activity.
3. **Nobody noticed for ~27 hours** despite three full days of real session work (E2 close-out, MCP tooling, the CDP Bazaar investigation) happening in parallel — exactly the disqualifying scenario the directive itself names. That happened *with* Bion already only in shadow mode, where the blast radius of missed dispatch is low. The same silent-death pattern under live dispatch would mean real ratified work simply doesn't happen, with no signal to anyone until someone thinks to check.

**Recommend, as a genuine precondition, not deferred to "later":**
- A heartbeat-staleness alert (e.g., page/notify if `heartbeat.json`'s `ts` is older than ~2–3× the tick interval) — cheap to build, and the correct signal given point 2 above.
- Separately from alerting: the actual root-cause fix is reconfiguring the scheduled task's Principal off `Interactive` and onto "run whether user is logged on or not" (S4U logon type), so it survives logoff/sleep/reboot instead of merely restarting after them. **I have not made this change myself** — it requires storing a Windows account credential in Task Scheduler, which is the kind of config/security decision this project's own standing rules put in Forces's lane, not something to silently flip. Flagging it as the recommended fix and waiting for a go-ahead rather than doing it.

## Deliver

- Live status: confirmed down at time of check, now confirmed up and holding (pid 26112, tick 4+, fresh heartbeat, `daemon.start` in `events`).
- Root cause: `LogonType: Interactive` on the scheduled task's Principal, confirmed against Windows System event logs at both recent failure points (a logoff→logon churn on 2026-08-04, a full cold boot on 2026-08-05).
- Restarted via the real Task Scheduler mechanism; second attempt (left untouched) is stable as of this report.
- Standing alerting: **recommended as a cutover precondition**, not a nice-to-have, for the reasons above — and separately, the `LogonType` fix itself is the actual durable repair, awaiting Forces's go-ahead since it needs stored credentials.
