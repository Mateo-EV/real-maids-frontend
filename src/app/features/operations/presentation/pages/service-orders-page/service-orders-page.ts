import { Component, computed, DestroyRef, inject, OnInit, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { ActivatedRoute, NavigationStart, Router, RouterLink } from "@angular/router"
import { catchError, EMPTY, Subject, switchMap, takeUntil, tap } from "rxjs"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmBadgeImports } from "@spartan-ng/helm/badge"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmEmptyImports } from "@spartan-ng/helm/empty"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { HlmTableImports } from "@spartan-ng/helm/table"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { CustomersStore } from "@/app/features/customers/presentation/state/customers.store"
import { FieldStaffStore } from "@/app/features/field-operations/presentation/state/field-staff.store"
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
/** Loaded pages only: neither picker has a text search in the order list contract. */
const customerPageQuery = { offset: 0, limit: 20 } as const
const staffPageQuery = { offset: 0, limit: 20, isActive: true } as const
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
    CatalogFilters,
    CatalogFrame,
    TablePagination,
    HlmAlertImports,
    HlmBadgeImports,
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
    this.requested.set({ offset: 0, limit: 20 })
    const generation = this.scope.generation()
    // Admit the replacement session only after all scopes have finished resetting.
    queueMicrotask(() => {
      if (!this.current(generation)) return
      this.recoveryUsed = false
      this.readCustomers(false)
      this.readStaff(false)
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
  readonly customerEntry = computed(() => this.customers.selectQuery(customerPageQuery))
  readonly staffEntry = computed(() => this.staff.selectStaff(staffPageQuery))
  readonly catalogBusy = computed(
    () =>
      this.customerEntry().loading ||
      this.customerEntry().refreshing ||
      this.staffEntry().loading ||
      this.staffEntry().refreshing
  )
  readonly catalogFailed = computed(() => !!this.customerEntry().error || !!this.staffEntry().error)
  private options(
    items: readonly { id: number; name: string; isActive: boolean }[] | undefined,
    selected: { id: number; label: string } | null
  ): readonly { value: string; label: string }[] {
    const loaded = (items ?? [])
      .filter(item => item.isActive)
      .map(item => ({ value: String(item.id), label: item.name }))
    if (!selected || loaded.some(option => option.value === String(selected.id))) return loaded
    return [
      { value: String(selected.id), label: `${selected.label} · no disponible en esta página` },
      ...loaded
    ]
  }
  readonly filterSelects = computed<readonly CatalogFilterSelect[]>(() => [
    {
      id: "orders-filter-status",
      label: "Estado",
      allLabel: "Todos los estados",
      value: this.filters().status,
      options: orderStatusOptions
    },
    {
      id: "orders-filter-customer",
      label: "Cliente",
      allLabel: "Todos los clientes",
      value: this.filters().customerId,
      options: this.options(this.customerEntry().result?.items, this.selectedCustomer())
    },
    {
      id: "orders-filter-staff",
      label: "Personal",
      allLabel: "Todo el personal",
      value: this.filters().staffId,
      options: this.options(this.staffEntry().result?.items, this.selectedStaff())
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
    if (id === "orders-filter-status") {
      const known = orderStatusOptions.some(option => option.value === value)
      return this.changeFilters({ status: known ? value : "" })
    }
    if (id === "orders-filter-customer") {
      if (!this.capture(this.customers.selectQuery(customerPageQuery).result?.items, value)) return
      this.selectedCustomer.set(this.captured(this.selectedCustomer(), customerPageQuery, value))
      return this.changeFilters({ customerId: value })
    }
    if (id !== "orders-filter-staff") return
    const staffId = value ? Number(value) : 0
    if (value && (!Number.isSafeInteger(staffId) || staffId <= 0)) return
    if (!value) this.selectedStaff.set(null)
    else {
      const loaded = this.staffEntry().result?.items.find(item => item.id === staffId)
      if (loaded) this.selectedStaff.set({ id: loaded.id, label: loaded.name })
      else if (this.selectedStaff()?.id !== staffId) return
    }
    this.changeFilters({ staffId: value })
  }

  setDate(id: string, value: string): void {
    if (this.destroyRef.destroyed || this.departing || !this.scope.check()) return
    if (id === "orders-filter-from") return this.changeFilters({ from: value })
    if (id === "orders-filter-until") this.changeFilters({ until: value })
  }

  retryCatalogs(): void {
    if (this.destroyRef.destroyed || !this.scope.check()) return
    this.readCustomers(true)
    this.readStaff(true)
  }

  private capture(
    items: readonly { id: number; name: string; isActive: boolean }[] | undefined,
    value: string
  ): boolean {
    return !value || (items ?? []).some(item => String(item.id) === value)
  }

  private captured(
    selected: { id: number; label: string } | null,
    _query: unknown,
    value: string
  ): { id: number; label: string } | null {
    if (!value) return null
    const customerId = Number(value)
    if (!Number.isSafeInteger(customerId) || customerId <= 0) return selected
    const loaded = this.customerEntry().result?.items.find(item => item.id === customerId)
    if (loaded) return { id: loaded.id, label: loaded.name }
    return selected?.id === customerId ? selected : null
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

  private readCustomers(force: boolean): void {
    this.customers
      .observeQuery(customerPageQuery, force)
      .pipe(takeUntil(this.scope.cancelled$), takeUntilDestroyed(this.destroyRef))
      .subscribe()
  }

  private readStaff(force: boolean): void {
    this.staff
      .observeStaff(staffPageQuery, force)
      .pipe(takeUntil(this.scope.cancelled$), takeUntilDestroyed(this.destroyRef))
      .subscribe()
  }

  ngOnInit(): void {
    const ready = this.scope.check()
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(event => {
      if (event instanceof NavigationStart) {
        this.departing = true
        this.revision++
        this.queries.next(null)
      }
    })
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
      this.readCustomers(false)
      this.readStaff(false)
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
