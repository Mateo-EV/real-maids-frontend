import { Component, computed, DestroyRef, inject, OnInit, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { ActivatedRoute, ParamMap, RouterLink } from "@angular/router"
import { catchError, EMPTY, Subject, switchMap, takeUntil, tap } from "rxjs"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmBadgeImports } from "@spartan-ng/helm/badge"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmEmptyImports } from "@spartan-ng/helm/empty"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { HlmTableImports } from "@spartan-ng/helm/table"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { CustomerSupportError } from "@/app/features/customer-support/domain/errors/customer-support.error"
import { SupportRequestView } from "@/app/features/customer-support/domain/models/support-views"
import { SupportRequestQuery } from "@/app/features/customer-support/domain/params/customer-support.params"
import { SupportRequestsStore } from "@/app/features/customer-support/presentation/state/support-requests.store"
import {
  portalSupportPageContext,
  portalSupportPagingParams
} from "@/app/experiences/portal/presentation/navigation/portal-support-page-context"
import { CatalogFrame } from "@/app/shared/components/catalog-frame/catalog-frame"
import { TablePagination } from "@/app/shared/components/table-pagination/table-pagination"
import { PaginationParams } from "@/app/shared/pagination/pagination.params"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { BadgeTone } from "@/app/shared/ui/badge-tone.directive"
import { NgIcon, provideIcons } from "@ng-icons/core"
import { lucidePlus } from "@ng-icons/lucide"

type Query = Required<PaginationParams> & SupportRequestQuery
type Page = PaginationResponse<SupportRequestView>

const firstPage: Query = { offset: 0, limit: 20 }
/** Documented backend maximum page size; anything larger is out of contract and never dispatched. */
const maxPageSize = 100

/**
 * Entry paging comes from the URL so a detail's return link restores the visited page. The list
 * itself never writes paging back. A malformed, missing, duplicated, negative, non-int32 or
 * out-of-contract pair falls back to the documented first page instead of inventing an offset.
 */
function entryQuery(params: ParamMap): Query {
  const query = portalSupportPageContext(params)
  return query.limit > maxPageSize ? { ...firstPage } : query
}

/**
 * WP10 T5 / S7 — `/portal/support`, the customer's own read-only support attentions (P10).
 *
 * The backend already scopes `GET /api/atenciones` to the caller, so this consumer never sends a
 * customer id and never filters or slices locally: it asks for one page and shows exactly what came
 * back. There are no filters on this surface — the states are the backend's closed vocabulary and
 * its supplied display name, printed as received, so nothing here derives, translates or invents a
 * state and nothing encodes a transition (that is the staff screen's authority).
 *
 * Paging, freshness (30000 ms, success-only), same-key stale data, the pinned registry and session
 * fencing stay in the existing root `SupportRequestsStore`; this page owns only its query, its state
 * feedback and its cancellation.
 *
 * Its initial offset/limit are read from `page`/`size` once, on entry, so returning from a detail
 * lands on the page the customer came from; later navigation is not written back to the URL.
 *
 * Rows open their own read-only detail with the effective page context in the URL. The single action
 * opens the own-attention creation form (`/portal/support/new`); no filter, total or KPI is invented
 * here. `creada=1` is the confirmation carried back when the created record came without an id, so
 * the customer sees a confirmed message instead of a guessed destination.
 */
@Component({
  selector: "app-portal-support-page",
  imports: [
    RouterLink,
    NgIcon,
    CatalogFrame,
    TablePagination,
    BadgeTone,
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmEmptyImports,
    HlmSpinnerImports,
    HlmTableImports
  ],
  providers: [provideIcons({ lucidePlus })],
  templateUrl: "./portal-support-page.html"
})
export class PortalSupportPage implements OnInit {
  private readonly store = inject(SupportRequestsStore)
  private readonly destroyRef = inject(DestroyRef)
  private readonly route = inject(ActivatedRoute)
  /** Captured once: entry paging only, never a live URL binding. */
  private readonly entry = entryQuery(this.route.snapshot.queryParamMap)
  /** Confirmed creation that reached this list without a record id to open. */
  readonly created = this.route.snapshot.queryParamMap.get("creada") === "1"
  private readonly requested = signal<Query>(this.entry)
  private readonly admissionError = signal<CustomerSupportError | undefined>(undefined)
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

  readonly list = computed(() => this.store.selectRequests(this.requested()))
  readonly result = computed(() => this.list().result)
  readonly rows = computed(() => this.result()?.items ?? [])
  /** Effective server metadata, never the requested one, once a page is verified. */
  readonly query = computed<Query>(() => {
    const page = this.result()
    return page ? { offset: page.offset, limit: page.limit } : this.requested()
  })
  readonly currentPage = computed(() => Math.floor(this.query().offset / this.query().limit) + 1)
  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil((this.result()?.total ?? 0) / this.query().limit))
  )
  /** URL page/size pair for the detail link, derived from the effective returned metadata. */
  readonly paging = computed(() => portalSupportPagingParams(this.query()))
  readonly rangeStart = computed(() => (this.rows().length ? this.result()!.offset + 1 : 0))
  readonly rangeEnd = computed(() =>
    this.rows().length ? this.result()!.offset + this.rows().length : 0
  )
  readonly error = computed(() => this.list().error ?? this.admissionError())
  readonly errorMessage = computed(() => {
    switch (this.error()?.code) {
      case "FORBIDDEN":
        return "No tienes permiso para consultar tus atenciones."
      case "UNAUTHENTICATED":
        return "La sesión no está disponible. Vuelve a iniciar sesión."
      case "UNAVAILABLE":
        return "No se pudo iniciar la consulta de tus atenciones. Inténtalo de nuevo."
      default:
        return "No se pudieron cargar tus atenciones. Inténtalo de nuevo."
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
          return this.store.observeRequests(query, force).pipe(
            takeUntil(this.scope.cancelled$),
            tap(response => {
              if (!this.current(generation, revision)) return
              if (!response.success) {
                if (!this.store.selectRequests(query).error) this.admissionError.set(response.error)
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
                    offset: Math.floor((page.total - 1) / page.limit) * page.limit,
                    limit: page.limit
                  },
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
