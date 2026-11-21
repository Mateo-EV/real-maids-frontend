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
| T2  | Audiencia `PERSONAL_CAMPO`: `audience-navigation` aprende la tercera audiencia, `/staff` queda protegida por el guard compartido y la lista «Mis servicios» reutiliza el `ServiceOrdersStore` root sin store nuevo | S3, S4 | frontend | **hecho** — `d94ed9b` + `1602b82`; verificado por el padre           |
| T3  | Detalle propio de «Mis servicios»: `observeOrder` reutilizado, `404` fuera de alcance como ausencia definitiva y retorno a la página efectiva                                                                      | S4, S5 | frontend | **hecho** — `854e4cc`, 70/70 staff; verificado por el padre          |
| T4  | Acciones de estado en el detalle reutilizando `ChangeOrderStatusUseCase`, con confirmación, guard de pendiente e invalidación del store tras éxito confirmado                                                      | S1, S2 | frontend | **hecho** — `6b0a94d` corregido por `b343fa2`; 91/91 staff           |

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
- **L7 (T2, verificación independiente):** veredicto PARTIAL sin defectos de comportamiento. Aprobado por
  evidencia: simetría de la matriz, cero regresión para `/admin` y `/portal` comparada contra el commit
  padre, guard en la raíz del árbol, y query de la página sin identificador de personal ni filtrado local.
  Gaps de test cerrados en `1602b82`: roles nulo/vacío/desconocido/padded en las seis URLs con simetría, y
  el camino `/staff` desnudo para visitante anónimo y para sesión de backoffice. Sigue sin ejecutarse por
  nadie el mapeo caller-relative del adapter HTTP ni el 404 fuera de alcance de punta a punta, y el fencing
  de sesión de la página descansa en el contrato compartido (`session-read-scope`), no en un test propio.
- **L8 (T3, verificado por el padre):** `854e4cc` agrega `/staff/services/:id`. El estado definitivo se
  enciende con el código real del adapter: `requestError` mapea `404 → NOT_FOUND` y el detalle usa
  `apiConflictContext()`, que preserva el 404 en lugar de dejarlo genérico; no es un código inventado. El
  texto nombra las dos causas honestas del 404 y no ofrece reintento; las fallas transitorias sí. El contrato
  de paging del staff usa `page`/`size` con fallback de par completo, sin recortar tamaños fuera de rango, y
  los links llevan la metadata efectiva. Verificación del padre: 70/70 en 4 archivos y formato limpio.

- **L9 (T4, en corrección):** `6b0a94d` conecta las dos únicas acciones de ejecución del colaborador
  asignado: `PROGRAMADA → EN_PROCESO` («Iniciar servicio») y `EN_PROCESO → COMPLETADA` («Completar
  servicio»), ofrecidas por el estado que sirvió el servidor. No se renderizan programar, pagar ni
  cancelar porque el seed solo otorga `ORDEN_ESTADO_ASIGNADA`; no se inventa tabla de transición ni ACL.
  El diálogo captura el contexto verificado (ID, código, propiedad, estado/estadoNombre), toma la
  observación opcional de máximo 250 con blanco → `null`, despacha solo `ChangeOrderStatusUseCase`,
  bloquea el doble envío y todo descarte mientras está pendiente, conserva el rechazo inline seguro
  para un reintento explícito y, solo ante éxito confirmado de la generación actual, emite un mensaje
  genérico y fuerza exactamente una lectura de esa orden. Sin optimismo, sin reintento automático y
  sin promesa de reversión.
- **L10 (T4, defecto rechazado por la revisión independiente; corrección en vuelo):** el candidato
  trataba el `NOT_FOUND` del `PATCH` como ausencia definitiva, y eso está rechazado: una respuesta de
  escritura no es una lectura verificada de la orden. La regla aceptada es que un `NOT_FOUND` del
  `PATCH` es un rechazo ordinario — el registro verificado sigue en pantalla, la página explica que el
  servicio ya no está disponible para este colaborador y fuerza exactamente una lectura —, y solo
  cuando esa segunda lectura (`GET`) devuelve `NOT_FOUND` se enciende la ausencia definitiva, sin
  reintento alguno. Mientras la corrección no esté comprometida y verificada, T4 no se marca hecho.
- **L11 (cierre del paquete, límites de evidencia):** WP11 queda **entregado como implementación, no
  como paquete aceptado**. No hay corrida contra backend real/CORS, ni aceptación de teclado/responsivo
  en Chrome/Edge/Firefox, ni build SSR de producción registrado para estas rebanadas; la prueba de
  redacción y de permiso entre colaboradores no está verificada de punta a punta; y la revisión nativa
  asesora/refutadora (RDD) no se ejecutó para estos candidatos. La proyección semanal no se construyó
  porque la consulta de órdenes asignadas no la soporta.
- **L12 (T4, revisión independiente y corrección):** la revisión rechazó `6b0a94d`: un `NOT_FOUND` del
  `PATCH` cerraba la pantalla afirmando permanencia, algo que una respuesta de escritura no puede
  establecer. `b343fa2` trata ese 404 como rechazo: conserva el registro, avisa que el servicio ya no está
  disponible para ese usuario y que la asignación pudo cambiar, y fuerza una lectura; solo el `NOT_FOUND`
  del `GET` enciende la ausencia definitiva sin reintento, y el `PATCH` nunca se reenvía. El test que
  codificaba la interpretación equivocada se reemplazó. Verificación del padre: 91/91 staff.
- **L13 (revisión nativa, intentada y no preparada):** con RDD `on` y `reviewDue` en el rango acumulado por
  `auth.guard.ts`, `assess` dio 3823 líneas en 32 archivos, `inspect` devolvió un candidato fresco
  (`review-8b3e0b7ebeacf873`) y `START` falló con `candidate-owner-preparation-failed` / `ETIMEDOUT`:
  `lineage_created: false`, `mutation_outcome: none`. Es el mismo defecto reproducible que el proyecto ya
  registró para WP8 en candidatos acumulados. No se reintentó: un timeout no identifica un lock ni autoriza
  un retry. El slice de escritura aislado (`0026801..HEAD`) había quedado `reviewDue: false` por
  `under_budget`, así que el paquete queda con verificación independiente de sus dos slices sensibles y sin
  la vista nativa adicional.
- **L14 (revisión nativa, causa real):** un segundo intento sobre la generación siguiente devolvió
  `lens_context_budget_exceeded` en `preflight`: la evidencia completa del candidato (3797 líneas, 29 rutas)
  no cabe en el presupuesto de contexto del revisor, no se creó autoridad y reintentar el mismo candidato no
  puede funcionar. El `assess` por slice mide 822 líneas, pero el candidato nativo se construye desde el
  merge-base (`ecbc583`), así que aislar T4 en una rama derivada no lo reduce: T4 depende de T1–T3. La
  continuación que el provider indica es partir el trabajo en una secuencia encadenada de commits
  revisables, cada uno bajo el presupuesto, y refrescar la transición nativa. El paquete queda con las dos
  verificaciones independientes y sin vista nativa; partir la entrega es una decisión de proceso pendiente,
  no un defecto del código.
