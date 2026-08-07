# CDP Portal — Fix the 401, Runbook for Forces

**For:** Forces, personally — this is Portal work, not something Kov or Desktop can do. **From:** Claude Desktop, 2026-08-03.
**Context:** value-integrity confirmed clean (byte-identical, SHA-256 matched, both sides) — the 401 is real, not a transfer bug. Two candidate causes, check in this order.

## Step 1 — Confirm where the call actually comes from, before touching anything

Kov's Task 3 test calls run **from the VPS** (`44.243.254.19`) — that's the IP the key's allowlist was set to when it was created. If for some reason Kov tested from a different machine, the allowlist would reject it regardless of whether the key itself is fine, and you'd chase the wrong fix. Confirm this with Kov if there's any doubt before proceeding — otherwise, proceed assuming `44.243.254.19` is correct.

## Step 2 — Check the key type

`portal.cdp.coinbase.com` → correct project selected → **API keys** in the left nav. There are two tabs: **Secret API Keys** and **Client API Keys**. Server-side Platform API calls (which is what this is) need a **Secret** key. If the key that got generated and staged is actually a Client key, that alone is the whole bug — Client keys are scoped for browser/client-side use and will 401 on Platform API server calls regardless of anything else being right.

If this is the problem: generate a new key correctly from the **Secret API Keys** tab this time (same steps as before — nickname, IP allowlist to `44.243.254.19`, default Ed25519 signature algorithm), and skip to Step 4.

## Step 3 — If the key type is already correct, check the IP allowlist specifically

Click into the existing key's details. Confirm the allowlist field actually contains `44.243.254.19` — not blank (which some APIs treat as "no restriction," others as "allow nothing," so don't assume blank means unrestricted), not a typo, not a stale IP from before the VPS's current address. If it's wrong, edit it directly rather than regenerating — no need to make a new key just to fix an allowlist entry, unless the Portal doesn't support editing an existing key's restrictions (some providers require regeneration for security-sensitive fields — check what's actually editable before assuming either way).

## Step 4 — If you regenerated or edited the key, get the new values to both places

Same two files as before, same care as last time — don't paste the actual values into chat with me:
- Local: `C:\Users\kidco\dev\grey\.env`
- Production: `/etc/grey/grey-core.env` on the VPS

You can do this yourself the same way as the original walkthrough, or hand it back to Kov with a short instruction to re-sync — either is fine, just don't leave the two files holding different values than what you just fixed in the Portal.

## Step 5 — Validate before re-running the full Task 3 cycle

Before having Kov re-attempt the whole testnet settlement flow, get a cheap yes/no first: from the VPS itself (SSH in, don't test from your local machine — it isn't on the allowlist and would 401 regardless of whether the fix worked), hit a simple authenticated CDP Platform API endpoint and confirm you get something other than a 401. This confirms the credential works before spending a full settlement-cycle test on it.

## Step 6 — Signal Kov to resume

Once Step 5 comes back clean, tell Kov directly to resume Task 3 of `CDP-FACILITATOR-PHASE2-FULL-RUN-KOV-directive.md` — no new directive needed from me for that, the original one already covers what happens next once the block clears.
