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

## 3. `flat-barrel-dist-resolution`
- **Statement:** `@grey/schemas`'s `.` export resolves to the **built `dist/`** (`types` → `./dist/index.d.ts`, `default` → `./dist/index.js`) — the M5 Phase B D-RESOLVE-closure flip — while `@grey/pipeline` still consumes it via `export * from '@grey/schemas'`. The flat barrel (single `.` entry) is preserved; production Node resolves dist, and dev/test/typecheck resolve source (vitest alias → src; typecheck via `^build` → the built `.d.ts`).
- **Verification:** `grep -qE '"\.":[[:space:]]*\{[^}]*"\./dist/index\.js"' packages/grey-schemas/package.json && ! grep -qE '"\.":[[:space:]]*"\./src/index\.ts"' packages/grey-schemas/package.json && grep -qE "^export \* from '@grey/schemas'" packages/grey-pipeline/src/index.ts`
- **Expected:** exit 0 (`.` maps to `dist/index.js` under a conditional-exports object, NOT to `src`; pipeline re-export intact).
- **Rationale:** Pre-M5 this was D-RESOLVE (source-consumed, `.` → `./src/index.ts`) because nothing built to dist. M5 Phase B introduced real builds and flipped every package's `exports` to dist; breaking `.` or the pipeline re-export still breaks every consumer's resolution — the property is the same, only the target moved src → dist.
- **Established by:** M2 (flat barrel, src-resolve); **retargeted to dist at M5 Phase B** (real builds); statement corrected at M5 Phase C (Phase B's close ran only a partial invariant check and missed this).

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

## 19. `receiver-key-isolation` (extends #17)
- **Statement:** the x402 settlement relayer key `X402_RELAYER_PRIVATE_KEY` is referenced ONLY under `adapters/x402-middleware/src/` — never in `packages/grey-core/src/`. Together with #17 (sweeper key `GREY_AGENT_WALLET_PRIVATE_KEY` only under `packages/grey-sweeper/`), NO signing key is reachable from grey-core's runtime source. The relayer is a gas-only EOA (FDQ-31(a)) that structurally cannot redirect funds — the buyer's EIP-3009 signature fixes `to` = `payTo`, so a relayer or grey-core compromise costs at most the relayer's gas balance.
- **Verification:** `! git grep -qE --untracked "X402_RELAYER_PRIVATE_KEY" -- packages/grey-core/src/ && ! git grep -qE --untracked "GREY_AGENT_WALLET_PRIVATE_KEY" -- packages/grey-core/src/ && git grep -lE --untracked "X402_RELAYER_PRIVATE_KEY" -- adapters/x402-middleware/src/ | grep -q .`
- **Expected:** exit 0 (neither key string in `grey-core/src`; the relayer key IS present in `x402-middleware/src`). Scoped to `src/` like #17 — test fixtures that name the env var to exercise `loadX402Config` are not source handling of the key.
- **Rationale:** grey-core is the buyer-facing HTTP surface; confining each signing key's import graph to its owning package means a grey-core compromise can neither sweep (sweeper key) nor sign a redirected settlement (relayer key, and the buyer's signature pins the destination regardless).
- **Established by:** M5 Phase C.

## 20. `single-price-source`
- **Statement:** the 7 paid-route prices exist as exactly ONE literal table — `PRICE_TABLE` in `adapters/x402-middleware/src/prices.ts` (USD label + USDC atomic units), with `USDC_BY_NETWORK` the sole per-network asset literals. grey-core's paid-route envelope `costUsd` and the 402 `maxAmountRequired` both derive from it (`priceUsdFor` / `priceAtomicFor`) — no price is duplicated as a literal in grey-core's paid routes. (The 2 free resource routes legitimately carry `costUsd: 0`.)
- **Verification:** `git grep -qE --untracked "^export const PRICE_TABLE" -- adapters/x402-middleware/src/prices.ts && git grep -q --untracked "priceUsdFor" -- packages/grey-core/src/server/routes/offerings.ts && ! git grep -qE --untracked "costUsd:\s*[0-9]" -- packages/grey-core/src/server/routes/offerings.ts`
- **Expected:** exit 0 (table present; paid routes derive `costUsd` via `priceUsdFor`; no numeric price literal in the paid-route file).
- **Rationale:** a hardcoded price drifting from the table would let the 402 challenge charge one amount while the envelope reports another. Single source keeps the challenge (`maxAmountRequired`), the settlement floor (verify `value >=`), and the receipt (`costUsd`) mutually consistent. Closes the M3 `costUsd: 0` hardcode on paid routes.
- **Established by:** M5 Phase C.

