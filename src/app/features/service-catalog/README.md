# Service catalog domain — area C

Domain foundation plus the bounded WP7 T3 active-service-type HTTP read boundary (S1/S3), ready for a later request consumer. M04/M05, RF04–RF05/HU04–HU05 supply context; RNF09/RNF10/RNF12 guide layering and validation. All six SQL tables are represented. Nothing here is routed, composed into the application root or connected to UI yet (T4/T5 remain later integration). Catalog administration is **proposed** and explicitly unsupported. The product guide has no separate catalog RF/HU; the operations references do not create new requirements.

## Schema coverage

Authoritative field evidence: `D:/java/sistema_the_real_maids/realmaids_mysql_64_tablas.sql`, area C. Each class has a private positional constructor and a static `create()` that only materializes supplied values, following User; there are no validators, computed prices or invented rules.

| SQL table             | Entity path and export                                            |
| --------------------- | ----------------------------------------------------------------- |
| `categoria_servicio`  | [ServiceCategory](domain/entities/service-category.entity.ts)     |
| `tipo_servicio`       | [ServiceType](domain/entities/service-type.entity.ts)             |
| `frecuencia_servicio` | [ServiceFrequency](domain/entities/service-frequency.entity.ts)   |
| `tarifa`              | [ServiceRate](domain/entities/service-rate.entity.ts)             |
| `servicio_adicional`  | [AdditionalService](domain/entities/additional-service.entity.ts) |
| `tarea_tipo_servicio` | [ServiceTask](domain/entities/service-task.entity.ts)             |

No table/column is omitted from these schema entities. Descriptions, optional rate frequency/end date and additional duration explicitly retain `null`. A service task is associated through its service type ID, not a nested entity graph.

## Confirmed versus proposed contracts

Read-only backend evidence, relative to `D:/java/sistema_the_real_maids/backend`:

- `src/main/java/utp/edud/pe/backend/controller/CatalogoController.java`: authenticated active service-type listing only for this area.
- `src/main/java/utp/edud/pe/backend/dto/TipoServicioResponse.java`: service type ID/name/description/minute duration and category ID/name.

[ServiceCatalogRepository](domain/repositories/service-catalog.repository.ts) separates the **confirmed** `getActiveServiceTypes()` capability from **proposed** reads/create/update for categories, full service types, frequencies, rates, additional services and service-type tasks. No administration endpoint, delete policy, uniqueness handling or permission is inferred. Task create/update explicitly takes the parent service type ID. The SQL entity is not a transport DTO: [ServiceTypeSummary](domain/models/service-type-summary.ts) retains the real response's category name and does not fabricate the SQL-only `isActive` field.

[Params](domain/params/catalog.params.ts) are explicit create/update interfaces; generated IDs are excluded. Catalog activation is proposed mutable data, not authorization. [ServiceCatalogError](domain/errors/service-catalog.error.ts) preserves existing categories and adds safe transport/unsupported categories. Every repository operation keeps shared `Observable<Result<value, ServiceCatalogError>>` and the typed `SERVICE_CATALOG_REPOSITORY` InjectionToken.

## WP7 T3 read boundary — not a completed consumer

- Root [ServiceCatalogHttpSource](infrastructure/source/service-catalog-http.source.ts) performs only authenticated `GET /api/catalogos/tipos-servicio`, without parameters or pagination. It validates unknown arrays, unique positive int32 service IDs, positive int32 category IDs, required names, nullable descriptions and int32 minute durations. It preserves category/name server order, literal descriptions and the six-field projection: no `isActive`, pricing, currency, sorting or CRUD inference.
- Root [ServiceCatalogRepositoryImpl](infrastructure/repositories/service-catalog.repository-impl.ts) implements the full existing interface and injects the root source. Every proposed administration method returns `UNSUPPORTED` with zero HTTP; no administration use cases or UI are added.
- Stateless [ListActiveServiceTypesUseCase.execute()](application/use-cases/list-active-service-types.use-case.ts) propagates the repository Result. Opt-in [provideServiceCatalogReads()](service-catalog.providers.ts) aliases the token with `useExisting`, never to a source. It does not install HttpClient or modify application composition. Later composition must reuse the existing API_URL and auth interceptor.
- Root [ServiceCatalogStore](presentation/state/service-catalog.store.ts) has one catalog entry. `loadActiveServiceTypes(force = false)` is finite, lazy and consumer-subscribed; `selectActiveServiceTypes()` and signal projections expose data/loaded/refreshing/error/expiry, with `loading()` for pending work. Explicit retry passes `true`. Consumers must release subscriptions on destruction and check freshness when revisiting.
- The existing shared read-resource and auth session scope implement the explicitly approved 120000 ms success TTL, checked on reads without polling. Only successful reads renew it; verified stale data remains during refresh/errors, including a verified empty catalog. In-flight reads (including forced retries) join with ref-counted cancellation; only the final subscriber aborts. Logout, expiry or session replacement clears/fences work; same-session renewal preserves it. This catalog is presentation data, not authorization.
- API origin validation fails closed for missing/malformed/credential-bearing URLs. SSR performs no HTTP; transfer cache is disabled. Safe errors map 400/401/403/404/405/409 and network/server failures without exposing backend messages. No retry, demo fallback, storage or payload logging is introduced.

Contract/policy evidence is recorded in [WP7 Log L12–L19](../../../../odd/tasks/wp7-operations.md#log). This is source-contract integration, not live backend/CORS, authorization or browser acceptance, not routed UI and not completion of WP7.

## Representations and security

- SQL INT IDs and integer durations/interval/order values use `number`; FKs remain primitive IDs.
- DECIMAL prices use `string`, preserving scale and precision; no floating-point arithmetic.
- DATE validity values use calendar strings, never timezone-converted Date objects. No DATETIME or BIGINT column occurs in this area; the overall convention is DATETIME `Date` and new BIGINT IDs `string`.
- SQL nullable fields use `| null`, independent of defaults. Required flags use `boolean`.
- Names, currency, language-like catalogs and other unconstrained values remain open strings. This area has no CHECK-constrained values; seed rows do not define enums.
- No credentials, hashes, processor references or encrypted QuickBooks material are modeled. This area contains none of those columns. No secrets/backend configuration were inspected; SQL/backend code was never executed.

## Verification surface

[Factory tests](domain/catalog.spec.ts) exercise every field of every entity, every nullable column, nondefault flags, custom catalog values, exact decimal strings and leap-day validity. [Contract tests](domain/catalog-contracts.spec.ts) cover Error identity/code/message, token injection, typed Result failures for all capabilities, confirmed projection success and generated-field exclusions. Domain factories deliberately do not validate business input. The [HTTP tests](infrastructure/source/service-catalog-http.source.spec.ts), [composition/use-case tests](infrastructure/repositories/service-catalog-composition.spec.ts) and [public store tests](presentation/state/service-catalog.store.spec.ts) add simulated transport, malformed DTO/status failures, unsupported operations, provider identity, success-only TTL, stale feedback, force/ref-count cancellation and session/SSR evidence. They do not certify live APIs/CORS, backend authorization or a finished catalog screen. Full-suite/build verification is parent-owned and separate from this focused slice.
