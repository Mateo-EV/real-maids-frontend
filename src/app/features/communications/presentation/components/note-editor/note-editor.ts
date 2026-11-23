import { Component, DestroyRef, inject, signal } from "@angular/core"
import { disabled, form, FormField, FormRoot, submit, validate } from "@angular/forms/signals"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { firstValueFrom, Observable, takeUntil } from "rxjs"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmDialogImports } from "@spartan-ng/helm/dialog"
import { HlmFieldImports } from "@spartan-ng/helm/field"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { HlmTextareaImports } from "@spartan-ng/helm/textarea"
import { customerDialogLifecycle } from "@/app/features/customers/presentation/components/customer-editor/customer-dialog-lifecycle"
import { CrmNote } from "../../../domain/entities/crm-note.entity"
import { CommunicationsErrorCode } from "../../../domain/errors/communications.error"
import { CrmTargetKind } from "../../../domain/params/crm-communications.params"
import { CrmCommunicationsStore } from "../../state/crm-communications.store"

export interface NoteEditorContext {
  kind: CrmTargetKind
  targetId: number
  targetName: string | null
  note: CrmNote | null
  owner: DestroyRef
  ownerChanged$: Observable<void>
  current: () => boolean
  onSaved: () => void
}

/** Documented content limit for one note. */
export const noteContentMax = 4000

/** Note content is trimmed before it travels; blank or over-long input never dispatches. */
export function noteWriteError(code: CommunicationsErrorCode): string {
  switch (code) {
    case "FORBIDDEN":
      return "No tienes permiso para guardar esta nota. Solo su autor puede editarla."
    case "NOT_FOUND":
      return "La nota ya no está disponible. Vuelve a consultar las notas."
    case "INVALID_INPUT":
      return "Revisa el contenido de la nota."
    case "UNAUTHENTICATED":
      return "La sesión no está disponible. Vuelve a iniciar sesión."
    case "CONFLICT":
      return "La nota entró en conflicto. Vuelve a consultar las notas antes de reintentar."
    case "NETWORK":
      return "No se pudo conectar. Puedes reintentar."
    case "UNCONFIGURED":
      return "El servicio de comunicaciones no está disponible en este entorno."
    default:
      return "No se pudo confirmar el guardado. Consulta las notas antes de reintentar."
  }
}

/**
 * Note create/edit dialog. One content field, the captured record as context, and the shared dialog
 * lifecycle: pending blocks duplicates and dismissal, a refusal keeps the draft, and success alone
 * reaches the caller.
 */
@Component({
  selector: "app-note-editor",
  imports: [
    FormField,
    FormRoot,
    HlmAlertImports,
    HlmButtonImports,
    HlmDialogImports,
    HlmFieldImports,
    HlmSpinnerImports,
    HlmTextareaImports
  ],
  templateUrl: "./note-editor.html"
})
export class NoteEditor {
  readonly context = injectBrnDialogContext<NoteEditorContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly store = inject(CrmCommunicationsStore)
  readonly error = signal("")
  readonly model = signal({ content: this.context.note?.content ?? "" })
  readonly profile = form(this.model, path => {
    disabled(path.content, () => this.store.writing())
    validate(path.content, ({ value }) => {
      const content = value().trim()
      if (!content) return { kind: "required", message: "Escribe el contenido de la nota." }
      return content.length > noteContentMax
        ? {
            kind: "maxLength",
            message: `Usa como máximo ${noteContentMax} caracteres.`
          }
        : undefined
    })
  })
  private readonly lifecycle = customerDialogLifecycle(
    () => this.cancel(),
    () => this.error.set(noteWriteError("UNAUTHENTICATED"))
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
    if (!this.current() || this.profile().submitting() || this.store.writing()) {
      this.error.set("Espera a que termine la operación en curso.")
      return Promise.resolve(false)
    }
    this.error.set("")
    return submit(this.profile, async () => {
      const content = this.model().content.trim()
      const target = { kind: this.context.kind, id: this.context.targetId }
      try {
        const result = await firstValueFrom(
          (this.context.note
            ? this.store.updateNote(target, { id: this.context.note.id, content })
            : this.store.createNote(target, { content })
          ).pipe(
            takeUntil(this.context.ownerChanged$),
            takeUntil(this.lifecycle.cancelled$),
            takeUntilDestroyed(this.context.owner)
          ),
          { defaultValue: undefined }
        )
        if (!this.current() || !result) return
        if (!result.success) this.error.set(noteWriteError(result.error.code))
        else {
          this.context.onSaved()
          if (this.current()) this.dialog.close()
        }
      } catch {
        if (this.current())
          this.error.set(
            "No se pudo confirmar el guardado. Consulta las notas antes de reintentar."
          )
      }
    }).then(saved => {
      // `submit` refuses to run the action on invalid input: say so instead of staying silent.
      if (!saved && this.current())
        this.error.set("Revisa el contenido de la nota antes de guardar.")
      return saved
    })
  }
  cancel(): void {
    if (!this.destroyRef.destroyed && !this.profile().submitting() && this.dialog.open)
      this.dialog.close()
  }
}
