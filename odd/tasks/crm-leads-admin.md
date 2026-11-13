# CRM lead admin: delete, catalog tabs and KPIs

User request: delete non-converted leads, add read-only Orígenes/Etapas catalog tabs to the CRM page, and add KPI cards like the IAM page whose block is not re-rendered when switching tabs.
Branches: frontend commits landed on `main` directly; backend target `D:\java\sistema_the_real_maids` (user-authorized via project `.env`) on branch `feature/crm-leads-admin`.

## Specs

1. S1 — User request: “listo excelente trabajo, ahora quiero que agregues la opcion de eliminar leads, que no estén convertidos, y agregues en tabs los catálogos de etapa y origen en la pagina del crm. Aparte agrega kpis como está en la pagina de usuarios o iam. Que no se renderizan aunque estén abajo del tab y cambie de tab en la pagina de crm. Entiendes?”
2. S2 — User decision (delete): “Borrado físico, bloqueado si está convertido”. `DELETE /api/prospectos/{id}` removes the row; the server rejects a converted prospecto with 409 (404 when missing). The UI only offers the action on non-converted rows, but the server stays authoritative. No soft-delete column, no client-side hiding as a substitute.
3. S3 — User decision (tabs): “Sólo lectura de los catálogos”. The page gains tabs `Prospectos | Orígenes | Etapas`; the last two list the existing catalog data with no create/edit/activate actions and no new write endpoints.
4. S4 — User decision (KPIs): “los kpis son para la pagina del crm, puedes proponerme 4 como en la pagina de users”. Parent proposal, accepted as the plan: four cards in the IAM visual pattern (`catalog-metrics` + `hlmCard` + `kpi-label`/`kpi-tile`/`kpi-value` + description + loading/refreshing/error and explicit retry): Prospectos (server total, with converted/pending breakdown), Convertidos, Pendientes and Orígenes activos (catalog-derived, mirroring “Roles definidos”). Counts come from a new server statistics endpoint; only the catalog card reads existing catalog data.
5. S5 — User requirement (no re-render): the KPI block lives outside the tab content and mounts once, so switching tabs neither destroys it nor triggers another read. Tab content changes only inside the switchable region below it.
6. S6 — Preserve every established contract: shared `offset/limit` → `pagina/tamanio`, server filters and effective metadata, one bounded out-of-range recovery, success-only freshness, ref-counted reads, session/SSR fencing, no local slicing or invented totals, backend authorization authoritative, access instructions/door codes never surfaced. No new storage policy, no optimistic row deletion, no write replay, no role ACL inference.
7. S7 — User request: “agregale tmb unos badges a los tabs como está en users page”. Each tab carries an `hlmBadge variant="secondary"` count like the IAM tabs: Prospectos shows the server total (or `—` while unverified), Orígenes and Etapas show their loaded catalog counts. Badges reuse existing theme tokens only; the IAM-specific soft tone variables are not imported into the customers feature.

## Tasks

- T1 (S2, S4, S6): Backend `DELETE /api/prospectos/{id}` (physical, 409 when converted, 404 when missing, existing write authority) and `GET /api/prospectos/estadisticas` (total, convertidos, pendientes), with focused RED→GREEN tests and Swagger documentation. Route: backend explorer + backend writer + parent review. Commit: pending.
- T2 (S1, S3, S6, S7): Frontend tabs `Prospectos | Orígenes | Etapas` with count badges and read-only catalog tables reusing the existing root catalog reads. Route: bounded frontend writer + parent spot check. Commit: `e17b54a`.
- T3 (S4, S5, S6): Frontend KPI block outside the tab content plus the root statistics entry (success-only freshness, ref-counted read, session fencing, retry). Route: bounded frontend writer + parent spot check. Commit: `e17b54a`.
- T4 (S2, S6): Frontend delete action for non-converted leads: confirmation dialog, root action, HTTP DELETE, invalidation of lead pages/detail/statistics with no optimistic removal. Route: bounded frontend writer + parent spot check. Commit: `e17b54a`.
- T5 (S1-S7): Docs, focused and proportionate checks and work-unit commits. Route: parent. Commit: frontend `e17b54a`; backend `05b49bd`.

## Log

### L1 — Original request

listo excelente trabajo, ahora quiero que agregues la opcion de eliminar leads, que no estén convertidos, y agregues en tabs los catálogos de etapa y origen en la pagina del crm. Aparte agrega kpis como está en la pagina de usuarios o iam. Que no se renderizan aunque estén abajo del tab y cambie de tab en la pagina de crm. Entiendes?