## 21. `refuel-eth-destination-pinned` (mirrors #16)
- **Statement:** the Phase F refuel's ETH DESTINATION is a source-code literal — `RELAYER_ADDRESS` in `packages/grey-sweeper/src/refuel/addresses.ts` (the FDQ-31(a) gas-only relayer EOA). Env CANNOT redirect where ETH is sent; value-bearing `sendTransaction` calls exist NOWHERE in the sweeper outside `refuel/execute.ts`; and ALL of them flow through the single `transferEth` choke-point, which gates on the pinned literal via `isRelayer(relayer, RELAYER_ADDRESS)` — so BOTH value-send paths (the refuel transfer AND the FDQ-58 native-ETH recovery sweep) are guarded, and a future send site cannot dodge the check.
- **Verification (literal present):** `git grep --untracked -nE "^export const RELAYER_ADDRESS = '0x[0-9a-fA-F]{40}' as const" -- packages/grey-sweeper/src/refuel/addresses.ts`
- **Verification (anti-pattern, must be empty):** `! git grep --untracked -qE "RELAYER_ADDRESS\s*=\s*process\.env" -- packages/grey-sweeper/src/`
- **Verification (ETH-send confinement):** `! git grep --untracked -qE "sendTransaction\(\{[^}]*value" -- packages/grey-sweeper/src/ ':(exclude)packages/grey-sweeper/src/refuel/execute.ts'`
- **Verification (choke-point guarded):** exactly ONE value-bearing `sendTransaction` exists in `refuel/execute.ts`, and it is preceded by the `isRelayer` gate — `test "$(git grep --untracked -E "await walletClient\.sendTransaction\(\{ to: relayer, value" -- packages/grey-sweeper/src/refuel/execute.ts | wc -l)" = "1"` && `git grep --untracked -q "if (!isRelayer(relayer, RELAYER_ADDRESS))" -- packages/grey-sweeper/src/refuel/execute.ts`
- **Expected:** literal grep returns exactly 1 line; the two anti-pattern greps exit 0; the choke-point count is 1 and the guard grep exits 0.
- **Rationale:** the refuel moves real value out of the agent wallet; a hostile or fat-fingered env var — or a new ETH-send site — must never redirect the ETH leg. Same defense shape as #16's sweep-destination pinning — the two literals (Tier-B pool for USDC, relayer for ETH) are the ONLY places the sweeper's funds may go. The single-choke-point guard (FDQ-58) means the invariant holds for every value-bearing send, present and future.
- **Established by:** M5 Phase F; choke-point guard added at FDQ-58 (second value-send path).

## 22. `refuel-swap-bounds-single-source`
- **Statement:** every refuel amount constant — floor/target/hard-floor defaults, per-tick USDC cap, slippage, minimum-viable input, and the FDQ-58 gas reserve — exists as ONE literal block in `packages/grey-sweeper/src/refuel/settings.ts`; every `exactInputSingle` call carries the quote-derived `amountOutMinimum` (never `0n`), so no swap can execute unbounded.
- **Verification (single block):** `test "$(git grep --untracked -E '^export const (DEFAULT_FLOOR_WEI|DEFAULT_TARGET_WEI|DEFAULT_HARDFLOOR_WEI|DEFAULT_MAX_USDC|SLIPPAGE_PPT|MIN_USDC_IN|DEFAULT_GAS_RESERVE_WEI)' -- packages/grey-sweeper/src/refuel/settings.ts | wc -l)" = "7"`
- **Verification (bound wired):** `git grep --untracked -q "amountOutMinimum: quote.minOut" -- packages/grey-sweeper/src/refuel/execute.ts && ! git grep --untracked -qE "amountOutMinimum:\s*0n" -- packages/grey-sweeper/src/`
- **Expected:** count = 7; bound greps exit 0.
- **Rationale:** an unbounded (`amountOutMinimum: 0`) swap is the classic sandwich-attack surface; scattered amount literals are how a cap or slippage constant silently drifts. One block, grep-countable, keeps the sizing math, the on-chain bound, and the sanity band mutually consistent. **`DEFAULT_GAS_RESERVE_WEI` joined the block at M5 Phase F FDQ-58 (native-ETH recovery reserve) — count 6 → 7.**
- **Established by:** M5 Phase F (count 7 at FDQ-58).

