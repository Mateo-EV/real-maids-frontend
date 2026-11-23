import { Component, DestroyRef, computed, inject, OnInit, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { disabled, form, FormField, FormRoot, submit, validate } from "@angular/forms/signals"
import { firstValueFrom, Observable, takeUntil } from "rxjs"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmDialogImports } from "@spartan-ng/helm/dialog"
import { HlmFieldImports } from "@spartan-ng/helm/field"
import { HlmInputImports } from "@spartan-ng/helm/input"
import { HlmNativeSelectImports } from "@spartan-ng/helm/native-select"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { HlmTextareaImports } from "@spartan-ng/helm/textarea"
import { customerDialogLifecycle } from "@/app/features/customers/presentation/components/customer-editor/customer-dialog-lifecycle"
import { CrmEmail } from "../../../domain/entities/crm-email.entity"
import { CommunicationsErrorCode } from "../../../domain/errors/communications.error"
import { CrmTargetKind } from "../../../domain/params/crm-communications.params"
import { CrmCommunicationsStore } from "../../state/crm-communications.store"

export interface EmailComposerContext {
  kind: CrmTargetKind
  targetId: number
  targetName: string | null
  /** The address the server already holds for this record; the client never sends one. */
  recipient: string | null
  owner: DestroyRef
  ownerChanged$: Observable<void>
  current: () => boolean
  onSent: (email: CrmEmail) => void
}

/** A refused send is reported as an uncertain attempt: it is never retried by this dialog. */
export function emailSendError(code: CommunicationsErrorCode): string {
  switch (code) {
    case "FORBIDDEN":
      return "No tienes permiso para enviar correos."
    case "CONFLICT":
    case "INVALID_INPUT":
      return "El registro no tiene un correo válido o la solicitud fue rechazada. Revisa el correo del registro."
    case "UNAUTHENTICATED":
      return "La sesión no está disponible. Vuelve a iniciar sesión."
    case "NETWORK":
      return "No se pudo conectar. Revisa el historial de correos antes de reintentar."
    case "UNCONFIGURED":
      return "El envío de correos no está configurado en este entorno."
    default:
      return "No se pudo confirmar el envío. El intento pudo quedar registrado como fallido: revisa el historial de correos antes de reintentar."
  }
}

/**
 * Email composer (S4/S6/S8): one editable template copy, a subject and a body. Blank values fall back
 * to the chosen template, so they are not sent; without a template both are required. Only a
 * confirmed recorded delivery reaches the caller.
 */
@Component({
  selector: "app-email-composer",
  imports: [
    FormField,
    FormRoot,
    HlmAlertImports,
    HlmButtonImports,
    HlmDialogImports,
    HlmFieldImports,
    HlmInputImports,
    HlmNativeSelectImports,
    HlmSpinnerImports,
    HlmTextareaImports
  ],
  templateUrl: "./email-composer.html"
})
export class EmailComposer implements OnInit {
  readonly context = injectBrnDialogContext<EmailComposerContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly store = inject(CrmCommunicationsStore)
  readonly error = signal("")
  readonly templates = computed(() => this.store.selectTemplates())
  readonly model = signal({ templateId: "", subject: "", body: "" })
  readonly profile = form(this.model, path => {
    disabled(path.subject, () => this.store.writing())
    disabled(path.body, () => this.store.writing())
    validate(path.subject, ({ value }) => {
      if (this.model().templateId) return undefined
      return value().trim()
        ? undefined
        : { kind: "required", message: "Escribe el asunto o elige una plantilla." }
    })
    validate(path.body, ({ value }) => {
      if (this.model().templateId) return undefined
      return value().trim()
        ? undefined
        : { kind: "required", message: "Escribe el cuerpo o elige una plantilla." }
    })
  })
  private readonly lifecycle = customerDialogLifecycle(
    () => this.cancel(),
    () => this.error.set(emailSendError("UNAUTHENTICATED"))
  )
  ngOnInit(): void {
    if (!this.lifecycle.current()) return
    this.store.loadTemplates().pipe(takeUntilDestroyed(this.destroyRef)).subscribe()
  }
  private current(): boolean {
    return (
      !this.context.owner.destroyed &&
      this.context.current() &&
      this.lifecycle.current() &&
      this.dialog.open
    )
  }
  /** Picking a template copies its subject and body into the editable draft. */
  chooseTemplate(value: string | null | undefined): void {
    if (!this.current() || this.store.writing()) return
    const chosen = value ?? ""
    this.model.update(model => ({ ...model, templateId: chosen }))
    const template = this.templates().data?.find(item => String(item.id) === chosen)
    if (template)
      this.model.update(model => ({
        ...model,
        subject: template.subject ?? "",
        body: template.body
      }))
  }
  retryTemplates(): void {
    if (this.current())
      this.store.loadTemplates(true).pipe(takeUntilDestroyed(this.destroyRef)).subscribe()
  }
  save(): Promise<boolean> {
    if (!this.current() || this.profile().submitting() || this.store.writing()) {
      this.error.set("Espera a que termine la operación en curso.")
      return Promise.resolve(false)
    }
    this.error.set("")
    return submit(this.profile, async () => {
      const model = this.model()
      const target = { kind: this.context.kind, id: this.context.targetId }
      const templateId = model.templateId ? Number(model.templateId) : null
      try {
        const result = await firstValueFrom(
          this.store
            .sendEmail(target, {
              templateId,
              subject: model.subject.trim() || null,
              body: model.body.trim() || null
            })
            .pipe(
              takeUntil(this.context.ownerChanged$),
              takeUntil(this.lifecycle.cancelled$),
              takeUntilDestroyed(this.context.owner)
            ),
          { defaultValue: undefined }
        )
        if (!this.current() || !result) return
        if (!result.success) this.error.set(emailSendError(result.error.code))
        else {
          this.context.onSent(result.data)
          if (this.current()) this.dialog.close()
        }
      } catch {
        if (this.current()) this.error.set(emailSendError("UNEXPECTED"))
      }
    }).then(sent => {
      if (!sent && this.current())
        this.error.set("Revisa el asunto y el cuerpo, o elige una plantilla, antes de enviar.")
      return sent
    })
  }
  cancel(): void {
    if (!this.destroyRef.destroyed && !this.profile().submitting() && this.dialog.open)
      this.dialog.close()
  }
}
