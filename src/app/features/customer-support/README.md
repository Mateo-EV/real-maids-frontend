# Customer support — area G

Customer attention/support for M09/RF11/HU11/P10 (and customer-history context M03/RF12/HU12/P04). Support
requests are **not** service requests.

This feature started as domain-only schema coverage and now has a connected HTTP/application/presentation
boundary for the staff audience. Everything below distinguishes what is implemented from what is still a
proposal or an unverified acceptance gap.

## Connected implementation (WP8)

| Layer                    | Files                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Transport (read + write) | `infrastructure/source/customer-support-http.source.ts`, `customer-support-http.validation.ts`, `customer-support-write.validation.ts` |
| Repository               | `infrastructure/repositories/customer-support.repository-impl.ts`                                                                      |
| Use cases (stateless)    | `application/use-cases/customer-support-read.use-cases.ts`, `customer-support-write.use-cases.ts`                                      |
| Root read/write state    | `presentation/state/support-requests.store.ts`                                                                                         |
| Inbox                    | `presentation/pages/support-requests-page/`                                                                                            |
| Detail                   | `presentation/pages/support-request-detail-page/`                                                                                      |
| Write dialogs            | `presentation/components/support-request-create-dialog/`, `support-message-dialog/`, `support-state-dialog/`                           |

Routes: `/admin/support` (inbox) and `/admin/support/:id` (detail), both guarded and lazy, mounted under the
protected admin shell with their own complete toast scope. The sidebar entry is `Soporte`, in General after
`Operaciones`.

### Decisions this implementation encodes

- **States are a closed wire set.** The backend's `CodigoEstadoAtencion` (`RECIBIDA`, `EN_REVISION`,
  `RESUELTA`, `CERRADA`) plus its `estadoNombre` is the only vocabulary. There is no status catalog
  endpoint, so `getStatuses()` stays unwired. An unknown code is an invalid response.
- **The transition table is the server's.** The state dialog offers the documented targets minus the current
  one and sends the chosen code untouched; a rejected move comes back as an inline error. No transition,
  reopening or type-conditional rule is duplicated in Angular.
- **Redaction is preserved, never reconstructed.** A follow-up whose `autor` is `null` renders an explicit
  "not shown" case; no name, user id or fallback from another field is invented.
- **Paging is bounded at 100.** A requested page size above the backend maximum is refused before dispatch,
  and a returned effective size different from the requested one is an invalid response: otherwise the server
  would silently answer a different offset than the one asked for.
- **Freshness is 30000 ms, success-only**, checked on reads and revisits, never by polling. A failed
  revalidation keeps the verified data visible and only zeroes its freshness. Observed keys re-read once after
  a confirmed write; inactive entries only expire.
- **Writes are coordinated in the root store**: one shared pending gate (a second submit is refused, not
  dispatched), validation before the gate, and only a confirmed current-generation success expires the page
  variants and the affected detail. A creation does **not** seed the detail entry — that entry means a verified
  GET for a key a consumer actually read.
- **Links carry only what the list owns**: offset and limit. Filters stay in-memory page state and never enter a
  URL. An order link is rendered only when the response supplies a real order id.

### Proposals still unwired

`getStatuses`, `getSurveyByOrder` and `submitSurvey` are schema-derived proposals with no endpoint. Surveys
(`encuesta_satisfaccion`), attachments/photos, message templates and catalogue administration are not
implemented.

## Schema coverage

Evidence: read-only `D:/java/sistema_the_real_maids/realmaids_mysql_64_tablas.sql`, area G. All five assigned
tables are represented.

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
- `entity/CodigoEstadoAtencion.java` documents the wire state codes and server transitions.

[CustomerSupportRepository](domain/repositories/customer-support.repository.ts) uses English domain names and
shared `PaginationResponse`, with explicit [params](domain/params/customer-support.params.ts) and
[public DTO projections](domain/models/support-views.ts).

| Repository method  | Source operation                        | Implemented | Important distinction                                                                                                                                                              |
| ------------------ | --------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getRequestTypes`  | `GET /api/catalogos/tipos-atencion`     | yes         | ID/name/requires-response. Uses `SupportRequestTypeView`, not a fabricated complete entity.                                                                                        |
| `getRequestsPage`  | `GET /api/atenciones`                   | yes         | Filters state/type/customer and business-local registration days (`desde`/`hasta`); shared offset/limit maps to `pagina`/`tamanio` (0/20, size capped at 100).                     |
| `getRequest`       | `GET /api/atenciones/{id}`              | yes         | Detail contains the request plus its follow-ups in server order.                                                                                                                   |
| `createRequest`    | `POST /api/atenciones`                  | yes         | Customer id required by the backend for staff; order nullable and omitted when absent. State/closure/registration metadata are backend-owned. Answers 201 with the created detail. |
| `addMessage`       | `POST /api/atenciones/{id}/seguimiento` | yes         | Only the message travels; the server derives author, date and the resulting state.                                                                                                 |
| `changeState`      | `PATCH /api/atenciones/{id}/estado`     | yes         | State plus optional message; the server validates the allowed target and the response requirement.                                                                                 |
| `getStatuses`      | —                                       | no          | No endpoint. The state vocabulary is the closed wire set above.                                                                                                                    |
| `getSurveyByOrder` | —                                       | no          | No endpoint.                                                                                                                                                                       |
| `submitSurvey`     | —                                       | no          | No endpoint.                                                                                                                                                                       |

Public request responses include customer/type names, order code, requires-response and state code/name, **not
the SQL state ID**. Follow-up responses include a nullable author and caller-relative `delCliente`, **not user
ids**. `SupportRequestView`/`SupportFollowUpView` retain those distinctions: no missing ids, active flags or
actor names are manufactured. Offset date-times become `Date`; calendar filters stay literal `YYYY-MM-DD`.

Backend authorization restricts own-customer reads/writes and hides staff author names from customers. The
frontend does not authorize requests: a 403 is authoritative.

## Acceptance boundary

Verified by this feature's tests: DTO mapping and rejection, query/body construction, error mapping, the closed
state set, null-author preservation, ordered follow-up decoding, freshness and stale retention, pending
coordination, invalidation of observed keys, session/SSR fencing, filter-to-query mapping, offset reset,
bounded recovery, invalid-id dispatch, redaction rendering and the write dialogs' validation, pending,
dismissal, draft-preservation and fence behavior.

**Not verified here**: live backend/CORS behavior, backend permission and redaction outcomes for denied or
cross-customer access, real 201/409 payload differences, browser acceptance in Chrome/Edge/Firefox
(responsive and keyboard), exhaustive accessibility, and the customer-own audience (`ATENCION_LEER_PROPIA` /
`ATENCION_CREAR_PROPIA`), which belongs to the portal (WP10).
