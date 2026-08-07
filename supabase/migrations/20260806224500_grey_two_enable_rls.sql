-- 20260806224500_grey_two_enable_rls.sql — Track A of CDP-BAZAAR-SETTLEMENT-AUDIT-AND-RLS-DRAFT-KOV-directive.md
--
-- STATUS: REVIEWED AND APPROVED by Forces, 2026-08-06. Not yet applied.
-- Authored by Kov, 2026-08-06, reviewed by Desktop, approved by Forces. Apply via the existing
-- canonical mechanism (psql --single-transaction -v ON_ERROR_STOP=1 -f <this file> against
-- WPV_DATABASE_URL, owner/migration cred, Forces-lane — see
-- CDP-BAZAAR-RLS-APPLY-RUNBOOK-FORCES.md for the exact command) and record it in
-- supabase/applied_migrations.md the same as every prior grey_two migration.
--
-- WHY THIS EXISTS: Supabase's own advisory tool flags all 10 grey_two tables as
-- "RLS disabled... fully exposed to the anon and authenticated roles". That phrasing is the
-- tool's generic template, not project-specific — checked directly against the live project
-- (ymuyfxztfpdldqtbkoic) before drafting anything:
--
--   select rolname, has_schema_privilege(rolname, 'grey_two', 'USAGE')
--   from (values ('anon'),('authenticated'),('service_role'),('grey_pipeline_rw')) as r(rolname);
--   -> anon: false | authenticated: false | service_role: false | grey_pipeline_rw: true
--
--   select grantee, table_name, privilege_type from information_schema.role_table_grants
--   where table_schema = 'grey_two' and grantee in ('anon','authenticated','service_role','PUBLIC');
--   -> zero rows
--
-- anon and authenticated hold no schema-level USAGE on grey_two at all, and have zero table
-- grants — meaning they cannot reach any grey_two table today, RLS or no RLS (Postgres checks
-- GRANT before RLS; RLS restricts rows for a role that already has table access, it doesn't
-- grant access on its own). The severity is lower than the advisory's blanket wording implies.
-- **Still worth doing anyway**, as defense-in-depth: those grants/schema exposure could change
-- later (a future migration, a Supabase default-privilege change, a PostgREST exposed-schemas
-- edit) without anyone re-running this specific check, and RLS enabled now means that future
-- change fails safe instead of silently opening every row. Flagging the corrected severity so
-- Forces can triage by actual urgency, not the advisory's generic phrasing.
--
-- ROLE CONFIRMED: `grey_pipeline_rw` is grey-core's actual runtime role — confirmed from
-- packages/grey-core/src/deps/index.ts (GREY_DATABASE_URL connection) and cross-checked against
-- the production env file's connection string host/user, not assumed from table-name guessing.
--
-- PER-TABLE OPERATIONS: derived from tracing real call sites (see the accompanying report for
-- the full trace), cross-checked against each table's CURRENT actual grants (queried live, not
-- read off the migration files alone — the 5 original M1 tables never got their own scoped
-- GRANT and still carry blanket CRUD via grey_two's ALTER DEFAULT PRIVILEGES). Where the granted
-- privilege exceeds what any call site in this repo actually uses, it's noted inline — not
-- silently narrowed, since removing a grant is a separate, riskier action than adding RLS and
-- isn't part of this directive's ask.
--
-- Two tables (buyer_records, tracked_jobs) have live data (1 row each) but ZERO call sites
-- anywhere in this monorepo (`grey-core`, `grey-pipeline`, `grey-sweeper` — checked via grep for
-- both snake_case and camelCase forms). The M6 migration's own grants (SELECT/INSERT/UPDATE)
-- are trusted as the source of truth for these two rather than guessed, but flagged explicitly:
-- whatever writes them (very likely the separate ElizaOS ACP adapter — a different deployed
-- process, not in this repo) was NOT traced by this pass. Confidence on these two is lower than
-- the other eight — said explicitly, not left implied.

BEGIN;

-- ── whitepapers ─────────────────────────────────────────────────────────────
-- Real usage (packages/grey-pipeline/src/persistence/repositories.ts WhitepapersRepo,
-- called from pipeline.ts): SELECT (multiple finders), INSERT (create), UPDATE (updateStatus,
-- updateKnowledgeItemId), DELETE (deleteById — called from pipeline.ts:409, live re-ingestion
-- cleanup path, not dead code). Matches the table's current full-CRUD grant exactly — no excess.
ALTER TABLE grey_two.whitepapers ENABLE ROW LEVEL SECURITY;
CREATE POLICY grey_pipeline_rw_all ON grey_two.whitepapers
  FOR ALL TO grey_pipeline_rw USING (true) WITH CHECK (true);

