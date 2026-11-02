import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { firstValueFrom, Observable, takeUntil } from "rxjs"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmDialogImports } from "@spartan-ng/helm/dialog"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { Property } from "../../../domain/entities/property.entity"
import { CustomerPropertiesStore } from "../../state/customer-properties.store"
import {
  customerDialogLifecycle,
  customerWriteError
} from "../customer-editor/customer-dialog-lifecycle"

export interface PropertyStatusContext {
  customerId: number
  customerName: string
  property: Property
  isActive: boolean
  owner: DestroyRef
  ownerChanged$: Observable<void>
  current: () => boolean
  onChanged: () => void
}

@Component({
  selector: "app-property-status-dialog",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmDialogImports, HlmButtonImports, HlmAlertImports, HlmSpinnerImports],
  template: `
    <hlm-dialog-header>
      <h2 hlmDialogTitle>{{ context.isActive ? "Activar" : "Desactivar" }} propiedad</h2>
      <p hlmDialogDescription>Confirma el estado deseado de la propiedad seleccionada.</p>
    </hlm-dialog-header>
    <div class="my-3 rounded-lg border bg-muted p-3">
      <p class="break-words font-semibold">
        {{ context.customerName }} · #{{ context.customerId }}
      </p>
      <p class="break-words">
        {{ context.property.alias ?? "Sin alias" }} · #{{ context.property.id }}
      </p>
      <p class="break-words text-sm">{{ context.property.address }}</p>
      <p class="mt-2 text-sm">
        {{ context.property.isActive ? "Activa" : "Inactiva" }} →
        {{ context.isActive ? "Activa" : "Inactiva" }}
      </p>
    </div>
    <p class="text-sm">
      Se solicitará el estado indicado. La propiedad seguirá en la lista del cliente, que incluye
      inactivas.
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
          <hlm-spinner aria-label="Cambiando estado" />
        }
        {{
          submitting()
            ? "Confirmando…"
            : context.isActive
              ? "Confirmar activación"
              : "Confirmar desactivación"
        }}
      </button>
    </hlm-dialog-footer>
  `
})
export class PropertyStatusDialog {
  readonly context = injectBrnDialogContext<PropertyStatusContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly properties = inject(CustomerPropertiesStore)
  readonly submitting = signal(false)
  readonly error = signal("")
  private readonly lifecycle = customerDialogLifecycle(
    () => this.cancel(),
    () => this.error.set(customerWriteError("UNAUTHENTICATED"))
  )
  private current(): boolean {
    return (
      !this.context.owner.destroyed &&
      this.context.current() &&
      this.lifecycle.current() &&
      this.dialog.open
    )
  }
  async confirm(): Promise<void> {
    if (!this.current() || this.submitting() || this.properties.pendingWrites() > 0) return
    this.submitting.set(true)
    this.error.set("")
    try {
      const result = await firstValueFrom(
        this.properties
          .setPropertyStatus(
            this.context.customerId,
            this.context.property.id,
            this.context.isActive
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
      if (!result.success) {
        const code = result.error.code
        this.error.set(
          code === "PROPERTY_NOT_FOUND" || code === "NOT_FOUND"
            ? "La propiedad ya no está disponible. Cierra y vuelve a consultar."
            : code === "CONFLICT"
              ? "El estado entra en conflicto. Consulta la propiedad antes de reintentar."
              : code === "INVALID_INPUT"
                ? "No se pudo solicitar ese estado. Cierra y vuelve a consultar la propiedad."
                : code === "INVALID_RESPONSE"
                  ? "No se pudo verificar la respuesta. Consulta las propiedades antes de reintentar."
                  : customerWriteError(code)
        )
      } else {
        this.context.onChanged()
        if (this.current()) this.dialog.close()
      }
    } catch {
      if (this.current())
        this.error.set(
          "No se pudo confirmar el cambio. Consulta las propiedades antes de reintentar."
        )
    } finally {
      if (!this.destroyRef.destroyed) this.submitting.set(false)
    }
  }
  cancel(): void {
    if (!this.destroyRef.destroyed && !this.submitting() && this.dialog.open) this.dialog.close()
  }
}
