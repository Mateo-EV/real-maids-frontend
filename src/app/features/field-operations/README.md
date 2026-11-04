# Field operations — area E

WP7 T3 (staff half, S1/S3) adds a read-only HTTP/application/root-state boundary for M06/RF07/HU07/P07 (RNF09/RNF10/RNF12). All seven assigned SQL tables remain represented in domain. Staff capabilities are source-confirmed; crew/execution contracts remain proposals. No routed UI, navigation, upload adapter or dependency is added. T4 consumer/root integration remains pending; this is not full HR CRUD or WP7 completion.

## Staff read boundary (WP7 T3)

- `FieldStaffHttpSource` reads only `GET /api/personal`, `/api/personal/{id}` and `/api/personal/me`. Listing sends optional trimmed `busqueda` (name/document, not email), preserves `activo=false`, and defaults to `pagina=0&tamanio=20`. Aligned safe offset/limit values map to int32 wire page/size; the backend caps effective size at 100. Strict page validation adopts returned page × effective size and total, including consistent out-of-range empty pages, without downloads of every page, slicing or invented totals.
- The source validates unknown DTOs, unique IDs, target/caller identity when available, required fields, nullable contacts/account/calendar date, offset-bearing creation instant and embedded weekly slots. `/me` uses the existing application session observation, not an extra auth request or staff-ID/user-ID equivalence. Local calendar/clock strings preserve supplied precision and order. Empty availability means **no weekly restriction**, not unavailable, free bookings or scheduling authority.
- `FieldOperationsRepositoryImpl` implements the complete existing interface and injects the root source. All confirmed writes and proposed crew/execution/upload operations return typed `UNSUPPORTED` with zero HTTP. Safe transport errors never expose backend text or infer a frontend ACL; hidden-other-record 404 remains `NOT_FOUND`.
- `provideFieldOperationsReads()` returns `EnvironmentProviders`, binding the repository token with `useExisting`. The parent must install it at the root alongside the existing HTTP/auth composition. It provides no HTTP client and is not installed in application configuration yet. Named stateless `GetFieldStaffUseCase`, `GetFieldStaffByIdUseCase` and `GetMyStaffProfileUseCase` expose `execute()`.
- Root `FieldStaffStore` exposes `selectStaff(query)`, `selectStaffById(id)` and `selectMyStaffProfile()` readonly reactive projections of `{result, loading, refreshing, error, expires}`. `readStaff`/`readStaffById`/`readMyStaffProfile` are finite reads; corresponding `observeStaff`/`observeStaffById`/`observeMyStaffProfile` retain caller-owned subscriptions until cancellation. Each accepts an optional final `force` flag for retry. Page results retain actual effective `offset`/`limit`; consumers must use those values for subsequent navigation, never treat a page as the whole staff catalog.
- Existing shared read resources/session scope provide 120000ms success-only freshness, checked on reads/revisits without polling; force joins an existing flight or bypasses freshness. Same-key requests share cancellation and verified same-key rows survive refresh/error. List/detail registries each retain at most 20 entries, evicting inactive/nonpending history and pinning active views; excess concurrent admission returns `UNAVAILABLE`, never evicts an active view. Results live only in SignalStore, with no singleton current query or copied writable read state.
- Logout, fixed-deadline expiry or session replacement clears/fences/cancels reads. Same-session renewal preserves them. SSR dispatches neither staff HTTP nor session observation; transfer caching is disabled and API origin safety/auth interceptor composition is reused. No role-name/JWT inference or operational timezone is selected.

HTTP, use-case/provider and public store tests cover DTO/paging failures, effective metadata, unsupported operations, freshness, stale data, sharing/cancellation and session/SSR boundaries. Exact observed runner results belong to the implementation handoff. Live backend/CORS/authorization, browser/native review and T4 consumer acceptance are not established. Confirmed backend writes are still not frontend-wired.

## Schema coverage

Authoritative field evidence: `D:/java/sistema_the_real_maids/realmaids_mysql_64_tablas.sql`, areas E1/E2. Each entity has a private positional constructor/static `create()` following User and only materializes supplied values.

| SQL table                 | Entity path and export                                            |
| ------------------------- | ----------------------------------------------------------------- |
| `personal_campo`          | [FieldStaff](domain/entities/field-staff.entity.ts)               |
| `disponibilidad_personal` | [StaffAvailability](domain/entities/staff-availability.entity.ts) |
| `cuadrilla`               | [Crew](domain/entities/crew.entity.ts)                            |
| `cuadrilla_integrante`    | [CrewMember](domain/entities/crew-member.entity.ts)               |
| `registro_jornada`        | [WorkLog](domain/entities/work-log.entity.ts)                     |
| `checklist_servicio`      | [ServiceChecklist](domain/entities/service-checklist.entity.ts)   |
| `evidencia_servicio`      | [ServiceEvidence](domain/entities/service-evidence.entity.ts)     |

