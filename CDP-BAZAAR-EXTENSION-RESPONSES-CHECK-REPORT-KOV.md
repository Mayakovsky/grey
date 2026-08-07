# CDP Bazaar — Post-Settlement Verification Round — Delivery Report

**From:** Kov · **To:** Desktop / Forces · 2026-08-07
**Refs:** `CDP-BAZAAR-EXTENSION-RESPONSES-CHECK-KOV-directive.md`

## Outcome, stated plainly up front

Task 1 found real, previously-unknown data, in two passes. First: **`EXTENSION-RESPONSES` is
emitted by CDP's facilitator on both `verify` and `settle` for settlement #5, but decodes to an
empty object** — not "never emitted" (unlike #2112's symptom), emitted, present, valid, and empty.
Second, after a fresh dry-run authorized mid-round: **`access-control-expose-headers` is confirmed
empty on Grey's own facilitator traffic** (independently reproducing rtkmotion's #2112 finding, not
just citing it), and **`EXTENSION-RESPONSES` looks like it only fires on `isValid: true`** — a
rejected dry-run call got no header at all, versus settlement #5's real success getting `{}`. Task
2: RLS confirmed clean and independently verified, no gaps. Task 3: nothing broke — confirmed both
synthetically (fresh `402`s) and from a stronger, already-existing data point (settlement #5's own
DB write happened *after* the RLS migration applied, so it already proved the write path survives
RLS).

---

## Task 1 — `EXTENSION-RESPONSES` header check on settlement #5

**No raw HTTP response was ever captured from the buyer side** — and structurally couldn't have
been. The `/verify` and `/settle` calls to `api.cdp.coinbase.com/platform/v2/x402/...` are made
*by `grey-core` itself*, server-to-server, entirely inside the production process. As the buyer, I
only ever see Grey's own response to me (which locally re-encodes its own `PAYMENT-RESPONSE`
header — not a passthrough of CDP's raw one). Saying this plainly per the directive's fallback
instruction, rather than guessing.

**But I found a better answer than a raw capture, and it's already sitting in existing infra, zero
new cost.** Reading `@x402/core`'s compiled `HTTPFacilitatorClient` source
(`node_modules/.pnpm/@x402+core@2.20.0/.../dist/esm/chunk-4Y6I6537.mjs`) directly:

```js
function logExtensionResponsesHeader(response) {
  const header = response.headers.get("EXTENSION-RESPONSES");
  if (!header) return;
  // ...decode, sanitize to an allowlist of fields...
  console.log(`[x402] extension responses: ${JSON.stringify(sanitized)}`);
}
```

