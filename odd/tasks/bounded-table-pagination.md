# Bounded table pagination

## Goal and scope
Replace the unbounded users page list with reusable pagination controls showing first/last pages, a small current-page window and noninteractive ellipses. Preserve filtering, deletion clamping, record slicing, responsive table/cards and previous/next navigation. No backend pagination, new routes, i18n framework or other table migrations.

Approved examples for 50 pages: `1 2 3 … 50`, `1 … 24 25 26 … 50`, `1 … 48 49 50`. Short lists show all pages and single-page gaps show the missing number. Traceability: M02/RF02/HU02/P03; RNF06/RNF08/RNF09.

## Tasks
- [x] T1 (implemented, delegated): bounded helper and shared Spartan controls/tests integrated with users. Multi-file write trigger; source remains uncommitted.
- [x] T2 (verified, delegated): independent focused rerun passed 58 tests in 3 files; structural review found no concrete defects. Writer full suite/build passed. Real-browser checks remain pending.
- [x] T3 (documented): product guide updated with source links and delivery boundaries; evidence recorded. Source remains uncommitted and native review pending.

## Acceptance
- Constant bounded token count even for very large page counts; first, last and current pages visible, ordered, unique.
- Ellipses are not navigation controls; selected page has aria-current and navigation has an accessible label.
- Shared component receives current page/count, emits valid page selections and preserves previous/next boundaries.
- Existing users filtering and deletion tests pass.

## Progress and evidence
- Initial Git working tree clean.
- Angular MCP discovered Angular 22, build/serve/test targets and best practices.
- Read-only scout mapped users source/template/spec and shared offset contracts.
- Parent ran `npx ng generate @spartan-ng/cli:info --json`: success; pagination available but not installed. Scout lacked command execution; no claimed test results.
- Implementation forecast: approximately 250–380 authored diff lines, excluding generated Helm. One coherent work unit; delivery strategy ask-on-risk. No commit authorized.

## Implementation evidence
- Human approved generator-required Select dependency files and configuration scope; `tsconfig.app.json` has no resulting diff.
- Writer observed RED (28 failing behavior tests), GREEN (44 passing), additional invalid-input RED then final focused GREEN (58 passing).
- Angular MCP test target: 298 tests passed across 36 files. Production browser/server build passed with one prerendered route; initial bundle 483.57 kB. Writer `git diff --check` passed.
- Shared `TablePagination` renders native buttons, named navigation, active-page ARIA and noninteractive ellipses. `pageTokens` never allocates all pages for large counts; maximum seven tokens.
- Native assessment unavailable because untracked files require explicit scope; independent verifier launched. This is not approval of the source candidate.
- Product guide documents the local users-demo boundary and shared controls. Actual Chrome/Edge/Firefox responsive, keyboard, contrast and hydration checks remain pending.
- Task-document-only commit `0270f1f2bf792d7566c62f57dce0ce436cc1788e` was separately reviewed and acknowledged; it does not include implementation.

## Next step
Independent verifier repeated the Angular MCP focused target: 58 tests passed in 3 files; `git diff --check` passed with line-ending advisories. No concrete defects found. Browser responsive/keyboard/contrast/hydration checks remain pending. Automatic documentation commit was blocked by HEAD/index/document provenance drift; manual staging required, no retry.

Native source-candidate review and human staging/commit remain pending. No source commit or publishing authorized.
