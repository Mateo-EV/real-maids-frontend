# Operations — area D

Domain coverage of requests, quotes, contracts, orders, scheduling and assignments (M04/M05/M07/M08, RF04–RF06/RF08–RF09, HU04–HU06/HU08–HU09; RNF09/RNF10/RNF12). All ten assigned SQL tables are represented. WP7 T5 adds request list/detail HTTP transport, a repository implementation, two application actions and opt-in composition. A root presentation read store is also implemented. Routes, UI, root installation and dependency changes remain absent. Backend capabilities are not evidence of a finished frontend workflow.

## WP7 T5 — Request-read HTTP boundary

The root-provided [ServiceRequestsHttpSource](infrastructure/source/service-requests-http.source.ts) implements cold list/detail GETs for M04/RF04/HU04/P05 (RNF09/RNF10/RNF12). It is connected to application read actions through the opt-in repository boundary below, not yet to a routed consumer.

- `GET /api/solicitudes` maps optional customer/state/registration-calendar filters and shared offset/limit to `idCliente/estado/desde/hasta/pagina/tamanio`, default 0/20. Requested sizes above 100 remain transportable; validated effective server metadata determines the returned offset/limit/total. Preserve server order without slicing or fabricated totals. Server own-scope may override a requested customer filter; the adapter neither invents an authenticated customer ID nor rejects those legitimate returned IDs.
- `GET /api/solicitudes/{id}` validates positive int32 input and exact returned request identity. Unknown DTOs, pages, IDs, required fields, nullable/empty text, real calendars and explicit-offset instants are validated by the [feature-local decoder](infrastructure/source/service-requests-http.validation.ts). Desired dates stay calendar strings; registration/update instants map to Date, registrar names remain names rather than fabricated user IDs. No business timezone or browser-derived today is selected.
- Existing API-origin validation/auth interceptor policy is reused unchanged; SSR/unconfigured reads dispatch nothing, transfer cache is disabled, unsubscribe cancels and repeated subscriptions remain uncached. No retries, raw backend messages, credentials, demo fallback or storage policy is added. Safe typed failures include invalid/malformed success responses, including successful-status transport parse errors.

[OperationsRepositoryImpl](infrastructure/repositories/operations.repository-impl.ts) implements the entire existing interface and injects the root HTTP source. Only `getRequests`/`getRequest` delegate to it. The other 29 methods, including confirmed writes/order/agenda and proposed quote/contract/catalog actions, return a typed `UNSUPPORTED` failure with zero HTTP, never fake success or empty data. [ListServiceRequestsUseCase/GetServiceRequestByIdUseCase](application/use-cases/service-request-read.use-cases.ts) are stateless `execute()` actions. Opt-in [provideOperationsRequestReads](operations.providers.ts) aliases the domain token with `useExisting`, retaining the same root repository/source instances and existing HTTP/auth providers. It is not installed in application composition yet. The presentation read-state policy below is implemented; navigation, a routed consumer and backend writes remain undelivered.

Observed technical evidence: parent RED compiled with six expected failures/two passes; a later public successful-status parsing regression failed with UNKNOWN instead of INVALID_RESPONSE, then the local mapping fix passed **32/32** tests across the HTTP and existing domain-contract specs. Production browser/server build passed with one prerendered route, warning 646.28/500 kB. This is focused transport evidence, not a new full-suite run, live backend/CORS/permission/redaction or browser acceptance. The separate composition RED compiled with seven missing-GET failures/two passes (DI alias and all unsupported methods), then forwarding the two reads passed **60/60** Operations tests across four files and the same browser/SSR build with one prerendered route (646.28/500 kB warning). [Public composition tests](infrastructure/repositories/operations-read-composition.spec.ts) cover query/projection/error/cancellation forwarding, singleton aliasing and unsupported methods. Full T5/WP7 remain pending.

### Request presentation read state (unrouted)

Root [ServiceRequestsStore](presentation/state/service-requests.store.ts) exposes `observeRequests/selectRequests` and `observeRequest/selectRequest`; selectors return reactive snapshots (`result/loading/refreshing/error/expires`), not a copied current catalog. Caller query snapshots normalize defaults, blank/cased states and all documented filters before admission; invalid keys dispatch no HTTP or evict verified entries. Source order and effective page metadata remain unchanged.

