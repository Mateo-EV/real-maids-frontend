# ADR-001: Angular + TypeScript como plataforma frontend

- Estado: Accepted
- Fuente: Avance 1 y configuración vigente
- Reconciliado: 2026-09-18

## Contexto

La solución requiere una aplicación web modular basada en componentes, navegación, formularios, SSR y consumo futuro de API REST.

## Decisión

Usar Angular con componentes standalone y TypeScript como lenguaje principal. La versión vigente del repositorio es Angular 22 (`@angular/core ^22.1.0`) con TypeScript `~6.0.2`.

Las versiones exactas siguen el lockfile; no deben copiarse a documentación como requisito perpetuo sin revisar `package.json`.

## Consecuencias

- Bootstrap mediante `bootstrapApplication`, no `NgModule` raíz.
- Dependencias administradas con npm y `package-lock.json`.
- Herramientas Angular a través del MCP de Angular CLI o CLI local del workspace.
- Cambiar de framework requiere un ADR que sustituya esta decisión.

## Alternativas consideradas

No se evaluaron otros frameworks porque Angular forma parte del alcance aceptado y ya está implementado.
