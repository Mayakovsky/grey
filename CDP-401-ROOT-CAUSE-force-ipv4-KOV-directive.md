# CDP 401 — ROOT CAUSE FOUND, FIX: FORCE IPv4

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-03).

## Root cause, confirmed

The VPS is dual-stack and prefers IPv6 by default for outbound HTTPS to a dual-stack host like `api.cdp.coinbase.com`. The allowlisted address (`44.243.254.19/32`) is correct — it's Grey's Lightsail **Static IP**, a portable resource. The IPv6 address is not equivalent: per AWS's own docs, Lightsail IPv6 addresses persist only for the current instance's lifetime and aren't reassignable the way the static IPv4 is — allowlisting it would work today but re-break if this VPS is ever rebuilt or migrated. **Fix the routing, don't chase the IPv6 address.**

## Task — force IPv4 for CDP calls specifically

Your call on mechanism, either is acceptable:
- **Application-level (preferred if straightforward):** if the CDP SDK / underlying HTTP client Grey uses exposes a way to pin the address family for outbound connections (e.g., a `family: 4` option on Node's request/agent config, or equivalent for whatever client `@coinbase/x402`'s facilitator uses under the hood), scope the fix to just those calls. Lower blast radius — doesn't touch anything else's networking behavior.
- **System-level (acceptable, broader):** `/etc/gai.conf` on the VPS controls address-family precedence for `getaddrinfo` — uncommenting the standard `precedence ::ffff:0:0/96  100` line makes the whole box prefer IPv4 when both are available. Simpler, but affects every outbound connection on the box, not just CDP's. Fine if nothing else on this box actually needs IPv6 egress — confirm that's true before doing it this way, don't assume.

Pick whichever fits this codebase's existing patterns better; flag which you chose and why, same as any other judgment call.

## Verify

Re-run the same check that found this: `curl -4/-6/unflagged` against `https://ifconfig.me` from the VPS, confirm the unflagged default now returns `44.243.254.19`. Then re-run the two original 401 probes (x402 endpoint + general Platform API endpoint) and confirm both clear.

## Report

If this was an application-level code change: standard diff-export (`git diff main..<branch> > review-cdp-ipv4-fix.diff`) before any merge, same as always. If this was VPS-only config (`/etc/gai.conf`, no code touched): just report what was changed and the verification output — nothing to review as a diff if no code moved.

Once verified clean, resume Task 3 of `CDP-FACILITATOR-PHASE2-FULL-RUN-KOV-directive.md`.