The existing shared read-resource/session-scope pattern supplies 30000ms success-only freshness, checked on consumer reads/revisits without polling. Same-key reads share cancellation/refcounts; force joins an existing flight. Verified same-key results, including empty/zero, survive refresh failures with visible error state; failure never renews freshness. Each list/detail registry admits at most 20 entries and protects active views. Consumer subscriptions own activity; logout/expiry/identity or fixed-deadline replacement clears/fences data, while same-session renewal preserves it. SSR initializes neither auth nor reads. Cached presentation data is not authorization; no persistence, business timezone or browser-derived today is introduced.

[State tests](presentation/state/service-requests.store.spec.ts) first compiled with 13 expected failures/two passes; the final candidate passed **76/76** Operations tests across five files and browser/SSR build with one prerendered route (646.28/500 kB warning). This is not a new app-wide full-suite run or backend/browser acceptance. No root application binding, route/UI consumer, write action or unused future invalidation API is added.

## Schema coverage

Authoritative fields: `D:/java/sistema_the_real_maids/realmaids_mysql_64_tablas.sql`, area D. Each class below has its own named entity file, with private positional constructors/static `create()` following User. Factories only materialize values; they do not calculate totals, enforce transitions or infer identities.

| SQL table                | Entity export and path                                               |
| ------------------------ | -------------------------------------------------------------------- |
| `cotizacion`             | [Quote](domain/entities/quote.entity.ts)                             |
| `detalle_cotizacion`     | [QuoteLine](domain/entities/quote-line.entity.ts)                    |
| `contrato_servicio`      | [ServiceContract](domain/entities/service-contract.entity.ts)        |
| `solicitud_servicio`     | [ServiceRequest](domain/entities/service-request.entity.ts)          |
| `estado_orden`           | [OrderStatus](domain/entities/order-status.entity.ts)                |
| `orden_servicio`         | [ServiceOrder](domain/entities/service-order.entity.ts)              |
| `historial_estado_orden` | [OrderStatusHistory](domain/entities/order-status-history.entity.ts) |
| `motivo_reprogramacion`  | [ReschedulingReason](domain/entities/rescheduling-reason.entity.ts)  |
| `programacion`           | [ServiceSchedule](domain/entities/service-schedule.entity.ts)        |
| `asignacion`             | [ServiceAssignment](domain/entities/service-assignment.entity.ts)    |

Quote linkage uses Angular `leadId` for the SQL `id_prospecto` column; the backend/schema naming is unchanged.

No assigned table/column is omitted from the schema entities. Source-system/external IDs remain nullable metadata. Request/order `updatedAt` is nullable even though SQL supplies an update default: a default is not NOT NULL. Actors and parent links remain primitive IDs; no cross-area entity imports exist.

## Confirmed backend capabilities

Read-only source evidence relative to `D:/java/sistema_the_real_maids/backend`:

