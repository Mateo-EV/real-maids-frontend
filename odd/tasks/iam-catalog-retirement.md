# Replace the fixed IAM user catalog with scoped backend reads

Consume backend commit `9439829` and remove the frontend's incomplete fixed `getUsers()` catalog. Keep user mutations, reliable metrics, server pagination and accessible session/audit workflows.

## Authorization and contracts

The user requested frontend integration after the backend commit, then explicitly selected the complete integration/catalog-retirement scope. Baseline frontend is clean at `87e21bf`. Backend `mateo` commit `9439829` is clean; no more backend edits are needed. The human stages frontend changes and approves each exact snapshot/message separately. Audit-only commit `c35a2568c6a2bc75b302ce517cf2c2aa27357904` was explicitly authorized and created; no other implementation commit or push is authorized.

Verified backend code contracts:

- `GET /api/usuarios/estadisticas` returns `{ total, activos, inactivos }`, nonnegative integer counts with total equal to active plus inactive; `USUARIO_LEER`.
- `GET /api/sesiones/usuarios` accepts `busqueda`, optional boolean `tieneSesiones`, zero-based `pagina`, `tamanio` (1..100). Standard page envelope contains `{ idUsuario, nombre, correo, sesionesVigentes }` rows. Requires both `USUARIO_LEER` and `SESION_LEER`.
- Existing paged `/api/usuarios?busqueda=...` supplies actor options. Existing `/api/usuarios/{id}/sesiones` supplies detail only on explicit disclosure. Existing paged `/api/sesiones?pagina=0&tamanio=1` supplies its exact global session total; neither owner totals nor array lengths substitute for that number.

Reuse shared `PaginationParams`, `PaginationResponse<T>` and `TablePagination`; transport metadata stays in HTTP sources. Preserve effective offset/limit handling and bounded last-page recovery. Do not fetch all pages, manufacture identities/counts, infer role ACLs or add dependencies.

Explicit user requirement: manage asynchronous statistics, lookup, session-summary/detail and count state with NgRx SignalStore. Components keep only local form/view state, not ad hoc HTTP result caches. Use independent scoped store instances where appropriate; actor lookup must not overwrite the Users listing. Callers own subscriptions/cancellation, preserving established root lifetimes.

## Implementation units

- [x] T1a — Deliver the independently scoped Audit actor lookup. Commit `c35a2568c6a2bc75b302ce517cf2c2aa27357904`; 59 tests across 3 files, production build and native review approved in the isolated worktree. Main staged diff matched the reviewed diff exactly before commit.
- [ ] T1 — Consume user statistics and migrate Audit actor lookup to an independent server-paged query, preserving selected actor identity. Status: implemented and focused-verified; pending final integration review and human-approved commit. Delegated writer (multi-file rule).
- [ ] T2 — Consume paged session-owner summaries, exact global total and disclosure-only per-user details, including post-revoke refresh. Status: implementation recovered through read-only diagnosis; six focused specs (155 tests) passed, no concrete source blocker found. Pending formatting, full integration checks and human-approved commit.
- [ ] T3 — Retire fixed catalog reads/state and obsolete use cases, retain mutation facade/revision, reconcile tests/docs and verify full integration. Status: implemented and final checks passed after the user-approved fixture dependency adjustment; pending human staging/commit. No fixed production collection contracts or state remain.
- [ ] T4 — Independently verify and natively review the normalized candidate, report acceptance limits and human staging/commit next step. Status: independent verification passed; native START returned cancelled with lineage_created=false and no authority mutation. Native review remains pending, not approved. Tasks stay open until a separately human-approved implementation commit.

## Acceptance criteria

