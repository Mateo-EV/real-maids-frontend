# Backend contracts needed for Users / IAM

The current API supports login, listing users and registering accounts, but cannot yet replace the complete IAM demo. This document separates observed OpenAPI contracts from proposed capabilities. Proposed paths are discussion inputs, not approved endpoints or evidence of backend implementation.

## Evidence and scope

- Swagger UI: <http://localhost:8080/swagger-ui/index.html#/>
- Retrieved specification: `GET http://localhost:8080/v3/api-docs` (OpenAPI 3.1.0, `API ERP + CRM The Real Maids`, version `0.1`). Swagger configuration also responded with HTTP 200.
- Frontend scope: [product guide](README.md), [project overview](../README.md) and [agent constraints](../AGENTS.md).
- Traceability: M01/RF01/HU01/P01 for authentication; M02/RF02/HU02/P03 for users, roles and permissions; RNF01/RNF03/RNF06/RNF08/RNF09/RNF10/RNF12 for relevant cross-cutting concerns. Audit-specific RF/HU remains unresolved.
- Analysis inspected documentation and source contracts only. It did not authenticate, mutate backend records, verify CORS/authorization/persistence, or inspect backend source.
- “Missing” below means absent from the retrieved OpenAPI, not proven absent from the backend.

## What can be used now

| Documented operation | Request | Response | Integration readiness |
| --- | --- | --- | --- |
| `POST /api/auth/login` | Required `correo`, `password` | `token`, `tipo`, `expiraEnSegundos`, `correo`, `rol` | Can support token acquisition after transport/session decisions; does not satisfy current-user restoration by itself. |
| `GET /api/usuarios` | No parameters documented | Array of `UsuarioResponse` | Can support a partial account list; missing profile fields prevent a faithful mapping to the current `User` entity. |
| `POST /api/usuarios` | Required `correo`, `password`, `idRol`; optional `idioma` | `UsuarioResponse` | Can register accounts after role IDs and defaults are confirmed; cannot persist the full current editor model. |

All three operations document only `200`, use `*/*` for response content and inherit global Bearer JWT security. Login has no explicit public-security override: confirm runtime behavior and correct the specification if login is public. None of the response properties are marked required.

The specification also contains `GET /api/clientes` and `POST /api/clientes`; these belong to Customers and do not close IAM gaps.

### Registration validation

- `correo`: email format, maximum 120 characters; required, but the schema does not guarantee nonblank content.
- `password`: 8–64 characters, with lowercase, uppercase and a digit. Align frontend validation; do not log credentials or silently change password whitespace semantics.
- `idRol`: int32, minimum 0. Confirm valid IDs, role existence/active-state rules and authorization for assignment; do not assume 0 is a valid role.
- `idioma`: optional, pattern `es|en`. Confirm exact allowed values and the default; an enum would remove regex ambiguity.

## User DTO incompatibilities

| Frontend field | Documented backend field | Required resolution |
| --- | --- | --- |
| `id` | `idUsuario` | Explicit DTO mapping; confirm guaranteed presence. |
| `email` | `correo` | Explicit DTO mapping. |
| `lang` | `idioma` | Confirm `es` / `en`, default and nullable behavior. |
| `isActive` | `activo` | Confirm guaranteed presence and initial-state policy. |
| `createdAt` | `fechaCreacion` | Confirm timezone/offset and parse valid dates. |
| `roleId` | Only `rol` text | Return stable role identity and expose its catalog; never infer IDs from demo names. |
| `name`, `age` | Not declared | Confirm profile ownership and product need; extend the API or explicitly revise the frontend contract. Age ≥18 is demo validation, not an established backend rule. |
| `updatedAt`, `lastAccess` | Not declared | Confirm semantics and nullable access history; do not manufacture timestamps. |

Registration does not accept `name`, `age` or initial active state. Profile editing currently accepts an optional password, but no backend update/credential operation is documented. Decide whether credentials use a separate operation rather than assuming generic profile updates change passwords.

## Proposed missing operations