No assigned table/column is omitted from schema entities. Nullable account/contact/hire/migration fields, end-of-work timestamps, observations, checklist comment/timestamp and evidence staff/description remain `| null`. Crew/staff/order/task relationships are primitive IDs, not cross-area entity graphs.

## Confirmed contracts

Read-only evidence relative to `D:/java/sistema_the_real_maids/backend`:

- `src/main/java/utp/edud/pe/backend/controller/PersonalController.java`: paged staff listing (name/document search and active filter), detail, own staff profile, create/update, desired active status, account link/unlink and whole weekly-availability replacement.
- `src/main/java/utp/edud/pe/backend/dto/PersonalDtos.java`: profile input, response and day/start/end availability slots. Empty availability removes restrictions; null account ID unlinks the account.
- `src/main/java/utp/edud/pe/backend/controller/OrdenController.java` and `src/main/java/utp/edud/pe/backend/dto/OrdenDtos.java`: assignments are an operations-owned whole-team replacement, not staff repository writes.
- `src/main/java/utp/edud/pe/backend/controller/AgendaController.java`: agenda is operations-owned, not a second field-staff query contract.

[FieldOperationsRepository](domain/repositories/field-operations.repository.ts) labels confirmed staff capabilities separately from proposed capabilities. [FieldStaffSummary](domain/models/field-staff-summary.ts) mirrors the public staff projection: account ID and availability slots are present, while SQL migration fields and availability-row IDs/active flags are not manufactured. Full schema `FieldStaff`/`StaffAvailability` entities cannot be hydrated directly from this response without missing data. Availability is associated through its staff parent and replaced as a whole, not exposed through invented row CRUD.

The listing uses shared `PaginationParams` and `PaginationResponse<T>`, without a redundant page type. The read adapter now maps Spanish DTO names and validates current Java day values; no live backend acceptance is claimed. Day/language/role values remain open strings under S6 because SQL does not CHECK-constrain them; Java enum validation is backend-owned (current availability wire days are `LUNES` through `DOMINGO`). No frontend scheduling validator or ACL is introduced.

## Proposed contracts and params

Crew list/detail/create/update; crew-member list/create/update under a crew ID; work-log/checklist/evidence list/create/update under an order ID are **proposed domain operations**, not available endpoints. No deletion policy, clock-in state machine, upload transport, content-type validation, evidence URL trust or business transition is inferred from SQL. Cross-area order/task IDs remain numbers.

[Explicit params](domain/params/field-operations.params.ts) exclude generated row IDs, created/uploaded/checklist-recorded timestamps and source-system identity metadata. Confirmed staff create/update accepts only profile input; status, linked account and availability have dedicated operations. Crew-member updates do not move the member to another staff identity. Work-log start/end Date values are proposed execution input, not generated identity timestamps. Checklist creation identifies a task; completion/comment updates leave its recorded timestamp server-owned. Evidence creation accepts an already obtained file URL, moment, description and nullable staff ID; no upload endpoint is implied. Evidence update changes only moment/description, not identity/file ownership.

[FieldOperationsError](domain/errors/field-operations.error.ts) retains its existing typed categories and adds `UNSUPPORTED`, `UNCONFIGURED`, `UNAUTHENTICATED` and `INVALID_RESPONSE` for the implemented read transport. Every method uses shared `Observable<Result<T, FieldOperationsError>>`; `FIELD_OPERATIONS_REPOSITORY` is explicitly aliased to the separate root implementation by the opt-in provider above.

## Types and security

- INT IDs and FKs use `number`. No BIGINT/DECIMAL columns occur in this area; the project convention for new BIGINT IDs is `string` and for DECIMAL values is exact `string`.
- DATE hire values and TIME availability values use strings, preserving calendar/clock semantics without timezone conversion. DATETIME values use `Date`; factories preserve the supplied reference.
- SQL nullable values explicitly use `| null`; defaults do not imply non-nullability. Flags use `boolean`.
- Only evidence moment has a SQL CHECK: `EvidenceMoment.Before = "antes"`, `EvidenceMoment.After = "despues"`. Catalog weekdays, roles and language codes remain open; seeds/comments do not close a type.
- No password/session hashes, encrypted QuickBooks credentials or processor token references are modeled; none occur in these tables. Staff document/contact details and evidence URLs are operational data, never credentials or authorization. They must not be logged indiscriminately.
- Backend/SQL were inspected read-only, never executed; secret configuration was not read. No operational timezone, business validation or file security policy was invented.

## Verification surface

[Factory tests](domain/field-operations.spec.ts) exercise every field/null of all seven entities, nondefault flags and open catalogs, leap-day/calendar/clock semantics, Date reference preservation and both exact CHECK wire values. [Contract tests](domain/field-operations-contracts.spec.ts) cover error identity/code/message, token injection, typed Result failures for all capabilities, successful null account unlink/empty availability responses and generated-field exclusions. These tests do not certify uploads, live permissions, browser/SSR integrations or a finished staff/execution screen.
