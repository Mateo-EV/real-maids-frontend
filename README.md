# The Real Maids — frontend

Aplicación web para coordinar los servicios de limpieza de The Real Maids: gestión interna de clientes, solicitudes, órdenes, personal y programación, junto con un portal donde los clientes consultarán sus solicitudes y servicios y accederán a atención al cliente. El alcance es web adaptable a computadoras, tabletas y teléfonos, no una aplicación móvil nativa.

## Qué existe hoy

- P01 (M01/RF01/HU01): inicio de sesión de demostración, validación del formulario, redirección segura y cierre de sesión. Los guards esperan la restauración de la sesión desde una bandera temporal `authenticated` en localStorage. No es autenticación segura ni integración con el backend; la política de persistencia definitiva sigue abierta. En el servidor o sin almacenamiento disponible no se restaura una sesión demo.
- Rutas `/login`, `/admin` y `/admin/users` con guards básicos. `/admin` sigue siendo un destino temporal protegido, no el dashboard P02; desde allí se accede al catálogo de usuarios.
- M02 (RF02/HU02/P03): maqueta visual de usuarios con búsqueda, filtros, paginación y formularios de CRUD en memoria. Incluye un catálogo dinámico de roles dentro de `users`, sus cinco casos de uso y store. Cada usuario tiene un `roleId` y un `lastAccess` nullable; editarlo no actualiza ese acceso. Se impide borrar roles asignados, aunque pueden desactivarse. No se expone botón ni modal para gestionar roles; se conserva el selector de rol al editar usuarios. Las acciones de registros usan iconos con nombres accesibles. La acción de encendido reemplaza la llave y permite activar/desactivar tras confirmar nombre, correo y cambio previsto; usa una operación específica por ID y estado deseado, conservando los demás campos del registro actual y sus metadatos de creación/acceso. Muestra progreso, errores con reintento y toast solo tras éxito, sin cambiar autenticación ni definir permisos. Cancelar, clic externo y Escape cierran los modales únicamente cuando no hay una petición en curso. El editor exige una edad entera ≥18 como validación del formulario demo, no como regla confirmada del backend. Guardar y eliminar muestran confirmación mediante `HotToastService`, configurado globalmente con estilos de `@ngxpert/hot-toast` en `angular.json`, en lugar del panel de éxito inline.
- Los sources en memoria de usuarios y roles incluyen directamente cinco roles y 48 usuarios ficticios con IDs relacionados. La pantalla consulta ambos catálogos en paralelo, sin un initializer ni altas secuenciales al navegar. Los datos decorativos fuera de los stores siguen aislados y marcados en `users-demo.fixture.ts`: las métricas e IP ficticias permanecen visibles, pero el vínculo de entidad está comentado en tabla y tarjetas. Se retiraron ayudas repetitivas; el último acceso sigue indicado en UTC. Las pestañas de sesiones, RBAC y auditoría siguen deshabilitadas; la gestión independiente de credenciales sigue ausente. El editor recoge contraseña obligatoria al crear y no obligatoria al editar, con mínimo declarado de ocho caracteres y recorte de espacios antes del envío; no se certifica aquí la validación de un valor vacío al editar. El source en memoria excluye explícitamente la contraseña: no guarda ni actualiza credenciales ni cambia la autenticación. No hay autorización por rol ni integración HTTP. Los cambios se pierden al recargar. No es gestión de usuarios productiva.
- Auth, clientes, usuarios y roles separan la implementación del repositorio de su source en memoria. Las peticiones de componentes usan `DestroyRef` para cancelar al destruirse; el delay de las operaciones ocurre antes de sus efectos para evitar escrituras al cancelar antes de la ejecución.
- M03: base de clientes con dominio, cinco casos de uso, store y CRUD de demostración en memoria. No tiene ruta ni pantalla P04, persistencia o integración HTTP.
- Los botones primarios de usuarios, diálogos, login y admin comparten el navy del tema global y su hover; se conserva el dorado como acento y el coral como decoración.
- Base técnica Angular 22/TypeScript 6, SSR e hidratación, Spartan/Tailwind y pruebas unitarias con Vitest. `/login` se prerenderiza; las demás rutas se renderizan en el cliente.

