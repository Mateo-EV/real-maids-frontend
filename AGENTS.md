# AGENTS.md

Guía obligatoria para agentes de código, asistentes de IA y automatizaciones que trabajen en el frontend de The Real Maids.

## 1. Orden de lectura y fuentes de verdad

Antes de cambiar código o documentación, revisar:

1. `README.md`;
2. `docs/PROJECT_STATUS.md`;
3. `docs/DECISIONS.md`;
4. `docs/ARCHITECTURE.md`;
5. `docs/TRACEABILITY.md`;
6. el ADR relacionado en `docs/adr/`;
7. `package.json`, `angular.json`, `components.json`, TypeScript config y código real.

Prioridad de verdad:

- código/config/pruebas: estado implementado;
- ADR y decisiones aceptadas: arquitectura vigente;
- RF/RNF/HU/M/P: intención funcional;
- OpenAPI del backend: contrato REST;
- Figma aprobado: referencia visual.

No presentes un archivo vacío, dependencia instalada, tipo o token como funcionalidad terminada.

## 2. Herramientas obligatorias

### Codebase Memory MCP

Para descubrimiento estructural usa primero el MCP `codebase-memory`:

1. `list_projects` o `index_status` al iniciar;
2. `search_graph` para símbolos;
3. `trace_path` para llamadas/dependencias;
4. `get_code_snippet` para evidencia exacta;
5. `check_index_coverage` sobre cada ruta relevante antes de conclusiones.

Usa búsqueda textual/lectura directa para literales, archivos de configuración, documentación y rangos que el índice marque parciales o no cubiertos.

Nivel de evidencia por defecto: verificación dirigida (Tier 2). Incluye búsquedas estructurales relevantes, trazas cuando existan llamadas, snippets exactos para afirmaciones materiales, paginación completa y cobertura. Usa un scout solo para hallazgos positivos provisionales; para afirmaciones negativas/exhaustivas audita el scope completo y declara las limitaciones.

### Angular MCP y Angular CLI

El MCP oficial de Angular CLI está configurado en `.codex/config.toml` y es la vía preferida para tareas Angular:

1. ejecutar `list_projects` como primer paso del workspace;
2. consultar `get_best_practices` antes de modificar código Angular;
3. usar `search_documentation` para APIs o sintaxis Angular;
4. usar `run_target` para `build`, `test` y demás targets configurados;
5. usar las herramientas de dev server del MCP para ciclos de `serve`.

Si una capacidad no está expuesta o el MCP falla, registra la limitación y usa el Angular CLI local del proyecto (`npx ng ...` o scripts de `package.json`), no una instalación global. Usa schematics para generar artefactos cuando corresponda.

### Spartan CLI

Este workspace usa Spartan. Antes de agregar UI ejecuta:

```bash
npx ng generate @spartan-ng/cli:info --json
```

Reutiliza componentes instalados y genera nuevos con `@spartan-ng/cli:ui`; no adivines selectores ni copies componentes manualmente.

## 3. Arquitectura vigente

- Angular 22 standalone con TypeScript 6.
- SSR con Angular SSR + Express, hidratación y prerender actual de `/login`; el resto usa renderizado cliente.
- Organización por feature; dentro de una feature usa `domain`, `application`, `infrastructure` y `presentation` cuando esos límites aporten valor.
- `core` contiene configuración transversal/singletons; `shared` solo piezas genuinamente reutilizables.
- Contratos de repositorio pueden conectarse a adaptadores mediante `InjectionToken`.
- Estado de presentación con NgRx SignalStore por feature; `AuthStore` se provee en root y delega en `LoginUseCase` y `LogoutUseCase`, ambos sin estado.
- Define un `*UseCase` con una operación `execute()` por cada acción de aplicación; no agregues clases `*Service` de feature para agrupar acciones de aplicación.
- Ubica los tipos de error de cada feature en `domain/errors`; los contratos de dominio no deben importar desde `application`.
- UI: Spartan Brain/Helm + Tailwind CSS 4; Helm vive en `libs/ui`.
- Pruebas unitarias: builder oficial de Angular con Vitest.

No introduzcas Angular Material ni Bootstrap. Cambiar la librería UI, estrategia de estado, SSR, runner de pruebas o estructura transversal requiere ADR.

## 4. Estado actual que debes respetar

- Existen rutas lazy `/login` y `/admin`; `/admin` es solo un destino temporal protegido.
- P01 funciona con fuente en memoria y credenciales demo; no es autenticación backend real.
- La sesión vive en `AuthStore` (NgRx SignalStore, root) dentro de `auth/presentation/state` y se pierde al recargar; no reemplazar esto por storage sin ADR.
- `API_URL` no tiene provider y no hay cliente HTTP configurado.
- Hay guards básicos auth/guest en `auth/presentation/guards`; no hay permisos por rol, interceptores, E2E ni CI/CD.
- M03 tiene un esqueleto en `admin/features/customers`: consultas demo en memoria y pruebas, sin ruta ni pantalla P04. Usa `customers` y `Customer*` como nomenclatura de código para esta feature; los datos demo permanecen en `customer-in-memory.source.ts`.
- Los contratos de repositorio de `auth` y `customers` importan sus errores desde `domain/errors`; ambas features expresan sus acciones de aplicación mediante casos de uso.
- Los archivos de environment y varios archivos de `core` son placeholders vacíos.

