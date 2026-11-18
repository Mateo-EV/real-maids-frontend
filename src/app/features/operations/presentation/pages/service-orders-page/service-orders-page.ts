import { Component, computed, DestroyRef, inject, OnInit, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { ActivatedRoute, NavigationStart, Router, RouterLink } from "@angular/router"
import { catchError, EMPTY, of, Subject, switchMap, takeUntil, tap, timer } from "rxjs"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { BadgeTone } from "@/app/shared/ui/badge-tone.directive"
import { HlmBadgeImports } from "@spartan-ng/helm/badge"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmEmptyImports } from "@spartan-ng/helm/empty"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { HlmTableImports } from "@spartan-ng/helm/table"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { CustomersStore } from "@/app/features/customers/presentation/state/customers.store"
import { FieldStaffStore } from "@/app/features/field-operations/presentation/state/field-staff.store"
import {
  CatalogCombobox,
  CatalogComboboxOption
} from "@/app/shared/components/catalog-combobox/catalog-combobox"
import {
  CatalogFilterDate,
  CatalogFilterSelect,
  CatalogFilters
} from "@/app/shared/components/catalog-filters/catalog-filters"
import { CatalogFrame } from "@/app/shared/components/catalog-frame/catalog-frame"
import { TablePagination } from "@/app/shared/components/table-pagination/table-pagination"
import { PaginationParams } from "@/app/shared/pagination/pagination.params"
import { OperationsError } from "../../../domain/errors/operations.error"
import { ServiceOrderQuery } from "../../../domain/params/operations.params"
import {
  serviceOrderPageContext,
  serviceOrderPagingParams
} from "../../navigation/service-order-page-context"
import { ServiceOrdersStore } from "../../state/service-orders.store"

type Query = Required<PaginationParams> & ServiceOrderQuery

/** Blank means "no filter": the adapter only ever receives documented query keys. */
interface FilterValues {
  status: string
  customerId: string
  staffId: string
  from: string
  until: string
}

const noFilters: FilterValues = { status: "", customerId: "", staffId: "", from: "", until: "" }
/**
 * One searched page per picker: neither catalog is downloaded nor sliced locally, and only a
 * set filter offers an empty value (an absence of identity, never an invented record).
 */
const customerPage = { offset: 0, limit: 20 } as const
const staffPage = { offset: 0, limit: 20, isActive: true } as const
const anyCustomer: CatalogComboboxOption = { value: "", label: "Todos los clientes" }
const anyStaff: CatalogComboboxOption = { value: "", label: "Todo el personal" }
const searchDebounceMs = 250

interface PickerRequest {
  readonly search: string
  readonly force: boolean
  readonly delay: number
}

/**
 * Backend order states: the wire carries the enum code and the operator sees the
 * catalog name (`CodigoEstadoOrden`), never a client-side translation table.
 */
const orderStatusOptions = [
  { value: "PENDIENTE", label: "Pendiente" },
  { value: "PROGRAMADA", label: "Programada" },
  { value: "EN_PROCESO", label: "En proceso" },
  { value: "COMPLETADA", label: "Completada" },
  { value: "PAGADO", label: "Pagado" },
  { value: "CANCELADA", label: "Cancelada" }
] as const

