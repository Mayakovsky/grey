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

## Untouchables
pm2 ElizaOS Grey (the units carry no coupling to it), ntfy/Caddy, and `wpv_*` are untouched by
this deploy.
