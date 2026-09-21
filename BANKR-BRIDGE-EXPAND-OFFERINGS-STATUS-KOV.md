# Bankr Bridge — Expand Offerings — Go-Live Status (Kov)

**Directive:** `BANKR-BRIDGE-EXPAND-OFFERINGS-KOV-directive.md` · **Review:** `BANKR-BRIDGE-EXPAND-OFFERINGS-REVIEW-DESKTOP.md` (MERGE AND DEPLOY, full clearance) · **All 6 offerings now live in production end-to-end.**

## Raw `vitest run` output — fresh, post-merge (per Desktop's request)

Re-ran on `main` after the merge, not just on the feature branch, since Desktop couldn't reproduce it in their sandbox and asked to flag any divergence rather than deploy past it. **No divergence — 23/195, identical to the branch report.**

```
 Test Files  23 passed (23)
      Tests  195 passed (195)
```
Full file breakdown: `bankrBridge.test.ts` 48 tests (8 legitimacy_scan + 8×5 new slugs), all other 22 files unchanged from the pre-merge baseline. `tsc --noEmit`: clean.

## Sequence executed

1. **Merged** `bankr-bridge-expand-offerings` → `main` (`f5ff7b4`) — 10 files, 751 insertions, matches the review's stat exactly.
2. **VPS deploy**: `git pull` to `f5ff7b4`, `pnpm install --frozen-lockfile`, `pnpm run build` (`@grey/core` rebuilt), `systemctl restart grey-core`. No env changes needed — reused the already-live `GREY_BANKR_BRIDGE_SECRET`.
3. **Verified all 5 new bridge routes on the VPS** (127.0.0.1:3002, correct secret): `verify_whitepaper` 200, `verify_full_tech` 200, `claim_extraction` 200, `claim_history` 200, `quick_protocol_facts` 200.
4. **Bankr-side deploy**, `bankr x402 deploy <kebab-slug>` × 5, same authenticated session as `legitimacy-scan` (no new account/secret):
   - `verify-whitepaper` → `https://x402.bankr.bot/0xcf888f6a54d59c7c85855f4479aa1379ca2887a3/verify-whitepaper` — $1.50
   - `verify-full-tech` → `.../verify-full-tech` — $3.00
   - `claim-extraction` → `.../claim-extraction` — $0.75
   - `claim-history` → `.../claim-history` — $0.25
   - `quick-protocol-facts` → `.../quick-protocol-facts` — $0.30
5. **Verified each**, per the runbook pattern:
   - `bankr x402 schema <url>` — all 5 match the built schema exactly (input fields, output shape, price).
   - Unauthenticated `curl -X POST <url>` — all 5 return a clean `402 Payment Required` with correct `maxAmountRequired`/`amount` (atomic units matching each price), `network: eip155:8453`, `asset` = Base USDC, `payTo` = `BankrFeeRouterV2` (`0x8AEE621035D93Deb3C0C1177fac252dC2dd501a0` — confirmed legitimate this session, see `BANKR-CREDENTIALS-RUNBOOK-STATUS-KOV.md`).
6. `bankr x402 list` — all 6 offerings `active`, correct prices, `0 reqs`/`$0 earned` (nothing paid yet, as expected — no real caller has hit them).

## Not done (deliberately, same posture as `legitimacy-scan`)

A real paid round-trip against any of the 5 needs a funded caller wallet — separate go/no-go, not attempted here.

---
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
