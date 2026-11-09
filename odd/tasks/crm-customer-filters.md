# CRM customer server-side filters

User request: add customer name/email search and customer-type filtering to the paginated CRM catalog, with the backend contract added in `BACKEND_LOCAL_DIR`.
Branches: frontend `feature/crm-customer-filters`; backend target `D:\java\sistema_the_real_maids` (user-authorized).

## Specs

1. S1 — User request: “es cierto no tiene ese contrato el backend, podrías agregarlo en aqui? leyendo la variable de entorno del BACKEND_LOCAL_DIR, en el proyecto. Ahora bien, para que no llenes tu contexto, haz qu eotro agente se encargue de la exploracion y el trabajo de harcelo, de agregar ese filtro”
2. S2 — User correction: “perdon busqueda y tipo”
3. S3 — User-selected clarification: search is by name/email; include customer type (Residencial/Comercial). Implement both as server-side query filters. Preserve current active-only list, page/size metadata and name/ID ordering. Never filter only the already-loaded page or invent inaccurate totals.
4. S4 — Backend target consent: user authorized read/write access to the exact repository resolved from project `.env`: `D:\java\sistema_the_real_maids`.
5. S5 — Preserve existing customer create/edit/deactivate behavior, default listing, pagination, cache/session/SSR policies, and other consumers. Add optional query parameters only; invalid type/search handling must follow established backend conventions and be documented/tested. Do not change UI styling beyond adding the requested filter controls.

## Tasks

- T1 (S1-S5): Add and document backend customer list filters for case-insensitive name/email search plus customer type, preserving active-only server paging/order/metadata. Route: completed by backend worker and parent review; commit: `a6f7141`.
- T2 (S1-S5): Integrate search/type controls into the frontend Customers catalog and propagate the normalized query through source/repository/store/cache/page behavior without changing default unfiltered listing. Route: bounded frontend worker plus parent test-helper/DOM-ID correction; commit `8a524be` (includes docs/tests); Risk: item 4 (filter-aware cache keys affect shared query/in-flight identity). Focused checks pass; full-suite/build closure remains blocked as documented in L9.
- T3 (S1-S5): Update feature/product documentation, run focused and proportionate full checks, and record both commit hashes. Route: parent. Documentation committed with T2 in `8a524be`; formatting/links and focused checks pass; full verification remains blocked as in L9.

## Log

### L1 — Original request

es cierto no tiene ese contrato el backend, podrías agregarlo en aqui? leyendo la variable de entorno del BACKEND_LOCAL_DIR, en el proyecto. Ahora bien, para que no llenes tu contexto, haz qu eotro agente se encargue de la exploracion y el trabajo de harcelo, de agregar ese filtro

### L2 — Filter clarification

The user corrected “Solo búsqueda” to “perdon busqueda y tipo”. The selected search dimension in the clarification was customer name/email; the added second dimension is customer type.

### L3 — Authorization and initial evidence

Project `.env` resolves `BACKEND_LOCAL_DIR` to `D:\java\sistema_the_real_maids`; the user explicitly authorized access. The frontend customer endpoint currently maps only shared offset/limit to `pagina` and `tamanio`, and validates returned active-only records. Backend explorer evidence: `ClienteController.listar(pagina,tamanio)` only; `ClienteService.listar` active-only and orders name/ID; `ClienteRepository.findByActivoTrue(Pageable)`; valid types are residencial/comercial. See worker handoff for exact backend paths/lines and tests. The backend repository was clean on branch `mateo`; remote default is `main`. Parent decision: create an isolated backend branch `feature/crm-customer-filters` from the clean `mateo` branch, without modifying or switching `mateo` directly.

### L4 — Existing local changes to preserve

Frontend currently carries an unrelated user-owned Sessions badge formatting diff in `src/app/features/users/presentation/pages/users-page/users-page.html` and an untracked `.env` containing local `BACKEND_LOCAL_DIR`; never commit either as part of this feature.

### L5 — T2 frontend exploration evidence

The current typed flow is pagination-only: `PaginationParams` → `CustomerRepository.findPage` → `ListCustomersUseCase` → `CustomerRepositoryImpl` → `CustomerHttpSource.findPage`, which emits only `pagina`/`tamanio`. `CustomerType` already defines `residencial`/`comercial`. Extend a customer-specific query type rather than widening shared pagination. Add `busqueda` and `tipo` to normalized `customerQueryKey` identity so cache entries and observer sharing do not collide; preserve 120000ms TTL, `forcePolicy: join`, active write invalidation, session/SSR fencing, server effective pagination. UI filters belong in CustomersPage `catalogControls`, reusing Helm filter markup/classes, not Users feature dependencies. Relevant tests: customer HTTP source, CustomersStore query identity/invalidation, CustomersPage query behavior. Explorer made no changes; frontend writer awaits backend T1 contract.

