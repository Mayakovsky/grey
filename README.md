# grey

Standalone TypeScript monorepo for **New Grey** — Whitepaper Grey's verification
pipeline and services for every surface beyond Virtuals ACP (x402 Bazaar, Olas,
direct B2B, …). ElizaOS Grey continues to serve Virtuals ACP separately and is
**not modified** by anything in this repo.

> **Status:** Movement 1, Step 1. Skeleton only — no functional code yet.
> Packages are empty scaffolds filled in later movements (see below).

## Layout

```
grey/
├── packages/
│   ├── grey-pipeline/      # Step 2 — verification pipeline as standalone TS (pure functions)
│   ├── grey-schemas/       # Step 3 — versioned JSON Schemas + TS types + OpenAPI for all offerings
│   ├── grey-core/          # Step 4 — HTTP service exposing offerings as routes
│   └── grey-sweeper/       # Step 6 — Tier A → Tier B wallet sweeper
├── adapters/
│   └── x402-middleware/    # Step 7 — x402-paid endpoint adapter
└── infra/
    ├── systemd/            # Step 8 — service unit examples
    ├── supabase/migrations # grey_two schema migration (created here; applied in Step 2)
    └── deploy/             # Step 8 — deploy notes
```

## Tooling

- **Node** 24 (pinned via `.node-version`; `engines.node >= 22`)
- **pnpm** 11 workspaces (via corepack; `pnpm-lock.yaml` is committed)
- **Turborepo** 2.x task runner
- **TypeScript** strict mode (`tsconfig.base.json`)
- **vitest** for tests (`vitest run`)
- **ESLint 9** (flat config) + **typescript-eslint** + **Prettier**

## Commands

```bash
pnpm install        # corepack provides pnpm 11; build scripts are NOT auto-run
pnpm typecheck      # tsc --noEmit across packages
pnpm lint           # eslint across packages
pnpm test           # vitest run across packages
pnpm build          # per-package build (no-op in Step 1)
```

**Build-script policy:** pnpm 11 blocks dependency install/postinstall scripts by
default. We do **not** use blanket approval (`dangerouslyAllowAllBuilds`). Any package
that needs to run code at install time is inspected and, if justified, added to an
explicit `pnpm.onlyBuiltDependencies` allowlist in `package.json`.

## Non-relationships (hard constraints)

- New Grey does **NOT** modify ElizaOS Grey (`plugin-acp` / `plugin-wpv`).
- New Grey **NEVER** writes to `wpv_*` tables (`wpv_whitepapers`, `wpv_verifications`,
  `wpv_claims`, `wpv_buyer_records`, `wpv_tracked_jobs`) — read-only for cache lookups.
- New Grey writes to the **`grey_two`** schema only.

## Companion docs

These live in the ElizaOS repo's `plugin-wpv/BUILD DOCS and DATA/` directory:

- `phase2-work-breakdown-kovsky.md` — the canonical score (movement/step plan)
- `grey-deployment-plan-v7.md` — strategic frame, V/R/I posture, offering catalog
- `grey-wallet-infrastructure.md` — wallet tier hierarchy + key-storage matrix
- `MOVEMENT-0-EXTENSION-CLOSEOUT.md` — state of ElizaOS Grey at handoff

## Forward direction (not yet built)

Virtuals ACP jobs are LLM-native chat rooms; a future movement (grey-core, Movement 3)
may make Grey conversational/up-selling inside job rooms via the SDK's
`toMessages()`/`availableTools()`/`executeTool()` loop. See the A2A comms forward notes
in `movement-1-new-grey-monorepo-AUDIT.md` (§10). Out of scope for Step 1/2.
