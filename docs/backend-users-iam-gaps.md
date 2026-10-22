# Pendientes del backend para completar Usuarios / IAM

La integración actual de autenticación está implementada y verificada con HTTP simulado; esta versión todavía no fue validada contra el backend real ni entre pestañas en navegadores reales. La confirmación previa del usuario correspondía al login anterior, no al nuevo ciclo de persistencia y renovación. T3 conecta usuarios y catálogo de roles por HTTP; T4 conecta catálogo y asignaciones RBAC. T5 conecta sesiones IAM y T6 conecta auditoría mediante HTTP; los antiguos sources demo quedan unwired, nunca como fallback. La aceptación autenticada del backend real sigue pendiente.

## Contrato actualizado y límite de integración

El OpenAPI público actualizado (3.1.0, versión 0.1; SHA-256 `7cd6f155d85513215dfaecdbd7beb8dfa335899dc8a6c29f15b7bb92fd28bc28`) ya documenta auth, usuarios/roles/permisos, sesiones y auditoría. T2 se limita a auth; T3 conecta usuarios y catálogo de roles. T4 conecta RBAC, T5 sesiones IAM y T6 auditoría; sus adaptadores no certifican aceptación autenticada. Los apartados históricos siguientes describen el análisis anterior, no ausencia actual de endpoints.

Auth documenta login con `usuario: PerfilResponse`, `token`, `tipo`, `expiraEnSegundos`, `refreshToken` y `refreshExpiraEnSegundos`; `/me` protegido devuelve identidad/rol estable/permisos. Refresh recibe JSON obligatorio `{ refreshToken }`, rota una sola vez y conserva el vencimiento original; reutilizarlo revoca la sesión y no deben existir renovaciones paralelas. La decisión temporal del usuario es localStorage para ambos tokens, no cookies; implica exposición a JavaScript/XSS. El candidato requiere Web Locks para coordinar renovación entre pestañas y falla cerrado cuando no están disponibles.

**Diferencias abiertas:** las respuestas no declaran listas `required` ni nulabilidad: validar campos consumidos sin inventar valores. `ultimoAcceso` no se consume en auth. Logout tiene cuerpo opcional con refresh, y su prosa permite Bearer o refresh cuando el acceso venció y promete 204, pero el esquema declara 200 y `security: []`. El adaptador envía una instantánea Bearer + refresh, acepta 2xx vacío y limita el intento sin afirmar éxito remoto. Confirmar formalmente este transporte y los campos obligatorios/nulos. Producción HTTPS, CORS y comportamiento autenticado real no están verificados.

## Retiro del catálogo fijo — contrato backend `9439829`

La integración completa fue autorizada tras verificar el código del commit backend `9439829`; esto no certifica aceptación autenticada, CORS, navegadores ni SQL contra MariaDB/MySQL aislado. Las lecturas agrupadas, paginadas y de total pueden diferir momentáneamente ante escrituras concurrentes sin garantía de snapshot.

- `GET /api/usuarios/estadisticas`: `{ total, activos, inactivos }`, enteros seguros no negativos con total igual a activos más inactivos; requiere `USUARIO_LEER`.
- `GET /api/sesiones/usuarios`: `busqueda`, booleano opcional `tieneSesiones`, `pagina` base cero y `tamanio` 1–100; sobre de página con filas `{ idUsuario, nombre, correo, sesionesVigentes }`; requiere `USUARIO_LEER` y `SESION_LEER`.
- El total global exacto usa `GET /api/sesiones?pagina=0&tamanio=1`; el detalle por usuario solo se pide al abrir su desplegable. No hay colección fija de 500 usuarios/1000 sesiones ni lecturas N+1 iniciales.
- SignalStores gestionan estadísticas, opciones de actor independientes, resúmenes, detalles y total. Se conservan metadatos efectivos, recuperación acotada, cancelación, 403 visible y fallo cerrado SSR/sin configuración, sin fallback demo. `UserStore` conserva solo escrituras y notificación; éxito y `PARTIAL_UPDATE` incrementan una vez, sin releer ni repetir escrituras. Los consumidores refrescan sus consultas activas; el error parcial se conserva.

## T3 — usuarios y catálogo de roles

