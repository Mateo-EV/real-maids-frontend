import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal
} from "@angular/core"
import { ActivatedRoute, RouterLink } from "@angular/router"
import { customerPageContext } from "./customer-page-context"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { of, Subject, switchMap, timer } from "rxjs"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { NgTemplateOutlet } from "@angular/common"
import { NgIcon, provideIcons } from "@ng-icons/core"
import { lucidePencil, lucidePlus, lucidePower } from "@ng-icons/lucide"
import { HotToastService } from "@ngxpert/hot-toast"
import { CatalogFrame } from "@/app/shared/components/catalog-frame/catalog-frame"
import {
  CatalogFilterSelect,
  CatalogFilters
} from "@/app/shared/components/catalog-filters/catalog-filters"
import { HlmTableImports } from "@spartan-ng/helm/table"
import { HlmBadgeImports } from "@spartan-ng/helm/badge"
import { HlmEmptyImports } from "@spartan-ng/helm/empty"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { TablePagination } from "@/app/shared/components/table-pagination/table-pagination"
import { CustomerListQuery } from "../../../domain/models/customer-list-query"
import { CustomerType } from "../../../domain/entities/customer.entity"
import { CustomersStore } from "../../state/customers.store"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { BrnDialogRef } from "@spartan-ng/brain/dialog"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { Customer } from "../../../domain/entities/customer.entity"
import { CustomerEditor } from "../../components/customer-editor/customer-editor"
import { CustomerStatusDialog } from "../../components/customer-status-dialog/customer-status-dialog"
import { CrmCatalogNavigation } from "../../components/crm-catalog-navigation/crm-catalog-navigation"

@Component({
  selector: "app-customers-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CrmCatalogNavigation,
    HlmButtonImports,
    RouterLink,
    NgTemplateOutlet,
    NgIcon,
    CatalogFrame,
    CatalogFilters,
    HlmTableImports,
    HlmBadgeImports,
    HlmEmptyImports,
    HlmAlertImports,
    HlmSpinnerImports,
    TablePagination
  ],
  providers: [provideIcons({ lucidePencil, lucidePlus, lucidePower })],
  templateUrl: "./customers-page.html"
})
export class CustomersPage implements OnInit {
  private readonly customers = inject(CustomersStore)
  private readonly destroyRef = inject(DestroyRef)
  private readonly dialogs = inject(HlmDialogService)
  private dialog: BrnDialogRef | undefined
  private readonly toast = inject(HotToastService)
  readonly writePending = this.customers.writePending
  private readonly scope = createSessionReadScope(() => {
    this.dialog?.close()
  })

  private readonly requestedQuery = signal<CustomerListQuery>(
    customerPageContext(inject(ActivatedRoute).snapshot.queryParamMap)
  )
  readonly search = signal("")
  readonly type = signal<CustomerType | "">("")
  readonly typeFilters = computed<readonly CatalogFilterSelect[]>(() => [
    {
      id: "customer-filter-type",
      label: "Tipo de cliente",
      allLabel: "Todos los tipos",
      value: this.type(),
      options: [
        { value: CustomerType.RESIDENTIAL, label: "Residencial" },
        { value: CustomerType.COMMERCIAL, label: "Comercial" }
      ]
    }
  ])
  readonly hasFilters = computed(() => !!this.search().trim() || !!this.type())
  readonly list = computed(() => this.customers.selectQuery(this.requestedQuery()))
  readonly result = computed(() => this.list().result)
  readonly rows = computed(() => this.result()?.items ?? [])
  readonly currentPage = computed(
    () => (this.list().query.offset ?? 0) / (this.list().query.limit ?? 20) + 1
  )
  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil((this.result()?.total ?? 0) / (this.list().query.limit ?? 20)))
  )
  readonly rangeStart = computed(() => (this.rows().length ? this.result()!.offset + 1 : 0))
  readonly rangeEnd = computed(() =>
    this.rows().length ? this.result()!.offset + this.rows().length : 0
  )
  readonly errorMessage = computed(() => {
    switch (this.list().error?.code) {
      case "FORBIDDEN":
        return "No tienes permiso para consultar clientes."
      case "UNAUTHENTICATED":
        return "La sesión no está disponible. Vuelve a iniciar sesión."
      case "UNCONFIGURED":
        return "El servicio de clientes no está disponible en este entorno."
      default:
        return "No se pudieron cargar los clientes. Inténtalo de nuevo."
    }
  })
  private readonly queries = new Subject<{
    query: CustomerListQuery
    delay: number
    force: boolean
  }>()
  private recoveryUsed = false
  private requestRevision = 0

  ngOnInit(): void {
    this.scope.check()
    this.destroyRef.onDestroy(() => this.dialog?.close())
    this.queries
      .pipe(
        switchMap(({ query, delay, force }) =>
          (delay ? timer(delay) : of(0)).pipe(
            switchMap(() => {
              this.requestedQuery.set(query)
              return this.customers.observeQuery(query, force)
            })
          )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(response => {
        if (!response.success || this.recoveryUsed) return
        const page = response.data
        if (page.items.length || page.total === 0 || page.offset < page.total) return
        this.recoveryUsed = true
        const revision = this.requestRevision
        // Defer replacement so a synchronous cached response cannot re-enter switchMap setup.
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

  private load(query: CustomerListQuery, force = false, delay = 0): void {
    if (this.destroyRef.destroyed) return
    this.requestRevision++
    this.queries.next({ query, delay, force })
  }

  edit(customer: Customer | null = null): void {
    this.open(customer, false)
  }

  deactivate(customer: Customer): void {
    this.open(customer, true)
  }

  private open(customer: Customer | null, deactivate: boolean): void {
    if (
      this.destroyRef.destroyed ||
      !this.scope.check() ||
      this.writePending() ||
      this.dialog?.open
    )
      return
    const generation = this.scope.generation()
    const confirmed = () => {
      if (
        !this.destroyRef.destroyed &&
        this.scope.check() &&
        generation === this.scope.generation()
      )
        this.toast.success(
          deactivate
            ? "Cliente desactivado correctamente."
            : customer
              ? "Cliente actualizado correctamente."
              : "Cliente creado correctamente."
        )
    }
    this.dialog = this.dialogs.open(deactivate ? CustomerStatusDialog : CustomerEditor, {
      context: { customer, owner: this.destroyRef, onSaved: confirmed, onChanged: confirmed },
      showCloseButton: false,
      disableClose: true,
      contentClass: "sm:max-w-lg"
    })
  }

  setSearch(value: string): void {
    this.search.set(value)
    this.applyFilters(250)
  }

  setType(value: string | null | undefined): void {
    const type =
      value === CustomerType.RESIDENTIAL || value === CustomerType.COMMERCIAL ? value : ""
    this.type.set(type)
    this.applyFilters()
  }

  clearFilters(): void {
    this.search.set("")
    this.type.set("")
    this.applyFilters()
  }

  private applyFilters(delay = 0): void {
    const current = this.list().query
    const search = this.search().trim()
    const type = this.type()
    this.recoveryUsed = false
    this.load(
      {
        offset: 0,
        limit: current.limit,
        ...(search ? { search } : {}),
        ...(type ? { type } : {})
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
      this.list().loading
    )
      return
    this.recoveryUsed = false
    const limit = this.list().query.limit ?? 20
    this.load({ ...this.list().query, offset: (page - 1) * limit, limit })
  }
}
