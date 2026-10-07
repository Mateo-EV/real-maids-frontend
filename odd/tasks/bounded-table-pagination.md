# Bounded table pagination

## Goal and scope
Replace the unbounded users page list with reusable pagination controls showing first/last pages, a small current-page window and noninteractive ellipses. Preserve filtering, deletion clamping, record slicing, responsive table/cards and previous/next navigation. No backend pagination, new routes, i18n framework or other table migrations.

Approved examples for 50 pages: `1 2 3 … 50`, `1 … 24 25 26 … 50`, `1 … 48 49 50`. Short lists show all pages and single-page gaps show the missing number. Traceability: M02/RF02/HU02/P03; RNF06/RNF08/RNF09.

## Tasks
- [ ] T1 (in progress, delegated): add a bounded pure token helper, shared controls composed from generated Spartan pagination and focused tests; integrate users. Multi-file write trigger. Observe meaningful RED/GREEN where the runner is available.
- [ ] T2 (pending, delegated verification): run focused/full Angular Vitest checks and production build; structurally inspect accessibility/responsiveness. Browser visual/keyboard checks remain pending unless actually exercised.
- [ ] T3 (pending): update product guide and report observed evidence and remaining checks.

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

## Next step
Delegate one bounded writer. No staging, committing or publishing.
