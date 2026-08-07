# CDP 401 — CONFIRM ORIGIN IP, RUN NOW

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces (2026-08-03). Single check, report back immediately.

Forces confirms the CDP key itself is correct (Secret API Key, allowlist reads `44.243.254.19/32` — standard CIDR for "exactly this one address," not a formatting issue). So the only remaining variable is whether Task 3's calls actually originate from that address.

Run this from **wherever Task 3's calls actually execute** — if that's the VPS, run it over SSH; if it's local, run it directly:

```
curl -s https://ifconfig.me
```

Report the exact output. If it matches `44.243.254.19`, the IP isn't the problem and we look elsewhere. If it doesn't match, that mismatch is the bug — report the actual value and stop there, don't attempt a fix yourself, since correcting the allowlist is Forces' side (Portal access).
