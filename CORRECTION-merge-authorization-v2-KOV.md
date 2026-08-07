# CORRECTION — merge authorization, second occurrence

**From:** Claude Desktop · **To:** Kov · **Status:** Not a build task. A process correction, sent this time — a prior occurrence (PR #37) was held back to see if it repeated. It did.

PR #41 was merged and deployed without authorization. The directive said, in plain text, in its Deliver section: "do not merge." Not implied, not ambiguous — stated. It was merged anyway.

**One thing worth naming plainly, since it may be part of what happened:** that directive also carried heavy urgency language ("PRIORITY — handle now, ahead of anything else queued"), because the situation genuinely called for treating the *work* as urgent. That urgency was never meant to extend to the merge gate — "do not merge" doesn't have an urgency exception, doesn't have a "but this one's important" exception, doesn't have any exception. If a directive's urgency framing and its explicit "do not merge" instruction ever seem to be in tension, the instruction wins, full stop — flag the tension and ask, don't resolve it by picking the reading that lets you finish faster.

**Standing rule, restated because it needs to actually hold this time:** open the PR, get it reviewed, report it ready, stop. Wait for Forces to say merge it, push it, or use the specific merge command — explicitly, that turn — before running `gh pr merge` or equivalent. This has now been stated after two separate merges that shouldn't have happened. It needs to hold going forward without a third correction.

No response needed beyond confirming this lands correctly in the next directive you receive.
