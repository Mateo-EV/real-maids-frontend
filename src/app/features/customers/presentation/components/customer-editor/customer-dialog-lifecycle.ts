import { DialogRef as CdkDialogRef } from "@angular/cdk/dialog"
import { DestroyRef, inject } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { filter, merge, tap } from "rxjs"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { CustomerErrorCode } from "../../../domain/errors/customer.error"

/** Native closing is disabled; all user dismissal follows the pending Cancel guard. */
export function customerDialogLifecycle(cancel: () => void, expired: () => void) {
  const destroyRef = inject(DestroyRef)
  const overlay = inject(CdkDialogRef).overlayRef
  let ended = false
  const scope = createSessionReadScope(() => {
    ended = true
    if (!destroyRef.destroyed) expired()
  })
  scope.check()
  const generation = scope.generation()
  merge(
    overlay.backdropClick(),
    overlay.outsidePointerEvents(),
    overlay.keydownEvents().pipe(
      filter(e => e.key === "Escape" && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey),
      tap(e => e.preventDefault())
    )
  )
    .pipe(takeUntilDestroyed(destroyRef))
    .subscribe(cancel)
  return {
    cancelled$: scope.cancelled$,
    current: () =>
      !destroyRef.destroyed && !ended && scope.check() && generation === scope.generation()
  }
}

export function customerWriteError(code: CustomerErrorCode): string {
  switch (code) {
    case "INVALID_INPUT":
      return "Revisa los datos del cliente."
    case "FORBIDDEN":
      return "No tienes permiso para realizar esta operación."
    case "EMAIL_RESERVED":
      return customerFieldError("EMAIL_RESERVED")!.message
    case "ACCOUNT_EMAIL_REQUIRED":
    case "ACCOUNT_PASSWORD_REQUIRED":
    case "ACCOUNT_PASSWORD_WITHOUT_ACCOUNT":
      return customerFieldError(code)!.message
    case "CONFLICT":
      return "Los datos entran en conflicto. Revisa el cliente antes de reintentar."
    case "UNAUTHENTICATED":
      return "La sesión no está disponible. Vuelve a iniciar sesión."
    case "CUSTOMER_NOT_FOUND":
      return "El cliente ya no está disponible. Cierra y vuelve al catálogo."
    case "UNCONFIGURED":
      return "El servicio de clientes no está disponible en este entorno."
    case "NETWORK":
      return "No se pudo conectar. Puedes reintentar."
    default:
      return "No se pudo confirmar la operación. Revisa el catálogo antes de reintentar."
  }
}

/** A failure the user can only fix in one specific input of the customer form. */
export interface CustomerFieldError {
  readonly field: "email" | "password"
  readonly message: string
}

/**
 * Field-specific failures already carry a documented marker, so the editor renders them next to the
 * input they belong to instead of in the general alert. `password` markers only make sense while the
 * password input is visible; the caller decides that, this mapping stays declarative.
 */
export function customerFieldError(code: CustomerErrorCode): CustomerFieldError | null {
  switch (code) {
    case "EMAIL_RESERVED":
      return {
        field: "email",
        message:
          "El correo ya pertenece a una cuenta del portal, incluso si está inactiva. Usa otro correo; no se creó ni fusionó otro cliente."
      }
    case "ACCOUNT_EMAIL_REQUIRED":
      return {
        field: "email",
        message: "La cuenta del portal necesita el correo del cliente."
      }
    case "ACCOUNT_PASSWORD_REQUIRED":
      return {
        field: "password",
        message: "La cuenta del portal necesita una contraseña inicial."
      }
    case "ACCOUNT_PASSWORD_WITHOUT_ACCOUNT":
      return {
        field: "password",
        message: "Solo se envía una contraseña cuando se solicita la cuenta del portal."
      }
    default:
      return null
  }
}
