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
import { HlmTextareaImports } from "@spartan-ng/helm/textarea"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { Property } from "../../../domain/entities/property.entity"
import { CreatePropertyParams } from "../../../domain/params/property.params"
import { CustomerPropertiesStore } from "../../state/customer-properties.store"
import {
  customerDialogLifecycle,
  customerWriteError
} from "../customer-editor/customer-dialog-lifecycle"

export interface PropertyEditorContext {
  customerId: number
  customerName: string
  property: Property | null
  owner: DestroyRef
  ownerChanged$: Observable<void>
  current: () => boolean
  onSaved: () => void
}

@Component({
  selector: "app-property-editor",
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
    HlmTextareaImports,
    HlmAlertImports,
    HlmSpinnerImports
  ],
  templateUrl: "./property-editor.html"
})
export class PropertyEditor {
  readonly context = injectBrnDialogContext<PropertyEditorContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly properties = inject(CustomerPropertiesStore)
  readonly error = signal("")
  readonly model = signal({
    alias: this.context.property?.alias ?? "",
    address: this.context.property?.address ?? "",
    city: this.context.property?.city ?? "",
    region: this.context.property?.region ?? "",
    postalCode: this.context.property?.postalCode ?? "",
    areaM2: this.context.property?.areaM2 ?? "",
    roomCount: this.context.property?.roomCount?.toString() ?? "",
    bathroomCount: this.context.property?.bathroomCount?.toString() ?? "",
    accessInstructions: this.context.property?.accessInstructions ?? "",
    doorCode: this.context.property?.doorCode ?? "",
    hasPets: this.context.property?.hasPets ?? false
  })
  readonly profile = form(this.model, path => {
    disabled(path.hasPets, () => this.properties.pendingWrites() > 0)
    validate(path.address, ({ value }) =>
      !value().trim() ? { kind: "required", message: "Ingresa la dirección." } : undefined
    )
    for (const [key, max] of [
      ["alias", 80],
      ["address", 200],
      ["city", 80],
      ["region", 80],
      ["postalCode", 15],
      ["accessInstructions", 2000],
      ["doorCode", 30]
    ] as const)
      validate(path[key], ({ value }) =>
        value().trim().length > max
          ? { kind: "maxLength", message: `Usa como máximo ${max} caracteres.` }
          : undefined
      )
    validate(path.postalCode, ({ value }) =>
      value().trim() && !/^[A-Za-z0-9 -]{3,15}$/.test(value().trim())
        ? { kind: "postal", message: "Usa de 3 a 15 letras, números, espacios o guiones." }
        : undefined
    )
    validate(path.areaM2, ({ value }) => {
      const v = value().trim()
      // Validate bounded hundredths without parsing arbitrary floating-point input.
      const [whole, fraction = ""] = v.split(".")
      const hundredths = Number(whole) * 100 + Number(fraction.padEnd(2, "0"))
      return v && (!/^\d{1,6}(?:\.\d{1,2})?$/.test(v) || hundredths < 100 || hundredths > 99999999)
        ? { kind: "area", message: "Ingresa de 1 a 999999.99 m², con hasta dos decimales y punto." }
        : undefined
    })
    for (const [key, max] of [
      ["roomCount", 200],
      ["bathroomCount", 100]
    ] as const)
      validate(path[key], ({ value }) => {
        const v = value().trim()
        return v && (!/^\d+$/.test(v) || !Number.isSafeInteger(Number(v)) || Number(v) > max)
          ? { kind: "count", message: `Ingresa un entero de 0 a ${max}, o deja vacío.` }
          : undefined
      })
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
    if (!this.current() || this.profile().submitting() || this.properties.pendingWrites() > 0)
      return Promise.resolve(false)
    this.error.set("")
    return submit(this.profile, async () => {
      const v = this.model()
      const params: CreatePropertyParams = {
        alias: v.alias.trim() || null,
        address: v.address.trim(),
        city: v.city.trim() || null,
        region: v.region.trim() || null,
        postalCode: v.postalCode.trim() || null,
        areaM2: v.areaM2.trim() || null,
        roomCount: v.roomCount.trim() ? Number(v.roomCount.trim()) : null,
        bathroomCount: v.bathroomCount.trim() ? Number(v.bathroomCount.trim()) : null,
        accessInstructions: v.accessInstructions.trim() || null,
        doorCode: v.doorCode.trim() || null,
        hasPets: v.hasPets
      }
      try {
        const request = this.context.property
          ? this.properties.updateProperty(this.context.customerId, {
              id: this.context.property.id,
              ...params
            })
          : this.properties.createProperty(this.context.customerId, params)
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
            result.error.code === "PROPERTY_NOT_FOUND"
              ? "La propiedad ya no está disponible. Cierra y vuelve a consultar."
              : result.error.code === "INVALID_INPUT"
                ? "Revisa los datos de la propiedad."
                : result.error.code === "CONFLICT"
                  ? "Los datos entran en conflicto. Revisa la propiedad antes de reintentar."
                  : customerWriteError(result.error.code)
          )
        else {
          this.context.onSaved()
          if (this.current()) this.dialog.close()
        }
      } catch {
        if (this.current())
          this.error.set(
            "No se pudo confirmar el guardado. Consulta las propiedades antes de reintentar."
          )
      }
    })
  }
  cancel(): void {
    if (!this.destroyRef.destroyed && !this.profile().submitting() && this.dialog.open)
      this.dialog.close()
  }
}
