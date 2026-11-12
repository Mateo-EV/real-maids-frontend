# CRM lead server-side filters and shared filter row

User request: add filters to the lead inbox list, with the button and styles identical to the customers catalog, and make those filter styles reusable for every future list.
Branches: frontend `feature/crm-lead-filters`; backend target `D:\java\sistema_the_real_maids` (user-authorized via project `.env`, same repo as the previous customer-filter feature).

## Specs

1. S1 — User request: “agrega la opcion de filtros a la lista de leads porfa y te pido que el boton y los estilos se vean a igual a como está clientes, recuerda que estos estilos de filtros será iguales para todos los que vengan después.”
2. S2 — User decision (backend scope): “a parte de todos los filtros que me propuesiste sin oexisten agregalos al codigo del backend. La direccion del codigo del backend está en el BACKEND_LOCAL_DIR”
3. S3 — User-selected filter set for the lead inbox: search by name/email/phone, origin, funnel stage, and converted (prospect vs already a customer). All four are server-side query filters; never filter only the loaded page and never invent totals.
4. S4 — User evidence for the contract: “el open api está en openapi http://localhost:8080/v3/api-docs, tamb tiene swagger”. The API currently exposes `GET /api/prospectos?pagina&tamanio` only, so the new parameters must be added to the backend and then reflected in the frontend adapter.
5. S5 — User backend location: “está en la variable de entorno del proyecto de angular”, which resolves to `D:\java\sistema_the_real_maids` (recorded precedent: `odd/tasks/crm-customer-filters.md` L3). Read and write access to that exact repository is authorized for this feature only.
6. S6 — Reuse requirement: the filter row markup, control variants and behavior must live in one shared place consumed by the customers catalog and the lead inbox, so later lists reuse it instead of copying classes. Migrating customers to it must not change its rendered controls or behavior.
7. S7 — Preserve established contracts: shared `offset/limit` → `pagina/tamanio`, adopted effective server metadata, stable server order, one bounded out-of-range recovery, 30000ms success-only freshness, ref-counted reads, session/SSR fencing, and no local slicing or invented counts. Backend adds optional parameters only; blank filters are omitted and the unfiltered listing is unchanged. Backend filter semantics follow the customer precedent: trimmed, case-insensitive literal substring with `%`, `_` and `\` escaped; invalid enum values return 400 through the existing convention.

## Tasks

- T1 (S2-S5, S7): Add optional `busqueda`, origin, stage and converted filters to `GET /api/prospectos` on an isolated backend branch, with focused RED→GREEN tests, Swagger parameter documentation and no response-contract change. Route: backend explorer + backend writer + parent review. Commit: `6886f13` (backend repo `D:\java\sistema_the_real_maids`, branch `feature/crm-lead-filters`).
- T2 (S1, S6, S7): Extract the filter row into a shared presentational component and migrate the customers catalog to it with no behavior or markup regression. Route: bounded frontend writer + parent spot check. Commit: `7680fd1`.
- T3 (S1, S3, S6, S7): Wire the lead inbox filters (query type, HTTP mapping and validation, store query identity, page controls, filtered empty state with reset) using the shared component. Route: bounded frontend writer + parent spot check. Commit: `9a3f3b0` (with T4 docs).
- T4 (S1-S7): Update the feature/product documentation, run focused checks and commit the work units. Route: parent. Commit: `9a3f3b0`.

## Log

### L1 — Original request

agrega la opcion de filtros a la lista de leads porfa y te pido que el boton y los estilos se vean a igual a como está clientes, recuerda que estos estilos de filtros será iguales para todos los que vengan después.

### L2 — Backend scope and selected filters

The user asked to add whatever filters are missing to the backend code and pointed at the `BACKEND_LOCAL_DIR` environment variable, selecting all four proposed filters (search by name/email/phone, origin, funnel stage, converted).

### L3 — Contract source

The user pointed at the live OpenAPI document (`http://localhost:8080/v3/api-docs`, Swagger available). Parent verification: the document title is “API ERP + CRM The Real Maids”, `GET /api/clientes` already accepts `busqueda`, `tipo`, `pagina`, `tamanio`, and `GET /api/prospectos` accepts only `pagina` and `tamanio` and returns `PaginaResponseProspectoResponse`.

