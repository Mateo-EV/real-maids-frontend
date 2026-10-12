# Fixed IAM collections

## Objective and accepted scope

For M02/RF02/HU02/P03 and RNF09/RNF10, load users with one HTTP request at page 0, size 500, and sessions with one request at page 0, size 1000. Pagination parameters and response metadata remain exclusively in infrastructure HTTP sources. Repository/application consumers receive entity arrays; stores retain arrays and lifecycle/mutation state, not transport pagination or server totals. Treat returned arrays as available collections without incomplete-catalog disclosures. User explicitly accepted not fetching further pages.

Preserve local search/filter/pagination, cancellation, stale-result guards, post-write reloads, repository/provider lifetimes, strict DTO validation and existing mutation behavior. Audit query pagination/totals/detail/CSV remain unchanged; remove only user-catalog completeness disclosures in its actor selector.

## Existing changes to preserve

Initial branch: main. Existing unstaged edits in users-page.ts, users-page.html and admin-shell.html. Users page size was changed by the human from 5 to 10; preserve 10. Preserve human badge, KPI and role-name changes, except requested removal of incomplete-catalog disclosures. Admin shell is outside scope and must remain untouched. No staging, commits, branch changes or publishing authorized.

## Tasks

- [ ] T1: Migrate users collection contracts/source/store/consumers, tests and demo compatibility. Route: delegated writer; multi-file contract migration.
- [ ] T2: Migrate sessions to a single array read and array-derived state/counts; remove collection-completeness UI coupling, including audit actor picker. Route: same single writer; coordinated contract migration.
- [ ] T3: Reconcile project guidance and product documentation, format touched files, run focused and full tests and build, inspect candidate. Route: writer verification plus parent structural readback/native assessment. Commit and review pending separate authorization.

## Acceptance and checks

- HTTP tests assert exactly one page-zero request at 500/1000 even with larger server totals; no transport query parameters beyond sources.
- Stores expose arrays/lifecycle states and derive counts from arrays, no transport metadata.
- Local controls never fetch; preserve users page size 10 and sessions page size 5, reset/clamp behavior.
- Malformed DTOs fail; read failure/cancellation/stale results do not produce false successful empty state or overwrite newer records.
- Post-write reads reuse fixed source requests without replaying mutations.
- No incomplete catalog, backend total or backend filtering disclosure in affected UI.
- Test-first: observe focused RED for changed behavior, then GREEN; preserve negative validation and cancellation coverage.
- Run Angular configured Vitest target focused on users feature, full test target, and production build. Prefer Angular MCP; local npx ng/npm scripts only on unavailable/failed MCP, with limitation reported.
- Run npx --no-install prettier --write and --check on exact touched non-deleted paths. No unrelated formatting.
- Browser/live backend acceptance not available and remains pending; never claim it from unit tests/build.

## Delivery and forecast

One coordinated array-contract migration, approximately 25–35 files including tests/docs; forecast 800–1600 authored changed lines, mainly migration/deletion of obsolete pagination coverage. Delivery strategy: ask-on-risk before commit/PR preparation; no commit or PR requested now. Rollback boundary: users/session collection migration and actor-disclosure/docs alignment only, preserving existing human edits and audit behavior.

## Progress and evidence

Implementation T1/T2 and documentation migration are applied; tasks remain open pending code commit. User and sessions sources make one page-zero request at sizes 500/1000 and return arrays; stores have no transport pagination/totals. Audit transport is unchanged. Existing human page-size 10 and UI edits, including the hardcoded `3 Móviles` caption, were preserved. Four obsolete query/page model files remain unreferenced and undeleted.

Observed RED: old size-20 source requests failed fixed-size expectations. Writer post-format focused Angular tests passed 468 tests in 41 files; independent verifier repeated the exact users include command and confirmed 468/41. Full `npm test -- --watch=false`: 730 passed, 1 failed in 67 files, on the pre-existing human admin-shell banner removal. Independent isolated shell run confirmed 5 passed, 1 failed on that stale expectation. Shell and shell test were not changed by agents.

`npm run build` passed, one prerendered route; initial bundle 511.47 kB exceeds warning budget 500 kB by 11.47 kB. Exact touched paths formatted/checked with local Prettier; docs/ paths are ignored by existing configuration. `git diff --check` passed with CRLF warnings. Live backend/browser acceptance pending.

Native assessment failed `schema-incompatible` and required independent verification, which was completed. Final native START for target `24241d99580a8cfe57ce2286ef91213d56a901a7661817affd6f78ccab21090b` stopped at `lens_context_budget_exceeded`; no authority/lineage was created or mutated. No retry of that exact scope can succeed. Review requires smaller approved staged/committed candidates. Earlier human host declines were snapshot-specific, not final candidate approval. Current total diff including pre-existing changes: 39 files, 441 additions/975 deletions. No code staged or committed.

## Next step

Resolve the unrelated shell/test mismatch only on explicit user authorization. Before code commit/review preparation, choose smaller coherent review candidates and have the human stage them and approve each exact snapshot/message. Do not silently change the preserved mobile KPI caption, shell edits, or delete unused models. Full-suite green, browser acceptance, code commit and native review remain pending.
