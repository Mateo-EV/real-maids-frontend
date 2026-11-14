# Operaciones shell with tabs and list filters

UI restructure of `/admin/operations` into a persistent shell with tab navigation and server-side filters on the two list tabs. Feature branch `feature/operations-shell-tabs`.

## Specs

- S1 — The Operaciones view must look like the IAM/CRM pages: one persistent frame that stays mounted while the consumer route changes, exactly like `CrmShell` places its navigation and metrics as siblings of `<router-outlet />`.
- S2 — The frame uses tabs for the three sections: `Solicitudes`, `Órdenes`, `Agenda`. Each tab is a real route tab (CRM `routerLink` pattern with `active-catalog` + `ariaCurrentWhenActive="page"`), so existing deep links `/admin/operations/requests|orders|agenda` and the default redirect keep working.
- S3 — `Solicitudes` and `Órdenes` each expose their own filters, sent server-side through the existing query contracts, never by slicing a loaded page or deriving totals locally:
  - Solicitudes: `estado`, `idCliente`, `desde`, `hasta` (the exact optional parameters `GET /api/solicitudes` already serializes).
  - Órdenes: `estado`, `idCliente`, `idPersonal`, `desde`, `hasta` (the exact optional parameters `GET /api/ordenes` already serializes).
- S4 — The `Crear solicitud` action keeps the same treatment as the other modules' primary catalog actions (`Crear cliente`, `Crear prospecto`): a captured action in the catalog frame header, not a standalone button above the frame.
- S5 — Filter values are only ever real contract values: request states from the documented allow-list and order states from the backend catalog. No invented enum, no client-side translation table, blank means "no filter".
- S6 — Every filter change resets offset to page zero, retains the effective page size, and keeps the existing verified/stale/error/retry behavior, one bounded out-of-range recovery, caller-owned cancellation and session/SSR fencing.
- S7 — Selecting a customer or staff member must never invent an identity: the picker shows only loaded, real options, keeps an explicitly unavailable selection visible instead of silently clearing it, and sends the numeric id only.
- S8 — Date filters use native `type="date"` calendar strings forwarded unchanged as `YYYY-MM-DD`, matching the audit toolbar precedent; no timezone or "today" inference.
- S9 — Existing detail routes, guards, toast scopes, TTLs, store lifetimes and tests for behavior not named here stay unchanged; the three pages stop rendering their private navigation links and section label because the shell owns them.

## Tasks

| ID  | Spec      | Route  | Task                                                                                                            |
| --- | --------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| T1  | S1–S2     | inline | Add `OperationsShell` + `OperationsSectionNavigation`, convert `OPERATIONS_ROUTES` to a shell with child routes |
| T2  | S3, S5–S8 | inline | Add shared filter row (estado, cliente, desde, hasta) to Solicitudes                                            |
| T3  | S3, S5–S8 | inline | Add filter row (estado, cliente, personal, desde, hasta) to Órdenes                                             |
| T4  | S4        | inline | Move `Crear solicitud` into the catalog frame header with the shared primary action style                       |
| T5  | S9        | inline | Remove the duplicated per-page navigation/label from the three pages                                            |
| T6  | S6, S9    | inline | Update/extend specs, run focused + full suite, SSR build, prettier                                              |
| T7  | S1–S9     | inline | Update `AGENTS.md` and the operations README with the new shell/filters contract                                |

## Log

- L1 (user, verbatim): "quiero que modifiques la vista de operaciones para que se parezca a iam page o crm page, que utilize tabs para solicitudes y ordenes y agenda, solocitudes y ordenes con sus filtros. El boton de crear solicitud con el mismo estilo que tienes los troos modulos porfa."
- L2 (user decision, via questionnaire): filter scope = "Lo anterior + Cliente en ambos" — Solicitudes: estado + desde/hasta + cliente; Órdenes: desde/hasta + personal + cliente. Customer picker shows only the loaded, paged page of active customers, not the whole catalog.
- L3 (user authorization): order state values must come from the real backend enum; the user explicitly authorized reading `D:\java\sistema_the_real_maids` for that.
- L4 (evidence): frontend wire contracts — requests serialize only `idCliente|estado|desde|hasta` plus paging (`service-requests-http.validation.ts:89–102`); orders serialize `estado|idCliente|idPersonal|desde|hasta` plus paging (`service-orders-http.validation.ts:164–190`). Request allow-list is `registrada|atendida|cancelada` (`service-requests-http.validation.ts:24`). No status catalog endpoint exists on either side.
- L5 (evidence, backend): order states come from `backend/.../entity/CodigoEstadoOrden.java` — `PENDIENTE`, `PROGRAMADA`, `EN_PROCESO`, `COMPLETADA`, `PAGADO`, `CANCELADA` with visible names `Pendiente`, `Programada`, `En proceso`, `Completada`, `Pagado`, `Cancelada`; the list endpoint receives the enum code and filters by the visible name. Requests use the string constants `registrada|atendida|cancelada`, matching the frontend allow-list. No endpoint enumerates either catalog on either side.
- L6 (decision): filters are page state, not URL state; `buildQuery` is the single query builder reused by paging and by the one bounded out-of-range recovery so a page change cannot drop active filters.
- L7 (implementation): shell + navigation + routes, `CatalogFilters` dates/optional search, request filters, agenda cleanup and docs done inline; the order template + its spec were delegated to a worker (28/28 green). No `vencimientos`/statistics KPI block was invented for the shell because no operations statistics endpoint exists.
- L8 (deviation, recorded): the operations tabs use `routerLinkActiveOptions.paths: 'subset'` instead of CRM's `'exact'`, so `/admin/operations/requests/17` and `/admin/operations/orders/17` keep their section tab active. There is no nested list under another tab in Operaciones, so subset cannot highlight the wrong section; CRM stays exact because `/admin/customers/leads` is a sibling list.
- L9 (evidence, focused): nav 2 tests, routes 22, solicitudes 23, órdenes 28, agenda 21, catalog-filters 93 with customers/leads. The whole `features/operations/**` sweep OOMs the local V8/forks workers (`FATAL ERROR: Zone Allocation failed`, `Timeout waiting for worker to respond`); it is an environment memory limit (15.9 GB total, ~3.8 GB free, one stray node using 1.1 GB), not a failing assertion, so the feature was verified in directory chunks instead.
