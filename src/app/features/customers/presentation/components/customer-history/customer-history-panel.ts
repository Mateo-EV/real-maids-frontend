import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { Observable, Subscription, takeUntil } from "rxjs"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmBadgeImports } from "@spartan-ng/helm/badge"
import { HlmEmptyImports } from "@spartan-ng/helm/empty"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { CustomerHistoryStore } from "../../state/customer-history.store"

/** A finite, disclosure-owned reader. Data and freshness stay in the root owner/limit entry. */
@Component({
  selector: "app-customer-history-panel",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButtonImports, HlmAlertImports, HlmBadgeImports, HlmEmptyImports, HlmSpinnerImports],
  templateUrl: "./customer-history-panel.html"
})
export class CustomerHistoryPanel implements OnInit {
  readonly customerId = input.required<number>()
  readonly ownerChanged$ = input.required<Observable<void>>()
  private readonly store = inject(CustomerHistoryStore)
  private readonly destroyRef = inject(DestroyRef)
  private read: Subscription | undefined
  private ended = false
  private owner = 0
  private generation = 0
  private readonly scope = createSessionReadScope(() => this.stop())
  readonly history = computed(() => this.store.selectHistory(this.customerId(), 20))

  ngOnInit(): void {
    this.owner = this.customerId()
    this.ownerChanged$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.stop())
    if (!this.scope.check()) return
    this.generation = this.scope.generation()
    this.load()
  }
  stop(): void {
    this.ended = true
    this.read?.unsubscribe()
  }
  load(force = false): void {
    if (
      this.ended ||
      this.destroyRef.destroyed ||
      this.owner !== this.customerId() ||
      !this.scope.check() ||
      this.generation !== this.scope.generation()
    )
      return
    this.read?.unsubscribe()
    this.read = this.store
      .loadHistory(this.owner, 20, force)
      .pipe(
        takeUntil(this.ownerChanged$()),
        takeUntil(this.scope.cancelled$),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
  }
  range(page: PaginationResponse<unknown>): string {
    return `${page.items.length ? page.offset + 1 : 0}–${page.items.length ? page.offset + page.items.length : 0} de ${page.total}`
  }
}