-- ── requests ────────────────────────────────────────────────────────────────
-- Real usage (RequestsRepo + MarginRepo.getCostByOffering's join): SELECT, INSERT (create),
-- UPDATE (markCompleted, markFailed). No DELETE call site found anywhere — the table currently
-- has DELETE granted (default-privilege carryover) that nothing in this repo exercises.
-- Flagging, not revoking (out of scope for this pass).
ALTER TABLE grey_two.requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY grey_pipeline_rw_select ON grey_two.requests
  FOR SELECT TO grey_pipeline_rw USING (true);
CREATE POLICY grey_pipeline_rw_insert ON grey_two.requests
  FOR INSERT TO grey_pipeline_rw WITH CHECK (true);
CREATE POLICY grey_pipeline_rw_update ON grey_two.requests
  FOR UPDATE TO grey_pipeline_rw USING (true) WITH CHECK (true);

-- ── verifications ───────────────────────────────────────────────────────────
-- Real usage (VerificationsRepo): SELECT (many finders/reports), INSERT (create), DELETE
-- (deleteByWhitepaperId — pipeline.ts:510/709, live re-verification cleanup). No UPDATE call
-- site found. Table currently also has UPDATE granted (default-privilege carryover, unused).
-- Flagging, not revoking.
ALTER TABLE grey_two.verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY grey_pipeline_rw_select ON grey_two.verifications
  FOR SELECT TO grey_pipeline_rw USING (true);
CREATE POLICY grey_pipeline_rw_insert ON grey_two.verifications
  FOR INSERT TO grey_pipeline_rw WITH CHECK (true);
CREATE POLICY grey_pipeline_rw_delete ON grey_two.verifications
  FOR DELETE TO grey_pipeline_rw USING (true);

-- ── claims ──────────────────────────────────────────────────────────────────
-- Real usage (ClaimsRepo): SELECT, INSERT (create), DELETE (deleteByWhitepaperId —
-- pipeline.ts:407, same re-ingestion cleanup as whitepapers/verifications). No UPDATE call site
-- found; table currently also has UPDATE granted (default-privilege carryover, unused).
ALTER TABLE grey_two.claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY grey_pipeline_rw_select ON grey_two.claims
  FOR SELECT TO grey_pipeline_rw USING (true);
CREATE POLICY grey_pipeline_rw_insert ON grey_two.claims
  FOR INSERT TO grey_pipeline_rw WITH CHECK (true);
CREATE POLICY grey_pipeline_rw_delete ON grey_two.claims
  FOR DELETE TO grey_pipeline_rw USING (true);

-- ── cost_events ─────────────────────────────────────────────────────────────
-- Real usage (CostEventsRepo.create + MarginRepo.getCostByOffering): INSERT, SELECT. No
-- UPDATE/DELETE call site found; table currently has both granted (default-privilege carryover,
-- unused) — this is the one CONTENT-FREE-by-design audit table (per its own schema comment)
-- among the five originals, so its excess grant is the most worth Forces' attention if a
-- separate grant-tightening pass ever happens.
ALTER TABLE grey_two.cost_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY grey_pipeline_rw_select ON grey_two.cost_events
  FOR SELECT TO grey_pipeline_rw USING (true);
CREATE POLICY grey_pipeline_rw_insert ON grey_two.cost_events
  FOR INSERT TO grey_pipeline_rw WITH CHECK (true);

-- ── revenue_events ──────────────────────────────────────────────────────────
-- Real usage (RevenueEventsRepo.create + MarginRepo.getRevenueRows): INSERT, SELECT. Matches
-- current grant exactly (FDQ-52 append-only posture, UPDATE/DELETE/TRUNCATE already revoked at
-- the grant level) — this policy set just mirrors that at the RLS layer.
ALTER TABLE grey_two.revenue_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY grey_pipeline_rw_select ON grey_two.revenue_events
  FOR SELECT TO grey_pipeline_rw USING (true);
CREATE POLICY grey_pipeline_rw_insert ON grey_two.revenue_events
  FOR INSERT TO grey_pipeline_rw WITH CHECK (true);

-- ── sweep_log (grey-sweeper package) ───────────────────────────────────────
-- Real usage (packages/grey-sweeper/src/log.ts): INSERT (appendSweepLog), SELECT
-- (getLastSweepTimestamp). Matches current grant exactly (append-only, UPDATE/DELETE/TRUNCATE
-- already revoked).
ALTER TABLE grey_two.sweep_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY grey_pipeline_rw_select ON grey_two.sweep_log
  FOR SELECT TO grey_pipeline_rw USING (true);
CREATE POLICY grey_pipeline_rw_insert ON grey_two.sweep_log
  FOR INSERT TO grey_pipeline_rw WITH CHECK (true);

-- ── refuel_log (grey-sweeper package) ──────────────────────────────────────
-- Real usage (packages/grey-sweeper/src/refuel/log.ts): INSERT only (appendRefuelLog) — no
-- SELECT call site found in this repo, though the table is already granted SELECT too (matches
-- its migration's stated intent — presumably for manual/audit querying under the same role, not
-- unused excess in the same sense as the M1 tables above). Kept as SELECT+INSERT to match
-- existing, deliberate grant intent rather than narrowing past what was designed.
ALTER TABLE grey_two.refuel_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY grey_pipeline_rw_select ON grey_two.refuel_log
  FOR SELECT TO grey_pipeline_rw USING (true);
CREATE POLICY grey_pipeline_rw_insert ON grey_two.refuel_log
  FOR INSERT TO grey_pipeline_rw WITH CHECK (true);

-- ── buyer_records — LOWER CONFIDENCE, see note above ───────────────────────
-- No call site found in this monorepo. Matches the FDQ-65 migration's own grant (SELECT/INSERT/
-- UPDATE, DELETE/TRUNCATE revoked) as the trusted source of intent, not independently verified
-- against real code this pass. Has 1 live row (wallet_address ...0be0e1, status 'warned') as of
-- 2026-08-06 — something is writing to this table; just not anything in this repo.
ALTER TABLE grey_two.buyer_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY grey_pipeline_rw_select ON grey_two.buyer_records
  FOR SELECT TO grey_pipeline_rw USING (true);
