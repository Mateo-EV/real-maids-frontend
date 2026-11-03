import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { form, FormField, FormRoot, submit, validate } from "@angular/forms/signals"
import { EMPTY, firstValueFrom, Observable, takeUntil } from "rxjs"
import { Lead } from "../../../domain/entities/lead.entity"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmDialogImports } from "@spartan-ng/helm/dialog"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmFieldImports } from "@spartan-ng/helm/field"
import { HlmInputImports } from "@spartan-ng/helm/input"
import { HlmTextareaImports } from "@spartan-ng/helm/textarea"
import { HlmNativeSelectImports } from "@spartan-ng/helm/native-select"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { CustomerAcquisitionStore } from "../../state/customer-acquisition.store"
import {
  customerDialogLifecycle,
  customerWriteError
} from "../customer-editor/customer-dialog-lifecycle"

export interface LeadEditorContext {
  owner: DestroyRef
  lead?: Lead
  ownerChanged$?: Observable<void>
  current: () => boolean
  onSaved: () => void
}
@Component({
  selector: "app-lead-editor",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormField,
    FormRoot,
    HlmDialogImports,
    HlmButtonImports,
    HlmFieldImports,
    HlmInputImports,
    HlmTextareaImports,
    HlmNativeSelectImports,
    HlmAlertImports,
    HlmSpinnerImports
  ],
  templateUrl: "./lead-editor.html"
})
export class LeadEditor implements OnInit {
  readonly context = injectBrnDialogContext<LeadEditorContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly acquisition = inject(CustomerAcquisitionStore)
  readonly error = signal("")
  readonly target = this.context.lead
  private readonly ownerChanged$ = this.context.ownerChanged$ ?? EMPTY
  readonly model = signal({
    originId: this.target ? String(this.target.originId) : "",
    stageId: this.target ? String(this.target.stageId) : "",
    name: this.target?.name ?? "",
    email: this.target?.email ?? "",
    phone: this.target?.phone ?? "",
    referenceAddress: this.target?.referenceAddress ?? "",
    observation: this.target?.observation ?? ""
  })
  readonly textFields = [
    { key: "name", label: "Nombre (obligatorio)", help: "Hasta 120 caracteres.", type: "text" },
    {
      key: "email",
      label: "Correo electrónico (opcional)",
      help: "Correo válido de hasta 120 caracteres.",
      type: "email"
    },
    { key: "phone", label: "Teléfono (opcional)", help: "Hasta 30 caracteres.", type: "tel" },
    {
      key: "referenceAddress",
      label: "Dirección de referencia (opcional)",
      help: "Hasta 200 caracteres.",
      type: "text"
    },
    {
      key: "observation",
      label: "Observación (opcional)",
      help: "Texto libre. Los opcionales vacíos se guardan sin registrar.",
      type: "textarea"
    }
  ] as const
  readonly catalogs = computed(() => [
    {
      key: "originId" as const,
      name: "orígenes",
      label: "Origen",
      entry: this.acquisition.origins(),
      options:
        this.acquisition.origins().data?.map(o => ({
          id: o.id,
          label: `${o.name} · ID ${o.id} · ${o.isActive ? "Activo" : "Inactivo"}`
        })) ?? []
    },
    {
      key: "stageId" as const,
      name: "etapas",
      label: "Etapa",
      entry: this.acquisition.stages(),
      options:
        this.acquisition.stages().data?.map(s => ({
          id: s.id,
          label: `${s.name} · ID ${s.id}${s.isFinal ? " · Final" : ""}`
        })) ?? []
    }
  ])
  hasChoice(key: "originId" | "stageId", value: string): boolean {
    return this.catalogs()
      .find(c => c.key === key)!
      .options.some(o => String(o.id) === value)
  }
  private validChoice(key: "originId" | "stageId", value: string): boolean {
    const catalog = this.catalogs().find(c => c.key === key)!
    return (
      catalog.entry.loaded &&
      !catalog.entry.error &&
      !catalog.entry.loading &&
      !catalog.entry.refreshing &&
      /^[1-9]\d*$/.test(value) &&
      catalog.options.some(o => String(o.id) === value)
    )
  }
  readonly profile = form(this.model, path => {
    for (const key of ["originId", "stageId"] as const)
      validate(path[key], ({ value }) =>
        this.validChoice(key, value())
          ? undefined
          : { kind: "choice", message: "Selecciona una opción verificada del catálogo disponible." }
      )
    for (const [key, max] of [
      ["name", 120],
      ["email", 120],
      ["phone", 30],
      ["referenceAddress", 200]
    ] as const)
      validate(path[key], ({ value }) => {
        const text = value().trim()
        return key === "name" && !text
          ? { kind: "required", message: "Ingresa el nombre." }
          : text.length > max
            ? { kind: "maxLength", message: `Usa como máximo ${max} caracteres.` }
            : key === "email" && text && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)
              ? { kind: "email", message: "Ingresa un correo válido." }
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
  ngOnInit(): void {
    this.loadCatalog("originId")
    this.loadCatalog("stageId")
  }
  loadCatalog(key: "originId" | "stageId", force = false): void {
    if (!this.current() || this.profile().submitting()) return
    const read: Observable<unknown> =
      key === "originId" ? this.acquisition.loadOrigins(force) : this.acquisition.loadStages(force)
    read
      .pipe(
        takeUntil(this.ownerChanged$),
        takeUntil(this.lifecycle.cancelled$),
        takeUntilDestroyed(this.destroyRef),
        takeUntilDestroyed(this.context.owner)
      )
      .subscribe()
  }
  save(): Promise<boolean> {
    if (!this.current() || this.profile().submitting() || this.acquisition.writing())
      return Promise.resolve(false)
    this.error.set("")
    return submit(this.profile, async () => {
      const v = this.model()
      if (
        !this.current() ||
        !this.validChoice("originId", v.originId) ||
        !this.validChoice("stageId", v.stageId)
      )
        return
      try {
        const payload = {
          originId: Number(v.originId),
          stageId: Number(v.stageId),
          name: v.name.trim(),
          email: v.email.trim() || null,
          phone: v.phone.trim() || null,
          referenceAddress: v.referenceAddress.trim() || null,
          observation: v.observation.trim() || null
        }
        const write = this.target
          ? this.acquisition.updateLead({ id: this.target.id, ...payload })
          : this.acquisition.createLead(payload)
        const result = await firstValueFrom(
          write.pipe(
            takeUntil(this.ownerChanged$),
            takeUntil(this.lifecycle.cancelled$),
            takeUntilDestroyed(this.destroyRef),
            takeUntilDestroyed(this.context.owner)
          ),
          { defaultValue: undefined }
        )
        if (!this.current() || !result) return
        if (!result.success)
          this.error.set(
            result.error.code === "INVALID_INPUT"
              ? "Revisa los datos del prospecto."
              : result.error.code === "CONFLICT"
                ? "Los datos entran en conflicto. Revisa el prospecto antes de reintentar."
                : customerWriteError(result.error.code)
          )
        else {
          this.context.onSaved()
          if (this.current()) this.dialog.close()
        }
      } catch {
        if (this.current())
          this.error.set(
            "No se pudo confirmar el guardado. Consulta los prospectos antes de reintentar."
          )
      }
    })
  }
  cancel(): void {
    if (!this.destroyRef.destroyed && !this.profile().submitting() && this.dialog.open)
      this.dialog.close()
  }
}
