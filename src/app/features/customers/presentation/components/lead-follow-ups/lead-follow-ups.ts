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
import { Observable, Subject, Subscription, takeUntil } from "rxjs"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { BrnDialogRef } from "@spartan-ng/brain/dialog"
import { HotToastService } from "@ngxpert/hot-toast"
import { LeadFollowUpEditor } from "../lead-follow-up-editor/lead-follow-up-editor"
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
  private readonly dialogs = inject(HlmDialogService)
  private readonly toast = inject(HotToastService)
  private dialog: BrnDialogRef | undefined
  private readonly stopped = new Subject<void>()
  readonly writing = this.store.writing
  private readonly scope = createSessionReadScope(() => this.stop())
  private read: Subscription | undefined
  private ended = false
  private owner = 0
  private generation = 0
  readonly entry = computed(() => this.store.selectFollowUps(this.leadId())())

  ngOnInit(): void {
    this.owner = this.leadId()
    this.destroyRef.onDestroy(() => this.stop())
    this.ownerChanged$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.stop())
    if (!this.scope.check()) return
    this.generation = this.scope.generation()
    this.load()
  }
  stop(): void {
    if (this.ended) return
    this.ended = true
    this.stopped.next()
    this.read?.unsubscribe()
    this.dialog?.close()
  }
  private isCurrent(): boolean {
    return (
      !this.ended &&
      !this.destroyRef.destroyed &&
      this.owner === this.leadId() &&
      this.current()() &&
      this.scope.check() &&
      this.generation === this.scope.generation()
    )
  }
  register(): void {
    const entry = this.store.selectLead(this.owner)(),
      lead = entry.data
    if (
      !this.isCurrent() ||
      !entry.loaded ||
      lead?.id !== this.owner ||
      this.writing() ||
      this.dialog?.open
    )
      return
    const current = () => this.isCurrent() && !!this.dialog?.open
    this.dialog = this.dialogs.open(LeadFollowUpEditor, {
      context: {
        lead,
        owner: this.destroyRef,
        stopped$: this.stopped.asObservable(),
        current,
        onSaved: () => {
          if (current()) this.toast.success("Seguimiento registrado correctamente.")
          // Root observation already revalidates the list after confirmed invalidation.
        }
      },
      showCloseButton: false,
      disableClose: true,
      contentClass: "sm:max-w-lg"
    })
  }
  load(force = false): void {
    if (!this.isCurrent() || (force && this.entry().pendingReads)) return
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
