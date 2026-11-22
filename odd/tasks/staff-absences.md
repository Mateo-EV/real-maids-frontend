# Staff absences

Implement dated staff absence requests and HR decisions across the authorized frontend and backend repositories.
Delivery strategy: ask-on-risk. Forecast: over 400 changed lines; reviewable slices required.

## Specs

- **S1.** "ok sigamos con ausencias de personal"
- **S2.** "Personal solicita; RRHH aprueba" — "El empleado solicita y RRHH aprueba o rechaza."
- **S3.** "Bloquear asignación" — "El backend impide asignar servicios durante la ausencia."
- **S4.** "Días completos" — "Fecha inicial y final inclusivas, sin horas."
- **S5.** "Bloquear aprobación" — "RRHH debe resolver primero los servicios en conflicto."
- **S6.** "Personal cancela pendiente" — "El empleado cancela antes de la decisión; RRHH puede retirar una ausencia aprobada."
- **S7.** "Motivo obligatorio" — "Texto obligatorio visible para RRHH y para el empleado dueño."
- **S8.** "Sí, backend y frontend" — "Implementar y verificar el flujo en ambos repositorios."
- **S9.** "Solo empleado y RRHH" — "No guardar el texto del motivo en auditoría general."
- **S10.** "Administradores y administrativos" — "Ambos perfiles gestionan ausencias mediante permisos explícitos."
- **S11.** "Rechazar solapamientos" — "La solicitud duplicada o superpuesta se rechaza."

## Tasks

- [ ] T1 — S2–S8: establish backend contracts, authorization, persistence and transactional absence lifecycle; route: backend; commit: pending.
- [ ] T2 — S3–S5: enforce assignment and scheduling conflicts with concurrency-safe coordination; route: backend; commit: pending.
- [ ] T3 — S2–S7: connect staff requests and HR decisions in frontend; route: frontend; commit: pending.
- [ ] T4 — S1–S8: verify integration, security and document actual evidence; route: both; commit: pending.

## Log

- L1: "ok sigamos con ausencias de personal"
- L2: Decisions S2–S8 selected through interactive questions; backend repository `D:/java/sistema_the_real_maids` explicitly authorized.
- L3: Backend exploration identified existing staff-row pessimistic locks and `ProgramacionService.validarAgenda` as a scheduling and assignment validation seam. Weekly availability is not dated absence.
- L4: Human selected S9–S11 after initial backend implementation; audit reason exposure corrected, independent static verification recorded.
- L5: Backend independent focused verification passed 57/57. Frontend denial/recovery correction independently passed 26/26; worker reported 425/425 focused and production build. Parent full frontend suite passed 4424/4424; backend database-free suite passed 385/385 excluding BackendApplicationTests. Native assessments could not classify untracked scope; no native approval. Neither repository has a feature commit.
- L6: Human started Docker Desktop. Parent used an isolated MariaDB 10.11 container; Flyway V1–V13 and BackendApplicationTests passed. After two failed harness runs and corrections, real database integration passed 13/13, including selected concurrency races and Spring Boot minimal autoconfiguration isolation. Independent static inspection confirmed safety gate and its operator-assertion limitation. Container and temporary password were removed; Docker Desktop closed. Existing-database upgrade, full production profiles and live browser/API acceptance remain unverified.
