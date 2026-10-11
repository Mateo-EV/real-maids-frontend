# Pendientes del backend para completar Usuarios / IAM

La integración actual de autenticación está implementada y verificada con HTTP simulado; esta versión todavía no fue validada contra el backend real ni entre pestañas en navegadores reales. La confirmación previa del usuario correspondía al login anterior, no al nuevo ciclo de persistencia y renovación. T3 conecta usuarios y catálogo de roles por HTTP; T4 conecta catálogo y asignaciones RBAC. T5 conecta sesiones IAM y T6 conecta auditoría mediante HTTP; los antiguos sources demo quedan unwired, nunca como fallback. La aceptación autenticada del backend real sigue pendiente.

## Contrato actualizado y límite de integración

El OpenAPI público actualizado (3.1.0, versión 0.1; SHA-256 `7cd6f155d85513215dfaecdbd7beb8dfa335899dc8a6c29f15b7bb92fd28bc28`) ya documenta auth, usuarios/roles/permisos, sesiones y auditoría. T2 se limita a auth; T3 conecta usuarios y catálogo de roles. T4 conecta RBAC, T5 sesiones IAM y T6 auditoría; sus adaptadores no certifican aceptación autenticada. Los apartados históricos siguientes describen el análisis anterior, no ausencia actual de endpoints.

Auth documenta login con `usuario: PerfilResponse`, `token`, `tipo`, `expiraEnSegundos`, `refreshToken` y `refreshExpiraEnSegundos`; `/me` protegido devuelve identidad/rol estable/permisos. Refresh recibe JSON obligatorio `{ refreshToken }`, rota una sola vez y conserva el vencimiento original; reutilizarlo revoca la sesión y no deben existir renovaciones paralelas. La decisión temporal del usuario es localStorage para ambos tokens, no cookies; implica exposición a JavaScript/XSS. El candidato requiere Web Locks para coordinar renovación entre pestañas y falla cerrado cuando no están disponibles.

**Diferencias abiertas:** las respuestas no declaran listas `required` ni nulabilidad: validar campos consumidos sin inventar valores. `ultimoAcceso` no se consume en auth. Logout tiene cuerpo opcional con refresh, y su prosa permite Bearer o refresh cuando el acceso venció y promete 204, pero el esquema declara 200 y `security: []`. El adaptador envía una instantánea Bearer + refresh, acepta 2xx vacío y limita el intento sin afirmar éxito remoto. Confirmar formalmente este transporte y los campos obligatorios/nulos. Producción HTTPS, CORS y comportamiento autenticado real no están verificados.

## T3 — usuarios y catálogo de roles

- `GET /api/usuarios` usa `pagina` base cero y `tamanio`, con filtros `busqueda`, `correo`, `idRol` y `activo`; la respuesta es `contenido`, `pagina`, `tamanio`, `totalElementos`, `totalPaginas`. Por autorización explícita para el catálogo pequeño, la UI sustituye temporalmente sus controles de servidor: solicita `pagina=0&tamanio=10000` sin filtros y aplica búsqueda nombre/correo, rol/estado y páginas de cinco usuarios localmente. Los controles no consultan HTTP; filtros reinician la página y recargas/eliminaciones la ajustan. Las escrituras y actualizaciones parciales vuelven a consultar el catálogo grande. Contadores cargados/filtrados y activos/inactivos cubren los datos cargados; totales/metadatos incompletos muestran advertencia y vacíos limitados a esos datos, no a todo el backend. No existe máximo de tamaño de página documentado; se conserva la validación estricta (un tamaño retornado distinto del solicitado sigue siendo error), sin fallback demo ni totales inventados. Esta excepción de usuarios no modifica auditoría/RBAC ni los contratos HTTP; Sesiones tiene la restauración aprobada descrita en T5.
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

- `GET /api/sesiones` conserva `pagina`, `tamanio` y `idUsuario` opcional. La UI restaurada reúne todas las páginas globales de 20 registros en un caso de uso sin estado (límite de seguridad de 1.000 páginas, no límite documentado del backend), validando metadatos/totales estables, IDs únicos, identidad de propietarios, orden y como máximo una sesión `actual` entre páginas. Solo una colección completa reemplaza el store; errores posteriores/inconsistencia/límite excedido muestran reintento, nunca ausencia inventada. El total global del servidor no cambia con filtros locales ni reloj; carga/error señala pendiente o último total confirmado.
- Sesiones vuelve a desplegables nativos por usuario, búsqueda nombre/correo (USR-ID secundario), Todos/Con sesiones/Sin sesiones y cinco usuarios por página local, sin campo de ID crudo ni refetch al cambiar controles. «Sin sesiones» requiere la colección completa verificada. Carga/error del catálogo no significa cero sesiones; su incompletitud se advierte. Propietarios fuera del catálogo cargado conservan sus registros en grupos identificados, sin afirmar que se cargaron todos los usuarios ni generar peticiones N+1. No existe garantía documentada de snapshot transaccional entre páginas: cambios concurrentes detectables fallan y requieren reintentar la lectura.
- `GET /api/usuarios/{id}/sesiones` y cierre masivo existen en repositorio/caso de uso/store, sin nuevo control UI. El backend conserva la sesión actual al cerrar masivamente las propias sesiones.
- `actual` es relativo al solicitante y viene del backend, sin correlación con tokens o marcadores de almacenamiento. El cierre individual actual devuelve 400 e indica usar Salir; cerrar una sesión ya cerrada/expirada es idempotente. Se aceptan respuestas exitosas vacías 200/204 pese a la diferencia prosa/esquema.
- Confirmación y feedback se protegen mientras hay una escritura pendiente; se vuelve a reunir la colección global tras éxito, sin repetir mutaciones ni fabricar totales. Un fallo de esa recarga queda visible, sin negar el cierre ya confirmado. Cancelar HTTP no deshace efectos ya enviados.

## T6 — auditoría y CSV del servidor

- `GET /api/auditoria` pagina con base cero, filtros por actor, entidad/acción y días UTC `desde`/`hasta` inclusivos. La UI solicita cinco eventos; `totalElementos` es filtrado y `totalGlobal` no depende del filtro. El detalle usa el ID elegido y valida identidad/cambios recibidos.
- El actor se elige por nombre/correo en el catálogo UserStore ya cargado, con búsqueda local y selección nativa Helm etiquetada; el correo distingue nombres iguales y el ID es secundario. Solo la opción seleccionada aporta `idUsuario`, nunca el texto escrito; paginación y CSV conservan ese ID. Todos los actores/limpieza lo retiran y la sección retenida lo conserva incluso si una recarga pierde temporalmente el perfil. Carga/error/catálogo incompleto se advierten. Usuarios históricos/eliminados pueden no estar: el catálogo no define los eventos existentes ni modifica filas/totales/exportación del servidor. No se añade endpoint, fallback ni consulta al escribir.
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

`GET /api/usuarios` y `POST /api/usuarios` ya existen: necesitan completar sus contratos, no duplicarse. La pantalla anterior paginaba y filtraba localmente. T3 conserva el contrato HTTP paginado, pero la decisión posterior aprobada restaura temporalmente los controles locales sobre el catálogo grande descrito arriba.

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
