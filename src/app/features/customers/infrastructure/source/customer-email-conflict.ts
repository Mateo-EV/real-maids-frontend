import { HttpErrorResponse } from "@angular/common/http"
import { catchError, MonoTypeOperatorFunction } from "rxjs"
import { CustomerError } from "../../domain/errors/customer.error"

/** Admit only the documented fixed marker, never server error copy or contact data. */
export function reservedCustomerEmail<T>(): MonoTypeOperatorFunction<T> {
  return catchError((error: unknown) => {
    if (error instanceof HttpErrorResponse && error.status === 409) {
      const body: unknown = error.error
      if (body && typeof body === "object" && "errores" in body) {
        const fields: unknown = body.errores
        if (
          fields &&
          typeof fields === "object" &&
          "correo" in fields &&
          fields.correo === "EMAIL_RESERVED"
        )
          throw new CustomerError("EMAIL_RESERVED")
      }
    }
    throw error
  })
}
