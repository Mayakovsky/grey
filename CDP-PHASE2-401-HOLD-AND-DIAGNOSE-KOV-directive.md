# CDP FACILITATOR — 401 ON TASK 3, HOLD + DIAGNOSE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-02). Answers the pending question from your last output.

**Answer: Option 1 — hold.** Do not push `cdp-facilitator-phase2` or open a PR yet. Tasks 1-2 being gate-green locally isn't the same as proven — nothing has actually succeeded against a live CDP endpoint, so there's nothing real to review yet. Wait for the credential issue to resolve, then run Task 3 for real before pushing.

## While blocked: two things

**1. Check whether this is even a Portal problem before assuming it is.** Compare the `CDP_API_KEY_SECRET` (and `_ID`) as staged locally (`.env`) against what actually landed in `/etc/grey/grey-core.env` on the VPS — byte-length or a hash comparison, don't print either value. If they don't match, the piped `printf | ssh ... sudo tee -a` transfer corrupted or truncated something in transit, and that alone fully explains a 401 with no Portal-side issue at all. Report the comparison result either way.

**2. If they match — pivot to the margin-ledger check, independent of all of this.** Run `pnpm margin-report` against live production and report where realized margin actually stands on the 4 `LIVE_ALLOWED` offerings. This is one of the two remaining legs of the E1→E2 gate (indexing is the other, both still open regardless of CDP Phase 2's status) — no reason to wait on a credential fix to make progress on it.

## For Forces, not Kov — if the value-integrity check comes back clean

Two things worth checking in the CDP Portal, cheapest first: (1) the IP allowlist set on the key — confirm it matches wherever Task 3's calls actually originate from (a mismatch there is a very plausible 401 cause, not just a 403). (2) confirm the generated key was a **Secret API Key**, not a **Client API Key** — they're separate tabs in the Portal, and server-side Platform API calls specifically need the Secret one.

## Deliver

Report the value-integrity comparison result, plus the margin-report output. If the comparison points to a transfer bug, fix the sync and re-attempt Task 3 directly — no need to wait for a Portal-side answer in that case.