The following methods and paths are **proposals to agree with the backend**, preserving its current Spanish resource naming. Equivalent existing operations would satisfy the capability if their contracts are documented. No frontend adapter should call these paths before approval and implementation.

### Priority 1 — Authentication and usable user management

| Proposed operation | Capability / consumer | Contract to agree |
| --- | --- | --- |
| `GET /api/auth/me` | `AuthRepository.me()`; login completion, restoration and guards | Authenticated stable user identity, profile and role identity; effective permissions or a documented way to retrieve them. Define unauthenticated/expired behavior. |
| `POST /api/auth/logout` | Invalidate the current session/credential when supported | Revocation semantics and client clearing behavior. Current frontend `logout(): void` must be adapted if server completion becomes asynchronous. Stateless JWT clearing alone is not server revocation. |
| `GET /api/roles` | User role selector/filter and RBAC role selector | Stable `id`, name, description, active state and creation date, or an approved revised role DTO; clarify whether inactive assigned roles remain visible. |
| `GET /api/usuarios/{id}` | `getUserById()` | Complete agreed user DTO and not-found behavior. |
| `PUT /api/usuarios/{id}` | Profile editing | Agree full-replacement versus partial-update semantics (use PATCH instead if partial); writable fields, validation, duplicate-email behavior and response DTO. |
| `PATCH /api/usuarios/{id}/estado` | Dedicated activate/deactivate action | Desired boolean state, not toggle; preserve other profile/access fields. Agree self-deactivation, last-administrator and session consequences. |
| `DELETE /api/usuarios/{id}` | Confirmed deletion action | Decide hard delete versus logical removal, dependency constraints, self-deletion rules and effects on sessions/audit. Do not equate this with deactivation silently. |

**Existing operations also need extension:** agree complete DTOs for listing/registration and expose confirmed error contracts. The current users UI filters and paginates a full array locally; backend pagination is a scalability option requiring frontend contract changes, not a missing endpoint required by today's repository.

### Priority 2 — RBAC backed by real permissions

| Proposed operation | Capability / consumer | Contract to agree |
| --- | --- | --- |
| `GET /api/permisos` | Authoritative permission catalog for the matrix | Stable permission/module/action identifiers, available combinations and any scope model. Catalog delivery could instead be included in a documented matrix response. |
| `GET /api/roles/{id}/permisos` | `getRolePermissions(roleId)` | Current grants and whether empty/unconfigured differ. |
| `PUT /api/roles/{id}/permisos` | `saveRolePermissions(roleId, grants)` | Atomic complete-set replacement or an explicitly different model; validation, privilege-escalation protection and concurrent-edit handling. |

The frontend's seven illustrated module IDs and actions are demo data, not an approved ACL. Backend authorization must enforce actual permissions on protected operations; saving a matrix or hiding a button does not enforce access. Textual scope notes are not executable policy.

### Priority 3 — Active sessions

| Proposed operation | Capability / consumer | Contract to agree |
| --- | --- | --- |
| `GET /api/sesiones` | `getUserSessions()` and global active-session metric | Session ID, user ID, device, IP/origin, start/expiry dates and authentic current-session designation. Define visibility and what counts as active. |
| `DELETE /api/usuarios/{userId}/sesiones/{sessionId}` | Confirmed individual session revocation | Verify ownership and authorization, expire/revoke credentials, define not-found/already-expired/current-session behavior. |

The UI groups sessions by user, including users with zero sessions, then paginates users locally. It needs access to the user catalog as well as sessions. Its current-session marker and protection are simulated; whether administrators may revoke their own current session is a backend/product decision. JWT issuance alone does not provide a revocable session registry; agree the server-side mechanism.

### Priority 4 — Audit viewer and export

