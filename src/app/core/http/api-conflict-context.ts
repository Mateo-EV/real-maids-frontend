import { HttpContext, HttpContextToken } from "@angular/common/http"

/**
 * Opt-in delivery of a protected request's documented **business-error** body to the adapter that
 * validates it: `409` conflicts, `400` validation responses and `404` documented absences. Every
 * status keeps its own body and status code; every other outcome keeps the interceptor's generic
 * mapping.
 *
 * A `404` needs this opt-in because only the adapter knows which of its calls documents an absence
 * and what typed not-found code it maps to. Without the opt-in a `404` stays generic, so a list, a
 * write or any other call keeps today's behaviour.
 *
 * It does not widen `401`/`403`/5xx/network handling, does not bypass origin scoping, bearer
 * attachment, session invalidation or the no-replay rule, and never authorizes a retry.
 */
export const PRESERVE_API_CONFLICT = new HttpContextToken(() => false)
export const apiConflictContext = () => new HttpContext().set(PRESERVE_API_CONFLICT, true)
