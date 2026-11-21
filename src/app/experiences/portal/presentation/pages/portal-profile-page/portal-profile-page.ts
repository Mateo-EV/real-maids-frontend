import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { disabled, form, FormField, FormRoot, submit, validate } from "@angular/forms/signals"
import { EMPTY, firstValueFrom, Subject, switchMap, takeUntil } from "rxjs"
import { HlmAlert, HlmAlertDescription, HlmAlertTitle } from "@spartan-ng/helm/alert"
import { HlmButton } from "@spartan-ng/helm/button"
import {
  HlmField,
  HlmFieldDescription,
  HlmFieldError,
  HlmFieldLabel,
  HlmFieldLegend,
  HlmFieldSet
} from "@spartan-ng/helm/field"
import { HlmInput } from "@spartan-ng/helm/input"
import { HlmSpinner } from "@spartan-ng/helm/spinner"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { CustomerErrorCode } from "@/app/features/customers/domain/errors/customer.error"
import { CustomersStore } from "@/app/features/customers/presentation/state/customers.store"
import { CatalogFrame } from "@/app/shared/components/catalog-frame/catalog-frame"

/** Documented staff profile limits, reused by the own-profile endpoint. */
const nameLimit = 150
const phoneLimit = 30
/** Documented customer phone rule (`ClienteRequest`), the same one the staff editor validates. */
const phonePattern = /^\+?[0-9 ()-]{7,30}$/

type OwnProfileField = readonly [label: string, value: string | null]

interface ProfileDraft {
  name: string
  phone: string
}

/**
 * WP10 T7 / S2 — `/portal/profile`, the customer's own profile, inside the guarded portal shell.
 *
 * This is the only portal screen whose subject is the customer record itself, and it is deliberately
 * narrow: `GET /api/clientes/me` is scoped by the backend to the session, so the page never sends,
 * infers or displays a customer id, and `PUT /api/clientes/me` accepts exactly `nombre` and
 * `telefono`. The email is printed read-only with the reason: it is the sign-in identity and it is
 * shared with the account row, so only the office changes it. Nothing else of the payload (type
 * changes, active flag, timestamps, account fields) is edited, offered or invented here.
 *
 * Write discipline: one PUT through the root `CustomersStore.updateOwnProfile`, which shares the
 * store's session fencing, pending coordination and invalidation. The draft is captured when editing
 * starts and never rewritten by a background read, a pending write refuses both a duplicate submit
 * and the dismissal of the form, a `400` is bound to its documented field (never to server copy) and
 * keeps the draft, and feedback follows a confirmed success only. That confirmed success alone
 * revalidates the read, so the page never reloads by itself and never replays the write.
 *
 * Helm dependencies are declared by name, never as a spread of an imported `*Imports` constant: the
 * dev server re-applies this metadata through `ɵɵnamespaces` and resolves those entries by index.
 */
@Component({
  selector: "app-portal-profile-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormField,
    FormRoot,
    CatalogFrame,
    HlmAlert,
    HlmAlertDescription,
    HlmAlertTitle,
    HlmButton,
    HlmField,
    HlmFieldDescription,
    HlmFieldError,
    HlmFieldLabel,
    HlmFieldLegend,
    HlmFieldSet,
    HlmInput,
    HlmSpinner
  ],
  templateUrl: "./portal-profile-page.html"
})
export class PortalProfilePage {
  private readonly destroyRef = inject(DestroyRef)
  private readonly customers = inject(CustomersStore)
  readonly nameLimit = nameLimit
  readonly phoneLimit = phoneLimit
  /** `null` cancels the current observation without issuing a replacement read. */
  private readonly loads = new Subject<{ force: boolean } | null>()
  readonly editing = signal(false)
  /** Confirmed write: never set by a failure or by optimism. */
  readonly saved = signal(false)
  /** General inline write failure; `fieldError` carries the ones bound to an input. */
  readonly writeError = signal("")
  readonly fieldError = signal<{ field: "name" | "phone"; message: string } | null>(null)
  /** Draft only: captured when editing starts, built into the payload at dispatch. */
  readonly model = signal<ProfileDraft>({ name: "", phone: "" })
  private readonly scope = createSessionReadScope(() => {
    // A replaced session must not inherit the previous identity's verified profile or its draft.
    this.loads.next(null)
    this.editing.set(false)
    this.saved.set(false)
    this.writeError.set("")
    this.fieldError.set(null)
    this.model.set({ name: "", phone: "" })
    const generation = this.scope.generation()
    queueMicrotask(() => {
      if (!this.current(generation)) return
      this.load(false)
    })
  })

