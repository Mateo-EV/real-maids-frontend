# ADR-008: Vitest mediante el builder oficial de Angular

- Estado: Accepted
- Fecha: 2026-09-18
- Tipo: sustituye el plan Jasmine/Karma

## Contexto

La fuente académica preveía Jasmine/Karma. El workspace actual usa `@angular/build:unit-test`, incluye Vitest 4 y configura `vitest/globals` con jsdom. La primera suite cubre autenticación y routing.

## Decisión

Usar el target oficial `ng test` con Vitest para pruebas unitarias y de componentes.

La herramienta E2E se mantiene como decisión separada y abierta.

## Consecuencias

- Las pruebas usan archivos `*.spec.ts` o `*.test.ts`.
- El target debe ejecutarse mediante MCP Angular CLI o `npm test`.
- La ausencia de tests es un fallo, no un pase vacío.
- Migrar a otro runner requiere actualizar este ADR, configuración y documentación.

## Alternativas consideradas

- Jasmine/Karma: sustituido porque no está configurado en el workspace.
- Jest: no está instalado ni configurado.
