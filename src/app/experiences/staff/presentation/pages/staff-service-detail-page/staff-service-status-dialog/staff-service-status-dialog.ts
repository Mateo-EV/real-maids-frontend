import { Component, computed, DestroyRef, inject, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { form, FormField, FormRoot, submit, validate } from "@angular/forms/signals"
import { firstValueFrom, Observable, takeUntil } from "rxjs"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmAlert, HlmAlertDescription, HlmAlertTitle } from "@spartan-ng/helm/alert"
import { HlmButton } from "@spartan-ng/helm/button"
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle
} from "@spartan-ng/helm/dialog"
import {
  HlmField,
  HlmFieldDescription,
  HlmFieldError,
  HlmFieldLabel,
  HlmFieldLegend,
  HlmFieldSet
} from "@spartan-ng/helm/field"
import { HlmSpinner } from "@spartan-ng/helm/spinner"
import { HlmTextarea } from "@spartan-ng/helm/textarea"
import { customerDialogLifecycle } from "@/app/features/customers/presentation/components/customer-editor/customer-dialog-lifecycle"
import { ChangeOrderStatusUseCase } from "@/app/features/operations/application/use-cases/service-order-write.use-cases"
import { OperationsErrorCode } from "@/app/features/operations/domain/errors/operations.error"

/**
 * The only two moves an assigned collaborator can make, offered by the state the server supplied.
 * They are not a client-side transition table or a permission claim: the server still validates
 * every attempt (including "not before the programmed date") and the frontend only shows the code
 * it was given.
 */
export type StaffServiceStatusTarget = "EN_PROCESO" | "COMPLETADA"

/** Captured, non-sensitive context of the verified record; nothing is re-read from the store here. */
export interface StaffServiceStatusOrder {
  readonly id: number
  readonly code: string
  readonly propertyName: string
  readonly status: string
  readonly statusName: string
}

export interface StaffServiceStatusDialogContext {
  order: StaffServiceStatusOrder
  target: StaffServiceStatusTarget
  owner: DestroyRef
  ownerChanged$: Observable<void>
  current: () => boolean
  /** Confirmed success: the owner emits one confirmation and forces exactly one fresh read. */
  onChanged: () => void
  /** The backend answered 404: the owner falls back to its definitive absence state. */
  onMissing: () => void
}

const maxObservation = 250

function statusWriteError(code: OperationsErrorCode, target: StaffServiceStatusTarget): string {
  const move = target === "EN_PROCESO" ? "iniciar el servicio" : "completar el servicio"
  switch (code) {
    case "FORBIDDEN":
      return `No tienes permiso para ${move}.`
    case "INVALID_DATA":
      return "El servidor rechazó el cambio de estado. Revisa el estado actual del servicio antes de reintentar."
    case "CONFLICT":
      return "El servicio cambió o está en conflicto. Consulta su estado antes de reintentar."
    case "UNAUTHENTICATED":
      return "La sesión no está disponible. Vuelve a iniciar sesión."
    case "UNCONFIGURED":
      return "El servicio de órdenes no está disponible en este entorno."
    default:
      return "No se pudo confirmar el cambio. Consulta el estado antes de reintentar; la operación pudo haberse procesado."
  }
}

/**
 * WP11 T4 / S1–S2 — confirmation for the two execution moves of an assigned service.
 *
 * The dialog names the service (code and property) and the current → desired state, takes the
 * documented optional observation (250 characters, trimmed, blank becomes `null`) and dispatches
 * only `ChangeOrderStatusUseCase`. It never builds a URL, never retries on its own, never patches
 * the record optimistically and never presents a cancellation as an undo. Pending state blocks a
 * duplicate submit and every user dismissal; a server refusal (400 business rule, 403 not assigned,
 * 409, network) keeps the same confirmation open for an explicit retry with safe, project-owned
 * copy instead of raw backend text.
 */
@Component({
  selector: "app-staff-service-status-dialog",
  imports: [
    FormField,
    FormRoot,
    HlmAlert,
    HlmAlertDescription,
    HlmAlertTitle,
    HlmButton,
    HlmDialogDescription,
    HlmDialogFooter,
    HlmDialogHeader,
    HlmDialogTitle,
    HlmField,
    HlmFieldDescription,
    HlmFieldError,
    HlmFieldLabel,
    HlmFieldLegend,
    HlmFieldSet,
    HlmSpinner,
    HlmTextarea
  ],
  templateUrl: "./staff-service-status-dialog.html"
})
export class StaffServiceStatusDialog {
  readonly context = injectBrnDialogContext<StaffServiceStatusDialogContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly changeStatus = inject(ChangeOrderStatusUseCase)
  readonly error = signal("")
  readonly model = signal({ observation: "" })
  readonly profile = form(this.model, path => {
    validate(path.observation, ({ value }) =>
      value().trim().length <= maxObservation
        ? undefined
        : {
            kind: "observation",
            message: `La observación admite como máximo ${maxObservation} caracteres.`
          }
    )
  })
  readonly targetName = computed(() =>
    this.context.target === "EN_PROCESO" ? "En proceso" : "Completada"
  )
  readonly title = computed(() =>
    this.context.target === "EN_PROCESO" ? "Iniciar servicio" : "Completar servicio"
  )
  /** Local pending gate: a staged submission already blocks every other action of this dialog. */
  readonly pending = computed(() => this.profile().submitting())
  private readonly lifecycle = customerDialogLifecycle(
    () => this.cancel(),
    () => this.error.set("La sesión no está disponible. Vuelve a iniciar sesión.")
  )
  private current(): boolean {
    return (
      !this.context.owner.destroyed &&
      this.context.current() &&
      this.lifecycle.current() &&
      this.dialog.open
    )
  }
  save(): Promise<boolean> {
    if (!this.current() || this.pending()) return Promise.resolve(false)
    this.error.set("")
    return submit(this.profile, async () => {
      const observation = this.model().observation.trim()
      // Never dispatch an out-of-bounds body; the form validation already blocks it.
      if (observation.length > maxObservation || !this.current()) return
      try {
        const result = await firstValueFrom(
          this.changeStatus
            .execute(this.context.order.id, {
              // The desired code travels untouched: the transition stays server-owned.
              status: this.context.target,
              observation: observation || null
            })
            .pipe(
              takeUntil(this.context.ownerChanged$),
              takeUntil(this.lifecycle.cancelled$),
              takeUntilDestroyed(this.destroyRef),
              takeUntilDestroyed(this.context.owner)
            ),
          { defaultValue: undefined }
        )
        if (!this.current() || !result) return
        if (!result.success) {
          if (result.error.code === "NOT_FOUND") {
            // Authoritative: the order is gone or outside this caller's scope.
            this.context.onMissing()
            if (this.current()) this.dialog.close()
            return
          }
          this.error.set(statusWriteError(result.error.code, this.context.target))
          return
        }
        this.context.onChanged()
        if (this.current()) this.dialog.close()
      } catch {
        if (this.current()) this.error.set(statusWriteError("UNKNOWN", this.context.target))
      }
    })
  }
  cancel(): void {
    if (!this.destroyRef.destroyed && !this.pending() && this.dialog.open) this.dialog.close()
  }
}