- User metrics use global backend statistics, independently of list filters/pages. Users active/inactive is not sessions/owners count.
- Session user search and Todos/Con/Sin filtering happen on the server with five-owner pages; an absent record on an incomplete page never implies no sessions.
- Details load only when the user opens a native disclosure, with separate loading/error/retry state and explicit current-session Logout guidance. No initial per-owner detail requests or automatic N+1 count reads.
- Confirmed revokes refresh active summary, exact global count and affected open detail at most once per read; no write replay or optimistic totals. Failed refresh remains visible; component destruction suppresses late feedback but cannot roll back a dispatched write.
- Audit actor search is debounced, independently paged and cancellable. Only selecting a loaded option applies numeric identity. Selected ID/name/email survives query gaps and retained visits; historical/deleted audit records remain valid independently of current user membership.
- `UserStore` keeps mutation actions and notification, not an implied complete user array. No fixed `pagina=0&tamanio=500` or global session `tamanio=1000` reads remain in wired UI. Dialogs retain their selected-user contexts and guarded pending behavior.
- Sources validate unknown DTOs, safe counts/metadata, uniqueness and target identity; 403 and unconfigured/SSR behavior fail visibly, with no demo fallback.
- Root repository/source lifetimes and `useExisting` composition are unchanged. New independent query states must not overwrite Users listing state or couple root lifetimes to a component.

## Checks, scope and recovery

Use test-first RED/GREEN for deterministic new query/state/UI behavior, relevant specs per unit and focused cross-feature checks. At closure run full Angular Vitest test target and production build. Use Angular MCP targets when available and local fallback only on failure/unavailability. Run workspace-local Prettier write/check on exact touched paths before final checks. Preserve Spanish UI conventions and existing Helm accessibility/mobile behavior; run Spartan info before adding controls. Browser/authenticated backend/CORS acceptance remains pending unless actually performed.

Backend tests/compilation passed but SQL against an isolated MariaDB/MySQL database has not been accepted; do not claim end-to-end completion. Its session page/count/grouped reads may momentarily diverge under concurrent writes without snapshot guarantees.

The full integration spans statistics, Sessions and Audit. The user explicitly accepted that scope. Forecast is above 400 authored diff lines; divide work into the three coherent implementation units above, retaining tests rather than compressing code. Delivery strategy: ask-on-risk; commit/PR slicing remains a separate decision.

Recovery: this file plus Engram topic `odd/iam-catalog-retirement/tasks`. Keep source writes single-threaded. Rollback boundary is each unit's scoped frontend contract/state/UI/test changes; backend APIs remain compatible and committed independently.

## Progress and next step

Read-only mapping confirmed all fixed-catalog consumers. Dialogs use mutation methods and selected User context rather than requiring the catalog for writes. Angular targets and version-22 best practices were discovered.

T1 implementation evidence:

- Seventeen authorized files changed. UserStatisticsStore is page-provided; Audit owns a separate UserListStore. Components own subscriptions/cancellation and selected actor identity, not async result caches.
- RED: absent statistics contract/model/store, followed by actor-query independence failure (13 passed, 1 failed).
- GREEN: final focused run 179 tests across 6 files passed. Complete Users feature suite 558 tests across 43 files passed after correcting a route fixture's unflushed statistics request.
- Statistics invalid/unsafe/inconsistent/zero counts, 403/SSR/unconfigured, cancellation/stale reads, successful/PARTIAL_UPDATE refresh, actor effective-size paging, retained identity and export/destruction guards covered.
- Workspace-local Prettier write/check on 17 exact paths passed; diff whitespace check passed with LF/CRLF notices. Existing Helm components reused after CLI info.
- Full workspace suite/build remain intentionally deferred to T3; browser/authenticated acceptance unrun. Sessions and fixed catalog remain for T2/T3. No source staging/commits/push.

T2 interruption and recovery: the writer failed with only `assistant reported an error`, without a retained handoff. Parent preserved source/test artifacts and dispatched a read-only diagnostic verifier. It observed 155 tests passing across six HTTP/owner-store/root-store/session-component/dialog/page specs, plus a clean diff check (LF/CRLF notices only), with unchanged pre/post Git state. Source inspection confirmed server owner paging/filtering, exact global count at size one, explicit-disclosure details, independent SignalStore state and one read refresh per path after revokes. No concrete T2 source fix was supported. T2 RED evidence remains unavailable; observed GREEN is recorded rather than invented writer history.

