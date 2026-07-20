# @grey/acp-adapter

The **ACP marketplace as a grey-core `ChannelIngress`** (Movement 6). A standalone process that earns
through grey-core's shared offering handlers over Virtuals ACP — adapter #2 alongside the live x402
channel. Ported from plugin-acp's `AcpService` (earning path only) against structural SDK shapes.

## Build posture (deliberate — flagged in the M6 Phase C PR)

- **`tsc` build** (not esbuild-bundled), like `grey-sweeper` / `x402-middleware`. `.js` extensions on
  relative imports; ESM output run directly by node (`dist/main.js`).
- **The `@virtuals-protocol/acp-node-v2` SDK is a RUNTIME-ONLY external.** It is loaded in exactly one
  file (`src/sdk.ts`) via a variable-specifier dynamic `import()` so **tsc never statically resolves
  it** — the adapter core, its unit tests, the tier-1 offline smoke, and the dist build need **none**
  of the SDK's heavy transitive tree (`@account-kit` / `@alchemy` / `@privy-io` / `socket.io` — the
  tree that OOM'd the 1.9 GB VPS in M5). The adapter reaches the SDK only through the injected
  `AcpSdkBundle` seam; `main.ts` builds the real one, tests inject a fake.
- **The SDK is therefore NOT a `package.json` dependency.** It is installed on the box at deploy time,
  filtered + swap-armed + memory-checked, exactly as the ElizaOS agent has it:
  `pnpm --filter @grey/acp-adapter add @virtuals-protocol/acp-node-v2@^0.0.4` (or provision it into the
  adapter's `node_modules`). Building the dist needs none of it.

## Env (`/etc/grey/acp-adapter.env`)

| var | required | notes |
|-----|----------|-------|
| `ACP_AGENT_WALLET_ADDRESS` | yes | The ACP seller wallet `0xa966…` (Q6 — reused across the cutover). |
| `ACP_PRIVY_WALLET_ID` | yes | Privy wallet id (Virtuals Signers tab). |
| `ACP_PRIVY_SIGNER_KEY` | yes | Privy authorization key. **Secret** — never logged/reported. |
| `GREY_DATABASE_URL` | yes | `grey_pipeline_rw` runtime credential for the shared handlers. |
| `ANTHROPIC_API_KEY` | (live) | Read by `createHandlerDeps`; needed by the cache-miss live path. |
| `BASE_RPC_URL` | (live) | Chain reads for the discovery/crypto resolver. |
| `ACP_ADAPTER_OBSERVE_ONLY` | no | `true` → tier-2: subscribe + parse, **sign nothing** (FDQ-63 gate). |
| `ACP_ADAPTER_POLL_INTERVAL_MS` | no | Delivery poll backstop cadence (default 30000). |

## Proof tiers

- **Tier 1 — offline handler smoke** (committed): `pnpm -F @grey/acp-adapter tier1-smoke`. Synthetic
  funded entry → NL parse → shared `offeringHandlers['legitimacy_scan']` (cache hit, offline) →
  `{type:'object', value}` deliverable. No chain, no wallet, no SDK.
- **Tier 2 — observe-only SSE** (gated, touches the live wallet — run only after the FDQ-63 safety
  report + a go): `ACP_ADAPTER_OBSERVE_ONLY=true`.
- **Tier 3 — first real job** = Phase D (cutover; not this phase).

## Deploy (Phase D — do NOT activate in Phase C)

`infra/systemd/grey-acp-adapter.service` ships installed-but-**disabled**. Becoming the seller is
Phase D (stop pm2 `grey`, then start this). **Never co-run** the two — same signer → on-chain
double-action.
