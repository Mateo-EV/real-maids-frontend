# Reports and settings domain — area J

All five SQL tables have domain entities. Report/dashboard operations are source-confirmed; KPI administration, safe settings reads and migration history are explicitly proposed. No HTTP adapter, application action, UI, route, provider or dependency is added. M10/RF13/HU13/P12 and M11/RF14/HU14/P02 provide report/dashboard intent; settings/migration-specific RF/HU traceability remains missing.

## Schema coverage

Evidence: `D:/java/sistema_the_real_maids/realmaids_mysql_64_tablas.sql`, area J.

| SQL table            | Entity                                                        | English mapping                                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `definicion_kpi`     | [KpiDefinition](domain/entities/kpi-definition.entity.ts)     | `id_kpi → id`, `nombre → name`, `descripcion → description`, `formula → formula`, `unidad → unit`, `meta → target`, `frecuencia → frequency`, `activo → isActive`                           |
| `medicion_kpi`       | [KpiMeasurement](domain/entities/kpi-measurement.entity.ts)   | `id_medicion → id`, `id_kpi → kpiId`, `periodo_inicio → periodStart`, `periodo_fin → periodEnd`, `valor → value`, `fecha_calculo → calculatedAt`                                            |
| `reporte_generado`   | [GeneratedReport](domain/entities/generated-report.entity.ts) | `id_reporte → id`, `id_usuario → userId`, `tipo → type`, `parametros → parameters`, `formato → format`, `fecha_generacion → generatedAt`                                                    |
| `parametro_sistema`  | [SystemParameter](domain/entities/system-parameter.entity.ts) | `id_parametro → id`, `clave → key`, `valor → value`, `descripcion → description`, `fecha_actualizacion → updatedAt`                                                                         |
| `registro_migracion` | [MigrationRecord](domain/entities/migration-record.entity.ts) | `id_migracion → id`, `entidad → entity`, `sistema_origen → sourceSystem`, `id_externo → externalId`, `id_interno → internalId`, `observacion → observation`, `fecha_migracion → migratedAt` |

All structural fields are represented. Settings entities are **safe public projections only**, not permission to expose arbitrary rows containing secrets. No raw secret configuration may cross this boundary. SQL-nullable fields remain `| null`, including defaulted `parametro_sistema.fecha_actualizacion`. Foreign keys stay numeric IDs; no feature dependency loops.

## Confirmed source contracts

Read-only backend inspection: `controller/ReporteController.java`, `controller/DashboardController.java` and `dto/ReporteDtos.java` under `D:/java/sistema_the_real_maids/backend/src/main/java/utp/edud/pe/backend`.

| Repository operation                | Confirmed behavior                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `getReportTypes`                    | Available report types with title/description                                                           |
| `generateReport`, `exportReportCsv` | Period-filtered report table or raw CSV bytes; generating also records history                          |
| `getGeneratedReports`               | Paged history; DTO returns actor display name, **not user ID**                                          |
| `getDashboard`                      | Generated instant, current situation and period activity, including per-day services and staff workload |

[API projections](domain/models/report.models.ts) preserve those distinctions. `GeneratedReportSummary` deliberately differs from the complete SQL `GeneratedReport`; no user ID is manufactured. Generic report rows use `unknown[][]` because the backend DTO is `List<List<Object>>`, not a guessed fixed report row. CSV returns `Blob`, not reconstructed cached rows. Report types and order-state map keys remain open strings, not SQL-derived enum guesses.

Backend describes business-local date periods (default last 30 days, maximum 366); this domain neither chooses a timezone nor executes default/range logic. Future adapters must preserve the actual contract and validate unknown responses. `GET` report generation is not assumed to be free of side effects or safe for automatic replay.

## Proposed contracts and deliberate omissions

[Repository](domain/repositories/reports-settings.repository.ts) proposals, with no invented endpoints:

- List/create/update KPI definitions; read measurements through their owning KPI. Calculation/measurement writes remain backend-owned; frontend never executes stored formulas.
- Read only explicitly requested, server-allowlisted **public** parameter keys. No general settings create/update API or raw key/value secret-writing contract exists. An approved public allowlist and purpose-specific write design are prerequisites for future mutation support.
- Page migration history by entity/source. No create/update/delete, trigger/import or migration execution contract exists.

[Params](domain/params/reports-settings.params.ts) explicitly define mutable KPI patches and create fields without generated IDs/metadata. Measurements, generated reports and migrations are read models, not generic CRUD targets. No permission, deletion, exceptional state transition or settings policy is inferred from SQL seeds.

## Type representations

INT IDs use `number`; DECIMAL target/value, dashboard amounts/rates and workload hours use exact decimal `string`. DATE remains a calendar string; DATETIME is `Date`; TIME would be a string (none here). New BIGINT identifiers would be strings (none in these tables). SQL nullable fields use `| null`, patch omission uses `?`; VARCHAR defaults/catalogs are not closed because area J has no CHECK-constrained values.

Java BigDecimal/Long JSON serialization is not proven lossless by DTO declarations. A future HTTP adapter must establish lossless decimal/count handling before integration, never stringify an already rounded JavaScript number and claim original precision. Counts are numeric and must be checked for safe-integer range. SQL DATETIME conversion needs an agreed transport timezone; none is selected here. Factories preserve supplied values without arithmetic, calendar conversion or browser APIs.

## Verification surface

[Factory tests](domain/reports-settings.spec.ts) cover all fields, nulls, leap-day calendar strings, decimal scale and Date metadata. [Boundary tests](domain/reports-settings-contract.spec.ts) cover token substitution, every repository signature, Result success/failure, typed errors, nullable patches and absence of settings/migration writes. These contracts do not deliver P02/P12 or certify live API/CSV/browser behavior.
