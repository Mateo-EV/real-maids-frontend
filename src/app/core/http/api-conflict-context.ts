import { HttpContext, HttpContextToken } from "@angular/common/http"

/**
 * Opt-in delivery of a protected request's documented **business-error** body to the adapter that
 * validates it: `409` conflicts and `400` validation responses. Both keep their status and body;
 * every other outcome keeps the interceptor's generic mapping.
 *
 * It does not widen `401`/`403`/5xx/network handling, does not bypass origin scoping, bearer
 * attachment, session invalidation or the no-replay rule, and never authorizes a retry.
 */
export const PRESERVE_API_CONFLICT = new HttpContextToken(() => false)
export const apiConflictContext = () => new HttpContext().set(PRESERVE_API_CONFLICT, true)