- The public OpenAPI confirmed for this change documents `GET /api/usuarios`, ordered by name, with zero-based `pagina` (default 0), `tamanio` (default 20), optional `busqueda` (contains name OR email), `correo` (contains), `idRol` (int32) and `activo` (boolean). The UI uses `busqueda`, not `correo`, and requests ten records. Transport response fields are `contenido`, `pagina`, `tamanio`, `totalElementos`, `totalPaginas`; the source validates them and maps directly to shared `PaginationResponse<User>` (`items`, `total`, `offset`, `limit`). `UserListQuery` extends shared `PaginationParams` with English filters; omitted offset/limit default to 0/20, while the UI initially requests limit 10. Queries require safe nonnegative aligned offsets, positive int32 limits and int32 emitted pages; `pagina=offset/limit` and `tamanio=limit` exist only in HTTP mapping. Limits above 100 are accepted without applying the unrelated shared normalizer cap. Effective response sizes from 1 through the requested limit are accepted, not assumed equal; safe returned offset is page times effective size. The store adopts that actual offset/limit, so offset 20/limit 10 returning size 5 becomes offset 10/limit 5, then the next UI page requests offset 15/limit 5 (backend page 3). Backend effective-size stability across requests remains unverified. Server totals and offset/limit-derived page counts/ranges drive one-based UI navigation without local filtering/slicing. Search waits 250 ms, filters reset page zero, obsolete reads are cancelled, and out-of-range empty pages get at most one clamp/refetch. Failed reads hide unverified rows and retry the same query.
- El catálogo fijo queda retirado por la integración anterior. El listado pertenece a la página; Auditoría usa otro UserListStore y los diálogos reciben el usuario seleccionado. Roles inicializa y reintenta por separado, sin esperar usuarios. Estadísticas/listado/total/resúmenes mantienen errores independientes, sin negar escrituras confirmadas. No cambia auth, RBAC ni lifetimes root/useExisting.
- Listado, detalle, alta, edición y estado validan los campos consumidos de `UsuarioResponse`, incluido nombre, ID de rol, fechas y último acceso explícitamente nullable. No se inventan fechas, IPs, IDs o permisos. Edad y la regla demo ≥18 fueron retiradas, no añadidas al contrato.
- Alta envía `nombre`, `correo`, `password`, `idRol`, `idioma`, `activo`. Perfil usa `PUT /api/usuarios/{id}`; estado usa `PATCH /api/usuarios/{id}/estado` con `{ activo }`; contraseña opcional usa `PUT /api/usuarios/{id}/password` con `{ passwordNueva }`; eliminación usa `DELETE /api/usuarios/{id}`. Las contraseñas conservan sus bytes y nunca quedan en la entidad. Editar con contraseña vacía no la cambia.
- Edición no es transaccional: un fallo posterior al perfil devuelve `PARTIAL_UPDATE` y vuelve a consultar el estado del servidor, sin toast de éxito ni repetición automática. Cancelar una petición enviada no asegura deshacer sus efectos. Una lectura posterior fallida no niega una escritura ya confirmada; requiere reintentar la consulta.
- `GET /api/roles` y su detalle suministran el catálogo real. No se habilita CRUD administrativo de roles; las mutaciones retenidas devuelven `UNSUPPORTED`. Los repositorios inyectan sources HTTP; los sources demo son solo fixtures/simulaciones, nunca fallbacks. Sesiones y auditoría consumen HTTP T5–T6; una coincidencia con IDs de fixtures nunca otorga semántica backend.
- El OpenAPI aún no declara `required`/nulabilidad completos. El adaptador rechaza perfiles incompletos en vez de fabricar valores; confirmar esas garantías y errores con el backend. CORS, autorización efectiva, protección de cuenta propia/último administrador y aceptación autenticada en navegadores siguen pendientes de verificación, sin inferir reglas desde el demo.

## T4 — catálogo dinámico y asignación atómica de permisos