## 23. `channel-ingress-additive`
- **Statement:** every earning channel is a standalone process implementing the slim `ChannelIngress` interface (`start`/`stop`/`registerOffering`/`identity`) declared once in grey-core; grey-core is channel-agnostic below the seam (confirm/clearance/delivery are adapter-internal); adding a channel is purely additive (a new `adapters/<name>`, grey-core untouched). x402 (`x402Adapter`) and ACP (`acp-adapter`) are conformances #1 and #2 over the SAME shared `offeringHandlers`.
- **Verification:** `git grep -q "interface ChannelIngress" -- packages/grey-core/src/channels/ingress.ts && git grep -q "implements ChannelIngress" -- packages/grey-core/src/channels/x402Adapter.ts && git grep -q "implements ChannelIngress" -- adapters/acp-adapter/src/acpAdapter.ts && git grep -q "offeringHandlers" -- adapters/acp-adapter/src/main.ts`
- **Expected:** exit 0 (one interface; both channels conform; the ACP adapter reuses the shared handlers, never a private copy).
- **Rationale:** the value (verification pipeline) lives once in grey-core; channels are thin ingress shells. This is what made M6 a bounded add (ACP) rather than a fork, and what makes the next channel additive.
- **Established by:** M6 Phase A (interface + x402 conformance) / Phase C (ACP adapter).

## 24. `one-live-process-per-signer`
- **Statement:** at most ONE live process may hold a given signer at a time. The ACP signer `0xa966…` is held solely by `grey-acp-adapter` (its own systemd unit); the retired ElizaOS pm2 `grey` agent used the SAME signer and MUST NEVER co-run with the adapter. Proven load-bearing at FDQ-72 (a pm2 `cron_restart` silently re-onlined the stopped agent → a ~15h co-run on one signer until caught). Enforced structurally post-Phase-E: pm2 `grey` is deleted from the live list AND the saved dump; the systemd unit documents the rule.
- **Verification:** `git grep -qi "NEVER co-run" -- infra/systemd/grey-acp-adapter.service` (the unit encodes the rule); operationally, exactly one process serves `0xa966…` and the abort path (re-register `grey`) requires stopping the adapter first.
- **Expected:** the unit's never-co-run comment present; no second process on the signer.
- **Rationale:** two processes on one signer double-act on-chain (double setBudget/submit) — the M6 abort path (adapter ⇄ pm2 grey) is safe ONLY because the two never run together.
- **Established by:** M6 Phase D (reversible cutover) / hardened at FDQ-72.

## 25. `reversible-cutover-wallet-reuse`
- **Statement:** the ACP cutover REUSES the pre-existing Privy wallet `0xa966…` (and the on-chain ERC-8004 DID `did:erc8004:8453:58618`); identity is NEVER re-pointed or re-registered. The adapter's `identity()` returns that same `receivingAddress` + DID, so the Virtuals registration, Agent ID, and accrued history survive the cutover — and the cutover stays reversible (stop adapter ⇄ start the old agent, same wallet).
- **Verification:** `git grep -q "did:erc8004:8453:58618" -- adapters/acp-adapter/src/config.ts && git grep -q "receivingAddress: this.config.agentWalletAddress" -- adapters/acp-adapter/src/acpAdapter.ts` (the DID is a pinned literal; the receiver is the configured reused wallet).
- **Expected:** exit 0 (DID literal present; `identity()` surfaces the reused wallet).
- **Rationale:** re-pointing identity would forfeit the accrued Virtuals reputation and break the abort path; wallet reuse (Q6) is what makes the cutover reversible.
- **Established by:** M6 (Q6 ruling) / Phase D.

## 26. `grey_two-reputation-grants` (extends #the grey_two posture)
- **Statement:** the reputation tables `grey_two.{buyer_records,tracked_jobs}` are the FIRST grey_two tables that KEEP `UPDATE` (buyer status ladder + tracked-job resolution) but REVOKE `DELETE`/`TRUNCATE` from `grey_pipeline_rw` (FDQ-65 — the opposite of the append-only audit tables). Every runtime statement against them is `SELECT`/`INSERT`/`INSERT…ON CONFLICT DO UPDATE` — NEVER a destructive verb; status transitions are upserts, never delete-reinsert. `wpv_*` (the ElizaOS autognostic schema) remains untouchable.
- **Verification (grants):** the migration REVOKEs the destructive verbs — `git grep -qE "REVOKE DELETE, TRUNCATE\s+ON grey_two.buyer_records, grey_two.tracked_jobs" -- supabase/migrations/20260719140000_create_grey_two_reputation.sql`
- **Verification (no destructive SQL in the runtime):** `! git grep -qiE "\\b(DELETE|TRUNCATE)\\b" -- adapters/acp-adapter/src/reputation/reputationDb.ts` and no `wpv_` reference anywhere in the adapter: `! git grep -q "wpv_" -- adapters/acp-adapter/src/`
- **Expected:** grant grep exits 0; both anti-pattern greps exit 0 (no DELETE/TRUNCATE authored; no `wpv_` touch).
- **Rationale:** a stray DELETE errors at the grant (defense in depth), but authoring none keeps the reputation history append-and-transition-only and the ElizaOS schema off-limits.
- **Established by:** M6 Phase B (migration + FDQ-65) / Phase C′ (data layer).

