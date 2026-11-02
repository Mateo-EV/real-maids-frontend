# Operations domain — area D

Domain-only coverage of requests, quotes, contracts, orders, scheduling and assignments (M04/M05/M07/M08, RF04–RF06/RF08–RF09, HU04–HU06/HU08–HU09; RNF09/RNF10/RNF12). All ten assigned SQL tables are represented. Existing backend capabilities are distinguished from proposed contracts; no application actions, HTTP adapters, routes, stores, UI, providers or dependencies are added.

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

Read queries extend shared `PaginationParams` and return shared `PaginationResponse<T>`. A future adapter must map pagination and Spanish wire fields; no duplicate page type or transport mapping is introduced here. Confirmed date filters are request registration days and order scheduled days, respectively. Agenda uses a list, not a guessed paged response.

## Proposed domain contracts and write boundaries

Quote/list/detail/create/update, quote-line reads/create/update, contract/list/detail/create/update, order-status catalog reads/create/update and full rescheduling-reason administration are **proposed**. No quote/contract administration endpoint or business workflow is claimed. Quote children are addressed under quote IDs; histories/schedules/assignments are obtained through confirmed order detail/list projections rather than arbitrary history CRUD.

[Explicit params](domain/params/operations.params.ts) exclude generated IDs, quote/contract numbers, order codes, totals/subtotals, actor IDs, history entries and identity timestamps. Proposed quote create accepts line input; line subtotal and quote totals remain server-derived. Contract customer identity cannot be changed by update. Confirmed order creation accepts request ID only plus estimated amount/observation, never arbitrary initial state/property/contract. Order update is restricted to amount/observation. Scheduling cannot set `isCurrent`, history or registrar; assignment replacement cannot supply SQL assignment IDs, crew IDs or timestamps. There is no standalone create/update-history param because history is server-generated by actions. No unsupported deletion, conversion or reopening rule is invented.

Status/role values are open strings under S6, not enums inferred from SQL seeds or Java DTO enums. Current backend request values include `EN_PROCESO`/`COMPLETADA`/`PAGADO`/`CANCELADA`, assignment roles `RESPONSABLE`/`APOYO`; backend validation and authorization remain authoritative. This foundation does not implement a state machine, scheduling conflict checks or role-derived ACL. Existing IAM contracts remain untouched.

[OperationsError](domain/errors/operations.error.ts) supplies a typed Error subclass with proposed safe categories, not a promised backend error format. All methods return `Observable<Result<T, OperationsError>>` through shared Result. `OPERATIONS_REPOSITORY` is a typed InjectionToken only, without a provider/implementation.

## Types and security

INT IDs/quantities/order indexes are `number`; cross-area FKs are primitive IDs. This area has no BIGINT columns; new BIGINT IDs elsewhere use `string`. DECIMAL totals/prices/amounts are exact decimal strings, with no frontend financial arithmetic. DATE/TIME values are strings preserving local calendar/clock semantics; DATETIME values are `Date`, preserving the supplied object in factories. All SQL nullable columns use `| null`, including optional relationships and dates. Catalog names, roles, source systems and statuses are open strings because there are no CHECK constraints in area D.

No password/session hashes, encrypted QuickBooks credentials or processor token references are modeled; none occur in these tables. Property access details in the confirmed detail projection are operationally sensitive and must not be logged or treated as authorization. No SQL/backend execution or secret-configuration inspection took place. No operational timezone is selected by this domain work.

## Verification surface

[Factory tests](domain/operations.spec.ts) check every field and nullable column of all ten entities, exact decimal bytes, leap-day DATE/TIME strings, nondefault flags/custom catalog strings and Date reference preservation. [Contract tests](domain/operations-contracts.spec.ts) check feature errors, token resolution, Result failures for every capability, shared-page success/metadata, empty assignment replacement and compile-time generated-field/write restrictions. No live API, build, browser or full integration acceptance is claimed here.