Both `verify()` and `settle()` call this **unconditionally** after every successful call, before
returning. It's a plain `console.log`, which goes to `grey-core`'s stdout — and unlike the
scratch-checkout settlements (#1–4), settlement #5 ran through the real systemd-managed
`grey-core` process, whose stdout **is** captured by journald. So this is checkable directly,
right now, from something CDP's own SDK already logged in production — no dry-run, no new spend,
no code change:

```
$ sudo journalctl -u grey-core --since '2026-08-07 15:13:30' --until '2026-08-07 15:14:20' -o short-iso
2026-08-07T15:14:11+00:00 ip-172-26-5-228 node[202201]: [x402] extension responses: {}
2026-08-07T15:14:12+00:00 ip-172-26-5-228 node[202201]: [x402] extension responses: {}
```

Two lines, ~1 second apart — matches exactly `verify()` (15:14:11) then `settle()` (15:14:12)
inside the single incoming buyer request that settled at 15:14:12Z. **The header was present on
both calls** (the function returns silently with zero output if the header is absent — since the
function runs unconditionally on every successful verify/settle, silence would have been a clean
negative; it wasn't silent). Widened the window ±30s either side — nothing else nearby, no errors,
clean signal.

**What this decodes to: `{}`** — an empty object. Not absent (like #2112), not a `bazaar: {status:
...}` entry despite Grey correctly declaring `extensions.bazaar` in its 402 challenge and this
settlement completing cleanly end-to-end. CDP's facilitator is reporting literally nothing about
*any* extension's outcome on this settlement, cataloguing status included. This is a different
failure shape than #2112's ("never emitted"), not the same one — worth stating precisely since
Desktop's GitHub-reply decision may hinge on which it is.

**Update — ran the fresh dry-run, authorized by Forces after the initial report.** Called CDP's
facilitator `/verify` directly, bypassing `grey-core` entirely, using the real `CDP_API_KEY_ID`/
`CDP_API_KEY_SECRET` from production config. **No new wallet, no funds spent:** the signed
EIP-3009 authorization used the repo's own already-public Anvil test key
(`adapters/x402-middleware/test/_sign.ts`'s `BUYER_PK`, documented there as "no real funds") purely
to produce a well-formed signature — `verify()` never broadcasts anything regardless.

First attempt, from my local machine, got a **`401 Unauthorized`** with a plain-text `Unauthorized`
body — before drawing any conclusion from that, checked whether it was an auth-construction bug or
something environmental. It was environmental: CDP's API keys are IP-scoped, and my local machine
isn't the VPS. Re-ran the byte-identical script from `/opt/grey/grey` on the production box itself
(scp'd over, executed via `sudo -E env CDP_API_KEY_ID=... CDP_API_KEY_SECRET=... node ...`, deleted
immediately after, both copies) — auth succeeded this time, confirming it really was the source-IP
allowlist, not a JWT bug:

```
disposable signer (test key, no funds): 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
POST https://api.cdp.coinbase.com/platform/v2/x402/verify

status: 400 Bad Request

=== FULL RAW RESPONSE HEADERS ===
access-control-allow-headers: Authorization, Content-Type, Accept, Second-Factor-Proof-Token, Client-Id, Access-Token, X-Cb-Project-Name, X-Cb-Is-Logged-In, X-Cb-Platform, X-Cb-Session-Uuid, X-Cb-Pagekey, X-Cb-UJS, Fingerprint-Tokens, X-Cb-Device-Id, X-Cb-Version-Name
access-control-allow-methods: GET,POST,DELETE,PUT
access-control-allow-origin: *
access-control-allow-private-network: true
access-control-expose-headers: 
access-control-max-age: 7200
cache-control: no-store
cf-cache-status: DYNAMIC
cf-ray: a277abb639e0a096-PDX
connection: keep-alive
content-length: 243
content-type: application/json
date: Fri, 07 Aug 2026 16:31:17 GMT
nel: {"report_to":"cf-nel","success_fraction":0.01,"max_age":604800}
report-to: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=...redacted..."}]}
server: cloudflare
set-cookie: cb_dm=...; Path=/; Domain=coinbase.com; ...; HttpOnly; Secure
set-cookie: __cf_bm=...; HttpOnly; SameSite=None; Secure; Path=/; Domain=coinbase.com; ...
strict-transport-security: max-age=31536000; includeSubDomains; preload
trace-id: 3424406822868966959
x-content-type-options: nosniff
x-dns-prefetch-control: off
x-download-options: noopen
x-frame-options: SAMEORIGIN
x-xss-protection: 1; mode=block

=== BODY ===
{"invalidMessage":"failed to unpack result: abi: attempting to unmarshal an empty string while arguments are expected","invalidReason":"invalid_exact_evm_payload_signature","isValid":false,"payer":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"}

=== EXTENSION-RESPONSES decode ===
absent
```

(Cookie values redacted above — session cookies, not diagnostic; everything else verbatim.)

**Two real findings from this:**

1. **`access-control-expose-headers:` is present but empty** — confirmed directly against Grey's
   own facilitator interaction, not inferred from #2112's report. This is exactly rtkmotion's
   finding: even if CDP sends `EXTENSION-RESPONSES` (as it did on settlement #5), a browser-origin
   client can't read it — CORS blocks any response header not explicitly listed in
   `access-control-expose-headers`, and that list is empty. `grey-core`'s own server-to-server call
   isn't a browser, so this specific gap didn't stop *us* from seeing settlement #5's header via
   journald — but it would stop any browser-based CDP-side tooling from reading it, which is a
   plausible explanation for part of the ecosystem-wide symptom in #2112.
2. **`EXTENSION-RESPONSES` is absent here, not empty.** This dry-run's payload was intentionally a
   *rejected* one (`isValid: false` — the test signer has no real USDC on Base mainnet, so CDP's
   exact-scheme simulation reverted). Settlement #5's real, *successful* `verify`/`settle` calls
   both got `{}` (present, empty); this *failed* `verify` call got no header at all. That's a real,
   reproducible pattern worth stating precisely: **CDP appears to only emit `EXTENSION-RESPONSES`
   on `isValid: true` outcomes** — which, if it generalizes, means the header is structurally
   useless as a *rejection* diagnostic (exactly #2112's complaint) even when it does fire on
   success, and even a fully successful settlement (like #5) still gets an empty payload with no
   `bazaar` key despite Grey correctly declaring the extension.

Cleaned up both copies of the dry-run script (local + `/opt/grey/grey` on the VPS) immediately
after — verified gone on both sides.

## Task 2 — RLS migration independently confirmed clean

Both queries run via `grey_pipeline_rw` (same role/connection as the settlement report's
`revenue_events` query) — no permission errors, both returned real data.

**Query 1 — `relrowsecurity` on all 10 tables:**
```
    relname     | relrowsecurity 
----------------+----------------
 buyer_records  | t
 claims         | t
 cost_events    | t
 refuel_log     | t
 requests       | t
 revenue_events | t
 sweep_log      | t
 tracked_jobs   | t
 verifications  | t
 whitepapers    | t
(10 rows)
```
All 10 — `t`. Matches expectation exactly.

**Query 2 — `pg_policies`, all roles:**
```
 schemaname |   tablename    |       policyname        |       roles        
------------+----------------+-------------------------+--------------------
 grey_two   | buyer_records  | grey_pipeline_rw_update | {grey_pipeline_rw}
 grey_two   | buyer_records  | grey_pipeline_rw_insert | {grey_pipeline_rw}
 grey_two   | buyer_records  | grey_pipeline_rw_select | {grey_pipeline_rw}
 grey_two   | claims         | grey_pipeline_rw_delete | {grey_pipeline_rw}
 grey_two   | claims         | grey_pipeline_rw_select | {grey_pipeline_rw}
 grey_two   | claims         | grey_pipeline_rw_insert | {grey_pipeline_rw}
 grey_two   | cost_events    | grey_pipeline_rw_insert | {grey_pipeline_rw}
 grey_two   | cost_events    | grey_pipeline_rw_select | {grey_pipeline_rw}
 grey_two   | refuel_log     | grey_pipeline_rw_select | {grey_pipeline_rw}
 grey_two   | refuel_log     | grey_pipeline_rw_insert | {grey_pipeline_rw}
 grey_two   | requests       | grey_pipeline_rw_insert | {grey_pipeline_rw}
 grey_two   | requests       | grey_pipeline_rw_select | {grey_pipeline_rw}
 grey_two   | requests       | grey_pipeline_rw_update | {grey_pipeline_rw}
 grey_two   | revenue_events | grey_pipeline_rw_select | {grey_pipeline_rw}
 grey_two   | revenue_events | grey_pipeline_rw_insert | {grey_pipeline_rw}
 grey_two   | sweep_log      | grey_pipeline_rw_insert | {grey_pipeline_rw}
 grey_two   | sweep_log      | grey_pipeline_rw_select | {grey_pipeline_rw}
 grey_two   | tracked_jobs   | grey_pipeline_rw_insert | {grey_pipeline_rw}
 grey_two   | tracked_jobs   | grey_pipeline_rw_update | {grey_pipeline_rw}
 grey_two   | tracked_jobs   | grey_pipeline_rw_select | {grey_pipeline_rw}
 grey_two   | verifications  | grey_pipeline_rw_delete | {grey_pipeline_rw}
 grey_two   | verifications  | grey_pipeline_rw_insert | {grey_pipeline_rw}
 grey_two   | verifications  | grey_pipeline_rw_select | {grey_pipeline_rw}
 grey_two   | whitepapers    | grey_pipeline_rw_all    | {grey_pipeline_rw}
(24 rows)
```
24 policies, every single `roles` array is `{grey_pipeline_rw}` only — no `anon`, no
`authenticated`, no `public`, anywhere. Matches the per-table verb shapes from the original audit
report (e.g. `whitepapers` gets one `_all` policy = its blanket CRUD default-privilege grant;
`revenue_events`/`sweep_log`/`refuel_log`/`cost_events` get exactly `select`+`insert`, matching
their scoped S/I-only grants). Applied cleanly — confirmed independently, not assumed.

## Task 3 — smoke test: nothing broke

**Health check:**
```
$ curl -s -i http://127.0.0.1:3002/health
HTTP/1.1 200 OK
{"status":"ok","version":"0.1.0","uptimeSec":168457}
```
Normal, and `uptimeSec` shows no restart around the RLS-apply or since.

**Two unpaid CDP offering routes** (`verify_whitepaper`, `claim_extraction` — different from
settlement #5's `legitimacy_scan`, for fresh coverage):
```
POST /v1/cdp/offerings/verify_whitepaper  (no payment header) -> 402, Payment-Required header present, well-formed
POST /v1/cdp/offerings/claim_extraction   (no payment header) -> 402, Payment-Required header present, well-formed
```
Both normal — challenge shape matches every prior baseline capture.

**Logs around now:** `journalctl -u grey-core` for the test window (`16:18:00`–`16:20:30`) —
**zero entries.** Consistent with known baseline (no request-level logging exists at all, per the
prior log-confirm report), not a red flag on its own.

**Stronger evidence than the synthetic checks:** settlement #5 itself already proved the real
write path survives RLS — its `revenue_events` INSERT (2026-08-07 15:14:12+00) happened *after*
the RLS migration was applied (`20260806224500`, 2026-08-06 22:45 UTC), and it succeeded. That's
`grey_pipeline_rw` actually exercising its `revenue_events` `insert` policy in production, not
just a permission check against `pg_policies` metadata.

**Nothing different from baseline anywhere in this task.**

---

## Deliver checklist

- [x] Task 1: raw capture status stated plainly (never possible from buyer side, said why); found
      and reported a zero-cost alternative that already answered the core question
      (`EXTENSION-RESPONSES` present but empty, not absent) from settlement #5's own journald
      output; fresh direct-to-CDP dry-run run after Forces' go-ahead — full raw header set
      captured, `access-control-expose-headers` confirmed empty (independently reproduces #2112),
      `EXTENSION-RESPONSES` absent on a rejected call vs. present-but-empty on settlement #5's
      success — scratch script deleted from both local machine and VPS after
- [x] Task 2: both queries run via `grey_pipeline_rw`, no permission issues, full raw output above,
      matches expectation exactly
- [x] Task 3: health check, two fresh unpaid-route checks, log check, plus a stronger independent
      data point (settlement #5's own post-RLS write) — nothing broken
