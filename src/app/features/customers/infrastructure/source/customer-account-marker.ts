import { HttpErrorResponse } from "@angular/common/http"
import { catchError, MonoTypeOperatorFunction } from "rxjs"
import { CustomerError, CustomerErrorCode } from "../../domain/errors/customer.error"

/**
 * The documented conditional markers for the portal account, mapped to their own field-specific
 * codes so the editor can render them next to the input that has to be fixed. Any other body keeps
 * its transport status mapping; server copy never reaches the UI.
 */
const markers: Readonly<Record<string, CustomerErrorCode>> = {
  correoParaCuenta: "ACCOUNT_EMAIL_REQUIRED",
  passwordParaCuenta: "ACCOUNT_PASSWORD_REQUIRED",
  passwordSoloConCuenta: "ACCOUNT_PASSWORD_WITHOUT_ACCOUNT"
}

export function accountFieldMarker<T>(): MonoTypeOperatorFunction<T> {
  return catchError((error: unknown) => {
    if (error instanceof HttpErrorResponse && error.error && typeof error.error === "object") {
      const fields: unknown = (error.error as Record<string, unknown>)["errores"]
      if (fields && typeof fields === "object")
        for (const [marker, code] of Object.entries(markers))
          if (marker in fields) throw new CustomerError(code)
    }
    throw error
  })
}