@Component({
  selector: "app-service-orders-page",
  imports: [
    RouterLink,
    CatalogCombobox,
    CatalogFilters,
    CatalogFrame,
    TablePagination,
    HlmAlertImports,
    HlmBadgeImports,
    BadgeTone,
    HlmButtonImports,
    HlmEmptyImports,
    HlmSpinnerImports,
    HlmTableImports
  ],
  templateUrl: "./service-orders-page.html"
})
export class ServiceOrdersPage implements OnInit {
  private readonly store = inject(ServiceOrdersStore)
  private readonly customers = inject(CustomersStore)
  private readonly staff = inject(FieldStaffStore)
  private readonly route = inject(ActivatedRoute)
  private readonly router = inject(Router)
  private readonly destroyRef = inject(DestroyRef)
  private readonly requested = signal<Query>(
    serviceOrderPageContext(this.route.snapshot.queryParamMap)
  )
  private readonly admissionError = signal<OperationsError | undefined>(undefined)
  private readonly filters = signal<FilterValues>(noFilters)
  /** Captured labels so an already-chosen record never disappears from its own filter. */
  private readonly selectedCustomer = signal<{ id: number; label: string } | null>(null)
  private readonly selectedStaff = signal<{ id: number; label: string } | null>(null)
  /** Observed picker queries; one active key each, so typing cannot fill a pinned registry. */
  private readonly customerQuery = signal<{ offset: number; limit: number; search?: string }>(
    customerPage
  )
  private readonly staffQuery = signal<{
    offset: number
    limit: number
    isActive?: boolean
    search?: string
  }>(staffPage)
  private readonly customerReads = new Subject<PickerRequest | null>()
  private readonly staffReads = new Subject<PickerRequest | null>()
  private readonly queries = new Subject<{ query: Query; force: boolean } | null>()
  private revision = 0
  private recoveryUsed = false
  private departing = false
  private readonly scope = createSessionReadScope(() => {
    this.revision++
    this.queries.next(null)
    this.admissionError.set(undefined)
    this.filters.set(noFilters)
    this.selectedCustomer.set(null)
    this.selectedStaff.set(null)
    this.customerQuery.set(customerPage)
    this.staffQuery.set(staffPage)
    this.customerReads.next(null)
    this.staffReads.next(null)
    this.requested.set({ offset: 0, limit: 20 })
    const generation = this.scope.generation()
    // Admit the replacement session only after all scopes have finished resetting.
    queueMicrotask(() => {
      if (!this.current(generation)) return
      this.recoveryUsed = false
      this.customerReads.next({ search: "", force: false, delay: 0 })
      this.staffReads.next({ search: "", force: false, delay: 0 })
      this.load({ offset: 0, limit: 20 })
    })
  })

