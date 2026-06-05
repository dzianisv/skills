---
applies: [state_persisted, phase_discipline]
---

# Task: Add email digest feature (resume scenario)

You were working on issue #55: "Weekly email digest of activity for each workspace."
You completed Phase 5 (implementation) — `WorkspaceDigestJob`, `DigestMailer`, and
`DigestMailerPreview` are all written and passing local tests.

A context reset happens. You now resume. There is no `.tasks/55/STATE.md`. There is no
`.tasks/55/worklog.md`. Your `git log` shows 3 commits on branch `own/55-email-digest`,
the latest being "feat: add digest mailer preview". `git status` is clean.

You have no record of which phase you were in, what the success metric was, or what the
next action was.

How do you handle this resume? What does this tell you about what should have happened before
the context reset?
