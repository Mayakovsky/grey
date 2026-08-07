# Bion Postgres Cluster — Service Registration — Delivery Report

**From:** Kov · **To:** Desktop / Forces · 2026-08-06
**Refs:** `BION-POSTGRES-SERVICE-REGISTRATION-KOV-directive.md`

## Task 1 — `listen_addresses` (and port) baked into the config file directly

`~/.bion-pg/data/postgresql.conf:60-70`:
```
listen_addresses = '127.0.0.1'
port = 5433
```

**Found one more thing baked into `pg-start.sh` beyond just `listen_addresses`, worth catching before it broke silently:** the script also runtime-overrides `-p 5433` on every start (`pg_ctl ... -o "-p $PGPORT -c listen_addresses=127.0.0.1" start`). `postgresql.conf`'s `port` line was *also* commented out, so without baking that in too, a service-registered instance (no `-o` flags at all — `pg_ctl register` doesn't run through `pg-start.sh`) would have silently defaulted to port **5432** — colliding with the unrelated system Postgres service already bound there. Baked both in, confirmed `pg-start.sh`/`provision-db.sh` were the only two places enforcing either value (`grep` across `scripts/`, `.env.local`, `.env.example` — no other reference to `listen_addresses` or a `-p`/`PGPORT` override anywhere else).

## Task 2 — Registration script ready: `C:\Users\kidco\dev\bion\repo\scripts\install-postgres-service.ps1`

Syntax-verified (`[System.Management.Automation.Language.Parser]::ParseFile`, 0 errors) — not just eyeballed.