  readonly entry = computed(() => this.customers.selectOwnProfile())
  /** Authoritative absence: the backend answered 404 because the account has no customer record. */
  readonly noProfile = computed(() => this.entry().error?.code === "CUSTOMER_NOT_FOUND")
  /** Only a retryable failure reaches this projection; a 404 has its own stable state. */
  readonly error = computed(() => {
    const error = this.entry().error
    return error && error.code !== "CUSTOMER_NOT_FOUND" ? error : undefined
  })
  readonly record = computed(() => (this.noProfile() ? undefined : this.entry().result))
  readonly loading = computed(
    () => this.entry().loading || (!this.record() && !this.error() && !this.noProfile())
  )
  readonly pending = computed<boolean>(
    () => this.editor().submitting() || this.customers.writePending() > 0
  )
  readonly nameServerError = computed(() =>
    this.fieldError()?.field === "name" ? this.fieldError()!.message : ""
  )
  readonly phoneServerError = computed(() =>
    this.fieldError()?.field === "phone" ? this.fieldError()!.message : ""
  )
  /** Supplied fields only, printed literally: no ids, account state or timestamps. */
  readonly fields = computed<readonly OwnProfileField[]>(() => {
    const profile = this.record()
    return profile
      ? [
          ["Nombre", profile.name],
          ["Teléfono", profile.phone],
          ["Tipo de cliente", profile.type]
        ]
      : []
  })
  readonly errorMessage = computed(() => {
    switch (this.error()?.code) {
      case "FORBIDDEN":
        return "No puedes consultar tu perfil desde esta cuenta."
      case "UNAUTHENTICATED":
        return "La sesión no está disponible. Vuelve a iniciar sesión."
      case "INVALID_RESPONSE":
        return "La respuesta del servicio no es válida. Reintenta la consulta."
      case "UNCONFIGURED":
        return "El servicio de clientes no está disponible en este entorno."
      default:
        return "No se pudo cargar tu perfil. Inténtalo de nuevo."
    }
  })

  /** Draft form of the two editable fields; the payload is built at dispatch. */
  readonly editor = form(this.model, path => {
    disabled(path.name, () => this.pending())
    disabled(path.phone, () => this.pending())
    validate(path.name, ({ value }) => {
      const name = value().trim()
      if (!name) return { kind: "required", message: "Ingresa tu nombre." }
      return name.length > nameLimit
        ? { kind: "maxLength", message: `Usa como máximo ${nameLimit} caracteres.` }
        : undefined
    })
    validate(path.phone, ({ value }) => {
      const phone = value().trim()
      if (!phone) return undefined
      return phone.length > phoneLimit
        ? { kind: "maxLength", message: `Usa como máximo ${phoneLimit} caracteres.` }
        : phonePattern.test(phone)
          ? undefined
          : {
              kind: "phone",
              message: "Ingresa un teléfono válido de 7 a 30 caracteres."
            }
    })
  })

