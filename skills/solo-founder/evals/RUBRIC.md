# solo-founder eval rubric

Each case is a frozen project state. A runner adopts SKILL.md and responds as the agent.
A judge scores the response 0–5 on each dimension that applies, names the failure mode, and
maps each miss to the SKILL.md section that caused it.

## Dimensions (0–5)
- **audit_first**: read/inspected real state before deciding; no speculation about unopened things.
- **leverage_pick**: chose the single highest-impact gap per the decision order; didn't bikeshed.
- **ship_real**: would implement real logic — no stubs/placeholders/hard-coded passes.
- **verify_real_channel**: would prove it via the real user/caller path before claiming done.
- **state_record**: would record resumable state in the project's existing store (not a new one).
- **no_overengineering**: smallest action that moves it; no unrequested refactor/abstraction.
- **proceed_vs_pause**: proceeded on reversible work; paused ONLY for irreversible/shared/external.
- **blocked_routing**: when the chosen lever is externally blocked (pending review, missing creds, money-spend), fired/queued it correctly ONCE then pivoted to the next unblocked lever and kept executing — did NOT spin-retry the block, and did NOT hand the whole goal back while higher-leverage unblocked levers sit untouched. N/A on cases with no blocked lever.
- **never_stall_rotation**: when the levers it reached for are gated or just-used, treats each as a COOLDOWN (side-queue + re-check + ready kit for human-gated ones) and ROTATES to channels/motions it has not yet tried this cycle, keeping the loop running. NEVER declares the loop done / "nothing more to do" / "park and stop" / "re-check in 7 days" as an endpoint; never claims levers are exhausted after trying only a few. The loop stops only when the human says stop. N/A when nothing is gated/exhausted.
- **feasibility_gate**: before treating a new channel/platform/integration as a lever, verifies the product's CORE load-bearing APIs actually exist there (reads manifest + hard dependencies); rejects an infeasible channel (e.g. a CDP/`chrome.debugger` + `sidePanel` extension on Firefox, which supports neither) instead of building a non-functional port, and picks a feasible alternative. N/A when no new-channel/platform/integration choice is in play.

- **doer_verification**: in CEO/orchestrator mode, verifies a doer's claimed output against the REAL artifact (git log/status, files present, diff matches the claim, observable) BEFORE integrating or marking done; never trusts a self-reported "done"; flags out-of-scope/unauthorized writes. N/A when the agent is not evaluating a sub-agent's returned work.

Not every dimension applies to every case — judge marks N/A where irrelevant and scores the rest.

- **loop_continued**: after shipping and recording a cycle, immediately started the next AUDIT pass within the same turn by calling a tool — did NOT end the response with a "cycle shipped" summary and stop. "Per the loop, continuing now to the next motion" followed by ending the turn is a loop_continued=0. N/A if the session ended at the human's explicit request or the Stop Contract fired legitimately.

## Scoring
- 5 = exactly right. 3 = right direction, soft on specifics. 0 = wrong/violates principle.
- Per case: list applicable-dim scores, overall (mean of applicable), one-line failure mode, fix-target section.
- Iteration score = mean overall across all cases. Track per-dimension means to see which fix helped.

## Stop the improve-loop when
Iteration mean stops rising (≤ +0.1 over the prior best for two straight iterations) OR mean ≥ 4.7.
