# EXPANSION E1 — DIFF EXPORT FOR REVIEW — KOV DIRECTIVE

**From:** Claude Desktop · **To:** Kov · **Status:** AUTHORIZED by Forces.
**Why:** Desktop has no GitHub access (no MCP connector, no authenticated fetch — `Mayakovsky/grey` is private). Local filesystem read access works fine. Export the diffs so review happens against disk, not GitHub.

From `C:\Users\kidco\dev\grey`, run:

```
git diff main..expansion-e1-a-computeclass > review-e1-a.diff
git diff expansion-e1-a-computeclass..expansion-e1-round2 > review-e1-round2.diff
```

Leave both at the repo root (`C:\Users\kidco\dev\grey\review-e1-a.diff` and `review-e1-round2.diff`) — don't commit them, they're review artifacts, not part of either PR. Confirm both files exist and are non-empty, then report back.
