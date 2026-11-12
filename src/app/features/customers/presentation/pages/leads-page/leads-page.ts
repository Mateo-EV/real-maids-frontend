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
import { Observable, of, Subject, switchMap, takeUntil, timer } from "rxjs"
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
import { NgIcon, provideIcons } from "@ng-icons/core"
import { lucidePlus } from "@ng-icons/lucide"
import { CatalogFrame } from "@/app/shared/components/catalog-frame/catalog-frame"
import {
  CatalogFilterSelect,
  CatalogFilters
} from "@/app/shared/components/catalog-filters/catalog-filters"
import { TablePagination } from "@/app/shared/components/table-pagination/table-pagination"
import { NormalizedPagination } from "@/app/shared/pagination/pagination.params"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { LeadListQuery } from "../../../domain/models/lead-list-query"
import { CustomerAcquisitionStore } from "../../state/customer-acquisition.store"
import { CrmCatalogNavigation } from "../../components/crm-catalog-navigation/crm-catalog-navigation"

@Component({
  selector: "app-leads-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    CrmCatalogNavigation,
    CatalogFrame,
    CatalogFilters,
    TablePagination,
    HlmButtonImports,
    HlmTableImports,
    HlmBadgeImports,
    HlmEmptyImports,
    HlmAlertImports,
    HlmSpinnerImports,
    NgIcon
  ],
  providers: [provideIcons({ lucidePlus })],
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
  private readonly requestedQuery = signal<LeadListQuery>(
    leadPageContext(inject(ActivatedRoute).snapshot.queryParamMap)
  )
  readonly search = signal("")
  readonly originId = signal<number | "">("")
  readonly stageId = signal<number | "">("")
  readonly converted = signal<boolean | "">("")
  /** Options come from the existing root catalog reads; no extra read contract is added. */
  readonly filterSelects = computed<readonly CatalogFilterSelect[]>(() => {
    const converted = this.converted()
    return [
      {
        id: "lead-filter-origin",
        label: "Origen",
        allLabel: "Todos los orígenes",
        value: this.originId() === "" ? "" : String(this.originId()),
        options: (this.origins().data ?? []).map(origin => ({
          value: String(origin.id),
          label: `${origin.name} · ${origin.isActive ? "Activo" : "Inactivo"}`
        }))
      },
      {
        id: "lead-filter-stage",
        label: "Etapa",
        allLabel: "Todas las etapas",
        value: this.stageId() === "" ? "" : String(this.stageId()),
        options: (this.stages().data ?? []).map(stage => ({
          value: String(stage.id),
          label: `${stage.name}${stage.isFinal ? " · Final" : ""}`
        }))
      },
      {
        id: "lead-filter-converted",
        label: "Conversión",
        allLabel: "Todos",
        value: converted === "" ? "" : converted ? "true" : "false",
        options: [
          { value: "false", label: "No convertido" },
          { value: "true", label: "Convertido" }
        ]
      }
    ]
  })
  readonly hasFilters = computed(
    () =>
      !!this.search().trim() ||
      this.originId() !== "" ||
      this.stageId() !== "" ||
      this.converted() !== ""
  )
  private readonly selection = computed(() => this.acquisition.selectLeads(this.requestedQuery()))
  readonly list = computed(() => this.selection()())
  readonly result = computed(() => this.list().data)
  readonly rows = computed(() => this.result()?.items ?? [])
  // Effective metadata drives navigation without changing the store's independent query keys.
  // Only paging is return context: filters never reach the list/detail URLs.
  readonly query = computed<NormalizedPagination>(() => {
    const page = this.result(),
      requested = this.requestedQuery()
    return page
      ? { offset: page.offset, limit: page.limit }
      : { offset: requested.offset ?? 0, limit: requested.limit ?? 20 }
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
  private readonly queries = new Subject<{
    query: LeadListQuery
    delay: number
    force: boolean
  }>()
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
        switchMap(({ query, delay, force }) =>
          (delay ? timer(delay) : of(0)).pipe(
            switchMap(() => {
              this.requestedQuery.set(query)
              return this.acquisition.observeLeads(query, force)
            })
          )
        ),
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
            {
              ...this.requestedQuery(),
              offset: Math.floor((page.total - 1) / page.limit) * page.limit,
              limit: page.limit
            },
            true
          )
        })
      })
    this.load(this.requestedQuery())
  }

  private load(query: LeadListQuery, force = false, delay = 0): void {
    if (this.destroyRef.destroyed || !this.scope.check()) return
    this.requestRevision++
    this.queries.next({ query, delay, force })
  }

  setSearch(value: string): void {
    this.search.set(value)
    this.applyFilters(250)
  }

  setSelect(id: string, value: string): void {
    if (id === "lead-filter-origin") this.originId.set(this.filterId(value))
    else if (id === "lead-filter-stage") this.stageId.set(this.filterId(value))
    else if (id === "lead-filter-converted")
      this.converted.set(value === "true" ? true : value === "false" ? false : "")
    else return
    this.applyFilters()
  }

  clearFilters(): void {
    this.search.set("")
    this.originId.set("")
    this.stageId.set("")
    this.converted.set("")
    this.applyFilters()
  }

  private filterId(value: string): number | "" {
    const numeric = Number(value)
    return /^\d+$/.test(value) &&
      Number.isSafeInteger(numeric) &&
      numeric > 0 &&
      numeric <= 2147483647
      ? numeric
      : ""
  }

  /** Every filter change returns to the first page of the effective server page size. */
  private applyFilters(delay = 0): void {
    const search = this.search().trim(),
      originId = this.originId(),
      stageId = this.stageId(),
      converted = this.converted()
    this.recoveryUsed = false
    this.load(
      {
        offset: 0,
        limit: this.query().limit,
        ...(search ? { search } : {}),
        ...(originId === "" ? {} : { originId }),
        ...(stageId === "" ? {} : { stageId }),
        ...(converted === "" ? {} : { converted })
      },
      false,
      delay
    )
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
    this.load({
      ...this.requestedQuery(),
      offset: (page - 1) * this.query().limit,
      limit: this.query().limit
    })
  }
}
