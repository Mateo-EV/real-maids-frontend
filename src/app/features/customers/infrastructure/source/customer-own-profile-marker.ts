import { HttpErrorResponse } from "@angular/common/http"
import { catchError, MonoTypeOperatorFunction } from "rxjs"
import { CustomerError, CustomerErrorCode } from "../../domain/errors/customer.error"

/**
 * WP10 T7 / S2 — the documented own-profile validation markers.
 *
 * `PUT /api/clientes/me` only accepts `nombre` and `telefono`, and a rejected field is named in the
 * documented `errores` map. Mapping that marker to its own field code is what lets the portal attach
 * the failure to the input that has to be fixed; the body itself is never shown, and an answer this
 * client does not recognize keeps the generic `INVALID_INPUT` mapping instead of guessing a field.
 */
const markers: Readonly<Record<string, CustomerErrorCode>> = {
  nombre: "CUSTOMER_NAME_INVALID",
  telefono: "CUSTOMER_PHONE_INVALID"
}

export function ownProfileFieldMarker<T>(): MonoTypeOperatorFunction<T> {
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
