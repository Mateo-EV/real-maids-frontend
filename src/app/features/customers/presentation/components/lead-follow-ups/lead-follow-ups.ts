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
import { HlmEmptyImports } from "@spartan-ng/helm/empty"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { HlmTableImports } from "@spartan-ng/helm/table"
import { CatalogFrame } from "@/app/shared/components/catalog-frame/catalog-frame"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { CustomerAcquisitionStore } from "../../state/customer-acquisition.store"

/** Disclosure-owned observation; verified results and freshness remain root-owned. */
@Component({
  selector: "app-lead-follow-ups",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CatalogFrame,
    HlmButtonImports,
    HlmAlertImports,
    HlmEmptyImports,
    HlmSpinnerImports,
    HlmTableImports
  ],
  templateUrl: "./lead-follow-ups.html"
})
export class LeadFollowUps implements OnInit {
  readonly leadId = input.required<number>()
  readonly ownerChanged$ = input.required<Observable<void>>()
  readonly current = input.required<() => boolean>()
  private readonly store = inject(CustomerAcquisitionStore)
  private readonly destroyRef = inject(DestroyRef)
  private readonly scope = createSessionReadScope(() => this.stop())
  private read: Subscription | undefined
  private ended = false
  private owner = 0
  private generation = 0
  readonly entry = computed(() => this.store.selectFollowUps(this.leadId())())

  ngOnInit(): void {
    this.owner = this.leadId()
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
      this.owner !== this.leadId() ||
      !this.current()() ||
      !this.scope.check() ||
      this.generation !== this.scope.generation() ||
      (force && this.entry().pendingReads)
    )
      return
    this.read?.unsubscribe()
    this.read = this.store
      .observeFollowUps(this.owner, force)
      .pipe(
        takeUntil(this.ownerChanged$()),
        takeUntil(this.scope.cancelled$),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
  }
}