### L6 — T1 backend implementation and verification

On `D:\java\sistema_the_real_maids`, the bounded worker created isolated branch `feature/crm-customer-filters` from clean `mateo` and implemented `GET /api/clientes?busqueda=&tipo=&pagina=&tamanio=`. Search trims/ignores blank, matches case-insensitive substring in name/email, and escapes `%`, `_`, and `\\` literally; type is optional exact `residencial`/`comercial`, invalid supplied values return 400 through existing `ReglaNegocioException` handling. The JPA `Specification` combines active-only and filters before pagination, retaining stable name/ID order and effective metadata. Swagger operation description documents parameter semantics. Worker observed TDD RED (focused tests did not compile before filter-aware service/repository support) → GREEN focused 20/20; parent reviewed the diff and `GlobalExceptionHandler` 400 mapping. Focused worker command `mvn -f backend/pom.xml -Dtest=ClienteApiTest,ClientePaginacionServiceTest test` passed; parent full suite `mvn -f D:/java/sistema_the_real_maids/backend/pom.xml test` passed 55/55. An initial parent invocation used frontend-relative `backend/pom.xml` and exited before Maven startup; diagnosed wrong cwd and ran the corrected absolute-path command. `git diff --check` passed. Native ASSESS for the backend current changes returned medium, `reviewDue: false`; no native review was started. No dedicated database-backed query integration was run; service tests inspect generated JPA Specification predicates.

### L7 — T1 commit and post-commit assessment

Parent committed the reviewed backend work unit as `a6f7141` (`feat(crm): filter customer pages by search and type`) on backend branch `feature/crm-customer-filters`; backend worktree is clean. Post-commit ASSESS against base `mateo` reports medium risk and `reviewDue: false`; no native review was started. Full Maven test result was 55/55. Frontend T2 may now implement against this committed contract.

### L8 — Frontend correction and scope disposition

The CRM page filter and customer editor both used the DOM ID `customer-type`; Helm binds `selectId` to its inner native `<select>`. The page filter now uses the unique ID `customer-filter-type`. The write-test helper now queries the injected CDK `OverlayContainer`, locates the editor's inner native select, destroys fixtures and clears overlay contents. The user selected “Mantener alcance CRM”: “No tocar esos otros módulos; dejaré las 18 fallas y el build como pendientes, completaré la documentación y reportaré el bloqueo de verificación.” No changes were made to the other failing suites, and the declined external test log remains unread.

### L9 — Frontend verification after correction

Prettier and `git diff --check` passed for the three corrected files. Angular test target with `customers-page.spec.ts` and `customers-writes.spec.ts` passed 52/52. The subsequent full suite reported 3270 passed and 18 failed out of 3288 across 174 files: admin sidebar/routes (5), operations order-detail manual (9), customer history (3), and lead conversion (1). The failures were not investigated or attributed because the user chose to keep scope limited to CRM filters. A production build attempt after the final page-ID change timed out at 60 seconds and was not retried. These outcomes do not establish a full-suite or post-change production-build pass.

### L10 — Committed CRM work unit and merged branch

The user authorized committing the CRM filters/docs/tests and merging all committed branch work, while preserving the pre-existing `.gitignore` and Users-page changes. The 15-file T2/T3 work unit was committed as `8a524be` (parent `9002542`); the unit contains 423 insertions and 76 deletions and isolates the item-4 cache-identity change. Exact-range ASSESS from `9002542` returned medium risk, RDD on, `reviewDue: false`; no native review was due. The branch's four commits (`a011a50`, `fcd5dda`, `9002542`, `8a524be`) were fast-forwarded into `main` in the registered worktree `tmp/crm-tabs-merge-main`; `main` is now at `8a524be`, four commits ahead of `origin/main`, and was not pushed. The original feature worktree still holds only the pre-existing unstaged `.gitignore` and Users-page edits, excluded from the merge. Focused page/write tests passed 52/52, the full suite remains 3270/3288 with 18 failures, and the post-change production build timed out at 60 seconds. No external test log was read and no retry was run.
