# Dedicated user status update

## Objective and scope
Provide `updateUserStatusById(id, isActive)` through the users repository contract, implementation, in-memory source, stateless use case and presentation store. Route the existing confirmation dialog through this operation instead of reconstructing the full profile. Traceability: M02/RF02/HU02/P03, RNF09/RNF10/RNF12.

Preserve current confirmation, pending guards, errors, retry direction and component cancellation. Resolve the latest source record inside cancellable delayed execution; change only isActive and normal updatedAt, preserving other fields and defensive dates. Retain generic profile updates. No new ACL, backend endpoint, auth semantics or self-deactivation rule.

## Work unit and route
One cohesive work unit; delegated writer required by multi-file write rule. Read-only mapping completed by gentle-ai-explore. Forecast for this refactor: 120–190 authored additions/deletions. Prior UI candidate contains 373 changed lines, so the combined future PR may exceed 400; resolve delivery slicing before a commit/PR proposal. Strategy: ask-on-risk. No staging, commit, push or PR authorized.

## Tasks
- [ ] T1: Implement dedicated status operation and wire existing confirmation with test-first evidence (implemented and writer-tested; awaiting approved commit).
- [ ] T2: Verify focused users/config tests, full suite, production build and diff structure (in progress; writer checks passed, independent verification running).
- [ ] T3: Review work-unit snapshot and obtain human staging/commit approval (pending).

Tasks remain open until implementation/check evidence and an approved work-unit commit exist.

## Acceptance and checks
- Repository/use case/source/store accept only ID and desired boolean for status mutation.
- Both directions work, repeated desired status is safe, missing user fails without mutation.
- Latest profile/access metadata survives concurrent profile edits.
- Cancellation before the 250 ms execution boundary prevents mutation.
- Store updates matching row/revision and preserves existing loading/error handling.
- Confirmation remains mandatory, with cancel, duplicate guards and safe retry/destruction behavior.
- Focused: `npm test -- --watch=false --include='src/app/features/users/**/*.spec.ts' --include='src/app/core/config/app.config.spec.ts'`.
- Full suite: `npm test -- --watch=false`; production build: `npm run build` (Angular MCP equivalents preferred).
- `git diff --check`; browser visual/keyboard checks pending, no new layout intended.

## Evidence and review disposition
Prior UI implementation: writer reported RED then GREEN; 312 full-suite tests and production browser/server build passed; independent verification passed 32 focused tests with no findings. Current staged prior UI files must be preserved; no parent staging performed.
Native review of exact prior target `sha256:a8bd420b30994307b4718c69a8ab1d41a4e1bc56444a5db6ff37f781c3c730cf` was declined through interactive host; no lineage created. This disposition does not cover the forthcoming refactor candidate.

## Refactor evidence
Writer completed the dedicated operation and dialog wiring: RED observed 5 new source-test failures, GREEN passed 178 focused tests across 16 files, full suite passed 323 tests across 37 files, and production browser/server build passed with one prerendered route. `git diff --check` passed with line-ending warnings. Authored refactor: 201 additions and 22 deletions; new use-case file is untracked. Parent aligned the Spanish README with the dedicated operation. Source preserves execution-time profile fields and metadata. No staging or source commit performed.

Native review was declined via interactive host for stable candidate `sha256:8bf3934f3bbd910383320810e417af2832184e9a58b7ae5d6d674e511567ee9c` (17 files, 552 changed lines); no lineage created. ASSESS could not assess the untracked file and returned an independent-verifier requirement; gentle-ai-verify is running the focused users/config test command and checking the implementation read-only. No claim of native review approval. Browser checks remain pending.

## Next step
Collect independent verification, update evidence and report implementation readiness. Human staging and explicit snapshot/message approval remain necessary before any source commit. Current index contains the prior UI only and excludes the refactor; partially staged paths must be reconciled by the human.
