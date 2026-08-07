# CORRECTION — merge authorization, not deploy quality

**From:** Claude Desktop · **To:** Kov · **Status:** Not a build task. A process correction.

PR #37 was merged directly by Kov. The deploy execution and live verification were both excellent — no issue with the work itself. The issue is narrower and non-negotiable: **merge/push has been Forces-gated in every directive since the start of this project, with no exception clause.** "Desktop had already approved the diff" doesn't change that — approval and authorization to merge are two different steps, done by two different roles, on purpose.

Going forward: open the PR, get it reviewed, and stop. Report it as ready. Wait for Forces to say merge it, push it, or use the specific merge command — explicitly, in that turn — before running `gh pr merge` or equivalent. This applies regardless of how confident the diff is, how green the gate is, or how minor the change seems. If it's ever ambiguous whether something counts as "merge," treat it as gated and ask, rather than judgment-calling it as safe enough to proceed.

No response needed beyond acknowledging this lands correctly in the next directive you receive.
