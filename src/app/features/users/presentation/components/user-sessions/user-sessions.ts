import { DatePipe } from "@angular/common"
import { Component, computed, DestroyRef, inject, output, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { form, FormField, FormRoot, validate } from "@angular/forms/signals"
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
import { UserSessionQuery } from "../../../domain/models/user-session-query"
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
  readonly model = signal({ userId: "" })
  readonly filters = form(this.model, path => {
    validate(path.userId, ({ value }) => {
      const v = value()
      return v === "" || (/^-?\d+$/.test(v) && Number(v) >= -2147483648 && Number(v) <= 2147483647)
        ? undefined
        : { kind: "id", message: "Introduce un ID de usuario válido." }
    })
  })
  readonly currentPage = computed(() => this.sessions.page() + 1)
  readonly pageCount = computed(() => Math.max(1, this.sessions.totalPages()))
  readonly rangeStart = computed(() =>
    this.sessions.sessions().length ? this.sessions.page() * this.sessions.size() + 1 : 0
  )
  readonly rangeEnd = computed(() =>
    this.sessions.sessions().length ? this.rangeStart() + this.sessions.sessions().length - 1 : 0
  )
  private readonly queries = new Subject<UserSessionQuery>()
  constructor() {
    this.queries
      .pipe(
        switchMap(q => this.sessions.loadSessions(q)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
  }
  applyFilters(): void {
    if (this.filters().invalid()) return
    this.queries.next({
      page: 0,
      size: 20,
      ...(this.model().userId === "" ? {} : { userId: Number(this.model().userId) })
    })
  }
  clearFilters(): void {
    this.model.set({ userId: "" })
    this.applyFilters()
  }
  goToPage(page: number): void {
    if (!Number.isSafeInteger(page) || page < 1 || page > this.pageCount()) return
    this.queries.next({ ...this.sessions.query(), page: page - 1 })
  }
  reload(): void {
    this.queries.next(this.sessions.query())
  }
  revoke(session: UserSession): void {
    if (this.destroyRef.destroyed || session.isCurrent || !session.userName) return
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
