# ADR-006: Spartan UI y Tailwind CSS como sistema de UI

- Estado: Accepted
- Fecha: 2026-09-18
- Tipo: formalización de implementación existente

## Contexto

La documentación original dejaba abierta la elección entre Angular Material y Bootstrap. El repositorio ya está configurado con Tailwind CSS 4, `@spartan-ng/brain`, `@spartan-ng/cli`, ng-icons y componentes Helm locales en `libs/ui`.

## Decisión

Usar Spartan UI con su modelo de dos capas:

- Brain desde npm para comportamiento y accesibilidad;
- Helm generado/copiado en `libs/ui` para estilos y personalización;
- Tailwind CSS 4 y tokens semánticos en `src/styles.css`.

No introducir Angular Material ni Bootstrap en paralelo.

## Consecuencias

- `components.json` es la configuración del generador.
- Los imports Helm usan `@spartan-ng/helm/<componente>`.
- Antes de crear UI se consulta `@spartan-ng/cli:info` y se reutiliza/genera el componente disponible.
- Cambios de paleta se realizan mediante variables/tokens semánticos.
- El código Helm local forma parte del código mantenido por el proyecto.

## Alternativas consideradas

- Angular Material: no coincide con la implementación actual.
- Bootstrap: no coincide con la implementación actual.
- Mezcla de librerías: descartada por inconsistencia visual y coste de mantenimiento.
