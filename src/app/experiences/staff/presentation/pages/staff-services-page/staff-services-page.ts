import { Component, computed, DestroyRef, inject, OnInit, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { ActivatedRoute, RouterLink } from "@angular/router"
import { catchError, EMPTY, Subject, switchMap, takeUntil, tap } from "rxjs"
import { HlmAlert, HlmAlertDescription, HlmAlertTitle } from "@spartan-ng/helm/alert"
import { HlmBadge } from "@spartan-ng/helm/badge"
import { HlmButton } from "@spartan-ng/helm/button"
import {
  HlmEmpty,
  HlmEmptyDescription,
  HlmEmptyHeader,
  HlmEmptyTitle
} from "@spartan-ng/helm/empty"
import { HlmSpinner } from "@spartan-ng/helm/spinner"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { OperationsError } from "@/app/features/operations/domain/errors/operations.error"
import { ServiceOrderSummary } from "@/app/features/operations/domain/models/operations-read.models"
import { ServiceOrdersStore } from "@/app/features/operations/presentation/state/service-orders.store"
import { CatalogFrame } from "@/app/shared/components/catalog-frame/catalog-frame"
import { TablePagination } from "@/app/shared/components/table-pagination/table-pagination"
import { PaginationParams } from "@/app/shared/pagination/pagination.params"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { BadgeTone } from "@/app/shared/ui/badge-tone.directive"
import { staffServicesPageContext, staffServicesPagingParams } from "./staff-services-paging"

type Query = Required<PaginationParams>
type Page = PaginationResponse<ServiceOrderSummary>

/**
 * WP11 T2 / S4 — `/staff/services`, «Mis servicios»: the service orders the backend already scoped
 * to the authenticated staff member.
 *
 * The scope is caller-relative (`ORDEN_LEER_ASIGNADA` resolves it through the staff record of the
 * session), so this consumer never sends a staff id and never filters or slices a downloaded page:
 * it asks for one page through the existing root `ServiceOrdersStore` and shows exactly what came
 * back. Paging, freshness (30000 ms, success-only), same-key stale data, ref-counted flights and
 * session fencing stay in that store; this page owns only its query, its state feedback, its
 * cancellation and one bounded out-of-range recovery per user action.
 *
 * Its initial offset/limit are read once, on entry, through the staff paging contract
 * (`staff-services-paging`), so returning from a detail lands on the page the staff member came
 * from; later navigation stays page state and is not written back to the URL. Every row link carries
 * the effective page it has verified, never the requested size and never a bare id.
 *
 * The records are cards, not a table, because this surface is used on a phone in the field. Status
 * text and schedule date/clock text are printed exactly as the server supplied them: no transition
 * table, no status catalog, no timezone shift and no KPI, filter or total is derived here.
 */
@Component({
  selector: "app-staff-services-page",
  imports: [
    RouterLink,
    CatalogFrame,
    TablePagination,
    BadgeTone,
    HlmAlert,
    HlmAlertDescription,
    HlmAlertTitle,
    HlmBadge,
    HlmButton,
    HlmEmpty,
    HlmEmptyDescription,
    HlmEmptyHeader,
    HlmEmptyTitle,
    HlmSpinner
  ],
  templateUrl: "./staff-services-page.html"
})
export class StaffServicesPage implements OnInit {
  private readonly store = inject(ServiceOrdersStore)
  private readonly destroyRef = inject(DestroyRef)
  private readonly route = inject(ActivatedRoute)
  /** Captured once, through the staff paging contract: entry only, never a live binding. */
  private readonly entry = staffServicesPageContext(this.route.snapshot.queryParamMap)
  private readonly requested = signal<Query>(this.entry)
  private readonly admissionError = signal<OperationsError | undefined>(undefined)
  private readonly queries = new Subject<{ query: Query; force: boolean } | null>()
  private revision = 0
  private recoveryUsed = false
  private readonly scope = createSessionReadScope(() => {
    this.revision++
    this.queries.next(null)
    this.admissionError.set(undefined)
    this.requested.set(this.entry)
    const generation = this.scope.generation()
    // A session replacement runs inside a transition; wait before admitting the new read.
    queueMicrotask(() => {
      if (!this.current(generation)) return
      this.recoveryUsed = false
      this.load(this.entry)
    })
  })

  readonly list = computed(() => this.store.selectOrders(this.requested()))
  readonly result = computed(() => this.list().result)
  readonly rows = computed(() => this.result()?.items ?? [])
  /** Effective server metadata, never the requested one, once a page is verified. */
  readonly query = computed<Query>(() => {
    const page = this.result()
    return page ? { offset: page.offset, limit: page.limit } : this.requested()
  })
  readonly currentPage = computed(() => Math.floor(this.query().offset / this.query().limit) + 1)
  /** URL page/size pair for the row links, derived from the effective returned metadata. */
  readonly paging = computed(() => staffServicesPagingParams(this.query()))
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
        return "No tienes permiso para consultar tus servicios asignados."
      case "UNAUTHENTICATED":
        return "La sesión no está disponible. Vuelve a iniciar sesión."
      case "UNCONFIGURED":
        return "El servicio de órdenes no está disponible en este entorno."
      case "UNAVAILABLE":
        return "No se pudo iniciar la consulta de tus servicios. Inténtalo de nuevo."
      default:
        return "No se pudieron cargar tus servicios asignados. Inténtalo de nuevo."
    }
  })

  ngOnInit(): void {
    this.queries
      .pipe(
        switchMap(request => {
          if (!request) return EMPTY
          const { query, force } = request
          const revision = this.revision
          const generation = this.scope.generation()
          return this.store.observeOrders(query, force).pipe(
            takeUntil(this.scope.cancelled$),
            tap(response => {
              if (!this.current(generation, revision)) return
              if (!response.success) {
                if (!this.store.selectOrders(query).error) this.admissionError.set(response.error)
                return
              }
              const page = response.data
              // One bounded recovery: the server shrank and this page is past its own total.
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
                    offset: Math.floor((page.total - 1) / page.limit) * page.limit,
                    limit: page.limit
                  },
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
    if (this.scope.check()) this.load(this.entry)
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
    this.load({ offset: (page - 1) * this.query().limit, limit: this.query().limit })
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
}