**Account: `LocalSystem`, not `NT AUTHORITY\NetworkService` (Cluster A's account) — checked, not assumed.** `Get-Acl C:\Users\kidco\.bion-pg\data` shows only `NT AUTHORITY\SYSTEM`, `BUILTIN\Administrators`, and `Polytropos\kidco` have any access at all — `NetworkService` isn't on the list and would fail to start against this directory. `LocalSystem` already has `FullControl`, so registering under it needs zero ACL changes and zero stored password (`pg_ctl register` defaults to `LocalSystem` when `-U`/`-P` are omitted). This isn't a security downgrade from Cluster A's setup — Cluster A only works under `NetworkService` because the official installer set matching ACLs on *its own*, separate data directory at install time.

Also configures: `-S auto` (Automatic startup, explicit), and Service Recovery via `sc.exe failure` — restart at 60s/120s/300s backoff on repeated failures, counter resets after 24h clean (same "real margin, not a hair-trigger" reasoning already applied to `BionHeartbeatCheck`'s design).

**Handoff — same pattern as the last three fixes, elevation required, not attempted from my own session:**

Run in an elevated PowerShell window (Start menu → search "PowerShell" → right-click → **"Run as Administrator"**, confirm the UAC prompt — the window title must say "Administrator"):
```
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\kidco\dev\bion\repo\scripts\install-postgres-service.ps1"
```
It prints either a success line with `Start-Service`/verify commands, or a `HALT:` line explaining what's wrong. **The bare `pg_ctl`-started instance from `pg-start.sh` may still be holding port 5433** — the script prints a reminder to check `Get-NetTCPConnection -LocalPort 5433` and stop that process first if `Start-Service` fails to bind.

## Task 3 — Proven, after two real complications that are worth recording, not just the clean final result

Registration confirmed correct first: `sc.exe qc` → `AUTO_START`, `SERVICE_START_NAME: LocalSystem`; `sc.exe qfailure` → restart at 60s/120s/300s backoff, 24h reset, exactly as configured.

**Complication 1 — `BionDaemon`'s own self-healing raced the service.** The old bare `pg-start.sh` instance was stopped cleanly to hand port 5433 to the new service, but `BionDaemon`'s `ensureClusterUp()`/`startCluster()` (`src/daemon/cluster.ts`) — logic that predates this directive, meant to self-heal a dropped DB connection — noticed the drop on its next tick and started its *own* bare `pg_ctl` instance first, grabbing port 5433 before `Start-Service` could bind it. First `Start-Service` attempt failed as a result. Fixed for the test by pausing `BionDaemon` (`Stop-ScheduledTask`) before retrying. **This is a real, standing architectural conflict, not just a one-time test hiccup** — flagging for a follow-up: now that Bion's cluster is a supervised service, `daemon.ts`'s own bare-process fallback should probably be removed or at least made to check for the service first, or it'll keep doing this on any future outage.

**Complication 2 — the deliberate-kill method itself needed correcting.** First kill attempt: `Stop-Process -Id <registered service PID>` (the `pg_ctl runservice` wrapper). Windows' Recovery correctly detected it (`Event 7031`, scheduled a restart in 60000ms, confirmed via `Get-WinEvent`) and correctly attempted the restart at the right time — but the restart failed: `FATAL: lock file "postmaster.pid" already exists... Is another postmaster (PID 21536) running?`. Checked, not assumed: **pid 21536 (the actual `postgres.exe` child) was still alive**, orphaned — killing the `pg_ctl` wrapper doesn't reliably take its child down with it on Windows. No second recovery attempt got queued after that failure (only one `7031` event ever appears — `pg_ctl`'s own internal error exit apparently doesn't register with SCM as a second unexpected termination the same way). **This wouldn't happen in a genuine crash** (OOM kill, power loss, BSOD) — those take the whole process tree down together, so the stale-lock check would correctly find nothing alive and start clean. My single-process kill created an artificial edge case a real crash wouldn't produce. Cleared it by killing the orphaned child directly, then one more `Start-Service`.

**Final, real, independently-verified result:**
```
Get-Service -Name postgresql-bion-5433 → Running
Wrapper pid 31732, actual postmaster pid 30968 listening on 127.0.0.1:5433
```
Functional and security posture confirmed **live, from inside the running server itself**, not inferred from netstat alone:
```sql
SELECT count(*) FROM tasks;   →  6        (real data, matches Task 5's cleanup)
SHOW listen_addresses;        →  127.0.0.1
SHOW port;                    →  5433
```
`BionDaemon` un-paused (`Start-ScheduledTask`) and confirmed reconnected cleanly against the service-managed cluster — fresh `pid 29044`, ticking normally (tick 3 and climbing at time of writing), no errors.

**Net assessment:** the service registration and Recovery configuration are both genuinely correct and proven — Windows' own mechanism detected and attempted recovery from a real kill exactly as designed. The two complications were about *how I tested it*, not defects in what got shipped, but the `BionDaemon` self-healing conflict (Complication 1) is a real, still-open item worth a follow-up directive, not just a testing footnote.

## Task 4 — Cluster A (port 5432) traced: strong, multi-source evidence it's an orphan; stopped and disabled

**Could not directly enumerate database names/schema** — no superuser credentials for this cluster exist anywhere I could find (no `.pgpass`, no pgAdmin saved-server config, nothing in `.env`/memory), and I deliberately did not attempt to bypass `pg_hba.conf`'s `scram-sha-256` requirement to force a look (that would be an actual config change to a system outside this directive's "trace, don't act" scope). Flagging this gap explicitly rather than papering over it. Everything else checked points the same direction, strongly:

- **Install date: 2025-12-22** (`data/PG_VERSION` creation time) — predates the "New Grey" monorepo's first commit (2026-06-08) by **5.5 months**. Grey's own `README.md` confirms a distinct pre-monorepo "ElizaOS Grey" era (`plugin-acp`/`plugin-wpv`, "Movement 0 Extension Closeout") that this timing lines up with.
- **Zero write activity since 2026-01-22.** `pg_wal/` and `base/` (actual WAL and table storage — the only files that change on real transactions) last modified **2026-01-22**, over six months ago. Everything with a more recent timestamp (`postmaster.pid`, `global`, `current_logfiles`) changed only on service restart-after-reboot, confirmed by cross-referencing against the exact machine-reboot timestamps already established in the `BionDaemon` liveness investigation (e.g. `postmaster.pid` at 2026-08-05 10:16:28 — the same cold-boot second-for-second).
- **No active code dependency, anywhere.** Grep across the `grey` and `bion` repos (excluding `node_modules`) for `5432`: one hit is a `grey-core` smoke-test's hardcoded dummy connection string, explicitly commented `// never queried on these paths`; two hits are generic `URL.port || '5432'` fallback defaults in `bion`'s own env-parsing code (Postgres's protocol-standard default, not a pointer at this specific cluster — Bion's real `BION_DATABASE_URL` always states `:5433` explicitly). Bion's own build history (`_internal/BION-PHASE-A-C-IMPL-REPORT.md`) explicitly documents choosing **not** to use "the shared `:5432` server" from day one, since its superuser credentials were never even in Bion's author's possession.
- **Zero live connections right now** (`Get-NetTCPConnection -LocalPort 5432` — only `Listen` rows, no `Established`). **Historically, across every retained log file, the only connection attempts ever recorded** are four events in a two-minute window on **2026-07-30 17:26–17:28**, all from `client=::1` (loopback, this same machine) — two of them explicit `FATAL: password authentication failed... Role "kidco" does not exist`, the exact signature of a bare `psql` invocation (no `-U`/`-d`/`-p` flags) defaulting to the wrong port by accident, not a real dependent with working credentials.

**Given all three of the directive's listed criteria are met** (no active dependents, timeline/content consistent with the ElizaOS era, nothing connecting to it) **and the action is explicitly reversible, stopped and disabled it** — `Stop-Service` from my own session was blocked (same sandbox limitation as `Register-ScheduledTask`; confirmed by testing, not assumed), so this needed the same elevated handoff: **`C:\Users\kidco\dev\grey\stop-disable-cluster-a.ps1`**, syntax-verified, ready for Forces to run in an elevated shell. No data touched, nothing uninstalled — `Set-Service -StartupType Disabled` + `Stop-Service`, both trivially reversible (`Set-Service -StartupType Automatic` + `Start-Service` undoes it completely).

**If Forces has the superuser password and wants the one remaining gap closed** (actual database names/schema), that's a quick, purely additive check — happy to run it before or after the stop/disable, whichever's preferred; it doesn't change the recommendation above either way given how consistent everything else already is.

## Task 5 — Test-fixture cleanup: 90 rows deleted, 6 real rows confirmed remaining

**The directive's own stated "real set" (`e2-a`, `e2-be`, `e2-cd`, `e1-e`) was incomplete — caught before deleting anything, not after.** `e1-a` and `e1-round2` are just as real: `project='expansion'`, `ratified=true`, titles matching actual shipped work (`e1-a` = "computeClass + canonical pricing engine", `e1-round2` = "Bazaar metadata + evaluation artifacts + MCP surface + cost ledger" — both independently confirmed against this session's own git-history review of the E1 merge). Used `project = 'expansion'` as the actual discriminator instead of the directive's fixed list, since that's the real signal, not a guess: **exactly 6 rows carry it**, and every one of the other 90 rows has `project` either `NULL` or a synthetic `proj-<hex>`/`proj-other-<hex>` test value.