CREATE POLICY grey_pipeline_rw_insert ON grey_two.buyer_records
  FOR INSERT TO grey_pipeline_rw WITH CHECK (true);
CREATE POLICY grey_pipeline_rw_update ON grey_two.buyer_records
  FOR UPDATE TO grey_pipeline_rw USING (true) WITH CHECK (true);

-- ── tracked_jobs — LOWER CONFIDENCE, see note above ────────────────────────
-- Same caveat as buyer_records. Has 1 live row (chain_id 8453, job_id 70352, status 'expired')
-- as of 2026-08-06. Matches the FDQ-65 migration's grant (SELECT/INSERT/UPDATE).
ALTER TABLE grey_two.tracked_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY grey_pipeline_rw_select ON grey_two.tracked_jobs
  FOR SELECT TO grey_pipeline_rw USING (true);
CREATE POLICY grey_pipeline_rw_insert ON grey_two.tracked_jobs
  FOR INSERT TO grey_pipeline_rw WITH CHECK (true);
CREATE POLICY grey_pipeline_rw_update ON grey_two.tracked_jobs
  FOR UPDATE TO grey_pipeline_rw USING (true) WITH CHECK (true);

COMMIT;

-- NOT INCLUDED, deliberately: no policies for anon/authenticated/PUBLIC on any table — the
-- intent is deny-by-default for every role except grey_pipeline_rw (and service_role, which
-- bypasses RLS entirely by its own `rolbypassrls = true`, confirmed live — normal Supabase
-- posture, not something this migration changes or needs to touch).
--
-- NOT INCLUDED: no `FORCE ROW LEVEL SECURITY`. Table owner (postgres, via WPV_DATABASE_URL /
-- owner-cred migrations) bypasses RLS by default unless FORCE is added — this is deliberate,
-- since the existing manual-psql-owner-cred pattern (data scrubs, corrective migrations, e.g.
-- the FDQ-56 id=207 scrub) depends on unrestricted owner access. Adding FORCE is a separate
-- decision with its own tradeoffs, not bundled into this draft.
