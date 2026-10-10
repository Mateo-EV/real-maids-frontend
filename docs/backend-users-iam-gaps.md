# Pendientes del backend para completar Usuarios / IAM

El login ya está conectado y el usuario confirmó que funciona; la verificación independiente utilizó HTTP simulado, no el backend real. Falta conectar la gestión de usuarios, roles/permisos, sesiones y auditoría, que todavía utilizan datos de demostración.

**Los nombres de rutas y campos son orientativos.** La capa de infraestructura puede mapear otros nombres y formatos acordados. Lo importante es que existan las operaciones y los datos necesarios, no que el backend copie los nombres del frontend.

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
| Edad | El formulario actual la utiliza. Confirmar si se guardará o si se retirará del formulario; la regla demo de ≥18 no es una regla de negocio confirmada. |

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

`GET /api/usuarios` y `POST /api/usuarios` ya existen: necesitan completar sus contratos, no duplicarse. La pantalla pagina y filtra usuarios localmente; paginación en servidor no es un bloqueo inmediato.

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

El login actual guarda el JWT solo en memoria y lo pierde al recargar. Implementar un **JWT de acceso de corta duración y un refresh token de mayor duración vinculado a una sesión revocable en el backend**. El refresh token es una credencial de la sesión, no la sesión en sí.

| Ruta sugerida | Qué falta |
| --- | --- |
| `POST /api/auth/login` — ampliar la existente | Crear la sesión y entregar el JWT de acceso y el refresh token mediante el transporte acordado, con sus vencimientos. |
| `POST /api/auth/refresh` | Validar el refresh token y la sesión activa, emitir un nuevo JWT de acceso y rotar el refresh token. Rechazar tokens vencidos, revocados o reutilizados. |
| `GET /api/auth/me` | Consultar la identidad autenticada, su rol estable y permisos efectivos o una forma documentada de obtenerlos. |
| `POST /api/auth/logout` | Revocar la sesión y su refresh token; eliminar las cookies de autenticación si se utilizan. |

- Guardar solo un hash del refresh token en el backend, asociado al usuario, sesión y expiración. Revocar la familia de renovación ante reutilización de un token rotado.
- Hacer que la revocación desde IAM y la desactivación de usuarios impidan renovar. Definir si los JWT de acceso ya emitidos dejan de funcionar inmediatamente mediante validación de sesión o al vencer; no prometer revocación inmediata con JWT puramente stateless.
- Documentar transporte, duración, rotación y errores de ambos tokens. El transporte/persistencia definitivo del frontend se acordará antes de conectarlo; este pedido no cambia la implementación actual.

**Opcional:** entregar el JWT mediante una cookie creada por el backend con `Set-Cookie`, `HttpOnly`, `Secure` en producción y `SameSite` acorde al despliegue. Si se elige este transporte, configurar protección CSRF, CORS con origen explícito y credenciales cuando corresponda, expiración y limpieza al salir. El refresh token también puede entregarse mediante una cookie `HttpOnly`; no debe quedar expuesto a JavaScript si se usa esa opción.

## Requisitos comunes para entregar las operaciones

- Documentar cuerpos, campos obligatorios/nullables, formatos de fechas con zona horaria y valores permitidos de idioma, roles y acciones.
- Documentar errores: validación, credenciales inválidas, falta de permisos, recurso inexistente y conflictos como correo duplicado. Distinguir `401` de `403` y devolver mensajes seguros.
- Especificar quién puede ejecutar cada operación y qué ocurre al cambiar permisos o desactivar usuarios con sesiones abiertas.
- Mantener el login público correctamente descrito en OpenAPI; la especificación analizada le aplica Bearer global sin excepción explícita.

**No requerido para completar la pantalla actual:** CRUD administrativo de roles, recuperación de contraseña, MFA y cierre masivo de sesiones. El catálogo de roles sí es necesario. Esas ampliaciones se pueden abordar por separado.