## 27. `fail-open-earning-path`
- **Statement:** the reputation subsystem NEVER blocks or throws into the earning path. `evaluateAcceptance` fails OPEN on any DB error (returns `accept:true`) AND in shadow mode always accepts; the reconciliation sweep is fail-soft (tick-level + per-row) and NEVER signs; every gate/reconciler call site in the adapter is guarded (`if (this.reputationGate)` / wrapped) so a null or throwing collaborator degrades to exact "no gating" behavior.
- **Verification:** `git grep -q "accept: true" -- adapters/acp-adapter/src/reputation/buyerReputationGate.ts && git grep -q "if (this.reputationGate)" -- adapters/acp-adapter/src/acpAdapter.ts && ! git grep -qE "\\.(setBudget|submit|reject)\\(" -- adapters/acp-adapter/src/reputation/`
- **Expected:** exit 0 (fail-open return present; call sites guarded; the reputation subsystem issues zero on-chain signing calls).
- **Rationale:** reputation is an optional-by-construction overlay; a gating bug or DB blip must never cost a paid job. Shadow-then-enforce is safe because the block is a single-flag change over an already-fail-open path.
- **Established by:** M6 Phase C′ (gate) / FDQ-73 (reconciler).

## 28. `plain-node-patched-sdk`
- **Statement:** the adapter runs on PLAIN Node in production — no `tsx` runtime loader. The `@virtuals-protocol/acp-node-v2@0.0.4` SDK's bun-authored extensionless ESM is fixed at the root by a committed `pnpm patch` (adds `.js` to its relative imports), reapplied deterministically on every install. The heavy SDK tree stays out of the tsc graph via a variable-specifier dynamic import (`sdk.ts`), and the memory-tight VPS uses a filtered, swap-armed install that declines native builds (FDQ-69b).
- **Verification:** `git grep -q "ExecStart=/usr/bin/node adapters/acp-adapter/dist/main.js" -- infra/systemd/grey-acp-adapter.service && ! git grep -q "import tsx" -- infra/systemd/grey-acp-adapter.service && test -f patches/@virtuals-protocol__acp-node-v2@0.0.4.patch && git grep -q "const spec: string = ACP_SDK_SPECIFIER" -- adapters/acp-adapter/src/sdk.ts && git grep -qE "bufferutil: false" -- pnpm-workspace.yaml`
- **Expected:** exit 0 (plain-node unit, no tsx, patch present, variable-specifier import, native-build decline held).
- **Rationale:** a production runtime loader is heavier and masks the defect; the patch is root-cause, owned-in-repo, and fails LOUDLY on a version bump (`ERR_PNPM_UNUSED_PATCH`).
- **Established by:** M6 FDQ-70 (root-cause patch) / FDQ-69b (native-build decline).

