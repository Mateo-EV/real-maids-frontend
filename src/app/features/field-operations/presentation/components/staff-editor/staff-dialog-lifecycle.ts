import { DialogRef as CdkDialogRef } from "@angular/cdk/dialog"
import { DestroyRef, inject } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { filter, merge, tap } from "rxjs"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { FieldOperationsErrorCode } from "../../../domain/errors/field-operations.error"
import { StaffAccountFailureReason } from "../../../domain/repositories/field-operations.repository"

/**
 * Employee dialog lifecycle, mirroring the customer editor: native closing is disabled and every
 * user dismissal follows the pending Cancel guard, while the session scope cancels detached work.
 */
export function staffDialogLifecycle(cancel: () => void, expired: () => void) {
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

export function staffWriteError(code: FieldOperationsErrorCode): string {
  switch (code) {
    case "INVALID_DATA":
      return "Revisa los datos del empleado."
    case "FORBIDDEN":
      return "No tienes permiso para realizar esta operación."
    case "CONFLICT":
      return "Los datos entran en conflicto con otra ficha. Revisa el documento y el correo antes de reintentar."
    case "UNAUTHENTICATED":
      return "La sesión no está disponible. Vuelve a iniciar sesión."
    case "NOT_FOUND":
      return "El empleado ya no está disponible. Cierra y vuelve al directorio."
    case "UNCONFIGURED":
      return "El servicio de personal no está disponible en este entorno."
    case "UNAVAILABLE":
      return "No se pudo conectar. Puedes reintentar."
    default:
      return "No se pudo confirmar la operación. Revisa el directorio antes de reintentar."
  }
}

/** A failure the user can only fix in one specific input of the employee form. */
export interface StaffFieldError {
  readonly field: "email" | "password"
  readonly message: string
}

/** Declarative mapping of the documented account markers to the input they belong to. */
export function staffFieldError(reason: StaffAccountFailureReason): StaffFieldError {
  switch (reason) {
    case "EMAIL_RESERVED":
      return {
        field: "email",
        message:
          "El correo ya pertenece a otra ficha o cuenta, incluso si está inactiva. Usa otro correo; no se creó ni fusionó otro empleado."
      }
    case "ACCOUNT_EMAIL_REQUIRED":
      return { field: "email", message: "La cuenta de acceso necesita el correo de la ficha." }
    case "ACCOUNT_PASSWORD_REQUIRED":
      return { field: "password", message: "La cuenta de acceso necesita una contraseña inicial." }
    case "ACCOUNT_PASSWORD_WITHOUT_ACCOUNT":
      return {
        field: "password",
        message: "Solo se envía una contraseña cuando se solicita la cuenta de acceso."
      }
  }
}
