import { isPlatformBrowser } from "@angular/common"
import { Component, computed, DestroyRef, inject, PLATFORM_ID, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { Router } from "@angular/router"
import { EMPTY, of, Subject, switchMap, takeUntil, timer } from "rxjs"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmNativeSelectImports } from "@spartan-ng/helm/native-select"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { FieldStaffQuery } from "@/app/features/field-operations/domain/params/field-operations.params"
import { FieldStaffStore } from "@/app/features/field-operations/presentation/state/field-staff.store"
import {
  CatalogCombobox,
  CatalogComboboxOption
} from "@/app/shared/components/catalog-combobox/catalog-combobox"
import {
  CatalogFilterDate,
  CatalogFilters
} from "@/app/shared/components/catalog-filters/catalog-filters"
import { CatalogFrame } from "@/app/shared/components/catalog-frame/catalog-frame"
import { AgendaBoard } from "../../components/agenda-board/agenda-board"
import {
  agendaQuery,
  agendaRange,
  agendaStaffId,
  AgendaView,
  civilToday
} from "../../navigation/agenda-calendar"
import { AgendaStore } from "../../state/agenda.store"

interface AgendaModel {
  date: string
  view: AgendaView
  staff: string
}

interface PickerRequest {
  readonly search: string
  readonly force: boolean
  readonly delay: number
}

