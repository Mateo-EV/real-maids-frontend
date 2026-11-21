# WP11 — Experiencia del personal de campo

Frontend de la audiencia `PERSONAL_CAMPO`: «Mis servicios» asignados, su detalle y las transiciones de
estado documentadas. El backend ya expone el contrato; este paquete conecta Angular.

## Specs

- **S1 — Contrato real del cambio de estado (verificado en backend `mateo`, sin invención).**
  `PATCH /api/ordenes/{id}/estado` con cuerpo `{ "estado": CodigoEstadoOrden, "observacion": string | null }`.
  `estado` es el enum cerrado `PENDIENTE | PROGRAMADA | EN_PROCESO | COMPLETADA | PAGADO | CANCELADA`.
  `observacion` es opcional, texto, máximo 250. La respuesta es `OrdenDetalleResponse`, es decir
  `{ orden, propiedad, historial, programaciones }`: el mismo shape que ya decodifica el detalle de orden,
  no un DTO plano ni `204`. Autoridad: `ORDEN_ACTUALIZAR`, `ORDEN_ESTADO_ASIGNADA`, `ORDEN_DESACTIVAR` o
  `ORDEN_MARCAR_PAGADA`.

- **S2 — Las transiciones son del servidor, nunca del cliente.**
  El frontend no decide qué transición está permitida: envía el código deseado tal cual y muestra inline el
  error del backend. El backend valida `EN_PROCESO`←`PROGRAMADA`, `COMPLETADA`←`EN_PROCESO`,
  `PAGADO`←`COMPLETADA`, `PROGRAMADA`←`PENDIENTE` con programación válida, y `CANCELADA` desde
  `PENDIENTE`/`PROGRAMADA`; repetir el estado actual es idempotente. No se codifican tablas de transición,
  ACL por rol ni relojes de negocio en Angular.

- **S3 — Audiencia `PERSONAL_CAMPO`.**
  El rol lo devuelve el backend como etiqueta en `PerfilResponse.rol` (`usuario.getRol().getNombre()`); el
  seed define `ADMINISTRADOR`, `ADMINISTRATIVO`, `PERSONAL_CAMPO`, `CLIENTE`. `V2__permisos_por_rol.sql:64-69`
  ya otorga a `PERSONAL_CAMPO` exactamente `PERSONAL_LEER_PROPIO`, `ORDEN_LEER_ASIGNADA` y
  `ORDEN_ESTADO_ASIGNADA`. La audiencia se decide por esa etiqueta, igual que `CLIENTE` decide el portal;
  no se infieren permisos ni IDs de rol. Un cambio de audiencia no puede hacer rebotar una sesión entre
  experiencias: el destino siempre es la home de la audiencia que posee la sesión.

- **S4 — «Mis servicios» es alcance caller-relative, no un filtro del cliente.**
  `GET /api/ordenes` con `ORDEN_LEER_ASIGNADA` ya resuelve el alcance por `personal.usuario.id`; el cliente
  no envía `idPersonal` para «elegir» personal. Un registro fuera de alcance responde `404`, no `403`, y el
  adapter debe conservar esa distinción. Prohibido filtrar una página descargada para simular resultados
  propios completos.

- **S5 — El alta de atención y el detalle propio reutilizan lo existente.**
  El detalle usa el mismo decodificador del GET de orden; la ficha propia usa `GET /api/personal/me`
  (`PERSONAL_LEER_PROPIO`). No se agregan endpoints, permisos, migraciones ni reglas de negocio.

## Tasks

| ID  | Tarea                                                                                                                                                                                                              | Specs  | Repo     | Estado                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | -------- | -------------------------------------------------------------------- |
| T1  | `changeOrderStatus` deja de ser UNSUPPORTED: validador del body y de `OrdenDetalleResponse`, source `PATCH`, wire del repositorio y `ChangeOrderStatusUseCase` stateless, con tests                                | S1, S2 | frontend | **hecho** — `98a6b68`, 77/77 en los dos specs, `tsc` app y spec en 0 |
| T2  | Audiencia `PERSONAL_CAMPO`: `audience-navigation` aprende la tercera audiencia, `/staff` queda protegida por el guard compartido y la lista «Mis servicios» reutiliza el `ServiceOrdersStore` root sin store nuevo | S3, S4 | frontend | in_progress                                                          |
| T3  | Detalle propio de «Mis servicios»: `observeOrder` reutilizado, `404` fuera de alcance como ausencia definitiva y retorno a la página efectiva                                                                      | S4, S5 | frontend | pendiente                                                            |
| T4  | Acciones de estado en el detalle reutilizando `ChangeOrderStatusUseCase`, con confirmación, guard de pendiente e invalidación del store tras éxito confirmado                                                      | S1, S2 | frontend | pendiente                                                            |

## Log

- **L1 (usuario, verbatim):** «De acuerdo a los wp ahora que sigue»
- **L2 (usuario, decisión):** eligió `WP11 — experiencia del personal de campo` como próximo paquete.
- **L3 (usuario, autorización):** «Autorizo trabajar en el backend» — habilita leer y escribir en
  `D:\java\sistema_the_real_maids` (branch `mateo`).
- **L4 (evidencia, exploración read-only):** el backend ya tiene todo el contrato de WP11;
  `GET /api/ordenes` + `ORDEN_LEER_ASIGNADA` es autocope por `personal.usuario.id`
  (`OrdenService.java:114-119`), `PATCH /api/ordenes/{id}/estado` existe con validación de transiciones
  (`OrdenService.java:197-235`), el rol `PERSONAL_CAMPO` y sus tres permisos están en el seed
  (`V1__esquema_inicial.sql:848-852`, `V2__permisos_por_rol.sql:64-69`). Consecuencia: no se crea nada en
  backend; el trabajo es conectar Angular. Los 19 métodos UNSUPPORTED de operations siguen igual salvo
  `changeOrderStatus`, que T1 conecta.
- **L5 (T1, verificado por el padre):** `98a6b68` conecta el cambio de estado. El validador usa el enum
  cerrado de seis códigos, acepta `observation` string o null, rechaza más de 250 y convierte blanco en
  `null`; el source conserva el contexto de conflicto del detalle para que un 404 fuera de alcance siga
  siéndolo. El inventario de métodos sin soporte bajó de 19 a 18 con el ajuste mecánico del spec de
  composición y del README, sin tocar aserciones ajenas. Verificación del padre: 32/32 + 45/45 = 77/77.
- **L6 (T2, verificado por el padre):** `d94ed9b` abre la tercera audiencia. `audience-navigation` decide por
  la etiqueta `PERSONAL_CAMPO` y todo rechazo apunta a `homeForRole` de esa misma etiqueta, así que la
  decisión es simétrica en los tres destinos. `/staff` es un shell lazy protegido por el mismo
  `protectedExperience` y su primera sección es «Mis servicios» sobre el `ServiceOrdersStore` root, sin
  store nuevo ni `idPersonal` enviado por el cliente. Verificación del padre: 46/46 en 5 archivos; la query
  de la página solo lleva `offset`/`limit`.
