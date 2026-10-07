# Read-only audit queries with shared offset pagination

## Objective and scope
Implement reusable plain TypeScript offset pagination in `src/app/shared/pagination` and read-only audit queries in users application/in-memory infrastructure. User-approved design: default offset 0, limit 20, maximum 100; response `{ items, total, offset, limit }`; sort date descending then ID descending. Invalid pagination returns a typed failure; offsets beyond the source length return an empty page.

Shared owns reusable contracts/functions; core retains singleton/configuration concerns. No other feature migration, UI, sessions, audit writes, HTTP contracts, persistence or production security claims. Preserve the user-created AuditLog and Session entities. The Session file is intentionally outside the audit candidate. Use `getAuditLogs`, `GetAuditLogsUseCase.execute()` and a distinct `AUDIT_LOG_REPOSITORY`; root implementations delegate to root sources, bound with `useExisting`.

## Tasks and route
- [x] T1: Implement shared pagination and audit query layers/DI/tests. Delegated writer; verified and committed in `5babad56c7d6a8c6ba25cacee00ab6ee611f2256`.
- [x] T2: Verify focused/full tests and build. Delegated writer and independent verifier; observed verification included in that work-unit commit.
- [x] T3: Document delivery boundary and missing audit-specific traceability; inspect delivery state. Documentation included; human approved the exact staged snapshot/message and explicitly declined review for this candidate.

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
Human approved all 21 staged files (576 additions/29 deletions), including the preexisting UserSession entity, and the exact Conventional Commit message. HEAD and raw staged-diff SHA-256 were rechecked unchanged immediately before commit. Commit: `5babad56c7d6a8c6ba25cacee00ab6ee611f2256` — `feat(users): add read-only audit queries with shared offset pagination`. Post-commit index/worktree were clean before this bookkeeping update. No push.

An earlier START failed before mutation because external staging changed untracked inventory. Fresh preflight/START for the final target `sha256:428a2f2cf9685df0ec30ff07e58d5ac141d63e903686fb7f67f339936ba70778` received explicit candidate-scoped human decline through the interactive host. No lineage or review approval was created; RDD remains enabled. Independent ordinary checks stand. Candidate exceeds the advisory 400-line budget; the human approved this complete work-unit snapshot. PR splitting remains a separate future decision.

Native Engram save/read restored after authorized shutdown of the conflicting WSL server; full task mirror uses `odd/audit-log-pagination/tasks`. No memory deletion or reinstall. Code/tests/configuration remain human-staged and require explicit staged-snapshot/message approval before a work-unit commit. Automatic documentation commits do not close implementation tasks.

## Next step
Implementation work unit closed. Report commit and checks; push/PR or audit UI are separate human decisions. This bookkeeping documentation update follows the runtime's separate documentation policy and does not alter the committed implementation. Rollback scope is the committed audit/pagination layers, DI/tests/docs; preserve user entities and unrelated production behavior when selecting a rollback.
