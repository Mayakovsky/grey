# EXPANSION E2 — FINAL MERGE + DEPLOY — KOV DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-05). Diff reviewed directly, approved, no changes requested. This closes out E2.

**Scope: merge AND deploy this time — not merge-only.** Reasoning, stated directly rather than left implicit: this diff has zero Base behavior change and doesn't unlock anything Kite-specific (E2-D/OD-7 is dormant, no live Kite payment route exists yet), so there's no *functional* urgency on its own. But this is also the point where E2's chapter closes and attention moves to E1/E3 — letting deploy drift accumulate indefinitely with nothing else specifically scheduled to trigger a future redeploy is worse than closing the loop now, while everyone's still oriented on E2. Deploy so production matches `main` cleanly at the seal point.

## Review verdict on `review-e2-wrap-checks-g4-rpc-fallback.diff`

Approved as written, no changes requested:
- `defaultRpcFallbackUrl: string | string[]` — Base stays a plain string (byte-identical, single fallback leg), Kite becomes the four-endpoint array. `.flat()` in `clients.ts` handles both shapes without a runtime type branch — clean.
- Inline comment trail explains the G4 reasoning for whoever reads this file next.
- `registry.test.ts` golden-value update matches the new array shape exactly.
- 115/115 passing, `tsc --noEmit` clean, per your report.

One small fix made directly rather than round-tripped: `EXPANSION-E2-SUMMARY.md` referenced a `§3.5.2`/`ADDENDUM.md` that doesn't exist — corrected to point at the real `§3 E2-C` / `§5.2 OD-7` sections. Nothing else in your summary changed; it's accurate.

## Task 1 — Push and open the PR

`expansion-e2-wrap-g4-rpc-fallback` isn't pushed and has no PR yet. Push it, open the PR against `main`.

## Task 2 — Merge

Merge into `main`. Same convention as PRs #46/#47.

## Task 3 — Deploy

Deploy to the VPS. Confirm post-deploy:
- Live health check reflects the new commit.
- No observable behavior change on Base's live routes in production — byte-identical was the whole point of this refactor; verify it held outside of tests too.
- Sweeper/relayer processes restart cleanly if they load anything from `clients.ts`/`registry.ts` at boot.

## Task 4 — Tag/seal confirmation (no action, just confirm)

`e2-cd`'s Bion status and `EXPANSION-E2-SUMMARY.md` / the `movement-e2-kite-abstraction-baseline` tag don't move with this merge — this diff is a wrap-check fix layered on top of the already-sealed baseline, not part of what got sealed. Confirm in your report that the tag still points at `e51665a` (the E2-BE merge commit), not accidentally re-pointed at this new one.

## Deliver

Report: PR number, merge commit hash, deploy confirmation (health check output, timestamp), and confirmation the tag is untouched. This closes E2 — no further directive expected on it unless something regresses.
