# WP8 — Soporte al cliente (`/api/atenciones`)

Feature: conectar en Angular el módulo de atención al cliente que el backend ya expone, reemplazando
el `domain/` aislado de `customer-support` por un consumidor real. El estado actual del paquete es
sólo dominio: no hay source, adaptador, repositorio implementado, casos de uso, store, rutas ni
pantallas.

## Specs

- **S1.** Pedido del usuario, textual: "ok continuemos conn lo recomendado que es wp8, luego iremos
  por lo demás".
- **S2.** Alcance del acceso al backend elegido por el usuario: "Solo lectura del repo backend" en
  `D:\java\sistema_the_real_maids`. Sin ejecutar builds, tests, servidores ni SQL, y sin modificar
  nada de ese repositorio.
- **S3.** Contrato verificado (backend `mateo` @ `829f01f`). Endpoints reales, todos bajo
  `/api/atenciones`: `GET /api/atenciones` paginado (`pagina`/`tamanio`, default 0/20, más reciente
  primero) con filtros `estado`, `idTipo`, `idCliente`, `desde`/`hasta` (fecha de registro, días
  locales del negocio); `GET /api/atenciones/{id}` con su seguimiento; `POST /api/atenciones` (201);
  `POST /api/atenciones/{id}/seguimiento`; `PATCH /api/atenciones/{id}/estado` (idempotente). El
  catálogo de tipos es `GET /api/catalogos/tipos-atencion`.
- **S4.** Estados: el backend usa el enum fijo `CodigoEstadoAtencion` = `RECIBIDA`, `EN_REVISION`,
  `RESUELTA`, `CERRADA`, y devuelve también `estadoNombre` para mostrar. **No existe** endpoint de
  catálogo de estados: `getStatuses()` y el campo `order` de `SupportStatus` son propuestas del
  dominio y no se cablean.
- **S5.** Transiciones documentadas por el backend: `RECIBIDA → EN_REVISION | RESUELTA | CERRADA`;
  `EN_REVISION → RESUELTA | CERRADA`; `RESUELTA → EN_REVISION | CERRADA`; `CERRADA` es final. Las
  consultas, quejas y cancelaciones necesitan respuesta del personal antes de resolverse (puede ir en
  `mensaje`). Un mensaje del personal mueve `RECIBIDA → EN_REVISION`; una réplica del cliente sobre
  una `RESUELTA` la reabre; ninguno aplica a `CERRADA`. Estas reglas son autoridad del backend: el
  frontend no las duplica ni las predice.
- **S6.** Permisos: lectura `ATENCION_LEER` | `ATENCION_LEER_PROPIA`; alta `ATENCION_CREAR` (personal,
  `idCliente` obligatorio) | `ATENCION_CREAR_PROPIA` (cliente, sólo sus órdenes); seguimiento
  `ATENCION_ACTUALIZAR` | `ATENCION_CREAR_PROPIA`; cambio de estado sólo `ATENCION_ACTUALIZAR`. El
  frontend no infiere roles ni ACL: el 403 del backend es autoritativo.
- **S7.** Redacción: en el detalle, `SeguimientoResponse.autor` llega `null` para el personal cuando
  consulta el cliente. El frontend muestra el nombre tal como llega y, si es `null`, no lo inventa ni
  lo deduce de otro campo.
- **S8.** DTOs y validación: `AtencionResponse(idAtencion, idCliente, cliente, idOrden, codigoOrden,
  idTipo, tipo, requiereRespuesta, estado, estadoNombre, asunto, descripcion, fechaRegistro,
  fechaCierre)`; `SeguimientoResponse(idSeguimiento, autor, delCliente, mensaje, fecha)`;
  `AtencionDetalleResponse(atencion, seguimiento)`; `TipoAtencionResponse(idTipo, nombre,
  requiereRespuesta)`. Validación de entrada: `asunto` obligatorio ≤150, `descripcion` obligatoria
  ≤4000, `mensaje` obligatorio ≤4000, `idTipo` obligatorio positivo, `idOrden` opcional positivo. Las
  marcas de tiempo son `OffsetDateTime`; los filtros de fecha son días ISO del negocio.
