# Service catalog domain — area C

Domain-only foundation for services and pricing (M04/M05, RF04–RF05/HU04–HU05; RNF09/RNF10/RNF12). All six SQL tables are represented. Nothing is routed, provided at the composition root, persisted or connected to HTTP/UI. Catalog administration is **proposed**, not an implemented backend capability. The product guide has no separate catalog RF/HU; the operations references supply context, not new requirements.

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

[Params](domain/params/catalog.params.ts) are explicit create/update interfaces; generated IDs are excluded. Catalog activation is proposed mutable data, not authorization. [ServiceCatalogError](domain/errors/service-catalog.error.ts) is a typed Error subclass with proposed safe adapter categories; no backend error-code mapping has been implemented. Every repository operation uses shared `Observable<Result<value, ServiceCatalogError>>` and the typed `SERVICE_CATALOG_REPOSITORY` InjectionToken, with no implementation/provider yet.

## Representations and security

- SQL INT IDs and integer durations/interval/order values use `number`; FKs remain primitive IDs.
- DECIMAL prices use `string`, preserving scale and precision; no floating-point arithmetic.
- DATE validity values use calendar strings, never timezone-converted Date objects. No DATETIME or BIGINT column occurs in this area; the overall convention is DATETIME `Date` and new BIGINT IDs `string`.
- SQL nullable fields use `| null`, independent of defaults. Required flags use `boolean`.
- Names, currency, language-like catalogs and other unconstrained values remain open strings. This area has no CHECK-constrained values; seed rows do not define enums.
- No credentials, hashes, processor references or encrypted QuickBooks material are modeled. This area contains none of those columns. No secrets/backend configuration were inspected; SQL/backend code was never executed.

## Verification surface

[Factory tests](domain/catalog.spec.ts) exercise every field of every entity, every nullable column, nondefault flags, custom catalog values, exact decimal strings and leap-day validity. [Contract tests](domain/catalog-contracts.spec.ts) cover Error identity/code/message, token injection, typed Result failures for all capabilities, confirmed projection success and generated-field exclusions. Domain factories deliberately do not validate business input. These tests do not certify live APIs, SSR HTTP behavior, permissions or a finished catalog screen.