El resto de los módulos y el portal cliente son **alcance previsto**, no funcionalidades terminadas. No hay integración HTTP, JWT persistente, permisos por rol, E2E ni CI/CD configurados; el despliegue productivo no está verificado. No se afirma un resultado actual de compilación o pruebas en esta documentación.

## Recorridos previstos

- **Gestión interna:** cliente → solicitud de servicio → orden → programación y asignación → ejecución → seguimiento del pago.
- **Personal de campo:** servicios asignados → detalle → actualización del estado permitido.
- **Portal cliente:** mis solicitudes y servicios → detalle → atención al cliente. El alta directa de solicitudes por clientes sigue pendiente de definición.
- **Supervisión:** dashboard e informes; consulta de la sincronización con QuickBooks a través del backend.

Las solicitudes de servicio y la atención al cliente son procesos distintos. Las transiciones normales y las preguntas abiertas se conservan en la [guía de producto](docs/README.md), escrita en inglés, con los identificadores RF/RNF/HU/M/P existentes.

## Desarrollo local

Con Node.js compatible con las dependencias Angular del proyecto y npm, usa el archivo de bloqueo del repositorio:

```bash
npm ci
npm start
npm run build
npm test -- --watch=false
```

Estos comandos instalan dependencias, inician el servidor local, compilan y ejecutan las pruebas unitarias, respectivamente. No hay targets de lint ni E2E configurados.

## Encabezados de modales

Los encabezados Helm comparten el navy global, texto claro y un punto dorado decorativo sin texto accesible (`src/styles.css`), también en futuros módulos. Usa `hlm-dialog-header` (o `hlmDialogHeader`) con `hlmDialogTitle` y `hlmDialogDescription`, sin clases de color específicas del módulo. Esta corrección visual de M02/RF02/HU02/P03 reutiliza el contrato global (RNF08/RNF09); no cambia formularios ni permisos.

Coloca el encabezado primero, directamente dentro de `hlm-dialog-content` o del host sin padding de un componente abierto con `HlmDialogService`. No añadas wrappers con padding ni márgenes al encabezado: sus márgenes negativos compensan exactamente `--dialog-padding`, que controla también el padding real del overlay. Para ajustar el espacio, define ese token en el contenido, no utilidades `p-*`. `--dialog-radius` sincroniza las esquinas superiores con el overlay; cuerpo y pie conservan su padding. Mantén el scroll en el contenido cuando sea necesario; no uses `overflow-hidden` para redondear el encabezado, pues recortaría focos y barras de desplazamiento. La fidelidad visual y la interacción en navegadores requieren verificación renderizada.

## Tipografía global

La interfaz usa **Plus Jakarta Sans Variable**, alojada localmente mediante `@fontsource-variable/plus-jakarta-sans`. `src/styles.css` carga solo los dos subconjuntos WOFF2 verticales Latin/Latin-ext (pesos 200–800, español incluido) con `font-display: swap` y fuentes del sistema como respaldo. Angular empaqueta los archivos; no se solicita Google Fonts en tiempo de ejecución. El cambio aplica también a login, admin y overlays; no modifica los colores del tema.

La fuente conserva el copyright de The Plus Jakarta Sans Project Authors y la licencia **SIL Open Font License 1.1**. [El aviso completo](public/fonts/plus-jakarta-sans-OFL.txt) es una copia exacta de `node_modules/@fontsource-variable/plus-jakarta-sans/LICENSE`; la regla existente de assets públicos lo incluye automáticamente en `dist/real-maids-frontend/browser/fonts/plus-jakarta-sans-OFL.txt`. Conservar ese archivo al distribuir la salida compilada junto con los WOFF2 de `browser/media`.

## Documentación

- [Guía de producto](docs/README.md): módulos, pantallas, recorridos, estados de negocio y decisiones pendientes; en inglés.
- [Instrucciones para agentes](AGENTS.md): arquitectura, herramientas MCP/CLI, seguridad y criterios de calidad; en inglés.

La guía de producto describe intención funcional; el código y la configuración determinan qué está implementado. Los contratos REST deben confirmarse con el backend antes de integrar nuevas funcionalidades.
