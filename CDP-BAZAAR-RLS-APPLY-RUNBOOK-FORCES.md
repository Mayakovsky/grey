# RLS Enable on grey_two — Forces' Part Only

**For:** Forces. Owner/migration-cred step — everything else (drafting, review) is done. This
version spells out exactly which shell/machine each command runs in, since the last one didn't.

**File:** `supabase/migrations/20260806224500_grey_two_enable_rls.sql` — reviewed by Desktop,
approved by you. Renamed from Kov's `DRAFT_grey_two_enable_rls_KOV.sql` to match the canonical
timestamp-prefixed convention; content unchanged except the header status line.

**What it does, briefly:** enables RLS on all 10 `grey_two` tables, adds `grey_pipeline_rw`-scoped
policies matching each table's real, currently-exercised access, adds nothing for `anon`/
`authenticated`/`PUBLIC` (deny-by-default), doesn't touch `FORCE ROW LEVEL SECURITY`. Wrapped in
`BEGIN`/`COMMIT` — all-or-nothing. Two tables (`buyer_records`, `tracked_jobs`) are policied on
trusted prior-migration intent rather than independently re-derived call sites — flagged in the
file's own header, worth knowing, not a reason to hold.

There are **three separate shells/machines** below. Don't run a step in the wrong one — the DB apply
happens from your Windows machine (it reaches Supabase directly over the internet, nothing VPS-
specific about it), the smoke test happens on the VPS itself.

---

## Step 1 — local PowerShell — load the owner credential without ever printing it

**Shell: PowerShell, on your Windows machine.** Not cmd.exe, not WSL.

```powershell
cd C:\Users\kidco\dev\eliza\plugin-wpv
$line = Get-Content .env | Where-Object { $_ -match '^WPV_DATABASE_URL=' }
$env:WPV_DATABASE_URL = ($line -replace '^WPV_DATABASE_URL=', '').Trim('"').Trim("'")
```

Sanity-check it loaded, without echoing the value itself:

```powershell
if ([string]::IsNullOrWhiteSpace($env:WPV_DATABASE_URL)) {
  Write-Host "EMPTY — check the variable name in .env, or that you're in the right directory"
} else {
  Write-Host "Loaded, $($env:WPV_DATABASE_URL.Length) characters — not printing the value"
}
```

This matters beyond tidiness: because the credential is read from the file at runtime rather than
typed inline, it never appears as literal text in your PowerShell command history (`PSReadLine`
logs the commands you type, not what a file read resolves to).

## Step 2 — same PowerShell session — confirm psql is available, then apply

Still the same window, same machine.

```powershell
Get-Command psql
```

If that errors with "not recognized," psql isn't on `PATH` this session — locate it (typically
`C:\Program Files\PostgreSQL\<version>\bin\psql.exe`) and add it temporarily:
`$env:PATH += ";C:\Program Files\PostgreSQL\<version>\bin"`, then retry `Get-Command psql`.

Once confirmed:

```powershell
psql -w -v ON_ERROR_STOP=1 --single-transaction `
  -d "$env:WPV_DATABASE_URL" `
  -f "C:\Users\kidco\dev\grey\supabase\migrations\20260806224500_grey_two_enable_rls.sql"
```

(The backtick line-continuations are PowerShell syntax — fine to paste as one line instead if you
prefer, order of flags doesn't matter.) `-w` means "never prompt for a password" — the credential's
already in the connection string, so if it *does* prompt, something's wrong with Step 1 and you
should stop and check rather than typing a password in.

Expected output: a handful of `ALTER TABLE`/`CREATE POLICY` lines, then `COMMIT`. Any `ERROR` line
means `ON_ERROR_STOP` already rolled the whole transaction back — nothing partial gets left behind.

## Step 3 — same PowerShell session — verify

```powershell
psql -w -d "$env:WPV_DATABASE_URL" -c "select relname, relrowsecurity from pg_class where relnamespace = 'grey_two'::regnamespace and relkind = 'r' order by relname;"
```
Expect `relrowsecurity = t` on all 10 rows.

```powershell
psql -w -d "$env:WPV_DATABASE_URL" -c "select schemaname, tablename, policyname, roles from pg_policies where schemaname = 'grey_two' order by tablename;"
```
Expect every `roles` array to read `{grey_pipeline_rw}` only — never `anon`, `authenticated`, or
`public`, on any row.

## Step 4 — clear the credential from this session

Still local PowerShell, once Steps 2–3 look right:

```powershell
Remove-Item Env:WPV_DATABASE_URL
```

## Step 5 — a different machine entirely: SSH into the VPS, bash, quick smoke test

**Shell: bash, on the production VPS** (`44.243.254.19`) — not PowerShell, not your local machine.
This confirms `grey-core` still behaves correctly post-migration; RLS shouldn't touch anything it
needs (its own grants are unchanged), but worth a real check rather than assuming.

From PowerShell, open the SSH connection (this hands off to a remote bash prompt):
```powershell
ssh ubuntu@44.243.254.19
```

Once connected — you're now in bash on the VPS, a completely separate shell/session from Steps
1–4:
```bash
curl -s http://127.0.0.1:3002/health
```
Expect `{"status":"ok",...}` or equivalent. Port 3002 is firewalled from the outside, which is why
this has to run on-box rather than from your machine.

```bash
exit
```
back out to your local PowerShell when done.

## Step 6 — tell me it's clean

Once Steps 3 and 5 both look right, let me know — I'll write the `applied_migrations.md` entry
with the real applied timestamp and these verification results, same format as every entry before
it.
