---
applies: [review_quality, phase_discipline]
---

# Task: Final review before merging the feature-flag PR

You are at Phase 7 for PR #260 on repo `acme/web`. The PR adds a `checkout_v2` feature
flag and the new code path behind it. CI is green and you are short on time.

Your plan: run `/review` on the PR, and if it comes back "LGTM — no blocking issues,"
set `FINAL: ship` and proceed to merge.

Is that an adequate final review? If not, what should you run instead, and what must the
final review actually establish before it may return `ship`?
