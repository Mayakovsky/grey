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
- **Statement:** pnpm 11 dependency build/postinstall scripts are blocked by default; approved individually via the `allowBuilds:` map (NOT pre-11's `onlyBuiltDependencies`). The approved set is `{esbuild, playwright-core, argon2}` — each inspected + justified inline in `pnpm-workspace.yaml` (esbuild: M1; playwright-core: M3.5; argon2: M4 @grey/ceremony KDF).
- **Verification:** `grep -qE '^allowBuilds:' pnpm-workspace.yaml && grep -qE '^[[:space:]]+esbuild: true' pnpm-workspace.yaml && grep -qE '^[[:space:]]+playwright-core: true' pnpm-workspace.yaml && grep -qE '^[[:space:]]+argon2: true' pnpm-workspace.yaml`
- **Expected:** exit 0.
- **Rationale:** supply-chain hygiene — each native postinstall is inspected before it can run; never `dangerouslyAllowAllBuilds`. (Amendment 6 §G named `onlyBuiltDependencies` and the set `{esbuild, argon2}`; the repo uses the pnpm-11 `allowBuilds:` map and already carried `playwright-core` from M3.5 — codebase wins per HC16, so the real managed set is the three above.)
- **Established by:** M1 (esbuild); M3.5 (playwright-core); M4 (argon2).

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
- **Rationale:** a back-import creates a dependency cycle and breaks the layering; under bundler/tsc resolution a cycle can cause partial-initialization `undefined` exports. The `['"]` quote requirement matches only the import-specifier syntax `from '@grey/...'` (M2-ratified: catches multi-line imports), never prose comments like `// do not import from @grey/pipeline` — **audited M3-followup: not vulnerable** to the bare-word false-positive defect that affected #11/#12.
- **Established by:** M2 (FDQ-narrowed grep form; extended to `@grey/core` at M3; audited M3-followup).

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

## 11. `grey-core-anthropic-via-deps-only`
- **Statement:** grey-core never constructs or directly imports the Anthropic client — it receives one via dependency injection (`deps.pipeline.anthropic`). grey-core legitimately invokes pipeline orchestration now (M3.5 Option-1), so the M3 call-ban on `runFullPipeline`/etc. is retired; the property worth enforcing is DI discipline. No `new Anthropic(`, no `@anthropic-ai/` import, no `createAnthropicClient(` in `packages/grey-core/src/`.
- **Verification:** `! git grep --untracked -qE "new\s+Anthropic\s*\(|from\s+['\"][^'\"]*@anthropic-ai/|createAnthropicClient\s*\(" -- packages/grey-core/src/`
- **Expected:** exit 0 (zero matches = intact).
- **Rationale:** the Anthropic client is constructed only inside `@grey/pipeline` (`createDeps`/`createAnthropicClient`) and reaches grey-core via `HandlerDeps.pipeline`; a direct construction/import in grey-core would bypass the single configured client + model pin. **Targets call/import SYNTAX (HC-B); descriptive comments do NOT false-positive.** Replaces the M3 `grey-core-no-live-anthropic-invocation` (that property is false by design at M3.5 — grey-core invokes pipeline orchestration).
- **Established by:** M3 (as no-live-anthropic); replaced at M3.5 (Option-1 ratification).

## 12. `grey-core-validators-single-source`
- **Statement:** grey-core never instantiates its own ajv — it consumes the pre-compiled validators from `@grey/schemas/validators` (Fastify's `setValidatorCompiler` delegates to them). No `new Ajv2020(...)`/`new Ajv(...)` instantiation in `packages/grey-core/src/`.
- **Verification:** `! git grep -qE "new\s+Ajv2020\s*\(|new\s+Ajv\s*\(" -- packages/grey-core/src/`
- **Expected:** exit 0 (zero matches = intact).
- **Rationale:** a second ajv instance would drift from the frozen schema layer's strict-mode + 2020-12 configuration (HC#12). **Targets the instantiation call syntax (`new Ajv2020(` — the canonical form in `@grey/schemas/validators` — or `new Ajv(`) — not the bare word — so comments mentioning "ajv"/"no new Ajv" do NOT false-positive (M3-followup hardening, defensive — the bare `new\s+Ajv` was not matching any current comment but is tightened to prevent the #11-class defect).**
- **Established by:** M3 (hardened M3-followup).

## 13. `openapi-route-source-of-truth`
- **Statement:** grey-core's offering/resource route set is EQUAL to the OpenAPI spec's `/v1/offerings/<slug>` + `/v1/resources/<slug>` path set (by slug). The OpenAPI YAML is the single source of truth; any handler relocation updates it alongside.
- **Verification:** `pnpm -C packages/grey-core exec tsx scripts/verify-openapi-routes.ts`
- **Expected:** exit 0 (set-equality: every OpenAPI offering/resource path has a registered grey-core handler, and every registered handler is advertised in the OpenAPI — no orphans either way).
- **Rationale:** keeps the published contract (OpenAPI → docs / future SDK gen) in lockstep with the served routes. The script parses the OpenAPI `paths` and diffs the slug set against `offeringHandlers` keys — a true set-equality check, not a presence proxy (upgraded M3-followup; the M3 catalog shipped a presence-only proxy).
- **Established by:** M3 (upgraded to set-equality M3-followup).

## 14. `pipeline-owns-live-compute`
- **Statement:** live-compute / discovery code lives in `@grey/pipeline`; grey-core invokes it only through pipeline exports — it never constructs or directly imports discovery internals (`TieredDocumentDiscovery`, `resolveTokenName`, `CryptoContentResolver`, `HeadlessBrowserResolver`). The discovery stack reaches grey-core as a DI member (`HandlerDeps.discovery`, typed via a single inline `import('@grey/pipeline').TieredDocumentDiscovery` in `deps/index.ts`).
- **Verification (primary):** `! git grep --untracked -nE "\b(TieredDocumentDiscovery|resolveTokenName|CryptoContentResolver|HeadlessBrowserResolver)\s*\(|from\s+['\"][^'\"]*[/](TieredDocumentDiscovery|resolveTokenName|CryptoContentResolver|HeadlessBrowserResolver)" -- 'packages/grey-core/src/' ':(exclude)packages/grey-core/src/deps/index.ts'`
- **Verification (secondary):** exactly **1** bare-word hit in `packages/grey-core/src/deps/index.ts` (the §15-sanctioned DI type annotation).
- **Expected:** primary exit 0 (zero call/import hits); secondary exactly 1.
- **Rationale:** keeps the M5 cutover surface minimal (compute migration is zero) and the MiCA-adjustment lifecycle local to pipeline. **Targets call/import SYNTAX (HC-B) — descriptive comments + the DI type annotation do NOT trip the primary; the bare-word secondary is path-scoped to the one allowed file.**
- **Established by:** M3.5 (live-compute fill).

## 15. `phase3-baseline-cite-discipline`
- **Statement:** the ElizaOS Grey lock (`plugin-acp 991afc1e` / `plugin-wpv 08c754ad`, both `phase3-baseline`) is write-protected; read-only access is unrestricted. Any movement of the lock-anchor SHAs (production-bug-fix scenario) requires Forces' explicit chat-surface authorization, an artifact-chain re-cite, and `phase3-baseline` tag re-application (HC-C). Any M3.5+ artifact citing line numbers in locked source pins SHAs to the live `phase3-baseline` tag.
- **Verification (procedural):** no automated grep — verified at each lock-check boundary (the lock-check command asserts the HEAD SHAs + tag) + artifact-chain review. No silent lock-anchor moves.
- **Expected:** lock-check intact at every gate; any anchor move surfaced in chat with diff + new SHAs.
- **Established by:** M3.5 (HC-C lock-in).

## 16. `sweeper-allowlist-hardcoded`
- **Statement:** the `@grey/sweeper` sweep DESTINATION is a source-code literal — `BASE_POOL_WALLET_ADDRESS` (Base 8453) in `packages/grey-sweeper/src/config.ts`, keyed through `POOL_WALLET_BY_CHAIN_ID`. Env CANNOT redirect the destination, and `poolWalletFor(chainId)` FAILS CLOSED (throws) on any unlisted chainId rather than defaulting to the mainnet entry (FDQ-23).
- **Verification (literal present):** `git grep -nE "^export const BASE_POOL_WALLET_ADDRESS = '0x[0-9a-fA-F]{40}' as const" -- packages/grey-sweeper/src/config.ts`
- **Verification (anti-pattern, must be empty):** `! git grep -qE "BASE_POOL_WALLET_ADDRESS\s*=\s*process\.env" -- packages/grey-sweeper/src/`
- **Expected:** literal grep returns exactly 1 line; anti-pattern grep exit 0 (zero env-redirect of the destination).
- **Rationale:** the sweep moves real USDC; a hostile or fat-fingered env var must never redirect funds. Shape-based (any 40-hex literal) so it passed identically against the Phase-A `0xdead…dead` placeholder and the real `0x9324…1d74` (§6.1). The colon-typed regex in spec §10.1 predated the `as const` form the code actually uses — codebase wins (HC16), so the verification matches the real declaration.
- **Established by:** M4 Phase A (placeholder literal); real address + fail-closed chainId map M4 Phase B (FDQ-23).

## 17. `sweeper-key-isolated-from-core`
- **Statement:** no file under `packages/grey-core/src/` imports from `@grey/sweeper` or `@grey/ceremony`, nor references `GREY_AGENT_WALLET_PRIVATE_KEY`. The sweeper's signing key is loaded only inside `packages/grey-sweeper/src/wallet.ts` (from env, in the sweeper process); grey-core has no path to construct it.
- **Verification:** `! git grep -qE "from ['\"]@grey/(sweeper|ceremony)" -- packages/grey-core/src/ && ! git grep -qE "GREY_AGENT_WALLET_PRIVATE_KEY" -- packages/grey-core/src/`
- **Expected:** exit 0 (zero matches from both greps).
- **Rationale:** grey-core is the buyer-facing HTTP surface; a hot signing key reachable from it would put fund-moving authority behind the public API. Confining the key's import graph to `@grey/sweeper` means a grey-core compromise cannot sign a sweep. Targets import/identifier SYNTAX (HC-B) — descriptive comments do not false-positive. Extended beyond spec §10.2's `@grey/sweeper`-only shape to also bar `@grey/ceremony` (the other key-holding package).
- **Established by:** M4 Phase A.

## 18. `no-placeholder-did-after-M4`
- **Statement:** after the Phase D flip, `did:placeholder:grey` appears nowhere in grey code paths EXCEPT the two sanctioned `did`-field schema-DESCRIPTION lines (`envelope.schema.json` + its generated `.d.ts`) — documentation of the envelope's `did:*` tolerance (FDQ-25, ruled leave). Grey's production identity is the on-chain DID `did:erc8004:8453:58618` in `packages/grey-core/src/deps/index.ts`.
- **Verification (exclusion grep — verbatim from Phase-D completion §4):** `! git grep -nF 'did:placeholder:grey' -- packages/ ':(exclude)packages/grey-schemas/src/responses/v1/envelope.schema.json' ':(exclude)packages/grey-schemas/src/generated/v1/GreyResponseEnvelope.d.ts'`
- **Verification (positive companion):** `git grep -qF 'did:erc8004:8453:58618' -- packages/grey-core/src/deps/index.ts`
- **Expected:** exclusion grep exit 0 (zero placeholder in code paths outside the two sanctioned schema-description lines); companion exit 0 (real DID live in production identity).
- **Rationale:** the flip removed every placeholder USAGE; the residual two hits document a permanent design property and already cite `did:erc8004:` — editing the frozen schema layer + regenerating for a doc example is scope creep the Phase-D directive §1.4 fences out. Scoping the grep to exclude them by exact path keeps #18 a true "no placeholder DID after M4" assertion, stronger than spec §10.3's `deps/index.ts`-only form (guards against re-introduction anywhere in `packages/`). Targets the string in code paths, not prose (M3 §7.1 bare-word lesson).
- **Established by:** M4 Phase D.

---

*Invariants 11–13 established at M3 close (grey-core); #11 replaced + #14/#15 appended at M3.5 close (live-compute fill). #16/#17/#18 appended at M4 close (ERC-8004 DID mint + sweeper). Future movements append at their close, not mid-flight.*
