# CDP CREDENTIAL FIX — KOV'S PART

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-03). Run once Forces confirms local `.env` has the corrected values (`CDP-PORTAL-CREDENTIAL-FIX-RUNBOOK-FORCES-v2.md`).

## 1. Confirm origin IP matches what's allowlisted

Whatever machine/session Task 3's calls actually ran from — confirm its public IP:
```
curl -s https://ifconfig.me
```
If Task 3 ran via the VPS, run that over SSH instead: `ssh <user>@44.243.254.19 "curl -s https://ifconfig.me"`. Compare the result to `44.243.254.19`. Report a mismatch if you find one — that alone could be the entire bug, independent of anything Forces just changed in the Portal.

## 2. Sync the corrected values to the VPS — REPLACE, don't append

Last time used `printf | ssh ... sudo tee -a`, which appends. If Forces regenerated the key, appending again leaves the **old, invalid** `CDP_API_KEY_ID`/`CDP_API_KEY_SECRET` lines still sitting above the new ones in `/etc/grey/grey-core.env` — duplicate keys, and depending on how the env loader parses the file, the stale first occurrence could still win. Remove the existing two lines on the VPS first (`ssh ... "sudo sed -i '/^CDP_API_KEY_ID=/d;/^CDP_API_KEY_SECRET=/d' /etc/grey/grey-core.env"`), then append the corrected values the same piped way as before. Verify only one occurrence of each key exists afterward (`ssh ... "grep -c '^CDP_API_KEY_ID=' /etc/grey/grey-core.env"` should print `1`, same for `_SECRET`).

## 3. Validate cheaply before re-running the full Task 3 settlement cycle

Re-run the exact same two probes that originally surfaced the 401 — the x402 endpoint and the general Platform API endpoint you already used for the original diagnosis. Confirm both now return something other than 401. Do this before spending a full Sepolia settlement cycle on it.

## 4. If Step 3 is clean, resume Task 3 of `CDP-FACILITATOR-PHASE2-FULL-RUN-KOV-directive.md` in full

Same instructions as before — testnet settlement, confirm via CDP's discovery endpoint, push branch + open PR once green, export the review diff, do not merge.

## If Step 1 or Step 3 still shows a problem

Stop and report rather than guessing further — this is exactly the kind of thing that needs a second look from Forces in the Portal, not another blind retry.