- **S9.** Fuera de alcance: encuestas de satisfacción (`encuesta_satisfaccion` existe como tabla pero
  **no tiene endpoint**), fotos/adjuntos, plantillas de mensaje y cualquier escritura de estados
  excepcionales. `getSurveyByOrder` y `submitSurvey` quedan sin cablear y así documentados.
- **S10.** Arquitectura obligatoria del repo: source HTTP con validación de DTOs desconocidos,
  repositorio de infraestructura que implementa el contrato de dominio, binding `useExisting` en
  composición, casos de uso `*UseCase.execute()` stateless, store SignalStore raíz con lecturas
  compartidas, cancelación por consumidor y fencing de sesión/SSR. Sin `any`, sin fallback demo, sin
  reintento automático de escrituras.
- **S11.** Presentación: `CatalogFrame` + `CatalogFilters` + registros responsivos, estados de
  carga/vacío/error/stale/reintento independientes, paginación server-side con metadata efectiva y una
  única recuperación acotada de página fuera de rango por acción del usuario.
- **S13.** Corrección obligada por el review nativo (hallazgo `R3-001`, CRITICAL, lente
  `reliability`, confirmado por el refuter adversarial): el tamaño de página pedido al backend no
  puede superar el máximo de 100, porque el servidor lo recorta y entonces `pagina` deja de
  corresponder al `offset` pedido — se devolvían registros equivocados como éxito. Además, como el
  tamaño pedido ya está dentro del máximo, una respuesta con tamaño efectivo distinto se rechaza
  como respuesta inválida en vez de adoptarla con otro offset. El store aplica la misma cota antes
  de admitir una clave, para no aceptar consultas que siempre van a fallar.
- **S12.** Documentación y evidencia: `README` de la feature, `docs/README.md` (producto) y
  `docs/implementation-roadmap.md` (WP8) actualizados con lo implementado frente a lo pendiente; specs
  deterministas por capa, suite, build de producción con SSR y Prettier. Sin afirmar aceptación
  live/browser/backend no ejecutada.

- **D3 — Alcance del primer grupo (resuelta):** sólo el consumidor de personal. El transporte, el
  store y la decodificación se escriben aceptando las dos audiencias (alta con `idCliente`
  nullable, `autor: null` preservado, store que no asume visibilidad total ni filtro de cliente
  siempre presente), pero las pantallas y rutas de cliente quedan en WP10, donde existirá la puerta
  de entrada. T9 se mueve a WP10.

## Decisiones resueltas

- **D1 — Navegación (resuelta):** entrada propia **Soporte** en el sidebar, ruta `/admin/support`,
  protegida con el guard de autenticación existente. No es pestaña de CRM ni sección de Operaciones.
- **D2 — Frescura (resuelta):** 30000 ms para bandeja, detalle y catálogo de tipos, con frescura
  renovada sólo por lectura exitosa, sin polling y con invalidación por escritura confirmada.

## Tasks

| ID | Tarea | Specs | Ruta |
| --- | --- | --- | --- |
| T1 | Transporte HTTP de lista/detalle/tipos con validadores de DTOs y errores propios | S3, S4, S7, S8, S10 | inline |
| T2 | Repositorio de infraestructura, binding `useExisting` y casos de uso stateless (lecturas) | S3, S10 | inline |
| T3 | Store raíz de lecturas con TTL 30000 ms, frescura por éxito y fencing de sesión/SSR | D2, S10 | inline |
| T4 | Consumidor de bandeja en `/admin/support`: filtros, listado responsivo y paginación efectiva | D1, S11 | worker |
| T5 | Detalle con seguimiento (texto literal, instantes UTC, autor redactado) y enlace a la orden | S7, S11 | worker |
| T6 | Transporte y aplicación de las tres escrituras: alta, respuesta y cambio de estado | S3, S5, S6, S8 | worker |
| T7 | Store raíz: compuerta de pendientes compartida e invalidación confirmada; el alta no siembra el detalle | S10, S11 | worker |
| T8 | Consumidores de escritura: alta, respuesta y cambio de estado sobre el registro cargado | S5, S6, S11 | worker |
| T9 | ~~Variante de cliente propio~~ — movida a WP10 por D3 | D3, S6 | — |
| T10 | Documentación y evidencia (README, product guide, roadmap, suite, SSR, Prettier) | S12 | inline |

