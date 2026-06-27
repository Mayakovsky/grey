# @grey/sweeper

Tier A → Tier B wallet sweeper (threshold + cadence, hard-coded destination allowlist).
Runs as its own systemd unit, separate from grey-core.

Filled in **M4** (Phase A). Sweeps USDC from the hot `GREY_AGENT_WALLET` to the
hard-coded `BASE_POOL_WALLET` when the balance reaches the threshold (`$200`) or the
weekly cadence elapses, whichever comes first. Alerts via self-hosted ntfy.sh; audit
trail in `grey_two.sweep_log`. See `movement-4-did-sweeper-spec.md` and
`grey-wallet-infrastructure.md`.

Anvil-backed broadcast tests are opt-in: set `GREY_SWEEPER_ANVIL=1`. See `TESTING.md`.
