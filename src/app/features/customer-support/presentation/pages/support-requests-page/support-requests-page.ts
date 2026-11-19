import { Component, computed, DestroyRef, inject, OnInit, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { ActivatedRoute, NavigationStart, ParamMap, Router, RouterLink } from "@angular/router"
import { catchError, EMPTY, of, Subject, switchMap, takeUntil, tap, timer } from "rxjs"
import { NgIcon, provideIcons } from "@ng-icons/core"
import { lucidePlus } from "@ng-icons/lucide"
import { BrnDialogRef } from "@spartan-ng/brain/dialog"
import { HotToastService } from "@ngxpert/hot-toast"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmBadgeImports } from "@spartan-ng/helm/badge"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmEmptyImports } from "@spartan-ng/helm/empty"
import { HlmNativeSelectImports } from "@spartan-ng/helm/native-select"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { HlmTableImports } from "@spartan-ng/helm/table"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { CustomersStore } from "@/app/features/customers/presentation/state/customers.store"
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
import { BadgeTone } from "@/app/shared/ui/badge-tone.directive"
import { CustomerSupportError } from "../../../domain/errors/customer-support.error"
import { SUPPORT_STATE_CODES } from "../../../domain/models/support-views"
import { SupportRequestQuery } from "../../../domain/params/customer-support.params"
import {
  SupportRequestCreateContext,
  SupportRequestCreateDialog
} from "../../components/support-request-create-dialog/support-request-create-dialog"
import { SupportMetrics } from "../../components/support-metrics/support-metrics"
import { SupportRequestsStore } from "../../state/support-requests.store"
import {
  noSupportFilters,
  SupportFilterValues,
  supportFilterContext,
  supportListParams,
  supportPageContext,
  supportParamsKey
} from "../support-page-context"

type Query = Required<PaginationParams> & SupportRequestQuery

/**
 * The server query of one filtered page: documented keys only, and a blank filter is an
 * absent key instead of an empty value.
 */
function listQuery(offset: number, limit: number, filters: SupportFilterValues): Query {
  const query: Query = { offset, limit }
  if (filters.state) query.state = filters.state
  const typeId = filters.typeId ? Number(filters.typeId) : 0
  if (Number.isSafeInteger(typeId) && typeId > 0) query.requestTypeId = typeId
  const customerId = filters.customerId ? Number(filters.customerId) : 0
  if (Number.isSafeInteger(customerId) && customerId > 0) query.customerId = customerId
  if (filters.from) query.fromDate = filters.from
  if (filters.until) query.toDate = filters.until
  return query
}

/**
 * One searched page at a time: the picker never downloads a catalog nor slices it locally,
 * and only the cleared filter offers an empty value (an absence of identity, not a name).
 */
const customerPage = { offset: 0, limit: 20 } as const
const anyCustomer: CatalogComboboxOption = { value: "", label: "Todos los clientes" }
const searchDebounceMs = 250
const anyState = ""

/**
 * A filter that only the URL named yet still has an identity, so its control keeps the
 * selection visible while the catalog verifies a name for it.
 */
function filterIdentity(value: string): { id: number; label: string } | null {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? { id, label: "" } : null
}

interface CustomerPickerRequest {
  readonly search: string
  readonly force: boolean
  readonly delay: number
}

