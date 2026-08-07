# Bion Daemon — Fix the Real Cause (LogonType) — Forces' Part Only

**Why:** Kov's report confirms `BionDaemon`'s scheduled task is set to `LogonType: Interactive` — its process lifetime is tied to your desktop session, so it dies on every logoff, sleep, or reboot. Today's restart cleared the current instance; it doesn't stop it from happening again. The durable fix needs a stored Windows credential, which is why this is yours to do, same category as the key ceremony.

## What you're changing

Reconfigure the task to run whether you're logged on or not (S4U), instead of tied to an interactive session.

## Steps

1. Open Task Scheduler (`taskschd.msc`).
2. Find **BionDaemon** in the task list, right-click → **Properties**.
3. **General** tab → under "Security options," select **Run whether user is logged on or not**.
4. It'll prompt for the password of the account the task runs as (`kidco`). Enter it, OK through.
5. Re-open Properties → General tab, confirm it now shows "Run whether user is logged on or not" (not "Run only when user is logged on").

## Confirm it actually took

Ask Kov to pull the task's current Principal settings (`schtasks /query /tn BionDaemon /xml`, or equivalent) before and after — the `<LogonType>` element should read `S4U` or `Password` (not `InteractiveToken`) once this is done. Then the real test: log off and back on (or just let the machine sleep/wake once), and confirm via `bion status` that the daemon survived it — that's the actual proof, not just the Properties dialog looking right.

## One thing worth knowing before you do this

Windows stores that credential (encrypted, via its own credential vault — not something Kov or anything else on this machine has separate access to), and the task will use it to run in the background from then on, same as any Windows service. If `kidco`'s password ever changes, this task will start failing silently again until it's re-entered here — worth a mental note, not a blocker.
