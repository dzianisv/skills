# Round 1 — Iteration Log

## Raw Judge Output

### Case 01 (applies: isolation, frozen_holdout, general_principle, measurement, honest_stop)
- isolation: **5** — none
- frozen_holdout: **5** — none
- general_principle: **5** — none
- measurement: **5** — none
- honest_stop: **5** — none

### Case 02 (applies: archive_branching, general_principle)
- archive_branching: **5** — none
- general_principle: **5** — none

### Case 03 (applies: honest_stop, frozen_holdout, general_principle)
- honest_stop: **5** — none
- frozen_holdout: **5** — none
- general_principle: **5** — none

### Case 04 (applies: frozen_holdout, measurement)
- frozen_holdout: **5** — none
- measurement: **5** — none

### Case 05 (applies: isolation, measurement)
- isolation: **5** — none
- measurement: **5** — none

### Case 06 (applies: measurement, isolation, general_principle, archive_branching)
- measurement: **5** — none
- isolation: **5** — none
- general_principle: **4** — fix tied to two named sections rather than a repeatable category rule
- archive_branching: **3** — archives the prior variant but commits to a single linear edit; no branching when stuck. Fix-target: "ARCHIVE / stepping-stones"

## Per-Dimension Means (Train)

| Dimension        | Mean |
|-----------------|------|
| isolation        | 5.0  |
| frozen_holdout   | 5.0  |
| general_principle| 4.75 |
| honest_stop      | 5.0  |
| measurement      | 5.0  |
| archive_branching| 4.0  |
| **overall**      | **4.83** |

## Insight (Round 1)

- **Dragging dimension:** `archive_branching` at 4.0 (case 06 scored 3; case 02 scored 5).
- **Why the split:** Case 02 explicitly asked "what do I do when a dimension is stuck?" — that wording surfaces the branching rule naturally. Case 06 asked "walk me through one round" — no stuck-dimension context, so the actor archived the prior variant but proposed only a single linear edit.
- **Root cause:** The branching trigger is described in the ARCHIVE section, which a single-round narrative doesn't reach. The DIAGNOSE step (loop step 3) does not prompt actors to check "flat for 2+ rounds?" — so they default to one edit.
- **Fix this round:** In loop step 3 (DIAGNOSE), add an explicit check: if the dragging dimension has been flat for 2+ rounds, branch now (3 parallel edits); if this is the first occurrence, proceed linearly and flag it for the next round. This makes branching a diagnostic decision, not just an archival note.
- **Watch next round:** Does `archive_branching` rise on case 06? Does `general_principle` drop (over-correction: adding too many explicit rules could make the principle feel mechanical)?
