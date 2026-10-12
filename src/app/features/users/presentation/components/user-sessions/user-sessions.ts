import { DatePipe } from "@angular/common"
import {
  Component,
  computed,
  DestroyRef,
  inject,
  linkedSignal,
  output,
  signal
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { form, FormField, FormRoot } from "@angular/forms/signals"
import { Subject, switchMap } from "rxjs"
import { TablePagination } from "@/app/shared/components/table-pagination/table-pagination"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmInputImports } from "@spartan-ng/helm/input"
import { HlmFieldImports } from "@spartan-ng/helm/field"
import { HlmBadgeImports } from "@spartan-ng/helm/badge"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmEmptyImports } from "@spartan-ng/helm/empty"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { HotToastService } from "@ngxpert/hot-toast"
import { UserSessionsStore } from "../../state/user-sessions.store"
import { UserSession } from "../../../domain/entities/user-session.entity"
import { UserStore } from "../../state/user.store"
import { HlmNativeSelectImports } from "@spartan-ng/helm/native-select"
import { HlmInputGroupImports } from "@spartan-ng/helm/input-group"
import {
  RevokeSessionContext,
  RevokeSessionDialog
} from "../revoke-session-dialog/revoke-session-dialog"

@Component({
  selector: "app-user-sessions",
  imports: [
    DatePipe,
    FormField,
    FormRoot,
    HlmInputImports,
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
export class UserSessions {
  readonly sessions = inject(UserSessionsStore)
  private readonly dialogs = inject(HlmDialogService)
  private readonly toast = inject(HotToastService)
  private readonly destroyRef = inject(DestroyRef)
  readonly retry = output<void>()
  readonly users = inject(UserStore)
  readonly model = signal({ search: "" })
  readonly filters = form(this.model)
  readonly presence = signal("all")
  readonly verified = computed(
    () => this.sessions.loaded() && !this.sessions.loading() && !this.sessions.error()
  )
  readonly catalogReady = computed(
    () => this.users.loaded() && !this.users.loading() && !this.users.error()
  )
  readonly groups = computed(() => {
    const byOwner = new Map<number, UserSession[]>()
    if (this.verified())
      for (const session of this.sessions.sessions()) {
        const list = byOwner.get(session.userId) ?? []
        list.push(session)
        byOwner.set(session.userId, list)
      }
    const groups = this.users.users().map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      outsideCatalog: false,
      sessions: byOwner.get(user.id) ?? []
    }))
    const catalogIds = new Set(groups.map(group => group.id))
    for (const [id, sessions] of byOwner)
      if (!catalogIds.has(id))
        groups.push({
          id,
          name: sessions[0].userName!,
          email: sessions[0].userEmail!,
          outsideCatalog: true,
          sessions
        })
    return groups
  })
  readonly filteredUsers = computed(() => {
    const text = this.model().search.trim().toLocaleLowerCase("es")
    return this.groups().filter(
      user =>
        (!text ||
          `${user.name} ${user.email} USR-${user.id}`.toLocaleLowerCase("es").includes(text)) &&
        (!this.verified() ||
          this.presence() === "all" ||
          user.sessions.length > 0 === (this.presence() === "with"))
    )
  })
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filteredUsers().length / 5)))
  readonly currentPage = linkedSignal<{ count: number; search: string; presence: string }, number>({
    source: () => ({
      count: this.pageCount(),
      search: this.model().search,
      presence: this.presence()
    }),
    computation: (source, previous) =>
      previous &&
      source.search === previous.source.search &&
      source.presence === previous.source.presence
        ? Math.min(previous.value, source.count)
        : 1
  })
  readonly visibleUsers = computed(() =>
    this.filteredUsers().slice((this.currentPage() - 1) * 5, this.currentPage() * 5)
  )
  readonly rangeStart = computed(() =>
    this.visibleUsers().length ? (this.currentPage() - 1) * 5 + 1 : 0
  )
  readonly rangeEnd = computed(() =>
    this.visibleUsers().length ? this.rangeStart() + this.visibleUsers().length - 1 : 0
  )
  private readonly queries = new Subject<void>()
  constructor() {
    this.queries
      .pipe(
        switchMap(() => this.sessions.loadAllSessions()),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
  }
  clearFilters(): void {
    this.model.set({ search: "" })
    this.presence.set("all")
  }
  goToPage(page: number): void {
    if (!Number.isSafeInteger(page) || page < 1 || page > this.pageCount()) return
    this.currentPage.set(page)
  }
  reload(): void {
    if (!this.destroyRef.destroyed) this.queries.next()
  }
  revoke(session: UserSession): void {
    if (this.destroyRef.destroyed || !this.verified() || session.isCurrent || !session.userName)
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
