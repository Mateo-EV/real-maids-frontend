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
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { Result } from "@/app/shared/utils/result"
import { CrmNote } from "../../../domain/entities/crm-note.entity"
import { CrmTargetKind } from "../../../domain/params/crm-communications.params"
import { CrmCommunicationsStore } from "../../state/crm-communications.store"
import { NoteEditor } from "../note-editor/note-editor"

/**
 * Notes of one verified customer or lead (S2/S3/S7). Reading, freshness and the denial latch live in
 * the root store; this panel owns paging, its own observation and the author-only edit affordance.
 * Nothing is deleted: the API has no note deletion endpoint.
 */
@Component({
  selector: "app-crm-notes",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { "[attr.data-crm-notes]": "label()" },
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
  templateUrl: "./crm-notes.html"
})
export class CrmNotes implements OnInit {
  readonly kind = input.required<CrmTargetKind>()
  readonly targetId = input.required<number>()
  readonly targetName = input<string | null>(null)
  readonly ownerChanged$ = input.required<Observable<void>>()
  private readonly store = inject(CrmCommunicationsStore)
  private readonly auth = inject(AuthStore)
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
    this.store.selectNotes(this.target(), { offset: this.offset(), limit: this.limit() })
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
      .observeNotes(this.target(), { offset: this.offset(), limit: this.limit() }, force)
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
  /**
   * One corrective page per user action when the server answers an empty page whose offset is past
   * the reported total; a verified zero total stays a verified empty list.
   */
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
  /** Authorship is a stored fact, not an inferred permission: no session id means no offer. */
  canEdit(note: CrmNote): boolean {
    const sessionId = this.auth.session()?.id
    return sessionId !== null && sessionId !== undefined && note.authorId === sessionId
  }
  create(): void {
    this.open(null)
  }
  edit(note: CrmNote): void {
    const page = this.page()
    if (!page || !page.items.includes(note) || !this.canEdit(note)) return
    this.open(note)
  }
  private open(note: CrmNote | null): void {
    if (!this.isCurrent() || this.dialog?.open || this.store.writing()) return
    const kind = this.kind(),
      targetId = this.targetId()
    const current = () => this.isCurrent() && this.dialog !== undefined && this.dialog.open === true
    this.dialog = this.dialogs.open(NoteEditor, {
      context: {
        kind,
        targetId,
        targetName: this.targetName(),
        note,
        owner: this.destroyRef,
        ownerChanged$: this.ownerChanged$(),
        current,
        onSaved: () => {
          if (!current()) return
          this.toast.success(
            note ? "Nota actualizada correctamente." : "Nota registrada correctamente."
          )
          // Root invalidation already refreshes this observed page exactly once.
        }
      },
      showCloseButton: false,
      disableClose: true,
      contentClass: "sm:max-w-2xl"
    })
  }
}