- `GET /api/permisos` devuelve `PermisoResponse[]` ordenado por módulo; `GET /api/roles/{id}/permisos` devuelve las asignaciones. Se validan `idPermiso`, `codigo`, `modulo`, `descripcion`, IDs/códigos duplicados y respuestas desconocidas. No hay columnas CRUD inventadas ni respaldo demo.
- `PUT /api/roles/{id}/permisos` requiere `{ idsPermisos: integer[] }`, IDs no negativos y únicos. Reemplaza el conjunto completo atómicamente; `[]` deja el rol sin permisos. La respuesta es `RolResponse`: se valida el ID de destino y que sus permisos coincidan con los IDs enviados antes de informar éxito. Se aplica desde la siguiente petición.
- El backend rechaza modificar ADMINISTRADOR, editar el propio rol o conceder permisos no autorizados (403). La UI conserva el borrador en errores, bloquea duplicados/cierre pendiente y no infiere restricciones por nombre o `delSistema`. Cargas obsoletas se cancelan; permisos asignados ausentes del catálogo se conservan y muestran explícitamente hasta retirarlos.
- SSR no despacha estas peticiones ni usa transfer-cache; se conserva el interceptor T2 y no se repiten mutaciones automáticamente. Aceptación real autenticada/CORS y navegadores siguen pendientes.
- Evidencia local T4: el archivo OpenAPI tiene SHA-256 `87a9fcd9fa7fecad8b248afc475a0ecd43139cd30306ad1bced8bfc78e507b7c`; una nueva consulta pública a `/v3/api-docs` reproduce `7cd6f155d85513215dfaecdbd7beb8dfa335899dc8a6c29f15b7bb92fd28bc28`. Los JSON parseados, sus 21 paths y sus esquemas son iguales: difiere la representación en bytes, no el contrato observado. Esta comprobación no ejecuta operaciones autenticadas ni verifica CORS.

## T5 — sesiones del backend

- Los resúmenes usan paginación y búsqueda/filtros del servidor en `/api/sesiones/usuarios`, con cinco propietarios iniciales y metadatos efectivos. No se deduce ausencia de una página incompleta ni del reloj. El total de sesiones es independiente del total de propietarios y filtros; se obtiene a tamaño uno, sin descargar todas las sesiones.
- Los desplegables nativos conservan nombre/correo y USR-ID secundario. Detalles, resúmenes y total tienen estados SignalStore y reintentos independientes, con validación estricta y cancelación; no hay lectura del catálogo de usuarios ni identidades fabricadas.
- `GET /api/usuarios/{id}/sesiones` remains available through repository/use-case contracts. Bulk revoke also remains in the store, without a new UI launcher; the backend retains the current session when revoking the caller's other sessions.
- `actual` es relativo al solicitante y viene del backend, sin correlación con tokens o marcadores de almacenamiento. El cierre individual actual devuelve 400 e indica usar Salir; cerrar una sesión ya cerrada/expirada es idempotente. Se aceptan respuestas exitosas vacías 200/204 pese a la diferencia prosa/esquema.
- Confirmación y feedback se protegen mientras hay una escritura pendiente; tras éxito se refrescan una vez resumen activo, total exacto y detalle abierto afectado, sin repetir mutaciones ni fabricar conteos. Un fallo de esa recarga queda visible, sin negar el cierre ya confirmado. Cancelar HTTP no deshace efectos ya enviados.

## T6 — auditoría y CSV del servidor

- `GET /api/auditoria` pagina con base cero, filtros por actor, entidad/acción y días UTC `desde`/`hasta` inclusivos. La UI solicita cinco eventos; `totalElementos` es filtrado y `totalGlobal` no depende del filtro. El detalle usa el ID elegido y valida identidad/cambios recibidos.
- El actor se elige entre opciones cargadas de una consulta nombre/correo debounced y paginada del servidor, con UserListStore propio y selección Helm etiquetada; correo distingue nombres iguales e ID es secundario. Solo seleccionar aporta `idUsuario`, nunca escribir. La identidad elegida se conserva en visitas y huecos de consulta; Todos/limpieza la retira. Carga/error/reintento y cancelación son independientes del listado de Usuarios. Usuarios históricos/eliminados pueden faltar sin limitar eventos, totales, detalle ni CSV. No hay fallback ni nuevo endpoint.
- `GET /api/auditoria/exportacion` entrega CSV crudo de los filtros, con límite documentado de 10.000 registros; no se reconstruye desde filas cacheadas. La descarga protegida para SSR informa solo su inicio y libera la URL de objeto.
- No se certifican fórmulas seguras, headers reales, integridad criptográfica, monitoreo ni inmutabilidad. Las pruebas HTTP simuladas no verifican operaciones autenticadas/CORS, autorización efectiva o aceptación visual/de teclado/descarga en navegadores. Estas verificaciones siguen pendientes para T5 y T6.