| Evidence paths                                                                                                                                                                                                | Confirmed capability                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main/java/utp/edud/pe/backend/controller/SolicitudController.java`; `dto/SolicitudRequest.java`, `dto/ActualizarSolicitudRequest.java`, `dto/SolicitudResponse.java` under the same backend Java package | Paged requests, detail, create, update and cancellation. Create includes customer/property/service type IDs; update cannot change customer; actor/status/timestamps are server-owned. |
| `src/main/java/utp/edud/pe/backend/controller/OrdenController.java`; `src/main/java/utp/edud/pe/backend/dto/OrdenDtos.java`                                                                                   | Paged orders/detail; create from request; update estimated amount/observation; change state; schedule/re-schedule; replace the whole assigned team, including an empty list.          |
| `src/main/java/utp/edud/pe/backend/controller/AgendaController.java`; `src/main/java/utp/edud/pe/backend/dto/OrdenDtos.java`                                                                                  | Agenda between local calendar dates, optional staff filter.                                                                                                                           |
| `src/main/java/utp/edud/pe/backend/controller/CatalogoController.java`; `src/main/java/utp/edud/pe/backend/dto/OrdenDtos.java`                                                                                | Active rescheduling reasons, not administrative mutations.                                                                                                                            |
| `src/main/java/utp/edud/pe/backend/dto/PropiedadResponse.java`                                                                                                                                                | Property projection included in order detail.                                                                                                                                         |

The abbreviated request DTO locators above expand to `src/main/java/utp/edud/pe/backend/dto/`. These are source-confirmed capabilities, not proof of runtime availability or authenticated acceptance.

[OperationsRepository](domain/repositories/operations.repository.ts) marks confirmed methods separately. Its [read projections](domain/models/operations-read.models.ts) preserve response information without fabricating SQL fields absent from DTOs: request responses provide registrar names rather than user IDs; history lacks row IDs/status IDs; schedules provide reason/registrar names rather than their IDs; order responses expose status codes and contextual customer/service-type names rather than the complete SQL order. Schema entities are therefore **not directly hydratable from those responses**. The order property projection is area-owned and uses primitive customer IDs, avoiding a domain dependency loop.

Read queries extend shared `PaginationParams` and return shared `PaginationResponse<T>`. Request transport now maps pagination and Spanish wire fields without a duplicate page type; the other capabilities still await adapters. Confirmed date filters are request registration days and order scheduled days, respectively. Agenda uses a list, not a guessed paged response.

## Proposed domain contracts and write boundaries

Quote/list/detail/create/update, quote-line reads/create/update, contract/list/detail/create/update, order-status catalog reads/create/update and full rescheduling-reason administration are **proposed**. No quote/contract administration endpoint or business workflow is claimed. Quote children are addressed under quote IDs; histories/schedules/assignments are obtained through confirmed order detail/list projections rather than arbitrary history CRUD.

[Explicit params](domain/params/operations.params.ts) exclude generated IDs, quote/contract numbers, order codes, totals/subtotals, actor IDs, history entries and identity timestamps. Proposed quote create accepts line input; line subtotal and quote totals remain server-derived. Contract customer identity cannot be changed by update. Confirmed order creation accepts request ID only plus estimated amount/observation, never arbitrary initial state/property/contract. Order update is restricted to amount/observation. Scheduling cannot set `isCurrent`, history or registrar; assignment replacement cannot supply SQL assignment IDs, crew IDs or timestamps. There is no standalone create/update-history param because history is server-generated by actions. No unsupported deletion, conversion or reopening rule is invented.

Status/role values are open strings under S6, not enums inferred from SQL seeds or Java DTO enums. The confirmed request adapter validates `registrada`/`atendida`/`cancelada`; order values include `EN_PROCESO`/`COMPLETADA`/`PAGADO`/`CANCELADA`, assignment roles `RESPONSABLE`/`APOYO`; backend validation and authorization remain authoritative. This foundation does not implement a state machine, scheduling conflict checks or role-derived ACL. Existing IAM contracts remain untouched.

[OperationsError](domain/errors/operations.error.ts) supplies a typed Error subclass with proposed safe categories, not a promised backend error format. All methods return `Observable<Result<T, OperationsError>>` through shared Result. `OPERATIONS_REPOSITORY` remains a typed InjectionToken; its opt-in provider aliases the root implementation, without installing it in application composition.

## Types and security

INT IDs/quantities/order indexes are `number`; cross-area FKs are primitive IDs. This area has no BIGINT columns; new BIGINT IDs elsewhere use `string`. DECIMAL totals/prices/amounts are exact decimal strings, with no frontend financial arithmetic. DATE/TIME values are strings preserving local calendar/clock semantics; DATETIME values are `Date`, preserving the supplied object in factories. All SQL nullable columns use `| null`, including optional relationships and dates. Catalog names, roles, source systems and statuses are open strings because there are no CHECK constraints in area D.

No password/session hashes, encrypted QuickBooks credentials or processor token references are modeled; none occur in these tables. Property access details in the confirmed detail projection are operationally sensitive and must not be logged or treated as authorization. No SQL/backend execution or secret-configuration inspection took place. No operational timezone is selected by this domain work.

## Verification surface

[Factory tests](domain/operations.spec.ts) check every field and nullable column of all ten entities, exact decimal bytes, leap-day DATE/TIME strings, nondefault flags/custom catalog strings and Date reference preservation. [Contract tests](domain/operations-contracts.spec.ts) check feature errors, token resolution, Result failures for every capability, shared-page success/metadata, empty assignment replacement and compile-time generated-field/write restrictions. The [HTTP boundary tests](infrastructure/source/service-requests-http.source.spec.ts) add request transport evidence described above. No live API, browser or full integration acceptance is claimed.
