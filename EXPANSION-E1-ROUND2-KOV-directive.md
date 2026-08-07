# EXPANSION E1 — ROUND 2 (consolidated b+c+d+f) — KOV BUILD DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-07-30).
**Supersedes:** the separate `e1-b`/`e1-c`/`e1-d`/`e1-f` task split. Collapsed on Forces' explicit call to cut round-trip overhead — one branch, one PR, one review, not four.
**Spec:** `MARKET-EXPANSION-PROJECT.md` §3, phases E1-B/E1-C/E1-D/E1-F.
**Anchor:** whatever lands from `expansion-e1-a-computeclass` once merged. If not yet merged when you start, branch from it directly (`e1-round2` off `expansion-e1-a-computeclass`, not off `main`) — don't block on the merge.
**Branch:** `expansion-e1-round2`.
**Discipline:** unchanged — explicit paths, `vitest run`, no time estimates, diffs are the artifact of record, MCP failure → retry ≤3 then stop+report. **Build in one pass through the four sub-units below; self-verify each gate before the next; HALT on a failed gate and report — don't push through.**

## Sub-unit 1 — Bazaar discovery metadata (was E1-B)
Project `@grey/schemas`'s pricing/offering data into the Bazaar extension shape on every x402 route: `discoverable: true`, `serviceName`, `tags`, `description`, `inputSchema`, `outputSchema`, `iconUrl`. Respect validation rules (printable ASCII for `serviceName`/`tags`; absolute https `iconUrl`, no IP literals/loopback — soft-drop means a bad field vanishes silently, so verify actual indexing, don't assume from the code alone).

## Sub-unit 2 — Evaluation artifacts + trust rung, built-not-exposed (was E1-C)
Publish sample outputs + a public capability page an evaluating agent can fetch pre-purchase — these ship live. Separately, build `legitimacy_scan` at $0.10 `CACHE_ONLY` (the **new**, distinct trust-rung offering — not the existing $0.25 live one) **behind a hard disable flag, default off**, with tests asserting it's unreachable on every live channel. **B-1 stands: this does not get exposed, on any channel, regardless of how sub-units 1/3 turn out.**

## Sub-unit 3 — MCP tool surface (was E1-D)
Expose the offering set as paid MCP tools over the same x402 rail. List in Bazaar as MCP. Depends on sub-unit 1's metadata shape existing.

## Sub-unit 4 — Cost ledger + margin dashboard (was E1-F)
Per-call cost ledger (model spend + RPC + infra amortization), attributed per `channel × offering`. This is G1 (§4) — required before E2 opens.

## Gate (unchanged from the MEP's E1→E2 gate, §3)
Verified Bazaar indexing of all discoverable routes + at least one settled non-self payment through a Bazaar-discovered path + margin ledger live showing positive realized margin on `LIVE_ALLOWED` offerings. **Does not depend on the trust rung** (blocked per B-1) — the settled payment must come through a normally-priced offering.

## Bion backlog — collapse the tracking to match
Delete the four superseded rows and replace with one. Forces' go for the deletion is this directive (explicit, given 2026-07-30 in this session — don't treat it as needing a separate confirmation):

```
DELETE FROM tasks WHERE id IN ('e1-b','e1-c','e1-d','e1-f');
```

Then author the replacement (normal `bion task create`, no ratification workaround needed — `priority` is a plain grant, not column-locked like `ratified`):

```
pnpm task create e1-round2 --title "Bazaar metadata + evaluation artifacts + MCP surface + cost ledger" \
  --owner kov --priority 5 --project expansion --deps e1-a
```

(Priority `5` — one below `e1-a`'s `6`, consistent with the "higher number = hotter" convention already confirmed in `core/tasks.ts`/`loop/dispatcher.ts`; `e1-a` itself should already read `6` if the inversion from the last round landed.) Ratify it the same way as before (`ratify-task.sh e1-round2` or folded into the next `ratify-project.sh expansion` pass). `e1-e` is untouched — still owner `desktop`, still gated on nothing engineering-side.

## Deliver
One diff against `expansion-e1-round2`, reviewed as a diff. One status ping confirming the Bion delete+recreate landed and reads correctly in `bion task list --project expansion`. Merge stays Forces-gated, same as always.
