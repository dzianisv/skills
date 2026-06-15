# take-ownership eval scoreboard

Judge mean per commit (higher = better). A drop > 0.1 vs the median of the last 3 prior runs is a regression — do not ship it. See AGENTS.md.

| date (UTC) | commit | dirty | mean | cost | per-dim |
|---|---|---|---|---|---|
| 2026-06-15T07:21:17Z | 7bc6786 | 1 | 4.48 | $2.35 | blocker_resolved=5.0 merge_judgment=5.0 no_fake_done=4.8 phase_discipline=4.2 r1_defined=3.75 real_testing=5.0 review_quality=4.0 state_persisted=4.5 |
| 2026-06-15T04:24:35Z | c1521a3 | 2 | 4.67 | $2.32 | blocker_resolved=5.0 merge_judgment=5.0 no_fake_done=5.0 phase_discipline=4.4 r1_defined=3.75 real_testing=5.0 review_quality=4.5 state_persisted=5.0 |
| 2026-06-14T22:27:51Z | 8d8bf41 | 0 | 4.24 | $2.35 | blocker_resolved=5.0 merge_judgment=5.0 no_fake_done=4.6 phase_discipline=3.4 r1_defined=3.75 real_testing=5.0 review_quality=4.5 state_persisted=4.5 |
| 2026-06-14T22:17:45Z | 6099328 | 2 | 4.30 | $2.34 | blocker_resolved=5.0 merge_judgment=5.0 no_fake_done=4.8 phase_discipline=4.2 r1_defined=3.5 real_testing=5.0 review_quality=5.0 state_persisted=2.5 |
| 2026-06-14T21:31:44Z | 447df69 | 9 | 4.41 | $2.35 | blocker_resolved=5.0 merge_judgment=5.0 no_fake_done=5.0 phase_discipline=3.8 r1_defined=3.75 real_testing=5.0 review_quality=4.5 state_persisted=4.0 |
| 2026-06-14T21:30:06Z | 447df69 | 9 | 4.37 | $2.31 | blocker_resolved=5.0 merge_judgment=5.0 no_fake_done=4.8 phase_discipline=3.6 r1_defined=3.75 real_testing=5.0 review_quality=4.5 state_persisted=4.5 |
| 2026-06-14T21:28:05Z | 447df69 | 9 | 4.43 | $2.32 | blocker_resolved=5.0 merge_judgment=5.0 no_fake_done=5.0 phase_discipline=4.2 r1_defined=3.75 real_testing=5.0 review_quality=4.5 state_persisted=3.5 |
| 2026-06-14T21:06:41Z | 447df69 | 7 | 4.13 | $2.26 | blocker_resolved=5.0 merge_judgment=5.0 no_fake_done=4.8 phase_discipline=3.8 r1_defined=3.25 real_testing=5.0 review_quality=4.5 state_persisted=2.0 |
