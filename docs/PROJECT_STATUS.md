# Estado actual del proyecto frontend

Última verificación técnica: **2026-09-27**.

## Resumen ejecutivo

El repositorio contiene una base Angular moderna y compilable con el primer flujo frontend funcional: login P01 mediante una fuente en memoria. El resto del ERP y la comunicación con backend todavía no están implementados.

| Área                 | Estado                  | Evidencia actual                                                                   |
| -------------------- | ----------------------- | ---------------------------------------------------------------------------------- |
| Workspace Angular    | Implementado            | Aplicación `real-maids-frontend`, Angular 22, builder `@angular/build:application` |
| Bootstrap cliente    | Implementado            | `bootstrapApplication(App, appConfig)`                                             |
| SSR/render modes     | Implementado            | Angular SSR + Express; `/login` prerender y resto CSR                              |
| Hidratación          | Implementada            | `provideClientHydration()`                                                         |
| UI y estilos         | Parcial                 | Tailwind 4, tokens de tema y doce paquetes Spartan Helm locales                    |
| Router               | Parcial                 | Rutas lazy `/login` y `/admin`, redirect y wildcard                                |
| Autenticación        | Demo frontend funcional | Signal Form, AuthStore, source en memoria, guards, redirección y logout            |
| API REST             | No implementada         | Existe `API_URL` como token sin valor; no hay cliente HTTP ni servicios remotos    |
| Guards/interceptores | Parcial                 | Guards auth/guest implementados; sin interceptor HTTP                              |
| Pantallas P01-P13    | P01 parcial frontend    | Login completo para demo; `/admin` es solo destino temporal                        |
| Features M02-M12     | M03 esqueleto           | Resto no iniciado; M03 tiene consultas y CRUD demo sin ruta, pantalla ni HTTP      |
| Unit tests           | Implementadas           | 10 archivos, 31 pruebas Vitest en verde                                            |
| E2E                  | No configurado          | Sin target ni dependencia Cypress/Playwright                                       |
| CI/CD                | No verificado           | Sin workflow visible en el repositorio                                             |
| Despliegue           | No verificado           | No hay evidencia de Vercel u otro hosting                                          |

## Build y pruebas

El 27 de septiembre de 2026 se ejecutaron los targets `build:production` y `test` mediante el MCP de Angular CLI:

- `build:production`: **correcto**; generó browser, server y `/login` prerenderizado.
- `test`: **correcto**; 10 archivos y 31 pruebas aprobadas.

La suite cubre autenticación, formulario, navegación, guards y consultas demo de clientes mediante source y casos de uso.

## Implementación existente

### Plataforma

- Angular standalone, sin `NgModule` raíz.
- TypeScript estricto en opciones relevantes.
- Alias `@/*` para `src/*`.
- SSR con `@angular/ssr/node` y servidor Express.
- Build de producción con presupuestos de bundle.

### Autenticación inicial

La feature `src/app/admin/features/auth` está separada en:

- `domain`: entidad `UserSession`, parámetros de login, `AuthError` en `domain/errors` y contrato `AuthRepository`;
- `application`: `LoginUseCase` y `LogoutUseCase` sin estado;
- `infrastructure`: `AuthRepositoryImpl` y `AuthInMemorySource`.
- `presentation`: componente de formulario, páginas, guards y `AuthStore` con NgRx SignalStore.

`AUTH_REPOSITORY` se enlaza a `AuthRepositoryImpl` mediante inyección de dependencias. La fuente valida credenciales de demostración, simula latencia, devuelve un usuario y permite logout. `LoginUseCase.execute()` orquesta `login -> me`; `LogoutUseCase.execute()` delega el logout. Ninguno conserva estado de presentación. `AuthStore`, provisto en root, mantiene la sesión solo en memoria; al recargar se pierde deliberadamente.

P01 usa un `LoginFormComponent` standalone con Angular Signal Forms, modelo signal, validación declarativa, bindings `formRoot`/`formField` y estado de envío reactivo. La página compone la identidad visual y resuelve la redirección segura; el formulario encapsula validación accesible, visibilidad de contraseña, envío y error recuperable. La interfaz no expone que la fuente actual es de demostración. `/admin` prueba el guard y logout, pero no constituye P02.

### Capa UI

Spartan está configurado mediante `components.json`. Componentes instalados:

`alert`, `button`, `card`, `checkbox`, `field`, `input`, `input-group`, `label`, `separator`, `spinner`, `textarea` y `utils`.

Los componentes Helm son código propiedad del proyecto en `libs/ui`; la capa Brain se consume desde npm.

## Placeholders que no deben confundirse con funcionalidad

- `logger.service.ts`, `storage.service.ts` y `environment.config.ts` están vacíos.
- `environment.ts` y `environment.production.ts` están vacíos.
- `API_URL` está declarado, pero no tiene provider.
- No existe manejo de JWT ni persistencia de sesión.

## Próximos bloqueos reales

1. Confirmar OpenAPI/Swagger del backend antes de reemplazar la fuente en memoria.
2. Resolver mediante ADR la persistencia/renovación de sesión y JWT.
3. Sustituir el source en memoria por un adaptador HTTP sin cambiar la presentación.
4. Definir matriz de permisos backend/frontend antes de guards por rol.
5. Agregar estados loading/empty/error y comportamiento responsive en cada feature.
6. Configurar E2E y CI cuando exista el primer recorrido funcional.
7. Resolver i18n, zona horaria y hosting mediante sus decisiones correspondientes.

### Base del catálogo de clientes

Se creó `src/app/admin/features/customers` con `domain`, `application` e `infrastructure`.
La nomenclatura de código acordada para M03 es `customers`/`Customer*`. La entidad `Customer`
contiene `id`, `name`, `email` y `phone` opcional. `ListCustomersUseCase.execute()` y
`GetCustomerByIdUseCase.execute(id)` delegan `findAll` y `findById`, respectivamente,
al puerto `CustomerRepository`, enlazado en `appConfig` con `CustomerRepositoryImpl` y
`CustomerInMemorySource`. `findAll`, `findById`, `create`, `update` y `delete` devuelven
`Observable<Result<..., CustomerError>>`. La fuente mantiene una copia mutable por instancia de
`DEMO_CUSTOMERS`, genera IDs al crear y devuelve `CUSTOMER_NOT_FOUND` al actualizar o eliminar
IDs inexistentes. El CRUD es solo una capacidad demo en memoria: no implica UI, persistencia,
contrato API ni exclusividad de correo. Los datos `DEMO_CUSTOMERS` están declarados en el mismo
archivo que `CustomerInMemorySource`, sin archivo demo separado.

Es un esqueleto: no hay ruta, pantalla, capa `presentation` ni integración HTTP para P04. Los
datos y errores de la fuente en memoria no definen DTOs o errores del backend ni autorizan
implementar `/api/clientes` sin OpenAPI.

### Límites de capas

Los repositorios de `auth` y `customers` importan `AuthError` y `CustomerError` desde sus
respectivos `domain/errors`. Ambas features usan un caso de uso por acción de aplicación,
con una operación `execute()` cada uno. ADR-009 establece estas reglas para futuras features.

## Regla de actualización

Un ítem solo pasa a “implementado” cuando existe código conectado, una ruta o consumidor real cuando aplique y verificación proporcional mediante build/pruebas. Un archivo vacío, un tipo, un token o una dependencia instalada no cuentan como feature terminada.
