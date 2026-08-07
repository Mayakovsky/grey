# EXPANSION E2-CD — Kite Agent Passport + listing/directory + MCP hub — KOV BUILD DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-04). Consolidates former `e2-c` (Agent Passport registration) + `e2-d` (listing/directory presence + MCP hub registration) per Desktop's consolidation ruling, confirmed by Forces.
**Spec:** `MARKET-EXPANSION-PROJECT.md` §3 E2 (E2-C, E2-D).
**Base:** `main` @ `e51665a685138c96eae5d0371b23109a9c56b032` (E2-BE merge — confirm this is still current before branching). **Branch:** `expansion-e2-cd-kite-passport-listing`.
**Discipline (restated, unchanged):** explicit staging paths only, never `git add -A`/`.`; `vitest run` canonical; MCP/tool failure → retry ≤3 then STOP+report; no time estimates; cite `file:line`. Reviews are diffs. Merge is Forces-gated, no exceptions.

## The one Forces-gated checkpoint in this directive

**You build everything up to Kite Agent Passport registration. You do not perform the registration itself.** Creating a new identity/account on a third-party platform is Forces's call — same principle as the key ceremony, not a new rule. Concretely: build whatever binding/config code the registration needs, confirm exactly what the actual registration step requires (see Task 1), then **stop and hand that step to Forces**, same shape as `EXPANSION-E2-KITE-KEY-CEREMONY-RUNBOOK-FORCES.md`. If your research finds the registration is technically just an API call you could execute yourself, **execute nothing** — flag it to Desktop instead. "Self-serve" (MEP's word for Kite's own UX) describes Kite's process design, not who inside this project is authorized to create the account.

## Before writing anything: locate real precedent, don't build from plan prose

Same discipline as E2-A and E2-BE, for the same reason — MEP's E2-C/E2-D language is a spec, not an implementation guide, and this directive is written without me having verified Kite's actual Agent Passport mechanics myself. Find and cite, with `file:line`, before writing code:

1. **EvaluationKit rendering (E1-B).** Find the real code that projects `@grey/schemas` into Bazaar's discovery-extension shape. This is what E2-D's "re-render EvaluationKit into Kite's provider directory" reuses — confirm whether Kite's directory wants the same shape, a subset, or something structurally different, rather than assuming byte-compatibility.
2. **MCP tool surface registration (E1-D).** Find the real code that exposes the offering set as paid MCP tools and lists them in Bazaar. E2-D says this "registers against Kite's MCP hub" — confirm what that actually requires (a manifest submission? a live endpoint Kite polls? something else?) before assuming it's a config change.
3. **ERC-8004 DID binding pattern.** `@grey/ceremony`'s `mint`/`sign-consent`/`link-agent` commands are the existing pattern for binding an identity to `did:erc8004:8453:58618`. MEP says Passport should "bind to the existing ERC-8004 DID where the Passport model permits" — confirm whether Kite's Passport model actually supports binding to an external DID, or whether it's a fully separate identity system, before designing binding code either way.
4. **Kite Agent Passport's real registration flow.** Research `docs.gokite.ai/kite-agent-passport` and `agentpassport.ai` directly (both referenced in Kite's own docs navigation). Confirm concretely: what does registration actually require (wallet signature? API key request? a web form only a human can complete? something DID-based)? This determines the exact shape of the Forces-gated step above — don't guess at it.
5. **Directory-listing dependency.** Confirm via research whether Kite's provider directory listing requires an existing Agent Passport identity to list under, or whether it's independent. This determines whether Task 2/3 below can proceed in parallel with Task 1 or must wait on it. Report your finding either way — don't silently assume.

If anything here turns out not to match what real research shows, the research wins — flag the mismatch and stop rather than build around this directive's assumption, same posture E2-BE's blocked report modeled well.

## Task 1 — Agent Passport: build the binding, stop before registering

- Whatever config/binding code the registration flow (confirmed above) actually needs — DID association, credential storage placeholder, request payload construction, whatever the real API shape requires.
- Do not submit the registration. Write up exactly what Forces needs to do — mirroring the key-ceremony runbook's format — as a new file: `EXPANSION-E2-KITE-PASSPORT-REGISTRATION-RUNBOOK-FORCES.md`, placed in `C:\Users\kidco\dev\grey\`, if the real flow indeed requires a human-executed step. If research shows it's something else entirely (e.g., genuinely just needs a value Forces already holds, like the DID owner key from the ceremony), say so plainly instead of forcing it into the runbook shape.

## Task 2 — EvaluationKit re-render for Kite's directory

- Re-render the existing EvaluationKit source (per Task 0.1's findings) into whatever shape Kite's directory actually wants. If it's not byte-compatible with Bazaar's shape, say so and build the real mapping — don't force-fit.
- Sequence relative to Task 1 per Task 0.5's finding.

## Task 3 — MCP hub registration

- Register the E1-D MCP tool surface against Kite's MCP hub, per whatever the real mechanism (Task 0.2's findings) turns out to be.

## Task 4 — Tests

- Golden-value tests for the EvaluationKit re-render, same discipline as E2-A/E2-BE's registry tests.
- Confirm no Base/ACP-facing behavior changes anywhere in this diff — this phase is additive only.
- `vitest run`, full suite.

## What this phase explicitly does not do

- Does not perform Kite Agent Passport registration — that's the Forces-gated step.
- Does not touch wallet topology, sweep, or refuel — that's `e2-be` (merged).
- Does not decide pricing — E2's `networkMultiplier` (1.00×) is already correct per MEP §2.3 and needs no new work here.

## Deliver

```
git diff main..expansion-e2-cd-kite-passport-listing > review-e2-cd-kite-passport-listing.diff
```

Report: diff export path, full `vitest run` output, your findings from the five precedent-research items above (with `file:line`/URLs cited), and — if applicable — the runbook file for Forces. Merge stays Forces-gated. PR-ready and stop.
