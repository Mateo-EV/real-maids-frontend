# Opt-in API conflict responses

`apiConflictContext()` lets a validated feature adapter receive an HTTP 409 response through the
auth interceptor. It does not bypass authentication, origin scoping, bearer attachment, session
invalidation or the no-replay rule. The default is off; all other requests retain existing error
mapping. A 401 still invalidates the matching credential generation even when this context is set.

Only customer create/update and lead conversion opt in today. Their adapter accepts the fixed
`errores.correo: "EMAIL_RESERVED"` marker and produces a typed safe error; it never renders the
server message, matching customer identity or contact data. Other 409 responses remain generic
customer conflicts. No refresh or mutation retry is introduced.

Tests: `auth.interceptor.spec.ts` pins opted-in/default 409 and opted-in 401 behavior;
`customer-email-http.spec.ts` exercises the three feature operations with the real interceptor.
