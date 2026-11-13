# Lead stage transitions

Feature: lead follow-ups and lead edits move the funnel stage under one rule, in the backend, and are recorded as follow-ups.

## Specs

S1. Registering a follow-up advances the prospecto's funnel stage in the same POST/transaction.
  Verbatim (user): "la 2" — option "El backend avanza la etapa en el mismo POST".

S2. A follow-up advances to the next LEVEL of the funnel: `orden` is a level, not a unique identifier, and a level may hold several alternative stages. The next level is the smallest `orden` strictly greater than the current one; the user picks one of its stages.
  Verbatim (user): "Solo la siguiente en orden" then "es que está bien que haya etapas con el mismo orden, pueden ser varias opciones de estapa con las que puede seguir el lead, si en caso hay una, solo te dejará una, si hay 3 etpaas del siguiente orden se debe escoger cual de las 3. Puedes leer las etapas para que lo entiendas mejor".

S3. Reaching any earlier stage is allowed only as an explicit rollback with a non-empty reason.
  Verbatim (user): "Cualquier etapa anterior, motivo obligatorio".

S4. The edit PUT keeps changing the stage and obeys the same order rules as the follow-up.
  Verbatim (user): "asegurate que el put siga lasm imas reglas de orden".

S5. A PUT that changes the stage inserts a follow-up indistinguishable from a manual one.
  Verbatim (user): "que no haya distincion, si hay una edicion del put se inserta un seguimiento como si se hubiera hecho asi".

S6. The follow-up component guides selection by funnel order and exposes the rollback case with its required reason.
  Verbatim (user): "en el componente de seguimientos deberia ayudarte a seleccionar de acuerdo al orden que debe seguir y si en caso se debe retroceder por alguna excepcion o error, tmb ponerlo ahi".

S7. RETRACTED. Unique `orden` was implemented in `674a6b1` and is now withdrawn: several stages may share a level on purpose.
  Verbatim (user): "es que está bien que haya etapas con el mismo orden".

S9. A different stage with the same `orden` as the current one is the same funnel step: it is accepted without a reason.

S8. A follow-up that selects the current stage records the entry without moving the stage (derived decision D1: this is the only valid action at the highest `orden` and gives the "excepción o error" case a log-only path).

## Derived decisions (reportable, correctable)

D1. Same-stage follow-up = log only. Without it the highest-`orden` stage could not receive any follow-up.
D2. The edit form supplies the rollback reason through a new optional `comentarioSeguimiento` field on `ProspectoRequest`. The user's S3 requires a reason, S4 requires the PUT to obey the same rules, and S5 forbids a second write; no other source exists. `observacion` is not reused: it is the customer note, not the transition reason, and it is nullable.
D3. A same-level sibling moves the stage (it is a different stage) but is not a regression, so it needs no reason. Only a strictly lower level is a rollback.

## Resolved question

F1. The seeded catalog was `Nuevo 1 · Contactado 2 · Cotizado 3 · Ganado 4 (es_final) · Perdido 5 (es_final)` (`realmaids_mysql_64_tablas.sql:892`). `Ganado` and `Perdido` are terminal alternatives, but different levels let the level rule advance from Ganado to Perdido. Decision (user): give both the same level. The seed now has `Perdido 4`, so level 4 holds both outcomes and the user picks one; no `es_final` semantics were invented.

Pending for the human: an already-provisioned database still has `Perdido` at 5. The one-line fix, to run with the project's own credentials, is `UPDATE etapa_embudo SET orden = 4 WHERE nombre = 'Perdido';`. No migration tool exists in the backend and adding one was out of scope.

## Tasks

- T1 Backend: single transition authority (`S1-S3`, `S8`) + tests. Done: `CaptacionService.cambiarEtapa` is the only transition path; backend commit `674a6b1`, full backend suite 94/94 BUILD SUCCESS.
- T2 Backend: PUT stage change obeys the rules and records the follow-up (`S4`, `S5`, D2) + tests. Done in `674a6b1`; the PUT now takes the actor and inserts the follow-up with the received reason.
- T7 Backend: correct `orden` to a level (`S2`, `S9`, `S7` retracted). Done in `829f01f` (follows `674a6b1`): advance to the smallest greater level, any stage of it; same level moves without reason; only a strictly lower level needs a motivo. The seed gives `Ganado` and `Perdido` level 4.
  Evidence: `CaptacionServiceTest` 30/30, `ClienteApiTest` 16/16, `ProspectoApiTest` 14/14 (0 failures, 0 errors). Full backend suite observed afterwards on the same code: **96/96, BUILD SUCCESS**. Three earlier attempts had died with a native OOM on this machine; freeing RAM resolved it. The earlier statement that the full suite could not be observed is superseded, not retracted: it was true at commit time.
- T4 Frontend: ordered stage guidance and required rollback reason in the follow-up editor (`S6`) + specs. Parent code written; delegate `mwehmm39-1-ak02` is adding specs and verifying. Commit: pending.
- T5 Frontend: stage-change reason in the lead edit dialog and payload (D2) + specs. Same delegate as T4. Commit: pending.
- T6 Docs: AGENTS.md, README, roadmap and OpenAPI note both repos. OpenAPI note done in `ProspectoController`; the rest waits for final counts. Commit: pending.

## Log

L1 (verbatim): "la 2, además tmb la etapa se puede actualizar al editar el prospecto con el put si hay esa edicion deberia insertar un seguimiento tmb. Además, en el componente de seguimientos deberia ayudarte a seleccionar de acuerdo al orden que debe seguir y si en caso se debe retroceder por alguna excepcion o error, tmb ponerlo ahi."

L2 (verbatim, feature origin): "tengo una consulta, los seguimientos no deberian modificar la etapa en la que se encuentra el prospecto?"

L3 Evidence: backend `CaptacionService.agregarSeguimiento` did not touch `prospecto.idEtapa`; its comment reads "La etapa del seguimiento es una referencia, no una transición implícita del prospecto." `actualizar` was the only stage-changing path. `EtapaEmbudo.orden` had no unique constraint. `SeguimientoProspecto` has no origin/automatic column. `OrdenService` already implements guarded transitions plus `HistorialEstadoOrden` as the backend precedent.

L4 Decisions: four answered options recorded in S1-S5 and S8; D2 introduced by the assistant as a derived necessity.
