# Bankr Bridge — credential runbook (Forces → Kov handoff)

**From:** Claude Desktop · **To:** Forces / Kov · **Corrects:** `BANKR-BRIDGE-REVIEW-DESKTOP.md`

## Correction first

The Response-wrap "fix" I sent Kov in the review is wrong — retract it. Bankr's own docs (`docs.bankr.bot/x402-cloud/quick-start`, verified live): *"You can return plain objects, strings, or any JSON-serializable value — Bankr auto-wraps them into a JSON response. You can also return a full Response object if you need to set custom status codes..."* Kov's original `return await res.json();` in `integrations/bankr-bridge/x402/legitimacy-scan/index.ts` is correct as written against Bankr's real runtime contract. I inferred a `Response`-only contract from the two error paths without checking Bankr's docs first — that was speculation, not verification. **Kov: skip that fix, no change needed to `index.ts`.**

## What's actually needed to go live

Confirmed live against `docs.bankr.bot` (CLI reference, x402 Cloud quick-start, security page).

### 1. Bankr API key — Forces generates it (done, per 2026-09-19 16:40 handoff)

x402 Cloud's own auth model (Bankr's Security page): *"All endpoint management operations (deploy, configure, pause, delete, env vars) require authentication via your Bankr API key"* — no separate x402-specific permission flag. Wallet API / Agent API / Token-Launch API / LLM Gateway are unrelated surfaces this integration never touches.

Key generated at bankr.bot/api-keys, handed to Kov out-of-band. If not already scoped this way, recommended settings: Wallet API off, Agent API off, Token-Launch API off, LLM Gateway off (default), read-only off.

### 2. Kov, with the key in hand

```bash
npm install -g @bankr/cli        # if not already present
bankr login --api-key bk_YOUR_KEY
bankr whoami                     # confirm connection before anything else
```

### 3. Production bridge secret (distinct from Kov's local test secret)

```bash
openssl rand -hex 32             # generate fresh — do not reuse .env.bankr-bridge.local's test value
```

Set it in both places it needs to land:
- Grey's VPS env: `GREY_BANKR_BRIDGE_SECRET=<value>` — enables the grey-core route (cleared to merge + deploy per `BANKR-BRIDGE-REVIEW-DESKTOP.md`). Do this *before* step 4, or Bankr's proxy gets 403s once live.
- Bankr's encrypted env store, run from the project directory so it's scoped to this service:
  ```bash
  cd integrations/bankr-bridge
  bankr x402 env set GREY_BANKR_BRIDGE_SECRET=<same value>
  ```

### 4. Deploy

```bash
cd integrations/bankr-bridge
bankr x402 deploy legitimacy-scan
```

Output gives the live URL (`https://x402.bankr.bot/<wallet>/legitimacy-scan`).

### 5. Verify before calling it done

```bash
bankr x402 schema https://x402.bankr.bot/<wallet>/legitimacy-scan   # sanity-check the published schema
curl -i https://x402.bankr.bot/<wallet>/legitimacy-scan             # no payment -> expect a 402 challenge back, not a 500
```

A real paid round-trip needs an actual funded caller wallet — separate go/no-go once the 402 challenge itself looks right.

## Order of operations

1. Forces generates the API key (web) -> hands to Kov out-of-band. **Done.**
2. Kov: `bankr login --api-key ...`, generate the production secret.
3. Grey VPS: merge `bankr-bridge-build` to `main`, deploy, set `GREY_BANKR_BRIDGE_SECRET` in the VPS env — route goes live but stays 403 to everyone without the secret.
4. Bankr side: `bankr x402 env set` with the same secret, then `bankr x402 deploy legitimacy-scan`.
5. Verify with the unpaid 402-challenge check above.
