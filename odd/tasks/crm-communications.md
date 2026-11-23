# CRM communications and notes

Notes and email for customers and leads, used by administrators and administrative staff.
New capability under WP12; frontend has communications domain stubs only, backend has unused schema tables.

## Specs

- **S1.** "ok ahora continuemos con comunicaciones y notas"
- **S2.** "La comunicación debe ser o para clientes" and "Tmb incluye prospectos"
- **S3.** "Quien los ve y edita son los administradores y administrativos"
- **S4.** "Las comunicaciones deberían poder enviarse" and "Ok por ahora correo"
- **S5.** "SMTP por variables de entorno"
- **S6.** "Inmediato al confirmar"
- **S7.** "Editar solo el autor" — a saved note is editable by its author only and is never deleted
- **S8.** "Plantilla editable" — the user picks a template and may adjust subject and body before sending

## Decisions

- **D1 — Notes are append-only records with author-only editing.** No deletion endpoint. Editing records `fechaEdicion`; the author identity always comes from the authenticated session, never from the request body.
- **D2 — Two note tables keep referential integrity** instead of a polymorphic key: `nota_cliente` and `nota_prospecto`, each with its own `ON DELETE RESTRICT` foreign keys.
- **D3 — Email uses `spring-boot-starter-mail` with `JavaMailSender`** configured from `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM` and `MAIL_SMTP_AUTH`/`MAIL_STARTTLS`. No credential is committed and no provider SDK is added.
- **D4 — Sending fails closed.** If SMTP is unconfigured or the transport throws, the API answers an error and records the attempt as `FALLIDO` with a sanitized detail. It never reports a send that did not happen, and never retries by itself.
- **D5 — Each send is recorded** in `correo_crm` with exactly one of `id_cliente` / `id_prospecto`, the authenticated author, the delivered recipient address, the effective subject and body, the template reference when used, the state and the send instant.
- **D6 — Permissions are explicit and granted to `ADMINISTRADOR` and `ADMINISTRATIVO` only**: `NOTA_LEER`, `NOTA_CREAR`, `NOTA_ACTUALIZAR`, `CORREO_LEER`, `CORREO_ENVIAR`. The backend stays the only authorization authority; the frontend only reflects `403`.
- **D7 — Recipient address comes from the stored customer or lead**, resolved and validated by the backend. The client never supplies an arbitrary recipient address.
- **D8 — Templates reuse the existing channel row.** The seeded `canal_comunicacion.nombre` value `Correo electronico` identifies the email channel; no new channel row and no invented `CORREO` code are added. `correo_crm` keeps a nullable `id_plantilla` reference, so a free-text send is valid.

## Tasks

- [ ] T1 — S2–S8: backend notes and email (schema migration, entities, permissions, API, SMTP transport, tests, docs); commit pending.
- [ ] T2 — S2–S4, S7, S8: frontend notes panel and email composer on customer detail and lead detail; commit pending.
- [ ] T3 — S1–S8: verification, live email acceptance boundary and documentation; commit pending.

## Log

- L1: "ok ahora continuemos con comunicaciones y notas"
- L2: "La comunicación debe ser o para clientes"; later "Tmb incluye prospectos".
- L3: "Quien los ve y edita son los administradores y administrativos"
- L4: "Las comunicaciones deberían poder enviarse"; channel decision "Ok por ahora correo".
- L5: Decisions S5–S8 selected through one questionnaire: SMTP by environment variables, immediate send, author-only note editing, editable templates.
- L6: Backend inspection found `canal_comunicacion`, `plantilla_mensaje`, `notificacion_enviada` and `preferencia_notificacion` tables in `V1__esquema_inicial.sql` with no API, no mail dependency and no notes table. `notificacion_enviada` references usuario/orden, so it cannot record customer or lead communications as-is.
- L7: The user authorized reading the backend repository for this feature; no backend credentials, `.env` or secrets may be read, and no email may be dispatched by any test.
- L8: D8 added after a handoff question: the email templates are the existing `Correo electronico` channel rows, not a new channel.