/** One searched page of active staff: a real server slice, never a downloaded catalog (S9). */
const staffPage = { offset: 0, limit: 20, isActive: true } as const
const searchDebounceMs = 250
const anyStaff: CatalogComboboxOption = { value: "", label: "Todo el personal" }
/** Plain view names: the wording that explained the window lives in the hint under the controls. */
const views: readonly { value: AgendaView; label: string }[] = [
  { value: "day", label: "Día" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" }
]
const viewHeadings: Record<AgendaView, string> = { day: "Día", week: "Semana", month: "Mes" }
/** The agenda opens on the current week: the day the user is living in anchors it. */
const defaultView: AgendaView = "week"
const blank: AgendaModel = { date: "", view: defaultView, staff: "" }

@Component({
  selector: "app-agenda-page",
  providers: [AgendaStore],
  imports: [
    AgendaBoard,
    CatalogCombobox,
    CatalogFilters,
    CatalogFrame,
    HlmAlertImports,
    HlmButtonImports,
    HlmNativeSelectImports,
    HlmSpinnerImports
  ],
  templateUrl: "./agenda-page.html"
})
export class AgendaPage {
  readonly store = inject(AgendaStore)
  private readonly staff = inject(FieldStaffStore)
  private readonly router = inject(Router)
  private readonly destroyRef = inject(DestroyRef)
  /** SSR and prerender never read a clock the browser would render differently. */
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID))
  /** Draft and applied filter are the same thing: every change applies at once (S5). */
  readonly model = signal<AgendaModel>(this.initialModel())
  readonly views = views
  readonly viewHeadings = viewHeadings
  private readonly selectedStaff = signal<{ id: number; label: string } | null>(null)
  private readonly staffQuery = signal<FieldStaffQuery>({ ...staffPage })
  private readonly staffReads = new Subject<PickerRequest | null>()
  private readonly scope = createSessionReadScope(() => {
    // A replaced session owns nothing: controls return to the current-week default and the
    // agenda is re-queried only after the new session admits reads.
    this.model.set(this.initialModel())
    this.selectedStaff.set(null)
    this.staffQuery.set({ ...staffPage })
    this.staffReads.next(null)
    const generation = this.scope.generation()
    // The picker's own catalog page is admitted only once every reset has settled.
    queueMicrotask(() => {
      if (!this.current(generation)) return
      this.staffReads.next({ search: "", force: false, delay: 0 })
      this.dispatch()
    })
  })
  /** A blank reference date derives no window: the control never invents a date of its own. */
  readonly range = computed(() => {
    const { date, view } = this.model()
    return date ? agendaRange(date, view) : undefined
  })
  readonly busy = computed(() => this.store.loading() || this.store.refreshing())
  /**
   * The board only draws the window it was given, so a returned entry dated outside
   * `[from, until]` would vanish silently. ISO `YYYY-MM-DD` compares correctly as text.
   */
  readonly outOfRange = computed(() => {
    const range = this.range()
    const result = this.store.result()
    if (!range || !result) return 0
    return result.filter(entry => entry.date < range.from || entry.date > range.until).length
  })
  /** Plain-text report of the returned shifts the board cannot draw; empty when none. */
  readonly outOfRangeNote = computed(() => {
    const count = this.outOfRange()
    if (!count) return ""
    return count === 1
      ? "1 turno devuelto está fuera del rango solicitado y no se dibuja."
      : `${count} turnos devueltos están fuera del rango solicitado y no se dibujan.`
  })
  readonly filterDates = computed<readonly CatalogFilterDate[]>(() => [
    { id: "agenda-date", label: "Fecha de referencia", value: this.model().date }
  ])
  readonly staffEntry = computed(() => this.staff.selectStaff(this.staffQuery()))
  readonly staffError = computed(() =>
    this.staffEntry().error ? "No se pudo cargar el personal." : ""
  )
  private readonly loadedStaff = computed<readonly CatalogComboboxOption[]>(() =>
    (this.staffEntry().result?.items ?? [])
      .filter(item => item.isActive)
      .map(item => ({ value: String(item.id), label: item.name }))
  )
  /** Verified page options plus the retained identity; the clear entry exists only when set. */
  readonly staffOptions = computed<readonly CatalogComboboxOption[]>(() => {
    const selected = this.selectedStaff()
    const loaded = this.loadedStaff()
    if (!selected) return loaded
    const value = String(selected.id)
    const retained = loaded.some(option => option.value === value)
      ? []
      : [{ value, label: `${selected.label} · no disponible en esta página` }]
    return [anyStaff, ...retained, ...loaded]
  })
  readonly staffLabel = computed(() => {
    const selected = this.selectedStaff()
    if (!selected) return ""
    const value = String(selected.id)
    return this.staffOptions().find(option => option.value === value)?.label ?? selected.label
  })

  constructor() {
    // SSR and guests stop here: no auth initialization, no staff read.
    const ready = this.scope.check()
    // One picker query at a time: a new search supersedes the previous read instead of
    // filling the pinned registry that keeps the visible page alive.
    this.staffReads
      .pipe(
        switchMap(request => {
          if (!request) return EMPTY
          const generation = this.scope.generation()
          return (request.delay ? timer(request.delay) : of(0)).pipe(
            switchMap(() => {
              if (!this.current(generation)) return EMPTY
              const query: FieldStaffQuery = {
                offset: staffPage.offset,
                limit: staffPage.limit,
                isActive: staffPage.isActive,
                ...(request.search ? { search: request.search } : {})
              }
              this.staffQuery.set(query)
              return this.staff
                .observeStaff(query, request.force)
                .pipe(takeUntil(this.scope.cancelled$))
            })
          )
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
    if (ready) {
      this.staffReads.next({ search: "", force: false, delay: 0 })
      this.dispatch()
    }
  }

  /** The seeded default: today's civil day in the browser, nothing on the server. */
  private initialModel(): AgendaModel {
    return this.browser ? { date: civilToday(), view: defaultView, staff: "" } : { ...blank }
  }

  setDate(value: string): void {
    this.apply({ date: value })
  }

  setView(value: string | null | undefined): void {
    const view = views.find(option => option.value === value)?.value
    if (view) this.apply({ view })
  }

  /** S9: only a verified server identity reaches the query; blank means "all staff". */
  setStaff(value: string): void {
    if (this.destroyRef.destroyed || !this.scope.check()) return
    if (!value) {
      this.selectedStaff.set(null)
      this.apply({ staff: "" })
      return
    }
    const staffId = agendaStaffId(value)
    if (staffId === undefined) return
    const retained = this.selectedStaff()
    const label =
      this.loadedStaff().find(option => option.value === value)?.label ??
      (retained && String(retained.id) === value ? retained.label : undefined)
    if (!label) return
    this.selectedStaff.set({ id: staffId, label })
    this.apply({ staff: value })
  }

  /** Debounced server search: it never selects, clears or re-reads the agenda filters. */
  searchStaff(value: string): void {
    this.queueStaffRead({ search: value.trim(), force: false, delay: searchDebounceMs })
  }

  /** One forced read of the query currently observed by the picker, nothing else. */
  reloadStaff(): void {
    this.queueStaffRead({ search: this.staffQuery().search ?? "", force: true, delay: 0 })
  }

  /** S8: the calendar reports the order the user clicked; the page owns the route. */
  openOrder(orderId: number): void {
    if (this.destroyRef.destroyed || !this.scope.check()) return
    void this.router.navigate(["/admin/operations/orders", orderId])
  }

  retry(): void {
    const query = this.store.query()
    if (this.destroyRef.destroyed || !query || this.busy()) return
    this.store.loadAgenda(query).pipe(takeUntilDestroyed(this.destroyRef)).subscribe()
  }

  /** S5: the derived window is dispatched on the control change itself. */
  private apply(patch: Partial<AgendaModel>): void {
    if (this.destroyRef.destroyed) return
    this.model.set({ ...this.model(), ...patch })
    this.dispatch()
  }

  /** A blank reference date derives no window, so it dispatches nothing. */
  private dispatch(): void {
    const { date, view, staff } = this.model()
    const query = agendaQuery(date, view, staff)
    if (!query) return
    this.store.loadAgenda(query).pipe(takeUntilDestroyed(this.destroyRef)).subscribe()
  }

  private queueStaffRead(request: PickerRequest): void {
    if (this.destroyRef.destroyed || !this.scope.check()) return
    this.staffReads.next(request)
  }

  private current(generation: number): boolean {
    return (
      !this.destroyRef.destroyed && this.scope.check() && generation === this.scope.generation()
    )
  }
}