### L2 — Clarification round

The user cancelled the first questionnaire and asked to re-ask. Answers: delete is a physical delete blocked by the converted state; the catalog tabs are read-only; the KPIs belong to the CRM page and the parent proposes four following the users page. Parent reading of S5: the KPI section must stay mounted outside the switchable tab body, so a tab change neither re-renders nor re-reads it.

### L3 — Scope

Page is `/admin/customers/leads` (CRM → Prospectos), the only place where lead origin/stage catalogs and lead rows live. Both repos are touched again: the backend needs the delete endpoint and the statistics aggregate because neither exists today (`/v3/api-docs` lists only GET/PUT/POST for prospectos and no statistics endpoint).

### L4 — Backend 409 mechanism decision

The backend writer found that `OperacionNoPermitidaException` already exists on `mateo` and is handled as **403**, used by `ControlAcceso`, `OrdenService` (×2) and `ProgramacionService`. Reusing or remapping it for a converted-prospecto refusal would have regressed four authorization paths, and `ReglaNegocioException` maps to 400. Parent decision: add one dedicated `OperacionEnConflictoException` handled as **409** with the existing `ErrorResponse` shape, leave the 403 exception untouched, and let `CaptacionService.eliminar` throw it when `convertido = true`. Follow-ups of the prospecto are deleted first inside the same transaction; references from `cliente`, `cotizacion` or `formulario_web` stay restrictive and surface as 409 with rollback.

### L5 — T1 backend implementation and verification

Committed on `feature/crm-leads-admin` as `05b49bd`. `DELETE /api/prospectos/{id}` (`CLIENTE_ACTUALIZAR`) returns 204, 404 when missing, 409 via the new `OperacionEnConflictoException` when `convertido` is true, and 409 through the existing integrity mapping when `cliente`/`cotizacion`/`formulario_web` still reference the row; the prospecto's own follow-ups are bulk-deleted first and the whole method is one `@Transactional`, so an FK failure rolls the follow-ups back. `GET /api/prospectos/estadisticas` (`CLIENTE_LEER`) returns total/convertidos/pendientes from one JPQL aggregate where `pendientes` counts nulls. The shared 403 `OperacionNoPermitidaException` and its four callers are untouched; a test pins that the literal `/estadisticas` path does not displace `/{id}`.

Evidence: focused `CaptacionServiceTest,ProspectoApiTest` RED (34 tests, 28 failures/errors) → GREEN 34/34. The full Maven suite could NOT be completed on this machine after three distinct environment failures (JVM native OOM with `hs_err` dumps, Mockito `MockMaker` plugin init, and a forked VM dying at startup); the best partial run executed 81 tests with 0 failures before the crash. Real MySQL FK behaviour and rendered Swagger remain unverified. Crash dumps were deleted before staging.

### L6 — T2/T3 frontend tabs, KPIs and statistics

Tabs `Prospectos | Orígenes | Etapas` with `hlmBadge` counts, read-only catalog tables over the existing root catalog reads, and four KPI cards in ONE `catalog-metrics` section kept as a sibling outside the `@if` tab branches (verified by line order in `leads-page.html`). The shared `kpi-*`/`catalog-metrics` definitions moved to `src/styles.css` with IAM's `--users-*` tones aliased to `:root` tokens. New root statistics entry over `GET /api/prospectos/estadisticas` with 30000ms success-only freshness, ref-counted flights, forced retry, session fencing and confirmed-write invalidation. Evidence: writer 113/113 across 4 files (RED observed as compile failures), parent 6 files / 145 tests. One approved out-of-surface line was needed in `customer-contracts.spec.ts` for the new required repository member.

### L7 — T4 deletion and commits

