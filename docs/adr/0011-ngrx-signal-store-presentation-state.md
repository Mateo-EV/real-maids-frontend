# ADR-011: NgRx SignalStore para estado de presentación

- Estado: Accepted
- Fecha: 2026-09-18

## Contexto

El primer flujo de autenticación mantenía la sesión dentro de `AuthService`. Esa implementación mezclaba la orquestación del caso de uso `login -> me` con estado consumido por páginas y guards.

La sesión de presentación debe compartirse entre `/login`, `/admin` y los guards, pero no debe incorporar todavía persistencia, JWT ni decisiones dependientes del backend.

## Decisión

Usar NgRx SignalStore 22 como base inicial para estado compartido de presentación:

- `AuthStore` vive en `auth/presentation/state` y se provee en root para conservar una única instancia entre rutas;
- el store posee `session` y deriva `isAuthenticated` con `withComputed`;
- sus métodos `login` y `logout` delegan en un `AuthService` sin estado y actualizan la sesión mediante `patchState`;
- los guards auth/guest pertenecen a `auth/presentation/guards` y consumen el store;
- estados locales del formulario, como `submitting` y el mensaje visual de error, permanecen en `LoginFormComponent`/Signal Forms;
- no se añade persistencia de navegador, token, refresh ni estado de autorización backend.

La adopción se limita inicialmente a autenticación. Otras features incorporarán stores solo cuando exista estado compartido real; no se crea un store global monolítico.

## Consecuencias

- `AuthService` conserva únicamente orquestación y acceso al repositorio.
- Páginas y guards comparten una fuente de verdad reactiva y tipada.
- El estado continúa siendo efímero y se pierde al recargar.
- Las pruebas separan el caso de uso sin estado de las transiciones del store.
- La dependencia `@ngrx/signals` debe mantenerse alineada con la versión mayor de Angular.
- Una futura sesión backend deberá revisar inicialización, estado desconocido, SSR y persistencia mediante decisiones específicas.

## Alternativas consideradas

- Mantener signals privadas en `AuthService`: descartado porque mezcla caso de uso y estado de presentación.
- Store provisto por componente o ruta: descartado porque la sesión debe cruzar `/login`, `/admin` y guards.
- Store en `core`: descartado porque el estado pertenece a la feature de autenticación.
- NgRx Global Store clásico: descartado por mayor ceremonia para el alcance actual.
