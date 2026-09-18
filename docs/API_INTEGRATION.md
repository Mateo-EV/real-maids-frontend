# Integración con API

## Estado actual

La integración HTTP **no está implementada**.

- No se registra `provideHttpClient`.
- No existen adaptadores HTTP de dominio.
- `API_URL` es un `InjectionToken<string>` sin provider.
- Los archivos de environment están vacíos.
- Auth utiliza `AuthInMemorySource`, que valida credenciales demo, simula latencia y mantiene una sesión efímera.

P01 funciona de extremo a extremo dentro del navegador, pero ningún endpoint listado en el documento académico debe presentarse como contrato vigente.

## Frontera aprobada

```text
Angular -> API interna REST/JSON -> backend e integraciones
```

- HTTPS es obligatorio en producción.
- La lógica de negocio y autorización efectiva viven en backend.
- QuickBooks se consume exclusivamente desde backend.
- El frontend no contiene secretos ni credenciales privadas.

## Flujo para implementar un adaptador

1. Obtener el OpenAPI/Swagger vigente del backend.
2. Confirmar URL base, versionado, DTO, errores, paginación, filtros, fechas y enums.
3. Resolver la estrategia de cliente generado o manual mediante ADR.
4. Proveer configuración pública por ambiente, sin secretos.
5. Implementar el adaptador dentro de `infrastructure` y mantener el contrato en `domain` cuando aplique.
6. Definir autenticación/JWT antes de crear interceptor o persistencia.
7. Probar éxito, error, cancelación y mapeo de datos.
8. Registrar aquí cualquier diferencia entre fuente funcional y contrato real.

## Bases de endpoint provenientes de Avance 1

La lista siguiente es solo referencia de descubrimiento y **no autoriza implementar rutas sin OpenAPI**:

| Dominio             | Base propuesta                  |
| ------------------- | ------------------------------- |
| Autenticación       | `/api/auth`                     |
| Usuarios y roles    | `/api/usuarios`                 |
| Clientes            | `/api/clientes`                 |
| Propiedades         | `/api/propiedades`              |
| Leads               | `/api/leads`                    |
| Servicios y tarifas | `/api/servicios`                |
| Cotizaciones        | `/api/cotizaciones`             |
| Contratos           | `/api/contratos`                |
| Solicitudes         | `/api/solicitudes`              |
| Órdenes             | `/api/ordenes`                  |
| Programación        | `/api/programacion`             |
| Personal            | `/api/personal`                 |
| Asignaciones        | `/api/asignaciones`             |
| Ejecución           | `/api/ejecucion`                |
| Cobranzas           | `/api/cobranzas`                |
| Atención al cliente | `/api/atencion-cliente`         |
| Notificaciones      | `/api/notificaciones`           |
| Contenido web       | `/api/contenido`                |
| Reportes            | `/api/reportes`                 |
| Dashboard           | `/api/dashboard`                |
| QuickBooks          | `/api/integraciones/quickbooks` |

## Contratos pendientes

- error estándar y correlación;
- paginación, ordenamiento y filtros;
- fechas, horas y zona horaria;
- refresh/expiración de JWT;
- subida de archivos/evidencias;
- idempotencia y reintentos;
- semántica de sincronización QuickBooks.

No definas estos contratos desde el frontend por conveniencia.
