import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from "@angular/core"
import { NgTemplateOutlet } from "@angular/common"
import { disabled, form, FormField, FormRoot, submit, validate } from "@angular/forms/signals"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { firstValueFrom, Observable, takeUntil } from "rxjs"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmDialogImports } from "@spartan-ng/helm/dialog"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmFieldImports } from "@spartan-ng/helm/field"
import { HlmInputImports } from "@spartan-ng/helm/input"
import { HlmCheckboxImports } from "@spartan-ng/helm/checkbox"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { CustomerContact } from "../../../domain/entities/customer-contact.entity"
import { CreateCustomerContactParams } from "../../../domain/params/customer-relations.params"
import { CustomerRelationsStore } from "../../state/customer-relations.store"
import {
  customerDialogLifecycle,
  customerWriteError
} from "../customer-editor/customer-dialog-lifecycle"

export interface ContactEditorContext {
  customerId: number
  customerName: string
  contact: CustomerContact | null
  owner: DestroyRef
  ownerChanged$: Observable<void>
  current: () => boolean
  onSaved: () => void
}
@Component({
  selector: "app-contact-editor",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    FormField,
    FormRoot,
    HlmDialogImports,
    HlmButtonImports,
    HlmFieldImports,
    HlmInputImports,
    HlmCheckboxImports,
    HlmAlertImports,
    HlmSpinnerImports
  ],
  templateUrl: "./contact-editor.html"
})
export class ContactEditor {
  readonly context = injectBrnDialogContext<ContactEditorContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly relations = inject(CustomerRelationsStore)
  readonly error = signal("")
  readonly model = signal({
    name: this.context.contact?.name ?? "",
    position: this.context.contact?.position ?? "",
    email: this.context.contact?.email ?? "",
    phone: this.context.contact?.phone ?? "",
    isPrimary: this.context.contact?.isPrimary ?? false,
    isActive: this.context.contact?.isActive ?? true
  })
  readonly profile = form(this.model, path => {
    disabled(path.isPrimary, () => this.relations.pendingContactWrites() > 0)
    disabled(path.isActive, () => this.relations.pendingContactWrites() > 0)
    validate(path.name, ({ value }) =>
      !value().trim() ? { kind: "required", message: "Ingresa el nombre." } : undefined
    )
    for (const [key, max] of [
      ["name", 120],
      ["position", 80],
      ["email", 120],
      ["phone", 30]
    ] as const)
      validate(path[key], ({ value }) =>
        value().trim().length > max
          ? { kind: "maxLength", message: `Usa como máximo ${max} caracteres.` }
          : undefined
      )
    validate(path.email, ({ value }) =>
      value().trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value().trim())
        ? { kind: "email", message: "Ingresa un correo válido." }
        : undefined
    )
  })
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
  save(): Promise<boolean> {
    if (!this.current() || this.profile().submitting() || this.relations.pendingContactWrites() > 0)
      return Promise.resolve(false)
    this.error.set("")
    return submit(this.profile, async () => {
      const v = this.model()
      const params: CreateCustomerContactParams = {
        name: v.name.trim(),
        position: v.position.trim() || null,
        email: v.email.trim() || null,
        phone: v.phone.trim() || null,
        isPrimary: v.isPrimary,
        isActive: v.isActive
      }
      try {
        const request = this.context.contact
          ? this.relations.updateContact(this.context.customerId, {
              id: this.context.contact.id,
              ...params
            })
          : this.relations.createContact(this.context.customerId, params)
        const result = await firstValueFrom(
          request.pipe(
            takeUntil(this.context.ownerChanged$),
            takeUntil(this.lifecycle.cancelled$),
            takeUntilDestroyed(this.destroyRef),
            takeUntilDestroyed(this.context.owner)
          ),
          { defaultValue: undefined }
        )
        if (!this.current() || !result) return
        if (!result.success)
          this.error.set(
            result.error.code === "NOT_FOUND"
              ? "El contacto ya no está disponible. Cierra y vuelve a consultar."
              : result.error.code === "INVALID_INPUT"
                ? "Revisa los datos del contacto."
                : result.error.code === "CONFLICT"
                  ? "Los datos entran en conflicto. Revisa el contacto antes de reintentar."
                  : customerWriteError(result.error.code)
          )
        else {
          this.context.onSaved()
          if (this.current()) this.dialog.close()
        }
      } catch {
        if (this.current())
          this.error.set(
            "No se pudo confirmar el guardado. Consulta los contactos antes de reintentar."
          )
      }
    })
  }
  cancel(): void {
    if (!this.destroyRef.destroyed && !this.profile().submitting() && this.dialog.open)
      this.dialog.close()
  }
}