`Eliminar prospecto <nombre>` renders only for `isConverted === false` rows (desktop `Acciones` column and mobile cards) and always opens the confirm-only `LeadDeleteDialog`, which blocks duplicate confirmation and Cancel/Escape/outside dismissal while pending, keeps a safe inline error for explicit retry and emits one generic route-local toast only on confirmed success. `deleteLead` reuses the existing `write()` coordination and `invalidateLead(id)`, so a confirmed success expires every page variant, the target detail and the statistics entry and refreshes mounted observers once, with no optimistic removal or write replay; 409/404 map to the existing CONFLICT/LEAD_NOT_FOUND codes and raw backend text never reaches the UI. Evidence: writer 89/89 (mutation-checked guards), parent 6 files / 145 tests, prettier clean. Frontend committed as `e17b54a` directly on `main`; backend committed as `05b49bd` and fast-forwarded into `mateo` (not pushed; backend `main` remains 12 commits behind `mateo` by design of that repo's PR flow).

### L8 — Scope correction: tabs and KPIs belong to the CRM, not to the leads page

User correction (verbatim): “ok me entendiste mal, me psiste todo en la pagina de leads, yo me referia a que me lo pusieras en la pagina del crm, los tabs que faltaban xd y los kpis ahi. No quiero que los tabs solo aparezcan en la pagina de leads sino del crm, por eso te pedi kpis de clientes leads y los catalogos que faltaban xd”.

Then, when asked how to shape the tabs, the user rejected unifying URLs and chose own routes: “no, mejor rutas propias ya luego haremos lo mismo en users”.

Corrected design (supersedes the leads-page tabs of T2/T3, which are removed):

- S8 — The CRM itself is tabbed with REAL ROUTES and a persistent shell: `/admin/customers` (Clientes), `/admin/customers/leads` (Prospectos), `/admin/customers/origins` (Orígenes) and `/admin/customers/stages` (Etapas). The shared CRM navigation gains the two catalog links. Detail routes stay where they are.
- S9 — Four KPI cards live in the CRM shell — Clientes, Prospectos, Convertidos, Pendientes — outside the router outlet, mounted once, so switching tabs neither re-creates nor re-reads them. Clientes needs a new server aggregate (`GET /api/clientes/estadisticas`); the prospect counts reuse the existing `/api/prospectos/estadisticas`.
- The read-only Orígenes/Etapas tables move out of the leads page into their own CRM pages.
- The pattern must be reusable so IAM can adopt the same shape later (no IAM changes in this slice).

- T6 (S9): Backend `GET /api/clientes/estadisticas` (total/activos/inactivos) mirroring `/api/usuarios/estadisticas`, with focused tests. Route: backend writer. Commit: pending.
- T7 (S8, S9): Frontend CRM shell with persistent KPIs, real Orígenes/Etapas routes, extended CRM navigation, read-only catalog pages relocated, and the leads page losing its internal tabs/KPI block. Route: bounded frontend writer. Commit: pending.

### L9 — T6/T7 implementation and parent verification

Backend `GET /api/clientes/estadisticas` committed as `1b42fd3` on `feature/crm-client-statistics` and fast-forwarded into `mateo`: one JPQL aggregate over every stored customer (active included in `total`), `CLIENTE_LEER`, Spanish `@Operation`. RED exposed that the literal path was being swallowed by `/{id}` (403 expected, 400 observed); GREEN focused 25/25 and the full Maven suite 86/86 with no environment failure.

Frontend delivered the CRM shell: `CrmShell` renders `CrmCatalogNavigation` (Clientes · Prospectos · Orígenes · Etapas), one `catalog-metrics` KPI block (Clientes with `N activos · M inactivos`, Prospectos/Convertidos/Pendientes from the prospectos statistics) and `<router-outlet />` as siblings, so tab changes never re-create or re-read the block. `customers.routes.ts` is one guarded shell parent with children `''`, `leads`, `leads/:id`, `origins`, `stages`, `:id` (static before dynamic, titles and per-consumer `provideCatalogToast()` kept). New `CrmOriginsPage`/`CrmStagesPage` are read-only tables over the existing root catalog reads; the leads page lost its tabs, KPI block, catalog tables and duplicated nav; the customers page no longer renders the nav (the leftover import was removed by the parent, clearing NG8113). New customer statistics plumbing: `cliente-estadisticas.params.ts` → repository/`GetCustomerStatisticsUseCase` → HTTP source with DTO validation → 120000ms success-only single-key entry in `CustomersStore` with ref-counted flights, forced retry, session fencing and confirmed-write invalidation.

Evidence: writer RED (unresolved shell/pages/use case) → GREEN partitioned (leads 33, customers 53, shell 6, origins 4, stages 4, state 100, source 87, routes/nav/contracts 16, admin routes 23); parent runs 67/67 (customers + shell + origins + stages) and 49/49 + 100/100 + 87/87 (leads/routes/nav/contracts, state, source). The combined focused command and `ng build` still cannot complete on this machine (native/zone heap exhaustion), so full-suite and production/SSR builds stay unverified, as do live CORS, `/api/clientes/estadisticas` against a running backend and browser acceptance.
