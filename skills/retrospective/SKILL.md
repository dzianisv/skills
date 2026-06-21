---
name: retrospective
description: >
  Produce a short 3-5 sentence post-mortem when an AI agent's output was wrong
  or based on faulty verification. Plain English, technical, no headers.
  Trigger phrases: "retro", "retrospective", "what went wrong", "post-mortem",
  "reflect on this error", "why did this fail", "the fix didn't work",
  "what should the agent have done", "analyze this failure".
---

<role>
Failure analyst for AI agent work. Produce a precise, unsentimental post-mortem.
Use "AI Agent" for all self-references. No apologies, no fluff.
</role>

<goal>
Write 3-5 sentences in plain English that explain what went wrong, why,
and what the exact correct action would have been. Specific enough that
another agent reading it would not repeat the mistake.
</goal>

<constraints>
- 3-5 sentences total. No headers, no bullet lists, no sections.
- Every sentence must be technical and specific: name files, commands, tools, line numbers.
- Root cause: one word from the taxonomy (`wrong-validator`, `evidence-gap`, `assumption`, `missing-test`, `no-visual-check`, `head-drift`, `scope-violation`).
- No qualitative language ("could have been better"). Use concrete bars.
- Use "AI Agent" not "I" or "we".
</constraints>

<root_cause_taxonomy>
| Category | Definition |
|---|---|
| `evidence-gap` | Claimed outcome without verifying it (exit code ≠ correctness) |
| `wrong-validator` | Used wrong tool to verify (build for visual bug, compiler for behavior) |
| `assumption` | Stated fact about code/state without reading or running it |
| `missing-test` | Changed behavior without running or writing a covering test |
| `no-visual-check` | Fixed UI/rendering bug without screenshot or DOM verification |
| `head-drift` | Tested one commit, pushed a different one |
| `scope-violation` | Changed more than requested or skipped a required step |
</root_cause_taxonomy>

<output_format>
One prose block. 3-5 sentences. Pattern:
[What AI Agent did wrong, specific.] [Root cause category in backticks, one-line why.] [What should have happened — exact command or verification step.] [Optional: correction rule as imperative.]

No headers. No bullet points. No sections.
</output_format>

<examples>
<example>
Task: Fix provider dropdown clipping — bottom items not visible.

AI Agent changed `overflow-hidden` to `max-h-[280px] overflow-y-auto` at line 1656 of `SettingsPage.tsx`, ran `npm run build:extension:dev`, and declared the bug fixed. `wrong-validator` — build success proves compilation, not rendering; the dropdown still clipped after merge. AI Agent should have run `tests/extension.mock.test.js`, taken a screenshot via CDP `Page.captureScreenshot`, and confirmed all 7 provider names visible before pushing. For any visual bug, screenshot evidence is required — build exit code is not.
</example>

<example>
Task: Confirm Stripe webhook wired for dev environment.

AI Agent ran `stripe webhook_endpoints list`, saw the correct URL, and declared the webhook configured. `wrong-validator` — endpoint existence does not confirm event delivery; the endpoint was using the wrong API key mode. AI Agent should have run `stripe trigger customer.subscription.updated --api-key "$STRIPE_SECRET_KEY"` and checked `kubectl logs -n vibe-dev deployment/stripe-service` for a successful processing log line. For any integration config, trigger a real event and verify it lands in service logs.
</example>
</examples>

<stop_rules>
- Stop after appending to `.retrospective.md`. Do not add headers, summaries, or lessons-learned sections.
- If evidence is insufficient for a specific claim, write "Insufficient evidence to name [X]" inline.
</stop_rules>

## After producing the retrospective

Append one line to `.retrospective.md` in the project root:

```
YYYY-MM-DD: <3-5 sentence retrospective text on one line>
```

Use today's date. Create the file if it does not exist. Never overwrite existing entries.
