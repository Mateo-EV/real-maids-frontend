# WP9 — Dashboard P02 y reportes

Feature: reemplazar el redirect temporal de `/admin` a usuarios por el dashboard real (P02) y, después,
conectar los reportes con su CSV. Lectura mayormente pura, con una excepción que manda el diseño:
`GET /api/reportes/{tipo}` **genera** un reporte y queda registrado en el histórico.

## Specs

- **S1.** Pedido del usuario, textual: "ok continuemos conn lo recomendado que es wp8, luego iremos por lo
  demás". WP9 es el siguiente paquete de la ruta acordada.
- **S2.** Decisión del usuario sobre navegación: **"Reemplazar el redirect de /admin por el dashboard"**.
  `/admin` deja de redirigir a `users` y pasa a abrir el dashboard; el destino por defecto del shell cambia.
- **S3.** Contrato verificado en el backend (rama `mateo`): `GET /api/dashboard?desde&hasta` con autoridad
  `DASHBOARD_LEER`, período por defecto los últimos 30 días, y respuesta
  `DashboardResponse{generadoEn: OffsetDateTime, actual, periodo}` donde
  `actual{ordenesPorEstado: Map<CodigoEstadoOrden, Long>, serviciosHoy, serviciosProximos7Dias,
ordenesSinProgramar, solicitudesPorAtender, atencionesAbiertas, serviciosPorDia[{fecha, servicios}],
cargaProximos7Dias[{idPersonal, nombre, servicios, horas}]}` y
  `periodo{desde, hasta, solicitudesRegistradas, ordenesCreadas, ordenesCompletadas, ordenesCanceladas,
tasaCumplimiento, montoCompletado, quejas}`. `tasaCumplimiento` es nula cuando no hubo cierres; los
  montos son `BigDecimal` y se preservan como texto canónico, sin aritmética en el cliente.
- **S4.** Reportes (fuera de la primera slice, contrato ya verificado): `GET /api/reportes` devuelve el
  catálogo de tipos; `GET /api/reportes/generados?pagina&tamanio` el histórico paginado;
  `GET /api/reportes/{tipo}?desde&hasta` el reporte; `GET /api/reportes/{tipo}/csv` los bytes del CSV.
- **S5.** Regla derivada de S4: **generar un reporte es un efecto, aunque viaje en GET**. No se genera al
  montar la pantalla, ni al refrescar, ni al reintentar: sólo por acción explícita del usuario, y cada
  acción produce exactamente un registro en el histórico. Tampoco se reintenta automáticamente.
- **S6.** Frescura: el dashboard es una vista operativa de una sola pantalla. Se lee **sin caché entre
  visitas**: cada entrada monta una lectura, y un refresco explícito es la única forma de releer. Sin
  polling, sin TTL que inventar y sin caché compartida en el cliente. Los totales son del servidor; nunca
  se derivan de filas cargadas ni de otro endpoint.
- **S7.** Presentación: reutiliza `CatalogFrame`, las tarjetas KPI y los tokens semánticos ya existentes.
  Estados de carga, error reintentable y dato verificado en cero son distintos entre sí; un período sin
  actividad muestra ceros verificados, no "sin datos" ambiguo. El color nunca es la única señal. Los
  importes y la tasa se muestran como texto suministrado, sin recálculo ni redondeo propio.
- **S8.** Sin permisos inferidos: `DASHBOARD_LEER` es autoridad del backend y un 403 se muestra como error,
  no como dashboard vacío. No se agrega ACL ni inferencia por rol en el cliente.
- **S9.** Arquitectura obligatoria del repo: source HTTP con validación de DTOs desconocidos, repositorio de
  infraestructura que implementa el contrato de dominio, binding `useExisting`, casos de uso stateless,
  store raíz de un solo registro para el dashboard, cancelación por consumidor, fencing de sesión/SSR, sin
  `any`, sin fallback demo, sin reintento de escrituras.
- **S10.** Documentación y evidencia: README de la feature, `docs/README.md`, `docs/implementation-roadmap.md`
  (WP9) y `AGENTS.md`; specs deterministas por capa, suite completa, build de producción con SSR y Prettier.
  Ninguna afirmación de aceptación live/browser no ejecutada.

## Decisiones

- **D1 — Navegación (resuelta por el humano):** `/admin` abre el dashboard y deja de redirigir a users.
- **D2 — Frescura (tomada, revisable):** sin caché entre visitas (S6). Es la opción que no inventa política
  de TTL ni arriesga números viejos en un tablero operativo; si preferís un TTL, se cambia en el store sin
  tocar la presentación.
- **D3 — Alcance de reportes (resuelta por el humano):** "Reportes sin CSV primero". W6 entrega catálogo de
  tipos, generación bajo acción explícita e histórico paginado; el CSV queda en W7, después.

## Tasks

| ID  | Tarea                                                      | Specs      | Ruta      |
| --- | ---------------------------------------------------------- | ---------- | --------- |
| W1  | Transporte HTTP del dashboard con validación de DTOs       | S3, S8, S9 | worker    |
| W2  | Repositorio, casos de uso y composición root               | S3, S9     | worker    |
| W3  | Store raíz de un solo registro, sin caché entre visitas    | D2, S6, S9 | worker    |
| W4  | Página del dashboard en `/admin`, reemplazando el redirect | S2, S7     | worker    |
| W5  | Documentación y evidencia del dashboard                    | S10        | inline    |
| W6  | Reportes: catálogo, histórico y generación explícita       | D3, S4, S5 | pendiente |
| W7  | CSV de reportes                                            | D3, S4, S5 | pendiente |

