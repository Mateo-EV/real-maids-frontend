import { TablePagination } from "@/app/shared/components/table-pagination/table-pagination"
import { DatePipe } from "@angular/common"
import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  OnInit,
  signal,
  untracked
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { HotToastService } from "@ngxpert/hot-toast"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmBadgeImports } from "@spartan-ng/helm/badge"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { HlmEmptyImports } from "@spartan-ng/helm/empty"
import { HlmFieldImports } from "@spartan-ng/helm/field"
import { HlmInputGroupImports } from "@spartan-ng/helm/input-group"
import { HlmNativeSelectImports } from "@spartan-ng/helm/native-select"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { Subject, Subscription, switchMap } from "rxjs"
import { UserSession } from "../../../domain/entities/user-session.entity"
import { UserSessionOwnerQuery } from "../../../domain/models/user-session-owner-query"
import { UserSessionsStore } from "../../state/user-sessions.store"
import { UserStore } from "../../state/user.store"
import {
  RevokeSessionContext,
  RevokeSessionDialog
} from "../revoke-session-dialog/revoke-session-dialog"

@Component({
  selector: "app-user-sessions",
  imports: [
    DatePipe,
    HlmNativeSelectImports,
    HlmInputGroupImports,
    HlmFieldImports,
    TablePagination,
    HlmButtonImports,
    HlmBadgeImports,
    HlmAlertImports,
    HlmEmptyImports,
    HlmSpinnerImports
  ],
  templateUrl: "./user-sessions.html"
})
export class UserSessions implements OnInit {
  readonly sessions = inject(UserSessionsStore)
  private readonly requestedQuery = signal<UserSessionOwnerQuery>({ offset: 0, limit: 5 })
  readonly owners = this.sessions.selectOwners(this.requestedQuery)
  private readonly users = inject(UserStore)
  private readonly dialogs = inject(HlmDialogService)
  private readonly toast = inject(HotToastService)
  private readonly destroyRef = inject(DestroyRef)
  readonly search = signal("")
  readonly presence = signal("all")
  readonly openIds = signal(new Set<number>())
  readonly visibleUsers = computed(() =>
    this.owners.loaded() ? (this.owners.result()?.items ?? []) : []
  )
  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil((this.owners.result()?.total ?? 0) / (this.owners.query().limit ?? 5)))
  )
  readonly currentPage = computed(
    () => (this.owners.query().offset ?? 0) / (this.owners.query().limit ?? 5) + 1
  )
  readonly rangeStart = computed(() =>
    this.visibleUsers().length ? (this.owners.result()?.offset ?? 0) + 1 : 0
  )
  readonly rangeEnd = computed(() =>
    this.visibleUsers().length ? this.rangeStart() + this.visibleUsers().length - 1 : 0
  )
  private readonly queries = new Subject<{ query: UserSessionOwnerQuery; delay: number }>()
  private readonly detailSubscriptions = new Map<number, Subscription>()
  private sessionRevision = this.sessions.mutationRevision()
  private userRevision = this.users.mutationRevision()

  constructor() {
    this.queries
      .pipe(
        switchMap(({ query, delay }) => {
          this.requestedQuery.set(query)
          return this.sessions.observeOwners(query, delay)
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
    effect(() => {
      const revision = this.sessions.mutationRevision(),
        users = this.users.mutationRevision()
      const sessionChanged = revision !== this.sessionRevision,
        userChanged = users !== this.userRevision
      this.sessionRevision = revision
      this.userRevision = users
      if (!sessionChanged && !userChanged) return
      untracked(() => {
        // Owner observers share the root's lazy invalidation read. Do not reload it a second time.
        if (userChanged) this.sessions.refreshOwnersAfterUserMutation(users)
        if (userChanged) for (const id of this.openIds()) this.refreshDetail(id)
        else {
          const id = this.sessions.affectedUserId()
          if (id !== undefined) this.refreshDetail(id)
        }
      })
    })
  }
  ngOnInit(): void {
    this.reload()
  }
  private closeDetails(): void {
    for (const subscription of this.detailSubscriptions.values()) subscription.unsubscribe()
    this.detailSubscriptions.clear()
    this.openIds.set(new Set())
  }
  private queryFilters(delay = 0): void {
    this.closeDetails()
    const search = this.search().trim(),
      presence = this.presence()
    this.load(
      {
        offset: 0,
        limit: this.owners.query().limit ?? 5,
        ...(search ? { search } : {}),
        ...(presence === "all" ? {} : { hasSessions: presence === "with" })
      },
      delay
    )
  }
  private load(query: UserSessionOwnerQuery, delay = 0): void {
    if (!this.destroyRef.destroyed) this.queries.next({ query, delay })
  }
  setSearch(value: string): void {
    this.search.set(value)
    this.queryFilters(250)
  }
  setPresence(value: string | null | undefined): void {
    this.presence.set(value ?? "all")
    this.queryFilters()
  }
  clearFilters(): void {
    this.search.set("")
    this.presence.set("all")
    this.queryFilters()
  }
  goToPage(page: number): void {
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > this.pageCount() ||
      page === this.currentPage()
    )
      return
    this.closeDetails()
    const query = this.owners.query()
    this.load({ ...query, offset: (page - 1) * (query.limit ?? 5) })
  }
  reload(): void {
    this.load(this.owners.query())
  }
  toggle(userId: number, event: Event): void {
    const open = (event.target as HTMLDetailsElement).open
    if (open === this.openIds().has(userId)) return
    const ids = new Set(this.openIds())
    if (open) ids.add(userId)
    else ids.delete(userId)
    this.openIds.set(ids)
    if (open) this.refreshDetail(userId)
    else {
      this.detailSubscriptions.get(userId)?.unsubscribe()
      this.detailSubscriptions.delete(userId)
    }
  }
  refreshDetail(userId: number): void {
    if (this.destroyRef.destroyed || !this.openIds().has(userId)) return
    this.detailSubscriptions.get(userId)?.unsubscribe()
    this.detailSubscriptions.set(
      userId,
      this.sessions.loadDetails(userId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe()
    )
  }
  revoke(session: UserSession): void {
    if (
      this.destroyRef.destroyed ||
      !this.sessions.details()[session.userId]?.loaded ||
      session.isCurrent ||
      !session.userName
    )
      return
    this.dialogs.open<void, RevokeSessionContext>(RevokeSessionDialog, {
      context: {
        user: { id: session.userId, name: session.userName },
        session,
        onRevoked: () => {
          if (!this.destroyRef.destroyed)
            this.toast.success(`Sesión de ${session.userName} cerrada`)
        }
      },
      showCloseButton: false,
      disableClose: true,
      contentClass: "sm:max-w-lg"
    })
  }
}
