import { Component, computed, DestroyRef, inject, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { form, FormField, FormRoot, submit, validate } from "@angular/forms/signals"
import { firstValueFrom, takeUntil } from "rxjs"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmDialogImports } from "@spartan-ng/helm/dialog"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmFieldImports } from "@spartan-ng/helm/field"
import { HlmInputImports } from "@spartan-ng/helm/input"
import { HlmNativeSelectImports } from "@spartan-ng/helm/native-select"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { customerDialogLifecycle } from "@/app/features/customers/presentation/components/customer-editor/customer-dialog-lifecycle"
import { GetActiveReschedulingReasonsUseCase } from "../../../application/use-cases/service-order-read.use-cases"
import { ReschedulingReasonSummary } from "../../../domain/models/operations-read.models"
import { ServiceOrdersStore } from "../../state/service-orders.store"
import {
  ServiceOrderWriteDialogContext,
  orderCivilDate,
  orderClock,
  orderWriteError
} from "../service-order-write-dialog-context"

@Component({
  selector: "app-service-order-schedule-dialog",
  imports: [
    FormField,
    FormRoot,
    HlmDialogImports,
    HlmButtonImports,
    HlmFieldImports,
    HlmInputImports,
    HlmNativeSelectImports,
    HlmAlertImports,
    HlmSpinnerImports
  ],
  templateUrl: "./service-order-schedule-dialog.html"
})
export class ServiceOrderScheduleDialog {
  readonly context = injectBrnDialogContext<ServiceOrderWriteDialogContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly store = inject(ServiceOrdersStore)
  private readonly reasonsUseCase = inject(GetActiveReschedulingReasonsUseCase)
  readonly reasons = signal<readonly ReschedulingReasonSummary[]>([])
  readonly reasonsLoading = signal(false)
  readonly reasonsError = signal("")
  readonly reasonsVerified = signal(false)
  readonly error = signal("")
  readonly model = signal({
    date: this.context.order.schedule?.date ?? "",
    startTime: this.context.order.schedule?.startTime ?? "",
    endTime: this.context.order.schedule?.endTime ?? "",
    reasonId: ""
  })
  readonly profile = form(this.model, path => {
    validate(path.date, ({ value }) =>
      orderCivilDate(value())
        ? undefined
        : { kind: "date", message: "Escribe una fecha real AAAA-MM-DD." }
    )
    validate(path.startTime, ({ value }) =>
      orderClock(value())
        ? undefined
        : { kind: "clock", message: "Escribe una hora HH:mm, con segundos opcionales." }
    )
    validate(path.endTime, ({ value }) =>
      !value() || orderClock(value())
        ? undefined
        : { kind: "clock", message: "Revisa la hora de fin." }
    )
  })
  readonly missingReason = computed(
    () =>
      !!this.model().reasonId &&
      !this.reasons().some(reason => String(reason.id) === this.model().reasonId)
  )
  readonly pending = computed(() => this.profile().submitting() || this.store.writing())
  private readonly lifecycle = customerDialogLifecycle(
    () => this.cancel(),
    () => this.error.set(orderWriteError("UNAUTHENTICATED"))
  )
  constructor() {
    queueMicrotask(() => {
      if (this.current()) void this.loadReasons()
    })
  }
  private current(): boolean {
    return (
      !this.context.owner.destroyed &&
      this.context.current() &&
      this.lifecycle.current() &&
      this.dialog.open
    )
  }
  async loadReasons(): Promise<void> {
    if (!this.current() || this.reasonsLoading() || this.pending()) return
    this.reasonsLoading.set(true)
    this.reasonsVerified.set(false)
    this.reasonsError.set("")
    try {
      const result = await firstValueFrom(
        this.reasonsUseCase
          .execute()
          .pipe(
            takeUntil(this.context.ownerChanged$),
            takeUntil(this.lifecycle.cancelled$),
            takeUntilDestroyed(this.destroyRef),
            takeUntilDestroyed(this.context.owner)
          ),
        { defaultValue: undefined }
      )
      if (!this.current()) return
      if (result?.success) {
        this.reasons.set(result.data)
        this.reasonsVerified.set(true)
      } else this.reasonsError.set("No se pudieron consultar los motivos activos.")
    } catch {
      if (this.current()) this.reasonsError.set("No se pudieron consultar los motivos activos.")
    } finally {
      if (this.current()) this.reasonsLoading.set(false)
    }
  }
  save(): Promise<boolean> {
    if (!this.current() || this.pending()) return Promise.resolve(false)
    this.error.set("")
    return submit(this.profile, async () => {
      const value = this.model()
      const reasonId = value.reasonId === "" ? null : Number(value.reasonId)
      if (
        reasonId !== null &&
        (!this.reasonsVerified() ||
          this.reasonsLoading() ||
          this.reasonsError() ||
          !this.reasons().some(reason => reason.id === reasonId))
      ) {
        this.error.set("Selecciona un motivo activo verificado o deja el campo sin seleccionar.")
        return
      }
      if (!this.current() || this.store.writing()) return
      try {
        const result = await firstValueFrom(
          this.store
            .scheduleOrder(
              this.context.order.id,
              {
                date: value.date,
                startTime: value.startTime,
                endTime: value.endTime || null,
                reasonId
              },
              this.context.order.customerId
            )
            .pipe(
              takeUntil(this.context.ownerChanged$),
              takeUntil(this.lifecycle.cancelled$),
              takeUntilDestroyed(this.destroyRef),
              takeUntilDestroyed(this.context.owner)
            ),
          { defaultValue: undefined }
        )
        if (!this.current() || !result) return
        if (!result.success) this.error.set(orderWriteError(result.error.code))
        else {
          this.context.onSaved()
          if (this.current()) this.dialog.close()
        }
      } catch {
        if (this.current()) this.error.set(orderWriteError("UNKNOWN"))
      }
    })
  }
  cancel(): void {
    if (!this.destroyRef.destroyed && !this.pending() && this.dialog.open) this.dialog.close()
  }
}