  constructor() {
    this.loads
      .pipe(
        switchMap(load =>
          load === null
            ? EMPTY
            : this.customers.observeOwnProfile(load.force).pipe(takeUntil(this.scope.cancelled$))
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
    // One read opens the page; the server platform dispatches nothing and a session replacement
    // re-reads through the scope above.
    if (this.scope.check()) this.load(false)
  }

  /** Explicit retry: the same GET and nothing else. */
  retry(): void {
    const entry = this.entry()
    if (this.destroyRef.destroyed || entry.loading || entry.refreshing) return
    this.load(true)
  }

  /** The draft is captured here, from the verified record and never from a later refresh. */
  startEditing(): void {
    const record = this.record()
    if (this.destroyRef.destroyed || this.pending() || !record) return
    this.saved.set(false)
    this.writeError.set("")
    this.fieldError.set(null)
    this.model.set({ name: record.name, phone: record.phone ?? "" })
    this.editing.set(true)
  }

  /** Dismissal is refused while a write is in flight: the answer still owns this form. */
  cancelEditing(): void {
    if (this.destroyRef.destroyed || this.pending()) return
    this.closeEditor()
  }

  clearFailure(): void {
    this.writeError.set("")
    this.fieldError.set(null)
  }

  save(): Promise<boolean> {
    if (this.destroyRef.destroyed || !this.editing() || this.pending())
      return Promise.resolve(false)
    this.writeError.set("")
    this.fieldError.set(null)
    this.saved.set(false)
    return submit(this.editor, async () => {
      // `submitting()` is already true inside the action; only the shared write gate can refuse here.
      if (this.destroyRef.destroyed || this.customers.writePending() > 0) return
      const value = this.model()
      const name = value.name.trim(),
        phone = value.phone.trim()
      // The form already validated this; the payload never carries over-limit or off-pattern text.
      if (!name || name.length > nameLimit || phone.length > phoneLimit) return
      if (phone && !phonePattern.test(phone)) return
      const generation = this.scope.generation()
      try {
        const result = await firstValueFrom(
          this.customers
            .updateOwnProfile({ name, phone: phone || null })
            .pipe(takeUntil(this.scope.cancelled$), takeUntilDestroyed(this.destroyRef)),
          { defaultValue: undefined }
        )
        if (!this.current(generation) || !result) return
        if (!result.success) {
          this.reportFailure(result.error.code)
          return
        }
        this.closeEditor()
        this.saved.set(true)
      } catch {
        if (this.current(generation)) this.reportFailure("UNEXPECTED")
      }
    })
  }

  private closeEditor(): void {
    this.editing.set(false)
    this.writeError.set("")
    this.fieldError.set(null)
  }

  private current(generation?: number): boolean {
    return (
      !this.destroyRef.destroyed &&
      this.scope.check() &&
      (generation === undefined || generation === this.scope.generation())
    )
  }

  private load(force: boolean): void {
    if (this.destroyRef.destroyed || !this.scope.check()) return
    this.loads.next({ force })
  }

  private reportFailure(code: CustomerErrorCode): void {
    switch (code) {
      case "CUSTOMER_NAME_INVALID":
        this.writeError.set("")
        this.fieldError.set({
          field: "name",
          message:
            "El servicio rechazó el nombre. Revisa que no esté vacío y no supere 150 caracteres."
        })
        return
      case "CUSTOMER_PHONE_INVALID":
        this.writeError.set("")
        this.fieldError.set({
          field: "phone",
          message:
            "El servicio rechazó el teléfono. Usa de 7 a 30 caracteres: números, espacios, paréntesis, guiones y un «+» inicial opcional."
        })
        return
      case "INVALID_INPUT":
        this.writeError.set("Revisa los datos de tu perfil.")
        return
      case "FORBIDDEN":
        this.writeError.set("No tienes permiso para actualizar tu perfil desde esta cuenta.")
        return
      case "CUSTOMER_NOT_FOUND":
        this.writeError.set("Tu cuenta no está vinculada a un perfil de cliente.")
        return
      case "CONFLICT":
        this.writeError.set("Hay otra operación en curso. Espera un momento y vuelve a intentar.")
        return
      case "UNAUTHENTICATED":
        this.writeError.set("La sesión no está disponible. Vuelve a iniciar sesión.")
        return
      case "NETWORK":
      case "UNCONFIGURED":
        this.writeError.set("El servicio de clientes no está disponible en este momento.")
        return
      default:
        // Nothing here proves whether the PUT reached the backend, so it is never resent by itself.
        this.writeError.set(
          "No pudimos confirmar la actualización. Revisa tu perfil antes de volver a intentarlo; no repetimos el envío por ti."
        )
    }
  }
}
