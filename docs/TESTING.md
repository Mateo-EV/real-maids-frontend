# Estrategia de pruebas frontend

## Estado verificable

Última ejecución: **2026-09-18** mediante el MCP de Angular CLI.

- Target: `real-maids-frontend:test`.
- Builder: `@angular/build:unit-test`.
- Runner detectado por configuración: Vitest (`vitest/globals` y `jsdom`).
- Resultado actual: 4 archivos y 13 pruebas aprobadas.
- E2E: sin target, dependencia ni suite configurada.

La cobertura actual verifica source en memoria, servicio de aplicación, login, estados de error/redirección y guards. Jasmine/Karma y Cypress pertenecían al plan original, pero no describen la implementación actual. Vitest queda registrado en ADR-008; la elección E2E permanece abierta.

## Comandos

Preferir el MCP Angular CLI `run_target` con target `test`. Para trabajo manual:

```bash
npm test
```

El target oficial ejecuta en modo headless/no-watch cuando se invoca desde el MCP.

## Cobertura mínima por tipo de cambio

| Cambio                      | Pruebas esperadas                                     |
| --------------------------- | ----------------------------------------------------- |
| Entidad/utilidad de dominio | unitarias de casos límite                             |
| Servicio de aplicación      | éxito, fallo y colaboración con repositorio mock      |
| Adaptador HTTP              | request, mapping, errores y contrato                  |
| Guard/interceptor           | permisos, 401/403 y ausencia de filtración sensible   |
| Componente/formulario       | render, validación, loading, error y acción principal |
| Ruta/flujo crítico          | integración o E2E cuando exista runner                |

## Flujos E2E prioritarios futuros

- HU01: login válido e inválido.
- HU03: alta/consulta/edición de cliente.
- HU04-HU09: solicitud -> orden -> programación/asignación.
- HU10: consulta móvil de asignaciones.
- HU06: transición permitida y rechazo de transición inválida.
- HU11/HU15: atención y seguimiento del cliente.
- HU16/HU17: estado QuickBooks sin exposición de secretos.

La adopción del runner E2E debe incluir target reproducible, documentación y CI.

## Verificación no funcional

- escritorio, tablet y móvil;
- Chrome, Edge y Firefox recientes;
- accesibilidad de teclado, foco y nombres accesibles;
- no exponer tokens/datos sensibles en logs;
- rutas privadas y roles cuando se implementen;
- comportamiento SSR/hidratación para APIs del navegador.

## Definition of Done

Una feature nueva no puede considerarse terminada sin pruebas proporcionales. No deshabilitar, omitir ni relajar pruebas para obtener un resultado verde artificial.
