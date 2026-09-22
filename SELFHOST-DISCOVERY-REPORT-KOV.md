# Self-Hosted x402 Discovery + Public Menu (Option B) — report for Desktop/Forces

**From:** Kov · **To:** Desktop/Forces · **Directive:** `C:\Users\kidco\dev\grey\SELFHOST-DISCOVERY-KOV-directive.md` · **Branch:** `selfhost-discovery` (pushed, PR open: https://github.com/Mayakovsky/grey/pull/58, not merged) · **Bion:** registered as task `selfhost-discovery` (project `expansion`, `ratified=false` — ratification is FORCES LANE per `scripts/ratify-task.sh`'s own header comment; bion_rw structurally lacks the column privilege, same posture as push/merge. Left for Forces/Desktop, not self-ratified.)

Full raw findings below, per the directive's own ask, especially items 1 and the "which index.html" question.

## 0. Two housekeeping items from the fresh-instance handoff, done before this task

- **Bion mail:** checked via `pnpm mail poll --as kov` from `C:\Users\kidco\dev\bion\repo` — no unread mail. D-80 mailbox self-watch armed for this session (Monitor task, both flat and per-project `unread/` shapes covered).
- **Bion mode, confirmed live via `pnpm status`:** `reactive=shadow, auto=off` — the handoff's "stale, verify" claim about shadow mode turned out to still be accurate, not stale. Per the handoff's own instruction, I did not attempt to flip this — it's a real decision, not a mechanical one, and stays with Forces/Desktop.
- Registered this task into Bion for real (`selfhost-discovery`, project `expansion`, owner `kov`, prio 8) rather than treating Bion as a side experiment, per the handoff's ask — see the ratification note above for the one piece I deliberately left undone.

## 1. `.well-known/x402` — the real shape, and a bigger finding than the directive anticipated

**What I built:** `GET /.well-known/x402` (new, in `packages/grey-core/src/server/routes/discovery.ts`) returns:
```json
{
  "version": 1,
  "resources": [
    "https://api.whitepapergrey.com/v1/offerings/legitimacy_scan",
    "https://api.whitepapergrey.com/v1/offerings/verify_whitepaper",
    "https://api.whitepapergrey.com/v1/offerings/verify_full_tech",
    "https://api.whitepapergrey.com/v1/offerings/claim_extraction",
    "https://api.whitepapergrey.com/v1/offerings/claim_history",
    "https://api.whitepapergrey.com/v1/offerings/quick_protocol_facts"
  ],
  "health": "https://api.whitepapergrey.com/health"
}
```
Sourced directly from `offerings.ts`'s `PAID` array (imported, not copied) — one source of truth, not a 4th hand-authored list.

**Where that shape came from, sourced, not guessed:**
- `@x402/core@2.20.0` and `@x402/extensions@2.20.0` (the installed x402 library family, checked via their actual `dist/*.d.ts` exports and a full-text search of the built JS) export **no** well-known-manifest builder at all — no `discovery`/`well-known` submodule exists alongside `bazaar`/`offer-receipt`/etc. The directive's hypothesis that "the same library family may already export one" is false; confirmed by reading the shipped code, not by assumption.
- `Merit-Systems/x402scan#1110` (fetched via `gh api`) turned out to be a **registration request** citing a real, working precedent: `googlepro1/x402-agentshop`, a static GitHub Pages discovery card. Its actual `.well-known/x402` file (fetched raw) uses a richer shape (`resources[].description`, `docs`, `skill`, `mcp`, `contact`) than x402scan's own documented minimum — that richer shape is one implementer's own convention, not a spec.
- **The authoritative source is x402scan's own `docs/DISCOVERY.md`** (fetched from their repo): discovery precedence is `(1) /openapi.json`, `(2) /.well-known/x402` ("compatibility"). The well-known minimum is exactly `{ "version": 1, "resources": ["<url>", ...] }`, optionally `ownershipProofs`/`instructions` — this is what I built.

**The bigger finding — this doc is stale relative to the code x402scan actually runs:** x402scan's `apps/scan/package.json` pins `@agentcash/discovery` at exactly `1.7.5`. I pulled that exact package from npm (`npm pack @agentcash/discovery@1.7.5`) and read its shipped `docs/SPECIFICATION.md` and its actual `dist/index.js`. Both say, verbatim:
> "Legacy `/.well-known/x402`, `/.well-known/mpp`, and DNS `_x402` records are no longer parsed... agentcash-discovery no longer parses these" (the exact string in `dist/index.js`'s `LEGACY_WELL_KNOWN_FOUND` warning).

Discovery order per that same file: **(1)** a caller-supplied OpenAPI override URL, **(2)** `GET /openapi.json`. If `/.well-known/x402` is present, the crawler emits one `LEGACY_WELL_KNOWN_FOUND` info-level warning telling the publisher to migrate — it does not fetch or fan out from it at all.

**Bottom line:** `/.well-known/x402` is worth having (cheap, matches the still-published docs, harmless to any older/other consumer that does read it — the AgentShop example proves some do), but it is **not** the load-bearing piece for actually getting indexed by x402scan or AgentCash today. `/openapi.json` is. This reorders the directive's own item priority — flagging it plainly rather than quietly building only what was asked and letting the real lever go under-emphasized.

**Merge-only or merge-and-deploy:** merge-and-deploy (new grey-core route; needs a build + `systemctl restart grey-core` on the VPS, same as any other grey-core change).

## 2. `/openapi.json` — the actually load-bearing piece

**What I built:** `GET /openapi.json` (new, in `packages/grey-core/src/server/routes/probes.ts`), mounted at domain root — confirmed via `CDP-BAZAAR-LOG-CONFIRM-AND-CRAWLER-CHECK-REPORT-KOV.md`'s Caddy config that `api.whitepapergrey.com` proxies straight to grey-core's Fastify instance with no path prefix, so `/openapi.json` resolves exactly where x402scan/AgentCash look. Implementation: `js-yaml`'s `load()` parses the same `OPENAPI_YAML` string `/openapi` already reads once at module load — one file read, two representations, no re-authoring.

**Dependency note:** `js-yaml` was already present in `pnpm-lock.yaml` (pulled in transitively, unused at runtime by anything in this repo). Rather than treat that as "a conversion already exists" (it didn't — nothing actually used it), I added it as a direct dependency of `@grey/core`, **pinned to `^4.2.0`** — the exact version already resolved in the lockfile — specifically so this doesn't pull in a second, different major version. (First attempt via plain `pnpm add js-yaml` resolved `^5.4.2`, a real new major alongside the existing `4.2.0`; I removed and re-added pinned to avoid that.) Also added `@types/js-yaml@^4.0.9` as a devDependency (not previously in the lockfile — a small, types-only addition, no runtime code). Flagging both explicitly since the directive's "no new dependency with real weight" bar is a judgment call: I judged this well under that bar (single small dep, already-vetted major version, zero runtime security surface beyond what's already vendored) but wanted it visible rather than silent.

**Real bug found and fixed in `openapi.yaml` while doing this (not scope creep — directly required for a clean conversion):**
- `x402scan`'s own required per-operation shape needs a structured `x-payment-info` block (`{ price: { mode, currency, amount }, protocols: [{ x402: {} }] }`) — the existing doc only had a bespoke `x-x402-pricing: "N.NN"` string that no discovery tool reads. Added the structured block to all 6 live paid paths, values taken from the same canonical `PRICING_TABLE` numbers already baked into the pre-existing `x-x402-pricing` field (cross-checked against `packages/grey-schemas/src/pricing/table.ts` — they already matched).
- Added a `402` response entry to each of those 6 operations (per `@agentcash/discovery`'s `docs/SPECIFICATION.md`'s minimal example and required-fields list).
- Added `security: []` to the 2 free `/v1/resources/*` paths (the spec requires an *effective* security declaration on every operation, including "explicitly none").
- **Removed** `/v1/offerings/daily_tech_brief` from the document entirely. It is documented there but is *not* in `offerings.ts`'s `PAID` array (held back per BION-DIRECTIVE-62 — not-yet-offered) — the route doesn't exist, so a real crawler probe gets a plain `404`, not a `402`. x402scan's own doc lists `Expected 402, got 404` as a named common failure reason. Publishing this path in `/openapi.json` would hand every future crawl attempt a guaranteed failure on a route nobody can actually buy. Left a comment in the yaml explaining exactly when to re-add it (the day `daily_tech_brief` re-enters `PAID`).
- Fixed `servers[].url` from `https://whitepapergrey.com` (the marketing site!) to `https://api.whitepapergrey.com` (where these paths actually live). Confirmed via reading `@agentcash/discovery`'s own `dist/index.js` that this field is **not** actually used to resolve resource origin for x402scan/AgentCash purposes (origin comes from wherever `/openapi.json` was fetched; `servers[]` only contributes an optional base *path* prefix) — so this was cosmetic for those two crawlers specifically, but still a real correctness bug for any human or other tool reading the spec, so fixed regardless.
- Added `info.contact.email` and an `info.x-agentcash-guidance.llmsTxtUrl` pointer (both named in `@agentcash/discovery`'s spec as recommended/optional fields worth having).

**Merge-only or merge-and-deploy:** merge-and-deploy (new route + `openapi.yaml` content changes; needs a grey-core rebuild + restart).

## 3. Availability signal

Did not touch `/health` itself — its own header comment already correctly documents that `dbReady` was deliberately left out in M3 (no DB-client handle available without a discouraged transitive import), and the directive explicitly asked me to flag rather than silently expand it. Flagging it here as asked: if `/health` is ever the target of real automated dependency (versus a human/crawler informational read, which is all it's used for today), the `dbReady` gap becomes a real question worth its own directive — not something to bolt on inside this one.

What I did do: linked the existing `/health` into both `GET /v1/discovery/services` (new `health` field in the response) and the new `/.well-known/x402` manifest, so an evaluating agent reading either doesn't need a second guess.

**Merge-only or merge-and-deploy:** merge-and-deploy (small response-shape addition to an existing route).

## 4. Public menu refresh

**`llms.txt` — updated, but NOT part of the PR/diff above.** Content added (direct native-x402 channel `https://api.whitepapergrey.com/v1/offerings/<slug>`, the Bankr resale channel `https://x402.bankr.bot/0xcf888f6a54d59c7c85855f4479aa1379ca2887a3/<kebab-slug>` — sourced from `BANKR-BRIDGE-EXPAND-OFFERINGS-STATUS-KOV.md`'s confirmed-live URLs, not guessed — and a `/health` status line).

**Real finding, worth flagging plainly:** `whitepapergrey-site/` has **no git history in this repository at all** — `git log -- whitepapergrey-site` returns nothing, it isn't gitignored either, it's simply never been committed. The live `whitepapergrey.com` site is deployed through some mechanism entirely outside this repo (manual upload, a separate repo, direct file placement on whatever host serves it — unconfirmed). I don't know what that mechanism is, and `infra/deploy/deploy.md` doesn't mention the marketing site at all (it only covers grey-core). Rather than guess at a deploy path, I made the `llms.txt` edit locally (it's sitting in the working tree, ready to read or copy) and stopped there — this is exactly the kind of "if it needs real new infrastructure, stop and flag" case, except here it's "existing infrastructure I can't see," which felt like the same bar.

**`index.html` — confirmed exactly which file is live, not guessed:** fetched `https://whitepapergrey.com/` directly and diffed it byte-for-byte against every local candidate. `whitepapergrey-site/index.html` is an **exact match** (`diff` returns nothing, matching MD5 `52a42710ebdea475b7165542b2eaf7e2`). `index Bankr.html` and `index revised.html`/`.rtf` are not live.

**My call on whether it needs a pricing/offerings section (directive left this to my judgment):** it already has one — a full "Our Offerings" table with all 6 live prices, byte-identical to what's live right now. It also already narratively mentions Olas (Base/Gnosis), Agentic.Market/x402, and Virtuals ACP in its "Live Access"-style prose. It does not mention the Bankr resale channel or the direct native-x402 channel by name. I judged this doesn't need a new channel-by-channel breakdown — the page reads as narrative marketing copy, not a menu, and `llms.txt` is already the actual machine-readable menu doing that job (and is the piece the directive named explicitly). Left `index.html` untouched. Flagging the judgment call rather than just silently making it, per the directive's own framing.

**Merge-only or merge-and-deploy:** neither, in the git sense — there's no repo path for this file to merge through. It needs whoever knows the actual site-deploy mechanism to pick up the local edit.

## What's NOT done, and why

- **`.well-known/x402` and `/openapi.json` are not yet live** — this is a PR (`selfhost-discovery` branch, #58), not a merge or a deploy. Per standing rules, merge/push-to-main is Forces/Desktop's call; I stopped at "ready for review."
- **Bion task `selfhost-discovery` is not ratified** — same posture, `ratify-task.sh` is explicitly FORCES LANE (bion_rw lacks the column privilege by design, invariant 13). Needs `BION_MIGRATE_URL=... bash scripts/ratify-task.sh selfhost-discovery` run by Forces/Desktop, not me.
- **`llms.txt`'s deploy path is unconfirmed** — see above. Someone who knows how whitepapergrey.com actually gets updated needs to either tell me, or take the local edit from here.

## Test/typecheck evidence

- `pnpm -C packages/grey-core test` — 23 files, **198 passed** (195 prior + 3 new: `.well-known/x402` shape, the new `health` field, `/openapi.json` parity with `/openapi` minus the removed `daily_tech_brief` path).
- `pnpm -C packages/grey-core typecheck` — clean.
- `pnpm -C packages/grey-schemas test` — 7 files, 146 passed, unaffected (openapi.yaml isn't consumed by any grey-schemas test).

---
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
