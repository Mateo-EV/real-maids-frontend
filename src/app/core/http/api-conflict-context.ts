import { HttpContext, HttpContextToken } from "@angular/common/http"

/** Opt-in delivery of a 409 response to an adapter that validates its business-error contract. */
export const PRESERVE_API_CONFLICT = new HttpContextToken(() => false)
export const apiConflictContext = () => new HttpContext().set(PRESERVE_API_CONFLICT, true)