## Slices de entrega

Estrategia: una unidad revisable por grupo de tareas, en la rama `feat/wp8-customer-support`.
Publicar, abrir PR y mergear sigue siendo decisión del humano; acá sólo se registran las fronteras.
Cada slice incluye sus specs, porque en este repo los tests acompañan al comportamiento y no se
separan en un commit propio.

| Slice | Commit | Contenido | Líneas |
| --- | --- | --- | --- |
| S-1 | `d183d19` | Documento de feature (specs, decisiones, tasks) | 110 |
| S-2 | `0e282d0` | Transporte HTTP + validación de DTOs + specs (T1) | 790 |
| S-3 | `040f7d9` | Repositorio, casos de uso, `useExisting` y composición root + specs (T2) | 329 |
| S-4 | `744c78a` | Store raíz de lecturas con TTL 30000 ms + specs (T3) | 856 |
| S-5 | `3a62c54` | Corrección obligada por el review (R3-001: offset y tope de página) + specs | 63 |
| S-6 | `83ae5d3` | Ruta `/admin/support`, entrada Soporte, bandeja con filtros y paginación + specs (T4) | 1200 |
| S-7 | `0e8897a` | Detalle con línea de seguimiento, contexto de página en URL, enlaces de fila y de orden + specs (T5) | 1151 |
| S-8 | (este commit) | Transporte y aplicación de las tres escrituras (alta, respuesta, cambio de estado) + specs | ver commit |

El objetivo de ~400 líneas se mide sobre código más specs, y acá los specs son la mitad del
volumen: S-2 son 421 líneas de pruebas de transporte con sus negativos malformados, y S-4 son 643
entre spec y fixtures del store. Separarlas en un commit aparte violaria la regla del repo de que el
test viaja con el comportamiento, así que se acepta el tamaño y se declara acá. Fronteras siguientes:
T4 (bandeja) sin navegación de fila todavía — los enlaces de fila y la ruta de detalle llegan en T5
para no dejar enlaces muertos — y después T5–T7 por consumidor.

## Log

- **L1.** Pedido del usuario, textual: "ok continuemos conn lo recomendado que es wp8, luego iremos
  por lo demás". Autoriza WP8 como próximo paquete de la ruta acordada.
- **L2.** Respuesta del usuario a la pregunta de acceso externo, elegida: "Solo lectura del repo
  backend". Alcance exacto `D:\java\sistema_the_real_maids`.
- **L3.** Verificación de contrato (2026, rama `mateo` @ `829f01f`): el módulo existe como `Atencion`
  — `controller/AtencionController.java`, `dto/AtencionDtos.java`, entidades `SolicitudAtencion`,
  `SeguimientoAtencion`, `TipoSolicitudAtencion`, `EstadoAtencion` — con los cinco endpoints de S3, los
  estados de S4, las transiciones de S5, los permisos de S6 y los DTOs de S8. Hallazgo: tres métodos
  del contrato de dominio actual (`getStatuses`, `getSurveyByOrder`, `submitSurvey`) no tienen
  endpoint; no se cablean (S4, S9).
- **L9.** Verificación del padre sobre S-4: suite de la feature 101/101 en 5 archivos, `tsc` app y
  spec exit 0, Prettier correcto en `presentation/`. Revisión propia del store: `expireOnError` sólo
  pone `expires: 0` (`shared/state/keyed-reads.ts:230`), no borra el dato — el resultado verificado
  sobrevive a una revalidación fallida, que es lo que pide S11; y el vocabulario de estados se importa
  de `SUPPORT_STATE_CODES`, no se duplica.
