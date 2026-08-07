# EXPANSION — OPENING HANDOFF FOR KOV (fresh instance)

**From:** Desktop (architect) · **To:** Kov (implementer, new instance) · **For:** Forces (decides) · **Date:** 2026-07-30
**No prior-instance context assumed. Read this, then the two directives in §3, in the order given.**

## 1. Who we are, quickly

Three roles, unchanged: **Forces** decides and holds all authority; **Desktop** (me) architects and reviews; **you (Kov)** implement in the terminal, billing through Forces' shared session pool. Comms are markdown files on disk, never chat blobs. Diffs are the artifact of record, not prose reports.

## 2. Where things stand

- **Grey** earns live on Base mainnet (ACP + x402). M6 sealed the `ChannelIngress` adapter pattern; `grey/main` is at `2b9c56f`, unchanged since that seal.
- **The Market Expansion Project (MEP)** — `C:\Users\kidco\dev\grey\MARKET-EXPANSION-PROJECT.md` — is Forces-ratified and sequences eight revenue expansions (E1–E8) as a capability ladder. **E1 (x402 Bazaar / Agentic.Market) is the one opening now.** Two standing blocks apply regardless of what you build: the `$0.10 legitimacy_scan` trust rung stays unexposed on every live channel (B-1), and B2B outreach timing is undecided (OD-4) — neither is yours to lift.
- **Bion** (the orchestration/shadow layer) has its own build mostly done — task authoring, ratification, auto-report CLIs all exist — but the last two directives issued against it (19's addendum, and 20's Auto-Mode flip) have **no completion report on disk**, even though the live daemon heartbeat already shows the flip took effect (`mode.auto: "shadow"`). That gap gets closed before anything gets registered on top of it. Full detail is in the directive itself — don't take this summary as a substitute.

## 3. The two directives — order of operations

1. **`C:\Users\kidco\dev\bion\BION-DIRECTIVE-21-expansion-kickoff.md`** — first. Reconciles the addendum/Directive-20 gap above (report, don't assume anything's fine or broken), then authors + ratifies the six E1 tasks into Bion's backlog so shadow-reporting has real data to walk.
2. **`C:\Users\kidco\dev\grey\EXPANSION-E1-A-KOV-directive.md`** — the actual build: `computeClass` + canonical pricing engine, landing Invariants #30/#31. Schema + enforcement layer only — no external surface changes, no repricing, no new channel. This can start in parallel with Directive 21's reconciliation step if you're running both; just don't let Directive 21's Task 2 (authoring `e1-a` etc. into Bion) get ahead of actually confirming Bion's own state is sound.

Both directives are self-contained and cite real files/line-level detail — read each in full before starting, this handoff is orientation, not a substitute.

## 4. Standing rules, unchanged

Explicit git paths only, never `git add -A`/`.`. `vitest run` is canonical. Push/merge/tag are Forces-gated; commits to feature branches under a ratified task are yours. No time estimates, anywhere. MCP/tool failure → retry ≤3, then stop and report — no silent workarounds. Never touch `wpv_claims`/`wpv_verifications`/`wpv_whitepapers` without explicit Forces approval. Secrets never leave the box.

## 5. What's held for Forces

Merge/push on both repos. Lifting B-1 (trust rung exposure) or resolving OD-4 (B2B outreach timing) — not yours to decide under any circumstance, including if a later expansion seems to need it. The unpriced-offering gaps flagged in the E1-A directive (`daily_greenlight_list`, `scam_alert_feed`) — Desktop sources those before merge, don't invent numbers.

---
*Standby: confirm you're oriented, then start with Directive 21.*
