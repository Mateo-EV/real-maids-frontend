# Desarrollo local y convenciones técnicas

## Requisitos verificados

| Herramienta | Estado del repositorio               |
| ----------- | ------------------------------------ |
| Node.js     | Verificado localmente con `v24.21.0` |
| npm         | `packageManager: npm@11.19.0`        |
| Angular     | `^22.1.0`                            |
| Angular CLI | `^22.1.8`                            |
| TypeScript  | `~6.0.2`                             |

Usa `package-lock.json` y ejecuta:

```bash
npm ci
npm start
npm run build
npm test
```

Scripts disponibles: `ng`, `start`, `build`, `watch`, `test` y `serve:ssr:real-maids-frontend`. No hay scripts `lint` ni `e2e`.

## Flujo obligatorio para agentes

### 1. Descubrir con Codebase Memory

Usa `list_projects`/`index_status`, búsqueda del grafo y `check_index_coverage` antes de afirmar estructura, dependencias o ausencia de código.

### 2. Usar el MCP de Angular CLI

El servidor está configurado en `.codex/config.toml`.

- `list_projects`: primer paso obligatorio; devuelve el workspace, proyecto y targets.
- `get_best_practices`: consulta previa a modificar código Angular.
- `search_documentation`: APIs y sintaxis oficiales.
- `run_target`: build y test.
- `devserver_*`: ciclo de servidor de desarrollo.

Si el MCP falla o no expone la operación necesaria, deja constancia y usa el CLI local (`npx ng`), nunca una instalación global.

### 3. Generar con Angular CLI/Spartan CLI

Consulta el contexto Spartan:

```bash
npx ng generate @spartan-ng/cli:info --json
```

Genera componentes Helm disponibles con:

```bash
npx ng generate @spartan-ng/cli:ui --name=<componente>
```

Usa schematics Angular para artefactos normales cuando corresponda. Revisa que el proyecto tiene `skipTests: true` para componentes: las pruebas necesarias deben crearse explícitamente.

## Convenciones arquitectónicas

- Features bajo un contexto funcional, actualmente `src/app/admin/features`.
- Capas `domain`, `application`, `infrastructure` y `presentation` solo cuando protejan responsabilidades reales.
- Adaptadores HTTP/almacenamiento en `infrastructure`.
- Orquestación/casos de uso en `application`.
- Contratos y modelos de negocio en `domain` cuando no dependan de Angular.
- Rutas y componentes propios en `presentation` o en la raíz de la feature si es suficientemente pequeña.
- `core` para providers, guards/interceptores genuinamente transversales, configuración y servicios singleton compartidos.
- Guards, stores y estado propios de una feature permanecen en su capa `presentation`.
- `shared` para utilidades o UI compartida sin dependencia de una feature.

## Convenciones Angular

- Componentes standalone.
- `inject()` y providers explícitos cuando mejoren claridad/testabilidad.
- Tipos estrictos; evitar `any`.
- Rutas por feature y lazy loading cuando exista una frontera útil.
- Signal Forms/signals para estado local y NgRx SignalStore para estado compartido de presentación según ADR-011.
- Evitar un store monolítico: cada feature justifica y encapsula su propio estado.
- No realizar llamadas HTTP desde componentes visuales.
- No usar estado del navegador durante SSR sin comprobar plataforma o abstraer el acceso.

## Configuración y secretos

La configuración distribuida al navegador puede incluir una API base pública, versión y feature flags públicas. Nunca debe incluir secretos. Los archivos `src/environments/*` y `environment.config.ts` están vacíos: definir su contrato antes de usarlos.

## UI

Usa Spartan + Tailwind según ADR-006. Reutiliza componentes Helm, variantes y tokens semánticos. No agregues Angular Material o Bootstrap.

## Verificación

- Cambio de código: build y tests relevantes mediante Angular MCP.
- Cambio UI: además revisar desktop/móvil y estados visuales.
- Cambio de arquitectura: actualizar ADR, arquitectura, estado y trazabilidad.
- Cambio documental: comprobar rutas, enlaces y afirmaciones contra código/configuración.