@Component({
  selector: "app-support-requests-page",
  imports: [
    CatalogCombobox,
    CatalogFilters,
    CatalogFrame,
    HlmAlertImports,
    HlmBadgeImports,
    BadgeTone,
    HlmButtonImports,
    HlmEmptyImports,
    HlmNativeSelectImports,
    HlmSpinnerImports,
    HlmTableImports,
    NgIcon,
    RouterLink,
    SupportMetrics,
    TablePagination
  ],
  providers: [provideIcons({ lucidePlus })],
  templateUrl: "./support-requests-page.html"
})
export class SupportRequestsPage implements OnInit {
  private readonly store = inject(SupportRequestsStore)
  private readonly customers = inject(CustomersStore)
  private readonly route = inject(ActivatedRoute)
  private readonly router = inject(Router)
  private readonly destroyRef = inject(DestroyRef)
  private readonly dialogs = inject(HlmDialogService)
  private readonly toast = inject(HotToastService)
  private dialog: BrnDialogRef | undefined
  private dialogIdentity: object | undefined
  /** The root store owns the shared pending gate; the page only mirrors it into controls. */
  readonly writing = this.store.writing
  /**
   * S14: the inbox filters live in the URL so leaving and returning restores the filtered
   * page. The entry snapshot is read once here and every later URL change is adopted below.
   */
  private readonly entry = this.route.snapshot.queryParamMap
  protected readonly filters = signal<SupportFilterValues>(supportFilterContext(this.entry))
  private readonly requested = signal<Query>(this.entryQuery(this.entry))
  private readonly admissionError = signal<CustomerSupportError | undefined>(undefined)
  /** Canonical key of the context this page published last, so its own URL write is not a read. */
  private published = supportParamsKey(
    supportListParams(supportPageContext(this.entry), supportFilterContext(this.entry))
  )
  /** Captured labels so an already-chosen filter never disappears from its own control. */
  private readonly selectedCustomer = signal<{ id: number; label: string } | null>(
    filterIdentity(this.filters().customerId)
  )
  private readonly selectedType = signal<{ id: number; label: string } | null>(
    filterIdentity(this.filters().typeId)
  )
  /** Observed picker query; only one key is active at a time so typing cannot fill the registry. */
  private readonly customerQuery = signal<{ offset: number; limit: number; search?: string }>(
    customerPage
  )
  private readonly customerReads = new Subject<CustomerPickerRequest | null>()
  private readonly typeReads = new Subject<boolean | null>()
  private readonly queries = new Subject<{ query: Query; force: boolean } | null>()
  private revision = 0
  private recoveryUsed = false
  private departing = false
  private readonly scope = createSessionReadScope(() => {
    this.stopEditor()
    this.revision++
    this.queries.next(null)
    this.typeReads.next(null)
    this.customerReads.next(null)
    this.admissionError.set(undefined)
    this.filters.set(noSupportFilters)
    this.selectedCustomer.set(null)
    this.selectedType.set(null)
    this.customerQuery.set(customerPage)
    this.requested.set({ offset: 0, limit: 20 })
    const generation = this.scope.generation()
    // Session reset runs inside a transition; wait before admitting new reads.
    queueMicrotask(() => {
      if (!this.current(generation)) return
      this.recoveryUsed = false
      this.typeReads.next(false)
      this.customerReads.next({ search: "", force: false, delay: 0 })
      this.load({ offset: 0, limit: 20 })
    })
  })

