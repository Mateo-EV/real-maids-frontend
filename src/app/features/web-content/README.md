# Web content domain — area I

Schema-complete **domain only**: entities, explicit params, typed errors and an injectable repository contract. Nothing is wired to an application action, HTTP adapter, provider, route or UI. Public landing RF/HU traceability remains unresolved in the product guide; RNF09/RNF10 guide this boundary, not a claim of delivered marketing functionality.

## Schema coverage

Evidence: `D:/java/sistema_the_real_maids/realmaids_mysql_64_tablas.sql`, area I. All three tables are represented.

| SQL table           | Entity                                                      | Fields and relationships                                                                                                                                                                                                              |
| ------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seccion_landing`   | [LandingSection](domain/entities/landing-section.entity.ts) | `id_seccion → id`, `clave → key`, `nombre → name`, `orden → order`, `visible → isVisible`                                                                                                                                             |
| `contenido_landing` | [LandingContent](domain/entities/landing-content.entity.ts) | `id_contenido → id`, `id_seccion → sectionId`, `idioma → language`, `titulo → title`, `cuerpo → body`, `url_imagen → imageUrl`, `publicado → isPublished`, `fecha_actualizacion → updatedAt`, `usuario_registro → registeredByUserId` |
| `formulario_web`    | [WebForm](domain/entities/web-form.entity.ts)               | `id_formulario → id`, `id_prospecto → prospectId`, `nombre → name`, `correo → email`, `telefono → phone`, `mensaje → message`, `ip_origen → originIp`, `procesado → isProcessed`, `fecha_envio → submittedAt`                         |

No schema fields are omitted from these entities. Nullable content text/image, update timestamp, actor ID and form contact/prospect/origin fields remain `| null`, including `fecha_actualizacion`, which has a default but no `NOT NULL`. Foreign keys are IDs, never imports from customers/users.

## Confirmed versus proposed

No landing/content/form controller was found in the inspected backend controller directory. Every operation in [WebContentRepository](domain/repositories/web-content.repository.ts) is **proposed**, not an available endpoint:

- List/create/update sections; list/create/update content through its owning section.
- Submit a contact form; page submissions; explicitly update processing/prospect association.
- Reuse shared `PaginationParams`/`PaginationResponse`, `Observable<Result<T, WebContentError>>` and an `InjectionToken`; no generic CRUD base or adapter.

[Params](domain/params/web-content.params.ts) exclude generated IDs and timestamps. Content registration actor is backend-owned; form origin IP, submission time, initial processing and prospect linkage are not public submission inputs. Processing is a separate administrative proposal, not an automatic conversion or a guessed business transition. Section association is an explicit repository argument. Nullable patch fields distinguish omission from clearing with `null`. Deletion and public/admin authorization policies are intentionally not invented.

## Representations and security

- SQL INT IDs/order use `number`; booleans use `boolean`. New BIGINT IDs would use decimal `string`, but none occur here.
- SQL DATETIME uses `Date`; DATE/TIME would remain calendar/time strings (none here). No operational timezone is selected.
- DECIMAL would use `string` without arithmetic (none here).
- Language and other VARCHAR catalogs stay open strings: defaults such as `en` do not define CHECK constraints or an i18n policy.
- Factories preserve supplied values; they are not HTTP validators, HTML sanitizers, URL allowlists or authorization. A future transport/rendering layer must validate unknown input and sanitize rendered content, including URLs/HTML, and restrict form PII/IP to authorized consumers. No runtime browser APIs are used.

## Verification surface

[Factory tests](domain/web-content.spec.ts) cover every field, false/zero values, full and nullable content/forms and Date preservation. [Boundary tests](domain/web-content-contract.spec.ts) check token substitution, all proposed method signatures, success/typed errors and generated-field exclusions. No browser/backend acceptance is claimed.
