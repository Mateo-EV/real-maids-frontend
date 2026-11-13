import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { RouterOutlet } from "@angular/router"
import { Observable, takeUntil } from "rxjs"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmCardImports } from "@spartan-ng/helm/card"
import { NgIcon, provideIcons } from "@ng-icons/core"
import { lucideCircleCheck, lucideClock, lucideTag, lucideUsers } from "@ng-icons/lucide"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { CrmCatalogNavigation } from "../../components/crm-catalog-navigation/crm-catalog-navigation"
import { CustomerAcquisitionStore } from "../../state/customer-acquisition.store"
import { CustomersStore } from "../../state/customers.store"

/**
 * Persistent CRM frame: the navigation and the KPI block are siblings of the outlet, so
 * switching consumer routes never re-creates them and never dispatches another read.
 */
@Component({
  selector: "app-crm-shell",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, CrmCatalogNavigation, HlmCardImports, HlmButtonImports, NgIcon],
  providers: [provideIcons({ lucideUsers, lucideTag, lucideCircleCheck, lucideClock })],
  templateUrl: "./crm-shell.html",
  styleUrl: "./crm-shell.css"
})
export class CrmShell implements OnInit {
  private readonly customers = inject(CustomersStore)
  private readonly acquisition = inject(CustomerAcquisitionStore)
  private readonly destroyRef = inject(DestroyRef)
  /** Unverified, loading and error card states stay visible; nothing is derived locally. */
  readonly customerStatistics = computed(() => this.customers.selectStatistics())
  readonly leadStatistics = computed(() => this.acquisition.statistics())
  readonly customerStatisticsError = "No se pudieron cargar las estadísticas de clientes."
  readonly leadStatisticsError = "No se pudieron cargar las estadísticas de prospectos."
  private readonly scope = createSessionReadScope(() => undefined)

  private read(read: (force: boolean) => Observable<unknown>, force = false): void {
    if (this.destroyRef.destroyed || !this.scope.check()) return
    read(force)
      .pipe(takeUntil(this.scope.cancelled$), takeUntilDestroyed(this.destroyRef))
      .subscribe()
  }

  retryCustomers(): void {
    this.read(force => this.customers.loadStatistics(force), true)
  }

  retryLeads(): void {
    this.read(force => this.acquisition.loadStatistics(force), true)
  }

  ngOnInit(): void {
    this.scope.check()
    // Observed once here: confirmed writes of either feature revalidate them, tab changes do not.
    this.read(force => this.customers.observeStatistics(force))
    this.read(force => this.acquisition.observeStatistics(force))
  }
}
