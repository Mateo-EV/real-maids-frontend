import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { firstValueFrom, takeUntil } from "rxjs"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmDialogImports } from "@spartan-ng/helm/dialog"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { Customer } from "../../../domain/entities/customer.entity"
import { CustomersStore } from "../../state/customers.store"
import {
  customerDialogLifecycle,
  customerWriteError
} from "../customer-editor/customer-dialog-lifecycle"

export interface CustomerStatusContext {
  customer: Customer
  owner: DestroyRef
  onChanged: () => void
}

@Component({
  selector: "app-customer-status-dialog",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmDialogImports, HlmButtonImports, HlmAlertImports, HlmSpinnerImports],
  template: `
    <hlm-dialog-header>
      <h2 hlmDialogTitle>Desactivar cliente</h2>
      <p hlmDialogDescription>Confirma el cambio de estado del cliente seleccionado.</p>
    </hlm-dialog-header>
    <div class="my-3 rounded-lg border bg-muted p-3">
      <p class="break-words font-semibold">
        {{ context.customer.name }} · #{{ context.customer.id }}
      </p>
      <p class="break-all text-sm">{{ context.customer.email ?? "Correo no registrado" }}</p>
      <p class="mt-2 text-sm">Activo → Inactivo</p>
    </div>
    <p class="text-sm">
      El cliente pasará de activo a inactivo y dejará de aparecer en este listado de activos.
    </p>
    @if (error()) {
      <div hlmAlert variant="destructive" role="alert" class="my-4">
        <p hlmAlertTitle>No se confirmó el cambio</p>
        <p hlmAlertDescription>{{ error() }}</p>
      </div>
    }
    <hlm-dialog-footer class="mt-4 border-t pt-3">
      <button hlmBtn type="button" variant="outline" [disabled]="submitting()" (click)="cancel()">
        Cancelar
      </button>
      <button
        hlmBtn
        type="button"
        [disabled]="submitting()"
        [attr.aria-busy]="submitting()"
        (click)="confirm()"
      >
        @if (submitting()) {
          <hlm-spinner aria-label="Desactivando" />
        }
        {{ submitting() ? "Desactivando…" : "Confirmar desactivación" }}
      </button>
    </hlm-dialog-footer>
  `
})
export class CustomerStatusDialog {
  readonly context = injectBrnDialogContext<CustomerStatusContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly customers = inject(CustomersStore)
  readonly submitting = signal(false)
  readonly error = signal("")
  private readonly lifecycle = customerDialogLifecycle(
    () => this.cancel(),
    () => this.error.set(customerWriteError("UNAUTHENTICATED"))
  )

  async confirm(): Promise<void> {
    if (
      this.context.owner.destroyed ||
      !this.lifecycle.current() ||
      this.submitting() ||
      this.customers.writePending()
    )
      return
    this.submitting.set(true)
    this.error.set("")
    try {
      const result = await firstValueFrom(
        this.customers
          .setCustomerStatus({ customerId: this.context.customer.id, isActive: false })
          .pipe(
            takeUntil(this.lifecycle.cancelled$),
            takeUntilDestroyed(this.destroyRef),
            takeUntilDestroyed(this.context.owner)
          ),
        { defaultValue: undefined }
      )
      if (this.context.owner.destroyed || !this.lifecycle.current() || !result) return
      if (!result.success) this.error.set(customerWriteError(result.error.code))
      else {
        this.context.onChanged()
        if (this.lifecycle.current()) this.dialog.close()
      }
    } catch {
      if (this.lifecycle.current()) this.error.set(customerWriteError("UNEXPECTED"))
    } finally {
      if (!this.destroyRef.destroyed) this.submitting.set(false)
    }
  }
  cancel(): void {
    if (!this.destroyRef.destroyed && !this.submitting() && this.dialog.open) this.dialog.close()
  }
}
