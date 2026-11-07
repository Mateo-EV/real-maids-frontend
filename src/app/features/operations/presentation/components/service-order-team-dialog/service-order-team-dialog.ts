import { Component, computed, DestroyRef, inject, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { form, FormField, FormRoot, submit, validate } from "@angular/forms/signals"
import { catchError, EMPTY, firstValueFrom, Subject, switchMap, takeUntil } from "rxjs"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { BrnComboboxInput } from "@spartan-ng/brain/combobox"
import { HlmComboboxImports } from "@spartan-ng/helm/combobox"
import { HlmDialogImports } from "@spartan-ng/helm/dialog"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmFieldImports } from "@spartan-ng/helm/field"
import { HlmInputImports } from "@spartan-ng/helm/input"
import { HlmNativeSelectImports } from "@spartan-ng/helm/native-select"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { customerDialogLifecycle } from "@/app/features/customers/presentation/components/customer-editor/customer-dialog-lifecycle"
import { FieldStaffStore } from "@/app/features/field-operations/presentation/state/field-staff.store"
import { FieldStaffQuery } from "@/app/features/field-operations/domain/params/field-operations.params"
import { ServiceOrdersStore } from "../../state/service-orders.store"
import {
  ServiceOrderWriteDialogContext,
  orderPositiveId,
  orderWriteError
} from "../service-order-write-dialog-context"

