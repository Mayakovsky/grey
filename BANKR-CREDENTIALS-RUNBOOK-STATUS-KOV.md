# Bankr credentials runbook — status (Kov)

**Runbook:** `BANKR-CREDENTIALS-RUNBOOK.md` · **All 5 steps done. Live in production end-to-end.**

## Done

1. **API key** — authenticated: `npm install -g @bankr/cli` (v0.3.38, official package, verified via `npm view @bankr/cli` — OIDC-published from `bankr.bot`'s maintainer, not the unrelated `bankr` namesquat package found earlier this session). `bankr login --api-key ...` + `bankr whoami` confirmed: account `kidcopernicus@gmail.com`, EVM wallet `0xcf888f6a54d59c7c85855f4479aa1379ca2887a3`.
2. **Production secret** — generated fresh (distinct from `.env.bankr-bridge.local`'s local test value), stored at `.env.bankr-bridge-prod.local` (gitignored, `.env.*.local` pattern).
3. **Grey VPS** —
   - `main` merged (`bankr-bridge-build` → `main` @ `2982d43`), pushed to origin.
   - VPS (`ubuntu@44.243.254.19`, `/opt/grey/grey`): `git pull` to `2982d43`, `pnpm install --frozen-lockfile`, `pnpm run build` (`@grey/core` rebuilt, rest cache-hit), `GREY_BANKR_BRIDGE_SECRET` appended to `/etc/grey/grey-core.env`, `systemctl restart grey-core`.
   - **Verified live against production** (127.0.0.1:3002 on-box):
     - no header → `403`
     - wrong secret → `403`
     - correct secret + `{"token_address":"0x1f9840a85d5af5bf1d1762f925bdaddc4201f984"}` → `200`, real envelope, real cached Uniswap data (`cacheHit: true`)

Note: hit and fixed a self-inflicted issue along the way — `openssl rand -hex 32 > file` on Windows Git Bash left a trailing `\r` that `tr -d '\n'` didn't strip (65 bytes, not 64), corrupting the header once embedded in a remote SSH command. Regenerated with `printf '%s' "$(openssl rand -hex 32)"` (verified 64 bytes via `xxd`), fixed the one VPS env line in place, restarted, reverified. Not a grey-core bug — confirmed by the 200 above.

## Wallet question — resolved, was a false alarm

Earlier this session, a real live-tested finding looked like it blocked step 4: `payTo` config appeared to be silently ignored — 3/3 independent attempts (CLI deploy, redeploy, dashboard re-save) served `0x8AEE621035D93Deb3C0C1177fac252dC2dd501a0` in the live 402 challenge instead of the configured `payTo` (`0x394e81DA28799b578620803772FAeE403dE2d3f6`, Grey's wallet). First reported as a Bankr platform bug.

**Retracted on further investigation, prompted by Forces pushing back on the "bug" conclusion.** `0x8AEE...501a0` is `BankrFeeRouterV2`, a verified contract on Base (confirmed via `base.blockscout.com`'s API directly, not just a web summary: `is_verified: true`, `is_scam: false`). Its published source (`settleAndSplit`/`settleUptoAndSplit` → `_splitAndEmit`) atomically splits every payment: the endpoint owner's share (total minus Bankr's fee) goes to whatever `payTo` was configured, the fee goes to Bankr's own wallet — same transaction. The 402 challenge's `payTo` correctly names this settlement contract (the actual on-chain recipient of the initial transfer), not the final destination. So the directive's original premise (payTo = Grey's existing wallet, no new custody, no new key) holds after all — the mismatch was a misread of an unfamiliar intermediary, not a real problem. Confirmed independently by Forces/Desktop before clearing step 4.

## Step 4 — done, live

```
cd integrations/bankr-bridge
bankr x402 env set GREY_BANKR_BRIDGE_SECRET=<prod secret>   # done
bankr x402 deploy legitimacy-scan                            # done
```
Live URL: `https://x402.bankr.bot/0xcf888f6a54d59c7c85855f4479aa1379ca2887a3/legitimacy-scan`

## Step 5 — verified

- `bankr x402 schema <url>` — matches the built schema exactly, including the corrected output shape (full envelope, `payload` citing `@grey/schemas/src/index.ts:164-178`).
- `curl -i -X POST <url>` (no payment) — clean `402 Payment Required`, well-formed: correct price (`250000` = $0.25 USDC, 6 decimals), correct network (`eip155:8453`), correct asset (Base USDC `0x833589fc...`), `payTo` = `BankrFeeRouterV2` (expected, confirmed legitimate above).
- A real paid round-trip needs a funded caller wallet — per the runbook, that's a separate go/no-go, not attempted here.

grey-core's own route (step 3) stays dormant-safe regardless — only responds to requests carrying the correct bearer secret.

---
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
