import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  signal
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { Observable, Subscription, takeUntil } from "rxjs"
import { BrnDialogRef } from "@spartan-ng/brain/dialog"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmBadgeImports } from "@spartan-ng/helm/badge"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmEmptyImports } from "@spartan-ng/helm/empty"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { HotToastService } from "@ngxpert/hot-toast"
import { CatalogFrame } from "@/app/shared/components/catalog-frame/catalog-frame"
import { TablePagination } from "@/app/shared/components/table-pagination/table-pagination"
import { BadgeTone } from "@/app/shared/ui/badge-tone.directive"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { Result } from "@/app/shared/utils/result"
import { CrmEmail } from "../../../domain/entities/crm-email.entity"
import { CrmTargetKind } from "../../../domain/params/crm-communications.params"
import { CrmCommunicationsStore } from "../../state/crm-communications.store"
import { EmailComposer } from "../email-composer/email-composer"

/**
 * Recorded email deliveries of one verified customer or lead (S2/S4/S6). A failed send is a recorded
 * fact, never a retry action: the panel has no resend control and the store never replays a POST.
 */
@Component({
  selector: "app-crm-emails",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { "[attr.data-crm-emails]": "label()" },
  imports: [
    CatalogFrame,
    TablePagination,
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmEmptyImports,
    HlmSpinnerImports,
    BadgeTone
  ],
  templateUrl: "./crm-emails.html"
})
export class CrmEmails implements OnInit {
  readonly kind = input.required<CrmTargetKind>()
  readonly targetId = input.required<number>()
  readonly targetName = input<string | null>(null)
  /** Already stored address of the record, shown only as composer context. */
  readonly recipient = input<string | null>(null)
  readonly ownerChanged$ = input.required<Observable<void>>()
  private readonly store = inject(CrmCommunicationsStore)
  private readonly dialogs = inject(HlmDialogService)
  private readonly toast = inject(HotToastService)
  private readonly destroyRef = inject(DestroyRef)
  private dialog: BrnDialogRef | undefined
  private read: Subscription | undefined
  private ended = false
  private owner = 0
  private recovered = false
  private readonly offset = signal(0)
  private readonly limit = signal(20)
  private readonly scope = createSessionReadScope(() => this.stop())
  readonly target = computed(() => ({ kind: this.kind(), id: this.targetId() }))
  readonly label = computed(() => `${this.kind()}:${this.targetId()}`)
  readonly readEntry = computed(() =>
    this.store.selectEmails(this.target(), { offset: this.offset(), limit: this.limit() })
  )
  readonly busy = computed(() => (this.readEntry().pendingReads ?? 0) > 0)
  readonly page = computed(() => this.readEntry().data)
  readonly pageCount = computed(() => {
    const page = this.page()
    return page && page.limit > 0 ? Math.ceil(page.total / page.limit) : 0
  })
  readonly range = computed(() => {
    const page = this.page()
    if (!page) return ""
    const first = page.items.length ? page.offset + 1 : 0
    const last = page.items.length ? page.offset + page.items.length : 0
    return `${first}–${last} de ${page.total}`
  })

  ngOnInit(): void {
    this.owner = this.targetId()
    this.destroyRef.onDestroy(() => this.dialog?.close())
    this.ownerChanged$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.stop())
    if (!this.scope.check()) return
    this.load()
  }
  private load(force = false): void {
    if (!this.isCurrent() || (force && this.busy())) return
    this.read?.unsubscribe()
    this.read = this.store
      .observeEmails(this.target(), { offset: this.offset(), limit: this.limit() }, force)
      .pipe(
        takeUntil(this.ownerChanged$()),
        takeUntil(this.scope.cancelled$),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(result => this.recover(result))
  }
  stop(): void {
    this.ended = true
    this.read?.unsubscribe()
    this.dialog?.close()
  }
  private isCurrent(): boolean {
    return (
      !this.ended &&
      !this.destroyRef.destroyed &&
      this.owner === this.targetId() &&
      this.scope.check()
    )
  }
  private recover(result: Result<unknown, unknown>): void {
    const page = this.page()
    if (!this.isCurrent() || !result.success || !page) return
    if (this.recovered || page.items.length || page.total === 0 || page.offset < page.total) return
    this.recovered = true
    const target = Math.floor((page.total - 1) / page.limit) * page.limit
    if (target === this.offset()) return
    this.offset.set(target)
    this.limit.set(page.limit)
    this.load()
  }
  retry(): void {
    this.recovered = false
    this.load(true)
  }
  selectPage(page: number): void {
    if (!this.isCurrent() || page < 1 || page > this.pageCount()) return
    // Navigation keeps the effective size the server answered with, not the requested one.
    const effective = this.page()?.limit ?? this.limit()
    this.recovered = false
    this.limit.set(effective)
    this.offset.set((page - 1) * effective)
    this.load()
  }
  compose(): void {
    if (!this.isCurrent() || this.dialog?.open || this.store.writing()) return
    const kind = this.kind(),
      targetId = this.targetId()
    const current = () => this.isCurrent() && this.dialog !== undefined && this.dialog.open === true
    this.dialog = this.dialogs.open(EmailComposer, {
      context: {
        kind,
        targetId,
        targetName: this.targetName(),
        recipient: this.recipient(),
        owner: this.destroyRef,
        ownerChanged$: this.ownerChanged$(),
        current,
        onSent: (email: CrmEmail) => {
          if (!current()) return
          // A recorded failure is reported as such: the attempt is never retried by itself.
          if (email.status === "ENVIADO") this.toast.success("Correo registrado como enviado.")
          else this.toast.error("El intento de envío quedó registrado como fallido.")
        }
      },
      showCloseButton: false,
      disableClose: true,
      contentClass: "sm:max-w-2xl"
    })
  }
}