### L4 — Backend repository resolution

`BACKEND_LOCAL_DIR` is not exported to the shell, and `.env` reads are blocked by policy. The resolved value is recorded in `odd/tasks/crm-customer-filters.md` (L3) as `D:\java\sistema_the_real_maids`; the parent confirmed that repository contains `ProspectoController` mapped to `/api/prospectos` and `CorreoProspectoController` mapped to `/api/prospectos/validacion-correo`, matching the running API. A previously located `D:\real-maids\Sistema-para-limpiezas\backend` was rejected as a different project (`/api/leads`, `q/tagId/activo`, `PageResponse{items,page,size,total}`).

### L5 — Frontend evidence (explorer)

No shared filter component exists; the filter row lives inline in `customers-page.html:11-41` (`catalog-filter-row`, `hlm-input-group` search, `hlm-native-select` type) inside CatalogFrame's `catalogControls` projection. `CustomersPage` debounces search 250 ms, applies type immediately, resets offset to 0 retaining the effective limit, and `clearFilters` resets both. The lead inbox renders only “Crear prospecto” in that projection and its query is `PaginationParams` only; `AcquisitionHttpSource.listLeads` sends exactly `pagina`/`tamanio` via `pagination()` (`customer-http.validation.ts:74-82`).

### L6 — T1 backend evidence

Backend branch `feature/crm-lead-filters` created from the clean `feature/crm-customer-filters`. `GET /api/prospectos` now accepts optional `busqueda`, `idOrigen`, `idEtapa` and `convertido`; the specification mirrors the customer precedent, `patronContiene` is character-identical, LIKE uses an explicit `ESCAPE '\'`, non-positive ids raise `ReglaNegocioException` before any repository call, and the unfiltered path still uses `findAll(Pageable)` with `id` descending. Evidence: compile-level RED, focused GREEN 32/32, full Maven suite 66/66 (two earlier full runs died from JVM native OOM before executing tests; the third passed unchanged). Mocked service plus MockMvc tests only, so real SQL/MySQL and rendered OpenAPI are unverified; the API on localhost:8080 predates the commit. Committed as `6886f13`; JVM crash dumps removed before staging.

### L7 — T2 shared filter row

`CatalogFilters` extracted to `src/app/shared/components/catalog-filters/` and the customers page migrated to it; the host is the `catalog-filter-row` element so the global `.catalog-filter-row > *` rules keep working, and the create button is projected into the row. Ids `customer-search`/`customer-filter-type`, labels, options and debounce behavior unchanged. Evidence: RED before the component existed, GREEN 3 files / 56 tests, prettier write/check clean. Committed as `7680fd1`.

### L8 — T3 lead inbox filters

`LeadListQuery extends PaginationParams` (search/originId/stageId/converted), filter-aware normalized cache key `[offset, limit, search, originId, stageId, converted]`, source serialization `busqueda`/`idOrigen`/`idEtapa`/`convertido` (blanks and malformed ids omitted, `convertido` as `true`/`false`), and page-level debounce/reset/empty-state handling reusing `CatalogFilters`. `adopt()` now preserves the active filters with effective paging. Evidence: compile RED, GREEN 3 files / 48 tests after one authorized heap retry; prettier clean. Two focused attempts died from V8 heap exhaustion with no code change between runs.

### L9 — T4 parent checks, button parity and docs

Parent review confirmed the source omission rules, the filter-aware key and the unchanged paging contract. One gap against S1 was fixed inline: the `Crear prospecto` button now carries the customers treatment (`catalog-action-plus` classes, `size="sm"`, `lucidePlus` icon) so the row matches visually. Parent focused run: 6 files / 104 tests passed (`leads-page`, store, HTTP source, `catalog-filters`, `customers-page`). Docs updated in `AGENTS.md` and the customers README. Not run: full suite, production/SSR build, browser/keyboard/responsive and live backend/CORS acceptance. The uncommitted duplicate-email blocking change (previous task, `lead-editor*` and `lead-detail-page.spec.ts`) is deliberately outside this work unit even though its README paragraph travels with it.