- **L12.** Review nativo **cerrado en `approved`** y autoridad quemada
  (`gentle-ai.review-acknowledged/v1`). Secuencia completa: consentimiento del humano → tres lentes →
  refuter adversarial → hallazgo `R3-001` → corrección en `3a62c54` → validador dirigido → aprobado.
  La corrección se verificó observando RED real: al revertir las dos líneas de producción fallan
  exactamente los tres tests nuevos (75/75 → 3 fallas → 75/75). Aprobación de review ≠ autorización
  de entrega: commit, push y PR siguen siendo política ordinaria del repo.
- **L19.** T7 (store de escrituras) entregado: las tres acciones viven en el store raíz detrás de
  **una** compuerta de pendientes compartida (un segundo submit se rechaza con `CONFLICT`, no se
  despacha), la validación ocurre antes de tomar la compuerta, y sólo un éxito confirmado de la
  generación actual invalida todas las páginas y el detalle afectado; las claves observadas releen
  una vez y las inactivas sólo expiran. Decisión aceptada sobre el registro recién creado:
  **invalidar, nunca sembrar** — la entrada de detalle significa “resultado verificado de un GET que
  un consumidor realmente pidió”, y sembrarla desde la respuesta de un POST le daría datos frescos a
  una clave que nadie consultó. Consecuencia asumida: tras crear, la pantalla hace su propio GET y
  no aparece una fila optimista.
- **L18.** Decisión del humano sobre la deuda de review: **continuar con el hueco declarado**. El
  candidato acumulado (`3a62c54..HEAD`) no se puede preparar en este entorno — dos `ETIMEDOUT`
  reproducibles en `candidate-owner-preparation` — y no se insiste más. Consecuencia explícita: T4,
  T5, T6 y T7 no tienen review nativo; S-1 a S-5 sí lo tienen, y S-5 incluye un CRITICAL corregido y
  aprobado. El hueco sigue la misma causa en cada generación nueva (el candidato acumulado sólo
  crece), así que la decisión vale para las siguientes mientras no se pida lo contrario; no se gasta
  un intento más en cada commit. Nada de este documento presenta un slice sin review como aprobado, y
  RDD sigue activado en el clon: la decisión es sobre este candidato, no sobre el interruptor.
- **L17.** T6 (transporte y aplicación de escrituras) entregado: `POST /api/atenciones`,
  `POST /api/atenciones/{id}/seguimiento` y `PATCH /api/atenciones/{id}/estado`, con reuso del
  decodificador de detalle para toda respuesta. Los tres métodos del repositorio que devolvían
  `UNSUPPORTED` ya tienen transporte; `getStatuses` y las encuestas siguen sin endpoint. Decisiones
  que el worker dejó planteadas y que acepto: `idOrden` nulo se omite (no viaja como `null`);
  `idCliente` nulo se acepta y un valor provisto debe ser int32 positivo (sirve para la audiencia de
  cliente de WP10); **no** se valida pertenencia ni transición de estado en el cliente — se envía y
  el 400 del backend es autoridad; `estado` no tiene tope documentado; y el guard de vinculación en
  el alta (tipo/cliente/orden enviados deben coincidir con la respuesta) sigue el precedente de
  Operaciones. La única edición a un spec existente aplicó la regla de L14: la aserción que fijaba
  “las tres escrituras no existen” se redujo a los tres métodos que sí siguen sin endpoint.
- **L16.** **Hueco de review declarado:** T4 (`83ae5d3`) y T5 (`0e8897a`) no tienen review nativo.
  El candidato acumulado `3a62c54..0e8897a` (~2350 líneas) falla en la preparación de la vista del
  candidato con `ETIMEDOUT`, de forma reproducible: ocurrió con la solicitud derivada, con la
  explícita por `baseRef` y en el reintento autorizado por el humano. No hay lock probado ni defecto
  de código identificado; es una limitación de este entorno con un candidato de ese tamaño. Se anota
  como deuda, no como aprobación ni como revisión fallida del código. Los slices S-1 a S-5 sí tienen
  review cerrado (S-5 con hallazgo CRITICAL corregido y aprobado).
