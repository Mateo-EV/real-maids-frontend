# Customer support domain — area G

Domain-only customer attention/support coverage for M09/RF11/HU11/P10 (and customer-history context M03/RF12/HU12/P04). Support requests are **not service requests**. Existing backend operations inform contracts; no application action, repository implementation, API adapter, UI, route or authorization system is added.

## Schema coverage

Evidence: read-only `D:/java/sistema_the_real_maids/realmaids_mysql_64_tablas.sql`, area G. All five assigned tables are represented.

| SQL table                 | Entity                                                               | Full schema content                                                                                                             |
| ------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `tipo_solicitud_atencion` | [SupportRequestType](domain/entities/support-request-type.entity.ts) | ID/name/requires-response/active.                                                                                               |
| `estado_atencion`         | [SupportStatus](domain/entities/support-status.entity.ts)            | ID/name/order/final flag, without inferred transitions.                                                                         |
| `solicitud_atencion`      | [SupportRequest](domain/entities/support-request.entity.ts)          | Customer ID, nullable order ID, type/state IDs, subject/description, registration and nullable closure.                         |
| `seguimiento_atencion`    | [SupportFollowUp](domain/entities/support-follow-up.entity.ts)       | Request/user IDs, message and timestamp. This is **not** the redacted public response.                                          |
| `encuesta_satisfaccion`   | [SatisfactionSurvey](domain/entities/satisfaction-survey.entity.ts)  | Unique order ID, customer ID, rating, nullable comment and timestamp. Rating allows integers 1 through 5 from the actual CHECK. |

## Confirmed backend contracts

Read-only source evidence under `D:/java/sistema_the_real_maids/backend/src/main/java/utp/edud/pe/backend/`:

- `controller/AtencionController.java` and `controller/CatalogoController.java` establish the operations below.
- `dto/AtencionDtos.java` establishes request/response fields.
- `mapper/AtencionMapper.java` confirms nullable order fields and author-name redaction.
- `entity/CodigoEstadoAtencion.java` documents current wire state codes and server transitions; no frontend transition engine is implemented.

[CustomerSupportRepository](domain/repositories/customer-support.repository.ts) uses English domain names and shared `PaginationResponse`, with explicit [params](domain/params/customer-support.params.ts) and [public DTO projections](domain/models/support-views.ts).

| Repository method | Existing source operation               | Important distinction                                                                                                                                                                                  |
| ----------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `getRequestTypes` | `GET /api/catalogos/tipos-atencion`     | Active catalog response has ID/name/requires-response, **no active field**. Uses `SupportRequestTypeView`, not a fabricated complete entity.                                                           |
| `getRequestsPage` | `GET /api/atenciones`                   | Filters state/type/customer and business-local registration days (`desde`/`hasta`), not UTC-day assumptions. Shared offset/limit domain contract needs eventual adapter mapping to `pagina`/`tamanio`. |
| `getRequest`      | `GET /api/atenciones/{id}`              | Detail contains request plus follow-ups.                                                                                                                                                               |
| `createRequest`   | `POST /api/atenciones`                  | Customer ID nullable for authenticated-customer registration, required by backend for staff; order nullable. State/closure/registration metadata are backend-owned.                                    |
| `addMessage`      | `POST /api/atenciones/{id}/seguimiento` | Only message input; server derives author/date and resulting state. No arbitrary follow-up CRUD.                                                                                                       |
| `changeState`     | `PATCH /api/atenciones/{id}/estado`     | State plus nullable optional-message value; server validates allowed target/transition and response requirement.                                                                                       |

The current API documents `RECIBIDA`, `EN_REVISION`, `RESUELTA`, `CERRADA`; target changes currently accept the latter three. Codes remain open `string` values under the task's CHECK-only closure policy (SQL catalog names are not CHECK-constrained). This is not permission to send arbitrary codes: the server remains authoritative. No transitions, reopenings, role inference or retry policy are invented here.

Public request responses include customer/type names, order code, requires-response and state code/name, **not SQL state ID**. Follow-up responses include nullable author and caller-relative `delCliente`, **not user/request IDs**. `SupportRequestView`/`SupportFollowUpView` retain those distinctions: no missing IDs, active flags or actor names are manufactured. Full SQL entities are schema coverage only, not response DTOs. Backend response timestamps are offset date-times mapped eventually to `Date`; raw transport parsing is not implemented.

Create validation in source: positive IDs when supplied, required type, nonblank subject (150 max), description (4000 max); messages are nonblank (4000 max), change-state message optional (4000 max). No domain runtime validator or transport adapter is claimed. Backend authorization restricts own-customer reads/writes and hides staff author names from customers. The domain does not authorize requests.

## Proposed contracts and omissions

- `getStatuses`, `getSurveyByOrder` and `submitSurvey` are **schema-derived proposals**, with no corresponding endpoint claimed. Missing survey returns `null`; submission omits generated ID/time. The unique order constraint does not imply an update/overwrite policy. No arbitrary survey/history update/delete is exposed.
- No catalog administration, generic request/profile update or raw follow-up repository is invented. Children are associated coherently through request detail and append-message actions.
- The DTO file also contains `HistorialClienteResponse`, combining customers, service requests, orders and attention pages. That cross-feature aggregate is outside this area-G slice; its support records are covered, but no cross-feature entity dependency loop or duplicate history implementation is added.
- [CustomerSupportError](domain/errors/customer-support.error.ts) is a typed frontend error contract. Its codes are safe normalization proposals, not confirmed backend error payload mappings.

## Representation and checks

SQL INT IDs use `number`; nullable fields use explicit `| null`. DATE/TIME contracts use strings (query days are calendar strings); DATETIME uses `Date`. There are no DECIMAL/BIGINT fields in area G; project policy for new ones is decimal/BIGINT strings. FKs stay IDs. Catalog names and state codes stay open; only the survey rating CHECK defines a closed type. No secrets are present in these tables; public actor redaction is preserved by separate projections.

Private positional constructors and `static create` preserve every field, not unknown-response validation. [Factory tests](domain/customer-support-domain.spec.ts) exercise all fields/null/date cases; [contract tests](domain/customer-support-contracts.spec.ts) cover DI, shared Result/pages, confirmed action shapes, redaction and proposed survey inputs. RNF09/RNF10/RNF12 guide layering and feedback; these checks do not certify a live backend integration or support screen.
