# Fuentes y control de interpretación

## Dos fuentes con propósitos distintos

### Repositorio

Determina el estado implementado. Al 2026-09-18 evidencia Angular 22, SSR, Spartan/Tailwind, Vitest y P01 funcional con auth en memoria.

### `Avance_1.pdf`

Determina intención funcional: RF01-RF17, RNF01-RNF14, HU01-HU17, M01-M12, P01-P13, roles, flujos, UX y límites con backend/QuickBooks.

El PDF no demuestra implementación. El repositorio no puede alterar silenciosamente la intención funcional; las diferencias se registran.

## Reconciliaciones realizadas

| Tema                       | Fuente original          | Estado del repositorio                                  |
| -------------------------- | ------------------------ | ------------------------------------------------------- |
| Angular + TypeScript       | Previsto                 | Implementado con Angular 22/TS 6                        |
| Angular Material/Bootstrap | Ambiguo                  | Sustituido por Spartan + Tailwind (ADR-006)             |
| Jasmine/Karma              | Previsto                 | Sustituido por builder Angular + Vitest (ADR-008)       |
| Cypress                    | Previsto                 | No instalado/configurado; decisión E2E abierta          |
| Vercel                     | Previsto                 | Sin configuración/evidencia; hosting abierto            |
| API REST                   | Arquitectura prevista    | Sin integración HTTP actual                             |
| JWT/roles                  | Requisito previsto       | Sin sesión, persistencia ni guards funcionales          |
| M01 Auth                   | Funcionalidad prevista   | P01 funcional con source y sesión en memoria            |
| SSR/prerender              | No era central en el PDF | Implementado y registrado en ADR-007                    |
| Arquitectura por capas     | Modularidad prevista     | Estructura por feature/capas iniciada en auth (ADR-009) |

## Ambigüedades funcionales heredadas

- El texto dice once módulos, pero enumera M01-M12; se conservan los doce IDs.
- La landing aparece en diseño, pero no tiene trazabilidad RF/HU clara.
- El alta directa de solicitudes por cliente no está resuelta.
- Las transiciones excepcionales de órdenes no están definidas.
- “Jefe” no posee una ACL formal.
- Los endpoint base del PDF no sustituyen OpenAPI.

## Evidencia técnica usada en esta actualización

- `package.json`, lockfile y versiones locales;
- `angular.json` y TypeScript configs;
- `components.json`, `src/styles.css` y `libs/ui`;
- bootstrap, configuración browser/server y servidor SSR;
- rutas actuales y feature auth;
- inventario del grafo Codebase Memory con verificación de cobertura;
- Angular CLI MCP para descubrir workspace y ejecutar build/test;
- Spartan CLI `info --json` para inventario UI.

El MCP de Angular CLI detectó el workspace, Angular 22 y targets `build`, `serve` y `test`. Su operación `get_best_practices` devolvió un error de respuesta inesperada durante esta revisión; no se utilizó ese fallo para inferir arquitectura.

## Regla operativa

- código/config/pruebas -> implementación;
- ADR -> decisión técnica vigente;
- RF/RNF/HU/M/P -> intención funcional;
- OpenAPI -> contrato backend;
- Figma aprobado -> referencia visual.
