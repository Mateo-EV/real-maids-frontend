# Users server pagination

Separate the server-paginated Users listing from the shared fixed user catalog. Search, role/status filters and ten-row navigation must query the backend rather than slice an incomplete array.

## Authorization and scope

The user approved separating the catalog and moving Users pagination to the server. Preserve current sessions pagination and catalog consumers (sessions, audit actor selection, editors). No staging, commit, publishing or authenticated backend acceptance is authorized.

Public OpenAPI was retrieved from `http://localhost:8080/v3/api-docs` during this session: OpenAPI 3.1.0, API version 0.1. `GET /api/usuarios` documents `busqueda` (contains name or email), `correo` (contains), `idRol` (int32), `activo` (boolean), `pagina` (default 0), `tamanio` (default 20); ordered by name. Response supplies `contenido`, `pagina`, `tamanio`, `totalElementos`, `totalPaginas`. Use `busqueda`, not a guessed parameter or a local page filter.

The user's new server-pagination decision supersedes the array-only listing restriction in AGENTS.md. The existing fixed catalog remains an independent array contract; this change does not establish catalog completeness or correct false absence in Sessions.

## Tasks

- [ ] T1 — Implement independent server listing query/result, source/repository/use case/state and wire Users pagination/filters, with test-first coverage. Status: implemented and writer-verified; pending final review and human-approved commit. Delegated writer (multi-file rule).
- [ ] T2 — Update technical/product docs and verify catalog isolation, mutation refresh, page clamping, errors/cancellation, SSR, formatting, focused/full tests and build. Status: docs and verification complete; pending human-approved commit.
- [ ] T3 — Review final diff and report evidence, outstanding browser/backend checks and human staging/commit next step. Status: parent review and native review approved; delivery report ready, human staging/commit pending. No task closure before any required human-approved commit.

## Acceptance criteria

- Visible Users records and filtered totals come from the requested server page; no second local slicing/filtering.
- Page size remains ten; filter changes reset to the first page and obsolete responses cannot overwrite newer state.
- Shared catalog and paginated listing have independent lifecycle state; visiting/changing listing pages does not replace catalog records.
- Successful and partial mutations refresh catalog and active listing without repeating writes; refresh errors remain visible and do not undo confirmed writes.
- Pagination accepts validated effective response metadata; deletion shrinking the last page recovers to a valid page without unbounded loops.
- No SSR browser-unsafe requests, invented backend params, credential handling changes, new UI dependency or session-pagination changes.

## Checks and progress

Repository was clean on `main` before implementation. The writer changed the listing path and tests/docs in the authorized surfaces; no staging/commits/branch changes or authenticated calls. Public OpenAPI was fetched without credentials. A prior automatic documentation operation reported provenance drift/manual staging required; do not retry it.

Observed writer evidence:

- HTTP test RED: missing `getUsersPage`; 1 failed, 46 passed. Page-test RED: missing paged request. Intermediate missing-store/fixture compilation failures were resolved.
- Cross-layer focused GREEN: 95 tests; final page GREEN: 39 tests; Users feature suite: 516 tests across 42 files.
- Full Angular test target (`watch: false`): 848 tests across 70 files passed.
- Angular production build: passed with initial bundle warning 619.83 kB versus 500 kB warning budget; budgets unchanged; one route prerendered.
- Workspace-local Prettier write/check on the writer's exact 21 touched paths: passed. `git diff --check`: passed in writer and parent readback.
- Readback: UserListStore is page-provided, independent of root catalog; queries cancel stale reads and recover out-of-range pages at most once. Mutation revision triggers page-owned refresh, including partial updates.
- Native ASSESS initially could not classify the untracked scope and failed closed to high-risk verification. Independent verification found no correctness issues: the HTTP/store/page specs passed 109 tests across 3 files; read-only diff check passed with LF/CRLF notices.
- Native review included the five new listing source/test files and all 16 tracked changed paths. Task continuity documentation was excluded from the frozen candidate. Lineage `review-6280cc5f1bee56e3`: medium tier, reliability review approved; exact native acknowledgement completed and authority burned. This is not commit/delivery authorization.

Live authenticated backend/CORS and rendered responsive/keyboard/browser acceptance remain pending.

Required verification: test-first RED/GREEN for page query mapping/isolation/UI server behavior; relevant users specs, full Angular Vitest suite, production build; workspace-local Prettier write/check on exact touched files. Browser/CORS/authenticated acceptance remains pending, not inferred from unit tests.

Forecast: likely over 400 authored diff lines due to cross-layer behavior and tests. Keep one coherent implementation; do not omit tests or compress code to reduce review size. Delivery strategy: ask-on-risk; any commit/PR slicing requires a later human decision, not authorized here.

Rollback boundary: new paged-list contracts/state/use case plus source/repository listing method, page wiring and matching tests/docs; preserve existing fixed catalog and session behavior.

## Next step

Implementation and automated verification are ready. Human staging and explicit staged-snapshot/message approval are required before any commit; no files were staged or committed by agents. Do not retry the blocked automatic documentation operation. Catalog and Sessions completeness issues remain out of scope. Validate authenticated backend and rendered browser behavior separately.
