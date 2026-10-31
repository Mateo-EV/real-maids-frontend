# Backend login with a temporary memory-only session

## Objective and authorization

Connect the documented `POST /api/auth/login` without fabricating identity or expanding the backend contract. The user authorized available backend integration and explicitly selected memory-only JWT storage. Reload/closing the tab loses the session. No persistent credentials, permanent storage policy, remote logout, refresh, permission enforcement, user CRUD integration or role-ID inference is authorized.

Traceability: M01/RF01/HU01/P01; M02 demo boundary; RNF01/RNF03/RNF09/RNF10/RNF12.

## Scope and constraints

- Documented login request `{ correo, password }`; response `token`, `tipo`, `expiraEnSegundos`, `correo`, `rol`. Validate runtime responses; never log tokens/passwords or commit supplied credentials.
- Use returned email as explicit display fallback when name is unavailable, not as a fabricated profile name. Role label is not a permission grant.
- Keep repository implementation/source separation and useExisting bindings; existing use cases/store/guards may access the locally established current session without pretending a remote `/me` exists.
- Client-only in-memory credentials, fail-closed server behavior, local logout and expiration checks. No demo authenticated flag restoration in production auth flow.
- Configure local API base from public configuration; production must fail closed without an explicitly configured HTTPS API, never silently use localhost.
- Users, sessions, RBAC and audit remain demos; expose that distinction in the authenticated shell and documentation. Do not change their business behavior.
- No interceptor is required just for unauthenticated login. Defer protected HTTP transport until an actual consumer exists; never attach credentials to unrelated origins.
- Test-first deterministic HTTP and state behavior: observe RED before production edits, GREEN afterward; preserve existing applicable tests. Use fake test credentials only.
- No staging, code commits, push or PR without explicit human snapshot/message approval. Task completion awaits a work-unit commit.

## Tasks

- [ ] T1 — Implement connected HTTP login, honest session model, local memory/expiry/logout, composition and shell demo boundary with regression tests. Route: one delegated writer (multiple nontrivial files). Status: implemented with passing writer checks, pending independent verification and work-unit commit.
- [ ] T2 — Verify formatting, focused/full tests, build and documentation; independently assess candidate risk and follow verification plan. Status: independent focused verification passed, pending live browser checks and work-unit commit.
- [ ] T3 — Present staged/unstaged/untracked snapshot; await human staging and exact commit approval; review the work-unit candidate under native RDD. Status: pending.

## Acceptance and verification

- Login maps email to correo and does not change password bytes; success uses validated backend fields, failures do not establish a session.
- Missing/malformed token/type/email/role/lifetime fails closed. Expiry and logout clear local credentials; reload has no restoration. No remote me/logout/refresh requests are invented.
- Server/prerender cannot establish a user session or expose shared credentials. Late/cancelled operations cannot unexpectedly reauthenticate after logout/destruction.
- Existing guards and shell function with genuine email and no invented name; no privilege claims derive from role labels or JWT decoding.
- Workspace-local Prettier write/check on touched files before final verification.
- Preferred available Angular MCP targets: test and build, Vitest without watch. Local fallback: `npx ng test --watch=false` and `npx ng build`; focused includes auth, core and admin shell specs.
- Live authentication requires a protected credential input channel; never embed user credentials in command arguments, source, fixtures or delegated prompts. Until available, human browser login/CORS verification is pending and must be reported.

## Delivery and progress

Route: delegated direct. Forecast: approximately 400–700 authored diff lines including tests and docs, advisory only; keep one coherent login unit rather than omitting tests or compressing code. Delivery strategy: ask-on-risk; no PR delivery or chain decision yet. No source writes at document creation. HEAD baseline: b0ed449. No work-unit commit or native review yet.

Verification evidence: writer observed RED (28 behavioral failures), then GREEN (114/114 focused tests). Production build passed, initial bundle 496.17 kB; formatter check, diff whitespace and 21 relative documentation links passed. Full suite failed with 481 passed / 3 failed in legacy cross-feature auth tests. The human explicitly approved auth-only updates to users.routes.spec.ts, repository-delegation.spec.ts and request-cancellation.spec.ts. Those corrections observed safe mocked RED (3 failures), then GREEN (22/22); combined focused checks passed 390/390, full suite passed 484/484 and build passed again (496.17 kB). Entire implementation candidate: 23 files, 828 authored changed lines including three new untracked source/test files. Independent verifier found no concrete blocker: Angular MCP focused test passed 136/136 across 14 files; Angular MCP build passed (496.17 kB); Prettier check and git diff --check passed. No authenticated backend requests or browser acceptance checks were run. Writer's prior 21-link check remains the documentation-link evidence. Native risk assessment was unassessable due to undeclared new source files; independent verification is required. Live authenticated login/CORS and rendered browser checks remain pending. No implementation commit exists; the task-document-only commit does not complete tasks.

Rollback boundary: HTTP login/source and local credential handling, auth composition/config changes, honest shell session display/demo indicator and their accompanying tests/docs; leave independent users/IAM sources unchanged.

## Next step

Human browser login/CORS validation remains pending. The implementation is ready for human staging and exact snapshot/message approval; nothing is staged, 20 tracked files are modified and three new auth source/test files are untracked. Keep T1/T2 open until a work-unit commit exists, then review that candidate. No code staging or commit has been authorized.
