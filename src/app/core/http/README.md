# Opt-in API validation, conflict and not-found delivery

`apiConflictContext()` lets a validated feature adapter receive a documented protected-API error
response instead of the interceptor's generic mapping: an HTTP `409` conflict, a `400` validation
response and a `404` documented absence. Each keeps its own status and body; the adapter is the only
layer that knows which status its call documents and which typed code it maps to.

The passthrough does not bypass authentication, origin scoping, bearer attachment, session
invalidation or the no-replay rule. The default is off; all other requests retain existing error
mapping. A `401` still invalidates the matching credential generation even when this context is set,
and `401`, `403`, `5xx` and network failures are never widened by it — a `403` stays `FORBIDDEN`, a
`5xx` or a status `0` keeps its generic/network mapping, and no response is ever replayed.

A `404` travels only when the call opts in. That is deliberate: a `404` on a list, on a write or on
any call that did not opt in keeps today's generic mapping, so an adapter cannot silently turn an
unexpected absence into a "not found" screen.

| status | opted-in request                                                                  | request without the opt-in |
| ------ | --------------------------------------------------------------------------------- | -------------------------- |
| `400`  | status and body delivered to the adapter                                          | `UNEXPECTED`               |
| `404`  | status and body delivered to the adapter                                          | `UNEXPECTED`               |
| `409`  | status and body delivered to the adapter                                          | `UNEXPECTED`               |
| `401`  | `INVALID_CREDENTIALS` + credential invalidation (never preserved, never replayed) | same                       |
| `403`  | `FORBIDDEN`                                                                       | same                       |
| `5xx`  | `UNEXPECTED`                                                                      | same                       |
| `0`    | `NETWORK`                                                                         | same                       |

Opted-in writers today: customer create/update and lead conversion accept the fixed markers
(`errores.correo: "EMAIL_RESERVED"` for conflicts, and the documented conditional account markers for
validation) and produce typed safe errors; they never render the server message, matching customer
identity or contact data. Every other `400` and `409` remains generic.

Opted-in detail readers today, all mapping `404` to their own typed absence instead of a generic
failure: `GET /api/clientes/{id}`, `GET /api/clientes/me`, `GET /api/solicitudes/{id}`,
`GET /api/ordenes/{id}` and `GET /api/atenciones/{id}`. The three collection endpoints behind those
last reads stay un-opted-in.

Any new call site that opts in inherits this passthrough, so it must decode only documented markers
or documented absences instead of trusting arbitrary body fields.

Tests: `auth.interceptor.spec.ts` pins opted-in/default `400`, `404` and `409`, opted-in/default
`401`, `403`, `5xx` and network behavior, and the no-replay rule; `customer-email-http.spec.ts`
exercises the feature operations and the account markers with the real interceptor;
`customer-not-found-http.spec.ts`, `operations-not-found-http.spec.ts` and
`customer-support-not-found-http.spec.ts` prove the detail readers receive the `404` through the real
interceptor while a list or write without the opt-in keeps the generic mapping.
