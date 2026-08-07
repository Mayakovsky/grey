# Deployment — grey-core + grey-sweeper (Movement 5)

grey-core and grey-sweeper deploy as two **independent** systemd units on the VPS, alongside
(never coupled to) ElizaOS Grey's pm2 process. **No CI auto-deploy.** Testnet config this phase
(`X402_NETWORK=eip155:84532`); the mainnet flip + the sweeper enable are Phase E.

## Layout
- Repo checkout: `/opt/grey/grey` (this monorepo, at the reviewed merge SHA)
- Units: `/etc/systemd/system/grey-core.service`, `/etc/systemd/system/grey-sweeper.service`
  (copied from `infra/systemd/`)
- Env files (root-only `600`, Forces-authored on-box): `/etc/grey/grey-core.env`,
  `/etc/grey/sweeper.env` — see `.env.example` for the expected keys. Secrets never in the repo.

## Deploy / update
```bash
cd /opt/grey/grey
git pull                                  # to the reviewed merge SHA
pnpm install --frozen-lockfile
pnpm run build                            # emits every package's dist/ (incl. grey-core/dist/start.js, grey-sweeper/dist/main.js)

# On unit-file change only:
sudo cp infra/systemd/grey-core.service infra/systemd/grey-sweeper.service /etc/systemd/system/
sudo systemctl daemon-reload

# Restart the running service(s). grey-core ONLY until Phase E enables the sweeper:
sudo systemctl restart grey-core
```

## Verify
```bash
systemctl status grey-core --no-pager
curl -s http://127.0.0.1:3002/health       # {"status":"ok",...}
curl -s http://127.0.0.1:3002/identity      # {"did":"did:erc8004:8453:58618",...}
# paid route without payment -> 402 strict-canonical PaymentRequirements:
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'content-type: application/json' \
  -d '{"projectIdentifier":"Uniswap"}' http://127.0.0.1:3002/v1/offerings/claim_history
journalctl -u grey-core -n 50 --no-pager
```

## Sweeper — DISABLED until Phase E
grey-sweeper installs but stays **disabled + stopped**. Do NOT `systemctl enable`/`start` it before
the Phase E cutover — it holds Tier-A signing capability and moves real USDC. Enable is Phase E's
final act (mainnet, after the live paid-request smoke).

## Firewall
Port 3002 stays **firewalled** this phase — verify via on-box `curl` / SSH tunnel only. Public
exposure of the paid API (Caddy reverse proxy in front is a candidate) is a Phase E decision.

## Known operational constraints — local machine vs. VPS

These aren't obvious from the code and have cost real debugging cycles when assumed away. Check
this section before writing off an unexpected auth failure as a credentials/signature bug.

- **CDP's facilitator API keys (`CDP_API_KEY_ID`/`CDP_API_KEY_SECRET`) are IP-allowlisted to the
  VPS (`44.243.254.19`).** Any *direct* call to `api.cdp.coinbase.com/platform/v2/x402/...` using
  those production credentials — bypassing `grey-core`, e.g. a standalone diagnostic script — must
  run **from the VPS itself**, not from a local dev machine. Discovered 2026-08-07
  (`CDP-BAZAAR-EXTENSION-RESPONSES-CHECK-REPORT-KOV.md`): an otherwise well-formed request from a
  local machine got a plain `401 Unauthorized`; the identical script run from `/opt/grey/grey` on
  the VPS succeeded immediately. This does **not** apply to `grey-core`'s own normal operation —
  it already always calls CDP from the VPS by construction, since that's where it runs. It only
  matters for one-off scripts written to hit CDP's facilitator directly.
- **SSH access to the VPS is per-machine, not shared.** Forces' local Windows/PowerShell SSH client
  and Kov's own environment can have entirely different keys configured (or none). Don't assume
  working SSH from one machine implies it from another — confirm per-machine, and if one path is
  blocked (e.g. `Permission denied (publickey)`), route the task through whichever
  machine/actor already has confirmed working access rather than debugging key setup mid-task.
- Port 3002 stays firewalled off-box (see Firewall, above) — same underlying pattern: some things
  are only reachable/authorized from the VPS's own vantage point, not from wherever a human or Kov
  instance happens to be running.

## Untouchables
pm2 ElizaOS Grey (the units carry no coupling to it), ntfy/Caddy, and `wpv_*` are untouched by
this deploy.
