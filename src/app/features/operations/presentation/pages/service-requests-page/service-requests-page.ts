import { Component, computed, DestroyRef, inject, OnInit, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import {
  ActivatedRoute,
  NavigationStart,
  Router,
  RouterLink,
  RouterLinkActive
} from "@angular/router"
import { catchError, EMPTY, Subject, switchMap, takeUntil, tap } from "rxjs"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmBadgeImports } from "@spartan-ng/helm/badge"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmEmptyImports } from "@spartan-ng/helm/empty"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { HlmTableImports } from "@spartan-ng/helm/table"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { CatalogFrame } from "@/app/shared/components/catalog-frame/catalog-frame"
import { TablePagination } from "@/app/shared/components/table-pagination/table-pagination"
import { PaginationParams } from "@/app/shared/pagination/pagination.params"
import { OperationsError } from "../../../domain/errors/operations.error"
import {
  serviceRequestPageContext,
  serviceRequestPagingParams
} from "../../navigation/service-request-page-context"
import { ServiceRequestsStore } from "../../state/service-requests.store"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { BrnDialogRef } from "@spartan-ng/brain/dialog"
import { HotToastService } from "@ngxpert/hot-toast"
import { ServiceRequestEditor } from "../../components/service-request-editor/service-request-editor"

type Query = Required<PaginationParams>

@Component({
  selector: "app-service-requests-page",
  imports: [
    RouterLink,
    RouterLinkActive,
    CatalogFrame,
    TablePagination,
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmEmptyImports,
    HlmSpinnerImports,
    HlmTableImports
  ],
  templateUrl: "./service-requests-page.html"
})
export class ServiceRequestsPage implements OnInit {
  private readonly store = inject(ServiceRequestsStore)
  private readonly route = inject(ActivatedRoute)
  private readonly router = inject(Router)
  private readonly destroyRef = inject(DestroyRef)
  private readonly dialogs = inject(HlmDialogService)
  private readonly toast = inject(HotToastService)
  private dialog: BrnDialogRef | undefined
  private dialogIdentity: object | undefined
  readonly writing = this.store.writing
  private readonly requested = signal<Query>(
    serviceRequestPageContext(this.route.snapshot.queryParamMap)
  )
  private readonly admissionError = signal<OperationsError | undefined>(undefined)
  private readonly queries = new Subject<{ query: Query; force: boolean } | null>()
  private revision = 0
  private recoveryUsed = false
  private departing = false
  private readonly scope = createSessionReadScope(() => {
    this.dialog?.close()
    this.revision++
    this.queries.next(null)
    this.admissionError.set(undefined)
    this.requested.set({ offset: 0, limit: 20 })
    const generation = this.scope.generation()
    // Session reset runs inside a transition; wait before admitting new reads.
    queueMicrotask(() => {
      if (!this.current(generation)) return
      this.recoveryUsed = false
      this.load({ offset: 0, limit: 20 })
    })
  })

  readonly list = computed(() => this.store.selectRequests(this.requested()))
  readonly result = computed(() => this.list().result)
  readonly rows = computed(() => this.result()?.items ?? [])
  // Effective metadata is a projection, not a second query/read when server size changes.
  readonly query = computed<Query>(() => {
    const page = this.result()
    return page ? { offset: page.offset, limit: page.limit } : this.requested()
  })
  readonly paging = computed(() => serviceRequestPagingParams(this.query()))
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
        return "No tienes permiso para consultar solicitudes."
      case "UNAUTHENTICATED":
        return "La sesión no está disponible. Vuelve a iniciar sesión."
      case "UNCONFIGURED":
        return "El servicio de solicitudes no está disponible en este entorno."
      case "UNAVAILABLE":
        return "No se pudo iniciar la consulta de solicitudes. Inténtalo de nuevo."
      default:
        return "No se pudieron cargar las solicitudes. Inténtalo de nuevo."
    }
  })

  create(): void {
    if (
      this.destroyRef.destroyed ||
      this.departing ||
      !this.scope.check() ||
      this.writing() ||
      this.dialog?.open
    )
      return
    const generation = this.scope.generation()
    const identity = {}
    this.dialogIdentity = identity
    const current = () =>
      this.dialogIdentity === identity && this.current(generation) && !!this.dialog?.open
    this.dialog = this.dialogs.open(ServiceRequestEditor, {
      context: {
        owner: this.destroyRef,
        current,
        onSaved: () => {
          if (current()) this.toast.success("Solicitud creada correctamente.")
        }
      },
      disableClose: true,
      showCloseButton: false,
      contentClass: "sm:max-w-xl max-h-[90dvh] overflow-y-auto"
    })
  }

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.dialog?.close())
    const ready = this.scope.check()
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(event => {
      if (event instanceof NavigationStart) {
        this.departing = true
        this.dialog?.close()
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
                this.admissionError.set(new OperationsError("UNKNOWN", "Request read failed"))
              return EMPTY
            })
          )
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
    if (ready) this.load(this.requested())
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
}
