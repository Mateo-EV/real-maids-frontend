# Reuse shared pagination for the Users listing

Replace duplicated Users page-based pagination contracts with shared offset/limit contracts, preserving the server-side listing and independent catalog delivered in `d3959e5`.

## Scope and decisions

The user explicitly requested this refactor. Use `PaginationParams` and `PaginationResponse<User>` without changing shared contracts or unrelated consumers. `UserListQuery` extends shared pagination and retains search/role/status filters; remove `UserListPage`. Backend `pagina`, `tamanio` and `totalPaginas` stay in infrastructure. Keep the existing shared visual paginator.

Use aligned offsets (`offset % limit === 0`) for the page-index backend, validate safe integer and emitted int32 bounds, and preserve optional defaults consistently. Do not apply `normalizePagination`'s unrelated maximum of 100 to Users. UI initially requests ten rows. Map response offset as returned page times effective size; retain the effective offset/limit in active listing state so subsequent navigation remains contiguous. Backend effective size stability across requests is not independently verified; never invent that guarantee.

Preserve fixed shared catalog page 0/500, Sessions page 0/1000, page-owned listing lifecycle, stale/cancelled response guards, 250 ms search delay, independent errors/retry, mutation revision refresh including PARTIAL_UPDATE and one bounded out-of-range clamp. No authenticated calls, dependency/config changes, staging, commits or publishing are authorized.

## Tasks

- [ ] T1 — Refactor listing query/result and source/store/UI to shared pagination, with regression tests. Status: implemented; worker refactor verified, obsolete unreferenced model removed by parent; pending independent review and human-approved commit. Delegated writer, multi-file rule.
- [ ] T2 — Update docs and verify formatting, focused/full tests, production build and independent correctness checks. Status: writer checks passed; independent post-removal verification in progress.
- [ ] T3 — Review the normalized candidate and report evidence and pending human staging/commit. Status: pending. Tasks remain open until a human-approved commit exists.

## Acceptance and checks

- No `UserListPage` or duplicated page/size result remains; generic response is `PaginationResponse<User>`.
- Backend paging fields appear only in HTTP mapping/tests; server requests still use documented `busqueda`, `idRol`, `activo`, `pagina`, `tamanio`.
- Effective-size example: request offset 20/limit 10 maps to backend page 2; response size 5 maps to offset 10/limit 5; next page requests offset 15/limit 5, backend page 3.
- Invalid unaligned/unsafe/out-of-int32 queries fail without HTTP; limits above 100 are not arbitrarily rejected.
- Server totals, ranges, filters, page resets, retry and bounded deletion recovery remain correct; shared catalog and sessions are not replaced by a listing page.
- Observe RED for shared-contract/effective-size regression expectations, then GREEN; run focused HTTP/store/page/use-case specs, full Angular Vitest test target and production build. Format only exact changed paths using workspace-local Prettier write/check.
- Browser and live authenticated backend/CORS acceptance remain pending, not inferred from tests. Existing bundle warning must be reported if still present.

## Evidence and delivery

Read-only mapping confirmed viability without shared-contract edits. Repository was clean at `d3959e5` before this refactor. The runtime committed only the initial task document separately; source changes remain unstaged and uncommitted.

Observed implementation and verification:

- Worker changed 14 authorized source/test/doc files to shared offset/limit contracts. Parent confirmed `UserListPage` had no remaining consumers, then removed `src/app/features/users/domain/models/user-list-page.ts`, completing the removal blocked by worker-role rules.
- RED: two intended shared-response/effective-query failures, with 68 passing tests.
- GREEN: 148 focused tests across 5 files, including after formatting; full Angular suite 865 tests across 70 files passed.
- Production build passed with one prerendered route; initial bundle warning 620.07 kB versus 500 kB warning budget remains.
- Workspace-local Prettier write/check on 14 exact worker-changed paths passed; ignored docs respected. `git diff --check` passed with LF/CRLF notices only.
- Native assessment failed with schema-incompatible/unassessable and required independent verification; no risk downgrade or successful review is claimed for this refactor. A read-only verifier is checking the HTTP/store/page specs and deletion.
- No shared contracts, fixed catalog/session behavior, dependencies, staging or implementation commits changed. Browser/live authenticated backend acceptance remains unverified.

Estimated review scope: a coherent cross-layer refactor with updated tests, potentially above 400 authored changed lines. Delivery strategy: ask-on-risk; no commit/PR currently requested. Do not compress code or omit tests to meet the advisory size.

Rollback boundary: this refactor's Users query/result mapping, store/UI adjustments, tests/docs; retain the prior committed server listing and catalog separation.

## Next step

Await independent post-removal verification, then inspect the normalized refactor candidate for native review. Report evidence and request manual staging only if a commit is desired; do not reuse approvals for earlier intermediate or committed-baseline candidates.