## Análisis histórico previo a la actualización

**Los nombres de rutas y campos siguientes eran orientativos.** La capa de infraestructura puede mapear otros nombres y formatos acordados. Lo importante es que existan las operaciones y los datos necesarios, no que el backend copie los nombres del frontend.

Base del análisis: [OpenAPI local](http://localhost:8080/v3/api-docs), versión `0.1`. Los pendientes indican capacidades no documentadas en esa especificación; si ya existen, basta con documentarlas. Alcance: M01/RF01/HU01 y M02/RF02/HU02; auditoría aún no tiene un RF/HU específico en la [guía de producto](README.md).

## 1. Usuarios y catálogo de roles — primera prioridad

### Completar los datos del usuario

La respuesta actual incluye ID, correo, nombre del rol, idioma, estado y fecha de creación. Para representar el usuario completo faltan:

| Dato | Para qué se necesita |
| --- | --- |
| Nombre del usuario | Listado, búsqueda, editor e identidad visible. |
| ID estable del rol asignado | Seleccionar, filtrar y cambiar el rol sin deducir IDs a partir de nombres. |
| Fecha de actualización | Conservar los metadatos del perfil. |
| Último acceso, nullable | Mostrar el último ingreso; `null` cuando no exista. Debe generarlo el backend, no el editor. |
| Edad (histórico) | El formulario demo anterior la utilizaba. T3 la retiró junto con la regla ≥18; no es un dato pendiente del contrato actual. |

El alta actual solo recibe correo, contraseña, ID de rol e idioma. Ampliarla para guardar los datos editables del perfil acordado y definir el estado inicial. Devolver el mismo perfil completo al listar, consultar, crear y editar. No devolver contraseñas ni inventar fechas para rellenar campos.

### Operaciones pendientes

| Ruta sugerida | Qué debe permitir |
| --- | --- |
| `GET /api/roles` | Consultar el catálogo con ID estable, nombre, descripción, estado y fecha de creación. Es necesario para crear/editar usuarios y seleccionar roles en RBAC. |
| `GET /api/usuarios/{id}` | Consultar un usuario con su perfil completo. |
| `PUT /api/usuarios/{id}` o `PATCH` | Editar los campos del perfil y cambiar el rol asignado. Definir cómo se cambia la contraseña opcional del editor: aquí o mediante otra operación. |
| `PATCH /api/usuarios/{id}/estado` | Establecer activo/inactivo sin sobrescribir otros campos. Recibir el estado deseado, no una orden de alternar. |
| `DELETE /api/usuarios/{id}` | Eliminar el usuario. Definir baja lógica/física y restricciones; no confundir esta acción con desactivarlo. |

Validar roles existentes, correo duplicado y campos del perfil. Definir restricciones para actuar sobre la propia cuenta y el último administrador, y el efecto de eliminar/desactivar sobre sus sesiones.

`GET /api/usuarios` y `POST /api/usuarios` ya existen: necesitan completar sus contratos, no duplicarse. La pantalla anterior paginaba y filtraba localmente. El listado actual usa paginación del servidor y el catálogo fijo fue retirado, como se describe arriba.

## 2. Permisos por rol — matriz RBAC

| Ruta sugerida | Qué debe permitir |
| --- | --- |
| `GET /api/permisos` | Obtener el catálogo real de módulos/acciones disponibles y sus identificadores. También puede venir dentro de la respuesta de la matriz. |
| `GET /api/roles/{id}/permisos` | Consultar los permisos asignados a un rol. |
| `PUT /api/roles/{id}/permisos` | Guardar el conjunto completo de permisos del rol de forma atómica. |

El backend debe definir la matriz real y **hacer cumplir los permisos en cada operación protegida**. Los módulos y concesiones del demo no son una ACL aprobada. Impedir que una cuenta se otorgue permisos que no puede administrar.

## 3. Sesiones activas

| Ruta sugerida | Qué debe permitir |
| --- | --- |
| `GET /api/sesiones` | Listar sesiones activas con ID, ID de usuario, dispositivo, IP/origen, inicio, expiración e identificación de la sesión actual. |
| `DELETE /api/usuarios/{userId}/sesiones/{sessionId}` | Revocar una sesión concreta y hacer que su credencial deje de ser válida. |

Verificar que la sesión pertenece al usuario indicado y que quien la revoca tiene permiso. Definir el comportamiento ante sesiones expiradas, ya revocadas o la sesión propia. La sesión actual debe identificarse con datos reales, no con el marcador del demo.

## 4. Auditoría

| Ruta sugerida | Qué debe permitir |
| --- | --- |
| `GET /api/auditoria` | Consultar eventos con filtros por fecha, entidad y acción, orden estable y paginación con total filtrado. Proveer también el total global para la métrica, mediante metadatos o consulta equivalente. |
| `GET /api/auditoria/{id}` | Consultar un evento: ID, usuario/actor, fecha, acción, entidad, ID del registro afectado, detalle, IP/origen y cambios antes/después cuando existan. |
| `GET /api/auditoria/exportacion` | Obtener todos los resultados filtrados para CSV, no solo la página visible. Puede devolver un archivo o datos para generar el CSV en frontend. Definir límites. |

Generar eventos reales desde las operaciones del sistema; no basta con un listado de registros de prueba. No incluir contraseñas, tokens ni valores sensibles en los cambios registrados.

## 5. Autenticación con JWT, sesiones y refresh token

El login anterior guardaba el JWT solo en memoria y lo perdía al recargar. Este apartado conserva la solicitud histórica; el contrato actualizado y la decisión temporal localStorage constan arriba. Implementar un **JWT de acceso de corta duración y un refresh token de mayor duración vinculado a una sesión revocable en el backend**. El refresh token es una credencial de la sesión, no la sesión en sí.

| Ruta sugerida | Qué falta |
| --- | --- |
| `POST /api/auth/login` — ampliar la existente | Crear la sesión y entregar el JWT de acceso y el refresh token mediante el transporte acordado, con sus vencimientos. |
| `POST /api/auth/refresh` | Validar el refresh token y la sesión activa, emitir un nuevo JWT de acceso y rotar el refresh token. Rechazar tokens vencidos, revocados o reutilizados. |
| `GET /api/auth/me` | Consultar la identidad autenticada, su rol estable y permisos efectivos o una forma documentada de obtenerlos. |
| `POST /api/auth/logout` | Revocar la sesión y su refresh token; eliminar las cookies de autenticación si se utilizan. |

- Guardar solo un hash del refresh token en el backend, asociado al usuario, sesión y expiración. Revocar la familia de renovación ante reutilización de un token rotado.
- Hacer que la revocación desde IAM y la desactivación de usuarios impidan renovar. Definir si los JWT de acceso ya emitidos dejan de funcionar inmediatamente mediante validación de sesión o al vencer; no prometer revocación inmediata con JWT puramente stateless.
- Documentar transporte, duración, rotación y errores de ambos tokens. El transporte/persistencia definitivo sigue abierto; la autorización posterior permite temporalmente localStorage para ambos tokens.

**Opcional:** entregar el JWT mediante una cookie creada por el backend con `Set-Cookie`, `HttpOnly`, `Secure` en producción y `SameSite` acorde al despliegue. Si se elige este transporte, configurar protección CSRF, CORS con origen explícito y credenciales cuando corresponda, expiración y limpieza al salir. El refresh token también puede entregarse mediante una cookie `HttpOnly`; no debe quedar expuesto a JavaScript si se usa esa opción.

## Requisitos comunes para entregar las operaciones

- Documentar cuerpos, campos obligatorios/nullables, formatos de fechas con zona horaria y valores permitidos de idioma, roles y acciones.
- Documentar errores: validación, credenciales inválidas, falta de permisos, recurso inexistente y conflictos como correo duplicado. Distinguir `401` de `403` y devolver mensajes seguros.
- Especificar quién puede ejecutar cada operación y qué ocurre al cambiar permisos o desactivar usuarios con sesiones abiertas.
- El OpenAPI actualizado declara login/refresh/logout públicos con `security: []`; logout conserva la discrepancia de transporte/respuesta indicada arriba.

**No requerido para completar la pantalla actual:** CRUD administrativo de roles, recuperación de contraseña, MFA y cierre masivo de sesiones. El catálogo de roles sí es necesario. Esas ampliaciones se pueden abordar por separado.