| Proposed operation | Capability / consumer | Contract to agree |
| --- | --- | --- |
| `GET /api/auditoria` | `getAuditLogs(params)` | Filters by UTC day, entity and action; deterministic order; pagination metadata and an independent global total. Current frontend shape is `{ items, total, offset, limit }`, default 0/20, max 100; these are frontend conventions to negotiate. |
| `GET /api/auditoria/{id}` | `getAuditLogById(id)` | Actor, user ID, action, entity, record ID, timestamp, origin/IP, details and optional before/after field changes. |
| `GET /api/auditoria/exportacion` | All filtered records for CSV export | Either authorized structured records for frontend CSV generation or a server-generated download; agree format, limits and large-export handling. Unbounded arrays are not a mandatory backend design. |

Filtered page totals must not silently replace the global audit metric. A global count can be metadata or a separate agreed query; no dedicated endpoint is inherently required. Audit currently uses synthetic records: backend operations must generate authorized, redacted events if the viewer is to represent real activity. Never expose passwords, tokens or other sensitive values in before/after changes. Retention, access policy and integrity guarantees need explicit agreement; the UI does not prove immutability.

### Optional scope — Role administration and credentials

Role CRUD contracts exist but no role-management UI is exposed. Only the role catalog is immediately necessary for the visible page. If role administration is approved, discuss `POST /api/roles`, `GET /api/roles/{id}`, `PUT /api/roles/{id}` and `DELETE /api/roles/{id}`. Confirm assigned-role deletion rules rather than importing demo `ROLE_IN_USE` behavior as backend policy.

There is no standalone credential-management screen. Confirm whether editing an optional password is supported, removed or routed through a dedicated credential operation. Password reset, MFA, bulk session revocation and refresh endpoints are not automatically required by the existing UI. Add a refresh operation only after agreeing session lifetime/renewal policy.

## Cross-cutting agreements before HTTP adapters

- Define actual permission requirements and `401` versus `403` behavior for every protected operation; do not derive authorization from role names.
- Document validation, duplicate/conflict, not-found and internal-error responses with stable machine codes and safe field errors. A consistent error envelope is a proposal, not an existing contract.
- Mark guaranteed response fields, nullable values, enums, IDs and date/time semantics in OpenAPI; distinguish absent values from null.
- Confirm production HTTPS, API base/versioning and browser CORS for the actual frontend origin. Swagger availability does not validate these.
- Decide token/session storage, restoration, expiration and any refresh/revocation strategy explicitly. Do not promote the demo localStorage flag into permanent authentication.
- Confirm transaction boundaries and any concurrency control for profile/RBAC edits; retries and idempotency must follow server semantics.
- Keep error mappings explicit: existing frontend codes such as `EMAIL_ALREADY_EXISTS`, `ROLE_IN_USE`, `CURRENT_SESSION` and `INVALID_GRANTS` are not established wire codes.

## Infrastructure implementation implications

Repository contracts live in [`src/app/features/users/domain/repositories`](../src/app/features/users/domain/repositories); DTO expectations are defined in its sibling `entities`, `models`, `params` and `errors` directories. Authentication uses [`AuthRepository`](../src/app/features/auth/domain/repositories/auth.repository.ts).

The composition root already aliases root repository implementations with `useExisting`, but they inject demo sources. Keep repository implementations and source/transport adapters separate; preserve use-case/store boundaries and shared lifetimes while introducing confirmed HTTP DTO mappings.

[`app.config.ts`](../src/app/core/config/app.config.ts) does not currently configure HTTP integration, and [`API_URL`](../src/app/core/tokens/api-url.token.ts) has no provider. Adding HTTP provisioning, API configuration, credential transport, error mapping and session handling is separate frontend work, not proof that the backend lacks routes. Preserve cancellation and review SSR/browser boundaries when connecting real sessions.

## Recommended integration order

1. Agree identity/session handling, user DTOs, role IDs and error responses.
2. Connect authentication/restoration, roles and user queries; then registration, editing, desired-state changes and deletion.
3. Agree the authoritative ACL and connect RBAC, with backend enforcement.
4. Connect revocable sessions and real audit queries/export after their server semantics are established.

Before claiming completion, test adapter mapping and success/error cases, guards and authorization-related UX, expiration/revocation, date handling and relevant component states. This document does not certify any backend behavior or frontend integration as complete.
