import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  Signal,
  signal
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { RouterOutlet } from "@angular/router"
import { Observable, finalize, take, takeUntil } from "rxjs"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmCardImports } from "@spartan-ng/helm/card"
import { NgIcon, provideIcons } from "@ng-icons/core"
import {
  lucideClipboardList,
  lucideClock,
  lucideCalendarDays,
  lucideActivity
} from "@ng-icons/lucide"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { OperationsSectionNavigation } from "../../components/operations-section-navigation/operations-section-navigation"
import { ServiceRequestsStore } from "../../state/service-requests.store"
import { ServiceOrdersStore } from "../../state/service-orders.store"

/** Persistent M04/M05 summary: tab navigation never remounts or re-reads these KPIs (T5/S7). */
interface MetricEntry {
  readonly result?: { readonly total: number }
  readonly loading: boolean
  readonly refreshing: boolean
  readonly error?: unknown
}
interface MetricCard {
  readonly label: string
  readonly tone: string
  readonly icon: string
  readonly state: Signal<MetricEntry>
  readonly observe: (force: boolean) => Observable<unknown>
}
@Component({
  selector: "app-operations-shell",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, OperationsSectionNavigation, HlmCardImports, HlmButtonImports, NgIcon],
  providers: [
    provideIcons({ lucideClipboardList, lucideClock, lucideCalendarDays, lucideActivity })
  ],
  templateUrl: "./operations-shell.html"
})
export class OperationsShell implements OnInit {
  private readonly requests = inject(ServiceRequestsStore)
  private readonly orders = inject(ServiceOrdersStore)
  private readonly destroyRef = inject(DestroyRef)
  private readonly scope = createSessionReadScope(() => undefined)
  private readonly requestQuery = { offset: 0, limit: 1, status: "registrada" }
  /** A card keeps offering its retry while that retry is still in flight. */
  private readonly retrying = signal<ReadonlySet<number>>(new Set<number>())

  readonly cards: readonly (MetricCard & { retrying: Signal<boolean> })[] = [
    {
      label: "Solicitudes por atender",
      tone: "navy",
      icon: "lucideClipboardList",
      state: computed(() => this.requests.selectRequests(this.requestQuery)),
      observe: (force: boolean) => this.requests.observeRequests(this.requestQuery, force)
    },
    ...[
      { label: "Órdenes por programar", tone: "amber", icon: "lucideClock", status: "PENDIENTE" },
      {
        label: "Órdenes programadas",
        tone: "green",
        icon: "lucideCalendarDays",
        status: "PROGRAMADA"
      },
      { label: "Órdenes en proceso", tone: "blue", icon: "lucideActivity", status: "EN_PROCESO" }
    ].map(({ label, tone, icon, status }) => {
      const query = { offset: 0, limit: 1, status }
      return {
        label,
        tone,
        icon,
        state: computed(() => this.orders.selectOrders(query)),
        observe: (force: boolean) => this.orders.observeOrders(query, force)
      }
    })
  ].map((card, index) => ({
    ...card,
    retrying: computed(() => this.retrying().has(index))
  }))

  private read(read: (force: boolean) => Observable<unknown>, force = false): void {
    if (this.destroyRef.destroyed || !this.scope.check()) return
    read(force)
      .pipe(takeUntil(this.scope.cancelled$), takeUntilDestroyed(this.destroyRef))
      .subscribe()
  }

  /**
   * One forced read per attempt. `observe` keeps the observation open for further revalidations,
   * so the attempt takes its first settlement: that clears the in-flight flag and releases the
   * extra pinned observer instead of leaving the button disabled forever.
   */
  retry(index: number): void {
    if (this.destroyRef.destroyed || !this.scope.check()) return
    this.retrying.update(current => new Set(current).add(index))
    this.cards[index]
      .observe(true)
      .pipe(
        take(1),
        finalize(() =>
          this.retrying.update(current => {
            const next = new Set(current)
            next.delete(index)
            return next
          })
        ),
        takeUntil(this.scope.cancelled$),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
  }

  ngOnInit(): void {
    this.scope.check()
    // Caller-owned observers share existing root reads and confirmed-write revalidation.
    for (const card of this.cards) this.read(card.observe)
  }
}