## Slices

| Slice | Commit        | Contenido                                                                                          |
| ----- | ------------- | -------------------------------------------------------------------------------------------------- |
| S-1   | `e7013c0`     | Dominio, transporte validado, repositorio, caso de uso, composición root y store sin caché (W1–W3) |
| S-2   | (este commit) | Página P02 en `/admin`, reemplazo del redirect y siete aserciones de frontera actualizadas (W4)    |

## Log

- **L1.** Pedido del usuario, textual: "ok continuemos conn lo recomendado que es wp8, luego iremos por lo
  demás".
- **L2.** Decisión del usuario sobre navegación, elegida: "Reemplazar el redirect de /admin por el dashboard".
- **L3.** Contrato verificado (sólo lectura) en `D:/java/sistema_the_real_maids/backend`: `DashboardController`
  con `DASHBOARD_LEER` y período por defecto de 30 días; `ReporteController` con catálogo, histórico,
  generación por `GET /{tipo}` y CSV por `GET /{tipo}/csv`; campos exactos de `DashboardResponse`,
  `SituacionActual` y `ActividadPeriodo` en `dto/ReporteDtos.java`. Hallazgo que gobierna el diseño: la
  generación de un reporte es un efecto sobre un GET (S5).

- **L4.** W1–W3 entregados: dominio, transporte con validación estricta de DTOs, repositorio, caso de uso
  stateless, `provideDashboardReads()` con `useExisting` y un store raíz de un solo registro sin caché entre
  visitas. Ambigüedades que quedan como ítems de aceptación, no como código adivinado: los `BigDecimal` se leen
  como número JSON y se preservan verbatim como texto (si el backend los serializara como strings, el decoder
  los rechaza), y las unidades de `tasaCumplimiento` no están documentadas, así que no se aplicó cota de unidad.
- **L5.** W4 entregado: `/admin` abre el dashboard con `pathMatch: "full"` + `loadChildren` en el hijo vacío —
  esa combinación es la que impide que el grupo lazy se trague `/admin/users` y el resto del shell. La página se
  suscribe **una vez por entrada y por ventana aceptada** (`Subject` + `switchMap` + `takeUntilDestroyed`),
  porque el store no cachea y una suscripción nueva es una lectura nueva; el spec lo verifica sobre
  `detectChanges()` repetidos. Siete aserciones preexistentes fijaban el redirect anterior en cuatro archivos de
  spec; se autorizó su corrección mínima y sólo esas líneas cambiaron. Decisión pendiente del humano: el botón
  `Landing` del sidebar sigue deshabilitado, así que hay una inconsistencia visible entre la navegación y lo que
  sí existe.

- **L6.** W5 y cierre técnico del dashboard. Documentación en el README de la feature, la guía de producto, el
  roadmap y `AGENTS.md` (commit `dd48b58`). Evidencia: suite completa **3644/3644 en 194 archivos** en tres
  corridas consecutivas, `tsc` app y spec en 0, Prettier limpio, build de producción con SSR **exit 0** y un
  prerender, bundle inicial **690.57/500 kB**. **Observación honesta:** una corrida anterior de la suite dio
  5 archivos y 8 tests fallidos que **no se reprodujeron** en las tres corridas siguientes; el log de esa corrida
  se truncó con `tail` y no conservó los nombres, así que la inestabilidad queda registrada sin atribuir. No se
  presenta como determinismo probado.
- **L7.** Decisión abierta D3 (reportes): dónde vive el histórico y qué se muestra del CSV. Hasta resolverla no se
  escribe código de reportes, porque la generación es un efecto sobre un GET (S5) y equivocarse ahí duplica
  registros en el histórico del backend.

- **L8.** Pausa pedida por el humano al cerrar el dashboard. Decisión D3 registrada antes de parar: reportes sin
  CSV primero (catálogo + generación explícita + histórico paginado en W6; CSV en W7). Estado al pausar: rama
  `feat/wp9-dashboard` con árbol limpio, sin trabajos en segundo plano y sin tareas a medio hacer. W6 y W7 no
  empezaron.

- **L9.** W6 entregado: catálogo de tipos, histórico paginado y tabla generada en `/admin/reports`, con entrada
  `Reportes` en General después de `Soporte`. La generación es alcanzable **sólo** por el botón explícito: ni el
  montaje, ni editar el borrador, ni refrescar el histórico, ni un reintento automático despachan
  `GET /api/reportes/{tipo}`. Tras un éxito confirmado se refresca el histórico una vez; si esa lectura falla se
  conserva lo verificado y no se regenera. Interpretaciones adoptadas: el tipo elegido debe pertenecer al catálogo
  verificado, pero el `tipo` de una fila histórica se preserva literal porque registros viejos pueden preceder al
  catálogo actual; un reporte cuyo `tipo` no coincide con el pedido es respuesta inválida; el tamaño efectivo del
  histórico debe coincidir con el pedido. Límite declarado en el código: la garantía de acción única es del cliente
  y por instancia del store — otra pestaña puede generar por su cuenta y cancelar no deshace una generación ya
  registrada; no hay idempotencia ni rollback. Nueve aserciones de navegación preexistentes se actualizaron con
  autorización explícita (tercera vez en WP9); la fricción es real y queda anotada.
