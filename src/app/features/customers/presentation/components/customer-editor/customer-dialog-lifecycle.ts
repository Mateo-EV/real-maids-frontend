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