The obsolete first-1000 session source/repository/use-case path remains but has no wired UI consumers; remove/reconcile it with the fixed user catalog in T3. Full workspace suite/build/formatting and live/browser checks are still pending.

T3 deletion boundary: the worker stopped before edits because its role prohibits file deletion. Parent read the five obsolete files and removed the three old GetUsers/GetUserSessions/GetAllUserSessions use cases plus the two standalone old session-use-case specs. The same worker was resumed afterward to reconcile dangling imports, retire fixed repository/source methods and collection state, preserve mutation notifications/partial updates and complete docs/tests/formatting/full suite/build. These deletions retire unused production paths, not coverage for retained behavior; replacement paged/detail/count paths retain tests.

T3 observed RED: focused compilation first failed on imports of the removed use cases, then failed with TS2339/TS7006 because the unwired RoleInMemorySource integrity check called the retired repository getUsers method. Worker stopped at its allowed-surface boundary. The user explicitly approved editing only `src/app/features/users/infrastructure/source/role-in-memory.source.ts` to inject the retained UserInMemorySource directly for that existing fixture check, preserving fixture data/behavior and not wiring a runtime fallback. The same writer resumed with this additional exact surface.

Final observed checks:

- GREEN after the fixture fix: 291 tests across 12 files. Final focused run: 304 tests across 13 files.
- All Users specs: 580 tests across 43 files passed. Full Angular Vitest suite: 912 tests across 71 files passed.
- Production build passed with one prerendered route. Initial bundle 620.50 kB exceeds the unchanged 500 kB warning budget by 120.50 kB.
- Workspace-local Prettier write/check passed on 45 exact existing T1/T2/T3 paths; removed files and ignored docs excluded. Diff check passed with LF/CRLF notices only.
- Final independent verification reran nine authorized source/store/component/page specs: 255 tests passed, diff check passed, and no production retired-use-case/loadUsers/fixed-500/1000 read paths were found. Existing fixture getUsers methods are intentionally unwired.
- UserStore now coordinates mutations/revision only, preserving PARTIAL_UPDATE errors. Page roles initialization is independent; statistics, paged listing, session count/owners/details and Audit actor lookup use their scoped stores and caller-owned subscriptions.
- Native INSPECT included all 11 new source/test files in the 52-path implementation candidate. START for target `sha256:f53f58bf50db1dd9f88424e14fa1930f479b698f25cf1240f9c5a6da3ea4723f` returned native-operation-failed/cancelled with lineage_created=false and mutation_performed=false. No lineage exists, no approval is claimed, and no automatic retry/reset/recovery was attempted.

## Delivery update

The full-candidate review later stopped at `lens_context_budget_exceeded`; the user selected smaller independently reviewed units and authorized the linked worktree `D:/angular/real-maids-frontend-iam-review`. The Audit-only unit passed 59 tests across 3 files, production build, formatting and diff checks. Native lineage `review-74fb3a3e76c6919c` was approved and acknowledged; authority was burned for target `sha256:df8eeb167ff8a86a2cfa221d6f4b598b04b2cc3be38a866b1a938bf227eae8b8`.

The human staged only `audit-viewer.ts`, `audit-viewer.html` and `audit-viewer.spec.ts` and explicitly approved the snapshot/message. Immediately before committing, HEAD `23f69943e86b8bb592aca83adc53fb847e9fb690` and staged binary diff hash `5dfa2314b6bec7ebc07e6f8586e6d8af1b3cfb8c` were rechecked; the hash also matched the isolated reviewed diff. Commit `c35a2568c6a2bc75b302ce517cf2c2aa27357904` (`feat(audit): use paginated user lookup for actor filters`) contains only those 3 files (+215/-70). The index is now empty; 38 tracked changes and 11 untracked files remain preserved. No push occurred.

Next: isolate dependency-safe statistics, Sessions and catalog-retirement units, then verify/review each before human staging and exact commit approval. Audit approval does not cover those remaining changes. Backend commit `9439829` is unchanged. Browser/keyboard/responsive, authenticated backend/CORS and isolated SQL acceptance remain pending; automated checks do not certify end-to-end behavior.
