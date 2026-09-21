# DRAFT — Bankr x402 Cloud support report — NOT YET SENT

Held pending Kov's dashboard check (per `BANKR-SEARCH-VISIBILITY-FOLLOWUP-KOV-directive.md`) — if a manual "make discoverable" toggle exists there, we don't need to send this at all. Given the corroborating evidence found since (below), that toggle almost certainly doesn't exist, but confirming costs nothing.

---

**Subject:** All deployed x402 endpoints show `discoverable: false`, contradicting documented deploy behavior — matches a known, unresolved, 3-month-old report from other sellers (BankrBot/x402-cli-example#3)

**Account / project:** Whitepaper Grey (`kidcopernicus@gmail.com` on Bankr; project slugs below under payTo `0xcf888f6a54d59c7c85855f4479aa1379ca2887a3`)

**Summary:** All 6 of our deployed x402 Cloud endpoints are live and functioning correctly (confirmed 200s internally, correct `402 Payment Required` responses externally), but none appear in marketplace search — including one that's been deployed for multiple days. This is not an isolated issue: it matches an open GitHub issue from unrelated sellers, unanswered since July.

**Affected endpoints:**
| service | URL | deployed (createdAt) |
|---|---|---|
| legitimacy-scan | `https://x402.bankr.bot/0xcf888f6a54d59c7c85855f4479aa1379ca2887a3/legitimacy-scan` | 2026-09-19T21:18:36.377Z |
| verify-whitepaper | `.../verify-whitepaper` | 2026-09-21T00:40:22.424Z |
| verify-full-tech | `.../verify-full-tech` | 2026-09-21T00:40:28.949Z |
| claim-extraction | `.../claim-extraction` | 2026-09-21T00:40:34.657Z |
| claim-history | `.../claim-history` | 2026-09-21T00:40:46.243Z |
| quick-protocol-facts | `.../quick-protocol-facts` | 2026-09-21T00:40:52.143Z |

**What we found on our own account:**

1. `GET /x402/endpoints` (authenticated, same auth the CLI itself uses) returns `"discoverable": false` for every one of the 6, including `legitimacy-scan`, live for 2 days now — this isn't an indexing-lag issue.
2. `bankr x402 search <query>` — both unauthenticated and authenticated, same result — returns zero hits for any of our 6 across 8 different queries (each slug individually, `"whitepaper grey"`, and `due-diligence`, a literal tag on all 6 listings), 50 results per query checked.
3. We grepped the entire installed `@bankr/cli` package (`dist/`) for any reference to `discoverable`: zero matches. It's not a deploy-payload field, not a command flag, not documented anywhere we can find. There's no way to set it to `true` from the CLI.
4. Your own Quick Start doc (`x402-cloud/quick-start`, step 8) states: *"Your endpoint is live. Agents can now discover and pay for it automatically, and it appears in the public marketplace for anyone to browse."* — no mention of any additional step. That's not what we're seeing.
5. We considered whether this is tied to Agent Profiles (`/terminal/projects`, `approved`/`isPublished` on that separate object) — your docs describe that as an unrelated feature (project pages, admin-approved), with no stated connection to x402 discoverability, so we've ruled that out.

**This isn't just us — it's a known, unresolved, cross-seller gap:**

- [`BankrBot/x402-cli-example#3`](https://github.com/BankrBot/x402-cli-example/issues/3), open since **2026-07-01**, no maintainer response ever: a seller with 2 active, fully-configured (schema/tags/category) endpoints reports the identical symptom, quoting your own launch materials — *"every **approved** x402 Cloud endpoint is automatically indexed in the agent discovery layer"* — and asking what "approved" actually requires, since nothing in the CLI or docs exposes it.
- A second, unrelated seller commented on the same issue on **2026-08-29** with **7 more active endpoints**, same symptom, 7 days post-deploy, zero search hits.
- That same commenter separately found `x402.bankr.bot` 404s on `/openapi.json` and `/.well-known/x402` — the standard manifest paths third-party discovery tools (x402scan, AgentCash) rely on — meaning Cloud sellers can't self-register in the broader x402 ecosystem either, independent of Bankr's own search.
- [`Merit-Systems/x402scan#1110`](https://github.com/Merit-Systems/x402scan/issues/1110) documents the mechanism for that second gap precisely: Bankr Cloud's unpaid `402` challenge has `accepts[] + price` but no `extensions.bazaar` block, so it fails Coinbase's Bazaar schema validation (16 errors, including missing `extensions.bazaar.schema.properties.input/output`) even though `bankr x402 schema` returns the schema separately — it just never lands in the actual 402 response.

Three independent accounts, two separate GitHub repos, three months, zero acknowledgment. We believe this is a genuine platform bug (or at minimum a completely undocumented manual gate nobody has ever gotten flipped), not something sellers are doing wrong.

**Ask:** Either point us to the step every one of these reports is missing, or confirm this is a bug, tell us when `discoverable` will flip to `true` for these 6 (and, ideally, for the other reporters' endpoints too), and let us know whether the `extensions.bazaar` / `.well-known` gap is being tracked separately.

**Happy to provide:** full raw `GET /x402/endpoints` response, full raw search output for all 8 queries, on request.
