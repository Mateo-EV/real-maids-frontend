# QuickBooks domain — area K

Three safe schema entities and the real backend's operation contracts are modeled, **without integration code**. OAuth, token storage/renewal, signed callbacks, webhooks, reconciliation and idempotency remain backend-only. M12/RF16–RF17/HU16–HU17/P13 and RNF13–RNF14 supply intent, not evidence of a delivered frontend screen or live synchronization.

## Schema coverage and exclusions

Evidence: `D:/java/sistema_the_real_maids/realmaids_mysql_64_tablas.sql`, area K.

| SQL table                | Entity                                                                        | English mapping                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `conexion_quickbooks`    | [QuickbooksConnection](domain/entities/quickbooks-connection.entity.ts)       | `id_conexion → id`, `id_usuario_autoriza → authorizedByUserId`, `realm_id → realmId`, `nombre_empresa → companyName`, `ambiente → environment`, `estado_conexion → connectionStatus`, `access_token_expira → accessExpiresAt`, `refresh_token_expira → authorizationExpiresAt`, `fecha_ultima_conexion → lastConnectedAt`, `fecha_ultima_sincronizacion → lastSynchronizedAt`, `activo → isActive`, `fecha_creacion → createdAt`, `fecha_actualizacion → updatedAt`                  |
| `sincronizacion_externa` | [ExternalSynchronization](domain/entities/external-synchronization.entity.ts) | `id_sincronizacion → id`, `id_conexion → connectionId`, `entidad_local → localEntity`, `id_local → localId`, `entidad_quickbooks → quickbooksEntity`, `id_externo → externalId`, `direccion → direction`, `estado → status`, `numero_intentos → attemptCount`, `fecha_ultima_sincronizacion → lastSynchronizedAt`, `ultimo_error → lastErrorSummary`, `fecha_creacion → createdAt`, `fecha_actualizacion → updatedAt`                                                                |
| `evento_integracion`     | [IntegrationEvent](domain/entities/integration-event.entity.ts)               | `id_evento → id`, `id_conexion → connectionId`, `id_sincronizacion → synchronizationId`, `tipo_evento → eventType`, `entidad → entity`, `id_local → localId`, `id_externo → externalId`, `metodo_http → httpMethod`, `endpoint → endpoint`, `http_status → httpStatus`, `request_id → requestId`, `resultado → result`, `numero_intento → attemptNumber`, `detalle_error → errorSummary`, `payload_resumen → payloadSummary`, `procesado → isProcessed`, `fecha_evento → occurredAt` |

Deliberate field exclusions:

- `access_token_enc` and `refresh_token_enc`: encrypted credentials are backend-only. There are no frontend access/refresh credentials, client secrets, processor token references or credential write params here. Expiry dates are safe metadata, not credentials.
- `sync_token`: SQL explicitly identifies this as **concurrency metadata**, not authentication. Nevertheless `IntegracionDtos.SincronizacionResponse` does not expose it and no frontend action requires it. It is omitted from both the safe entity and response projection, rather than inventing exposure or conflating it with an OAuth secret.
- `ultimo_error`, `detalle_error`, `payload_resumen` are only sanitized server summaries. No arbitrary full payload/request/response object or frontend event-write contract is modeled. Endpoint strings must not contain secrets/tokens. Factory construction does not sanitize malicious server text; a future adapter must enforce that boundary and rendering must remain text-safe.

## Confirmed operations and DTO differences

Read-only source evidence under `D:/java/sistema_the_real_maids/backend/src/main/java/utp/edud/pe/backend`: `controller/QuickbooksController.java`, `dto/IntegracionDtos.java`; focused service mapping inspection confirms disconnected-state nulls and nullable external synchronization IDs.

[QuickbooksRepository](domain/repositories/quickbooks.repository.ts) expresses the backend's actual operations: status, request authorization, disconnect, synchronize customer, invoice order, read order invoice, refresh payment state, paged synchronizations, explicit retry and paged events. It has no provider, adapter, application action, route or UI. Error codes are proposed frontend normalization, not a claim of backend error-code equivalence. Backend authorization and business rules remain authoritative; there is no automatic retry or guessed state machine.

[API projections](domain/models/quickbooks.models.ts) are intentionally distinct from SQL entities:

- Status is an aggregate without connection/user IDs, active flag or creation/update metadata; it returns an author display name and nullable disconnected-company information. Never fabricate schema IDs from this response.
- Synchronization summaries omit connection ID, direction, `sync_token`, creation/update dates. `externalId` can be null in real service mapping even though SQL declares `id_externo NOT NULL` (empty values become null).
- Event summaries omit connection/synchronization IDs, attempt number and processed flag. They retain only the actual DTO's sanitized diagnostics and event timestamp.
- Invoice details/payments are self-contained API read projections, not duplicate billing entities or cross-feature aggregate dependencies. They preserve nullable synchronization, due date and external payment reference.

Confirmed methods return these actual projections, not complete SQL entities that the DTO cannot populate. The safe schema entities preserve area coverage; exposing their additional fields would require a **proposed future backend contract**, not silent endpoint expansion. No extra schema-level create/update repository operations are proposed because connection/sync/event state belongs to backend actions.

The authorization URL returned by `requestAuthorization` is **untrusted data**. No navigation, redirect handling, callback parsing, OAuth code/state input or webhook API is implemented. Any future navigation requires an approved HTTPS destination allowlist and validated URL handling. Disconnect status does not by itself certify remote revocation. Payment updates and retries are explicit backend actions; cancellation cannot promise rollback.

## Type representations

- SQL INT identifiers use `number`; BIGINT synchronization/event/local IDs use decimal `string`, including nullable BIGINT references. Foreign keys remain IDs, with no imports from billing/customers/operations/users.
- DECIMAL invoice amounts, prices and totals use exact decimal `string`, never frontend financial arithmetic. DATE due dates remain calendar strings; DATETIME/OffsetDateTime map to `Date`. TIME would remain a string (none in area K).
- Nullable SQL fields remain `| null`. Environment, status, direction, entity and event values remain open strings: area K uses SQL comments, **not CHECK constraints**. Example Spanish wire values are not converted into English enum values.
- Java Long/BigDecimal JSON may arrive as numeric literals; a future adapter must secure lossless transport/parsing (or backend string serialization) before these contracts can be wired. Converting an already rounded number to string cannot restore precision. The domain alone cannot solve that integration gap.
- No timezone or i18n configuration is selected from seeds/defaults. Factories preserve supplied values and perform no HTTP validation, credential handling, decimal conversion, browser access or state transitions.

## Verification surface

[Factory tests](domain/quickbooks.spec.ts) cover every safe entity field, null/non-null metadata, sanitized-summary representations and IDs beyond JavaScript's safe-integer range. [Boundary tests](domain/quickbooks-contract.spec.ts) cover all confirmed method signatures, token substitution, typed errors, disconnected status, credential/concurrency exclusions and absent DTO associations. No actual Intuit/backend/browser acceptance is claimed.
