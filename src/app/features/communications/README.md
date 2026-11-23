# Communications — CRM notes and email

M03/RF03/HU03 supplies the customer/lead context; WP12 (`odd/tasks/crm-communications.md`) supplies the
communications intent S1–S8. The confirmed backend contract is now connected on the two verified detail
pages: **notes** (author-only editing, never deleted) and **email** (recorded deliveries of the first
channel). The earlier schema-only stubs (channels, templates, sent notifications, preferences) are kept
below as unwired entity coverage; their proposed repository operations were replaced by the real CRM
contract, and nothing else in the repo imported them.

## Connected contract

Wire prefixes are `/api/crm`; paths start there.

| Purpose               | Contract                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Note list             | `GET /clientes/{idCliente}/notas?pagina&tamanio`, `GET /prospectos/{idProspecto}/notas?pagina&tamanio` → `PaginaResponse<NotaResponse>`                                                                                                                                                                                                                                                        |
| Note create           | `POST` the same two paths, body `{ contenido }`; trimmed, required, max 4000 → `201 NotaResponse`                                                                                                                                                                                                                                                                                              |
| Note edit             | `PUT /{clientes\|prospectos}/{id}/notas/{idNota}`, body `{ contenido }` → `NotaResponse`; the backend answers `403` when the caller is not the author, and there is **no delete endpoint**                                                                                                                                                                                                     |
| `NotaResponse`        | `{ idNota, idCliente, idProspecto, contenido, idAutor, autor, fechaRegistro, fechaEdicion }`; exactly one owner column is set and the other is `null`                                                                                                                                                                                                                                          |
| Email templates       | `GET /plantillas-correo` → `PlantillaCorreoResponse[]` `{ idPlantilla, evento, idioma, asunto, cuerpo }`                                                                                                                                                                                                                                                                                       |
| Email history         | `GET /{clientes\|prospectos}/{id}/correos?pagina&tamanio` → paged `CorreoResponse`                                                                                                                                                                                                                                                                                                             |
| Email send            | `POST /{clientes\|prospectos}/{id}/correos` body `{ idPlantilla?, asunto?, cuerpo? }` → `201 CorreoResponse`. Blank `asunto`/`cuerpo` fall back to the chosen template; without a template both are required. `409`/`400` when the record has no valid email, `502` when SMTP is unconfigured or the transport fails (the attempt is recorded as `FALLIDO`, so the UI never retries by itself) |
| `CorreoResponse`      | `{ idCorreo, idCliente, idProspecto, idPlantilla, destinatario, asunto, cuerpo, estado (ENVIADO\|FALLIDO), detalleError, idAutor, autor, fechaEnvio }`; the client never sends a recipient address                                                                                                                                                                                             |
| Permissions (backend) | `NOTA_LEER`, `NOTA_CREAR`, `NOTA_ACTUALIZAR`, `CORREO_LEER`, `CORREO_ENVIAR` — enforced by the server only; the frontend reflects `403` and never infers an ACL from a role name                                                                                                                                                                                                               |

[Domain](domain/), [application use cases](application/use-cases/crm-communications.use-cases.ts),
[HTTP source](infrastructure/source/communications-http.source.ts) and the root
[CrmCommunicationsStore](presentation/state/crm-communications.store.ts) are bound in
`src/app/core/config/app.config.ts` (`COMMUNICATIONS_REPOSITORY` → `useExisting`
`CommunicationsRepositoryImpl`). Sources own validation/mapping; the store owns presentation state.

## Validation and safety

- Every payload is validated before it is trusted: positive int32 IDs, exactly one owner column matching
  the addressed target, ISO instants, `ENVIADO`/`FALLIDO` only, nonblank text, duplicated page/template
  IDs rejected, and the documented page envelope (`pagina`/`tamanio`/`totalElementos`/`totalPaginas`)
  including a returned size above the requested one. Malformed input returns
  `INVALID_INPUT`/`INVALID_RESPONSE` without a synchronous throw and without HTTP.
- `transferCache` is disabled; SSR or an unconfigured origin fails closed with `UNCONFIGURED` and
  dispatches nothing.
- Note content is trimmed before it travels and the edited note must answer the addressed record.
  Email bodies send only the template reference plus non-blank overrides; the recipient and the author
  are backend-owned.
- Errors are safe typed codes (`NOT_FOUND`, `INVALID_INPUT`, `INVALID_RESPONSE`, `FORBIDDEN`,
  `UNAUTHENTICATED`, `CONFLICT`, `NETWORK`, `UNCONFIGURED`, `UNEXPECTED`); backend copy, recipients and
  message content are never rendered or logged through them.

