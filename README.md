# The Real Maids — frontend

Aplicación web para coordinar los servicios de limpieza de The Real Maids: gestión interna de clientes, solicitudes, órdenes, personal y programación, junto con un portal donde los clientes consultarán sus solicitudes y servicios y accederán a atención al cliente. El alcance es web adaptable a computadoras, tabletas y teléfonos, no una aplicación móvil nativa.

## Qué existe hoy

- P01: inicio de sesión de demostración, validación del formulario, redirección segura y cierre de sesión. La sesión vive en memoria y se pierde al recargar; no es autenticación real con el backend.
- Rutas `/login` y `/admin` con guards básicos. `/admin` es un destino temporal protegido, no el dashboard P02.
- M03: base de clientes con dominio, cinco casos de uso, store y CRUD de demostración en memoria. No tiene ruta ni pantalla P04, persistencia o integración HTTP.
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

## Documentación

- [Guía de producto](docs/README.md): módulos, pantallas, recorridos, estados de negocio y decisiones pendientes; en inglés.
- [Instrucciones para agentes](AGENTS.md): arquitectura, herramientas MCP/CLI, seguridad y criterios de calidad; en inglés.

La guía de producto describe intención funcional; el código y la configuración determinan qué está implementado. Los contratos REST deben confirmarse con el backend antes de integrar nuevas funcionalidades.