  readonly list = computed(() => this.store.selectRequests(this.requested()))
  readonly result = computed(() => this.list().result)
  readonly rows = computed(() => this.result()?.items ?? [])
  // Effective metadata is a projection, not a second query/read when the server size changes.
  readonly query = computed<Query>(() => {
    const page = this.result()
    return page ? { offset: page.offset, limit: page.limit } : this.requested()
  })
  /**
   * The filtered page as links and the URL carry it: filters plus effective paging, blanks
   * omitted. A detail opened from here can therefore return to exactly this page.
   */
  readonly listParams = computed(() => supportListParams(this.query(), this.filters()))
  readonly currentPage = computed(() => this.query().offset / this.query().limit + 1)
  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil((this.result()?.total ?? 0) / this.query().limit))
  )
  readonly rangeStart = computed(() => (this.rows().length ? this.result()!.offset + 1 : 0))
  readonly rangeEnd = computed(() =>
    this.rows().length ? this.result()!.offset + this.rows().length : 0
  )
  readonly error = computed(() => this.list().error ?? this.admissionError())
  readonly typeEntry = computed(() => this.store.selectRequestTypes())
  readonly typeError = computed(() =>
    this.typeEntry().error ? "No se pudieron cargar los tipos de atención." : ""
  )
  readonly filtersActive = computed(() => {
    const filters = this.filters()
    return !!(
      filters.state ||
      filters.typeId ||
      filters.customerId ||
      filters.from ||
      filters.until
    )
  })
  readonly customerEntry = computed(() => this.customers.selectQuery(this.customerQuery()))
  readonly customerBusy = computed(
    () => this.customerEntry().loading || this.customerEntry().refreshing
  )
  readonly customerError = computed(() =>
    this.customerEntry().error ? "No se pudieron cargar los clientes." : ""
  )
  /** Verified type options plus the retained identity; nothing is invented locally. */
  readonly typeOptions = computed<readonly CatalogComboboxOption[]>(() => {
    const loaded = (this.typeEntry().result ?? []).map(type => ({
      value: String(type.id),
      label: type.name
    }))
    const selected = this.selectedType()
    return selected && !loaded.some(option => option.value === String(selected.id))
      ? [
          ...loaded,
          {
            value: String(selected.id),
            label: `${this.retainedLabel(selected, "Tipo")} · no disponible`
          }
        ]
      : loaded
  })
  private readonly loadedCustomers = computed<readonly CatalogComboboxOption[]>(() =>
    (this.customerEntry().result?.items ?? [])
      .filter(customer => customer.isActive)
      .map(customer => ({ value: String(customer.id), label: customer.name }))
  )
  readonly customerOptions = computed<readonly CatalogComboboxOption[]>(() => {
    const selected = this.selectedCustomer()
    const loaded = this.loadedCustomers()
    const retained =
      selected && !loaded.some(option => option.value === String(selected.id))
        ? [
            {
              value: String(selected.id),
              label: `${this.retainedLabel(selected, "Cliente")} · no disponible en esta página`
            }
          ]
        : []
    return [...(selected ? [anyCustomer] : []), ...retained, ...loaded]
  })
  readonly customerLabel = computed(() => {
    const selected = this.selectedCustomer()
    if (!selected) return ""
    const value = String(selected.id)
    return (
      this.customerOptions().find(option => option.value === value)?.label ??
      this.retainedLabel(selected, "Cliente")
    )
  })
  readonly filterSelects = computed<readonly CatalogFilterSelect[]>(() => [
    {
      id: "support-filter-state",
      label: "Estado",
      allLabel: "Todos los estados",
      value: this.filters().state,
      // S4: the backend's fixed state enum; there is no status catalog endpoint.
      options: SUPPORT_STATE_CODES.map(code => ({ value: code, label: code }))
    }
  ])
  readonly filterDates = computed<readonly CatalogFilterDate[]>(() => [
    { id: "support-filter-from", label: "Desde", value: this.filters().from },
    { id: "support-filter-until", label: "Hasta", value: this.filters().until }
  ])
  readonly errorMessage = computed(() => {
    switch (this.error()?.code) {
      case "FORBIDDEN":
        return "No tienes permiso para consultar atenciones."
      case "UNAUTHENTICATED":
        return "La sesión no está disponible. Vuelve a iniciar sesión."
      case "UNAVAILABLE":
        return "No se pudo iniciar la consulta de atenciones. Inténtalo de nuevo."
      default:
        return "No se pudieron cargar las atenciones. Inténtalo de nuevo."
    }
  })

  setSelect(id: string, value: string): void {
    if (this.destroyRef.destroyed || this.departing || !this.scope.check()) return
    if (id !== "support-filter-state") return
    this.changeFilters({ state: this.stateValue(value) })
  }

  /** Only a verified catalog option becomes the filter; a missing choice is not invented. */
  setType(value: string | undefined | null): void {
    if (this.destroyRef.destroyed || this.departing || !this.scope.check()) return
    const next = value ?? ""
    if (next === this.filters().typeId) return
    if (!next) {
      this.selectedType.set(null)
      return this.changeFilters({ typeId: "" })
    }
    const typeId = Number(next)
    if (!Number.isSafeInteger(typeId) || typeId <= 0) return
    const verified = this.typeOptions().find(option => option.value === next)
    if (!verified) return
    this.selectedType.set({ id: typeId, label: verified.label })
    this.changeFilters({ typeId: next })
  }

  /** Only a verified option value reaches the query; the cleared entry drops the identity. */
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
      loaded?.label ??
      (retained && String(retained.id) === value
        ? this.retainedLabel(retained, "Cliente")
        : undefined)
    if (!label) return
    this.selectedCustomer.set({ id: customerId, label })
    this.changeFilters({ customerId: value })
  }

  /** Debounced server search: it never applies, clears or re-reads the list filter. */
  searchCustomers(value: string): void {
    this.queueCustomerRead({ search: value.trim(), force: false, delay: searchDebounceMs })
  }

  /** One forced read of the query currently observed by the picker, nothing else. */
  reloadCustomers(): void {
    this.queueCustomerRead({
      search: this.customerQuery().search ?? "",
      force: true,
      delay: 0
    })
  }

  /** Explicit retry of the finite type catalog only; the inbox query is untouched. */
  retryTypes(): void {
    if (this.destroyRef.destroyed || this.departing || !this.scope.check()) return
    this.typeReads.next(true)
  }

  setDate(id: string, value: string): void {
    if (this.destroyRef.destroyed || this.departing || !this.scope.check()) return
    if (id === "support-filter-from") return this.changeFilters({ from: value })
    if (id === "support-filter-until") this.changeFilters({ until: value })
  }

  /** The verified-empty state offers one explicit way back to the unfiltered page. */
  clearFilters(): void {
    if (this.destroyRef.destroyed || this.departing || !this.scope.check()) return
    this.selectedCustomer.set(null)
    this.selectedType.set(null)
    this.changeFilters(noSupportFilters)
  }

  private queueCustomerRead(request: CustomerPickerRequest): void {
    if (this.destroyRef.destroyed || this.departing || !this.scope.check()) return
    this.customerReads.next(request)
  }

  private stateValue(value: string): string {
    return (SUPPORT_STATE_CODES as readonly string[]).includes(value) ? value : anyState
  }

  /**
   * A blank label is a filter that only the URL named yet, so the identity is described by
   * its own value instead of borrowing a name from somewhere else.
   */
  private retainedLabel(selected: { id: number; label: string }, kind: string): string {
    return selected.label || `${kind} #${selected.id}`
  }

  private entryQuery(params: ParamMap): Query {
    const page = supportPageContext(params)
    return listQuery(page.offset, page.limit, supportFilterContext(params))
  }

  private changeFilters(patch: Partial<SupportFilterValues>): void {
    const filters = { ...this.filters(), ...patch }
    this.filters.set(filters)
    this.recoveryUsed = false
    // Every filter change restarts at page zero and keeps the effective size.
    this.load(listQuery(0, this.query().limit, filters))
  }

  /**
   * S14: publishes the filtered page in the URL. An unchanged context is not a navigation,
   * and the key is recorded first so this page never mistakes its own write for a new context.
   * A bare entry therefore ends up with `?offset=0&limit=20`: offset and limit are always
   * serialized, filters only when they exist, so the URL always describes a restorable page.
   */
  private publish(query: Query): void {
    const params = supportListParams(query, this.filters())
    const key = supportParamsKey(params)
    if (key === this.published) return
    this.published = key
    void this.router
      .navigate([], { relativeTo: this.route, queryParams: params, replaceUrl: true })
      .catch(() => undefined)
  }

  /** A URL change this page did not publish is a new context: adopt it, then read once. */
  private adopt(params: ParamMap): void {
    const key = supportParamsKey(
      supportListParams(supportPageContext(params), supportFilterContext(params))
    )
    if (key === this.published) return
    this.published = key
    if (this.destroyRef.destroyed || this.departing || !this.scope.check()) return
    const filters = supportFilterContext(params)
    this.filters.set(filters)
    this.selectedType.set(filterIdentity(filters.typeId))
    this.selectedCustomer.set(filterIdentity(filters.customerId))
    this.recoveryUsed = false
    this.load(this.entryQuery(params))
  }

  /** Publishing into this same location keeps the owner alive; only leaving stops it. */
  private samePath(url: string): boolean {
    const path = (value: string) => {
      const segments = value.split(/[?#]/)[0]
      return segments.length > 1 && segments.endsWith("/") ? segments.slice(0, -1) : segments
    }
    return path(url) === path(this.router.url)
  }

  /**
   * Create-only overlay: the dialog owns the form and the store owns the write. The page
   * captures this dialog's identity so a late completion of a replaced overlay emits nothing.
   */
  create(): void {
    if (
      this.destroyRef.destroyed ||
      this.departing ||
      this.writing() ||
      !this.scope.check() ||
      this.dialog?.open
    )
      return
    const revision = this.revision
    const generation = this.scope.generation()
    const identity = {}
    this.dialogIdentity = identity
    const current = () =>
      !this.destroyRef.destroyed &&
      !this.departing &&
      this.dialogIdentity === identity &&
      revision === this.revision &&
      this.scope.check() &&
      generation === this.scope.generation() &&
      !!this.dialog?.open
    const context: SupportRequestCreateContext = {
      owner: this.destroyRef,
      current,
      onCreated: () => {
        if (current()) this.toast.success("Atención creada correctamente.")
      }
    }
    this.dialog = this.dialogs.open(SupportRequestCreateDialog, {
      context,
      disableClose: true,
      showCloseButton: false,
      contentClass: "sm:max-w-xl max-h-[90dvh] overflow-y-auto"
    })
  }

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.stopEditor())
    const ready = this.scope.check()
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(event => {
      if (event instanceof NavigationStart) {
        // S14: publishing this page into the URL keeps the same location, so it is not leaving.
        if (this.samePath(event.url)) return
        this.departing = true
        this.stopEditor()
        this.revision++
        this.customerReads.next(null)
        this.typeReads.next(null)
        this.queries.next(null)
      }
    })
    // S14: a URL this page did not publish is the new filter and page context.
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.adopt(params)
    })
    // One picker query is observed at a time: a new search supersedes the previous read, so
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
    this.typeReads
      .pipe(
        switchMap(force => {
          if (force === null) return EMPTY
          const generation = this.scope.generation()
          return this.store.observeRequestTypes(force).pipe(takeUntil(this.scope.cancelled$))
        }),
        catchError(() => EMPTY),
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
          return this.store.observeRequests(query, force).pipe(
            takeUntil(this.scope.cancelled$),
            tap(response => {
              if (!this.current(generation, revision)) return
              if (!response.success) {
                if (!this.store.selectRequests(query).error) this.admissionError.set(response.error)
                return
              }
              // One bounded out-of-range recovery per user action, never a rewrite of the page.
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
                  listQuery(
                    Math.floor((page.total - 1) / page.limit) * page.limit,
                    page.limit,
                    this.filters()
                  ),
                  true
                )
              })
            }),
            catchError(() => {
              if (this.current(generation, revision))
                this.admissionError.set(new CustomerSupportError("UNEXPECTED"))
              return EMPTY
            })
          )
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
    if (ready) this.load(this.requested())
    if (ready) this.typeReads.next(false)
    if (ready) this.customerReads.next({ search: "", force: false, delay: 0 })
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
    this.publish(query)
    this.queries.next({ query, force })
  }

  /** The overlay cannot schedule an exit render after its injector is destroyed. */
  private stopEditor(): void {
    const dialog = this.dialog
    this.dialog = undefined
    this.dialogIdentity = undefined
    if (this.destroyRef.destroyed) dialog?.forceClose()
    else dialog?.close()
  }

  retry(): void {
    this.recoveryUsed = false
    this.load(this.requested(), true)
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
    this.load(listQuery((page - 1) * this.query().limit, this.query().limit, this.filters()))
  }
}