No construyas sobre esos placeholders suponiendo contratos inexistentes. Conecta cada pieza explícitamente y actualiza `PROJECT_STATUS.md` y `TRACEABILITY.md` cuando cambie el estado.

## 5. Límites de seguridad e integración

- Angular consume exclusivamente la API interna mediante REST/JSON.
- Nunca llames a QuickBooks Online directamente desde Angular.
- Nunca incluyas secretos, client secrets, credenciales privadas o tokens de backend en el bundle.
- Ocultar UI no autoriza: usa guards/interceptores para UX y asume autorización definitiva en backend.
- No registres contraseñas, JWT, datos de pago ni información sensible.
- El almacenamiento/refresh del JWT sigue abierto. No fijes `localStorage`, `sessionStorage` o cookies como solución permanente sin ADR.
- Maneja 401/403 consistentemente y sin filtrar datos sensibles.

## 6. UI, UX y Spartan

- Usa componentes Helm existentes antes de crear markup propio.
- Usa variantes y tokens semánticos; evita colores Tailwind crudos para semántica de producto.
- Mantén responsive desktop/tablet/móvil.
- Distingue “Solicitud de servicio” de “Atención al cliente”.
- Usa verbos concretos: “Registrar cliente”, “Programar servicio”, “Enviar solicitud”.
- No uses color como único indicador.
- Diferencia loading, empty, error y success.
- Confirma cancelaciones y cambios de permisos.
- En móvil prioriza tarjetas y acciones visibles; no traslades tablas extensas sin adaptación.
- Prepara copy para español/inglés, pero no adoptes una librería i18n sin ADR.

## 7. Estado de dominio

Secuencia normal de órdenes:

`Pendiente -> Programada -> En proceso -> Completada -> Pagado`

La cancelación es una salida alternativa. No inventes reaperturas u otras transiciones excepcionales.

Estados de atención al cliente:

`Recibida -> En revisión -> Resuelta -> Cerrada`

Son independientes de los estados de órdenes.

## 8. API y contratos

Antes de implementar o modificar integración:

1. consulta OpenAPI/Swagger real;
2. confirma DTO, errores, paginación, filtros, fechas y enums;
3. registra cualquier diferencia en `docs/API_INTEGRATION.md`;
4. no inventes endpoints ni permisos;
5. agrega pruebas del adaptador/interceptor correspondiente.

## 9. Trazabilidad

Toda funcionalidad relevante debe enlazarse con al menos un `RFxx`, `RNFxx`, `HUxx`, `Mxx` o `Pxx`. Si no existe trazabilidad, documéntala antes de implementar.

## 10. Calidad y verificación

- Usa el target `test` actual con Vitest; no documentes Jasmine/Karma como runner vigente.
- No hay E2E configurado. Si se incorpora, regístralo con decisión y target reproducible.
- No deshabilites pruebas para hacer pasar CI.
- Los schematics de componentes tienen `skipTests: true`; para una feature nueva crea las pruebas necesarias de forma explícita.
- Valida responsive cuando el cambio tenga UI.

Un cambio no está terminado hasta que:

- compila;
- pasa las pruebas relevantes;
- respeta rutas y permisos cuando apliquen;
- maneja loading/empty/error cuando consume datos;
- no introduce secretos;
- actualiza documentación/trazabilidad cuando cambia comportamiento;
- incluye evidencia verificable.

Para cambios solo documentales, verifica enlaces, coherencia con configuración/código y ausencia de afirmaciones no sustentadas.

## 11. Task Classification and Execution Policy

Before starting implementation, classify the requested work as one of:

- SIMPLE
- STANDARD
- COMPLEX

The goal of this classification is to avoid unnecessary orchestration,
subagents, branches, tests, repository-wide exploration, and excessive
tool usage for small changes.

The user's explicit assessment takes priority when reasonable.
If the user says a task is "simple", "small", "quick", "localized",
or equivalent, treat it as SIMPLE unless there is a clear technical
reason why doing so would be unsafe.

Do not over-classify tasks.

### SIMPLE

A task is SIMPLE when the requested change is localized, well understood,
and has low architectural or behavioral risk.

Typical examples:

- Change text, labels, titles, placeholders, or messages.
- Change colors, spacing, margins, padding, borders, shadows, or typography.
- Adjust an existing responsive layout.
- Move or resize an existing UI element.
- Add or remove a small field from an existing view.
- Modify an existing button.
- Fix a small visual bug.
- Update a localized template.
- Change an icon or image.
- Add a straightforward validation to an existing form.
- Make a small change to one component.
- Make a small coordinated change across a few closely related files.
- Fix an obvious localized bug whose cause is already known.
- Follow an existing implementation pattern without introducing new architecture.
- Perform a change the user explicitly describes as simple and that does not reveal hidden complexity.

