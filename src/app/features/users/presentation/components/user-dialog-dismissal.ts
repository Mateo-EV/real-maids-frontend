import { DialogRef as CdkDialogRef } from "@angular/cdk/dialog"
import { DestroyRef, inject } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { filter, merge, tap } from "rxjs"

/** Native dismissal stays disabled; every user dismissal uses the component's Cancel guard. */
export function connectUserDialogDismissal(destroyRef: DestroyRef, cancel: () => void): void {
  const overlay = inject(CdkDialogRef).overlayRef
  const escape = overlay.keydownEvents().pipe(
    filter(
      event =>
        event.key === "Escape" &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey
    ),
    tap(event => event.preventDefault())
  )
  merge(overlay.backdropClick(), overlay.outsidePointerEvents(), escape)
    .pipe(takeUntilDestroyed(destroyRef))
    .subscribe(() => cancel())
}
