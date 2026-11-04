import { isPlatformBrowser, Location } from "@angular/common"
import {
  Component,
  computed,
  DestroyRef,
  inject,
  Injector,
  OnInit,
  PLATFORM_ID,
  signal
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { ActivatedRoute, RouterLink } from "@angular/router"
import { catchError, debounceTime, EMPTY, Subject, switchMap, takeUntil, tap } from "rxjs"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmBadgeImports } from "@spartan-ng/helm/badge"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmEmptyImports } from "@spartan-ng/helm/empty"
import { HlmInputImports } from "@spartan-ng/helm/input"
import { HlmLabelImports } from "@spartan-ng/helm/label"
import { HlmNativeSelectImports } from "@spartan-ng/helm/native-select"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { HlmTableImports } from "@spartan-ng/helm/table"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { CatalogFrame } from "@/app/shared/components/catalog-frame/catalog-frame"
import { TablePagination } from "@/app/shared/components/table-pagination/table-pagination"
import { FieldOperationsError } from "../../../domain/errors/field-operations.error"
import { FieldStaffQuery } from "../../../domain/params/field-operations.params"
import {
  staffPageContext,
  staffPagingParams,
  staffReturnFilters,
  staffReturnState,
  StaffNavigationOwner
} from "../../navigation/staff-page-context"
import { FieldStaffStore } from "../../state/field-staff.store"

type Query = FieldStaffQuery & { offset: number; limit: number }

