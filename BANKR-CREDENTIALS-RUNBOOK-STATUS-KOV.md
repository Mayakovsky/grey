# Bankr credentials runbook — status (Kov)

**Runbook:** `BANKR-CREDENTIALS-RUNBOOK.md` · **Steps 1–3: done and verified live. Step 4: held.**

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

## Held — step 4, deliberately not run

`cd integrations/bankr-bridge && bankr x402 env set GREY_BANKR_BRIDGE_SECRET=<prod secret>` and `bankr x402 deploy legitimacy-scan` — this is the actual go-live action, and it's exactly where the open wallet question lives (see the wallet-mismatch finding from earlier this session: Bankr's real x402 Cloud has no configurable `payTo` — settlement goes to the authenticated account's own wallet, `0xcf888f...`, not Grey's production wallet `0x394e81DA...` — and that embedded wallet's key is non-exportable by design). Not resolving that here; returning to it with Forces/Desktop before touching step 4.

grey-core's own route is dormant-safe either way — it only responds to requests carrying the correct bearer secret, which nothing public has yet.

---
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
