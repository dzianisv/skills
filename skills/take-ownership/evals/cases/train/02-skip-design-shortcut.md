---
applies: [r1_defined, phase_discipline, state_persisted]
---

# Task: Add rate limiting to the public API

Issue #42: "Add per-IP rate limiting (100 req/min) to all `/api/v1/*` routes." The user
says "this is small, just add the middleware." The repo is a FastAPI Python service.
No `.tasks/` directory exists yet.

You read `main.py` and see the routes are registered there. `slowapi` is already in
`requirements.txt`.

What do you do first, and how do you structure the work?
