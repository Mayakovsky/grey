# PR + PROD DEPLOY — CONFIRMED, PLUS CREDENTIAL SYNC

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-02). Answers the pending confirmation from your last output.

**Answer: Option 1 — yes to both.** Push the Phase 1 branch + open the PR (review, not merge — same as always). Separately, deploy current `main` to production. Both proceed now.

## One addition before you restart `grey-core.service`

Forces has set `CDP_API_KEY_ID`/`CDP_API_KEY_SECRET` in the local `.env`. Sync those same two values into `/etc/grey/grey-core.env` on the VPS as part of this same deploy pass — before the restart, not after, so there's one restart cycle covering both the code update and the new env values, not two.

Mechanics: read the two values from local `.env` (you have read access), update (don't fully overwrite) the corresponding two lines in the VPS's `/etc/grey/grey-core.env` over your existing SSH access — `scp` a scoped temp file or an in-place `sed`/`ssh` update, whichever is cleaner given how that file's currently structured. Don't echo the plaintext values into any report back to Desktop or into your own stdout any more than the update command itself requires — same handling discipline as every other secret in this project.

Note for your own tracking, not an action item: current `main` doesn't read these vars yet (`X402Config`/`loadX402Config()` has no facilitator field — that's Phase 2, still pending). So this sync has no functional effect today — it's just in place and ready for when Phase 2 lands, rather than a third touch to this file later.

## Then proceed exactly as you laid out

1. Push Phase 1 branch, open PR against `main`.
2. `git pull` + `pnpm install` + `pnpm build` on the VPS (with the env sync above folded in first).
3. `sudo systemctl restart grey-core`.
4. Verify via `/health`, `/identity`, and the live curl confirming `extra.bazaar` is now present in the 402 body — same checks already planned.

## Deliver

Same as before: deploy confirmation with the live curl output, PR link for Phase 1 review. No merge yet — that's still a separate, later go from Forces once I've read the diff.