For SIMPLE tasks:

1. Work directly in the current main agent.
2. Do NOT spawn subagents.
3. Do NOT use multi-agent orchestration.
4. Do NOT create another Git branch.
5. Work in the currently checked-out branch.
6. Do NOT create worktrees.
7. Do NOT run tests unless the user explicitly asks for them.
8. Do NOT run the full test suite.
9. Do NOT perform broad repository exploration.
10. Read only the files necessary to implement the requested change.
11. Do NOT perform an additional independent review agent pass.
12. Do NOT use SDD.
13. Do NOT create specifications, proposals, plans, or task documents.
14. Implement the change directly and report what changed.

Prefer:

request
→ inspect relevant files
→ edit
→ minimal sanity check if necessary
→ finish

Avoid:

request
→ explorer agent
→ plan
→ worker agent
→ verifier agent
→ tests
→ review
→ finish

A SIMPLE task should remain simple.

### STANDARD

A task is STANDARD when it requires meaningful implementation work but
still follows the existing architecture and established project patterns.

Typical examples:

- Create a new page using existing components and conventions.
- Implement a normal CRUD flow.
- Add a service and connect it to an existing feature.
- Add a moderately sized form.
- Connect an existing frontend flow to an API.
- Modify several related components.
- Add functionality spanning a small number of related files.
- Fix a bug that requires tracing a limited flow through the application.
- Refactor a feature without changing the overall architecture.

For STANDARD tasks:

1. Prefer working directly in the main agent.
2. Stay in the current Git branch unless the user requests otherwise.
3. Do NOT create a worktree by default.
4. Do NOT spawn subagents merely because multiple files are involved.
5. Delegate only when a subagent provides a clear benefit.
6. Prefer at most one focused subagent when delegation is genuinely useful.
7. Avoid redundant exploration and verification.
8. Run only targeted checks that provide meaningful confidence.
9. Do not run broad test suites unless justified by the change.
10. Do not use SDD unless the user explicitly requests it or accepts a proposal to use it.

Preferred flow:

request
→ focused inspection
→ implementation
→ targeted verification when useful
→ finish

### COMPLEX

A task is COMPLEX when it involves significant uncertainty, broad impact,
architectural decisions, multiple independent areas, or substantial risk.

Typical examples:

- Introduce a new architectural pattern.
- Redesign authentication or authorization.
- Implement a large cross-cutting feature.
- Refactor a subsystem used by many features.
- Change state-management architecture.
- Introduce a new infrastructure integration.
- Make changes involving several independent application areas.
- Investigate a difficult bug whose source is unknown and spans many layers.
- Perform a migration with substantial compatibility impact.
- Implement a feature that benefits from formal specification and staged execution.

For COMPLEX tasks:

1. Orchestration and subagents may be used.
2. Delegate exploration when broad repository understanding is required.
3. Delegate independent work when parallelization provides real value.
4. Use stronger verification when risk justifies it.
5. Tests should be proportional to the risk and scope of the change.
6. SDD may be proposed when formal specification would provide clear value.
7. Do not start SDD automatically unless the user explicitly requested it
   or approved using it.

Even for COMPLEX work, minimize unnecessary agents and duplicated work.

### Classification Heuristics

Classify primarily by uncertainty, impact, and architectural scope,
not simply by number of files.

A change touching three closely related files can still be SIMPLE.

Examples:

- component.ts + component.html + component.scss for one visual change
  → SIMPLE

- form component + its local service + local model for a small existing flow
  → potentially SIMPLE

- five files that all belong to one existing UI pattern
  → SIMPLE or STANDARD

- two files that change authentication architecture
  → COMPLEX

- one configuration file that changes application-wide infrastructure
  → potentially COMPLEX

Do not classify something as COMPLEX merely because more than one file
must be edited.

### User Override

If the user explicitly says:

- "this is simple"
- "make this change directly"
- "don't orchestrate this"
- "don't use subagents"
- "don't run tests"
- "stay on this branch"

follow those instructions unless there is a concrete safety or integrity
reason not to.

If such a reason exists, explain it briefly before expanding the scope.

### Exceptions

Even if a change initially appears SIMPLE, reconsider the classification
if it unexpectedly affects:

- authentication or authorization;
- security controls;
- payment or billing logic;
- destructive data operations;
- database migrations;
- public API contracts;
- shared infrastructure;
- secrets or credentials;
- critical production configuration.

Do not silently expand the task.

If hidden complexity is discovered, tell the user:

"This started as a SIMPLE task, but I found X, which increases its scope.
I recommend treating it as STANDARD/COMPLEX because Y."

Then continue according to the user's direction.

### Efficiency Principle

Use the least expensive execution strategy that can safely complete the task.

Do not use additional agents, tests, branches, worktrees, planning artifacts,
or repository-wide exploration unless they provide concrete value for the
current request.

For routine development, direct execution is preferred.
