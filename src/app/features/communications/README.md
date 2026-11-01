# Communications domain — area H

Domain-only schema coverage for channels, templates, sent notifications and customer preferences. All repository operations are **proposed**, not implemented APIs. No message sending, delivery worker, retry operation, UI, route or third-party integration is added.

## Schema coverage

Evidence: read-only `D:/java/sistema_the_real_maids/realmaids_mysql_64_tablas.sql`, area H. All assigned tables and their nullable fields are covered.

| SQL table                  | Entity                                                                      | Content and important types                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `canal_comunicacion`       | [CommunicationChannel](domain/entities/communication-channel.entity.ts)     | INT ID, open name, active flag.                                                                                                        |
| `plantilla_mensaje`        | [MessageTemplate](domain/entities/message-template.entity.ts)               | INT ID/channel ID, event, language, nullable subject, body, active flag. Channel/event/language uniqueness stays backend-owned.        |
| `notificacion_enviada`     | [SentNotification](domain/entities/sent-notification.entity.ts)             | **BIGINT ID is string**; nullable INT template/user/order IDs; recipient, open delivery status, nullable error detail, sent timestamp. |
| `preferencia_notificacion` | [NotificationPreference](domain/entities/notification-preference.entity.ts) | INT ID/customer/channel IDs; language and enabled flag. Customer/channel identify the unique preference.                               |

## Proposed domain contracts

[CommunicationsRepository](domain/repositories/communications.repository.ts) returns Observable/shared Result with [CommunicationsError](domain/errors/communications.error.ts). Paged results use shared `PaginationResponse` and queries extend shared `PaginationParams`. [Params](domain/params/communications.params.ts) are explicit interfaces, not generic CRUD/mapped entity types.

| Purpose                           | Proposal and boundary                                                                                                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Read channels                     | Read-only catalog; no channel administration contract inferred from schema.                                                                                                                                                                      |
| Query/create/update templates     | Query by channel/event/language; create excludes generated ID. Update includes mutable fields only, with optional `subject: null` distinct from omission. No rendering, interpolation, provider validation or template execution is implemented. |
| Read/set a customer's preferences | Customer/channel supplied as scalar identity; language/enabled input only, backend allocates row ID. This is a purpose-oriented proposal, not a confirmed upsert endpoint or concurrency guarantee.                                              |
| Read sent notification history    | Full-query shared pagination and single-ID read, accepting the original BIGINT string. No arbitrary creation/edit/delete of delivery history.                                                                                                    |

No endpoints, message dispatch actions, retries, resend behavior, delivery guarantees or client-side generation of logs are invented. Backend delivery orchestration and API/DTO/pagination/error/authorization contracts must be confirmed before implementation. Error codes are frontend normalization proposals, not claims about backend payloads. Sent history is backend-generated and deliberately has no create/update params. All four tables are represented; no empty placeholders or omitted entity fields are used.

## Types and security

- All SQL INT IDs use `number`; new BIGINT notification identity uses `string`, preserving values above `Number.MAX_SAFE_INTEGER`. Never coerce it through `Number`.
- DATETIME → `Date`; nullable fields → explicit `| null`. This area has no DECIMAL/DATE/TIME columns; future ones follow project policy: decimal strings and calendar/time strings, without financial arithmetic or implicit timezone conversion.
- Event, language, channel name and delivery status remain open strings: SQL has no CHECK on them. Default/seed values do not establish a closed set; language is not restricted to the existing auth enum.
- Foreign keys stay IDs without cross-feature entity imports. Constructors are private and positional with `static create`, preserving supplied values rather than claiming runtime DTO validation.
- No credential columns occur in area H. Recipient/message/error content can nevertheless be sensitive; future adapters must validate responses and supply sanitized delivery errors without provider credentials or raw secret-bearing payloads. Nothing here logs or persists records, sends notifications or authorizes access.

## Verification and traceability

[Factory tests](domain/communications-domain.spec.ts) compare every field, all nullable alternatives, extensible values, Date preservation and BIGINT precision. [Contract tests](domain/communications-contracts.spec.ts) exercise DI token, typed errors, shared Result/pages, string-ID reads and preference/template params. They do not certify delivery or backend acceptance.

RNF09/RNF10/RNF12 guide separation and validation. The inherited product plan has no communications-specific RF/HU; area H comes from the approved SQL/PDF grouping, and dedicated functional traceability remains open. Domain completeness is not a completed notification feature.
