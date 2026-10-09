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
import { NgIcon, provideIcons } from "@ng-icons/core"
import { lucideSearch } from "@ng-icons/lucide"
import { HlmInputGroupImports } from "@spartan-ng/helm/input-group"
import { TablePagination } from "@/app/shared/components/table-pagination/table-pagination"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmNativeSelectImports } from "@spartan-ng/helm/native-select"
import { HlmBadgeImports } from "@spartan-ng/helm/badge"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmEmptyImports } from "@spartan-ng/helm/empty"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { HotToastService } from "@ngxpert/hot-toast"
import { UserStore } from "../../state/user.store"
import { UserSessionsStore } from "../../state/user-sessions.store"
import { User } from "../../../domain/entities/user.entity"
import { UserSession } from "../../../domain/entities/user-session.entity"
import {
  RevokeSessionContext,
  RevokeSessionDialog
} from "../revoke-session-dialog/revoke-session-dialog"

@Component({
  selector: "app-user-sessions",
  imports: [
    DatePipe,
    NgIcon,
    HlmInputGroupImports,
    TablePagination,
    HlmNativeSelectImports,
    HlmButtonImports,
    HlmBadgeImports,
    HlmAlertImports,
    HlmEmptyImports,
    HlmSpinnerImports
  ],
  providers: [provideIcons({ lucideSearch })],
  templateUrl: "./user-sessions.html",
  styles: `
    summary {
      cursor: pointer;
      padding: 1rem;
      border-radius: 0.75rem;
    }
    summary:hover {
      background: var(--muted);
    }
    summary:focus-visible {
      outline: 3px solid var(--ring);
      outline-offset: -3px;
    }
    details[open] > summary {
      border-bottom: 1px solid var(--border);
      border-radius: 0.75rem 0.75rem 0 0;
    }
    details[open] {
      border-color: var(--gold);
    }
  `
})
export class UserSessions {
  readonly sessions = inject(UserSessionsStore)
  private readonly users = inject(UserStore)
  private readonly dialogs = inject(HlmDialogService)
  private readonly toast = inject(HotToastService)
  private readonly destroyRef = inject(DestroyRef)
  readonly retry = output<void>()
  readonly filter = signal("all")
  readonly rows = computed(() =>
    this.users.users().map(user => ({
      user,
      sessions: this.sessions.activeSessions().filter(session => session.userId === user.id)
    }))
  )
  readonly search = signal("")
  readonly pageSize = 5
  readonly visibleRows = computed(() => {
    const query = this.search().trim().toLocaleLowerCase("es")
    return this.rows().filter(
      row =>
        (!query ||
          row.user.name.toLocaleLowerCase("es").includes(query) ||
          `usr-${row.user.id}`.includes(query)) &&
        (this.filter() === "all" ||
          (this.filter() === "with" ? row.sessions.length > 0 : row.sessions.length === 0))
    )
  })
  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.visibleRows().length / this.pageSize))
  )
  readonly currentPage = linkedSignal({
    source: () => ({ search: this.search(), filter: this.filter(), count: this.pageCount() }),
    computation: (source, previous): number =>
      !previous ||
      source.search !== previous.source.search ||
      source.filter !== previous.source.filter
        ? 1
        : Math.min(previous.value, source.count)
  })
  readonly pagedRows = computed(() =>
    this.visibleRows().slice(
      (this.currentPage() - 1) * this.pageSize,
      this.currentPage() * this.pageSize
    )
  )
  readonly rangeStart = computed(() =>
    this.visibleRows().length ? (this.currentPage() - 1) * this.pageSize + 1 : 0
  )
  readonly rangeEnd = computed(() =>
    Math.min(this.currentPage() * this.pageSize, this.visibleRows().length)
  )

  goToPage(page: number): void {
    if (Number.isSafeInteger(page))
      this.currentPage.set(Math.max(1, Math.min(page, this.pageCount())))
  }

  clearFilters(): void {
    this.search.set("")
    this.filter.set("all")
    this.currentPage.set(1)
  }

  revoke(user: User, session: UserSession): void {
    if (this.destroyRef.destroyed || session.isCurrent) return
    this.dialogs.open<void, RevokeSessionContext>(RevokeSessionDialog, {
      context: {
        user,
        session,
        onRevoked: () => {
          if (!this.destroyRef.destroyed) this.toast.success(`Sesión de ${user.name} cerrada`)
        }
      },
      showCloseButton: false,
      disableClose: true,
      contentClass: "sm:max-w-lg"
    })
  }
}