@Component({
  selector: "app-service-order-team-dialog",
  imports: [
    FormField,
    FormRoot,
    HlmDialogImports,
    HlmButtonImports,
    HlmFieldImports,
    HlmInputImports,
    HlmNativeSelectImports,
    BrnComboboxInput,
    HlmComboboxImports,
    HlmAlertImports,
    HlmSpinnerImports
  ],
  templateUrl: "./service-order-team-dialog.html"
})
export class ServiceOrderTeamDialog {
  readonly context = injectBrnDialogContext<ServiceOrderWriteDialogContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly store = inject(ServiceOrdersStore)
  private readonly staff = inject(FieldStaffStore)
  private readonly originalIds = new Set(this.context.order.assignedStaff.map(item => item.staffId))
  private readonly choiceQueries = new Map<number, FieldStaffQuery>()
  private readonly reads = new Subject<{ query: FieldStaffQuery; force: boolean }>()
  readonly query = signal<FieldStaffQuery>({ offset: 0, limit: 20, isActive: true })
  readonly choices = computed(() => this.staff.selectStaff(this.query()))
  readonly readError = signal("")
  readonly error = signal("")
  readonly staffComboboxOpen = signal<"open" | "closed">("closed")
  readonly model = signal({
    search: "",
    selectedStaffId: "",
    confirmed: false,
    assignments: this.context.order.assignedStaff.map(item => ({
      staffId: item.staffId,
      name: item.name,
      role:
        item.role === "RESPONSABLE" || item.role === "responsable"
          ? "RESPONSABLE"
          : item.role === "APOYO" || item.role === "apoyo"
            ? "APOYO"
            : "",
      previousRole: item.role
    }))
  })
  readonly profile = form(this.model, path => {
    validate(path.assignments, ({ value }) => {
      const items = value()
      return items.length <= 20 &&
        new Set(items.map(item => item.staffId)).size === items.length &&
        items.every(
          item =>
            orderPositiveId(item.staffId) && (item.role === "RESPONSABLE" || item.role === "APOYO")
        ) &&
        (!items.length || items.filter(item => item.role === "RESPONSABLE").length === 1)
        ? undefined
        : {
            kind: "team",
            message:
              "Máximo 20 personas únicas; elige exactamente un RESPONSABLE y APOYO para los demás."
          }
    })
    validate(path.confirmed, ({ value }) =>
      value()
        ? undefined
        : { kind: "confirmation", message: "Confirma el reemplazo completo del equipo." }
    )
  })
  readonly pending = computed(() => this.profile().submitting() || this.store.writing())
  private readonly lifecycle = customerDialogLifecycle(
    () => this.cancel(),
    () => this.error.set(orderWriteError("UNAUTHENTICATED"))
  )
  constructor() {
    this.reads
      .pipe(
        switchMap(({ query, force }) => {
          if (!this.current()) return EMPTY
          this.query.set(query)
          this.readError.set("")
          return this.staff.readStaff(query, force).pipe(
            catchError(() => {
              if (this.current()) this.readError.set("No se pudo consultar el personal.")
              return EMPTY
            })
          )
        }),
        takeUntil(this.context.ownerChanged$),
        takeUntil(this.lifecycle.cancelled$),
        takeUntilDestroyed(this.destroyRef),
        takeUntilDestroyed(this.context.owner)
      )
      .subscribe(result => {
        if (this.current() && !result.success)
          this.readError.set("No se pudo consultar el personal.")
      })
    queueMicrotask(() => {
      if (this.current()) this.reads.next({ query: this.query(), force: false })
    })
  }
  private current(): boolean {
    return (
      !this.context.owner.destroyed &&
      this.context.current() &&
      this.lifecycle.current() &&
      this.dialog.open
    )
  }
  unconfirm(): void {
    this.model.update(value => ({ ...value, confirmed: false }))
  }
  searchStaff(search: string): void {
    if (!this.current() || this.pending()) return
    this.model.update(value => ({ ...value, search, selectedStaffId: "" }))
    this.reads.next({
      query: {
        offset: 0,
        limit: this.choices().result?.limit ?? 20,
        isActive: true,
        search: search.trim() || undefined
      },
      force: false
    })
  }
  selectStaff(id: string | null | undefined): void {
    if (!this.current() || this.pending()) return
    this.model.update(value => ({ ...value, selectedStaffId: id ?? "" }))
    this.unconfirm()
  }
  staffComboboxStateChanged(state: "open" | "closed"): void {
    if (!this.current() || this.pending()) {
      this.staffComboboxOpen.set("closed")
      return
    }
    this.staffComboboxOpen.set(state)
    if (state === "open") {
      const query = this.query(),
        entry = this.staff.selectStaff(query)
      if (entry.expires <= Date.now() || entry.error) this.reads.next({ query, force: true })
    }
  }
  readonly staffOptionLabel = (value: string): string => {
    const selected = this.choices().result?.items.find(person => String(person.id) === value)
    return selected?.name ?? "Buscar personal activo"
  }
  readonly showStaffOption = () => true
  staffPage(direction: -1 | 1): void {
    const page = this.choices().result
    if (
      !page ||
      !this.current() ||
      this.pending() ||
      this.choices().loading ||
      this.choices().refreshing
    )
      return
    const offset = page.offset + direction * page.limit
    if (offset < 0 || offset >= page.total) return
    this.model.update(value => ({ ...value, selectedStaffId: "" }))
    this.reads.next({ query: { ...this.query(), offset, limit: page.limit }, force: false })
  }
  retryStaff(): void {
    if (this.current() && !this.pending()) this.reads.next({ query: this.query(), force: true })
  }
  private verifiedChoice(id: number, query: FieldStaffQuery): boolean {
    const entry = this.staff.selectStaff(query)
    return (
      orderPositiveId(id) &&
      entry.expires > Date.now() &&
      !entry.error &&
      !entry.loading &&
      !entry.refreshing &&
      !!entry.result?.items.some(item => item.id === id && item.isActive)
    )
  }
  add(): void {
    const id = Number(this.model().selectedStaffId),
      query = this.query()
    if (
      !this.current() ||
      this.pending() ||
      !this.verifiedChoice(id, query) ||
      this.model().assignments.length >= 20 ||
      this.model().assignments.some(item => item.staffId === id)
    )
      return
    const selected = this.choices().result!.items.find(item => item.id === id)!
    this.choiceQueries.set(id, { ...query })
    this.model.update(value => ({
      ...value,
      selectedStaffId: "",
      confirmed: false,
      assignments: [
        ...value.assignments,
        { staffId: id, name: selected.name, role: "", previousRole: "" }
      ]
    }))
  }
  remove(id: number): void {
    if (!this.current() || this.pending()) return
    this.model.update(value => ({
      ...value,
      confirmed: false,
      assignments: value.assignments.filter(item => item.staffId !== id)
    }))
  }
  save(): Promise<boolean> {
    if (!this.current() || this.pending()) return Promise.resolve(false)
    this.error.set("")
    return submit(this.profile, async () => {
      const value = this.model()
      if (!value.confirmed || !this.current() || this.store.writing()) return
      for (const item of value.assignments) {
        const query = this.choiceQueries.get(item.staffId)
        if (
          !this.originalIds.has(item.staffId) &&
          (!query || !this.verifiedChoice(item.staffId, query))
        ) {
          this.error.set(
            "Revalida el personal agregado antes de confirmar. Se conservó el borrador."
          )
          return
        }
      }
      try {
        const result = await firstValueFrom(
          this.store
            .replaceAssignments(
              this.context.order.id,
              {
                assignments: value.assignments.map(item => ({
                  staffId: item.staffId,
                  role: item.role
                }))
              },
              this.context.order.customerId
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
        if (!result.success) this.error.set(orderWriteError(result.error.code))
        else {
          this.context.onSaved()
          if (this.current()) this.dialog.close()
        }
      } catch {
        if (this.current()) this.error.set(orderWriteError("UNKNOWN"))
      }
    })
  }
  cancel(): void {
    if (!this.destroyRef.destroyed && !this.pending() && this.dialog.open) this.dialog.close()
  }
}
