import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { Observable, Subject, switchMap, takeUntil } from "rxjs"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { BrnDialogRef } from "@spartan-ng/brain/dialog"
import { HotToastService } from "@ngxpert/hot-toast"
import { LeadEditor } from "../../components/lead-editor/lead-editor"
import { ActivatedRoute, RouterLink } from "@angular/router"
import { leadPageContext } from "./lead-page-context"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmTableImports } from "@spartan-ng/helm/table"
import { HlmBadgeImports } from "@spartan-ng/helm/badge"
import { HlmEmptyImports } from "@spartan-ng/helm/empty"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { CatalogFrame } from "@/app/shared/components/catalog-frame/catalog-frame"
import { TablePagination } from "@/app/shared/components/table-pagination/table-pagination"
import { NormalizedPagination } from "@/app/shared/pagination/pagination.params"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { CustomerAcquisitionStore } from "../../state/customer-acquisition.store"
import { CrmCatalogNavigation } from "../../components/crm-catalog-navigation/crm-catalog-navigation"

@Component({
  selector: "app-leads-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    CrmCatalogNavigation,
    CatalogFrame,
    TablePagination,
    HlmButtonImports,
    HlmTableImports,
    HlmBadgeImports,
    HlmEmptyImports,
    HlmAlertImports,
    HlmSpinnerImports
  ],
  templateUrl: "./leads-page.html"
})
export class LeadsPage implements OnInit {
  private readonly acquisition = inject(CustomerAcquisitionStore)
  private readonly destroyRef = inject(DestroyRef)
  private readonly dialogs = inject(HlmDialogService)
  private readonly toast = inject(HotToastService)
  private dialog: BrnDialogRef | undefined
  readonly writing = this.acquisition.writing
  readonly origins = computed(() => this.acquisition.origins())
  readonly stages = computed(() => this.acquisition.stages())
  private readonly requestedQuery = signal<NormalizedPagination>(
    leadPageContext(inject(ActivatedRoute).snapshot.queryParamMap)
  )
  private readonly selection = computed(() => this.acquisition.selectLeads(this.requestedQuery()))
  readonly list = computed(() => this.selection()())
  readonly result = computed(() => this.list().data)
  readonly rows = computed(() => this.result()?.items ?? [])
  // Effective metadata drives navigation without changing the store's independent query keys.
  readonly query = computed(() => {
    const page = this.result()
    return page ? { offset: page.offset, limit: page.limit } : this.requestedQuery()
  })
  readonly currentPage = computed(() => this.query().offset / this.query().limit + 1)
  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil((this.result()?.total ?? 0) / this.query().limit))
  )
  readonly rangeStart = computed(() => (this.rows().length ? this.result()!.offset + 1 : 0))
  readonly rangeEnd = computed(() =>
    this.rows().length ? this.result()!.offset + this.rows().length : 0
  )
  originLabel(id: number): string {
    return this.origins().data?.find(origin => origin.id === id)?.name ?? "Origen no disponible"
  }
  stageLabel(id: number): string {
    return this.stages().data?.find(stage => stage.id === id)?.name ?? "Etapa no disponible"
  }
  private readCatalog(read: (force: boolean) => Observable<unknown>, force = false): void {
    if (this.destroyRef.destroyed || !this.scope.check()) return
    read(force)
      .pipe(takeUntil(this.scope.cancelled$), takeUntilDestroyed(this.destroyRef))
      .subscribe()
  }
  retryOrigins(): void {
    this.readCatalog(force => this.acquisition.loadOrigins(force), true)
  }
  retryStages(): void {
    this.readCatalog(force => this.acquisition.loadStages(force), true)
  }
  readonly errorMessage = computed(() => {
    switch (this.list().error?.code) {
      case "FORBIDDEN":
        return "No tienes permiso para consultar prospectos."
      case "UNAUTHENTICATED":
        return "La sesión no está disponible. Vuelve a iniciar sesión."
      case "UNCONFIGURED":
        return "El servicio de prospectos no está disponible en este entorno."
      default:
        return "No se pudieron cargar los prospectos. Inténtalo de nuevo."
    }
  })
  private readonly queries = new Subject<{ query: NormalizedPagination; force: boolean }>()
  private recoveryUsed = false
  private requestRevision = 0
  private readonly scope = createSessionReadScope(() => {
    this.requestRevision++
    this.dialog?.close()
  })

  create(): void {
    if (this.destroyRef.destroyed || !this.scope.check() || this.writing() || this.dialog?.open)
      return
    const generation = this.scope.generation()
    const current = () =>
      !this.destroyRef.destroyed &&
      this.scope.check() &&
      generation === this.scope.generation() &&
      !!this.dialog?.open
    this.dialog = this.dialogs.open(LeadEditor, {
      context: {
        owner: this.destroyRef,
        current,
        onSaved: () => {
          if (current()) this.toast.success("Prospecto creado correctamente.")
        }
      },
      showCloseButton: false,
      disableClose: true,
      contentClass: "sm:max-w-2xl"
    })
  }

  ngOnInit(): void {
    this.scope.check()
    this.readCatalog(force => this.acquisition.loadOrigins(force))
    this.readCatalog(force => this.acquisition.loadStages(force))
    this.destroyRef.onDestroy(() => this.dialog?.close())
    this.queries
      .pipe(
        switchMap(({ query, force }) => {
          this.requestedQuery.set(query)
          return this.acquisition.observeLeads(query, force)
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(response => {
        if (!response.success || !response.data || this.recoveryUsed) return
        const page = response.data
        if (page.items.length || page.total === 0 || page.offset < page.total) return
        this.recoveryUsed = true
        const revision = this.requestRevision
        // Avoid synchronous cache reentry and fence queued recovery across session changes.
        queueMicrotask(() => {
          if (this.destroyRef.destroyed || revision !== this.requestRevision) return
          this.load(
            { offset: Math.floor((page.total - 1) / page.limit) * page.limit, limit: page.limit },
            true
          )
        })
      })
    this.load(this.requestedQuery())
  }

  private load(query: NormalizedPagination, force = false): void {
    if (this.destroyRef.destroyed || !this.scope.check()) return
    this.requestRevision++
    this.queries.next({ query, force })
  }

  retry(): void {
    this.recoveryUsed = false
    this.load(this.requestedQuery(), true)
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
