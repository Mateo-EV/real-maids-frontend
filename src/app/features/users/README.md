# Users — IAM capability

M02/RF02/HU02/P03. The feature owns `/admin/users`: server-paged users, the role catalog, RBAC
assignment, IAM sessions and the audit viewer. Users, roles, permissions, sessions and audit are
wired to the documented HTTP API; the in-memory sources and their fixtures remain **unwired**
test/demo data and are never fallbacks. The capability keeps root store lifetimes, stateless
`*UseCase.execute()` actions and the `useExisting` repository/source boundary described in
[AGENTS.md](../../../../AGENTS.md) and the [product guide](../../../../docs/README.md). No role
name, JWT claim or catalog flag is used as an ACL.

## WP10 T15 — CLIENTE account creation from the users editor

S9/S13/S17 (with S11 for the shared email). `POST /api/usuarios` already creates the customer row in
the same transaction when `idRol` is the backend's CLIENTE role, so the alta no longer needs a second
module: the account is created and the customer is created with it.

- **Role identity, not authorization.** The backend matches its CLIENTE role by exact name
  (`CuentaClienteService.ROL_CLIENTE`), so the form compares the selected role of the existing
  catalog against that exact name (`CUSTOMER_ROLE_NAME`). Nothing is inferred from the role for
  permissions or navigation.
- **Create only.** `tipo`/`telefono` belong to the customer row that a CLIENTE **alta** creates.
  `PUT /api/usuarios/{id}` has no such fields and never creates a customer, so the edit dialog keeps
  the previous form and payload. Changing an existing account's role to CLIENTE is therefore not a
  customer-creation path; that remains a backend/product question, not a frontend promise.
- **Explicit warning.** Selecting CLIENTE in a new alta renders a non-dismissible notice
  (`#user-customer-warning`, `role="alert"` by the shared Helm alert) stating that a **new customer**
  will be created with the same name, email and phone, that the customer is administered in CRM, that
  the account must change its password on the first login and that the alta also needs the
  customer-creation permission.
- **Revealed fields.** Only for that role the form reveals a required `tipo` (`residencial` |
  `comercial`, mirroring the backend `chk_cliente_tipo` constraint) and an optional `telefono`
  (documented `^\+?[0-9 ()-]{7,30}$`). Every other role hides both fields.
- **Role switching clears state.** Leaving CLIENTE empties both fields and resets their
  `touched`/dirty/error state, so a stale `tipo`, phone or validation message can never travel with
  another role's alta.
- **Validation before dispatch.** Name, email and password keep their existing rules; `tipo` is
  required only for CLIENTE. Dispatch is also blocked defensively if the type is invalid, and an
  undocumented value is rejected by the HTTP source with `VALIDATION` and zero requests.

Exact request body per role (`POST /api/usuarios`):

```jsonc
// Any role other than CLIENTE — unchanged from the previous contract
{ "nombre": "…", "correo": "…", "password": "…", "idRol": 7, "idioma": "es", "activo": true }

// CLIENTE — the backend accepts tipo (required there) and telefono (optional)
// idRol is whatever the role catalog returns for CLIENTE; it is never hard-coded.
{
  "nombre": "…", "correo": "…", "password": "…", "idRol": 6, "idioma": "es", "activo": true,
  "tipo": "residencial", "telefono": "999 111 222"
}
```

`telefono` is trimmed and omitted when blank; `tipo`/`telefono` never travel without the account
requesting the customer row (an orphan phone is dropped by the source instead of being sent alone).
Password bytes are never trimmed, and no account-only field is sent on `PUT`.

- **Failures.** A `403` on that alta renders an actionable inline message naming the missing
  `CLIENTE_CREAR` permission and stating that nothing was created — never the generic permission
  copy and never raw backend text. `409`/`EMAIL_RESERVED` (`EMAIL_ALREADY_EXISTS` in the typed error)
  binds to the email input with the shared-address explanation: the email is unique across accounts
  and customers, including inactive ones. The general alert is reserved for the remaining codes.
- **Success.** Only a confirmed `Result` success emits feedback and closes the dialog. The editor
  reports `{ created, customerCreated, customerId }` through `onSaved`, and the page toast becomes
  `Usuario y cliente creados · Cliente #<idCliente>` (or `Usuario y cliente creados` when the response
  carries no reference). The reference is plain text: no new route, navigation or customer lookup.
- **Response mapping.** `idCliente` is parsed into `User.customerId` as a nullable positive int32;
  responses that omit the key stay `null` and a malformed value is `INVALID_RESPONSE`.
  `debeCambiarPassword` is not consumed yet — the forced first-login change belongs to T16.
- **Preserved lifecycle.** Same dialog lifecycle and pending guards: duplicate submit and
  Cancel/Escape/outside dismissal stay blocked while submitting, failures preserve the draft, and
  `DestroyRef`/session/dialog fencing suppresses late feedback. The existing `UserStore` mutation
  already invalidates every page variant and statistics once, so no extra reload, optimistic row or
  write replay is added.

Evidence: [editor tests](presentation/components/user-editor/user-editor.spec.ts) cover the warning
per role, the revealed fields, `tipo` validation, role-switch clearing, the exact payload per role,
the `CLIENTE_CREAR` message, the email-field binding, the surfaced `idCliente` and the untouched edit
payload; [HTTP tests](infrastructure/source/user-http.source.spec.ts) cover the wire body per role,
the blank-phone/orphan-phone and invalid-type rules and `idCliente` mapping; the
[page tests](presentation/pages/users-page/users-page.spec.ts) cover the toast copy. These are
deterministic unit checks, not live evidence.

Pending manual/live acceptance: creating a CLIENTE account against the real backend (with and
without `CLIENTE_CREAR`, with and without phone), the real `409` payload and CORS, the created
customer appearing in CRM, the first-login forced password change (T16), the inactive/role-catalog
edge cases and Chrome/Edge/Firefox keyboard/responsive checks.
