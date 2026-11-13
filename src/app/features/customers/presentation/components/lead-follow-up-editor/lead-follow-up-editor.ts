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
import { firstValueFrom, Observable, takeUntil } from "rxjs"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmDialogImports } from "@spartan-ng/helm/dialog"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmFieldImports } from "@spartan-ng/helm/field"
import { HlmTextareaImports } from "@spartan-ng/helm/textarea"
import { HlmNativeSelectImports } from "@spartan-ng/helm/native-select"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { Lead } from "../../../domain/entities/lead.entity"
import { FunnelStage } from "../../../domain/entities/funnel-stage.entity"
import { CustomerAcquisitionStore } from "../../state/customer-acquisition.store"
import {
  customerDialogLifecycle,
  customerWriteError
} from "../customer-editor/customer-dialog-lifecycle"

interface FollowUpContext {
  lead: Lead
  owner: DestroyRef
  stopped$: Observable<void>
  current: () => boolean
  onSaved: () => void
}
/** Relación de una etapa del catálogo con la etapa actual del prospecto. */
type StageRelation = "actual" | "paralela" | "siguiente" | "retroceso" | "salto" | "desconocida"
@Component({
  selector: "app-lead-follow-up-editor",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormField,
    FormRoot,
    HlmDialogImports,
    HlmButtonImports,
    HlmFieldImports,
    HlmTextareaImports,
    HlmNativeSelectImports,
    HlmAlertImports,
    HlmSpinnerImports
  ],
  templateUrl: "./lead-follow-up-editor.html"
})
export class LeadFollowUpEditor implements OnInit {
  readonly context = injectBrnDialogContext<FollowUpContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly store = inject(CustomerAcquisitionStore)
  readonly stages = this.store.stages
  readonly error = signal("")
  readonly model = signal({ stageId: "", comment: "" })
  private readonly currentStage = computed(() =>
    (this.stages().data ?? []).find(stage => stage.id === this.context.lead.stageId)
  )
  /**
   * El orden del catálogo es un nivel, no un identificador: varias etapas pueden compartirlo.
   * El siguiente nivel es el menor orden estrictamente mayor que el de la etapa actual.
   */
  private readonly nextOrder = computed(() => {
    const actual = this.currentStage()
    if (!actual) return undefined
    const orders = (this.stages().data ?? [])
      .filter(stage => stage.order > actual.order)
      .map(stage => stage.order)
    return orders.length ? Math.min(...orders) : undefined
  })
  /**
   * La actual sólo registra; avanzar exige estar en el siguiente nivel (cualquiera de sus etapas),
   * retroceder exige motivo, un salto de nivel queda fuera del embudo y una hermana del mismo nivel
   * es el mismo paso del embudo y avanza sin motivo.
   * Si la etapa actual no está en el catálogo no se puede juzgar el orden y decide el servidor.
   */
  relation(stage: FunnelStage): StageRelation {
    const actual = this.currentStage()
    if (stage.id === this.context.lead.stageId) return "actual"
    if (!actual) return "desconocida"
    if (stage.order < actual.order) return "retroceso"
    if (stage.order === actual.order) return "paralela"
    return stage.order === this.nextOrder() ? "siguiente" : "salto"
  }
  relationOf(value: string): StageRelation {
    const stage = (this.stages().data ?? []).find(s => String(s.id) === value)
    return stage ? this.relation(stage) : "desconocida"
  }
  readonly retrocede = computed(() => this.relationOf(this.model().stageId) === "retroceso")
  stageLabel(stage: FunnelStage): string {
    const sufijo: Record<StageRelation, string> = {
      actual: " · Etapa actual (sólo registra)",
      paralela: " · Misma etapa del embudo",
      siguiente: " · Siguiente",
      retroceso: " · Retroceso (motivo obligatorio)",
      salto: " · Requiere avanzar una etapa por vez",
      desconocida: ""
    }
    return `${stage.name}${stage.isFinal ? " · Final" : ""}${sufijo[this.relation(stage)]}`
  }
  hasChoice(value: string): boolean {
    return !!this.stages().data?.some(stage => String(stage.id) === value)
  }
  private readonly stagesVerified = computed(() => {
    const entry = this.stages()
    return entry.loaded && !entry.error && !entry.pendingReads
  })
  /**
   * El catálogo verificado no trae la etapa actual del prospecto: el orden del embudo no se puede
   * juzgar, así que ni la relación ni el motivo obligatorio se pueden determinar. Sin salto, sin
   * retroceso y sin etapa de respaldo inventada: sólo refrescar el catálogo desbloquea el registro.
   */
  readonly stageUnknown = computed(() => this.stagesVerified() && !this.currentStage())
  private verifiedChoice(value: string): boolean {
    const entry = this.stages()
    return (
      entry.loaded &&
      !entry.error &&
      !entry.pendingReads &&
      /^[1-9]\d*$/.test(value) &&
      this.hasChoice(value)
    )
  }
  readonly profile = form(this.model, path => {
    validate(path.stageId, ({ value }) => {
      if (!this.verifiedChoice(value()))
        return {
          kind: "choice",
          message: "Selecciona una etapa verificada del catálogo disponible."
        }
      return this.relationOf(value()) === "salto"
        ? {
            kind: "orden",
            message: "Avanza una etapa por vez: elige la etapa inmediatamente siguiente."
          }
        : undefined
    })
    validate(path.comment, ({ value }) =>
      this.relationOf(this.model().stageId) === "retroceso" && !value().trim()
        ? {
            kind: "motivo",
            message: "Indica el motivo del retroceso: qué error o excepción lo motiva."
          }
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
  ngOnInit(): void {
    this.loadStages()
  }
  loadStages(force = false): void {
    if (!this.current() || this.profile().submitting()) return
    this.store
      .loadStages(force)
      .pipe(
        takeUntil(this.context.stopped$),
        takeUntil(this.lifecycle.cancelled$),
        takeUntilDestroyed(this.destroyRef),
        takeUntilDestroyed(this.context.owner)
      )
      .subscribe()
  }
  save(): Promise<boolean> {
    if (!this.current() || this.profile().submitting() || this.store.writing())
      return Promise.resolve(false)
    this.error.set("")
    return submit(this.profile, async () => {
      const value = this.model()
      if (!this.current() || !this.verifiedChoice(value.stageId)) return
      // Sin la etapa actual en el catálogo no hay orden que respetar ni motivo que exigir.
      if (this.stageUnknown()) return
      // Misma regla que el servidor: sin salto y con motivo cuando el paso es hacia atrás.
      if (this.relationOf(value.stageId) === "salto") return
      if (this.relationOf(value.stageId) === "retroceso" && !value.comment.trim()) return
      try {
        const result = await firstValueFrom(
          this.store
            .addFollowUp({
              leadId: this.context.lead.id,
              stageId: Number(value.stageId),
              comment: value.comment.trim() || null
            })
            .pipe(
              takeUntil(this.context.stopped$),
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
              ? "Revisa la etapa y el comentario."
              : result.error.code === "LEAD_NOT_FOUND"
                ? "El prospecto ya no está disponible. Cierra y vuelve a consultarlo."
                : result.error.code === "CONFLICT"
                  ? "No se pudo registrar por un conflicto. Revisa el prospecto antes de reintentar."
                  : customerWriteError(result.error.code)
          )
        else {
          this.context.onSaved()
          if (this.current()) this.dialog.close()
        }
      } catch {
        if (this.current())
          this.error.set(
            "No se pudo confirmar el registro. Consulta los seguimientos antes de reintentar."
          )
      }
    })
  }
  cancel(): void {
    if (!this.destroyRef.destroyed && !this.profile().submitting() && this.dialog.open)
      this.dialog.close()
  }
}
