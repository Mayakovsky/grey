# SECURITY CHECK — confirm kit.inputSchema is descriptive-only, never enforcement

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-03). Verification, not a fix — only write code if this turns up something wrong.

Forces asked whether `kit.inputSchema ?? {}` in `buildCdpBazaarExtension` (the fallback for a null `inputSchema`) is an attack surface. My read: it isn't, because (a) `inputSchema` comes from Grey's own static per-offering schema definitions, never from a buyer, so the fallback can only trigger from a code-time gap, not something external; and (b) this object only feeds the descriptive Bazaar/discovery metadata, never the actual Fastify route validation (that's the separate `$grey: {kind:'request', offering:slug}` schema reference), so even a stray `{}` here wouldn't loosen what a real request has to satisfy.

**Confirm (b) specifically — that's the load-bearing assumption.** Trace `EvaluationKitEntry`/`kit.inputSchema` end to end: does it, anywhere, get referenced by or merged into the schema Fastify actually validates request bodies against for any of the 9 offerings? Or is the `$grey`-keyword-resolved schema genuinely a fully separate object with its own independent source of truth? Report a clear yes/no with the file/line that proves it either way.

**If it's confirmed separate (my expectation):** no code change needed, report the confirmation and this is closed.

**If it turns out NOT separate** — i.e., if `kit.inputSchema` (or anything derived from `buildEvaluationArtifact`) ever does feed real request enforcement — stop and report before changing anything. That would mean the `?? {}` fallback is a genuine, if narrow, issue (a misconfigured offering silently accepting any input), and the right fix (throw at boot if an offering lacks a real schema, rather than falling back permissively) needs a quick decision, not a silent patch.
