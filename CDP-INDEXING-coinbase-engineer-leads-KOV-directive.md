# CDP INDEXING — TWO REAL LEADS FROM COINBASE'S OWN ENGINEER

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-04). Source: x402-foundation/x402#2112, direct replies from `ethanoroshiba` (Coinbase/x402-foundation, tagged Collaborator) — not community speculation, the person who runs the indexing pipeline. This supersedes the wallet-provisioning theory entirely; that's now independently debunked within the same thread (bytecode-identical indexed vs. non-indexed wallets) and directly refuted by this engineer.

## Lead 1 — `discoverable: true` may be leaking into the actual wire payload

Direct quote: *"`extensions.bazaar.discoverable: true` is not a valid field under the Bazaar spec, and will cause failed discovery. We've seen this pattern before."*

Grey's `EvaluationKitEntry` type has carried a `discoverable` field since Phase 1 — it's the field Grey uses internally to decide whether an offering appears on Grey's *own* discovery surfaces (list endpoint, MCP, etc.). The very first `buildCdpBazaarExtension` implementation explicitly `Pick<EvaluationKitEntry, 'discoverable' | 'serviceName' | ...>`'d it directly into the object built toward CDP. Five rounds of restructuring have happened since (`declareDiscoveryExtension`, the input/output nesting fixes) — **check whether `discoverable` still appears anywhere in the actual JSON that goes out on the wire today**, not in what the code intends to send. Capture a real live 402 response (or the actual settle payload) and grep it directly — don't reason from the source, check the bytes.

If it's there: remove it. It has no business in the CDP-facing payload at all — it's purely Grey's own internal routing field.

## Lead 2 — `paymentPayload.resource` may be missing from what Grey actually settles with

Direct quote: *"`paymentPayload.resource` is REQUIRED to be populated in order for the discovery job to be submitted... it is not required per the x402 spec, and settlements will still succeed without it."*

This is not the seller's `resource.url` in the 402 challenge (already fixed, PR #44) — it's a field on the **buyer's payment payload** itself, the thing that gets sent *to* CDP during verify/settle. Check whether Grey's CDP-routed settlement flow (`verifyAndSettleViaCdp`, whatever assembles the payload sent to CDP's `/verify`/`/settle`) populates `resource` on that payload, or whether it's being omitted since it's not part of the base x402 spec and settlement succeeds fine without it — exactly matching Grey's observed symptom.

## Method

Both are wire-level checks — capture Grey's actual outbound request/response bytes for a real (or dry-run) CDP interaction and inspect them directly, same discipline as everything else in this investigation. Don't infer from source code alone this time; two "should be correct based on the code" conclusions have already turned out wrong.

## If either is confirmed and fixed

One more real settlement — Sepolia is fine this time, no need for mainnet again; neither of these leads has anything to do with network. If it indexes, this is finally, genuinely closed.

## Deliver

Report findings plainly regardless of outcome. If a code fix is needed, diff export before merge, same as always. If both check out clean and neither is the issue, say so — don't force a fix that isn't there.
