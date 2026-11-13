import { CheckLeadEmailUseCase } from "../../../application/use-cases/acquisition.use-cases"
import { Subscription } from "rxjs"
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
import { Result } from "@/app/shared/utils/result"
import { Lead } from "../../../domain/entities/lead.entity"
import { LeadEmailCheck } from "../../../domain/params/lead-email.params"
import { CustomerError } from "../../../domain/errors/customer.error"
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
  host: {
    class: "flex max-h-[calc(100dvh-4rem)] min-h-0 flex-col"
  },
  templateUrl: "./lead-editor.html"
})
export class LeadEditor implements OnInit {
  readonly context = injectBrnDialogContext<LeadEditorContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly acquisition = inject(CustomerAcquisitionStore)
  private readonly emailLookup = inject(CheckLeadEmailUseCase)
  private emailSubscription?: Subscription
  readonly emailCheck = signal<{
    key: string
    loading: boolean
    error: boolean
    customerExists: boolean
    leadExists: boolean
  } | null>(null)
  readonly visibleEmailCheck = computed(() => {
    const state = this.emailCheck()
    return state?.key === this.model().email.trim().toLowerCase() ? state : null
  })
  readonly emailConflict = computed(() => {
    const check = this.visibleEmailCheck()
    return check && this.isBlocking(check) ? check : null
  })
  readonly emailBlocked = computed(() => this.emailConflict() !== null)
  readonly emailConflictMessage = computed(() => {
    const check = this.emailConflict()
    if (!check) return ""
    return check.customerExists && check.leadExists
      ? "Este correo ya está registrado en un cliente y en otro prospecto."
      : check.customerExists
        ? "Este correo ya está registrado en un cliente."
        : "Otro prospecto ya usa este correo."
  })
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
    observation: this.target?.observation ?? "",
    // Sólo lo envía la edición cuando la etapa cambia; la creación no lo manda.
    motivo: ""
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
          label: `${o.name} · ${o.isActive ? "Activo" : "Inactivo"}`
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
          label: `${s.name}${s.isFinal ? " · Final" : ""}`
        })) ?? []
    }
  ])
  private readonly stageCatalog = computed(() => this.acquisition.stages().data ?? [])
  private readonly currentStage = computed(() => {
    const target = this.target
    return target ? this.stageCatalog().find(stage => stage.id === target.stageId) : undefined
  })
  private readonly selectedStage = computed(() =>
    this.stageCatalog().find(stage => String(stage.id) === this.model().stageId)
  )
  /** Nivel siguiente: el menor orden estrictamente mayor que el de la etapa actual. */
  private readonly nextStageOrder = computed(() => {
    const actual = this.currentStage()
    if (!actual) return undefined
    const orders = this.stageCatalog()
      .filter(stage => stage.order > actual.order)
      .map(stage => stage.order)
    return orders.length ? Math.min(...orders) : undefined
  })
  /** Retroceso: la etapa elegida es de un nivel anterior y exige motivo. */
  readonly stageRetrocede = computed(() => {
    const actual = this.currentStage(),
      destino = this.selectedStage()
    return !!actual && !!destino && destino.order < actual.order
  })
  /** Salto: supera el siguiente nivel del embudo (puede tener varias etapas) y el servidor lo rechaza. */
  readonly stageSalta = computed(() => {
    const actual = this.currentStage(),
      destino = this.selectedStage(),
      next = this.nextStageOrder()
    return !!actual && !!destino && next !== undefined && destino.order > next
  })
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
    validate(path.originId, ({ value }) =>
      this.validChoice("originId", value())
        ? undefined
        : { kind: "choice", message: "Selecciona una opción verificada del catálogo disponible." }
    )
    validate(path.stageId, ({ value }) => {
      if (!this.validChoice("stageId", value()))
        return {
          kind: "choice",
          message: "Selecciona una opción verificada del catálogo disponible."
        }
      return this.stageSalta()
        ? {
            kind: "orden",
            message: "Avanza una etapa por vez: elige la etapa inmediatamente siguiente."
          }
        : undefined
    })
    validate(path.motivo, ({ value }) =>
      this.stageRetrocede() && !value().trim()
        ? {
            kind: "motivo",
            message: "Indica el motivo del retroceso: qué error o excepción lo motiva."
          }
        : undefined
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
    this.checkEmail()
  }
  private validEmail(email: string): boolean {
    return email.length > 0 && email.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }
  private isBlocking(check: {
    key: string
    customerExists: boolean
    leadExists: boolean
  }): boolean {
    if (!check.customerExists && !check.leadExists) return false
    return (this.target?.email ?? "").trim().toLowerCase() !== check.key
  }
  private emailRequest(email: string): Observable<Result<LeadEmailCheck, CustomerError>> {
    return this.emailLookup
      .execute({ email, ...(this.target ? { excludeLeadId: this.target.id } : {}) })
      .pipe(
        takeUntil(this.ownerChanged$),
        takeUntil(this.lifecycle.cancelled$),
        takeUntilDestroyed(this.destroyRef),
        takeUntilDestroyed(this.context.owner)
      )
  }
  private async emailAllowed(): Promise<boolean> {
    if (!this.current()) return false
    const email = this.model().email.trim()
    if (!this.validEmail(email)) return true
    const key = email.toLowerCase()
    const known = this.emailCheck()
    if (known?.key === key && !known.loading) return !this.isBlocking(known)
    const result = await firstValueFrom(this.emailRequest(email), { defaultValue: undefined })
    if (!this.current() || this.model().email.trim().toLowerCase() !== key) return false
    if (!result || !result.success) return true
    const check = {
      key,
      loading: false,
      error: false,
      customerExists: result.data.customerExists,
      leadExists: result.data.leadExists
    }
    this.emailCheck.set(check)
    return !this.isBlocking(check)
  }
  resetEmailCheck(): void {
    this.emailSubscription?.unsubscribe()
    this.emailCheck.set(null)
  }
  checkEmail(): void {
    if (!this.current() || this.profile().submitting()) return
    const email = this.model().email.trim()
    this.resetEmailCheck()
    if (!this.validEmail(email)) return
    const key = email.toLowerCase()
    this.emailCheck.set({
      key,
      loading: true,
      error: false,
      customerExists: false,
      leadExists: false
    })
    this.emailSubscription = this.emailRequest(email).subscribe({
      next: result => {
        if (!this.current() || this.model().email.trim().toLowerCase() !== key) return
        this.emailCheck.set({
          key,
          loading: false,
          error: !result.success,
          customerExists: result.success && result.data.customerExists,
          leadExists: result.success && result.data.leadExists
        })
      },
      error: () => {
        if (this.current() && this.model().email.trim().toLowerCase() === key)
          this.emailCheck.set({
            key,
            loading: false,
            error: true,
            customerExists: false,
            leadExists: false
          })
      }
    })
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
      if (!this.current() || !(await this.emailAllowed())) return
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
        // El motivo sólo acompaña un cambio real de etapa: sin transición el servidor no registra
        // seguimiento y el campo no debe inventar uno.
        const cambioEtapa = !!this.target && String(this.target.stageId) !== v.stageId
        const write = this.target
          ? this.acquisition.updateLead({
              id: this.target.id,
              ...payload,
              comentarioSeguimiento: cambioEtapa ? v.motivo.trim() || null : null
            })
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
