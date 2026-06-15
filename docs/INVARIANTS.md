# Grey monorepo — standing invariants

Canonical, committed record of the structural invariants the `grey` monorepo upholds across
movements. Seeded at M3 from Kov's M2.5 analysis appendix (`movement-2.5-schema-layer-
PATTERN-RATIFICATION-ANALYSIS-KOV-RESPONSE.md`); all 10 verification commands were re-run at the
M3 input pass + spec audit (10/10 exit 0).

**Usage:** every movement's state preflight reads this file and runs each entry's verification
command, asserting the expected output, BEFORE any authoring. New invariants are appended at a
movement's CLOSE (not mid-flight). Commands run from the repo root (`C:\Users\kidco\dev\grey`)
unless noted; **exit 0 = intact**. Entries 6 and 8 verify via a repo-anchored proxy because the
underlying invariant is process- or machine-state, not pure repo-state (flagged inline).

---

## 1. `gitattributes-eol-normalization`
- **Statement:** all text files are normalized to LF in git (`* text=auto eol=lf`), regardless of authoring OS.
- **Verification:** `grep -qx '* text=auto eol=lf' .gitattributes`
- **Expected:** exit 0.
- **Rationale:** lets a Windows-authored repo produce byte-identical generated output on Linux CI — load-bearing for the codegen-drift job.
- **Established by:** M1.

## 2. `pnpm11-allowbuilds-discipline`
- **Statement:** pnpm 11 dependency build/postinstall scripts are blocked by default; approved individually via the `allowBuilds:` map (NOT pre-11's `onlyBuiltDependencies`). Only `esbuild` is approved.
- **Verification:** `grep -qE '^allowBuilds:' pnpm-workspace.yaml && grep -qE '^[[:space:]]+esbuild: true' pnpm-workspace.yaml`
- **Expected:** exit 0.
- **Rationale:** supply-chain hygiene — each native postinstall is inspected before it can run; never `dangerouslyAllowAllBuilds`.
- **Established by:** M1.

## 3. `flat-barrel-and-d-resolve`
- **Statement:** `@grey/schemas`'s `.` export + `main`/`types` resolve to `./src/index.ts` (no `dist/`), and `@grey/pipeline` consumes it via `export * from '@grey/schemas'`. The M2 flat barrel is preserved (M2.5 added sub-paths but never touched `.`).
- **Verification:** `grep -qE '"\.": *"\./src/index\.ts"' packages/grey-schemas/package.json && grep -qE "^export \* from '@grey/schemas'" packages/grey-pipeline/src/index.ts`
- **Expected:** exit 0.
- **Rationale:** D-RESOLVE — packages are consumed via source (no build until M5); breaking `.` or the pipeline re-export breaks every consumer's type resolution.
- **Established by:** M2 (preserved through M2.5).

## 4. `anti-cycle-one-way-dependency`
- **Statement:** `@grey/schemas` MUST NOT import from `@grey/pipeline` or `@grey/core` (schemas is the leaf; pipeline + core consume it, never the reverse).
- **Verification:** `! git grep -qE "from ['\"]@grey/(pipeline|core)" -- packages/grey-schemas/`
- **Expected:** exit 0 (zero import hits = intact).
- **Rationale:** a back-import creates a dependency cycle and breaks the layering; under bundler/tsc resolution a cycle can cause partial-initialization `undefined` exports.
- **Established by:** M2 (FDQ-narrowed grep form; extended to `@grey/core` at M3).

## 5. `elizaos-grey-bytidentical-lock`
- **Statement:** the production ElizaOS Grey repos stay byte-identical at `phase3-baseline` throughout the New Grey build (until M5 cutover): plugin-acp `991afc1e2353…`, plugin-wpv `08c754ad6ea7…`.
- **Verification:** `[ "$(git -C /c/Users/kidco/dev/eliza/plugin-acp rev-parse HEAD)" = "991afc1e2353b7c6b83f31e5204a3e9b4d66601a" ] && [ "$(git -C /c/Users/kidco/dev/eliza/plugin-acp tag --points-at HEAD)" = "phase3-baseline" ] && [ "$(git -C /c/Users/kidco/dev/eliza/plugin-wpv rev-parse HEAD)" = "08c754ad6ea7aeca5c826c2c44f9b11af990e9e6" ] && [ "$(git -C /c/Users/kidco/dev/eliza/plugin-wpv tag --points-at HEAD)" = "phase3-baseline" ]`
- **Expected:** exit 0.
- **Rationale:** ElizaOS Grey is live on the VPS serving Virtuals ACP; the New Grey build must not perturb running production until a deliberate M5/M6 cutover.
- **Established by:** M0/M1.

## 6. `single-comprehensive-commit-merge-hygiene` (proxy)
- **Statement:** each movement ships as one comprehensive commit merged via `gh pr merge --merge` (never `--squash`/`--rebase`); commit messages via `git commit -F <temp outside repo>`; no `git add -A`/`.`/`-a`.
- **Verification (proxy):** `git cat-file -e 5b6a1de^{commit} && git cat-file -e 5173c3b^{commit}`
- **Expected:** exit 0 (M2.5 + M2 comprehensive commits still present on `main` = `--merge` preserved them).
- **Rationale:** cold-start readers read the comprehensive commit body to understand what a movement shipped; squash/rebase would destroy that load-bearing artifact. Process-not-state → survivorship proxy.
- **Established by:** M1 (merge mode); M2 / M2.5 (commit-`-F` + explicit staging).

## 7. `tsconfig-base-resolution-shape`
- **Statement:** root TS config sets `moduleResolution: "Bundler"` + `verbatimModuleSyntax: true` + `isolatedModules: true` (+ `types: []`).
- **Verification:** `grep -q '"moduleResolution": "Bundler"' tsconfig.base.json && grep -q '"verbatimModuleSyntax": true' tsconfig.base.json && grep -q '"isolatedModules": true' tsconfig.base.json`
- **Expected:** exit 0.
- **Rationale:** `verbatimModuleSyntax` is why named-barrel + `export type` discipline exists; `Bundler` is why source-consumption (D-RESOLVE) works; `types: []` is why `node:` builtins need explicit imports. Changing these silently changes which authoring patterns are valid.
- **Established by:** M1.

## 8. `pnpm-version-pin` (proxy)
- **Statement:** pnpm pinned to `11.x` via `packageManager`; installed globally (corepack EPERM workaround) and invoked as `pnpm -C C:\Users\kidco\dev\grey <cmd>`.
- **Verification (proxy):** `grep -qE '"packageManager": "pnpm@11' package.json`
- **Expected:** exit 0 (repo-anchored proxy; global install + `-C` invocation are machine-state).
- **Rationale:** version pin keeps lockfile + `allowBuilds` semantics stable.
- **Established by:** M1.

## 9. `node24-version-pin`
- **Statement:** Node pinned to 24; CI reads it via `node-version-file: .node-version`.
- **Verification:** `grep -qxE '24(\..*)?' .node-version`
- **Expected:** exit 0.
- **Rationale:** local + CI run the same Node major; M2.5 relied on Node 20.11+/24 features (`import.meta.dirname`). Version skew reintroduces "works on my machine."
- **Established by:** M1.

## 10. `supabase-psql-migration-ledger`
- **Statement:** Grey applies migrations via `psql` + a manual ledger (Supabase CLI `db push` is refused — shared `schema_migrations`). Two credentials, two purposes: `GREY_DATABASE_URL` (runtime, `grey_pipeline_rw`) vs `WPV_DATABASE_URL` (migrations only).
- **Verification:** `test -f supabase/applied_migrations.md`
- **Expected:** exit 0 (confirms the ledger convention; the credential split is `.env`-only, verified operationally).
- **Rationale:** running `db push` against the shared project would corrupt migration history both Grey and plugin-wpv depend on; the credential split prevents runtime code holding migration privileges.
- **Established by:** M1 Step 2.

## 11. `grey-core-no-live-anthropic-invocation`
- **Statement:** grey-core invokes no live-compute pipeline stage and no Anthropic client — all 9 offerings are cache-read-only (M3; live-compute is M3.5). No `runFullPipeline`/`analyzeStructure`/`extractClaims`/`evaluateClaims` call and no `anthropic` reference in `packages/grey-core/src/`.
- **Verification:** `! git grep -qiE "runFullPipeline|analyzeStructure|extractClaims|evaluateClaims|anthropic" -- packages/grey-core/src/`
- **Expected:** exit 0 (zero matches = intact).
- **Rationale:** FDQ-1 scoped M3 to cache-read-only; a live-compute or Anthropic call would silently re-introduce the deferred (and DB-empty, cost-bearing) live path.
- **Established by:** M3.

## 12. `grey-core-validators-single-source`
- **Statement:** grey-core never instantiates its own ajv — it consumes the pre-compiled validators from `@grey/schemas/validators` (Fastify's `setValidatorCompiler` delegates to them). No `new Ajv` in `packages/grey-core/src/`.
- **Verification:** `! git grep -qE "new\s+Ajv" -- packages/grey-core/src/`
- **Expected:** exit 0 (zero matches = intact).
- **Rationale:** a second ajv instance would drift from the frozen schema layer's strict-mode + 2020-12 configuration (HC#12).
- **Established by:** M3.

## 13. `openapi-route-source-of-truth` (proxy)
- **Statement:** grey-core's HTTP route paths match the OpenAPI spec — `POST /v1/offerings/<slug>` (paid) + `GET /v1/resources/<slug>` (free). The OpenAPI YAML is the single source of truth; any handler relocation updates it alongside.
- **Verification (proxy):** `grep -q '/v1/offerings/' packages/grey-core/src/server/routes/offerings.ts && grep -q '/v1/resources/' packages/grey-core/src/server/routes/resources.ts && grep -q '/v1/offerings/legitimacy_scan' packages/grey-schemas/openapi/openapi.yaml && grep -q '/v1/resources/daily_greenlight_list' packages/grey-schemas/openapi/openapi.yaml`
- **Expected:** exit 0 (route prefixes present in grey-core routes AND canonical paths present in the OpenAPI).
- **Rationale:** keeps the published contract (OpenAPI → docs / future SDK gen) in lockstep with the served routes. Proxy: greps presence rather than a full path-set diff.
- **Established by:** M3.

---

*Invariants 11–13 established at M3 close (grey-core). Future movements append at their close, not mid-flight.*
