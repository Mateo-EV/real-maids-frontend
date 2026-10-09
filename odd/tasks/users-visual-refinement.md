# Users visual refinement

## Objective
Bring `/admin/users` closer to the supplied Auth/IAM HTML through six visual refinements while preserving behavior and responsive accessibility.

## Scope and constraints
- Typography, content width, header hierarchy, metric cards, filter/table density, user editor and confirmation dialog presentation.
- User chose locally hosted Plus Jakarta Sans; preserve license and system fallbacks, no runtime Google Fonts requests.
- Reuse installed Helm primitives and existing semantic colors. Add shared styles only for demonstrated repeated patterns; no speculative generic wrappers.
- Preserve real session identity, mobile cards, disabled future tabs, existing fields, validation, CRUD/status behavior and cancellation guards.
- No entity links, password reset, forced password changes, session/RBAC/audit implementation or new security claims.
- Existing metrics remain decorative; no copy/disclaimer changes.

## Tasks
- [ ] T1 — Implement local font and reusable visual refinements. Status: in progress. Route: delegated worker (multiple nontrivial files).
- [ ] T2 — Verify focused tests, full suite/build and proportional responsive/accessibility structure. Status: pending. Browser validation must be reported unavailable if not performed.
- [ ] T3 — Review candidate and await human staging and explicit snapshot/message approval before commit. Status: pending.

## Acceptance and checks
- All six agreed visual areas updated; current behavior retained.
- Licensed locally served font, shared palette/Helm controls reused; no remote font dependency.
- Spartan CLI inventory before UI edits.
- Focused page/editor/dialog tests plus full Angular test and build targets.
- Pure styling has no meaningful behavioral RED; preserve behavior tests and use structural assertions where valuable, without brittle class-only tests.
- No autonomous source staging/commit. Tasks remain open until checks and approved commit exist.

## Delivery
Single coherent visual work unit; forecast approximately 250–400 authored changed lines, generated lockfile/font assets excluded. Ask on review workload risk if scope grows across unrelated areas.

## Evidence and progress
- Baseline clean, HEAD `f89032f00d7c365a2d5f88c6f15d4886e68459ba`.
- Read-only source comparison and bounded planning completed; Angular 22 workspace/build/serve/test discovered, best practices loaded.
- Explorer could not run Spartan inventory; worker must run it before UI edits.
- No browser rendering comparison has occurred.

## Next step
Delegate bounded implementation with installed Helm controls, local licensed font and exact checks.
