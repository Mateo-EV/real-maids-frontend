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
import { Observable, finalize, take, takeUntil } from "rxjs"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmCardImports } from "@spartan-ng/helm/card"
import { NgIcon, provideIcons } from "@ng-icons/core"
import { lucideCircleCheck, lucideClipboardList, lucideClock, lucideInbox } from "@ng-icons/lucide"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { SupportRequestQuery } from "../../../domain/params/customer-support.params"
import { SupportRequestsStore } from "../../state/support-requests.store"

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

/**
 * One card per documented state plus the whole inbox: every value is the `total` of its own
 * server page, so nothing is summed, sliced or derived locally. The queries are deliberately
 * free of the inbox filters — these are running totals of the module, not of the open page.
 */
const metricQueries: readonly {
  readonly label: string
  readonly tone: string
  readonly icon: string
  readonly query: SupportRequestQuery
}[] = [
  {
    label: "Recibidas",
    tone: "navy",
    icon: "lucideInbox",
    query: { offset: 0, limit: 1, state: "RECIBIDA" }
  },
  {
    label: "En revisión",
    tone: "amber",
    icon: "lucideClock",
    query: { offset: 0, limit: 1, state: "EN_REVISION" }
  },
  {
    label: "Resueltas",
    tone: "green",
    icon: "lucideCircleCheck",
    query: { offset: 0, limit: 1, state: "RESUELTA" }
  },
  {
    label: "Total de atenciones",
    tone: "blue",
    icon: "lucideClipboardList",
    query: { offset: 0, limit: 1 }
  }
]

/**
 * WP8 summary of the support module (M09/RF11/HU11/P10). It reuses the root store, its
 * success-only freshness and its session fence; it adds no endpoint, no cache and no total
 * of its own. Unverified, refreshing and failed cards stay visible instead of guessing.
 */
@Component({
  selector: "app-support-metrics",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmCardImports, HlmButtonImports, NgIcon],
  providers: [provideIcons({ lucideInbox, lucideClock, lucideCircleCheck, lucideClipboardList })],
  templateUrl: "./support-metrics.html"
})
export class SupportMetrics implements OnInit {
  private readonly store = inject(SupportRequestsStore)
  private readonly destroyRef = inject(DestroyRef)
  private readonly scope = createSessionReadScope(() => undefined)
  /** A card keeps offering its retry while that attempt is still in flight. */
  private readonly retrying = signal<ReadonlySet<number>>(new Set<number>())

  readonly cards: readonly (MetricCard & { retrying: Signal<boolean> })[] = metricQueries
    .map(({ label, tone, icon, query }) => ({
      label,
      tone,
      icon,
      state: computed(() => this.store.selectRequests(query)),
      observe: (force: boolean) => this.store.observeRequests(query, force)
    }))
    .map((card, index) => ({
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
   * One forced read per attempt. `observe` keeps the observation open for further
   * revalidations, so the attempt takes its first settlement: that releases the extra
   * pinned observer instead of leaving the button disabled forever.
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
    // Caller-owned observations share the root reads and the confirmed-write revalidation.
    for (const card of this.cards) this.read(card.observe)
  }
}
