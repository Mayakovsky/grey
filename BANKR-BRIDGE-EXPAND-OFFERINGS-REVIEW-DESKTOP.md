# Bankr Bridge Expand-Offerings — Desktop Review — branch `bankr-bridge-expand-offerings` @ `71c90d2`

**From:** Desktop · **To:** Kov / Forces · **Verdict: MERGE AND DEPLOY — full clearance, all steps.**

## Method

Pulled the branch directly (`git diff main...bankr-bridge-expand-offerings`, 10 files / 751 insertions / 6 deletions — matches the report exactly) and read every changed file in full against the actual `offerings.ts` PAID array, `packages/grey-schemas/src/pricing/table.ts`, and each real handler in `packages/grey-core/src/handlers/`. Did not take the build report's claims on faith anywhere I could check them myself.

One limitation, disclosed rather than papered over: I could not re-execute `vitest` myself in this sandbox — `node_modules` here is missing the `@rollup/rollup-linux-x64-gnu` native optional dependency (classic npm/pnpm optional-deps platform mismatch) and the sandbox's write permissions block fixing it in place (`EPERM` on pnpm's temp-file unlink). This is an environment gap on my end, unrelated to the branch. I did verify the reported count is internally consistent: 5 new slugs × 8 parametrized assertions = 40 new tests, 155 + 40 = 195, matching both the report and the actual `describe.each` block I read in the test diff. I'm treating Kov's pasted `vitest run` output as real command output (it reads as one — exact file/test counts, not a prose claim), not as an unverified assertion.

## grey-core — verified directly, clean

- `BANKR_BRIDGE_SLUGS` now equals `offerings.ts`'s `PAID` array exactly (`legitimacy_scan`, `verify_whitepaper`, `verify_full_tech`, `claim_extraction`, `claim_history`, `quick_protocol_facts`) — confirmed by reading both arrays side by side, not just the comment.
- Trust-rung exclusion checks out against `packages/grey-schemas/src/pricing/table.ts`'s own comments (`legitimacy_scan_trust_rung` gated by its own `trustRungEnabled()` flag, separate from `PAID`/enabled) and Kov's report shows a live `ssh` + `grep /etc/grey/grey-core.env` confirming `TRUST_RUNG_ENABLED` is unset right now — not last week's state, checked for this review.
- `daily_tech_brief` / `daily_greenlight_list` / `scam_alert_feed` correctly excluded — verified `enabled: false` on all three directly in `table.ts`. `prediction_market_research` / `resolution_evidence_compiler` correctly excluded — verified the "always returns NOT_YET_ANALYSED, no cache pipeline" comment directly in `table.ts`.
- Route registration loop untouched — read the full file; the change is exactly the array literal, nothing else. Secret check (`secretsMatch`, `unauthorized`) is byte-identical to what's already live for `legitimacy_scan`.
- `legitimacy-scan/index.ts` deliberately left as `return await res.json();` (unwrapped) — confirmed by reading it directly; the 5 new handlers all use `Response.json(await res.json())`. Harmless divergence, not a defect — Bankr auto-wraps plain objects either way, per the report's own correction.

## integrations/bankr-bridge — verified directly, no placeholders

- All 5 new handlers (`verify-whitepaper`, `verify-full-tech`, `claim-extraction`, `claim-history`, `quick-protocol-facts`) read in full: correct required-field check per offering (`token_address`, `token_address`, `whitepaperUrl`, `projectIdentifier`, `projectQuery` respectively), correct `POST /v1/bridge/bankr/<snake_slug>` target, correct env vars, zero `@grey/*` imports (matches the "deletable, zero blast radius" claim).
- Cross-checked those required fields against the actual handler implementations in `packages/grey-core/src/handlers/` (`verify_whitepaper.ts`, `verify_full_tech.ts`, `claim_extraction.ts`, `claim_history.ts`, `quick_protocol_facts.ts`) — every field name matches what the real handler reads from `input.requirement`, not a guess.
- `bankr.x402.json`: read all 5 new entries in full. Prices (`1.50`/`3.00`/`0.75`/`0.25`/`0.30`) match `PRICING_TABLE.canonicalUsd` exactly. Output schemas cite real files/line ranges (`GreyResponseEnvelope.d.ts`, `@grey/schemas/src/index.ts` line ranges, the `allOf` inheritance chain `verify_full_tech → verify_whitepaper → legitimacy_scan`) — spot-checked the inheritance claim against the schema descriptions themselves, internally consistent.
- Test diff: the new `describe.each` block mirrors the original 8-assertion shape per slug, with per-slug payloads matching each offering's real input shape (not defaulted to `token_address`). No hand-copied prose, no gaps I could find.

## Overall verdict: MERGE AND DEPLOY

No external blocker. Full sequence cleared:

1. **Merge `bankr-bridge-expand-offerings` → `main`.**
2. **VPS deploy of grey-core.** `GREY_BANKR_BRIDGE_SECRET` is already live in production — this makes the 5 new internal routes reachable-but-still-secret-gated, not exploitable (secret requirement unchanged, nobody outside Grey's own Bankr-side proxies knows to call them). Safe to deploy immediately.
3. **`bankr x402 deploy <kebab-slug>` for each of the 5**, from `integrations/bankr-bridge` — same authenticated session as `legitimacy-scan`, no new account or secret.
4. **Verify each** exactly like the `legitimacy-scan` runbook: `bankr x402 schema <url>` matches; unauthenticated `curl -i -X POST <url>` returns a clean `402` with correct price/network/asset/`payTo`.
5. One status report, same convention as prior runbook status reports — please include the raw `vitest run` output again in that report (not just the summary line) since I couldn't reproduce it myself this round; if anything differs from the 23/195 you already reported, stop and flag it rather than deploying past it.

Go.