## Presentation decisions

- Root `CrmCommunicationsStore`: separate keyed registries for notes pages, email pages and one template
  entry; success-only freshness (30000 ms notes/email, 120000 ms templates), ref-counted shared flights,
  bounded inactive history with active-key pinning, effective page metadata adoption and session/SSR
  fencing. Writes are counted behind one pending gate and never retried, cached or replayed.
- **Authoritative denial.** A `FORBIDDEN` answer latches the key: the verified payload is dropped and the
  panel shows a permission outcome plus retry instead of an empty or stale list. Only a successful
  authorized read clears the latch, so a later transient failure cannot present a denial as staleness.
  A failed read zeroes freshness, keeping verified rows visible with a retryable stale notice.
- Confirmed writes invalidate only the affected owner's family; mounted panels observe their key, so they
  re-read exactly once and nothing is optimistically appended.
- Panels own paging (offset/limit, effective size kept on navigation, one bounded out-of-range
  correction per user action) and open the two dialogs. Dialogs reuse the shared
  `customerDialogLifecycle`: pending blocks duplicate submit and Cancel/Escape/outside dismissal, a safe
  inline error preserves the draft, and only a confirmed `Result` reaches the caller.
- Editability follows stored authorship: the edit action is offered only when `NotaResponse.idAutor`
  equals the authenticated session id. It is a data fact, not an inferred ACL — an attempt from another
  session is refused by the server with `403`, rendered as a permission outcome.
- A recorded `FALLIDO` delivery is shown as such and never re-sent: there is no resend control and no
  automatic retry.

## Unwired schema coverage (area H)

Evidence: read-only `D:/java/sistema_the_real_maids/realmaids_mysql_64_tablas.sql`, area H. These rows
have no API in the connected contract above and stay entity-only; no administration contract is invented.

| SQL table                  | Entity                                                                      | Content and important types                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `canal_comunicacion`       | [CommunicationChannel](domain/entities/communication-channel.entity.ts)     | INT ID, open name, active flag.                                                                                                        |
| `plantilla_mensaje`        | [MessageTemplate](domain/entities/message-template.entity.ts)               | INT ID/channel ID, event, language, nullable subject, body, active flag. Channel/event/language uniqueness stays backend-owned.        |
| `notificacion_enviada`     | [SentNotification](domain/entities/sent-notification.entity.ts)             | **BIGINT ID is string**; nullable INT template/user/order IDs; recipient, open delivery status, nullable error detail, sent timestamp. |
| `preferencia_notificacion` | [NotificationPreference](domain/entities/notification-preference.entity.ts) | INT ID/customer/channel IDs; language and enabled flag. Customer/channel identify the unique preference.                               |

All SQL INT IDs use `number`; DATETIME → `Date`; nullable fields → explicit `| null`; open strings stay
open (language is not narrowed to the auth enum). These factories preserve supplied values and claim no
runtime DTO validation. The proposed repository operations that used to describe their administration were replaced by the
confirmed CRM contract, and the schema-only params file went with them: nothing imported either of them.
The entity classes stay because they document the tables and their specs still cover them.

## Verification and traceability

Focused specs: [domain factories](domain/communications-domain.spec.ts) (retained entities plus notes,
emails and templates), [contract](domain/communications-contracts.spec.ts) (token, typed errors, paged
notes/emails, body shapes), [HTTP boundary](infrastructure/repositories/communications.repository-impl.spec.ts)
(paths/query/body mapping, owner and envelope validation, `403`, `409`, SSR/unconfigured safety) and
[the store](presentation/state/crm-communications.store.spec.ts) (TTL, shared flights, stale data,
denial latch, owner-scoped invalidation, pending/failed writes, session fencing, SSR). Page specs live
with the consumers: `customer-detail-page/crm-notes.spec.ts`, `customer-detail-page/crm-emails.spec.ts`
and `lead-detail-page/crm-communications.spec.ts`.

RNF09/RNF10/RNF12 guide separation and validation; there is still no communications-specific RF/HU in the
inherited product plan. **Pending:** live backend/CORS, real SMTP delivery and the recorded `FALLIDO`
path, `NOTA_*`/`CORREO_*` permission denials for each profile, author-only enforcement observed live,
`NOTA_ACTUALIZAR`/`CORREO_ENVIAR` in a real session, and Chrome/Edge/Firefox keyboard/responsive checks.
