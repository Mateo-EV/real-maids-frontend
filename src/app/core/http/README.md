# Opt-in API validation and conflict responses

`apiConflictContext()` lets a validated feature adapter receive the body of an HTTP `409` conflict
or a `400` validation response through the auth interceptor. It does not bypass authentication,
origin scoping, bearer attachment, session invalidation or the no-replay rule. The default is off;
all other requests retain existing error mapping. A `401` still invalidates the matching credential
generation even when this context is set, and `401`, `403`, `5xx` and network failures are never
widened by it.

Only customer create/update and lead conversion opt in today. Their adapters accept the fixed
markers (`errores.correo: "EMAIL_RESERVED"` for conflicts, and the documented conditional account
markers for validation) and produce typed safe errors; they never render the server message,
matching customer identity or contact data. Every other `400` and `409` remains generic. No refresh
or mutation retry is introduced.

Any new call site that opts in inherits this passthrough, so it must keep decoding only documented
markers instead of trusting arbitrary body fields.

Tests: `auth.interceptor.spec.ts` pins opted-in/default `409`, opted-in `400`, opted-in/default
`401`, `403`, `5xx` and network behavior; `customer-email-http.spec.ts` exercises the feature
operations and the account markers with the real interceptor.
