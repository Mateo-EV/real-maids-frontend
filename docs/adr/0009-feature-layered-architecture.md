# ADR-009: Organización por feature con capas internas

- Estado: Accepted
- Fecha: 2026-09-18
- Tipo: formalización de patrón existente

## Contexto

La feature de autenticación ya separa `domain`, `application` e `infrastructure`, con un contrato de repositorio enlazado por `InjectionToken`. La documentación anterior recomendaba una lista plana de features, pero no reflejaba esta estructura.

## Decisión

Organizar el código por feature funcional. Dentro de cada feature usar, cuando aporten un límite real:

- `domain`: entidades, parámetros y contratos;
- `application`: casos de uso/orquestación;
- `infrastructure`: adaptadores HTTP, storage u otras implementaciones;
- `presentation`: rutas, páginas y componentes de la feature.

`core` queda para configuración transversal/singletons y `shared` para código verdaderamente reutilizable.

## Consecuencias

- Las dependencias apuntan hacia contratos de dominio, no desde dominio hacia infraestructura.
- La implementación concreta se conecta en providers/composition root.
- No se crean capas vacías por ceremonia; features pequeñas pueden simplificar estructura.
- La fuente en memoria de auth debe sustituirse por un adaptador real sin cambiar el contrato cuando OpenAPI esté confirmado.

## Alternativas consideradas

- Organización global por tipo (`components`, `services`, `models`): descartada para features de negocio porque dispersa responsabilidades.
- Aplicar Clean Architecture completa a todo archivo: descartado por sobreingeniería.
