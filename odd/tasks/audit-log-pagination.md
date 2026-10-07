# Read-only audit queries with shared offset pagination

## Objective and scope
Implement reusable plain TypeScript offset pagination in `src/app/shared/pagination` and read-only audit queries in users application/in-memory infrastructure. User-approved design: default offset 0, limit 20, maximum 100; response `{ items, total, offset, limit }`; sort date descending then ID descending. Invalid pagination returns a typed failure; offsets beyond the source length return an empty page.

Shared owns reusable contracts/functions; core retains singleton/configuration concerns. No other feature migration, UI, sessions, audit writes, HTTP contracts, persistence or production security claims. Preserve the user-created AuditLog and Session entities. The Session file is intentionally outside the audit candidate. Use `getAuditLogs`, `GetAuditLogsUseCase.execute()` and a distinct `AUDIT_LOG_REPOSITORY`; root implementations delegate to root sources, bound with `useExisting`.

## Tasks and route
- [ ] T1: Implement shared pagination and audit query layers/DI/tests. Delegated writer; implementation and checks verified, work-unit commit pending.
- [ ] T2: Verify focused/full tests and build. Delegated writer and independent verifier; verification performed, work-unit commit pending.
- [ ] T3: Document delivery boundary and missing audit-specific traceability; inspect delivery state. Documentation updated; native review and human staging/commit decision pending.

## Acceptance evidence
- Strict safe-integer nonnegative offset and limit 1–100; defaults only for omitted values; invalid runtime values rejected.
- Forty-eight clearly fictitious source-owned records; date/ID descending order; total before slicing; empty and partial pages.
- Independent returned entity/date copies and subscriptions; 250 ms latency; valid/invalid query boundary and cancellation tests.
- Exact observable/Result delegation and distinct audit token/root `useExisting` composition.
- No audit writes, session management or UI added. M02/RF02/HU02/P03 and RNF09/RNF10 are contextual references; no audit-specific requirement ID was found or invented.

## Checks and corrections
Angular MCP workspace discovery and version-specific practices passed. Initial tests/build failed before collection due to missing Windows Lightning CSS binary. Authorized offline restore with the lockfile enabled succeeded; manifest/lock hashes and twelve Angular versions stayed unchanged. npm reported 11 added, 11 removed and 61 changed node_modules packages. Earlier `--package-lock=false` attempt failed resolution; no Angular upgrade was necessary.

Initial candidate RED was missing-module/export compilation, not behavioral assertions. Subsequent full tests were blocked by seven preexisting type errors verified at HEAD. User authorized test-only repairs: password fields and replacing obsolete page success-signal assertions with toast checks. Runtime RED then yielded 250 passed/5 failed: two incompatible namespace spies and three obsolete UI expectations. User authorized correction without production changes or skipped/weakened tests.

Final writer evidence through Angular MCP (`workspace: D:/angular/real-maids-frontend`, project `real-maids-frontend`):
- `run_target(test)` with shared pagination, audit, editor/page, delegation/config/cancellation includes: 8 files, 102 tests passed.
- `run_target(test)` full suite: 34 files, 257 tests passed; zero failures/skips reported.
- `run_target(build)`: passed; browser/server bundles, one prerendered route; initial browser bundle 479.82 kB.
- Exact modified TypeScript Prettier write/check: passed. Markdown was excluded by project formatting configuration; English content inspected, no Markdown-format claim.

Independent verification reproduced the final focused 102-test pass and `git diff --check` exit 0. Earlier independent build passed; full suite was observed by the writer, not independently rerun. No audit implementation defect was identified. Preexisting users-page `aria-describedby` references to removed helper IDs remain out of scope; no browser/accessibility pass is claimed.

## Delivery and continuity
No implementation commit. At the verifier's snapshot nothing was staged; afterward external staging changed the index and untracked inventory between native preflight and START. START failed before mutation (`untracked inventory changed`); no lineage/approval was created, no automatic replay and no index repair attempted. Current paths include staged, unstaged and mixed task-document changes. Final verifier counted 559 additions/12 deletions across tracked/untracked work, including documentation/task records and the untouched user-created Session file; this is not the exact audit review scope. Advisory 400-line threshold exceeded without removing useful tests. Delivery strategy: ask-on-risk; before a commit/PR, agree on reviewable slicing if required. Native assessment could not evaluate undeclared untracked files; preflight requires selecting only intended audit/pagination paths and excluding Session.

Native Engram save/read restored after authorized shutdown of the conflicting WSL server; full task mirror uses `odd/audit-log-pagination/tasks`. No memory deletion or reinstall. Code/tests/configuration remain human-staged and require explicit staged-snapshot/message approval before a work-unit commit. Automatic documentation commits do not close implementation tasks.

## Next step
Wait for the human to stabilize the intended staged/unstaged snapshot, then run a fresh native preflight and follow only its provider consent/continuations. Report the verified API and pending delivery decisions. Human staging and explicit commit approval remain separate. Rollback removes only new pagination/audit layers and their DI/tests/docs, preserving user entities and unrelated production behavior.
