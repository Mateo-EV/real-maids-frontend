# Estado actual del proyecto frontend

Última verificación técnica: **2026-09-18**.

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
| Autenticación        | Demo frontend funcional | Formulario, source en memoria, sesión signal, guards, redirección y logout         |
| API REST             | No implementada         | Existe `API_URL` como token sin valor; no hay cliente HTTP ni servicios remotos    |
| Guards/interceptores | Parcial                 | Guards auth/guest implementados; sin interceptor HTTP                              |
| Pantallas P01-P13    | P01 parcial frontend    | Login completo para demo; `/admin` es solo destino temporal                        |
| Features M02-M12     | No implementadas        | Sin código funcional asociado                                                      |
| Unit tests           | Implementadas           | 4 archivos, 13 pruebas Vitest en verde                                             |
| E2E                  | No configurado          | Sin target ni dependencia Cypress/Playwright                                       |
| CI/CD                | No verificado           | Sin workflow visible en el repositorio                                             |
| Despliegue           | No verificado           | No hay evidencia de Vercel u otro hosting                                          |

## Build y pruebas

El 18 de septiembre de 2026 se ejecutaron los targets con el MCP de Angular CLI:

- `build:production`: **correcto**; generó browser, server y `/login` prerenderizado.
- `test`: **correcto**; 4 archivos y 13 pruebas aprobadas.

La suite cubre source en memoria, servicio de aplicación, formulario, errores, navegación y guards.

## Implementación existente

### Plataforma

- Angular standalone, sin `NgModule` raíz.
- TypeScript estricto en opciones relevantes.
- Alias `@/*` para `src/*`.
- SSR con `@angular/ssr/node` y servidor Express.
- Build de producción con presupuestos de bundle.

### Autenticación inicial

La feature `src/app/admin/features/auth` está separada en:

- `domain`: entidad `UserSession`, parámetros de login y contrato `AuthRepository`;
- `application`: `AuthService` y `AuthError`;
- `infrastructure`: `AuthRepositoryImpl` y `AuthInMemorySource`.

`AUTH_REPOSITORY` se enlaza a `AuthRepositoryImpl` mediante inyección de dependencias. La fuente valida credenciales de demostración, simula latencia, devuelve un usuario y permite logout. `AuthService` mantiene la sesión solo en memoria; al recargar se pierde deliberadamente.

P01 incluye validación accesible, visibilidad de contraseña, estado de carga, error recuperable, credenciales demo y redirección segura. `/admin` prueba el guard y logout, pero no constituye P02.

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

## Regla de actualización

Un ítem solo pasa a “implementado” cuando existe código conectado, una ruta o consumidor real cuando aplique y verificación proporcional mediante build/pruebas. Un archivo vacío, un tipo, un token o una dependencia instalada no cuentan como feature terminada.