- **L14.** T5 en curso. Dos conflictos de la misma clase: specs que fijan *la ausencia del slice
  siguiente* (`CUSTOMER_SUPPORT_ROUTES` con largo 1 y «no hay enlace de fila todavía»). Ambos eran
  marcadores de frontera legítimos de T4 y ambos hubo que reescribirlos en T5. Resueltos con la
  opción A en cada caso: sólo la aserción de conteo/enlace y su comentario, nada más. Regla que queda
  para los próximos slices: no fijar en un test la inexistencia del slice siguiente; la frontera se
  documenta en el README y en este archivo, no como aserción.
- **L15.** Review nativo de T4 **diferido, no rechazado**: el proveedor exige fijar el inventario de
  archivos sin seguimiento, y ese inventario cambia mientras el worker de T5 escribe. Reintentar en
  cada cambio es churn y quema intentos. Se reintenta cuando el árbol esté quieto (worker terminado
  y sin archivos a medio escribir).
- **L13.** T4 entregado: ruta lazy protegida `/admin/support` con su scope completo de toasts, bandeja
  con filtros server-side (estado, tipo, cliente, desde/hasta), tabla en desktop y tarjetas en móvil,
  metadata efectiva del servidor y una única recuperación acotada; entrada `Soporte` en General
  después de `Operaciones` con `lucideLifeBuoy`. El worker se detuvo correctamente al romper seis
  aserciones de conteo en `admin-sidebar.spec.ts` y `admin.routes.spec.ts`; autoricé la opción A y sólo
  se actualizaron esas seis líneas (etiquetas y conteos), sin debilitar ninguna otra aserción. Las
  filas todavía no son clickeables: el detalle y los enlaces llegan en T5.
- **L11.** Review nativo del slice: consentimiento `granted` del humano, tres lentes corridas
  (risk, resilience, reliability), refuter adversarial requerido y **un hallazgo CRITICAL
  confirmado** (`R3-001`, `causal_disposition: introduced`, `evidence_class: deterministic`): con
  `offset 400` y `limit 200` se enviaba `pagina=2`; si el backend recorta el tamaño a 100, las filas
  empiezan en el offset 200 y la validación lo aceptaba como éxito. Corregido según S13. El test que
  antes fijaba ese comportamiento incorrecto se reemplazó por tres reglas: el offset pedido se
  preserva, un tamaño efectivo distinto es respuesta inválida, y un tamaño pedido mayor a 100 se
  rechaza sin despachar HTTP.
- **L10.** Assess nativo del slice comprometido (`e2aae2d..HEAD`): riesgo `medium`, `reviewDue: false`
  por presupuesto, sin verificador independiente. No es aprobación ni aceptación; es la clasificación
  del candidato.
- **L7.** Verificación del padre sobre S-2/S-3: `ng test --include` de la feature más
  `app.config.spec.ts` → 92/92 en 5 archivos; `tsc -p tsconfig.app.json` y `tsc -p tsconfig.spec.json`
  → exit 0. La revisión del padre confirma que la consistencia de página (`items.length` contra
  `total`, `totalPaginas` contra `ceil(total/size)`) es la misma regla que ya usa `operations`, no
  un criterio nuevo del worker.
- **L8.** Deuda preexistente, no tocada: `prettier --check` falla en 9 archivos del `domain/` que
  este slice no modificó (entidades, params, repositorio y los dos specs de dominio). Se dejaron
  como estaban: la política del repo pide formatear sólo los archivos tocados. Queda registrado para
  no confundirlo con una regresión de WP8.
- **L6.** Decisión **D3** del humano: «Sólo el consumidor de personal (recomendado)». El transporte y
  el store se escriben agnósticos de audiencia; la UI de cliente pasa a WP10 y T9 se retira de este
  documento.
- **L5.** Decisiones del humano: **D1** = entrada propia «Soporte» con ruta `/admin/support`;
  **D2** = 30000 ms de frescura para las lecturas de soporte. **D3** quedó pendiente: pidió la
  explicación del punto antes de elegir.
- **L4.** Exploración de frontera frontend: `customer-support/` sólo tiene README y `domain/`; no hay
  entrada de navegación, ni source, ni store, ni rutas. El patrón de referencia a replicar es el de
  `features/operations` (source → validador → repositorio impl → casos de uso → store → provider →
  rutas → páginas → specs).
