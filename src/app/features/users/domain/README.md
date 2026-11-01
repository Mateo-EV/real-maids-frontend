# Existing IAM coverage — area A

Keep the established API-aligned auth/users contracts. The SQL snapshot is older than the current IAM responses; this slice adds only the missing schema association snapshot, not a replacement IAM or authentication implementation (M01/RF01/HU01, M02/RF02/HU02/P03; RNF09/RNF10/RNF12).

## Table coverage

Paths are relative to this domain directory.

| SQL table       | Existing domain representation                                                                              | Decision                                                                                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `rol`           | [Role](entities/role.entity.ts), role params/repository/errors                                              | Preserve current public API contract and catalog behavior. SQL nullable description differs from the established string representation; do not silently change existing consumers.         |
| `permiso`       | [Permission](entities/permission.entity.ts), RBAC repository/errors                                         | Dynamic ID/code/module/description interface is intentional. Existing API boundary requires a string description despite SQL nullability; no factory rewrite or closed CRUD-column enum.   |
| `rol_permiso`   | [RolePermission](entities/role-permission.entity.ts)                                                        | New schema-only factory with independent join ID, role ID and permission ID. The join ID was not represented by the existing assignment response. No new repository is needed.             |
| `usuario`       | [User](entities/user.entity.ts), create/update params and [UserRepository](repositories/user.repository.ts) | Preserve backend-authoritative name, language, status, dates, role and nullable last access. Exclude `password_hash`.                                                                      |
| `sesion`        | [UserSession](entities/user-session.entity.ts), owner/query models and session repository/errors            | Preserve public caller-relative current flag and optional returned owner context; exclude `token_hash`. IP/device remain the established public contract, not a SQL-nullability migration. |
| `log_auditoria` | [AuditLog](entities/audit-log.entity.ts), audit query/detail/export contracts/errors                        | Preserve API actor/email/change metadata and string record IDs. Existing numeric log IDs remain API-aligned; do not migrate them to string solely because old SQL uses BIGINT.             |

`RolePermission` exists only to cover the SQL association's independent identity. Production behavior remains [RbacRepository](repositories/rbac.repository.ts): read catalog/assignment and atomically replace the complete set of permission IDs, including an empty set. No join-row CRUD endpoints or role-based permission inference are proposed.

## Confirmed API differences and security exclusions

Read-only backend `dto/UsuarioResponse.java` explicitly includes `nombre`, although the SQL `usuario` table lacks it. Its public profile includes role information, language, active, nullable last access and creation/update timestamps, never the password hash. The User entity's English `name` therefore stays. Existing request-only password fields are not profile fields; this slice neither exposes hashes nor changes credential handling.

Auth already owns login/current identity, access/refresh lifecycle and logout through its domain/application contracts. Users owns administrative IAM catalog, permission assignment, session inspection/revocation and read-only audit. Authentication credentials are not `UserSession` identifiers. Neither cached permissions nor session lists establish frontend authorization or prove revocation. No auth files are edited.

The raw SQL password hash and session token hash are deliberately omitted, not missing features. Encrypted QuickBooks credentials and processor token references are backend-only and are not introduced here. Existing access/refresh transport is not redefined by this schema work.

## Representation boundaries and remaining gaps

SQL INT foreign keys use numbers. The new association uses private positional construction and static `create()`. New BIGINT models use strings, DECIMAL uses decimal strings, DATE/TIME use strings and DATETIME uses Date; existing IAM contracts take precedence over these new-model defaults. Nullable SQL columns in new models use explicit `| null`; existing validated API fields and optional response metadata remain unchanged.

Role/Permission string descriptions, User update dates, session IP/device and audit numeric IDs intentionally retain their established public contracts instead of copying obsolete SQL nullability/types. A future API change requires adapter/consumer evidence and separate scope. The legacy illustration RBAC matrix is not a schema entity or production fallback. No new proposed IAM mutations, UI, routes, dependencies or adapters are added. The SQL uniqueness of `(roleId, permissionId)` remains a backend invariant, not a guessed entity transition.