## 29. `acp-terminal-event-gap-needs-reconciler`
- **Statement:** the ACP SDK NEVER delivers `job.expired` / `job.rejected` to the adapter's entry handler — `acpAgent.fireHandler` (the sole path, used by both live dispatch and startup hydration) hard-returns on `!shouldRespond`, and `jobSession.shouldRespond`'s `RESPONDERS` map omits `job.expired` and sets `job.rejected:[]`. There is no client-side expiry timer and the delivery poll is FUNDED-only. Therefore expiry-stiff detection REQUIRES the reconciliation sweep, which reads the authoritative on-chain `getJob` status (a `view`; `EXPIRED=5`) for stranded `submitted` rows past `expires_at` and resolves via the idempotent `onJobTerminal`. (FDQ-74: `expired` surfaces autonomously ~one keeper-window after `expiredAt`, no settlement tx.)
- **Verification:** `git grep -q "listExpiredSubmitted" -- adapters/acp-adapter/src/reputation/reputationDb.ts && git grep -q "reputationReconciler" -- adapters/acp-adapter/src/acpAdapter.ts && git grep -q "resolveIfSubmitted" -- adapters/acp-adapter/src/reputation/reputationReconciler.ts`
- **Expected:** exit 0 (the sweep source + wiring + idempotent resolve all present).
- **Rationale:** without the sweep, a funded-delivered-but-uncompleted job strands as `submitted` forever and the buyer-reputation ladder can never advance — a hard prerequisite for flip-to-enforce, discovered via dist inspection (FDQ-73) and proven live (#70352).
- **Established by:** M6 FDQ-73 (reconciliation) / FDQ-74 (expiry-semantics determination).

## 30. `agent-instance-key-isolated` (extends #17/#19)
- **Statement:** the mech agent-instance hot signing key `BASE_MECH_AGENT_INSTANCE_PRIVATE_KEY` is referenced ONLY under `adapters/mech-adapter/src/` (its dedicated loader, `agentInstanceSigner.ts`) — never in `packages/grey-core/src/`. Same isolated-hot-key shape as #17 (sweeper key, confined to `packages/grey-sweeper/`) and #19 (x402 relayer key, confined to `adapters/x402-middleware/`): every signing key in this repo has its import graph confined to the single package that owns it, so a grey-core compromise cannot reach any of them.
- **Verification:** `! git grep -qE --untracked "BASE_MECH_AGENT_INSTANCE_PRIVATE_KEY" -- packages/grey-core/src/ && git grep -lE --untracked "BASE_MECH_AGENT_INSTANCE_PRIVATE_KEY" -- adapters/mech-adapter/src/ | grep -q .`
- **Expected:** exit 0 (no match in `grey-core/src`; at least one match in `mech-adapter/src` — the loader itself).
- **Rationale:** BION-DIRECTIVE-38 — once wired to a live delivery trigger (separate, later work — not done by this directive), this key becomes signing authority over the service's real Safe multisig (threshold=1, confirmed live). grey-core is the buyer-facing HTTP surface and must never have a code path to construct it, same reasoning as #17/#19.
- **Established by:** BION-DIRECTIVE-38 (isolated key loader + Safe execTransaction signing/delivery capability built and fork-proven against real Base mainnet state; not yet wired to any live trigger — see mechAdapter.ts's "Signed delivery capability" file-header note).

## 31. `production-key-manual-transfer-only` (extends #17/#19/#30)
- **Statement:** a production hot signing key isolated by #17/#19/#30 (`GREY_AGENT_WALLET_PRIVATE_KEY`, `X402_RELAYER_PRIVATE_KEY`, `BASE_MECH_AGENT_INSTANCE_PRIVATE_KEY`) is NEVER extracted into an ad-hoc script or an agent's working context, regardless of the amount involved, the destination, or how disposable the reason seems — including funding a throwaway test wallet. Any transfer FROM a production signing wallet is executed personally by Forces, using his own separately-held access, never by handing the raw key to Kov's execution environment.
- **Verification:** procedural, no automated grep — #17/#19/#30's checks confine each key's import graph within COMMITTED code, but an ad-hoc script written to solve an immediate problem sits entirely outside that committed code, so those checks cannot see it. This invariant governs conduct in exactly that gap. Verified by discipline: a request to extract one of these keys for a one-off script is a hard stop, not a judgment call weighed against the amount at stake.
- **Rationale:** the isolation #17/#19/#30 establish only means something if it holds under inconvenient, well-intentioned exceptions too — "it's only $0.25" is exactly the kind of exception that erodes a blast-radius control one justified case at a time. Surfaced 2026-08-23 during the CDP Bazaar indexing investigation: Kov correctly declined to self-fund a $0.25 test settlement from `GREY_AGENT_WALLET`, checking invariant #17's own stated rationale before checking whether the wallet even had a balance to move, and flagged it for a standing decision rather than proceeding on the reasoning that a small enough amount would be harmless.
- **Established by:** CDP Bazaar indexing investigation, 2026-08-23 (Kov's own flag, ratified by Forces).

---

*Invariants 11–13 established at M3 close (grey-core); #11 replaced + #14/#15 appended at M3.5 close (live-compute fill). #16/#17/#18 appended at M4 close (ERC-8004 DID mint + sweeper). #19/#20 appended at M5 Phase C close (x402 middleware). #21/#22 appended at M5 Phase F close (relayer refuel loop). #23–#29 appended at M6 close (ACP `ChannelIngress` adapter cutover + ElizaOS decommission). #30 appended at BION-DIRECTIVE-38 close (mech agent-instance key isolation). #31 appended 2026-08-23, outside the movement-close cadence — a live operational incident during the CDP Bazaar investigation, ratified immediately rather than held for a future close. Future movements append at their close, not mid-flight, except where an incident like #31 warrants otherwise. Invariant #3 was retargeted src → dist at M5 Phase C (FDQ-37) to reflect the Phase B real-build flip — Phase B's close should have done this but ran only a partial invariant check (#13/#16–#18).*
