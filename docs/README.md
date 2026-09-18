# Documentación del frontend

## Orden de lectura

1. [`PROJECT_STATUS.md`](PROJECT_STATUS.md): qué existe y qué no existe hoy.
2. [`DECISIONS.md`](DECISIONS.md): decisiones vigentes y abiertas.
3. [`ARCHITECTURE.md`](ARCHITECTURE.md): estructura técnica implementada.
4. [`TRACEABILITY.md`](TRACEABILITY.md): cobertura real de RF/HU/M/P.
5. El ADR relacionado en [`adr/`](adr/).
6. El documento especializado que corresponda.

## Documentos

| Documento                 | Propósito                                                      |
| ------------------------- | -------------------------------------------------------------- |
| `PROJECT_STATUS.md`       | Foto verificable del repositorio y brechas actuales            |
| `DECISIONS.md`            | Registro consolidado de decisiones vigentes y asuntos abiertos |
| `ARCHITECTURE.md`         | Arquitectura Angular/SSR/UI realmente implementada             |
| `TRACEABILITY.md`         | Relación entre requisitos previstos y evidencia de código      |
| `DEVELOPMENT.md`          | Flujo local, MCP de Angular, Angular CLI y convenciones        |
| `TESTING.md`              | Runner real, estado de pruebas y estrategia objetivo           |
| `API_INTEGRATION.md`      | Estado actual de integración y límites del contrato REST       |
| `ROLES_AND_NAVIGATION.md` | Navegación prevista frente a rutas implementadas               |
| `UX_GUIDELINES.md`        | Reglas UX/UI compatibles con Spartan y Tailwind                |
| `SOURCE_NOTES.md`         | Separación entre fuente académica y estado del código          |
| `adr/`                    | Decisiones arquitectónicas persistentes                        |

## Regla de verdad

- El código, la configuración y las pruebas determinan el estado implementado.
- Los ADR y decisiones aceptadas determinan la arquitectura vigente.
- RF, RNF, HU, M y P determinan intención funcional, no avance de implementación.
- OpenAPI/Swagger del backend determinará el contrato REST cuando esté disponible.
- Figma aprobado determina la referencia visual, no el estado del frontend.

Cada documento debe fechar una verificación cuando registre resultados de build, pruebas o herramientas locales.