@Component({
  selector: "app-staff-page",
  imports: [
    RouterLink,
    CatalogFrame,
    TablePagination,
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmEmptyImports,
    HlmInputImports,
    HlmLabelImports,
    HlmNativeSelectImports,
    HlmSpinnerImports,
    HlmTableImports
  ],
  templateUrl: "./staff-page.html"
})
export class StaffPage implements OnInit {
  private readonly staff = inject(FieldStaffStore)
  private readonly injector = inject(Injector)
  private readonly destroyRef = inject(DestroyRef)
  private readonly route = inject(ActivatedRoute)
  private readonly location = inject(Location)
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID))
  private readonly requested = signal<Query>(staffPageContext(this.route.snapshot.queryParamMap))
  private readonly navigationOwner = signal<StaffNavigationOwner | null>(null)
  // Only controls and admission failures are local; verified read state stays in the root store.
  readonly searchDraft = signal("")
  readonly active = signal<boolean | null>(null)
  private readonly admissionError = signal<FieldOperationsError | undefined>(undefined)
  readonly list = computed(() => this.staff.selectStaff(this.requested()))
  readonly result = computed(() => this.list().result)
  readonly rows = computed(() => this.result()?.items ?? [])
  readonly query = computed<Query>(() => {
    const page = this.result()
    return page ? { ...this.requested(), offset: page.offset, limit: page.limit } : this.requested()
  })
  readonly paging = computed(() => staffPagingParams(this.query()))
  readonly returnState = computed(() => staffReturnState(this.query(), this.navigationOwner()))
  readonly currentPage = computed(() => this.query().offset / this.query().limit + 1)
  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil((this.result()?.total ?? 0) / this.query().limit))
  )
  readonly rangeStart = computed(() => (this.rows().length ? this.result()!.offset + 1 : 0))
  readonly rangeEnd = computed(() =>
    this.rows().length ? this.result()!.offset + this.rows().length : 0
  )
  readonly error = computed(() => this.list().error ?? this.admissionError())
  readonly errorMessage = computed(() => {
    switch (this.error()?.code) {
      case "FORBIDDEN":
        return "No tienes permiso para consultar personal."
      case "UNAUTHENTICATED":
        return "La sesión no está disponible. Vuelve a iniciar sesión."
      case "UNCONFIGURED":
        return "El servicio de personal no está disponible en este entorno."
      case "UNAVAILABLE":
        return "No se pudo iniciar la consulta de personal. Inténtalo de nuevo."
      default:
        return "No se pudo cargar el personal. Inténtalo de nuevo."
    }
  })
  private readonly queries = new Subject<{ query: Query; force: boolean } | null>()
  private readonly searches = new Subject<{ text: string; generation: number }>()
  private revision = 0
  private recoveryUsed = false
  private readonly scope = createSessionReadScope(() => {
    this.revision++
    this.queries.next(null)
    this.navigationOwner.set(null)
    this.searchDraft.set("")
    this.active.set(null)
    this.admissionError.set(undefined)
    this.requested.set({ offset: 0, limit: 20 })
    const generation = this.scope.generation()
    // Session notifications run inside a transition. Read only after that transition settles.
    queueMicrotask(() => {
      if (!this.current(generation)) return
      this.captureOwner()
      this.recoveryUsed = false
      this.load({ offset: 0, limit: 20 })
    })
  })

  ngOnInit(): void {
    const ready = this.scope.check()
    if (ready) {
      this.captureOwner()
      const filters = staffReturnFilters(
        this.browser ? this.location.getState() : undefined,
        this.navigationOwner()
      )
      this.requested.update(query => ({ ...query, ...filters }))
      this.searchDraft.set(filters.search ?? "")
      this.active.set(filters.isActive ?? null)
    }
    this.queries
      .pipe(
        switchMap(request => {
          if (!request) return EMPTY
          const { query, force } = request
          const revision = this.revision,
            generation = this.scope.generation()
          return this.staff.observeStaff(query, force).pipe(
            takeUntil(this.scope.cancelled$),
            tap(response => {
              if (!this.current(generation, revision)) return
              if (!response.success) {
                if (!this.staff.selectStaff(query).error) this.admissionError.set(response.error)
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
                  {
                    ...query,
                    offset: Math.floor((page.total - 1) / page.limit) * page.limit,
                    limit: page.limit
                  },
                  true
                )
              })
            }),
            catchError(() => {
              if (this.current(generation, revision))
                this.admissionError.set(new FieldOperationsError("UNKNOWN", "Staff read failed"))
              return EMPTY
            })
          )
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
    this.searches
      .pipe(debounceTime(250), takeUntilDestroyed(this.destroyRef))
      .subscribe(({ text, generation }) => {
        if (!this.current(generation)) return
        const search = text.trim()
        if (search === (this.requested().search ?? "")) return
        this.recoveryUsed = false
        this.load({ ...this.query(), offset: 0, search: search || undefined })
      })
    if (ready) this.load(this.requested())
  }

  private captureOwner(): void {
    const session = this.injector.get(AuthStore).session()
    this.navigationOwner.set(
      session && session.expiresAt !== null && session.expiresAt > Date.now()
        ? { userId: session.id, sessionDeadline: session.expiresAt }
        : null
    )
  }

  private current(generation: number, revision?: number): boolean {
    return (
      !this.destroyRef.destroyed &&
      this.scope.check() &&
      generation === this.scope.generation() &&
      (revision === undefined || revision === this.revision)
    )
  }

  private load(query: Query, force = false): void {
    if (this.destroyRef.destroyed || !this.scope.check()) return
    this.revision++
    this.admissionError.set(undefined)
    this.requested.set(query)
    this.queries.next({ query, force })
  }

  search(event: Event): void {
    if (this.destroyRef.destroyed || !this.scope.check()) return
    const text = (event.target as HTMLInputElement).value
    this.searchDraft.set(text)
    this.searches.next({ text, generation: this.scope.generation() })
  }

  filterActive(value: string | null | undefined): void {
    if (
      this.destroyRef.destroyed ||
      !this.scope.check() ||
      !["all", "true", "false"].includes(value ?? "")
    )
      return
    const active = value === "all" ? null : value === "true"
    if (active === this.active()) return
    this.active.set(active)
    this.recoveryUsed = false
    this.load({ ...this.query(), offset: 0, isActive: active ?? undefined })
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
    this.load({ ...this.query(), offset: (page - 1) * this.query().limit })
  }
}