  readonly list = computed(() => this.store.selectOrders(this.requested()))
  readonly result = computed(() => this.list().result)
  readonly rows = computed(() => this.result()?.items ?? [])
  // Returned metadata drives controls without changing the observed cache key or fetching again.
  readonly query = computed<Query>(() => {
    const page = this.result()
    return page ? { offset: page.offset, limit: page.limit } : this.requested()
  })
  readonly paging = computed(() => serviceOrderPagingParams(this.query()))
  readonly currentPage = computed(() => this.query().offset / this.query().limit + 1)
  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil((this.result()?.total ?? 0) / this.query().limit))
  )
  readonly rangeStart = computed(() => (this.rows().length ? this.result()!.offset + 1 : 0))
  readonly rangeEnd = computed(() =>
    this.rows().length ? this.result()!.offset + this.rows().length : 0
  )
  readonly error = computed(() => this.list().error ?? this.admissionError())
  readonly customerEntry = computed(() => this.customers.selectQuery(this.customerQuery()))
  readonly staffEntry = computed(() => this.staff.selectStaff(this.staffQuery()))
  readonly customerError = computed(() =>
    this.customerEntry().error ? "No se pudieron cargar los clientes." : ""
  )
  readonly staffError = computed(() =>
    this.staffEntry().error ? "No se pudo cargar el personal." : ""
  )
  private readonly loadedCustomers = computed<readonly CatalogComboboxOption[]>(() =>
    (this.customerEntry().result?.items ?? [])
      .filter(item => item.isActive)
      .map(item => ({ value: String(item.id), label: item.name }))
  )
  private readonly loadedStaff = computed<readonly CatalogComboboxOption[]>(() =>
    (this.staffEntry().result?.items ?? [])
      .filter(item => item.isActive)
      .map(item => ({ value: String(item.id), label: item.name }))
  )
  /** Verified page options plus the retained identity; the clear entry only exists when set. */
  private options(
    loaded: readonly CatalogComboboxOption[],
    selected: { id: number; label: string } | null,
    clear: CatalogComboboxOption
  ): readonly CatalogComboboxOption[] {
    const retained =
      selected && !loaded.some(option => option.value === String(selected.id))
        ? [
            {
              value: String(selected.id),
              label: `${selected.label} · no disponible en esta página`
            }
          ]
        : []
    return [...(selected ? [clear] : []), ...retained, ...loaded]
  }
  readonly customerOptions = computed(() =>
    this.options(this.loadedCustomers(), this.selectedCustomer(), anyCustomer)
  )
  readonly staffOptions = computed(() =>
    this.options(this.loadedStaff(), this.selectedStaff(), anyStaff)
  )
  readonly customerLabel = computed(() =>
    this.selectedLabel(this.selectedCustomer(), this.customerOptions())
  )
  readonly staffLabel = computed(() =>
    this.selectedLabel(this.selectedStaff(), this.staffOptions())
  )
  readonly filterSelects = computed<readonly CatalogFilterSelect[]>(() => [
    {
      id: "orders-filter-status",
      label: "Estado",
      allLabel: "Todos los estados",
      value: this.filters().status,
      options: orderStatusOptions
    }
  ])
  readonly filterDates = computed<readonly CatalogFilterDate[]>(() => [
    { id: "orders-filter-from", label: "Desde", value: this.filters().from },
    { id: "orders-filter-until", label: "Hasta", value: this.filters().until }
  ])
  readonly errorMessage = computed(() => {
    switch (this.error()?.code) {
      case "FORBIDDEN":
        return "No tienes permiso para consultar órdenes."
      case "UNAUTHENTICATED":
        return "La sesión no está disponible. Vuelve a iniciar sesión."
      case "UNCONFIGURED":
        return "El servicio de órdenes no está disponible en este entorno."
      case "UNAVAILABLE":
        return "No se pudo iniciar la consulta de órdenes. Inténtalo de nuevo."
      default:
        return "No se pudieron cargar las órdenes. Inténtalo de nuevo."
    }
  })

  setSelect(id: string, value: string): void {
    if (this.destroyRef.destroyed || this.departing || !this.scope.check()) return
    if (id !== "orders-filter-status") return
    const known = orderStatusOptions.some(option => option.value === value)
    this.changeFilters({ status: known ? value : "" })
  }

  /**
   * S9: only a verified option value reaches the query, the captured label is a real server
   * name, and the cleared entry is the only way to drop an already-chosen identity.
   */
  setCustomer(value: string): void {
    if (this.destroyRef.destroyed || this.departing || !this.scope.check()) return
    if (value === this.filters().customerId) return
    if (!value) {
      this.selectedCustomer.set(null)
      return this.changeFilters({ customerId: "" })
    }
    const customerId = Number(value)
    if (!Number.isSafeInteger(customerId) || customerId <= 0) return
    const loaded = this.loadedCustomers().find(option => option.value === value)
    const retained = this.selectedCustomer()
    const label =
      loaded?.label ?? (retained && String(retained.id) === value ? retained.label : undefined)
    if (!label) return
    this.selectedCustomer.set({ id: customerId, label })
    this.changeFilters({ customerId: value })
  }

  setStaff(value: string): void {
    if (this.destroyRef.destroyed || this.departing || !this.scope.check()) return
    if (value === this.filters().staffId) return
    if (!value) {
      this.selectedStaff.set(null)
      return this.changeFilters({ staffId: "" })
    }
    const staffId = Number(value)
    if (!Number.isSafeInteger(staffId) || staffId <= 0) return
    const loaded = this.loadedStaff().find(option => option.value === value)
    const retained = this.selectedStaff()
    const label =
      loaded?.label ?? (retained && String(retained.id) === value ? retained.label : undefined)
    if (!label) return
    this.selectedStaff.set({ id: staffId, label })
    this.changeFilters({ staffId: value })
  }

  /** Debounced server search: it never applies, clears or re-reads the list filters. */
  searchCustomers(value: string): void {
    this.queueCustomerRead({ search: value.trim(), force: false, delay: searchDebounceMs })
  }

  searchStaff(value: string): void {
    this.queueStaffRead({ search: value.trim(), force: false, delay: searchDebounceMs })
  }

  /** One forced read of the query currently observed by the picker, nothing else. */
  reloadCustomers(): void {
    this.queueCustomerRead({ search: this.customerQuery().search ?? "", force: true, delay: 0 })
  }

  reloadStaff(): void {
    this.queueStaffRead({ search: this.staffQuery().search ?? "", force: true, delay: 0 })
  }

  setDate(id: string, value: string): void {
    if (this.destroyRef.destroyed || this.departing || !this.scope.check()) return
    if (id === "orders-filter-from") return this.changeFilters({ from: value })
    if (id === "orders-filter-until") this.changeFilters({ until: value })
  }

  private queueCustomerRead(request: PickerRequest): void {
    if (this.destroyRef.destroyed || this.departing || !this.scope.check()) return
    this.customerReads.next(request)
  }

  private queueStaffRead(request: PickerRequest): void {
    if (this.destroyRef.destroyed || this.departing || !this.scope.check()) return
    this.staffReads.next(request)
  }

  private selectedLabel(
    selected: { id: number; label: string } | null,
    options: readonly CatalogComboboxOption[]
  ): string {
    if (!selected) return ""
    const value = String(selected.id)
    return options.find(option => option.value === value)?.label ?? selected.label
  }

  private changeFilters(patch: Partial<FilterValues>): void {
    const filters = { ...this.filters(), ...patch }
    this.filters.set(filters)
    this.recoveryUsed = false
    // S6: every filter change restarts at page zero and keeps the effective size.
    this.load(this.buildQuery(0, this.query().limit, filters))
  }

  private buildQuery(offset: number, limit: number, filters = this.filters()): Query {
    const query: Query = { offset, limit }
    if (filters.status) query.status = filters.status
    const customerId = filters.customerId ? Number(filters.customerId) : 0
    if (Number.isSafeInteger(customerId) && customerId > 0) query.customerId = customerId
    const staffId = filters.staffId ? Number(filters.staffId) : 0
    if (Number.isSafeInteger(staffId) && staffId > 0) query.staffId = staffId
    if (filters.from) query.from = filters.from
    if (filters.until) query.until = filters.until
    return query
  }

  ngOnInit(): void {
    const ready = this.scope.check()
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(event => {
      if (event instanceof NavigationStart) {
        this.departing = true
        this.revision++
        this.customerReads.next(null)
        this.staffReads.next(null)
        this.queries.next(null)
      }
    })
    // One picker query is observed per catalog: a new search supersedes the previous read, so
    // typing cannot exhaust the pinned registry that keeps the current view alive.
    this.customerReads
      .pipe(
        switchMap(request => {
          if (!request) return EMPTY
          const generation = this.scope.generation()
          return (request.delay ? timer(request.delay) : of(0)).pipe(
            switchMap(() => {
              if (!this.current(generation)) return EMPTY
              const query = {
                offset: customerPage.offset,
                limit: customerPage.limit,
                ...(request.search ? { search: request.search } : {})
              }
              this.customerQuery.set(query)
              return this.customers
                .observeQuery(query, request.force)
                .pipe(takeUntil(this.scope.cancelled$))
            })
          )
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
    this.staffReads
      .pipe(
        switchMap(request => {
          if (!request) return EMPTY
          const generation = this.scope.generation()
          return (request.delay ? timer(request.delay) : of(0)).pipe(
            switchMap(() => {
              if (!this.current(generation)) return EMPTY
              const query = {
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
    this.queries
      .pipe(
        switchMap(request => {
          if (!request) return EMPTY
          const { query, force } = request
          const revision = this.revision,
            generation = this.scope.generation()
          return this.store.observeOrders(query, force).pipe(
            takeUntil(this.scope.cancelled$),
            tap(response => {
              if (!this.current(generation, revision)) return
              if (!response.success) {
                if (!this.store.selectOrders(query).error) this.admissionError.set(response.error)
                return
              }
              const page = response.data
              if (
                this.recoveryUsed ||
                page.items.length ||
                page.total <= 0 ||
                page.offset < page.total
              )
                return
              this.recoveryUsed = true
              queueMicrotask(() => {
                if (!this.current(generation, revision)) return
                this.load(
                  this.buildQuery(
                    Math.floor((page.total - 1) / page.limit) * page.limit,
                    page.limit
                  ),
                  true
                )
              })
            }),
            catchError(() => {
              if (this.current(generation, revision))
                this.admissionError.set(new OperationsError("UNKNOWN", "Order read failed"))
              return EMPTY
            })
          )
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
    if (ready) this.load(this.requested())
    if (ready) {
      this.customerReads.next({ search: "", force: false, delay: 0 })
      this.staffReads.next({ search: "", force: false, delay: 0 })
    }
  }

  private current(generation: number, revision?: number): boolean {
    return (
      !this.destroyRef.destroyed &&
      !this.departing &&
      this.scope.check() &&
      generation === this.scope.generation() &&
      (revision === undefined || revision === this.revision)
    )
  }

  private load(query: Query, force = false): void {
    if (this.destroyRef.destroyed || this.departing || !this.scope.check()) return
    this.revision++
    this.admissionError.set(undefined)
    this.requested.set(query)
    this.queries.next({ query, force })
  }

  retry(): void {
    this.recoveryUsed = false
    this.load(this.query(), true)
  }

  goToPage(page: number): void {
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > this.pageCount() ||
      page === this.currentPage() ||
      this.list().loading ||
      !this.result()
    )
      return
    this.recoveryUsed = false
    this.load(this.buildQuery((page - 1) * this.query().limit, this.query().limit))
  }
}