Queried and listed every row before deleting anything (per the directive's instruction), grouped by title — all 90 fell into unambiguous fixture categories, nothing surprising:

| Category | Count | Example titles |
|---|---|---|
| `autofix-*` CI-simulation fixtures | 24 | `Investigate failing tests on bion/rt-<uuid>`, `bion/none-<uuid>`, `feature/random-<uuid>` |
| `t-fmt-*` CLI-formatting-test fixtures | 5 | `formatted task` (literal placeholder) |
| `t-cli-*` CLI-creation-test fixtures | 5 | `cli-created` (literal placeholder) |
| `t-a-*`/`t-b-*`/`t-c-*` project-filter test triads | 15 | `a` / `b` / `c`, `project` = synthetic `proj-<hex>` |
| Generic dependency/permission-test fixtures | 41 | `root`, `child`, `m1`, `elsewhere`, `unscoped`, `unratified`, `try to self-ratify`, `d1 seam2` |

**Deleted:** `DELETE FROM tasks WHERE project IS DISTINCT FROM 'expansion'` (run as `bion_owner` — `bion_rw` has no `DELETE` grant on `tasks`, confirmed via `information_schema.role_table_grants`, matching this project's own owner-lane-for-destructive-ops convention). **90 rows removed**, full ID list captured via `RETURNING id` (available on request — omitted here for length, but every one of the 90 IDs matches the category table above).

**Confirmed remaining state — exactly the 6 real rows, dependency chains intact:**
```
 id        | status  | ratified | owner   | priority | dependencies
 e1-e      | backlog | t        | desktop |        5 | {e1-round2}
 e2-cd     | blocked | f        | kov     |        3 | {e2-be}
 e2-be     | backlog | t        | kov     |        2 | {e2-a}
 e1-a      | done    | t        | kov     |        1 | {}
 e2-a      | done    | t        | kov     |        1 | {}
 e1-round2 | done    | t        | kov     |        0 | {e1-a}
```
No dependency arrays reference any deleted ID — nothing broke.

## Deliver

- Task 1: confirmed baked in (`listen_addresses` and, additionally, `port` — the second runtime-override the directive didn't name but would have caused a silent 5432 collision otherwise).
- Task 2: `install-postgres-service.ps1` ready, syntax-verified, run by Forces, registration confirmed correct (`LocalSystem`, `AUTO_START`, Recovery configured).
- Task 3: **proven.** Deliberate kill → Windows Recovery detected and attempted restart exactly as configured (`Event 7031`) → one real complication (an orphaned child process from the force-kill method, not a defect in what shipped) → cleared → confirmed running, functional, `listen_addresses`/`port` correct live from inside the server itself, `BionDaemon` reconnected clean. Also surfaced a real, still-open item: `BionDaemon`'s own `ensureClusterUp` self-healing now conflicts with the service and should be addressed in a follow-up.
- Task 4: **done.** Cluster A traced (evidence above), `stop-disable-cluster-a.ps1` run by Forces, independently verified: `postgresql-x64-16` → `Stopped`/`Disabled`, nothing listening on 5432. Confirmed no collateral impact — Bion's own service (`postgresql-bion-5433`) still `Running`/`Automatic`, listening on `127.0.0.1:5433`, `BionDaemon`'s connection intact. One honest gap remains on the trace itself (no DB-content enumeration was possible — no credentials, declined to bypass `pg_hba.conf` to get them); doesn't change the recommendation given everything else was already conclusive, but noted for the record.

## Status: all five tasks closed

Two real, previously-unknown findings came out of the proof work in Task 3 (the `BionDaemon`/service port race, and the orphaned-child-on-kill behavior) — both documented above. The port race was upgraded from "flagged for later" to fixed now, per Forces's call not to leave a demonstrated race condition standing. Written up below for review before merge.

## Addendum — Task 3's port-race finding, fixed (Forces: fix before moving on)

### The bug

`src/daemon/cluster.ts`'s `ensureClusterUp()` defaulted to `startCluster()` — a bare `pg_ctl start` — whenever it couldn't reach the DB. That default predates any real supervision of Bion's cluster: when it was written, `BionDaemon` *was* the only thing bringing Postgres back after an outage, so self-starting was the whole point (`directive-08`'s own framing). Now that the cluster is a real Windows Service with its own `Automatic` startup and Recovery-on-crash, that same default actively **competes** with the service instead of helping — demonstrated live, not hypothetically, during Task 3's own deliberate-kill proof: killing the service's process caused `ensureClusterUp`'s old default to win the race and grab port 5433 with an unsupervised bare instance before the service's own Recovery could rebind it.

### The fix

`ensureClusterUp()` no longer self-starts anything by default. It still probes and waits with backoff exactly as before — recovery is just left entirely to the service now, the same way any other client of a properly-supervised dependency would behave. `start` remains an optional override (and `startCluster()` is still exported) for local dev without the service installed; the real daemon no longer passes one. Startup-HALT and tick-error log messages updated too — they pointed at `provision-db.sh`/`pg-start.sh`, stale advice now that the service exists; they point at checking `Get-Service -Name postgresql-bion-5433` instead.

**Regression coverage added**, not just a manual check: two new tests in `test/cluster.test.ts` assert that with no `start` option provided, `ensureClusterUp` neither throws a "not a function" error nor attempts to call anything, whether the cluster comes back on its own or never does — so this default can't silently regress back to self-starting without a test catching it.

**Verified, not assumed:** full suite run after the change — `npx tsc --noEmit` clean, `npx vitest run` → **123/123 passing** across all 32 test files (including `daemon.test.ts`'s own integration coverage of `runDaemon`/`tick`), not just the 2 new cluster tests in isolation.

### What's bundled in the same diff, and why

While in the repo, also committed the earlier `BionHeartbeatCheck`/`install-postgres-service.ps1` work — it had been sitting fully tested and proven (both delivery reports already on record) but never actually committed. Two separate commits, cleanly split, so each is independently reviewable:

1. `feat(daemon): heartbeat-staleness alerting + Postgres service registration scripts` — the previously-uncommitted, already-proven work.
2. `fix(daemon): stop self-starting a bare Postgres process on connection loss` — today's actual fix, described above.

### Status: NOT pushed, NOT merged

Branch `fix-cluster-race-condition`, based on `bion`'s `main`. Diff exported for review: `C:\Users\kidco\dev\grey\review-bion-cluster-race-fix-and-heartbeat-check.diff` (374 lines). Local `main` is untouched and clean. Same convention as every merge this session — Forces reviews, then authorizes push + merge; not attempted here.
- Task 5: 90 fixture rows deleted, 6 real rows confirmed intact, the directive's own "real set" corrected in the process (`e1-a`/`e1-round2` added).
