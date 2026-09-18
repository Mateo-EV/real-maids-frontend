# Registro de decisiones

Última reconciliación con el código: **2026-09-18**.

Estados:

- **Aceptada**: decisión vigente respaldada por ADR o requisito firme.
- **Implementada**: además de aceptada, tiene evidencia activa en el repositorio.
- **Parcial**: existe un esqueleto, pero falta conexión funcional.
- **Abierta**: no debe resolverse implícitamente en código.
- **Descartada/sustituida**: ya no describe el stack actual.

| ID      | Decisión                                                  | Estado                | Evidencia/ADR                                                 |
| ------- | --------------------------------------------------------- | --------------------- | ------------------------------------------------------------- |
| DEC-001 | Angular + TypeScript                                      | Implementada          | ADR-001; Angular 22 y TS 6                                    |
| DEC-002 | API interna REST/JSON como frontera                       | Aceptada              | ADR-002; integración HTTP aún ausente                         |
| DEC-003 | QuickBooks solo desde backend                             | Aceptada              | ADR-005                                                       |
| DEC-004 | Navegación y rutas conscientes de permisos                | Parcial               | Guards de sesión implementados; ACL por rol pendiente         |
| DEC-005 | Aplicación web responsive                                 | Aceptada              | ADR-004                                                       |
| DEC-006 | Componentes standalone                                    | Implementada          | `bootstrapApplication` y componentes standalone implícitos    |
| DEC-007 | SSR Angular + Express, hidratación y prerender            | Implementada          | ADR-007, `angular.json`, `src/server.ts`                      |
| DEC-008 | Spartan Brain/Helm + Tailwind CSS 4                       | Implementada          | ADR-006, `components.json`, `libs/ui`, `src/styles.css`       |
| DEC-009 | Arquitectura por feature con capas cuando aporten límites | Implementada inicial  | ADR-009; feature auth vertical completa para demo             |
| DEC-010 | Repositorios de dominio conectados por `InjectionToken`   | Implementada inicial  | Auth usa `AUTH_REPOSITORY` y adaptador en memoria             |
| DEC-011 | Unit tests con builder Angular + Vitest                   | Implementada          | ADR-008; 21 pruebas aprobadas                                 |
| DEC-012 | Angular Material o Bootstrap                              | Descartada/sustituida | Sustituida por ADR-006                                        |
| DEC-013 | Jasmine/Karma como runner actual                          | Descartada/sustituida | Sustituida por ADR-008                                        |
| DEC-014 | Preparar interfaz en español e inglés                     | Abierta               | Falta estrategia i18n                                         |
| DEC-015 | Mostrar zona horaria operativa                            | Abierta               | Falta contrato y formato                                      |
| DEC-016 | Persistencia/renovación del JWT                           | Abierta               | No usar almacenamiento permanente sin ADR                     |
| DEC-017 | NgRx SignalStore para estado compartido de presentación   | Implementada inicial  | ADR-011; store auth raíz, sin store monolítico                 |
| DEC-018 | Cliente OpenAPI generado o servicios manuales             | Abierta               | Depende del contrato backend                                  |
| DEC-019 | Manejo estándar de errores API                            | Abierta               | Falta esquema backend                                         |
| DEC-020 | Hosting productivo                                        | Abierta               | Vercel era previsto, no está verificado                       |
| DEC-021 | E2E                                                       | Abierta               | Cypress era previsto, pero no está instalado/configurado      |
| DEC-022 | Render mode por rutas privadas/dinámicas                  | Parcial               | Login prerender; rutas protegidas CSR sin backend             |
| DEC-023 | Alcance de landing pública                                | Abierta               | Trazabilidad funcional incompleta                             |
| DEC-024 | Transiciones excepcionales y duplicados                   | Abierta               | Requieren validación de negocio/backend                       |
| DEC-025 | Angular Signal Forms como base; abstracciones compartidas  | Implementada inicial  | ADR-010; P01 migrada, sin wrapper genérico                     |
| DEC-026 | Política de caché y reintentos                            | Abierta               | Depende del contrato y semántica de cada operación            |
| DEC-027 | Observabilidad frontend                                   | Abierta               | No hay proveedor ni política de datos definida                |
| DEC-028 | Cliente registra directamente una solicitud               | Abierta               | La fuente funcional no resuelve el alcance del portal cliente |

## Regla de mantenimiento

Una dependencia instalada o un archivo placeholder no cierran una decisión funcional. Toda decisión transversal sobre UI, estado, JWT, formularios compartidos, OpenAPI, caché, observabilidad, hosting o renderizado debe quedar en un ADR antes de consolidarse en nuevas features.
