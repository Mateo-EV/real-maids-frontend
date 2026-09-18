# ADR-004: Aplicación web responsive en lugar de app móvil nativa

- Estado: Accepted
- Fuente: Avance 1, RNF08, alcance y UX

## Contexto

El sistema será utilizado desde computadoras por personal administrativo y desde móviles por personal de campo/clientes.

## Decisión

Construir una aplicación web responsive para computadora, tablet y teléfono. No desarrollar aplicaciones móviles nativas dentro del alcance actual.

## Consecuencias

- Diseños deben probarse en distintos viewports.
- Las tablas administrativas no deben trasladarse sin adaptación a móvil.
- Para personal de campo se priorizan tarjetas, fecha, horario, cliente, estado y acciones visibles.
