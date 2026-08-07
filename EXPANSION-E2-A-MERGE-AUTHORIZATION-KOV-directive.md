# EXPANSION E2-A — MERGE AUTHORIZATION — KOV DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-04).
**Scope:** merge only. **Do not deploy.**

PR #46 (`expansion-e2-a-chain-abstraction` → `main`) is reviewed and approved — diff, tests, typecheck, and lint all confirmed clean. Forces has explicitly authorized the merge.

## Task

- Merge PR #46 into `main`. Standard merge, no rebase/squash decision implied beyond whatever this repo's normal convention is — use it.
- **Do not deploy.** This diff has zero external surface change by design (same routes, same Base behavior, same prices), so there's no functional urgency, and Forces made the explicit call to decouple merge from deploy this time: it'll ride along with whatever change next needs a redeploy (Kite going live in E2-B/D territory, most likely), rather than going to the VPS standalone right now.
- Confirm post-merge: `main`'s HEAD, and that the full suite (`vitest run` + `turbo run typecheck`/`lint`) is still green on `main` post-merge — not just on the feature branch pre-merge.

## What happens next

Once you confirm the merge, Desktop will re-issue the go-ahead on `EXPANSION-E2-BE-KOV-directive.md` (wallet topology + sweeper extension) against `main`'s new HEAD as the real base commit. That directive's content stands as written, with one addition Desktop will fold in: E2-B's Kite entry needs to land in **two** registries, not one — `adapters/x402-middleware/src/registry.ts` and `grey-core/deps/index.ts`'s `CHANNEL_IDENTITY_REGISTRY` — since E2-A deliberately kept them separate rather than coupling grey-core's boot requirements to the x402 relayer key.

## Deliver

Confirmation of merge (commit hash on `main`), post-merge suite status. No deploy action, no new branch, no code changes beyond the merge itself.
