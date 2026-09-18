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
- Estado compartido de presentación: NgRx SignalStore por feature; `AuthStore` es root y `AuthService` permanece sin estado.
- UI: Spartan Brain/Helm + Tailwind CSS 4; Helm vive en `libs/ui`.
- Pruebas unitarias: builder oficial de Angular con Vitest.

No introduzcas Angular Material ni Bootstrap. Cambiar la librería UI, estrategia de estado, SSR, runner de pruebas o estructura transversal requiere ADR.

## 4. Estado actual que debes respetar

- Existen rutas lazy `/login` y `/admin`; `/admin` es solo un destino temporal protegido.
- P01 funciona con fuente en memoria y credenciales demo; no es autenticación backend real.
- La sesión vive en `AuthStore` (NgRx SignalStore, root) dentro de `auth/presentation/state` y se pierde al recargar; no reemplazar esto por storage sin ADR.
- `API_URL` no tiene provider y no hay cliente HTTP configurado.
- Hay guards básicos auth/guest en `auth/presentation/guards`; no hay permisos por rol, interceptores, E2E ni CI/CD.
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
