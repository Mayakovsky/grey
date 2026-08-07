# SESSION CLEANUP — GIT STATUS CHECK, COMMIT, PUSH — KOV DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces.

## Context

This session's work (RLS migration, settlement #5, the `EXTENSION-RESPONSES`/crawler verification
round, the GitHub reply) is done. No application code changed — the RLS change went live via
direct psql apply, not a deploy, so nothing needs `systemctl restart grey-core`. But several files
were written or edited directly (not through git) and may be sitting uncommitted:

- `supabase/migrations/20260806224500_grey_two_enable_rls.sql` (renamed + header edited by Desktop)
- `supabase/applied_migrations.md` (new ledger entry appended by Desktop)
- `infra/deploy/deploy.md` (new "local machine vs. VPS" section added by Desktop — this one matters:
  it's meant to be visible to future Kov instances, including any working from `/opt/grey/grey` on
  the VPS, which only happens if it's actually pushed)
- `CDP-BAZAAR-RLS-POST-APPLY-SMOKE-TEST-KOV-directive.md` (overwritten with a superseded-redirect
  note by Desktop)
- Every `CDP-BAZAAR-*.md` directive/report from this session (the settlement, the audit, the
  verification round, the GitHub reply draft) — following the existing convention of prior
  directive/report files already in the repo root, but confirm rather than assume these are meant
  to be tracked the same way.

## Task

1. `git status` — report the full output verbatim. Don't summarize which files, list them exactly.
2. For anything listed above (or anything else uncommitted from this session), stage with
   **explicit paths, never `git add -A`**, and commit. Group logically rather than one giant
   commit — e.g. the migration + ledger entry together, the deploy.md doc update on its own, the
   directive/report markdown files together or per-topic, whatever makes the log readable.
3. Push.
4. Confirm: does the VPS checkout (`/opt/grey/grey`) need a `git pull` for anything here to be
   useful there (specifically `infra/deploy/deploy.md`'s new section)? If so, say so explicitly —
   don't pull it yourself without a separate go-ahead, this is a read of whether it's needed, not
   authorization to do it.

## Deliver

Short report: `git status` output, what got committed and in what groups (with commit messages),
push confirmation, and the answer on whether the VPS checkout needs a pull.
